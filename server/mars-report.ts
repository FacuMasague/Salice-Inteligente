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
import { daysInclusive, reportingDate, shiftDays as addDays } from './reporting-periods.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { metricRatio as ratio, metricShare, metricVariation } from './report-metrics.js';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = () => process.env.SALICE_SPT_DB_PATH
  ? resolve(process.env.SALICE_SPT_DB_PATH)
  : resolveActiveDataPaths().commercial;

const UNIVERSE = EXECUTABLE_UNIVERSES.mars;
const COMPANIES = [...UNIVERSE.companies];
const BRANCHES = [...UNIVERSE.branches];
const ISSUERS = [...UNIVERSE.allowedIssuers];
const PRODUCT_GROUP = UNIVERSE.includedProductGroups[0];
const EXCLUDED_CLIENTS = [...UNIVERSE.excludedClients];
const MARS_BRANDS = ['Iams', 'Optimum', 'Pedigree', 'Pedigree High Pro', 'Whiskas'];
const MARS_SUBCATEGORIES = ['C&T', 'DRY', 'MUSE', 'SiSe'];
const MARS_CHANNELS = ['Especializado', 'Masivo'];

const SPECIALIZED_CHANNELS = [
  'Consumidor Final', 'COSTA-RUTA2', 'Especial', 'Criadores', 'Distribuidor',
  'Freelance', 'Empleados', 'Especializado', 'Especializado Z2',
  'Especializado Z3', 'Partido de la Costa', 'Refugios', 'Reventa', 'Reventa2',
];
const MASS_CHANNELS = ['On Line', 'Tienda', 'Gastronomico', 'Masivo', 'Premium', 'Saludable', 'Small Retail'];

const branchExpression = `CASE
  WHEN branch_id = 7 THEN 'Bahía Blanca'
  WHEN branch_id = 3 THEN 'Mar del Plata'
  ELSE 'Otros' END`;
const channelExpression = `CASE
  WHEN channel IN (${sqlList(SPECIALIZED_CHANNELS)}) THEN 'Especializado'
  WHEN channel IN (${sqlList(MASS_CHANNELS)}) THEN 'Masivo'
  ELSE channel END`;
const subcategoryExpression = `CASE
  WHEN subcategory = 'C&T' THEN 'C&T'
  WHEN subcategory IN ('Large Bags', 'Small Bags') THEN 'DRY'
  WHEN subcategory = 'Latas' THEN 'MUSE'
  WHEN subcategory = 'Sobrecitos' THEN 'SiSe'
  ELSE subcategory END`;
const clientTypeExpression = `CASE
  WHEN client_type = 'Agro Pet' THEN 'Agro Pet'
  WHEN client_type IN ('Agrostore', 'Forrajeria') THEN 'Agrostore & Forrajeria'
  WHEN client_type = 'AgroVet' THEN 'AgroVet'
  WHEN client_type IN ('Autoservicio', 'Autoservicio (Self Service)') THEN 'Autoservicio Self Service'
  WHEN client_type = 'Breeder' THEN 'Breeder'
  WHEN client_type = 'Cadenas/Mayoristas Regionales' THEN 'Cadenas/Mayoristas Regionales'
  WHEN client_type = 'Canal Exclusivo' THEN 'Canal Exclusivo'
  WHEN client_type = 'Clinic' THEN 'Clinic'
  WHEN client_type = 'Directa' THEN 'Directa'
  WHEN client_type = 'Donaciones' THEN 'Donaciones'
  WHEN client_type = 'Empleados' THEN 'Empleados'
  WHEN client_type = 'Kioscos' THEN 'Kioscos'
  WHEN client_type = 'Mayorista' THEN 'Mayorista'
  WHEN client_type = 'Pet Shop' THEN 'Pet Shop'
  WHEN client_type = 'Ramos Generales' THEN 'Ramos Generales'
  WHEN client_type = 'Refugios' THEN 'Refugios'
  WHEN client_type IN ('Almacenes', 'Colegio', 'Dieteticas', 'Gastronómicos', 'Granjas y Carnicerias', 'Tradicionales (Despensas)') THEN 'Tradicionales (Despensas)'
  WHEN client_type = 'Venta On Line' THEN 'Venta On Line'
  WHEN client_type = 'Vet Shop' THEN 'Vet Shop'
  WHEN client_type = 'Veterinaria' THEN 'Veterinaria'
  ELSE client_type END`;

const FILTER_EXPRESSIONS: Record<MarsFilterKey, string> = {
  branch: branchExpression,
  clientType: clientTypeExpression,
  channelGroup: channelExpression,
  brand: 'brand',
  subcategoryGroup: subcategoryExpression,
};

type SqlValue = string | number;
type MetricRow = { kilos: number | null; netAmount: number | null; accounts: number | null; clientBranches: number | null };

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
  throw new Error(`No se pudo ubicar ${value} en el calendario Mars.`);
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
           COALESCE(SUM(net_amount), 0) AS netAmount,
           COUNT(DISTINCT client_id) AS accounts,
           COUNT(DISTINCT CAST(client_id AS TEXT) || ':' || CAST(client_branch_id AS TEXT)) AS clientBranches
    FROM movements WHERE ${where.sql}
  `).get(...where.parameters) as MetricRow;
  const accounts = Number(row.accounts ?? 0);
  const clientBranches = Number(row.clientBranches ?? 0);
  return {
    kilos: Number(row.kilos ?? 0),
    netAmount: Number(row.netAmount ?? 0),
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
  const currentRows = rows<{ brand: string; kilos: number; netAmount: number; accounts: number; clientBranches: number; clients: number }>(database.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Sin marca' ELSE brand END AS brand,
           COALESCE(SUM(kilos), 0) AS kilos,
           COALESCE(SUM(net_amount), 0) AS netAmount,
           COUNT(DISTINCT client_id) AS accounts,
           COUNT(DISTINCT CAST(client_id AS TEXT) || ':' || CAST(client_branch_id AS TEXT)) AS clientBranches,
           COUNT(DISTINCT ${clientExpression}) AS clients
    FROM movements WHERE ${currentWhere.sql}
    GROUP BY CASE WHEN TRIM(brand) = '' THEN 'Sin marca' ELSE brand END
  `), currentWhere.parameters);
  const previousRows = rows<{ brand: string; kilos: number }>(database.prepare(`
    SELECT CASE WHEN TRIM(brand) = '' THEN 'Sin marca' ELSE brand END AS brand,
           COALESCE(SUM(kilos), 0) AS kilos
    FROM movements WHERE ${previousWhere.sql}
    GROUP BY CASE WHEN TRIM(brand) = '' THEN 'Sin marca' ELSE brand END
  `), previousWhere.parameters);
  const previousMap = new Map(previousRows.map((row) => [row.brand, Number(row.kilos)]));
  const total = currentRows.reduce((sum, row) => sum + Number(row.kilos), 0);
  return currentRows.map((row) => {
    const kilos = Number(row.kilos);
    const previousYearKilos = previousMap.get(row.brand) ?? 0;
    return {
      brand: row.brand,
      kilos,
      netAmount: Number(row.netAmount),
      clients: Number(row.clients),
      accounts: Number(row.accounts),
      clientBranches: Number(row.clientBranches),
      share: metricShare(kilos, total),
      previousYearKilos,
      variation: metricVariation(kilos, previousYearKilos),
    };
  }).filter((row) => Math.abs(row.kilos) > 0.0001).sort((a, b) => b.kilos - a.kilos);
}

function rollingMarsPeriods(selected: MarsPeriodDefinition, count = 13) {
  return [selected.year - 2, selected.year - 1, selected.year]
    .flatMap((year) => marsPeriodsForYear(year))
    .filter((period) => period.year < selected.year || period.period <= selected.period)
    .slice(-count);
}

function marsQuarterSeries(
  database: DatabaseSync,
  filters: MarsFilters,
  selected: MarsPeriodDefinition,
  sourceMaxDate: string,
  coverageFrom: string,
): MarsQuarterPoint[] {
  const groups = new Map<string, MarsPeriodDefinition[]>();
  for (const period of rollingMarsPeriods(selected).filter((candidate) => candidate.end >= coverageFrom)) {
    const key = `${period.year}-${period.quarter}`;
    groups.set(key, [...(groups.get(key) ?? []), period]);
  }

  return [...groups.values()].map((periods) => {
    const first = periods[0];
    const last = periods.at(-1)!;
    const start = first.start < coverageFrom ? coverageFrom : first.start;
    const end = sourceMaxDate >= last.start && sourceMaxDate < last.end ? sourceMaxDate : last.end;
    const naturalPeriods = marsPeriodsForYear(first.year).filter((period) => period.quarter === first.quarter);
    const previousYearPeriods = marsPeriodsForYear(first.year - 1);
    const previousFirst = previousYearPeriods.find((period) => period.period === first.period)!;
    const previousLast = previousYearPeriods.find((period) => period.period === last.period)!;
    const elapsedFirstPeriodDays = Math.max(1, daysInclusive(first.start, start));
    const previousYearStart = addDays(previousFirst.start, Math.min(previousFirst.days, elapsedFirstPeriodDays) - 1);
    const elapsedLastPeriodDays = Math.max(1, daysInclusive(last.start, end));
    const previousYearEnd = addDays(previousLast.start, Math.min(previousLast.days, elapsedLastPeriodDays) - 1);
    const comparisonAvailable = coverageFrom <= previousYearStart;
    const current = metric(database, filters, start, end);
    const previousYear = comparisonAvailable
      ? metric(database, filters, previousYearStart, previousYearEnd)
      : null;
    return {
      quarter: first.quarter,
      label: `${first.quarter} ${first.year}`,
      year: first.year,
      start,
      end,
      isPartial: periods.length < naturalPeriods.length || start > first.start || end < last.end,
      comparisonAvailable,
      kilos: current.kilos,
      netAmount: current.netAmount,
      clients: current.clients,
      previousYearKilos: previousYear?.kilos ?? null,
      previousYearNetAmount: previousYear?.netAmount ?? null,
      variation: previousYear ? metricVariation(current.kilos, previousYear.kilos) : null,
    };
  });
}

export function getMarsReportPath() {
  return reportPath();
}

export function getMarsReportMeta(): MarsReportMeta {
  const database = db();
  if (cachedMeta) return cachedMeta;
  const unavailable: MarsReportMeta = {
    available: false,
    sourceSystem: 'GESI API · facturas, notas de crédito y maestros Salice',
    clientTypeCatalogSource: 'unavailable',
    rowCount: 0,
    coverageFrom: '', minDate: '', maxDate: '', reportingDate: '', capturedAt: '', latestYear: '', latestPeriod: '',
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
  const reportDate = reportingDate(maxDate, meta.get('captured_at') ?? '');
  const first = marsPeriodForDate(minDate);
  const latest = marsPeriodForDate(reportDate);
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
    clientTypeCatalogSource: meta.get('client_type_catalog_source') ?? 'gesi_api',
    rowCount: Number(profile.rowCount ?? 0),
    coverageFrom: meta.get('coverage_from') ?? minDate,
    minDate,
    maxDate,
    reportingDate: reportDate,
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
  const currentEnd = meta.reportingDate >= selected.start && meta.reportingDate < selected.end ? meta.reportingDate : selected.end;
  const isPartial = currentEnd < selected.end;
  const priorPeriod = previousPeriod(selected);
  const priorYear = previousYearPeriod(selected);
  const comparablePriorYearEnd = addDays(priorYear.start, Math.min(daysInclusive(selected.start, currentEnd), priorYear.days) - 1);
  const yearStart = marsPeriodsForYear(selected.year)[0].start;
  const previousYearStart = marsPeriodsForYear(selected.year - 1)[0].start;
  const points = definitions.map((period) => periodPoint(database, filters, period, meta.reportingDate));
  const quarters = marsQuarterSeries(database, filters, selected, meta.reportingDate, meta.coverageFrom);

  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.reportingDate,
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
