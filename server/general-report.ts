import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  GeneralPerformanceRow,
  GeneralReportFilters,
  GeneralReportMeta,
  GeneralReportMode,
  GeneralReportPayload,
  GeneralTrendPoint,
} from '../shared/models.js';
import { decodeMultiFilter, matchesMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { STATUS_TARGET_SOURCE, STATUS_TARGETS, type StatusTargetRow } from './data/status-targets.js';
import { daysInclusive } from './reporting-periods.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = process.env.SALICE_SPT_DB_PATH
  ? resolve(process.env.SALICE_SPT_DB_PATH)
  : resolve(process.cwd(), 'data/spt-gesi.sqlite');

const COMPANIES = [3];
const BRANCHES = [3];
const ALLOWED_ISSUERS = ['Salice Distribuciones S.A.'];
const SELLERS = ['Ana Ottaviano', 'Andres Dominguez', 'Edgardo Larrea', 'Gonzalo Russian', 'Ignacio Carea', 'Julieta Errecart', 'Luciano Payba', 'Reventas'];
const AUTOSERVICE_SELLERS = ['Ana Ottaviano', 'Julieta Errecart'];
const CORE_CATEGORIES = ['Alimento Húmedo', 'Alimentos Balanceados', 'C&T'];
const CORE_SQL_CATEGORIES = ['Alimento Húmedo', 'Alimentos Balanceados', 'Snacks'];
const CORE_BRANDS = ['Old Prince Equilibrium', 'Old Prince Noveles', 'Criadores High Pro', 'Criadores Maintenance', 'Optimum', 'Pedigree', 'Raza', 'Voraz', 'Whiskas', 'Kongo', 'Iams', 'Old Prince Premium', 'Company y Origen'];
const CORE_SQL_BRANDS = ['Kongo Gold', 'Old Prince Equilibrium', 'Old Prince Noveles', 'Criadores High Pro', 'Kongo', 'Raza', 'Pedigree', 'Whiskas', 'Voraz', 'Criadores Maintenance', 'Old Prince Premium', 'Optimum', 'Company', 'Origen', 'Iams'];
const STRATEGIC_BRANDS = ['Fawna', 'Juvenia Nutrition', 'MaxPet', 'Pampa'];
const STRATEGIC_SQL_BRANDS = ['Fawna', 'Juvenia Nutrition', 'MaxPet', 'PAMPA'];
const CORE_TARGET_EXCLUSIONS = new Set(['Fawna', 'MaxPet', 'Pampa']);

const brandGroupExpression = `CASE
  WHEN TRIM(brand) IN ('Company', 'Origen') THEN 'Company y Origen'
  WHEN UPPER(TRIM(brand)) = 'PAMPA' THEN 'Pampa'
  ELSE TRIM(brand) END`;
const categoryGroupExpression = `CASE WHEN TRIM(category) = 'Snacks' THEN 'C&T' ELSE TRIM(category) END`;

type SqlValue = string | number;
type MetricRow = { kilos: number | null; clients: number | null; units: number | null; netAmount: number | null };

let cachedMeta: GeneralReportMeta | null = null;
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

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, 12));
}

function monthParts(month: string) {
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) - 1 };
}

function monthKey(year: number, month: number) {
  const value = utcDate(year, month, 1);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number) {
  const parts = monthParts(month);
  return monthKey(parts.year, parts.month + delta);
}

function monthStart(month: string) {
  return `${month}-01`;
}

function monthEnd(month: string) {
  const parts = monthParts(month);
  return utcDate(parts.year, parts.month + 1, 0).toISOString().slice(0, 10);
}

function dateAtCutoff(month: string, day: number) {
  return `${month}-${String(Math.min(day, Number(monthEnd(month).slice(8, 10)))).padStart(2, '0')}`;
}

function ratio(actual: number, target: number) {
  return target ? actual / target * 100 : null;
}

function commonUniverse() {
  return {
    sql: `company_id IN (${placeholders(COMPANIES)})
      AND branch_id IN (${placeholders(BRANCHES)})
      AND TRIM(issuer_name) IN (${placeholders(ALLOWED_ISSUERS)})`,
    parameters: [...COMPANIES, ...BRANCHES, ...ALLOWED_ISSUERS] as SqlValue[],
  };
}

function buildWhere(filters: GeneralReportFilters, start: string, end: string) {
  const base = commonUniverse();
  const clauses = [base.sql, 'sale_date >= ?', 'sale_date <= ?'];
  const parameters: SqlValue[] = [...base.parameters, start, end];
  if (filters.mode === 'core') {
    clauses.push(`TRIM(category) IN (${placeholders(CORE_SQL_CATEGORIES)})`);
    clauses.push(`TRIM(brand) IN (${placeholders(CORE_SQL_BRANDS)})`);
    clauses.push(`TRIM(seller) IN (${placeholders(SELLERS)})`);
    parameters.push(...CORE_SQL_CATEGORIES, ...CORE_SQL_BRANDS, ...SELLERS);
    const categories = decodeMultiFilter(filters.category);
    if (categories.length) {
      clauses.push(`(${categoryGroupExpression}) IN (${placeholders(categories)})`);
      parameters.push(...categories);
    }
    const brands = decodeMultiFilter(filters.brand);
    if (brands.length) {
      clauses.push(`(${brandGroupExpression}) IN (${placeholders(brands)})`);
      parameters.push(...brands);
    }
  } else if (filters.mode === 'strategic') {
    clauses.push(`TRIM(brand) IN (${placeholders(STRATEGIC_SQL_BRANDS)})`);
    clauses.push(`TRIM(seller) IN (${placeholders(SELLERS)})`);
    parameters.push(...STRATEGIC_SQL_BRANDS, ...SELLERS);
    const brands = decodeMultiFilter(filters.brand);
    if (brands.length) {
      clauses.push(`(${brandGroupExpression}) IN (${placeholders(brands)})`);
      parameters.push(...brands);
    }
  } else {
    clauses.push(`TRIM(seller) IN (${placeholders(AUTOSERVICE_SELLERS)})`);
    parameters.push(...AUTOSERVICE_SELLERS);
  }
  const sellers = decodeMultiFilter(filters.seller);
  if (sellers.length) {
    clauses.push(`TRIM(seller) IN (${placeholders(sellers)})`);
    parameters.push(...sellers);
  }
  return { sql: clauses.join(' AND '), parameters };
}

function metric(value: DatabaseSync, filters: GeneralReportFilters, start: string, end: string) {
  const where = buildWhere(filters, start, end);
  const row = value.prepare(`
    SELECT COALESCE(SUM(kilos), 0) AS kilos,
           COUNT(DISTINCT client_id) AS clients,
           COALESCE(SUM(units), 0) AS units,
           COALESCE(SUM(net_amount), 0) AS netAmount
    FROM movements WHERE ${where.sql}
  `).get(...where.parameters) as MetricRow;
  const normalized = {
    kilos: Number(row.kilos ?? 0),
    clients: Number(row.clients ?? 0),
    units: Number(row.units ?? 0),
    netAmount: Number(row.netAmount ?? 0),
  };
  return { ...normalized, primary: filters.mode === 'autoservice' ? normalized.netAmount : normalized.kilos };
}

function targetCategory(row: StatusTargetRow) {
  if (row.product === 'Alimento Húmedo') return 'Alimento Húmedo';
  if (row.product === 'C&T') return 'C&T';
  return 'Alimentos Balanceados';
}

function targetMatches(row: StatusTargetRow, filters: GeneralReportFilters, month: string) {
  if (row.month !== month) return false;
  if (!matchesMultiFilter(row.seller, filters.seller)) return false;
  if (filters.mode === 'autoservice') return row.invoicing != null && AUTOSERVICE_SELLERS.includes(row.seller);
  if (row.kilos == null || !row.product) return false;
  if (filters.mode === 'strategic') {
    if (!STRATEGIC_BRANDS.includes(row.product)) return false;
    return matchesMultiFilter(row.product, filters.brand);
  }
  if (CORE_TARGET_EXCLUSIONS.has(row.product)) return false;
  if (!matchesMultiFilter(targetCategory(row), filters.category)) return false;
  if (!matchesMultiFilter(row.product, filters.brand)) return false;
  return true;
}

function targetValue(filters: GeneralReportFilters, month: string) {
  return STATUS_TARGETS.filter((row) => targetMatches(row, filters, month)).reduce((sum, row) => (
    sum + Number(filters.mode === 'autoservice' ? row.invoicing ?? 0 : row.kilos ?? 0)
  ), 0);
}

function targetMap(filters: GeneralReportFilters, month: string, dimension: 'seller' | 'category' | 'brand') {
  const grouped = new Map<string, number>();
  for (const row of STATUS_TARGETS.filter((item) => targetMatches(item, filters, month))) {
    const name = dimension === 'seller' ? row.seller : dimension === 'category' ? targetCategory(row) : row.product;
    if (!name || (dimension === 'brand' && ['Alimento Húmedo', 'C&T'].includes(name))) continue;
    const amount = Number(filters.mode === 'autoservice' ? row.invoicing ?? 0 : row.kilos ?? 0);
    grouped.set(name, (grouped.get(name) ?? 0) + amount);
  }
  return grouped;
}

function actualMap(value: DatabaseSync, filters: GeneralReportFilters, start: string, end: string, expression: string) {
  const where = buildWhere(filters, start, end);
  const measure = filters.mode === 'autoservice' ? 'net_amount' : 'kilos';
  return new Map(rows<{ name: string; actual: number }>(value.prepare(`
    SELECT ${expression} AS name, COALESCE(SUM(${measure}), 0) AS actual
    FROM movements WHERE ${where.sql}
    GROUP BY ${expression}
  `), where.parameters).map((row) => [row.name || 'Sin definir', Number(row.actual)]));
}

function performanceRows(actual: Map<string, number>, target: Map<string, number>, preferred: string[] = []): GeneralPerformanceRow[] {
  const names = [...new Set([...preferred, ...actual.keys(), ...target.keys()])];
  const totalActual = [...actual.values()].reduce((sum, amount) => sum + amount, 0);
  return names.map((name) => {
    const actualAmount = actual.get(name) ?? 0;
    const targetAmount = target.get(name) ?? 0;
    return {
      name,
      actual: actualAmount,
      target: targetAmount,
      completion: ratio(actualAmount, targetAmount),
      gap: actualAmount - targetAmount,
      share: totalActual ? actualAmount / totalActual * 100 : 0,
    };
  }).filter((row) => Math.abs(row.actual) > 0.0001 || Math.abs(row.target) > 0.0001);
}

function normalizeFilters(input: Partial<Record<string, unknown>>, meta: GeneralReportMeta): GeneralReportFilters {
  const requestedMode = String(input.mode ?? 'core') as GeneralReportMode;
  const mode: GeneralReportMode = ['core', 'strategic', 'autoservice'].includes(requestedMode) ? requestedMode : 'core';
  const month = meta.months.includes(String(input.month ?? '')) ? String(input.month) : meta.latestMonth;
  const availableSellers = mode === 'autoservice' ? AUTOSERVICE_SELLERS : SELLERS;
  return {
    mode,
    month,
    seller: normalizeMultiFilter(input.seller, availableSellers),
    category: mode === 'core' ? normalizeMultiFilter(input.category, CORE_CATEGORIES) : '',
    brand: mode === 'core'
      ? normalizeMultiFilter(input.brand, CORE_BRANDS)
      : mode === 'strategic' ? normalizeMultiFilter(input.brand, STRATEGIC_BRANDS) : '',
  };
}

export function getGeneralReportPath() {
  return reportPath;
}

export function getGeneralReportMeta(): GeneralReportMeta {
  if (cachedMeta) return cachedMeta;
  const value = db();
  const unavailable: GeneralReportMeta = {
    available: false,
    sourceSystem: 'GESI API · facturas, notas de crédito y maestros Salice',
    rowCount: 0,
    coverageFrom: '',
    minDate: '',
    maxDate: '',
    capturedAt: '',
    latestMonth: STATUS_TARGET_SOURCE.coverageThrough,
    months: [],
    sourceDocumentCount: 0,
    unavailableDocumentCount: 0,
    options: { sellers: SELLERS, coreCategories: CORE_CATEGORIES, coreBrands: CORE_BRANDS, strategicBrands: STRATEGIC_BRANDS },
    targetSource: STATUS_TARGET_SOURCE,
    universe: {
      companies: COMPANIES,
      branches: BRANCHES,
      allowedIssuers: ALLOWED_ISSUERS,
      sellers: SELLERS,
      coreCategories: CORE_SQL_CATEGORIES,
      coreBrands: CORE_SQL_BRANDS,
      strategicBrands: STRATEGIC_SQL_BRANDS,
      autoserviceSellers: AUTOSERVICE_SELLERS,
    },
  };
  if (!value) return unavailable;
  const base = commonUniverse();
  const profile = value.prepare(`
    SELECT MIN(sale_date) AS minDate, MAX(sale_date) AS maxDate, COUNT(*) AS rowCount,
           COUNT(DISTINCT source_document_key) AS sourceDocumentCount
    FROM movements WHERE ${base.sql}
  `).get(...base.parameters) as { minDate: string | null; maxDate: string | null; rowCount: number; sourceDocumentCount: number };
  if (!profile.minDate || !profile.maxDate) return unavailable;
  const meta = metadata(value);
  const targetMonths = [...new Set(STATUS_TARGETS.map((row) => row.month))].sort();
  const latestMonth = targetMonths.filter((month) => month <= profile.maxDate!.slice(0, 7)).at(-1) ?? targetMonths.at(-1) ?? '';
  cachedMeta = {
    ...unavailable,
    available: true,
    sourceSystem: meta.get('source_system') ?? unavailable.sourceSystem,
    rowCount: Number(profile.rowCount),
    coverageFrom: meta.get('coverage_from') ?? profile.minDate,
    minDate: profile.minDate,
    maxDate: profile.maxDate,
    capturedAt: meta.get('captured_at') ?? '',
    latestMonth,
    months: targetMonths,
    sourceDocumentCount: Number(meta.get('source_document_count') ?? profile.sourceDocumentCount),
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
  };
  return cachedMeta;
}

export function buildGeneralReport(input: Partial<Record<string, unknown>>): GeneralReportPayload | null {
  const value = db();
  const meta = getGeneralReportMeta();
  if (!value || !meta.available) return null;
  const filters = normalizeFilters(input, meta);
  const start = monthStart(filters.month);
  const naturalEnd = monthEnd(filters.month);
  const end = filters.month === meta.maxDate.slice(0, 7) ? meta.maxDate : naturalEnd;
  const isPartial = end < naturalEnd;
  const elapsedDays = daysInclusive(start, end);
  const daysInMonth = Number(naturalEnd.slice(8, 10));
  const current = metric(value, filters, start, end);
  const target = targetValue(filters, filters.month);
  const previousMonth = shiftMonth(filters.month, -1);
  const previousYear = shiftMonth(filters.month, -12);
  const cutoffDay = Number(end.slice(8, 10));
  const previousMonthActual = metric(value, filters, monthStart(previousMonth), dateAtCutoff(previousMonth, cutoffDay)).primary;
  const previousYearActual = metric(value, filters, monthStart(previousYear), dateAtCutoff(previousYear, cutoffDay)).primary;
  const projection = isPartial && elapsedDays ? current.primary / elapsedDays * daysInMonth : null;

  const trend: GeneralTrendPoint[] = Array.from({ length: 13 }, (_, index) => shiftMonth(filters.month, index - 12)).map((month) => {
    const monthNaturalEnd = monthEnd(month);
    const monthPeriodEnd = month === meta.maxDate.slice(0, 7) ? meta.maxDate : monthNaturalEnd;
    const actual = metric(value, filters, monthStart(month), monthPeriodEnd).primary;
    const monthTarget = targetValue(filters, month);
    return { month, actual, target: monthTarget, completion: ratio(actual, monthTarget), isPartial: monthPeriodEnd < monthNaturalEnd };
  });

  const sellerActual = actualMap(value, filters, start, end, `COALESCE(NULLIF(TRIM(seller), ''), 'Sin vendedor')`);
  const sellerTargets = targetMap(filters, filters.month, 'seller');
  const categoryActual = filters.mode === 'strategic' ? new Map<string, number>() : actualMap(value, filters, start, end, categoryGroupExpression);
  const categoryTargets = filters.mode === 'core' ? targetMap(filters, filters.month, 'category') : new Map<string, number>();
  const brandActual = filters.mode === 'autoservice' ? new Map<string, number>() : actualMap(value, filters, start, end, brandGroupExpression);
  const brandTargets = filters.mode === 'autoservice' ? new Map<string, number>() : targetMap(filters, filters.month, 'brand');

  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.maxDate,
    selectedMonth: filters.month,
    periodStart: start,
    periodEnd: end,
    isPartial,
    elapsedDays,
    daysInMonth,
    unit: filters.mode === 'autoservice' ? 'currency' : 'kilos',
    filters,
    actual: current.primary,
    target,
    completion: ratio(current.primary, target),
    gap: current.primary - target,
    projection,
    projectedCompletion: projection == null ? null : ratio(projection, target),
    previousMonthActual,
    previousYearActual,
    kilos: current.kilos,
    clients: current.clients,
    units: current.units,
    netAmount: current.netAmount,
    trend,
    sellers: performanceRows(sellerActual, sellerTargets, filters.mode === 'autoservice' ? AUTOSERVICE_SELLERS : SELLERS),
    categories: performanceRows(categoryActual, categoryTargets, filters.mode === 'core' ? CORE_CATEGORIES : []),
    brands: performanceRows(brandActual, brandTargets, filters.mode === 'strategic' ? STRATEGIC_BRANDS : CORE_BRANDS),
  };
}
