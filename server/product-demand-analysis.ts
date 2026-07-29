import type { DatabaseSync } from 'node:sqlite';
import type { Product } from '../shared/models.js';
import { matchesMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
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
  type ProductDemandFilters,
  type DemandWindowDays,
  type ProductDemandPayload,
  type ProductDemandRow,
} from '../shared/product-demand.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

type CatalogProduct = Pick<Product, 'id' | 'sku' | 'name' | 'brand' | 'family' | 'group' | 'line' | 'masterStatus' | 'commercialStatus' | 'stock'>;

interface RawDemandRow {
  id: string;
  currentUnits: number;
  previousUnits: number;
  currentKilos: number;
  previousKilos: number;
  currentMissingKiloProducts: number;
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
  return { units: 0, kilos: 0, sales: 0, buyers: 0, activeDays: 0 };
}

function filterOptions(products: CatalogProduct[]) {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return {
    brands: unique(products.map((product) => product.brand)),
    families: unique(products.map((product) => product.family)),
    groups: unique(products.map((product) => product.group)),
    lines: unique(products.map((product) => product.line)),
  };
}

function parseParameters(query: Record<string, unknown>, products: CatalogProduct[]) {
  const requestedWindow = Number(query.window ?? 90) as DemandWindowDays;
  const requestedDimension = String(query.dimension ?? 'product') as DemandDimension;
  const options = filterOptions(products);
  const availability = ['all', 'stock', 'commercial'].includes(String(query.availability))
    ? String(query.availability) as ProductDemandFilters['availability']
    : 'all';
  return {
    windowDays: validWindows.has(requestedWindow) ? requestedWindow : 90,
    dimension: validDimensions.has(requestedDimension) ? requestedDimension : 'product',
    filters: {
      search: String(query.search ?? '').trim().slice(0, 200),
      brand: normalizeMultiFilter(query.brand, options.brands),
      family: normalizeMultiFilter(query.family, options.families),
      group: normalizeMultiFilter(query.group, options.groups),
      line: normalizeMultiFilter(query.line, options.lines),
      availability,
      masterStatus: normalizeMultiFilter(query.masterStatus, ['active', 'inactive', 'unknown']),
      trend: normalizeMultiFilter(query.trend, ['accelerating', 'stable', 'declining', 'new_observed', 'no_demand', 'insufficient_history']),
      stability: normalizeMultiFilter(query.stability, ['stable', 'variable', 'intermittent', 'insufficient']),
    } satisfies ProductDemandFilters,
    options,
  };
}

function catalogEntities(products: CatalogProduct[], dimension: DemandDimension) {
  const config = dimensionConfig[dimension];
  const result = new Map<string, { label: string; detail: string; productCount: number; productIds: string[] }>();
  for (const product of products) {
    const id = config.productValue(product).trim() || config.fallback;
    const current = result.get(id);
    if (current) { current.productCount += 1; current.productIds.push(product.id); }
    else result.set(id, {
      label: dimension === 'product' ? product.name : id,
      detail: dimension === 'product' ? `${product.sku} · ${product.brand} · ${product.family}` : '',
      productCount: 1,
      productIds: [product.id],
    });
  }
  return result;
}

function summaryMetrics(database: DatabaseSync, from: string, through: string, productIds: string[]): DemandPeriodMetrics {
  if (!productIds.length) return emptyMetrics();
  const placeholders = productIds.map(() => '?').join(',');
  const row = database.prepare(`
    SELECT COALESCE(SUM(units), 0) units, COALESCE(SUM(kilos), 0) kilos, COALESCE(SUM(net_amount), 0) sales,
      COUNT(DISTINCT client_id) buyers, COUNT(DISTINCT sale_date) activeDays
    FROM movements
    WHERE company_id = 3 AND branch_id = 3 AND source_kind = 'invoice' AND units > 0
      AND sale_date BETWEEN ? AND ? AND product_id IN (${placeholders})
  `).get(from, through, ...productIds) as Partial<DemandPeriodMetrics>;
  return { units: round(Number(row.units ?? 0)), kilos: round(Number(row.kilos ?? 0)), sales: round(Number(row.sales ?? 0)), buyers: Number(row.buyers ?? 0), activeDays: Number(row.activeDays ?? 0) };
}

function kiloCoverage(database: DatabaseSync, from: string, through: string, productIds: string[]) {
  if (!productIds.length) return { productsWithSales: 0, productsWithKilos: 0, productsWithoutKilos: 0 };
  const placeholders = productIds.map(() => '?').join(',');
  const row = database.prepare(`
    SELECT COUNT(*) productsWithSales,
      COALESCE(SUM(CASE WHEN missingKiloLines = 0 THEN 1 ELSE 0 END), 0) productsWithKilos
    FROM (
      SELECT product_id,
        SUM(CASE WHEN units > 0 AND kilos <= 0 THEN 1 ELSE 0 END) missingKiloLines
      FROM movements
      WHERE company_id = 3 AND branch_id = 3 AND source_kind = 'invoice' AND units > 0
        AND sale_date BETWEEN ? AND ? AND product_id IN (${placeholders})
      GROUP BY product_id
    )
  `).get(from, through, ...productIds) as { productsWithSales?: number; productsWithKilos?: number };
  const productsWithSales = Number(row.productsWithSales ?? 0);
  const productsWithKilos = Number(row.productsWithKilos ?? 0);
  return { productsWithSales, productsWithKilos, productsWithoutKilos: Math.max(0, productsWithSales - productsWithKilos) };
}

export function buildProductDemandAnalysisFromDatabase(database: DatabaseSync, products: CatalogProduct[], query: Record<string, unknown> = {}): ProductDemandPayload {
  const { windowDays, dimension, filters, options } = parseParameters(query, products);
  const meta = readMeta(database);
  const sourceMaxDate = meta.get('max_date') ?? '';
  const coverageFrom = meta.get('coverage_from') || meta.get('min_date') || '';
  if (!sourceMaxDate) throw new Error('La base comercial no declara una fecha máxima.');
  const ranges = demandPeriodRanges(sourceMaxDate, windowDays);
  const historyStatus = demandHistoryStatus(coverageFrom, ranges);
  const normalizedSearch = filters.search.toLocaleLowerCase('es');
  const filteredProducts = products.filter((product) => (
    matchesMultiFilter(product.brand, filters.brand)
    && matchesMultiFilter(product.family, filters.family)
    && matchesMultiFilter(product.group, filters.group)
    && matchesMultiFilter(product.line, filters.line)
    && matchesMultiFilter(product.masterStatus, filters.masterStatus)
    && (filters.availability === 'all'
      || (filters.availability === 'stock' ? product.stock > 0 : product.commercialStatus === 'commercializable'))
    && (!normalizedSearch || `${product.name} ${product.sku} ${product.brand} ${product.family} ${product.group} ${product.line}`.toLocaleLowerCase('es').includes(normalizedSearch))
  ));
  const entities = catalogEntities(filteredProducts, dimension);
  const productIds = [...new Set(filteredProducts.map((product) => product.id))];
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
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN kilos ELSE 0 END), 0) currentKilos,
      COALESCE(SUM(CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? THEN kilos ELSE 0 END), 0) previousKilos,
      COUNT(DISTINCT CASE WHEN ${positive} AND sale_date BETWEEN ? AND ? AND kilos <= 0 THEN product_id END) currentMissingKiloProducts,
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

  const allRows: ProductDemandRow[] = [...entities.entries()].map(([id, entity]) => {
    const raw = rawById.get(id);
    const current = raw ? { units: round(Number(raw.currentUnits)), kilos: round(Number(raw.currentKilos)), sales: round(Number(raw.currentSales)), buyers: Number(raw.currentBuyers), activeDays: Number(raw.currentActiveDays) } : emptyMetrics();
    const previous = raw ? { units: round(Number(raw.previousUnits)), kilos: round(Number(raw.previousKilos)), sales: round(Number(raw.previousSales)), buyers: Number(raw.previousBuyers), activeDays: Number(raw.previousActiveDays) } : emptyMetrics();
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
      kiloRotationPer30Days: round(current.kilos / windowDays * 30),
      previousKiloRotationPer30Days: round(previous.kilos / windowDays * 30),
      kiloDataStatus: current.units <= 0 || Number(raw?.currentMissingKiloProducts ?? 0) === 0 ? 'available' : 'unavailable',
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
  const rows = allRows.filter((row) => matchesMultiFilter(row.trend, filters.trend) && matchesMultiFilter(row.stability, filters.stability));
  const visibleIds = [...new Set(rows.flatMap((row) => entities.get(row.id)?.productIds ?? []))];
  const current = summaryMetrics(database, ranges.current.from, ranges.current.through, visibleIds);
  const previous = summaryMetrics(database, ranges.previous.from, ranges.previous.through, visibleIds);
  const coverage = kiloCoverage(database, ranges.current.from, ranges.current.through, visibleIds);

  return {
    generatedAt: new Date().toISOString(),
    sourceSystem: meta.get('source_system') ?? 'GESI API · base comercial',
    coverageFrom,
    sourceMaxDate,
    windowDays,
    dimension,
    filters,
    options,
    currentRange: ranges.current,
    previousRange: ranges.previous,
    historyStatus,
    summary: {
      current,
      previous,
      variationPercent: previous.units > 0 ? round((current.units - previous.units) / previous.units * 100, 1) : null,
      kiloVariationPercent: previous.kilos > 0 ? round((current.kilos - previous.kilos) / previous.kilos * 100, 1) : null,
      ...coverage,
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
      demand: 'Unidades U1 y kilos U2 positivos de facturas con detalle GESI; las notas de crédito no se presentan como demanda y los kilos ausentes no se estiman.',
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
