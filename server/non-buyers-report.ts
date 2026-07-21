import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  NonBuyerEntityRow,
  NonBuyerFilterKey,
  NonBuyerFilters,
  NonBuyerReportMeta,
  NonBuyerReportPayload,
  NonBuyerSellerRow,
  NonBuyerSummary,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { previousThreeFullMonths as averageWindow, shiftDays } from './reporting-periods.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = process.env.SALICE_SPT_DB_PATH
  ? resolve(process.env.SALICE_SPT_DB_PATH)
  : resolve(process.cwd(), 'data/spt-gesi.sqlite');

const COMPANIES = [3];
const BRANCHES = [3];
const ALLOWED_ISSUERS = ['Salice Distribuciones S.A.'];
const CLIENT_STATUSES = ['Activo'];
const EXCLUDED_CLIENTS = ['Consumidor Final', '', '*** ANULADO ***'];
const EXCLUDED_PRODUCT_GROUPS = ['Drovet', 'Kualcos'];
const EXCLUDED_CATEGORIES = ['POP', 'Promociones'];
const EXCLUDED_SELLERS = ['Administración', 'Carolina', ''];
const EXCLUDED_BRANDS = ['Cancat', 'Lokal', 'Mi QR', 'Kualcos', '', 'Pampa Criadores', 'De La Huerta'];

const FILTER_COLUMNS: Record<NonBuyerFilterKey, string> = {
  productGroup: 'product_group',
  category: 'category',
  brand: 'brand',
  seller: 'branch_seller',
};

type SqlValue = string | number;
type RawEntityRow = {
  id: string;
  clientId: number | null;
  name: string;
  seller: string;
  lastPurchaseDate: string | null;
  averageKilos3Months: number | null;
  averageSales3Months: number | null;
  net180: number | null;
  net90: number | null;
  net30: number | null;
};

let cachedMeta: NonBuyerReportMeta | null = null;
const reportDatabase = new ReloadableReadonlyDatabase(reportPath);

function db() {
  const current = reportDatabase.get();
  if (current?.changed) cachedMeta = null;
  return current?.database ?? null;
}

function rows<T>(statement: StatementSync, parameters: SqlValue[] = []) {
  return statement.all(...parameters) as T[];
}

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function metadata(value: DatabaseSync) {
  return new Map(rows<{ key: string; value: string }>(value.prepare('SELECT key, value FROM report_meta')).map((row) => [row.key, row.value]));
}

function baseUniverse(brandView = false) {
  const clauses = [
    `company_id IN (${placeholders(COMPANIES)})`,
    `branch_id IN (${placeholders(BRANCHES)})`,
    `TRIM(issuer_name) IN (${placeholders(ALLOWED_ISSUERS)})`,
    `TRIM(client_status) IN (${placeholders(CLIENT_STATUSES)})`,
    `TRIM(client_name) NOT IN (${placeholders(EXCLUDED_CLIENTS)})`,
    `TRIM(product_group) NOT IN (${placeholders(EXCLUDED_PRODUCT_GROUPS)})`,
    `TRIM(category) NOT IN (${placeholders(EXCLUDED_CATEGORIES)})`,
    `TRIM(branch_seller) NOT IN (${placeholders(EXCLUDED_SELLERS)})`,
  ];
  const parameters: SqlValue[] = [
    ...COMPANIES,
    ...BRANCHES,
    ...ALLOWED_ISSUERS,
    ...CLIENT_STATUSES,
    ...EXCLUDED_CLIENTS,
    ...EXCLUDED_PRODUCT_GROUPS,
    ...EXCLUDED_CATEGORIES,
    ...EXCLUDED_SELLERS,
  ];
  if (brandView) {
    clauses.push(`TRIM(brand) NOT IN (${placeholders(EXCLUDED_BRANDS)})`);
    parameters.push(...EXCLUDED_BRANDS);
  }
  return { sql: clauses.join(' AND '), parameters };
}

function buildWhere(filters: NonBuyerFilters, brandView = false) {
  const base = baseUniverse(brandView);
  const clauses = [base.sql];
  const parameters = [...base.parameters];
  for (const [key, column] of Object.entries(FILTER_COLUMNS) as [NonBuyerFilterKey, string][]) {
    const selected = decodeMultiFilter(filters[key]);
    if (!selected.length) continue;
    clauses.push(`TRIM(${column}) IN (${placeholders(selected)})`);
    parameters.push(...selected);
  }
  return { sql: clauses.join(' AND '), parameters };
}

function dayDifference(from: string | null, through: string) {
  if (!from) return null;
  return Math.round((new Date(`${through}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

function normalizeFilters(input: Partial<Record<string, unknown>>, meta: NonBuyerReportMeta): NonBuyerFilters {
  const filters: NonBuyerFilters = { productGroup: '', category: '', brand: '', seller: '' };
  for (const key of Object.keys(FILTER_COLUMNS) as NonBuyerFilterKey[]) {
    filters[key] = normalizeMultiFilter(input[key], meta.options[key]);
  }
  return filters;
}

function entityRows(
  value: DatabaseSync,
  filters: NonBuyerFilters,
  kind: 'account' | 'brand',
  windows: NonBuyerReportPayload['windows'],
): NonBuyerEntityRow[] {
  const brandView = kind === 'brand';
  const where = buildWhere(filters, brandView);
  const entity = brandView ? 'TRIM(brand)' : 'CAST(client_id AS TEXT)';
  const extra = brandView ? `AND TRIM(brand) <> ''` : '';
  const details = brandView
    ? `stats.entity_id AS id, NULL AS clientId, stats.entity_id AS name, '' AS seller`
    : `stats.entity_id AS id, CAST(stats.entity_id AS INTEGER) AS clientId,
       COALESCE(latest.client_name, 'Cliente sin nombre') AS name,
       COALESCE(NULLIF(TRIM(latest.branch_seller), ''), 'Sin vendedor') AS seller`;
  const latestCte = brandView ? '' : `, ranked AS (
      SELECT client_id, client_name, branch_seller,
             ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY sale_date DESC, source_entered_at DESC) AS position
      FROM filtered
    ), latest AS (
      SELECT client_id, client_name, branch_seller FROM ranked WHERE position = 1
    )`;
  const latestJoin = brandView ? '' : `JOIN latest ON CAST(latest.client_id AS TEXT) = stats.entity_id`;
  const statement = value.prepare(`
    WITH filtered AS (
      SELECT sale_date, client_id, client_name, branch_seller, brand, kilos, net_amount, source_entered_at
      FROM movements WHERE ${where.sql} ${extra}
    ), daily AS (
      SELECT ${entity} AS entity_id, sale_date,
             COALESCE(SUM(net_amount), 0) AS daily_net,
             COALESCE(SUM(kilos), 0) AS daily_kilos
      FROM filtered GROUP BY entity_id, sale_date
    ) ${latestCte}, stats AS (
      SELECT entity_id,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_net ELSE 0 END), 0) AS net180,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_net ELSE 0 END), 0) AS net90,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_net ELSE 0 END), 0) AS net30,
        MAX(CASE WHEN daily_net > 0 THEN sale_date END) AS lastPurchaseDate,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_kilos ELSE 0 END), 0) / 3.0 AS averageKilos3Months,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_net ELSE 0 END), 0) / 3.0 AS averageSales3Months
      FROM daily GROUP BY entity_id
    )
    SELECT ${details}, stats.lastPurchaseDate, stats.averageKilos3Months, stats.averageSales3Months,
           stats.net180, stats.net90, stats.net30
    FROM stats ${latestJoin} WHERE stats.net180 > 0
    ORDER BY stats.averageSales3Months DESC, name COLLATE NOCASE
  `);
  const parameters: SqlValue[] = [
    ...where.parameters,
    windows.from180, windows.through,
    windows.from90, windows.through,
    windows.from30, windows.through,
    windows.averageFrom, windows.averageThrough,
    windows.averageFrom, windows.averageThrough,
  ];
  return rows<RawEntityRow>(statement, parameters).map((row) => ({
    id: String(row.id),
    clientId: row.clientId == null ? null : Number(row.clientId),
    name: row.name,
    seller: row.seller,
    lastPurchaseDate: row.lastPurchaseDate,
    daysSinceLastPurchase: dayDifference(row.lastPurchaseDate, windows.through),
    averageKilos3Months: Number(row.averageKilos3Months ?? 0),
    averageSales3Months: Number(row.averageSales3Months ?? 0),
    net180: Number(row.net180 ?? 0),
    net90: Number(row.net90 ?? 0),
    net30: Number(row.net30 ?? 0),
    isNonBuyer30: Number(row.net180 ?? 0) > 0 && Number(row.net30 ?? 0) <= 0,
  }));
}

function summary(items: NonBuyerEntityRow[]): NonBuyerSummary {
  const universe90 = items.filter((item) => item.net90 > 0).length;
  const nonBuyers30 = items.filter((item) => item.isNonBuyer30).length;
  return {
    universe90,
    buyers30: items.filter((item) => item.net30 > 0).length,
    nonBuyers30,
    rate: universe90 ? nonBuyers30 / universe90 * 100 : null,
    universe180: items.length,
  };
}

function sellerRowsFromEntities(items: NonBuyerEntityRow[]): NonBuyerSellerRow[] {
  const grouped = new Map<string, { universe90: number; nonBuyers30: number }>();
  for (const item of items) {
    const current = grouped.get(item.seller) ?? { universe90: 0, nonBuyers30: 0 };
    if (item.net90 > 0) current.universe90 += 1;
    if (item.isNonBuyer30) current.nonBuyers30 += 1;
    grouped.set(item.seller, current);
  }
  return [...grouped.entries()].map(([seller, counts]) => ({
    seller,
    ...counts,
    rate: counts.universe90 ? counts.nonBuyers30 / counts.universe90 * 100 : null,
  })).filter((row) => row.universe90 > 0 || row.nonBuyers30 > 0)
    .sort((a, b) => b.nonBuyers30 - a.nonBuyers30 || a.seller.localeCompare(b.seller, 'es'));
}

function sellerRows(
  value: DatabaseSync,
  filters: NonBuyerFilters,
  kind: 'account' | 'brand',
  windows: NonBuyerReportPayload['windows'],
): NonBuyerSellerRow[] {
  const brandView = kind === 'brand';
  const where = buildWhere(filters, brandView);
  const entity = brandView ? 'TRIM(brand)' : 'CAST(client_id AS TEXT)';
  const extra = brandView ? `AND TRIM(brand) <> ''` : '';
  const statement = value.prepare(`
    WITH filtered AS (
      SELECT sale_date, branch_seller, client_id, brand, net_amount
      FROM movements WHERE ${where.sql} ${extra}
    ), daily AS (
      SELECT TRIM(branch_seller) AS seller, ${entity} AS entity_id, sale_date,
             COALESCE(SUM(net_amount), 0) AS daily_net
      FROM filtered GROUP BY seller, entity_id, sale_date
    ), stats AS (
      SELECT seller, entity_id,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_net ELSE 0 END), 0) AS net180,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_net ELSE 0 END), 0) AS net90,
        COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN daily_net ELSE 0 END), 0) AS net30
      FROM daily GROUP BY seller, entity_id
    )
    SELECT seller,
      SUM(CASE WHEN net90 > 0 THEN 1 ELSE 0 END) AS universe90,
      SUM(CASE WHEN net180 > 0 AND net30 <= 0 THEN 1 ELSE 0 END) AS nonBuyers30
    FROM stats GROUP BY seller HAVING universe90 > 0 OR nonBuyers30 > 0
    ORDER BY nonBuyers30 DESC, seller COLLATE NOCASE
  `);
  const parameters: SqlValue[] = [
    ...where.parameters,
    windows.from180, windows.through,
    windows.from90, windows.through,
    windows.from30, windows.through,
  ];
  return rows<{ seller: string; universe90: number; nonBuyers30: number }>(statement, parameters).map((row) => ({
    seller: row.seller || 'Sin vendedor',
    universe90: Number(row.universe90),
    nonBuyers30: Number(row.nonBuyers30),
    rate: Number(row.universe90) ? Number(row.nonBuyers30) / Number(row.universe90) * 100 : null,
  }));
}

export function getNonBuyerReportPath() {
  return reportPath;
}

export function getNonBuyerReportMeta(): NonBuyerReportMeta {
  if (cachedMeta) return cachedMeta;
  const value = db();
  const unavailable: NonBuyerReportMeta = {
    available: false,
    sourceSystem: 'GESI API · facturas, notas de crédito y maestros Salice',
    rowCount: 0,
    coverageFrom: '',
    minDate: '',
    maxDate: '',
    capturedAt: '',
    sourceDocumentCount: 0,
    unavailableDocumentCount: 0,
    options: { productGroup: [], category: [], brand: [], seller: [] },
    agreementsAvailable: false,
    agreementsNote: 'La API de GESI no expone el maestro AcuerdosComerciales utilizado por la vista SQL del Power BI.',
    universe: {
      companies: COMPANIES,
      branches: BRANCHES,
      allowedIssuers: ALLOWED_ISSUERS,
      clientStatuses: CLIENT_STATUSES,
      excludedClients: EXCLUDED_CLIENTS,
      excludedProductGroups: EXCLUDED_PRODUCT_GROUPS,
      excludedCategories: EXCLUDED_CATEGORIES,
      excludedSellers: EXCLUDED_SELLERS,
      excludedBrands: EXCLUDED_BRANDS,
    },
  };
  if (!value) return unavailable;
  const base = baseUniverse();
  const profile = value.prepare(`
    SELECT MIN(sale_date) AS minDate, MAX(sale_date) AS maxDate, COUNT(*) AS rowCount,
           COUNT(DISTINCT source_document_key) AS sourceDocumentCount
    FROM movements WHERE ${base.sql}
  `).get(...base.parameters) as { minDate: string | null; maxDate: string | null; rowCount: number; sourceDocumentCount: number };
  const minDate = profile.minDate ?? '';
  const maxDate = profile.maxDate ?? '';
  if (!minDate || !maxDate) return unavailable;
  const optionQuery = (column: string, brandView = false) => {
    const optionBase = baseUniverse(brandView);
    return rows<{ value: string }>(value.prepare(`
      SELECT DISTINCT TRIM(${column}) AS value FROM movements
      WHERE ${optionBase.sql} AND TRIM(${column}) <> '' ORDER BY value COLLATE NOCASE
    `), optionBase.parameters).map((row) => row.value);
  };
  const meta = metadata(value);
  cachedMeta = {
    ...unavailable,
    available: true,
    sourceSystem: meta.get('source_system') ?? unavailable.sourceSystem,
    rowCount: Number(profile.rowCount ?? 0),
    coverageFrom: meta.get('coverage_from') ?? minDate,
    minDate,
    maxDate,
    capturedAt: meta.get('captured_at') ?? '',
    sourceDocumentCount: Number(meta.get('source_document_count') ?? profile.sourceDocumentCount ?? 0),
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
    options: {
      productGroup: optionQuery('product_group'),
      category: optionQuery('category'),
      brand: optionQuery('brand', true),
      seller: optionQuery('branch_seller'),
    },
  };
  return cachedMeta;
}

export function buildNonBuyerReport(input: Partial<Record<string, unknown>>): NonBuyerReportPayload | null {
  const value = db();
  const meta = getNonBuyerReportMeta();
  if (!value || !meta.available) return null;
  const filters = normalizeFilters(input, meta);
  const average = averageWindow(meta.maxDate);
  const windows: NonBuyerReportPayload['windows'] = {
    from180: shiftDays(meta.maxDate, -180),
    from90: shiftDays(meta.maxDate, -90),
    from30: shiftDays(meta.maxDate, -30),
    through: meta.maxDate,
    averageFrom: average.from,
    averageThrough: average.through,
  };
  const accounts = entityRows(value, filters, 'account', windows);
  const brands = entityRows(value, filters, 'brand', windows);
  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.maxDate,
    filters,
    windows,
    accountsSummary: summary(accounts),
    brandsSummary: summary(brands),
    accounts,
    brands,
    accountSellers: sellerRowsFromEntities(accounts),
    brandSellers: sellerRows(value, filters, 'brand', windows),
  };
}
