import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  BairesBreakdownRow,
  BairesFilterKey,
  BairesFilters,
  BairesMetrics,
  BairesMonthlyPoint,
  BairesQuarterPoint,
  BairesReportMeta,
  BairesReportPayload,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { cutoffDate as dateAtCutoff, daysInclusive, isoDate as iso, monthEnd, monthKey, monthStart, shiftedMonth as shiftMonth, utcDate } from './reporting-periods.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { metricRatio as ratio, metricShare, metricVariation, readMovementMetrics } from './report-metrics.js';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = () => resolveActiveDataPaths().commercial;

const UNIVERSE = EXECUTABLE_UNIVERSES.baires;
const COMPANIES = [...UNIVERSE.companies];
const BRANCHES = [...UNIVERSE.branches];
const ALLOWED_ISSUERS = [...UNIVERSE.allowedIssuers];
const PRODUCT_GROUPS = [...UNIVERSE.includedProductGroups];
const EXCLUDED_CATEGORIES = [...UNIVERSE.excludedCategories];
const EXCLUDED_CLIENTS = [...UNIVERSE.excludedClients];
const segmentExpression = `CASE
  WHEN UPPER(TRIM(product_group)) = 'HARBOR SPT' THEN 'Specialty'
  WHEN UPPER(TRIM(product_group)) = 'HARBOR RETAIL' THEN 'Mass Retail'
  ELSE product_group END`;
const branchExpression = `CASE
  WHEN branch_id IN (3, 6) THEN 'Demo Main Branch'
  WHEN branch_id = 4 THEN 'Demo Branch 2'
  ELSE COALESCE(NULLIF(TRIM(branch_name), ''), 'Other') END`;

const FILTER_EXPRESSIONS: Record<BairesFilterKey, string> = {
  segment: segmentExpression,
  brand: 'brand',
  subcategory: 'subcategory',
  branch: branchExpression,
};

type SqlValue = string | number;

let cachedMeta: BairesReportMeta | null = null;
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

function baseUniverse() {
  return compileMovementUniverse(UNIVERSE);
}

function buildWhere(filters: BairesFilters, start?: string, end?: string) {
  const base = baseUniverse();
  const clauses = [base.sql];
  const parameters = [...base.parameters];
  if (start) { clauses.push('sale_date >= ?'); parameters.push(start); }
  if (end) { clauses.push('sale_date <= ?'); parameters.push(end); }
  for (const [key, expression] of Object.entries(FILTER_EXPRESSIONS) as [BairesFilterKey, string][]) {
    const selected = decodeMultiFilter(filters[key]);
    if (!selected.length) continue;
    clauses.push(`(${expression}) IN (${placeholders(selected)})`);
    parameters.push(...selected);
  }
  return { sql: clauses.join(' AND '), parameters };
}

function metric(value: DatabaseSync, filters: BairesFilters, start: string, end: string): BairesMetrics {
  const where = buildWhere(filters, start, end);
  return readMovementMetrics(value, where.sql, where.parameters);
}

function normalizeFilters(input: Partial<Record<string, unknown>>, meta: BairesReportMeta): BairesFilters {
  const filters: BairesFilters = {
    year: /^\d{4}$/.test(String(input.year ?? '')) ? String(input.year) : meta.latestYear,
    month: /^(0[1-9]|1[0-2])$/.test(String(input.month ?? '')) ? String(input.month) : meta.latestMonth.slice(5, 7),
    segment: '',
    brand: '',
    subcategory: '',
    branch: '',
  };
  for (const key of Object.keys(FILTER_EXPRESSIONS) as BairesFilterKey[]) {
    filters[key] = String(input[key] ?? '').trim().slice(0, 4000);
  }
  return filters;
}

function monthlyPoint(value: DatabaseSync, filters: BairesFilters, year: number, month: number, meta: BairesReportMeta): BairesMonthlyPoint {
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

function breakdownRows(value: DatabaseSync, filters: BairesFilters, expression: string, start: string, end: string, previousStart: string, previousEnd: string): BairesBreakdownRow[] {
  const currentWhere = buildWhere(filters, start, end);
  const previousWhere = buildWhere(filters, previousStart, previousEnd);
  const nameExpression = `CASE WHEN TRIM(${expression}) = '' THEN 'Undefined' ELSE ${expression} END`;
  const current = rows<{ name: string; kilos: number; clients: number; units: number; netAmount: number }>(value.prepare(`
    SELECT ${nameExpression} AS name, COALESCE(SUM(kilos), 0) AS kilos,
           COUNT(DISTINCT client_id) AS clients, COALESCE(SUM(units), 0) AS units,
           COALESCE(SUM(net_amount), 0) AS netAmount
    FROM movements WHERE ${currentWhere.sql} GROUP BY ${nameExpression}
  `), currentWhere.parameters);
  const previous = rows<{ name: string; kilos: number }>(value.prepare(`
    SELECT ${nameExpression} AS name, COALESCE(SUM(kilos), 0) AS kilos
    FROM movements WHERE ${previousWhere.sql} GROUP BY ${nameExpression}
  `), previousWhere.parameters);
  const previousMap = new Map(previous.map((row) => [row.name, Number(row.kilos)]));
  const total = current.reduce((sum, row) => sum + Number(row.kilos), 0);
  return current.map((row) => {
    const kilos = Number(row.kilos);
    const previousYearKilos = previousMap.get(row.name) ?? 0;
    return {
      name: row.name,
      kilos,
      clients: Number(row.clients),
      units: Number(row.units),
      netAmount: Number(row.netAmount),
      share: metricShare(kilos, total),
      previousYearKilos,
      variation: metricVariation(kilos, previousYearKilos),
    };
  }).filter((row) => Math.abs(row.kilos) > 0.0001).sort((a, b) => b.kilos - a.kilos);
}

export function getBairesReportPath() {
  return reportPath();
}

export function getBairesReportMeta(): BairesReportMeta {
  const value = db();
  if (cachedMeta) return cachedMeta;
  const unavailable: BairesReportMeta = {
    available: false,
    sourceSystem: 'Synthetic local demo dataset',
    rowCount: 0, coverageFrom: '', minDate: '', maxDate: '', capturedAt: '', latestYear: '', latestMonth: '',
    years: [], monthsByYear: {}, sourceDocumentCount: 0, unavailableDocumentCount: 0,
    options: { segment: [], brand: [], subcategory: [], branch: [] },
    universe: { companies: COMPANIES, branches: BRANCHES, allowedIssuers: ALLOWED_ISSUERS, productGroups: PRODUCT_GROUPS, excludedCategories: EXCLUDED_CATEGORIES, excludedClients: EXCLUDED_CLIENTS },
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
      segment: optionQuery(segmentExpression),
      brand: optionQuery('brand'),
      subcategory: optionQuery('subcategory'),
      branch: optionQuery(branchExpression),
    },
    universe: unavailable.universe,
  };
  return cachedMeta;
}

export function buildBairesReport(input: Partial<Record<string, unknown>>): BairesReportPayload | null {
  const value = db();
  const meta = getBairesReportMeta();
  if (!value || !meta.available) return null;
  const filters = normalizeFilters(input, meta);
  if (!meta.years.includes(filters.year)) filters.year = meta.latestYear;
  const validMonths = meta.monthsByYear[filters.year] ?? [];
  if (!validMonths.includes(filters.month)) filters.month = filters.year === meta.latestYear ? meta.latestMonth.slice(5, 7) : validMonths.at(-1) ?? '12';
  for (const key of Object.keys(FILTER_EXPRESSIONS) as BairesFilterKey[]) {
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

  const latestYear = Number(meta.latestYear);
  const latestMonth = Number(meta.latestMonth.slice(5, 7)) - 1;
  const monthly: BairesMonthlyPoint[] = Array.from({ length: 13 }, (_, index) => {
    const point = shiftMonth(latestYear, latestMonth, index - 12);
    return monthlyPoint(value, filters, point.year, point.month, meta);
  });
  const quarters: BairesQuarterPoint[] = Array.from({ length: 4 }, (_, index) => {
    const startMonth = index * 3;
    const start = iso(monthStart(year, startMonth));
    const naturalQuarterEnd = iso(monthEnd(year, startMonth + 2));
    const end = filters.year === meta.latestYear && meta.maxDate < naturalQuarterEnd ? meta.maxDate : naturalQuarterEnd;
    if (end < start) return null;
    return { ...metric(value, filters, start, end), quarter: `T-${index + 1}`, isPartial: end < naturalQuarterEnd };
  }).filter((row): row is BairesQuarterPoint => row !== null && (row.kilos !== 0 || row.clients !== 0));

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
    ytd: metric(value, filters, `${year}-01-01`, periodEnd),
    previousYtd: metric(value, filters, `${year - 1}-01-01`, previousYearEnd),
    monthly,
    quarters,
    brands: breakdownRows(value, filters, 'brand', periodStart, periodEnd, previousYearStart, previousYearEnd),
    subcategories: breakdownRows(value, filters, 'subcategory', periodStart, periodEnd, previousYearStart, previousYearEnd),
  };
}
