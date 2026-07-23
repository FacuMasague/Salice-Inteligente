import type { DatabaseSync } from 'node:sqlite';
import type { Product } from '../shared/models.js';
import {
  classifyDemandStability,
  classifyDemandTrend,
  daysBetweenDemandDates,
  demandExplanation,
  demandHistoryStatus,
  demandPeriodRanges,
  demandVariation,
  shiftIsoDate,
  type DemandDimension,
  type DemandPeriodMetrics,
  type DemandWindowDays,
  type ProductDemandPayload,
  type ProductDemandRow,
} from '../shared/product-demand.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

type CatalogProduct = Pick<Product, 'id' | 'sku' | 'name' | 'brand' | 'family' | 'group'>;

interface RawDemandRow {
  id: string;
  currentUnits: number;
  previousUnits: number;
  currentSales: number;
  previousSales: number;
  currentBuyers: number;
  previousBuyers: number;
  currentActiveDays: number;
  previousActiveDays: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  segment1: number;
  segment2: number;
  segment3: number;
}

const source = new ReloadableReadonlyDatabase(() => resolveActiveDataPaths().commercial);
const validWindows = new Set<DemandWindowDays>([30, 90, 180]);
const validDimensions = new Set<DemandDimension>(['product', 'brand', 'family', 'group']);
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

const dimensionConfig: Record<DemandDimension, { expression: string; fallback: string; productValue: (product: CatalogProduct) => string }> = {
  product: { expression: 'product_id', fallback: '', productValue: (product) => product.id },
  brand: { expression: "COALESCE(NULLIF(TRIM(brand), ''), 'Sin marca informada')", fallback: 'Sin marca informada', productValue: (product) => product.brand || 'Sin marca informada' },
  family: { expression: "COALESCE(NULLIF(TRIM(category), ''), 'Sin clasificar')", fallback: 'Sin clasificar', productValue: (product) => product.family || 'Sin clasificar' },
  group: { expression: "COALESCE(NULLIF(TRIM(product_group), ''), 'Sin grupo informado')", fallback: 'Sin grupo informado', productValue: (product) => product.group || 'Sin grupo informado' },
};

function readMeta(database: DatabaseSync) {
  return new Map((database.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[]).map((row) => [row.key, row.value]));
}

function emptyMetrics(): DemandPeriodMetrics {
  return { units: 0, sales: 0, buyers: 0, activeDays: 0 };
}

function parseParameters(query: Record<string, unknown>) {
  const requestedWindow = Number(query.window ?? 90) as DemandWindowDays;
  const requestedDimension = String(query.dimension ?? 'product') as DemandDimension;
  return {
    windowDays: validWindows.has(requestedWindow) ? requestedWindow : 90,
    dimension: validDimensions.has(requestedDimension) ? requestedDimension : 'product',
  };
}

function catalogEntities(products: CatalogProduct[], dimension: DemandDimension) {
  const config = dimensionConfig[dimension];
  const result = new Map<string, { label: string; detail: string; productCount: number }>();
  for (const product of products) {
    const id = config.productValue(product).trim() || config.fallback;
    const current = result.get(id);
    if (current) current.productCount += 1;
    else result.set(id, {
      label: dimension === 'product' ? product.name : id,
      detail: dimension === 'product' ? `${product.sku} · ${product.brand} · ${product.family}` : '',
      productCount: 1,
    });
  }
  return result;
}

function summaryMetrics(database: DatabaseSync, from: string, through: string, productIds: string[]): DemandPeriodMetrics {
  if (!productIds.length) return emptyMetrics();
  const placeholders = productIds.map(() => '?').join(',');
  const row = database.prepare(`
    SELECT COALESCE(SUM(units), 0) units, COALESCE(SUM(net_amount), 0) sales,
      COUNT(DISTINCT client_id) buyers, COUNT(DISTINCT sale_date) activeDays
    FROM movements
    WHERE company_id = 3 AND branch_id = 3 AND source_kind = 'invoice' AND units > 0
      AND sale_date BETWEEN ? AND ? AND product_id IN (${placeholders})
  `).get(from, through, ...productIds) as Partial<DemandPeriodMetrics>;
  return { units: round(Number(row.units ?? 0)), sales: round(Number(row.sales ?? 0)), buyers: Number(row.buyers ?? 0), activeDays: Number(row.activeDays ?? 0) };
}

export function buildProductDemandAnalysisFromDatabase(database: DatabaseSync, products: CatalogProduct[], query: Record<string, unknown> = {}): ProductDemandPayload {
  const { windowDays, dimension } = parseParameters(query);
  const meta = readMeta(database);
  const sourceMaxDate = meta.get('max_date') ?? '';
  const coverageFrom = meta.get('coverage_from') || meta.get('min_date') || '';
  if (!sourceMaxDate) throw new Error('La base comercial no declara una fecha máxima.');
  const ranges = demandPeriodRanges(sourceMaxDate, windowDays);
  const historyStatus = demandHistoryStatus(coverageFrom, ranges);
  const entities = catalogEntities(products, dimension);
  const productIds = [...new Set(products.map((product) => product.id))];
  const placeholders = productIds.map(() => '?').join(',');
  const config = dimensionConfig[dimension];
  const segmentDays = windowDays / 3;
  const segment1Through = shiftIsoDate(ranges.current.from, segmentDays - 1);
  const segment2From = shiftIsoDate(segment1Through, 1);
  const segment2Through = shiftIsoDate(segment2From, segmentDays - 1);
  const segment3From = shiftIsoDate(segment2Through, 1);
  const positive = "source_kind = 'invoice' AND units > 0";
  const rawRows = productIds.length ? database.prepare(`
    SELECT ${config.expression} id,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN units ELSE 0 END), 0) currentUnits,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN units ELSE 0 END), 0) previousUnits,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN net_amount ELSE 0 END), 0) currentSales,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN net_amount ELSE 0 END), 0) previousSales,
      COUNT(DISTINCT CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN client_id END) currentBuyers,
      COUNT(DISTINCT CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN client_id END) previousBuyers,
      COUNT(DISTINCT CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN sale_date END) currentActiveDays,
      COUNT(DISTINCT CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN sale_date END) previousActiveDays,
      MIN(CASE WHEN ${positive} THEN sale_date END) firstSaleAt,
      MAX(CASE WHEN ${positive} THEN sale_date END) lastSaleAt,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN units ELSE 0 END), 0) segment1,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN units ELSE 0 END), 0) segment2,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN units ELSE 0 END), 0) segment3
    FROM movements
    WHERE company_id = 3 AND branch_id = 3 AND product_id IN (${placeholders})
    GROUP BY ${config.expression}
  `).all(
    ranges.current.from, ranges.current.through,
    ranges.previous.from, ranges.previous.through,
    ranges.current.from, ranges.current.through,
    ranges.previous.from, ranges.previous.through,
    ranges.current.from, ranges.current.through,
    ranges.previous.from, ranges.previous.through,
    ranges.current.from, ranges.current.through,
    ranges.previous.from, ranges.previous.through,
    ranges.current.from, segment1Through,
    segment2From, segment2Through,
    segment3From, ranges.current.through,
    ...productIds,
  ) as unknown as RawDemandRow[] : [];
  const rawById = new Map(rawRows.map((row) => [String(row.id || config.fallback), row]));

  const rows: ProductDemandRow[] = [...entities.entries()].map(([id, entity]) => {
    const raw = rawById.get(id);
    const current = raw ? { units: round(Number(raw.currentUnits)), sales: round(Number(raw.currentSales)), buyers: Number(raw.currentBuyers), activeDays: Number(raw.currentActiveDays) } : emptyMetrics();
    const previous = raw ? { units: round(Number(raw.previousUnits)), sales: round(Number(raw.previousSales)), buyers: Number(raw.previousBuyers), activeDays: Number(raw.previousActiveDays) } : emptyMetrics();
    const firstSaleAt = raw?.firstSaleAt ?? '';
    const lastSaleAt = raw?.lastSaleAt ?? '';
    const variationPercent = demandVariation(current.units, previous.units);
    const trend = classifyDemandTrend({ currentUnits: current.units, previousUnits: previous.units, firstSaleAt, currentFrom: ranges.current.from, historyStatus });
    const stabilityResult = classifyDemandStability(raw ? [Number(raw.segment1), Number(raw.segment2), Number(raw.segment3)] : [0, 0, 0]);
    const row: ProductDemandRow = {
      id, label: entity.label, detail: entity.detail || `${entity.productCount.toLocaleString('es-AR')} producto${entity.productCount === 1 ? '' : 's'} del catálogo`, dimension, productCount: entity.productCount,
      current, previous,
      rotationPer30Days: round(current.units / windowDays * 30),
      previousRotationPer30Days: round(previous.units / windowDays * 30),
      variationPercent: variationPercent == null ? null : round(variationPercent, 1),
      trend,
      stability: stabilityResult.status,
      stabilityCoefficient: stabilityResult.coefficient == null ? null : round(stabilityResult.coefficient, 3),
      activeSubperiods: stabilityResult.activeSubperiods,
      firstSaleAt,
      lastSaleAt,
      daysSinceLastSale: daysBetweenDemandDates(lastSaleAt, sourceMaxDate),
      historyStatus,
      explanation: '',
    };
    row.explanation = demandExplanation({ ...row, windowDays });
    return row;
  });
  const current = summaryMetrics(database, ranges.current.from, ranges.current.through, productIds);
  const previous = summaryMetrics(database, ranges.previous.from, ranges.previous.through, productIds);

  return {
    generatedAt: new Date().toISOString(),
    sourceSystem: meta.get('source_system') ?? 'GESI API · base comercial',
    coverageFrom,
    sourceMaxDate,
    windowDays,
    dimension,
    currentRange: ranges.current,
    previousRange: ranges.previous,
    historyStatus,
    summary: {
      current,
      previous,
      variationPercent: previous.units > 0 ? round((current.units - previous.units) / previous.units * 100, 1) : null,
      accelerating: rows.filter((row) => row.trend === 'accelerating').length,
      declining: rows.filter((row) => row.trend === 'declining').length,
      newObserved: rows.filter((row) => row.trend === 'new_observed').length,
      withoutDemand: rows.filter((row) => row.trend === 'no_demand').length,
    },
    rows: rows.sort((a, b) => {
      const priority = (row: ProductDemandRow) => row.trend === 'declining' ? 5 : row.trend === 'accelerating' ? 4 : row.trend === 'new_observed' ? 3 : row.trend === 'no_demand' ? 2 : 1;
      return priority(b) - priority(a) || Math.abs(b.variationPercent ?? 0) - Math.abs(a.variationPercent ?? 0) || b.current.units - a.current.units || a.label.localeCompare(b.label, 'es');
    }),
    rules: {
      demand: 'Unidades U1 positivas de facturas con detalle GESI; las notas de crédito no se presentan como demanda.',
      comparison: `Los ${windowDays} días terminados el ${sourceMaxDate} contra los ${windowDays} días inmediatamente anteriores.`,
      acceleration: 'Aceleración desde +20%; caída desde -20%; el intervalo intermedio se considera estable.',
      stability: `Coeficiente de variación sobre tres subperíodos de ${segmentDays} días: estable hasta 0,35; variable hasta 0,75; luego intermitente.`,
      newProducts: 'Nuevo observado significa primera venta dentro de la ventana y base anterior completa; no afirma la fecha de alta del maestro.',
    },
  };
}

export function buildProductDemandAnalysis(products: CatalogProduct[], query: Record<string, unknown> = {}) {
  const opened = source.get();
  return opened ? buildProductDemandAnalysisFromDatabase(opened.database, products, query) : null;
}

export function getProductDemandAnalysisPath() {
  return source.path();
}
