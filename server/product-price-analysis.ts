import type { DatabaseSync } from 'node:sqlite';
import type { Product } from '../shared/models.js';
import { demandPeriodRanges } from '../shared/product-demand.js';
import {
  assessPricePerKg,
  classifyProductPriceAlert,
  comparePriceValues,
  effectiveUnitPrice,
  lastObservedReferenceChange,
  priceChangeExplanation,
  type EffectivePriceObservation,
  type EffectivePricePoint,
  type PriceWindowDays,
  type ProductPriceAnalysisPayload,
  type ProductPriceDetailPayload,
  type ProductPriceRow,
  type ProductPriceSnapshotPoint,
} from '../shared/product-prices.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { listProductPriceSnapshots } from './operational-store.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

interface RawPriceRow {
  productId: string;
  currentUnits: number;
  currentSales: number;
  currentBuyers: number;
  currentActiveDays: number;
  previousUnits: number;
  previousSales: number;
  previousBuyers: number;
  previousActiveDays: number;
}

const source = new ReloadableReadonlyDatabase(() => resolveActiveDataPaths().commercial);
const validWindows = new Set<PriceWindowDays>([30, 90, 180]);
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

function readMeta(database: DatabaseSync) {
  return new Map((database.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[]).map((row) => [row.key, row.value]));
}

function observation(units: unknown, sales: unknown, buyers: unknown, activeDays: unknown): EffectivePriceObservation {
  const normalizedUnits = Math.max(0, Number(units ?? 0));
  const normalizedSales = Math.max(0, Number(sales ?? 0));
  return {
    price: effectiveUnitPrice(normalizedSales, normalizedUnits),
    units: round(normalizedUnits),
    sales: round(normalizedSales),
    buyers: Number(buyers ?? 0),
    activeDays: Number(activeDays ?? 0),
  };
}

function historiesByProduct(history: ProductPriceSnapshotPoint[], snapshotAt: string) {
  const result = new Map<string, ProductPriceSnapshotPoint[]>();
  for (const point of history.filter((item) => item.snapshotAt <= snapshotAt)) {
    const current = result.get(point.productId) ?? [];
    current.push(point);
    result.set(point.productId, current);
  }
  for (const points of result.values()) points.sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
  return result;
}

function rawEffectiveRows(database: DatabaseSync, ranges: ReturnType<typeof demandPeriodRanges>) {
  return database.prepare(`
    SELECT product_id productId,
      COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN units ELSE 0 END), 0) currentUnits,
      COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN net_amount ELSE 0 END), 0) currentSales,
      COUNT(DISTINCT CASE WHEN sale_date BETWEEN ? AND ? THEN client_id END) currentBuyers,
      COUNT(DISTINCT CASE WHEN sale_date BETWEEN ? AND ? THEN sale_date END) currentActiveDays,
      COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN units ELSE 0 END), 0) previousUnits,
      COALESCE(SUM(CASE WHEN sale_date BETWEEN ? AND ? THEN net_amount ELSE 0 END), 0) previousSales,
      COUNT(DISTINCT CASE WHEN sale_date BETWEEN ? AND ? THEN client_id END) previousBuyers,
      COUNT(DISTINCT CASE WHEN sale_date BETWEEN ? AND ? THEN sale_date END) previousActiveDays
    FROM movements
    WHERE company_id = 3 AND branch_id = 3 AND source_kind = 'invoice' AND units > 0 AND net_amount > 0
    GROUP BY product_id
  `).all(
    ranges.current.from, ranges.current.through,
    ranges.current.from, ranges.current.through,
    ranges.current.from, ranges.current.through,
    ranges.current.from, ranges.current.through,
    ranges.previous.from, ranges.previous.through,
    ranges.previous.from, ranges.previous.through,
    ranges.previous.from, ranges.previous.through,
    ranges.previous.from, ranges.previous.through,
  ) as unknown as RawPriceRow[];
}

export function buildProductPriceAnalysisFromDatabase(
  database: DatabaseSync,
  products: Product[],
  history: ProductPriceSnapshotPoint[],
  snapshotAt: string,
  query: Record<string, unknown> = {},
): ProductPriceAnalysisPayload {
  const requestedWindow = Number(query.window ?? 90) as PriceWindowDays;
  const windowDays = validWindows.has(requestedWindow) ? requestedWindow : 90;
  const meta = readMeta(database);
  const sourceMaxDate = meta.get('max_date') ?? snapshotAt.slice(0, 10);
  const coverageFrom = meta.get('coverage_from') || meta.get('min_date') || '';
  if (!sourceMaxDate) throw new Error('La base comercial no declara una fecha máxima.');
  const ranges = demandPeriodRanges(sourceMaxDate, windowDays);
  const rawByProduct = new Map(rawEffectiveRows(database, ranges).map((row) => [String(row.productId), row]));
  const historyByProduct = historiesByProduct(history, snapshotAt);

  const rows: ProductPriceRow[] = products.map((product) => {
    const raw = rawByProduct.get(product.id);
    const currentEffective = raw ? observation(raw.currentUnits, raw.currentSales, raw.currentBuyers, raw.currentActiveDays) : observation(0, 0, 0, 0);
    const previousEffective = raw ? observation(raw.previousUnits, raw.previousSales, raw.previousBuyers, raw.previousActiveDays) : observation(0, 0, 0, 0);
    const points = historyByProduct.get(product.id) ?? [];
    const previousPoint = [...points].reverse().find((point) => point.snapshotAt < snapshotAt);
    const reference = comparePriceValues(product.price > 0 ? product.price : null, previousPoint?.referencePrice ?? null);
    const effective = comparePriceValues(currentEffective.price, previousEffective.price);
    const pricePerKg = assessPricePerKg(product);
    const effectivePricePerKg = pricePerKg.status === 'reliable' && product.contentKg && currentEffective.price
      ? round(currentEffective.price / product.contentKg)
      : null;
    const alert = classifyProductPriceAlert({ reference, effective, currentEffective, previousEffective, pricePerKgStatus: pricePerKg.status });
    const row: ProductPriceRow = {
      id: product.id,
      name: product.name,
      detail: `${product.sku} · ${product.brand} · ${product.family}`,
      reference,
      effective,
      referencePricePerKg: pricePerKg.status === 'reliable' ? product.referencePricePerKg : null,
      effectivePricePerKg,
      pricePerKgStatus: pricePerKg.status,
      pricePerKgExplanation: pricePerKg.explanation,
      currentEffective,
      previousEffective,
      snapshotCount: points.length,
      lastReferenceChangeAt: lastObservedReferenceChange(points),
      alert,
      explanation: '',
    };
    row.explanation = priceChangeExplanation(row);
    return row;
  });

  const priority = (row: ProductPriceRow) => row.alert === 'strong_reference_change' ? 4
    : row.alert === 'strong_effective_change' ? 3
      : row.alert === 'ambiguous_presentation' ? 2
        : row.reference.current == null && row.effective.current == null ? 0 : 1;
  rows.sort((a, b) => priority(b) - priority(a)
    || Math.abs(b.reference.percentChange ?? b.effective.percentChange ?? 0) - Math.abs(a.reference.percentChange ?? a.effective.percentChange ?? 0)
    || a.name.localeCompare(b.name, 'es'));

  return {
    generatedAt: new Date().toISOString(),
    sourceSystem: meta.get('source_system') ?? 'GESI API · precios y facturas',
    sourceMaxDate,
    coverageFrom,
    windowDays,
    currentRange: ranges.current,
    previousRange: ranges.previous,
    summary: {
      products: rows.length,
      withReference: rows.filter((row) => row.reference.current != null).length,
      withEffective: rows.filter((row) => row.currentEffective.price != null).length,
      withReliablePricePerKg: rows.filter((row) => row.pricePerKgStatus === 'reliable').length,
      strongReferenceChanges: rows.filter((row) => row.alert === 'strong_reference_change').length,
      strongEffectiveChanges: rows.filter((row) => row.alert === 'strong_effective_change').length,
      ambiguousPresentations: rows.filter((row) => row.pricePerKgStatus === 'ambiguous_presentation').length,
    },
    rows,
    rules: {
      reference: 'Precio de referencia GESI: mediana positiva del canal especializado 3; si falta, canal general 1 y luego cualquier canal positivo.',
      effective: `Precio efectivo neto por U1: importe neto facturado ÷ unidades U1 positivas en ${windowDays} días, contra los ${windowDays} anteriores.`,
      normalized: 'Precio por kilo sólo con contenido neto por U1 verificable; no se fuerza una conversión en presentaciones ambiguas o no aplicables.',
      alerts: 'Cambio fuerte desde ±15%. El precio efectivo sólo alerta cuando ambos períodos tienen al menos 5 U1 y 3 días con venta.',
      history: 'Cada snapshot GESI aprobado se agrega a una serie append-only en operations.sqlite; una observación previa nunca se sobrescribe.',
    },
  };
}

function effectiveHistory(database: DatabaseSync, productId: string): EffectivePricePoint[] {
  const rows = database.prepare(`
    SELECT SUBSTR(sale_date, 1, 7) period, SUM(net_amount) sales, SUM(units) units,
      COUNT(DISTINCT client_id) buyers, COUNT(DISTINCT sale_date) activeDays
    FROM movements
    WHERE company_id = 3 AND branch_id = 3 AND source_kind = 'invoice'
      AND units > 0 AND net_amount > 0 AND product_id = ?
    GROUP BY SUBSTR(sale_date, 1, 7)
    ORDER BY period
  `).all(productId) as { period: string; sales: number; units: number; buyers: number; activeDays: number }[];
  return rows.map((row) => ({
    period: row.period,
    price: effectiveUnitPrice(Number(row.sales), Number(row.units)) ?? 0,
    units: round(Number(row.units)),
    sales: round(Number(row.sales)),
    buyers: Number(row.buyers),
    activeDays: Number(row.activeDays),
  })).filter((row) => row.price > 0);
}

export function buildProductPriceDetailFromDatabase(
  database: DatabaseSync,
  product: Product,
  history: ProductPriceSnapshotPoint[],
  snapshotAt: string,
  query: Record<string, unknown> = {},
): ProductPriceDetailPayload {
  const analysis = buildProductPriceAnalysisFromDatabase(database, [product], history, snapshotAt, query);
  const snapshotHistory = history.filter((point) => point.productId === product.id && point.snapshotAt <= snapshotAt)
    .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
  const warnings: string[] = [];
  if (analysis.rows[0].pricePerKgStatus !== 'reliable') warnings.push(analysis.rows[0].pricePerKgExplanation);
  if (analysis.rows[0].snapshotCount < 2) warnings.push('Todavía no existen dos snapshots preservados para comparar el precio de referencia.');
  if (analysis.rows[0].currentEffective.price == null) warnings.push(`No hay ventas positivas utilizables en los últimos ${analysis.windowDays} días.`);
  return {
    generatedAt: analysis.generatedAt,
    windowDays: analysis.windowDays,
    row: analysis.rows[0],
    snapshotHistory,
    effectiveHistory: effectiveHistory(database, product.id),
    warnings,
  };
}

export function buildProductPriceAnalysis(products: Product[], snapshotAt: string, query: Record<string, unknown> = {}) {
  const opened = source.get();
  return opened ? buildProductPriceAnalysisFromDatabase(opened.database, products, listProductPriceSnapshots(), snapshotAt, query) : null;
}

export function buildProductPriceDetail(product: Product, snapshotAt: string, query: Record<string, unknown> = {}) {
  const opened = source.get();
  return opened ? buildProductPriceDetailFromDatabase(opened.database, product, listProductPriceSnapshots(product.id), snapshotAt, query) : null;
}

export function getProductPriceAnalysisPath() {
  return source.path();
}
