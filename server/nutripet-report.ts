import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  NutriPetBrandRow,
  NutriPetFilterKey,
  NutriPetFilters,
  NutriPetMetrics,
  NutriPetMonthlyPoint,
  NutriPetProductRow,
  NutriPetQuarterPoint,
  NutriPetReportMeta,
  NutriPetReportPayload,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { cutoffDate as dateAtCutoff, daysInclusive, isoDate as iso, monthEnd, monthKey, monthStart, shiftedMonth as shiftMonth, utcDate } from './reporting-periods.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = process.env.SALICE_SPT_DB_PATH
  ? resolve(process.env.SALICE_SPT_DB_PATH)
  : resolve(process.cwd(), 'data/spt-gesi.sqlite');

const COMPANIES = [3];
const BRANCHES = [3];
const ALLOWED_ISSUERS = ['Salice Distribuciones S.A.'];
const PRODUCT_GROUP = 'Nutri Pet';
const EXCLUDED_CATEGORIES = ['POP'];
const EXCLUDED_CLIENTS = ['Via Salice MDP S.A.'];
const SPECIALIZED_CHANNELS = [
  'COSTA-RUTA2', 'Especial', 'Distribuidor', 'Freelance', 'Especializado',
  'Especializado Z2', 'Partido de la Costa', 'Refugios', 'Reventa', 'Reventa2',
];
const MASS_CHANNELS = ['On Line', 'Tienda', 'Gastronomico', 'Masivo', 'Premium', 'Saludable', 'Small Retail'];

const channelExpression = `CASE
  WHEN channel IN (${sqlList(SPECIALIZED_CHANNELS)}) THEN 'Especializado'
  WHEN channel IN (${sqlList(MASS_CHANNELS)}) THEN 'Masivo'
  ELSE channel END`;

const FILTER_EXPRESSIONS: Record<NutriPetFilterKey, string> = {
  channelGroup: channelExpression,
  brand: 'brand',
  product: 'product_name',
  line: 'line',
  client: 'client_name',
  grouping: 'grouping_name',
  category: 'category',
};

type SqlValue = string | number;
type MetricRow = { kilos: number | null; clients: number | null; units: number | null; netAmount: number | null };

let cachedMeta: NutriPetReportMeta | null = null;
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

function sqlList(values: string[]) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
}

function metadata(value: DatabaseSync) {
  return new Map(rows<{ key: string; value: string }>(value.prepare('SELECT key, value FROM report_meta')).map((row) => [row.key, row.value]));
}

function baseUniverse() {
  return {
    sql: `company_id IN (${placeholders(COMPANIES)})
      AND branch_id IN (${placeholders(BRANCHES)})
      AND UPPER(TRIM(issuer_name)) IN (${placeholders(ALLOWED_ISSUERS)})
      AND UPPER(TRIM(product_group)) = ?
      AND UPPER(TRIM(category)) NOT IN (${placeholders(EXCLUDED_CATEGORIES)})
      AND UPPER(TRIM(client_name)) NOT IN (${placeholders(EXCLUDED_CLIENTS)})`,
    parameters: [
      ...COMPANIES,
      ...BRANCHES,
      ...ALLOWED_ISSUERS.map((value) => value.toUpperCase()),
      PRODUCT_GROUP.toUpperCase(),
      ...EXCLUDED_CATEGORIES.map((value) => value.toUpperCase()),
      ...EXCLUDED_CLIENTS.map((value) => value.toUpperCase()),
    ] as SqlValue[],
  };
}

function ratio(value: number, base: number) {
  return base ? value / base * 100 : null;
}

function buildWhere(filters: NutriPetFilters, start?: string, end?: string) {
  const base = baseUniverse();
  const clauses = [base.sql];
  const parameters = [...base.parameters];
  if (start) { clauses.push('sale_date >= ?'); parameters.push(start); }
  if (end) { clauses.push('sale_date <= ?'); parameters.push(end); }
  for (const [key, expression] of Object.entries(FILTER_EXPRESSIONS) as [NutriPetFilterKey, string][]) {
    const selected = decodeMultiFilter(filters[key]);
    if (!selected.length) continue;
    clauses.push(`(${expression}) IN (${placeholders(selected)})`);
    parameters.push(...selected);
  }
  return { sql: clauses.join(' AND '), parameters };
}

function metric(value: DatabaseSync, filters: NutriPetFilters, start: string, end: string): NutriPetMetrics {
  const where = buildWhere(filters, start, end);
  const row = value.prepare(`
    SELECT COALESCE(SUM(kilos), 0) AS kilos,
           COUNT(DISTINCT client_id) AS clients,
           COALESCE(SUM(units), 0) AS units,
           COALESCE(SUM(net_amount), 0) AS netAmount
    FROM movements WHERE ${where.sql}
  `).get(...where.parameters) as MetricRow;
  return {
    kilos: Number(row.kilos ?? 0),
    clients: Number(row.clients ?? 0),
    units: Number(row.units ?? 0),
    netAmount: Number(row.netAmount ?? 0),
  };
}

function normalizeFilters(input: Partial<Record<string, unknown>>, meta: NutriPetReportMeta): NutriPetFilters {
  const latestMonth = meta.latestMonth.slice(5, 7);
  const filters = {
    year: /^\d{4}$/.test(String(input.year ?? '')) ? String(input.year) : meta.latestYear,
    month: /^(0[1-9]|1[0-2])$/.test(String(input.month ?? '')) ? String(input.month) : latestMonth,
    channelGroup: String(input.channelGroup ?? 'Especializado').trim().slice(0, 120),
    brand: '', product: '', line: '', client: '', grouping: '', category: '',
  } as NutriPetFilters;
  for (const key of ['brand', 'product', 'line', 'client', 'grouping', 'category'] as NutriPetFilterKey[]) {
    filters[key] = String(input[key] ?? '').trim().slice(0, 4000);
  }
  return filters;
}

function monthlyPoint(value: DatabaseSync, filters: NutriPetFilters, year: number, month: number, meta: NutriPetReportMeta): NutriPetMonthlyPoint {
  const key = monthKey(year, month);
  const start = iso(monthStart(year, month));
  const naturalEnd = iso(monthEnd(year, month));
  const end = key === meta.latestMonth ? meta.maxDate : naturalEnd;
  const cutoffDay = Number(end.slice(8, 10));
  const previous = shiftMonth(year, month, -1);
  const previousStart = iso(monthStart(previous.year, previous.month));
  const previousEnd = iso(dateAtCutoff(previous.year, previous.month, cutoffDay));
  const previousYearStart = iso(monthStart(year - 1, month));
  const previousYearEnd = iso(dateAtCutoff(year - 1, month, cutoffDay));
  const current = metric(value, filters, start, end);
  const previousMonth = metric(value, filters, previousStart, previousEnd);
  const previousYear = metric(value, filters, previousYearStart, previousYearEnd);
  const ytd = metric(value, filters, `${year}-01-01`, end);
  const previousYtd = metric(value, filters, `${year - 1}-01-01`, previousYearEnd);
  const comparisonAvailable = meta.coverageFrom <= `${year - 1}-01-01`;
  return {
    ...current,
    month: key,
    isPartial: end < naturalEnd,
    comparisonAvailable,
    previousMonthKilos: previousMonth.kilos,
    previousYearKilos: previousYear.kilos,
    ytdKilos: ytd.kilos,
    previousYtdKilos: previousYtd.kilos,
    vsPreviousMonth: ratio(current.kilos, previousMonth.kilos),
    vsPreviousYear: comparisonAvailable ? ratio(current.kilos, previousYear.kilos) : null,
    ytdVsPreviousYear: comparisonAvailable ? ratio(ytd.kilos, previousYtd.kilos) : null,
  };
}

function brandRows(value: DatabaseSync, filters: NutriPetFilters, start: string, end: string, previousStart: string, previousEnd: string): NutriPetBrandRow[] {
  const currentWhere = buildWhere(filters, start, end);
  const previousWhere = buildWhere(filters, previousStart, previousEnd);
  const current = rows<{ brand: string; kilos: number; clients: number; units: number; netAmount: number }>(value.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Sin marca' ELSE brand END AS brand,
           COALESCE(SUM(kilos), 0) AS kilos, COUNT(DISTINCT client_id) AS clients,
           COALESCE(SUM(units), 0) AS units, COALESCE(SUM(net_amount), 0) AS netAmount
    FROM movements WHERE ${currentWhere.sql} GROUP BY brand
  `), currentWhere.parameters);
  const previous = rows<{ brand: string; kilos: number }>(value.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Sin marca' ELSE brand END AS brand,
           COALESCE(SUM(kilos), 0) AS kilos
    FROM movements WHERE ${previousWhere.sql} GROUP BY brand
  `), previousWhere.parameters);
  const previousMap = new Map(previous.map((row) => [row.brand, Number(row.kilos)]));
  const total = current.reduce((sum, row) => sum + Number(row.kilos), 0);
  return current.map((row) => {
    const kilos = Number(row.kilos);
    const previousYearKilos = previousMap.get(row.brand) ?? 0;
    return {
      brand: row.brand,
      kilos,
      clients: Number(row.clients),
      units: Number(row.units),
      netAmount: Number(row.netAmount),
      share: total ? kilos / total * 100 : 0,
      previousYearKilos,
      variation: previousYearKilos ? (kilos - previousYearKilos) / previousYearKilos * 100 : null,
    };
  }).filter((row) => Math.abs(row.kilos) > 0.0001).sort((a, b) => b.kilos - a.kilos);
}

function productRows(value: DatabaseSync, filters: NutriPetFilters, start: string, end: string): NutriPetProductRow[] {
  const where = buildWhere(filters, start, end);
  const current = rows<{ productId: string; product: string; brand: string; kilos: number; clients: number; units: number; netAmount: number }>(value.prepare(`
    SELECT product_id AS productId, product_name AS product,
           CASE WHEN TRIM(brand) = '' THEN 'Sin marca' ELSE brand END AS brand,
           COALESCE(SUM(kilos), 0) AS kilos, COUNT(DISTINCT client_id) AS clients,
           COALESCE(SUM(units), 0) AS units, COALESCE(SUM(net_amount), 0) AS netAmount
    FROM movements WHERE ${where.sql}
    GROUP BY product_id, product_name, brand ORDER BY kilos DESC
  `), where.parameters);
  const total = current.reduce((sum, row) => sum + Number(row.kilos), 0);
  return current.map((row) => ({
    productId: row.productId,
    product: row.product,
    brand: row.brand,
    kilos: Number(row.kilos),
    clients: Number(row.clients),
    units: Number(row.units),
    netAmount: Number(row.netAmount),
    share: total ? Number(row.kilos) / total * 100 : 0,
  })).filter((row) => Math.abs(row.kilos) > 0.0001);
}

export function getNutriPetReportPath() {
  return reportPath;
}

export function getNutriPetReportMeta(): NutriPetReportMeta {
  if (cachedMeta) return cachedMeta;
  const value = db();
  const unavailable: NutriPetReportMeta = {
    available: false,
    sourceSystem: 'GESI API · facturas, notas de crédito y maestros Salice',
    rowCount: 0, coverageFrom: '', minDate: '', maxDate: '', capturedAt: '', latestYear: '', latestMonth: '',
    years: [], monthsByYear: {}, sourceDocumentCount: 0, unavailableDocumentCount: 0,
    options: { channelGroup: [], brand: [], product: [], line: [], client: [], grouping: [], category: [] },
    universe: { companies: COMPANIES, branches: BRANCHES, allowedIssuers: ALLOWED_ISSUERS, productGroup: PRODUCT_GROUP, excludedCategories: EXCLUDED_CATEGORIES, excludedClients: EXCLUDED_CLIENTS },
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
  const monthValues = rows<{ month: string }>(value.prepare(`
    SELECT DISTINCT substr(sale_date, 1, 7) AS month FROM movements
    WHERE ${base.sql} ORDER BY month DESC
  `), base.parameters).map((row) => row.month);
  const allYears = [...new Set(monthValues.map((month) => month.slice(0, 4)))];
  const years = allYears.filter((year) => year === maxDate.slice(0, 4) || monthValues.includes(`${year}-01`));
  const monthsByYear = Object.fromEntries(years.map((year) => [year, monthValues.filter((month) => month.startsWith(`${year}-`)).map((month) => month.slice(5, 7)).sort()]));
  const optionQuery = (expression: string) => rows<{ value: string }>(value.prepare(`
    SELECT DISTINCT TRIM(${expression}) AS value FROM movements
    WHERE ${base.sql} AND TRIM(${expression}) <> '' ORDER BY value COLLATE NOCASE
  `), base.parameters).map((row) => row.value);
  const meta = metadata(value);
  cachedMeta = {
    available: true,
    sourceSystem: meta.get('source_system') ?? unavailable.sourceSystem,
    rowCount: Number(profile.rowCount ?? 0),
    coverageFrom: meta.get('coverage_from') ?? minDate,
    minDate,
    maxDate,
    capturedAt: meta.get('captured_at') ?? '',
    latestYear: maxDate.slice(0, 4),
    latestMonth: maxDate.slice(0, 7),
    years,
    monthsByYear,
    sourceDocumentCount: Number(meta.get('source_document_count') ?? profile.sourceDocumentCount ?? 0),
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
    options: {
      channelGroup: optionQuery(channelExpression),
      brand: optionQuery('brand'),
      product: optionQuery('product_name'),
      line: optionQuery('line'),
      client: optionQuery('client_name'),
      grouping: optionQuery('grouping_name'),
      category: optionQuery('category'),
    },
    universe: unavailable.universe,
  };
  return cachedMeta;
}

export function buildNutriPetReport(input: Partial<Record<string, unknown>>): NutriPetReportPayload | null {
  const value = db();
  const meta = getNutriPetReportMeta();
  if (!value || !meta.available) return null;
  const filters = normalizeFilters(input, meta);
  if (!meta.years.includes(filters.year)) filters.year = meta.latestYear;
  const validMonths = meta.monthsByYear[filters.year] ?? [];
  if (!validMonths.includes(filters.month)) filters.month = filters.year === meta.latestYear ? meta.latestMonth.slice(5, 7) : validMonths.at(-1) ?? '12';
  for (const key of Object.keys(FILTER_EXPRESSIONS) as NutriPetFilterKey[]) {
    filters[key] = normalizeMultiFilter(filters[key], meta.options[key]);
  }

  const year = Number(filters.year);
  const month = Number(filters.month) - 1;
  const selectedMonth = monthKey(year, month);
  const periodStart = iso(monthStart(year, month));
  const naturalEnd = iso(monthEnd(year, month));
  const periodEnd = selectedMonth === meta.latestMonth ? meta.maxDate : naturalEnd;
  const isPartial = periodEnd < naturalEnd;
  const cutoffDay = Number(periodEnd.slice(8, 10));
  const previous = shiftMonth(year, month, -1);
  const previousStart = iso(monthStart(previous.year, previous.month));
  const previousEnd = iso(dateAtCutoff(previous.year, previous.month, cutoffDay));
  const previousYearStart = iso(monthStart(year - 1, month));
  const previousYearEnd = iso(dateAtCutoff(year - 1, month, cutoffDay));
  const ytdStart = `${year}-01-01`;
  const previousYtdStart = `${year - 1}-01-01`;

  const latestYear = Number(meta.latestYear);
  const latestMonth = Number(meta.latestMonth.slice(5, 7)) - 1;
  const monthly: NutriPetMonthlyPoint[] = Array.from({ length: 13 }, (_, index) => {
    const point = shiftMonth(latestYear, latestMonth, index - 12);
    return monthlyPoint(value, filters, point.year, point.month, meta);
  });
  const quarters: NutriPetQuarterPoint[] = Array.from({ length: 4 }, (_, index) => {
    const startMonth = index * 3;
    const start = iso(monthStart(year, startMonth));
    const naturalQuarterEnd = iso(monthEnd(year, startMonth + 2));
    const end = filters.year === meta.latestYear && meta.maxDate < naturalQuarterEnd ? meta.maxDate : naturalQuarterEnd;
    if (end < start) return null;
    return {
      ...metric(value, filters, start, end),
      quarter: `T-${index + 1}`,
      isPartial: end < naturalQuarterEnd,
    };
  }).filter((row): row is NutriPetQuarterPoint => row !== null && (row.kilos !== 0 || row.clients !== 0));

  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.maxDate,
    selectedMonth,
    periodStart,
    periodEnd,
    isPartial,
    elapsedDays: daysInclusive(periodStart, periodEnd),
    comparisonAvailable: meta.coverageFrom <= previousYearStart,
    filters,
    current: metric(value, filters, periodStart, periodEnd),
    previousMonth: metric(value, filters, previousStart, previousEnd),
    previousYear: metric(value, filters, previousYearStart, previousYearEnd),
    ytd: metric(value, filters, ytdStart, periodEnd),
    previousYtd: metric(value, filters, previousYtdStart, previousYearEnd),
    monthly,
    quarters,
    brands: brandRows(value, filters, periodStart, periodEnd, previousYearStart, previousYearEnd),
    products: productRows(value, filters, periodStart, periodEnd),
  };
}
