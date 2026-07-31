import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  SptBreakdownRow,
  SptDailyPoint,
  SptFilterKey,
  SptFilters,
  SptMonthlyPoint,
  SptPeriodMetrics,
  SptQuarterPoint,
  SptReportMeta,
  SptReportPage,
  SptReportPayload,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { CURRENT_COMMERCIAL_SELLERS, isCommercialSellerIncluded } from '../shared/commercial-seller-scope.js';
import { cutoffDate, isoDate as iso, monthEnd, monthStart, shiftedMonth, utcDate } from './reporting-periods.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { readMovementMetrics } from './report-metrics.js';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = () => process.env.SALICE_SPT_DB_PATH
  ? resolve(process.env.SALICE_SPT_DB_PATH)
  : resolveActiveDataPaths().commercial;

const DEFAULT_SELLERS = [...CURRENT_COMMERCIAL_SELLERS];
const DEFAULT_CHANNELS = ['COSTA-RUTA2', 'Especializado', 'Especializado Z2', 'Small Retail', 'Partido de la Costa'];
// Power BI compara estos textos sin distinguir mayúsculas. SQLite no lo hace en
// un IN normal, por eso usamos las variantes reales de la tabla para reproducir
// también las selecciones guardadas como ANDACOLLO y BEDYWOOD.
const DEFAULT_PRODUCT_GROUPS = ['Baires Masivo', 'Baires SPT', 'CanCat', 'Lokal', 'Nutri Pet', 'Patagonia Pet', 'Pet Nutrition', 'Sanicat', 'Sol Minerales', 'Andacollo', 'BedyWood'];
const SELLER_PAGE_CHANNELS = ['COSTA-RUTA2', 'Distribuidor', 'Especializado', 'Especializado Z2', 'Reventa', 'Reventa2', 'Small Retail', 'Partido de la Costa'];
const SELLER_PAGE_PRODUCT_GROUPS = ['Baires Masivo', 'Baires SPT', 'CanCat', 'Drovet', 'Lokal', 'Nutri Pet', 'Patagonia Pet', 'Pet Nutrition', 'Sanicat', 'Andacollo', 'BedyWood', 'Sol Minerales'];
const QUARTER_PAGE_CHANNELS = ['COSTA-RUTA2', 'Especializado', 'Especializado Z2', 'Partido de la Costa'];
const QUARTER_PAGE_PRODUCT_GROUPS = ['Baires Masivo', 'Baires SPT', 'Nutri Pet', 'Patagonia Pet', 'Pet Nutrition'];
const UNIVERSE = EXECUTABLE_UNIVERSES.spt;
const EXCLUDED_CATEGORIES = [...UNIVERSE.excludedCategories];
const COMPANIES = [...UNIVERSE.companies];
const BRANCHES = [...UNIVERSE.branches];

const FILTER_COLUMNS: Record<SptFilterKey, string> = {
  seller: 'seller',
  brand: 'brand',
  productGroup: 'product_group',
  channel: 'channel',
  product: 'product_name',
  client: 'client_name',
  line: 'line',
  category: 'category',
  subcategory: 'subcategory',
  clientType: 'client_type',
  grouping: 'grouping_name',
  locality: 'locality',
};

type SqlValue = string | number;

let cachedMeta: SptReportMeta | null = null;
const reportDatabase = new ReloadableReadonlyDatabase(reportPath);

function db() {
  const current = reportDatabase.get();
  if (current?.changed) cachedMeta = null;
  return current?.database ?? null;
}

function rows<T>(statement: StatementSync, parameters: SqlValue[] = []) {
  return statement.all(...parameters) as T[];
}

function metadata(database: DatabaseSync) {
  return new Map(rows<{ key: string; value: string }>(database.prepare('SELECT key, value FROM report_meta')).map((row) => [row.key, row.value]));
}

export function getSptReportPath() {
  return reportPath();
}

export function getSptReportMeta(): SptReportMeta {
  const database = db();
  if (cachedMeta) return cachedMeta;
  if (!database) {
    return {
      available: false,
      sourceFile: '',
      sourceSystem: 'GESI API · facturas, notas de crédito y maestros Salice',
      rowCount: 0,
      coverageFrom: '',
      sourceDocumentCount: 0,
      unavailableDocumentCount: 0,
      minDate: '',
      maxDate: '',
      latestMonth: '',
      months: [],
      options: Object.fromEntries(Object.keys(FILTER_COLUMNS).map((key) => [key, []])) as unknown as Record<SptFilterKey, string[]>,
      defaultUniverse: { companies: COMPANIES, branches: BRANCHES, sellers: DEFAULT_SELLERS, channels: DEFAULT_CHANNELS, productGroups: DEFAULT_PRODUCT_GROUPS, excludedCategories: EXCLUDED_CATEGORIES },
    };
  }
  const meta = metadata(database);
  const months = rows<{ month: string }>(database.prepare("SELECT DISTINCT substr(sale_date, 1, 7) AS month FROM movements ORDER BY month DESC")).map((row) => row.month);
  cachedMeta = {
    available: true,
    sourceFile: meta.get('source_file') ?? '',
    sourceSystem: meta.get('source_system') ?? 'GESI API · facturas, notas de crédito y maestros Salice',
    rowCount: Number(meta.get('row_count') ?? 0),
    coverageFrom: meta.get('coverage_from') ?? meta.get('min_date') ?? '',
    sourceDocumentCount: Number(meta.get('source_document_count') ?? 0),
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
    minDate: meta.get('min_date') ?? '',
    maxDate: meta.get('max_date') ?? '',
    latestMonth: (meta.get('max_date') ?? '').slice(0, 7),
    months,
    options: Object.fromEntries((Object.keys(FILTER_COLUMNS) as SptFilterKey[]).map((key) => [
      key,
      rows<{ value: string }>(database.prepare('SELECT value FROM filter_options WHERE filter_key = ? ORDER BY value COLLATE NOCASE'), [key])
        .map((row) => row.value)
        .filter((value) => key !== 'seller' || isCommercialSellerIncluded(value)),
    ])) as Record<SptFilterKey, string[]>,
    defaultUniverse: { companies: COMPANIES, branches: BRANCHES, sellers: DEFAULT_SELLERS, channels: DEFAULT_CHANNELS, productGroups: DEFAULT_PRODUCT_GROUPS, excludedCategories: EXCLUDED_CATEGORIES },
  };
  return cachedMeta;
}

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function buildWhere(filters: SptFilters, start?: string, end?: string, page: SptReportPage = 'main') {
  const excludedCategories = page === 'quarters' ? ['POP'] : EXCLUDED_CATEGORIES;
  const base = compileMovementUniverse({ ...UNIVERSE, excludedCategories });
  const clauses: string[] = [base.sql];
  const parameters: SqlValue[] = [...base.parameters];
  if (start) { clauses.push('sale_date >= ?'); parameters.push(start); }
  if (end) { clauses.push('sale_date <= ?'); parameters.push(end); }

  for (const [key, column] of Object.entries(FILTER_COLUMNS) as [SptFilterKey, string][]) {
    const selected = decodeMultiFilter(filters[key]);
    if (selected.length) {
      clauses.push(`${page === 'quarters' && key === 'seller' ? 'branch_seller' : column} IN (${placeholders(selected)})`);
      parameters.push(...selected);
    } else if (key === 'channel') {
      const channels = page === 'sellers' ? SELLER_PAGE_CHANNELS : page === 'quarters' ? QUARTER_PAGE_CHANNELS : DEFAULT_CHANNELS;
      clauses.push(`channel IN (${placeholders(channels)})`);
      parameters.push(...channels);
    } else if (key === 'productGroup') {
      const groups = page === 'sellers' ? SELLER_PAGE_PRODUCT_GROUPS : page === 'quarters' ? QUARTER_PAGE_PRODUCT_GROUPS : DEFAULT_PRODUCT_GROUPS;
      clauses.push(`product_group IN (${placeholders(groups)})`);
      parameters.push(...groups);
    }
  }
  return { sql: clauses.join(' AND '), parameters };
}

function metric(database: DatabaseSync, where: ReturnType<typeof buildWhere>): SptPeriodMetrics {
  return readMovementMetrics(database, where.sql, where.parameters);
}

function breakdown(database: DatabaseSync, filters: SptFilters, start: string, end: string, column: string, page: SptReportPage): SptBreakdownRow[] {
  const where = buildWhere(filters, start, end, page);
  return rows<{ label: string; kilos: number; units: number; netAmount: number; clients: number }>(database.prepare(`
    SELECT CASE WHEN TRIM(${column}) = '' THEN 'Sin definir' ELSE ${column} END AS label,
           SUM(kilos) AS kilos, SUM(units) AS units, SUM(net_amount) AS netAmount,
           COUNT(DISTINCT client_id) AS clients
    FROM movements WHERE ${where.sql}
    GROUP BY ${column}
    ORDER BY kilos DESC
  `), where.parameters).map((row) => ({ ...row, kilos: Number(row.kilos), units: Number(row.units), netAmount: Number(row.netAmount), clients: Number(row.clients) }));
}

function normalizeFilters(input: Partial<Record<string, unknown>>, latestMonth: string): SptFilters {
  const filters = { month: /^\d{4}-\d{2}$/.test(String(input.month ?? '')) ? String(input.month) : latestMonth } as SptFilters;
  for (const key of Object.keys(FILTER_COLUMNS) as SptFilterKey[]) filters[key] = String(input[key] ?? '').trim().slice(0, 4000);
  return filters;
}

export function buildSptReport(input: Partial<Record<string, unknown>>): SptReportPayload | null {
  const database = db();
  const meta = getSptReportMeta();
  if (!database || !meta.available) return null;
  const filters = normalizeFilters(input, meta.latestMonth);
  for (const key of Object.keys(FILTER_COLUMNS) as SptFilterKey[]) filters[key] = normalizeMultiFilter(filters[key], meta.options[key]);
  const page: SptReportPage = input.page === 'sellers' || input.page === 'quarters' ? input.page : 'main';
  if (!meta.months.includes(filters.month)) filters.month = meta.latestMonth;
  const [yearText, monthText] = filters.month.split('-');
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const sourceMax = new Date(`${meta.maxDate}T12:00:00Z`);
  const selectedIsLatest = filters.month === meta.latestMonth;
  const cutoffDay = selectedIsLatest ? sourceMax.getUTCDate() : monthEnd(year, month).getUTCDate();
  const currentStart = iso(monthStart(year, month));
  const currentEnd = iso(cutoffDate(year, month, cutoffDay));
  const previous = shiftedMonth(year, month, -1);
  const previousStart = iso(monthStart(previous.year, previous.month));
  const previousEnd = iso(cutoffDate(previous.year, previous.month, cutoffDay));
  const previousYearStart = iso(monthStart(year - 1, month));
  const previousYearEnd = iso(cutoffDate(year - 1, month, cutoffDay));
  const ytdStart = `${year}-01-01`;
  const previousYtdStart = `${year - 1}-01-01`;

  const current = metric(database, buildWhere(filters, currentStart, currentEnd, page));
  const previousMonth = metric(database, buildWhere(filters, previousStart, previousEnd, page));
  const previousYear = metric(database, buildWhere(filters, previousYearStart, previousYearEnd, page));
  const ytd = metric(database, buildWhere(filters, ytdStart, currentEnd, page));
  const previousYtd = metric(database, buildWhere(filters, previousYtdStart, previousYearEnd, page));

  const dailyMaps = [
    [currentStart, currentEnd],
    [previousStart, previousEnd],
    [previousYearStart, previousYearEnd],
  ].map(([start, end]) => {
    const where = buildWhere(filters, start, end, page);
    return new Map(rows<{ day: number; kilos: number }>(database.prepare(`
      SELECT CAST(strftime('%d', sale_date) AS INTEGER) AS day, SUM(kilos) AS kilos
      FROM movements WHERE ${where.sql} GROUP BY day ORDER BY day
    `), where.parameters).map((row) => [Number(row.day), Number(row.kilos)]));
  });
  const daily: SptDailyPoint[] = Array.from({ length: cutoffDay }, (_, index) => ({
    day: index + 1,
    current: dailyMaps[0].get(index + 1) ?? 0,
    previousMonth: dailyMaps[1].get(index + 1) ?? 0,
    previousYear: dailyMaps[2].get(index + 1) ?? 0,
  }));

  const trendStartDate = shiftedMonth(year, month, -12);
  const trendStart = iso(monthStart(trendStartDate.year, trendStartDate.month));
  const trendWhere = buildWhere(filters, trendStart, currentEnd, page);
  const monthlyRows = new Map(rows<{ month: string; kilos: number; units: number; netAmount: number; clients: number }>(database.prepare(`
    SELECT substr(sale_date, 1, 7) AS month, SUM(kilos) AS kilos, SUM(units) AS units,
           SUM(net_amount) AS netAmount, COUNT(DISTINCT client_id) AS clients
    FROM movements WHERE ${trendWhere.sql} GROUP BY month ORDER BY month
  `), trendWhere.parameters).map((row) => [row.month, row]));
  const monthly: SptMonthlyPoint[] = Array.from({ length: 13 }, (_, index) => {
    const date = shiftedMonth(year, month, index - 12);
    const key = `${date.year}-${String(date.month + 1).padStart(2, '0')}`;
    const row = monthlyRows.get(key);
    return { month: key, kilos: Number(row?.kilos ?? 0), units: Number(row?.units ?? 0), netAmount: Number(row?.netAmount ?? 0), clients: Number(row?.clients ?? 0) };
  });

  const last3Months = [-3, -2, -1].map((delta) => {
    const value = shiftedMonth(year, month, delta);
    return metric(database, buildWhere(filters, iso(monthStart(value.year, value.month)), iso(monthEnd(value.year, value.month)), page)).kilos;
  });

  const quarters: SptQuarterPoint[] = Array.from({ length: 4 }, (_, index) => {
    const startMonth = index * 3;
    const endMonth = startMonth + 2;
    const currentQuarterEnd = index === Math.floor(month / 3) ? cutoffDate(year, month, cutoffDay) : monthEnd(year, endMonth);
    const currentMetric = startMonth > month ? null : metric(database, buildWhere(filters, iso(monthStart(year, startMonth)), iso(currentQuarterEnd), page));
    const previousQuarterEnd = index === Math.floor(month / 3) ? cutoffDate(year - 1, month, cutoffDay) : monthEnd(year - 1, endMonth);
    const previousMetric = metric(database, buildWhere(filters, iso(monthStart(year - 1, startMonth)), iso(previousQuarterEnd), page));
    return { quarter: index + 1, current: currentMetric?.kilos ?? 0, currentNetAmount: currentMetric?.netAmount ?? 0, previousYear: previousMetric.kilos, previousYearNetAmount: previousMetric.netAmount };
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.maxDate,
    page,
    selectedMonth: filters.month,
    cutoffDay,
    filters,
    current,
    previousMonth,
    previousYear,
    ytd,
    previousYtd,
    averageLast3MonthsKilos: last3Months.reduce((sum, value) => sum + value, 0) / 3,
    daily,
    monthly,
    sellers: breakdown(database, filters, currentStart, currentEnd, 'seller', page),
    productGroups: breakdown(database, filters, currentStart, currentEnd, 'product_group', page),
    quarters,
  };
}
