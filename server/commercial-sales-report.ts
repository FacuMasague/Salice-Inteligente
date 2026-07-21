import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  CommercialSalesBrandRow,
  CommercialSalesBrandTotal,
  CommercialSalesFilterKey,
  CommercialSalesFilters,
  CommercialSalesMetrics,
  CommercialSalesMixRow,
  CommercialSalesMonthlyPoint,
  CommercialSalesProductRow,
  CommercialSalesReportMeta,
  CommercialSalesReportPayload,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { cutoffDate, daysInclusive, isoDate as iso, monthEnd, monthStart, shiftedMonth, utcDate } from './reporting-periods.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { metricShare, metricVariation, readMovementMetrics } from './report-metrics.js';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = () => resolveActiveDataPaths().commercial;

const UNIVERSE = EXECUTABLE_UNIVERSES.commercialSales;
const COMPANIES = [...UNIVERSE.companies];
const BRANCHES = [...UNIVERSE.branches];
const ALLOWED_ISSUERS = [...UNIVERSE.allowedIssuers];
const EXCLUDED_CLIENTS = [...UNIVERSE.excludedClients];
const FOOD_CATEGORIES = ['Wet Food', 'Dry Food', 'Treats'];
const BALANCEADO_GROUPS = ['Orbit Nutrition', 'Nova Pet', 'Harbor SPT', 'PawPeak'];
const DROVET_GROUPS: string[] = [];
const SANITARIOS_GROUPS = ['CleanNest', 'Harbor Retail'];

const FILTER_COLUMNS: Record<CommercialSalesFilterKey, string> = {
  seller: 'seller',
  category: 'category',
  brand: 'brand',
  productGroup: 'product_group',
};

type SqlValue = string | number;

let cachedMeta: CommercialSalesReportMeta | null = null;
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

function reportMetadata(database: DatabaseSync) {
  return new Map(rows<{ key: string; value: string }>(database.prepare('SELECT key, value FROM report_meta')).map((row) => [row.key, row.value]));
}

function baseUniverse() {
  return compileMovementUniverse(UNIVERSE);
}

export function getCommercialSalesReportPath() {
  return reportPath();
}

export function getCommercialSalesReportMeta(): CommercialSalesReportMeta {
  const database = db();
  if (cachedMeta) return cachedMeta;
  if (!database) {
    return {
      available: false,
      sourceSystem: 'Synthetic local demo dataset',
      rowCount: 0,
      coverageFrom: '',
      minDate: '',
      maxDate: '',
      latestMonth: '',
      latestYear: '',
      months: [],
      years: [],
      sourceDocumentCount: 0,
      unavailableDocumentCount: 0,
      options: { seller: [], category: [], brand: [], productGroup: [] },
      universe: { companies: COMPANIES, branches: BRANCHES, allowedIssuers: ALLOWED_ISSUERS, excludedClients: EXCLUDED_CLIENTS },
    };
  }

  const meta = reportMetadata(database);
  const universe = baseUniverse();
  const dateRow = database.prepare(`SELECT MIN(sale_date) AS minDate, MAX(sale_date) AS maxDate, COUNT(*) AS rowCount, COUNT(DISTINCT source_document_key) AS sourceDocumentCount FROM movements WHERE ${universe.sql}`).get(...universe.parameters) as {
    minDate: string | null;
    maxDate: string | null;
    rowCount: number;
    sourceDocumentCount: number;
  };
  const maxDate = dateRow.maxDate ?? '';
  const months = rows<{ month: string }>(database.prepare(`SELECT DISTINCT substr(sale_date, 1, 7) AS month FROM movements WHERE ${universe.sql} ORDER BY month DESC`), universe.parameters).map((row) => row.month);
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  const options = Object.fromEntries((Object.entries(FILTER_COLUMNS) as [CommercialSalesFilterKey, string][]).map(([key, column]) => [
    key,
    rows<{ value: string }>(database.prepare(`SELECT DISTINCT TRIM(${column}) AS value FROM movements WHERE ${universe.sql} AND TRIM(${column}) <> '' ORDER BY value COLLATE NOCASE`), universe.parameters).map((row) => row.value),
  ])) as Record<CommercialSalesFilterKey, string[]>;

  cachedMeta = {
    available: true,
    sourceSystem: meta.get('source_system') ?? 'Synthetic local demo dataset',
    rowCount: Number(dateRow.rowCount ?? 0),
    coverageFrom: meta.get('coverage_from') ?? dateRow.minDate ?? '',
    minDate: dateRow.minDate ?? '',
    maxDate,
    latestMonth: maxDate.slice(0, 7),
    latestYear: maxDate.slice(0, 4),
    months,
    years,
    sourceDocumentCount: Number(meta.get('source_document_count') ?? dateRow.sourceDocumentCount ?? 0),
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
    options,
    universe: { companies: COMPANIES, branches: BRANCHES, allowedIssuers: ALLOWED_ISSUERS, excludedClients: EXCLUDED_CLIENTS },
  };
  return cachedMeta;
}

function normalizeFilters(input: Partial<Record<string, unknown>>, latestMonth: string): CommercialSalesFilters {
  const filters = {
    periodMode: input.periodMode === 'year' ? 'year' : 'month',
    month: /^\d{4}-\d{2}$/.test(String(input.month ?? '')) ? String(input.month) : latestMonth,
    year: /^\d{4}$/.test(String(input.year ?? '')) ? String(input.year) : latestMonth.slice(0, 4),
    seller: '',
    category: '',
    brand: '',
    productGroup: '',
  } as CommercialSalesFilters;
  for (const key of Object.keys(FILTER_COLUMNS) as CommercialSalesFilterKey[]) filters[key] = String(input[key] ?? '').trim().slice(0, 4000);
  return filters;
}

function buildWhere(filters: CommercialSalesFilters, start?: string, end?: string, extraClause?: string) {
  const base = baseUniverse();
  const clauses = [base.sql];
  const parameters = [...base.parameters];
  if (start) { clauses.push('sale_date >= ?'); parameters.push(start); }
  if (end) { clauses.push('sale_date <= ?'); parameters.push(end); }
  for (const [key, column] of Object.entries(FILTER_COLUMNS) as [CommercialSalesFilterKey, string][]) {
    const selected = decodeMultiFilter(filters[key]);
    if (selected.length) { clauses.push(`${column} IN (${placeholders(selected)})`); parameters.push(...selected); }
  }
  if (extraClause) clauses.push(`(${extraClause})`);
  return { sql: clauses.join(' AND '), parameters };
}

function metric(database: DatabaseSync, where: ReturnType<typeof buildWhere>): CommercialSalesMetrics {
  return readMovementMetrics(database, where.sql, where.parameters);
}

function groupClause(groups: string[]) {
  return `UPPER(TRIM(product_group)) IN (${groups.map((group) => `'${group.toUpperCase().replaceAll("'", "''")}'`).join(', ')})`;
}

const smallRetailClause = "UPPER(TRIM(channel)) = 'SMALL RETAIL'";
const balanceadoClause = `NOT (${smallRetailClause}) AND (${groupClause(BALANCEADO_GROUPS)} OR TRIM(product_group) = '')`;
const drovetClause = `NOT (${smallRetailClause}) AND ${groupClause(DROVET_GROUPS)}`;
const sanitariosClause = `NOT (${smallRetailClause}) AND ${groupClause(SANITARIOS_GROUPS)}`;
const mixCase = `CASE
  WHEN ${smallRetailClause} THEN 'Autoservicio'
  WHEN ${groupClause(BALANCEADO_GROUPS)} THEN 'Balanceado'
  WHEN ${groupClause(DROVET_GROUPS)} THEN 'Drovet'
  WHEN ${groupClause(SANITARIOS_GROUPS)} THEN 'Sanitarios'
  ELSE 'Otros' END`;

function mix(database: DatabaseSync, filters: CommercialSalesFilters, start: string, end: string): CommercialSalesMixRow[] {
  const where = buildWhere(filters, start, end);
  const raw = rows<{ label: CommercialSalesMixRow['label']; netAmount: number; kilos: number; units: number; clients: number }>(database.prepare(`
    SELECT ${mixCase} AS label, COALESCE(SUM(net_amount), 0) AS netAmount,
           COALESCE(SUM(kilos), 0) AS kilos, COALESCE(SUM(units), 0) AS units,
           COUNT(DISTINCT client_id) AS clients
    FROM movements WHERE ${where.sql} GROUP BY label
  `), where.parameters);
  const byLabel = new Map(raw.map((row) => [row.label, row]));
  const total = raw.reduce((sum, row) => sum + Number(row.netAmount), 0);
  const order: CommercialSalesMixRow['label'][] = ['Balanceado', 'Autoservicio', 'Drovet', 'Sanitarios', 'Otros'];
  return order.map((label) => {
    const row = byLabel.get(label);
    const netAmount = Number(row?.netAmount ?? 0);
    return {
      label,
      netAmount,
      kilos: Number(row?.kilos ?? 0),
      units: Number(row?.units ?? 0),
      clients: Number(row?.clients ?? 0),
      share: metricShare(netAmount, total),
    };
  });
}

function brandBreakdown(database: DatabaseSync, filters: CommercialSalesFilters, start: string, end: string, elapsedDays: number): { rows: CommercialSalesBrandRow[]; total: CommercialSalesBrandTotal } {
  const foodClause = `category IN (${FOOD_CATEGORIES.map((category) => `'${category.replaceAll("'", "''")}'`).join(', ')})`;
  const where = buildWhere(filters, start, end, foodClause);
  const brands = rows<{ brand: string; netAmount: number; kilos: number; units: number; clients: number; averagePricePerKilo: number | null }>(database.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Unbranded' ELSE brand END AS brand,
           COALESCE(SUM(net_amount), 0) AS netAmount, COALESCE(SUM(kilos), 0) AS kilos,
           COALESCE(SUM(units), 0) AS units, COUNT(DISTINCT client_id) AS clients,
           AVG(CASE WHEN kilos <> 0 THEN net_amount / kilos END) AS averagePricePerKilo
    FROM movements WHERE ${where.sql} GROUP BY brand ORDER BY netAmount DESC
  `), where.parameters);
  const products = rows<{ brand: string; productId: string; product: string; netAmount: number; kilos: number; units: number; clients: number; averagePricePerKilo: number | null }>(database.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Unbranded' ELSE brand END AS brand,
           product_id AS productId, product_name AS product,
           COALESCE(SUM(net_amount), 0) AS netAmount, COALESCE(SUM(kilos), 0) AS kilos,
           COALESCE(SUM(units), 0) AS units, COUNT(DISTINCT client_id) AS clients,
           AVG(CASE WHEN kilos <> 0 THEN net_amount / kilos END) AS averagePricePerKilo
    FROM movements WHERE ${where.sql} GROUP BY brand, product_id, product_name ORDER BY brand, netAmount DESC
  `), where.parameters);
  const productMap = new Map<string, CommercialSalesProductRow[]>();
  for (const row of products) {
    const list = productMap.get(row.brand) ?? [];
    list.push({
      productId: row.productId,
      product: row.product,
      netAmount: Number(row.netAmount),
      kilos: Number(row.kilos),
      units: Number(row.units),
      clients: Number(row.clients),
      averagePricePerKilo: row.averagePricePerKilo == null ? null : Number(row.averagePricePerKilo),
    });
    productMap.set(row.brand, list);
  }
  const totalRow = database.prepare(`
    SELECT COALESCE(SUM(net_amount), 0) AS netAmount, COALESCE(SUM(kilos), 0) AS kilos,
           COALESCE(SUM(units), 0) AS units, COUNT(DISTINCT client_id) AS clients,
           AVG(CASE WHEN kilos <> 0 THEN net_amount / kilos END) AS averagePricePerKilo
    FROM movements WHERE ${where.sql}
  `).get(...where.parameters) as unknown as {
    netAmount: number | null; kilos: number | null; units: number | null; clients: number | null; averagePricePerKilo: number | null;
  };
  const totalSales = Number(totalRow.netAmount ?? 0);
  const totalKilos = Number(totalRow.kilos ?? 0);
  const mappedRows = brands.map((row) => ({
    brand: row.brand,
    netAmount: Number(row.netAmount),
    kilos: Number(row.kilos),
    units: Number(row.units),
    clients: Number(row.clients),
    averagePricePerKilo: row.averagePricePerKilo == null ? null : Number(row.averagePricePerKilo),
    kiloShare: totalKilos ? Number(row.kilos) / totalKilos * 100 : 0,
    salesShare: totalSales ? Number(row.netAmount) / totalSales * 100 : 0,
    averageDailySales: elapsedDays ? Number(row.netAmount) / elapsedDays : 0,
    products: productMap.get(row.brand) ?? [],
  }));
  return {
    rows: mappedRows,
    total: {
      netAmount: totalSales,
      kilos: totalKilos,
      units: Number(totalRow.units ?? 0),
      clients: Number(totalRow.clients ?? 0),
      averagePricePerKilo: totalRow.averagePricePerKilo == null ? null : Number(totalRow.averagePricePerKilo),
      averageDailySales: elapsedDays ? totalSales / elapsedDays : 0,
    },
  };
}

export function buildCommercialSalesReport(input: Partial<Record<string, unknown>>): CommercialSalesReportPayload | null {
  const database = db();
  const meta = getCommercialSalesReportMeta();
  if (!database || !meta.available) return null;
  const filters = normalizeFilters(input, meta.latestMonth);
  for (const key of Object.keys(FILTER_COLUMNS) as CommercialSalesFilterKey[]) filters[key] = normalizeMultiFilter(filters[key], meta.options[key]);
  if (!meta.months.includes(filters.month)) filters.month = meta.latestMonth;
  if (!meta.years.includes(filters.year)) filters.year = meta.latestYear;

  const [yearText, monthText] = filters.month.split('-');
  const anchorYear = filters.periodMode === 'year' ? Number(filters.year) : Number(yearText);
  const anchorMonth = filters.periodMode === 'year' ? 0 : Number(monthText) - 1;
  const latestDate = new Date(`${meta.maxDate}T12:00:00Z`);
  const cutoffDay = filters.periodMode === 'month'
    ? filters.month === meta.latestMonth ? latestDate.getUTCDate() : monthEnd(anchorYear, anchorMonth).getUTCDate()
    : filters.year === meta.latestYear ? latestDate.getUTCDate() : 31;
  const currentStart = filters.periodMode === 'year' ? `${anchorYear}-01-01` : iso(monthStart(anchorYear, anchorMonth));
  const currentEnd = filters.periodMode === 'year'
    ? filters.year === meta.latestYear ? meta.maxDate : `${anchorYear}-12-31`
    : iso(cutoffDate(anchorYear, anchorMonth, cutoffDay));
  const previous = shiftedMonth(anchorYear, anchorMonth, -1);
  const previousStart = filters.periodMode === 'year' ? `${anchorYear - 1}-01-01` : iso(monthStart(previous.year, previous.month));
  const previousEnd = filters.periodMode === 'year'
    ? filters.year === meta.latestYear ? `${anchorYear - 1}${meta.maxDate.slice(4)}` : `${anchorYear - 1}-12-31`
    : iso(cutoffDate(previous.year, previous.month, cutoffDay));
  const elapsedDays = daysInclusive(currentStart, currentEnd);

  const current = metric(database, buildWhere(filters, currentStart, currentEnd));
  const comparison = metric(database, buildWhere(filters, previousStart, previousEnd));
  const segments = {
    balanceado: metric(database, buildWhere(filters, currentStart, currentEnd, balanceadoClause)),
    drovet: metric(database, buildWhere(filters, currentStart, currentEnd, drovetClause)),
    sanitarios: metric(database, buildWhere(filters, currentStart, currentEnd, sanitariosClause)),
    autoservicio: metric(database, buildWhere(filters, currentStart, currentEnd, smallRetailClause)),
  };
  const brandData = brandBreakdown(database, filters, currentStart, currentEnd, elapsedDays);

  const trendLength = filters.periodMode === 'year'
    ? (filters.year === meta.latestYear ? latestDate.getUTCMonth() + 1 : 12)
    : 7;
  const monthly: CommercialSalesMonthlyPoint[] = Array.from({ length: trendLength }, (_, index) => {
    const value = filters.periodMode === 'year'
      ? { year: anchorYear, month: index }
      : shiftedMonth(anchorYear, anchorMonth, index - 6);
    const isAnchorMonth = value.year === anchorYear && value.month === (filters.periodMode === 'year' ? latestDate.getUTCMonth() : anchorMonth);
    const rowCutoff = filters.periodMode === 'year'
      ? filters.year === meta.latestYear && isAnchorMonth ? latestDate.getUTCDate() : monthEnd(value.year, value.month).getUTCDate()
      : isAnchorMonth ? cutoffDay : monthEnd(value.year, value.month).getUTCDate();
    const start = iso(monthStart(value.year, value.month));
    const end = iso(cutoffDate(value.year, value.month, rowCutoff));
    const previousYearStart = iso(monthStart(value.year - 1, value.month));
    const previousYearEnd = iso(cutoffDate(value.year - 1, value.month, rowCutoff));
    return {
      month: `${value.year}-${String(value.month + 1).padStart(2, '0')}`,
      current: metric(database, buildWhere(filters, start, end)).netAmount,
      previousYear: metric(database, buildWhere(filters, previousYearStart, previousYearEnd)).netAmount,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.maxDate,
    periodMode: filters.periodMode,
    selectedPeriod: filters.periodMode === 'year' ? filters.year : filters.month,
    selectedMonth: filters.month,
    cutoffDay,
    periodStart: currentStart,
    periodEnd: currentEnd,
    comparisonStart: previousStart,
    comparisonEnd: previousEnd,
    elapsedDays,
    comparisonAvailable: meta.coverageFrom <= previousStart,
    filters,
    current,
    comparison,
    difference: current.netAmount - comparison.netAmount,
    variation: metricVariation(current.netAmount, comparison.netAmount),
    segments,
    mix: mix(database, filters, currentStart, currentEnd),
    monthly,
    brandTotal: brandData.total,
    brands: brandData.rows,
  };
}
