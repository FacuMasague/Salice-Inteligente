import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const operationalPath = resolve(process.cwd(), 'data/spt-gesi.sqlite');
const referencePath = resolve(process.cwd(), 'data/reference/spt-pbix.sqlite');
const outputPath = resolve(process.cwd(), 'data/quality/spt-reconciliation.json');

const SELLERS = ['Ana Ottaviano', 'Andres Dominguez', 'Edgardo Larrea', 'Gonzalo Russian', 'Ignacio Carea', 'Julieta Errecart', 'Reventas'];
const CHANNELS = ['COSTA-RUTA2', 'Especializado', 'Especializado Z2', 'Small Retail', 'Partido de la Costa'];
const GROUPS = ['Baires Masivo', 'Baires SPT', 'CanCat', 'Lokal', 'Nutri Pet', 'Patagonia Pet', 'Pet Nutrition', 'Sanicat', 'Sol Minerales', 'Andacollo', 'BedyWood'];
const SELLER_PAGE_CHANNELS = ['COSTA-RUTA2', 'Distribuidor', 'Especializado', 'Especializado Z2', 'Reventa', 'Reventa2', 'Small Retail', 'Partido de la Costa'];
const SELLER_PAGE_GROUPS = ['Baires Masivo', 'Baires SPT', 'CanCat', 'Drovet', 'Lokal', 'Nutri Pet', 'Patagonia Pet', 'Pet Nutrition', 'Sanicat', 'Andacollo', 'BedyWood', 'Sol Minerales'];
const EXCLUDED_CATEGORIES = ['POP', 'Promociones'];

type Metric = { kilos: number; units: number; netAmount: number; clients: number };
type DeltaRow = {
  saleDate: string;
  productId: string;
  clientId: number;
  seller: string;
  productGroup: string;
  channel: string;
  kilos: number;
  netAmount: number;
};

const placeholders = (values: unknown[]) => values.map(() => '?').join(', ');
const parameters = [3, ...EXCLUDED_CATEGORIES, ...SELLERS, ...CHANNELS, ...GROUPS];
const universeSql = `
  company_id = ?
  AND category NOT IN (${placeholders(EXCLUDED_CATEGORIES)})
  AND seller IN (${placeholders(SELLERS)})
  AND channel IN (${placeholders(CHANNELS)})
  AND product_group COLLATE NOCASE IN (${placeholders(GROUPS)})
`;

function metadata(database: DatabaseSync) {
  return new Map((database.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[])
    .map((row) => [row.key, row.value]));
}

function metric(database: DatabaseSync, start: string, end: string): Metric {
  const row = database.prepare(`
    SELECT COALESCE(SUM(kilos), 0) kilos,
           COALESCE(SUM(units), 0) units,
           COALESCE(SUM(net_amount), 0) netAmount,
           COUNT(DISTINCT client_id) clients
    FROM movements
    WHERE ${universeSql} AND sale_date BETWEEN ? AND ?
  `).get(...parameters, start, end) as Metric;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as Metric;
}

function sellerPageMetric(database: DatabaseSync, start: string, end: string): Metric {
  const row = database.prepare(`
    SELECT COALESCE(SUM(kilos), 0) kilos,
           COALESCE(SUM(units), 0) units,
           COALESCE(SUM(net_amount), 0) netAmount,
           COUNT(DISTINCT client_id) clients
    FROM movements
    WHERE company_id = 3
      AND category NOT IN (${placeholders(EXCLUDED_CATEGORIES)})
      AND TRIM(seller) <> '' AND seller <> 'Administración'
      AND channel IN (${placeholders(SELLER_PAGE_CHANNELS)})
      AND product_group COLLATE NOCASE IN (${placeholders(SELLER_PAGE_GROUPS)})
      AND sale_date BETWEEN ? AND ?
  `).get(...EXCLUDED_CATEGORIES, ...SELLER_PAGE_CHANNELS, ...SELLER_PAGE_GROUPS, start, end) as Metric;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as Metric;
}

function aggregates(database: DatabaseSync, start: string, end: string) {
  const rows = database.prepare(`
    SELECT sale_date saleDate, product_id productId, client_id clientId,
           seller, product_group productGroup, channel,
           SUM(kilos) kilos, SUM(net_amount) netAmount
    FROM movements
    WHERE ${universeSql} AND sale_date BETWEEN ? AND ?
    GROUP BY sale_date, product_id, client_id, seller, product_group, channel
  `).all(...parameters, start, end) as DeltaRow[];
  return new Map(rows.map((row) => [
    [row.saleDate, row.productId, row.clientId, row.seller, row.productGroup.toLocaleLowerCase('es'), row.channel].join('|'),
    { ...row, kilos: Number(row.kilos), netAmount: Number(row.netAmount) },
  ]));
}

const operational = new DatabaseSync(operationalPath, { readOnly: true });
const reference = new DatabaseSync(referencePath, { readOnly: true });
const operationalMeta = metadata(operational);
const referenceMeta = metadata(reference);
const operationalMinDate = operationalMeta.get('min_date') ?? '';
const operationalCoverageFrom = operationalMeta.get('coverage_from') ?? operationalMinDate;
const referenceCutoff = referenceMeta.get('max_date') ?? '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceCutoff)) throw new Error('La referencia PBIX no informa un corte válido.');
const start = `${referenceCutoff.slice(0, 7)}-01`;
const cutoff = new Date(`${referenceCutoff}T00:00:00Z`);
const year = cutoff.getUTCFullYear();
const month = cutoff.getUTCMonth();
const day = cutoff.getUTCDate();
const iso = (value: Date) => value.toISOString().slice(0, 10);
const period = (targetYear: number, targetMonth: number, targetDay: number) => ({
  start: iso(new Date(Date.UTC(targetYear, targetMonth, 1))),
  end: iso(new Date(Date.UTC(targetYear, targetMonth, Math.min(targetDay, new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate())))),
});
const previousMonthDate = new Date(Date.UTC(year, month - 1, 1));
const periods = {
  currentMonth: { start, end: referenceCutoff },
  previousMonth: period(previousMonthDate.getUTCFullYear(), previousMonthDate.getUTCMonth(), day),
  previousYear: period(year - 1, month, day),
  yearToDate: { start: `${year}-01-01`, end: referenceCutoff },
  previousYearToDate: { start: `${year - 1}-01-01`, end: period(year - 1, month, day).end },
};
const comparisons = Object.fromEntries(Object.entries(periods).map(([key, range]) => {
  const api = metric(operational, range.start, range.end);
  const pbix = metric(reference, range.start, range.end);
  return [key, {
    period: range,
    operational: api,
    reference: pbix,
    difference: {
      kilos: api.kilos - pbix.kilos,
      units: api.units - pbix.units,
      netAmount: api.netAmount - pbix.netAmount,
      clients: api.clients - pbix.clients,
    },
  }];
}));
const operationalMetric = metric(operational, start, referenceCutoff);
const referenceMetric = metric(reference, start, referenceCutoff);
const operationalSellerMetric = sellerPageMetric(operational, start, referenceCutoff);
const referenceSellerMetric = sellerPageMetric(reference, start, referenceCutoff);
const apiRows = aggregates(operational, start, referenceCutoff);
const referenceRows = aggregates(reference, start, referenceCutoff);
const deltaRows: DeltaRow[] = [];
for (const key of new Set([...apiRows.keys(), ...referenceRows.keys()])) {
  const api = apiRows.get(key);
  const pbix = referenceRows.get(key);
  const base = api ?? pbix!;
  const kilos = (api?.kilos ?? 0) - (pbix?.kilos ?? 0);
  const netAmount = (api?.netAmount ?? 0) - (pbix?.netAmount ?? 0);
  if (Math.abs(kilos) > 0.000_001 || Math.abs(netAmount) > 0.01) deltaRows.push({ ...base, kilos, netAmount });
}
deltaRows.sort((left, right) => Math.abs(right.kilos) - Math.abs(left.kilos) || Math.abs(right.netAmount) - Math.abs(left.netAmount));

const difference = {
  kilos: operationalMetric.kilos - referenceMetric.kilos,
  units: operationalMetric.units - referenceMetric.units,
  netAmount: operationalMetric.netAmount - referenceMetric.netAmount,
  clients: operationalMetric.clients - referenceMetric.clients,
};
const relativeKilos = referenceMetric.kilos ? Math.abs(difference.kilos / referenceMetric.kilos) : 0;
const relativeNetAmount = referenceMetric.netAmount ? Math.abs(difference.netAmount / referenceMetric.netAmount) : 0;
const result = {
  purpose: 'Conciliar GESI API contra el PBIX sin usar el PBIX como fuente operativa.',
  generatedAt: new Date().toISOString(),
  period: { start, referenceCutoff },
  sources: {
    operational: { path: 'data/spt-gesi.sqlite', kind: operationalMeta.get('source_kind'), capturedAt: operationalMeta.get('captured_at') },
    reference: { path: 'data/reference/spt-pbix.sqlite', kind: referenceMeta.get('source_kind') ?? 'pbix_reference', maxDate: referenceCutoff },
  },
  metrics: { operational: operationalMetric, reference: referenceMetric, difference },
  sellerPageMetrics: {
    operational: operationalSellerMetric,
    reference: referenceSellerMetric,
    difference: {
      kilos: operationalSellerMetric.kilos - referenceSellerMetric.kilos,
      units: operationalSellerMetric.units - referenceSellerMetric.units,
      netAmount: operationalSellerMetric.netAmount - referenceSellerMetric.netAmount,
      clients: operationalSellerMetric.clients - referenceSellerMetric.clients,
    },
  },
  comparisons,
  validation: {
    status: operationalCoverageFrom > periods.previousYearToDate.start
      ? 'current_snapshot_consistent_history_incomplete'
      : difference.clients === 0 && relativeKilos <= 0.001 && relativeNetAmount <= 0.001 ? 'consistent_with_live_snapshot' : 'investigate',
    operationalMinDate,
    operationalCoverageFrom,
    completeHistoricalCoverage: operationalCoverageFrom <= periods.previousYearToDate.start,
    relativeKilos,
    relativeNetAmount,
    note: 'Una diferencia pequeña puede ser correcta si GESI incorporó o modificó documentos después del refresco del PBIX.',
  },
  largestAggregateDifferences: deltaRows.slice(0, 25),
};

operational.close();
reference.close();
await mkdir(resolve(process.cwd(), 'data/quality'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
