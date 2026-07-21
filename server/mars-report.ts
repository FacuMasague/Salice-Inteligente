import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  MarsBrandRow,
  MarsFilterKey,
  MarsFilters,
  MarsMetrics,
  MarsPeriodDefinition,
  MarsPeriodPoint,
  MarsQuarterPoint,
  MarsReportMeta,
  MarsReportPayload,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { daysInclusive, shiftDays as addDays } from './reporting-periods.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { metricRatio as ratio, metricShare, metricVariation } from './report-metrics.js';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = () => resolveActiveDataPaths().commercial;

const UNIVERSE = EXECUTABLE_UNIVERSES.mars;
const COMPANIES = [...UNIVERSE.companies];
const BRANCHES = [...UNIVERSE.branches];
const ISSUERS = [...UNIVERSE.allowedIssuers];
const PRODUCT_GROUP = UNIVERSE.includedProductGroups[0];
const EXCLUDED_CLIENTS = [...UNIVERSE.excludedClients];
const MARS_BRANDS = ['EverPaw', 'Northstar', 'WildTail'];
const MARS_SUBCATEGORIES = ['Treats', 'Large Bags', 'Small Bags'];
const MARS_CHANNELS = ['Specialty', 'Mass Retail'];

const SPECIALIZED_CHANNELS = ['Coastal Route', 'Specialty', 'Distributor'];
const MASS_CHANNELS = ['Mass Retail', 'Small Retail'];

const branchExpression = `CASE
  WHEN branch_id = 7 THEN 'Demo Branch 2'
  WHEN branch_id IN (3, 6) THEN 'Demo Main Branch'
  ELSE 'Other' END`;
const channelExpression = `CASE
  WHEN channel IN (${sqlList(SPECIALIZED_CHANNELS)}) THEN 'Specialty'
  WHEN channel IN (${sqlList(MASS_CHANNELS)}) THEN 'Mass Retail'
  ELSE channel END`;
const subcategoryExpression = 'subcategory';
const clientTypeExpression = 'client_type';

const FILTER_EXPRESSIONS: Record<MarsFilterKey, string> = {
  branch: branchExpression,
  clientType: clientTypeExpression,
  channelGroup: channelExpression,
  brand: 'brand',
  subcategoryGroup: subcategoryExpression,
};

type SqlValue = string | number;
type MetricRow = { kilos: number | null; accounts: number | null; clientBranches: number | null };

let cachedMeta: MarsReportMeta | null = null;
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

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function marsYearStart(year: number) {
  const anchor = new Date(Date.UTC(year - 1, 11, 31, 12));
  const day = anchor.getUTCDay();
  anchor.setUTCDate(anchor.getUTCDate() + (day <= 3 ? -day : 7 - day));
  return iso(anchor);
}

export function marsPeriodsForYear(year: number): MarsPeriodDefinition[] {
  const start = marsYearStart(year);
  const nextStart = marsYearStart(year + 1);
  return Array.from({ length: 13 }, (_, index) => {
    const periodStart = addDays(start, index * 28);
    const periodEnd = index === 12 ? addDays(nextStart, -1) : addDays(periodStart, 27);
    const period = index + 1;
    return {
      year,
      period,
      label: `P${String(period).padStart(2, '0')}`,
      quarter: `Q${Math.min(4, Math.floor(index / 3) + 1)}`,
      start: periodStart,
      end: periodEnd,
      days: daysInclusive(periodStart, periodEnd),
    };
  });
}

function marsPeriodForDate(value: string) {
  const calendarYear = Number(value.slice(0, 4));
  for (const year of [calendarYear - 1, calendarYear, calendarYear + 1]) {
    const match = marsPeriodsForYear(year).find((period) => value >= period.start && value <= period.end);
    if (match) return match;
  }
  throw new Error(`Could not locate ${value} in the Orbit calendar.`);
}

function previousPeriod(period: MarsPeriodDefinition) {
  return period.period === 1
    ? marsPeriodsForYear(period.year - 1)[12]
    : marsPeriodsForYear(period.year)[period.period - 2];
}

function previousYearPeriod(period: MarsPeriodDefinition) {
  return marsPeriodsForYear(period.year - 1)[period.period - 1];
}

function metadata(database: DatabaseSync) {
  return new Map(rows<{ key: string; value: string }>(database.prepare('SELECT key, value FROM report_meta')).map((row) => [row.key, row.value]));
}

function baseUniverse() {
  return compileMovementUniverse(UNIVERSE);
}

function buildWhere(filters: MarsFilters, start?: string, end?: string) {
  const base = baseUniverse();
  const clauses = [base.sql];
  const parameters = [...base.parameters];
  if (start) { clauses.push('sale_date >= ?'); parameters.push(start); }
  if (end) { clauses.push('sale_date <= ?'); parameters.push(end); }
  for (const [key, expression] of Object.entries(FILTER_EXPRESSIONS) as [MarsFilterKey, string][]) {
    const selected = decodeMultiFilter(filters[key]);
    if (!selected.length) continue;
    clauses.push(`(${expression}) IN (${placeholders(selected)})`);
    parameters.push(...selected);
  }
  return { sql: clauses.join(' AND '), parameters };
}

function metric(database: DatabaseSync, filters: MarsFilters, start: string, end: string): MarsMetrics {
  const where = buildWhere(filters, start, end);
  const row = database.prepare(`
    SELECT COALESCE(SUM(kilos), 0) AS kilos,
           COUNT(DISTINCT client_id) AS accounts,
           COUNT(DISTINCT CAST(client_id AS TEXT) || ':' || CAST(client_branch_id AS TEXT)) AS clientBranches
    FROM movements WHERE ${where.sql}
  `).get(...where.parameters) as MetricRow;
  const accounts = Number(row.accounts ?? 0);
  const clientBranches = Number(row.clientBranches ?? 0);
  return {
    kilos: Number(row.kilos ?? 0),
    clients: filters.clientMode === 'branch' ? clientBranches : accounts,
    accounts,
    clientBranches,
  };
}

function normalizeFilters(input: Partial<Record<string, unknown>>, meta: MarsReportMeta): MarsFilters {
  return {
    year: /^\d{4}$/.test(String(input.year ?? '')) ? String(input.year) : meta.latestYear,
    period: /^P\d{2}$/.test(String(input.period ?? '')) ? String(input.period) : meta.latestPeriod,
    clientMode: input.clientMode === 'account' ? 'account' : 'branch',
    branch: String(input.branch ?? '').trim().slice(0, 4000),
    clientType: String(input.clientType ?? '').trim().slice(0, 4000),
    channelGroup: String(input.channelGroup ?? '').trim().slice(0, 4000),
    brand: String(input.brand ?? '').trim().slice(0, 4000),
    subcategoryGroup: String(input.subcategoryGroup ?? '').trim().slice(0, 4000),
  };
}

function periodPoint(database: DatabaseSync, filters: MarsFilters, definition: MarsPeriodDefinition, sourceMaxDate: string): MarsPeriodPoint {
  const end = sourceMaxDate >= definition.start && sourceMaxDate < definition.end ? sourceMaxDate : definition.end;
  const isPartial = end < definition.end;
  const current = metric(database, filters, definition.start, end);
  const priorPeriod = previousPeriod(definition);
  const priorYear = previousYearPeriod(definition);
  const comparablePriorYearEnd = addDays(priorYear.start, Math.min(daysInclusive(definition.start, end), priorYear.days) - 1);
  const priorYearMetric = metric(database, filters, priorYear.start, comparablePriorYearEnd);
  const priorPeriodMetric = metric(database, filters, priorPeriod.start, priorPeriod.end);
  const yearStart = marsPeriodsForYear(definition.year)[0].start;
  const previousYearStart = marsPeriodsForYear(definition.year - 1)[0].start;
  const ytd = metric(database, filters, yearStart, end);
  const previousYtd = metric(database, filters, previousYearStart, comparablePriorYearEnd);
  return {
    ...current,
    period: definition.period,
    label: definition.label,
    quarter: definition.quarter,
    start: definition.start,
    end,
    isPartial,
    previousYearKilos: priorYearMetric.kilos,
    previousPeriodKilos: priorPeriodMetric.kilos,
    ytdKilos: ytd.kilos,
    previousYtdKilos: previousYtd.kilos,
    ytdVsPreviousYear: ratio(ytd.kilos, previousYtd.kilos),
    vsPreviousYear: ratio(current.kilos, priorYearMetric.kilos),
    vsPreviousPeriod: ratio(current.kilos, priorPeriodMetric.kilos),
  };
}

function brandRows(database: DatabaseSync, filters: MarsFilters, current: MarsPeriodDefinition, currentEnd: string): MarsBrandRow[] {
  const previous = previousYearPeriod(current);
  const comparisonEnd = addDays(previous.start, Math.min(daysInclusive(current.start, currentEnd), previous.days) - 1);
  const currentWhere = buildWhere(filters, current.start, currentEnd);
  const previousWhere = buildWhere(filters, previous.start, comparisonEnd);
  const clientExpression = filters.clientMode === 'branch'
    ? `CAST(client_id AS TEXT) || ':' || CAST(client_branch_id AS TEXT)`
    : 'client_id';
  const currentRows = rows<{ brand: string; kilos: number; accounts: number; clientBranches: number; clients: number }>(database.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Unbranded' ELSE brand END AS brand,
           COALESCE(SUM(kilos), 0) AS kilos,
           COUNT(DISTINCT client_id) AS accounts,
           COUNT(DISTINCT CAST(client_id AS TEXT) || ':' || CAST(client_branch_id AS TEXT)) AS clientBranches,
           COUNT(DISTINCT ${clientExpression}) AS clients
    FROM movements WHERE ${currentWhere.sql}
    GROUP BY CASE WHEN TRIM(brand) = '' THEN 'Unbranded' ELSE brand END
  `), currentWhere.parameters);
  const previousRows = rows<{ brand: string; kilos: number }>(database.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Unbranded' ELSE brand END AS brand,
           COALESCE(SUM(kilos), 0) AS kilos
    FROM movements WHERE ${previousWhere.sql}
    GROUP BY CASE WHEN TRIM(brand) = '' THEN 'Unbranded' ELSE brand END
  `), previousWhere.parameters);
  const previousMap = new Map(previousRows.map((row) => [row.brand, Number(row.kilos)]));
  const total = currentRows.reduce((sum, row) => sum + Number(row.kilos), 0);
  return currentRows.map((row) => {
    const kilos = Number(row.kilos);
    const previousYearKilos = previousMap.get(row.brand) ?? 0;
    return {
      brand: row.brand,
      kilos,
      clients: Number(row.clients),
      accounts: Number(row.accounts),
      clientBranches: Number(row.clientBranches),
      share: metricShare(kilos, total),
      previousYearKilos,
      variation: metricVariation(kilos, previousYearKilos),
    };
  }).filter((row) => Math.abs(row.kilos) > 0.0001).sort((a, b) => b.kilos - a.kilos);
}

export function getMarsReportPath() {
  return reportPath();
}

export function getMarsReportMeta(): MarsReportMeta {
  const database = db();
  if (cachedMeta) return cachedMeta;
  const unavailable: MarsReportMeta = {
    available: false,
    sourceSystem: 'Synthetic local demo dataset',
    clientTypeCatalogSource: 'unavailable',
    rowCount: 0,
    coverageFrom: '', minDate: '', maxDate: '', capturedAt: '', latestYear: '', latestPeriod: '',
    years: [], periods: {}, sourceDocumentCount: 0, unavailableDocumentCount: 0,
    options: { branch: [], clientType: [], channelGroup: [], brand: [], subcategoryGroup: [] },
    universe: { companies: COMPANIES, branches: BRANCHES, productGroup: PRODUCT_GROUP, excludedClients: EXCLUDED_CLIENTS },
  };
  if (!database) return unavailable;
  const columns = rows<{ name: string }>(database.prepare('PRAGMA table_info(movements)')).map((row) => row.name);
  if (!columns.includes('client_branch_id')) return unavailable;

  const meta = metadata(database);
  const universe = baseUniverse();
  const profile = database.prepare(`
    SELECT MIN(sale_date) AS minDate, MAX(sale_date) AS maxDate, COUNT(*) AS rowCount
    FROM movements WHERE ${universe.sql}
  `).get(...universe.parameters) as { minDate: string | null; maxDate: string | null; rowCount: number };
  const minDate = profile.minDate ?? '';
  const maxDate = profile.maxDate ?? '';
  if (!minDate || !maxDate) return unavailable;
  const first = marsPeriodForDate(minDate);
  const latest = marsPeriodForDate(maxDate);
  const years = Array.from({ length: latest.year - first.year + 1 }, (_, index) => String(latest.year - index));
  const periods = Object.fromEntries(years.map((yearText) => {
    const year = Number(yearText);
    const values = marsPeriodsForYear(year).filter((period) => year < latest.year || period.period <= latest.period);
    return [yearText, values];
  }));
  const optionQuery = (expression: string) => rows<{ value: string }>(database.prepare(`
    SELECT DISTINCT TRIM(${expression}) AS value FROM movements
    WHERE ${universe.sql} AND TRIM(${expression}) <> '' ORDER BY value COLLATE NOCASE
  `), universe.parameters).map((row) => row.value);
  const availableBrands = new Set(optionQuery('brand'));
  cachedMeta = {
    available: true,
    sourceSystem: meta.get('source_system') ?? unavailable.sourceSystem,
    clientTypeCatalogSource: meta.get('client_type_catalog_source') ?? 'synthetic_catalog',
    rowCount: Number(profile.rowCount ?? 0),
    coverageFrom: meta.get('coverage_from') ?? minDate,
    minDate,
    maxDate,
    capturedAt: meta.get('captured_at') ?? '',
    latestYear: String(latest.year),
    latestPeriod: latest.label,
    years,
    periods,
    sourceDocumentCount: Number(meta.get('source_document_count') ?? 0),
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
    options: {
      branch: optionQuery(branchExpression),
      clientType: optionQuery(clientTypeExpression),
      channelGroup: MARS_CHANNELS,
      brand: MARS_BRANDS.filter((brand) => availableBrands.has(brand)),
      subcategoryGroup: MARS_SUBCATEGORIES,
    },
    universe: { companies: COMPANIES, branches: BRANCHES, productGroup: PRODUCT_GROUP, excludedClients: EXCLUDED_CLIENTS },
  };
  return cachedMeta;
}

export function buildMarsReport(input: Partial<Record<string, unknown>>): MarsReportPayload | null {
  const database = db();
  const meta = getMarsReportMeta();
  if (!database || !meta.available) return null;
  const filters = normalizeFilters(input, meta);
  if (!meta.years.includes(filters.year)) filters.year = meta.latestYear;
  const definitions = meta.periods[filters.year] ?? [];
  if (!definitions.some((period) => period.label === filters.period)) filters.period = definitions.at(-1)?.label ?? meta.latestPeriod;
  for (const key of Object.keys(FILTER_EXPRESSIONS) as MarsFilterKey[]) {
    filters[key] = normalizeMultiFilter(filters[key], meta.options[key]);
  }

  const selected = definitions.find((period) => period.label === filters.period) ?? definitions.at(-1)!;
  const currentEnd = meta.maxDate >= selected.start && meta.maxDate < selected.end ? meta.maxDate : selected.end;
  const isPartial = currentEnd < selected.end;
  const priorPeriod = previousPeriod(selected);
  const priorYear = previousYearPeriod(selected);
  const comparablePriorYearEnd = addDays(priorYear.start, Math.min(daysInclusive(selected.start, currentEnd), priorYear.days) - 1);
  const yearStart = marsPeriodsForYear(selected.year)[0].start;
  const previousYearStart = marsPeriodsForYear(selected.year - 1)[0].start;
  const points = definitions.map((period) => periodPoint(database, filters, period, meta.maxDate));
  const quarters: MarsQuarterPoint[] = ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => {
    const quarterRows = points.filter((point) => point.quarter === quarter);
    return {
      quarter,
      kilos: quarterRows.reduce((sum, point) => sum + point.kilos, 0),
      previousYearKilos: quarterRows.reduce((sum, point) => sum + point.previousYearKilos, 0),
    };
  }).filter((row) => row.kilos !== 0 || row.previousYearKilos !== 0);

  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.maxDate,
    filters,
    selected,
    isPartial,
    elapsedDays: daysInclusive(selected.start, currentEnd),
    current: metric(database, filters, selected.start, currentEnd),
    previousPeriod: metric(database, filters, priorPeriod.start, priorPeriod.end),
    previousYear: metric(database, filters, priorYear.start, priorYear.end),
    ytd: metric(database, filters, yearStart, currentEnd),
    previousYtd: metric(database, filters, previousYearStart, comparablePriorYearEnd),
    periods: points,
    quarters,
    brands: brandRows(database, filters, selected, currentEnd),
  };
}
