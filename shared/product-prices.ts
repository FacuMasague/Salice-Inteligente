import type { Product } from './models.js';

export type PriceWindowDays = 30 | 90 | 180;
export type PriceChangeStatus = 'strong_increase' | 'increase' | 'stable' | 'decrease' | 'strong_decrease' | 'new_observed' | 'unavailable';
export type PricePerKgStatus = 'reliable' | 'ambiguous_presentation' | 'not_applicable' | 'no_reference';
export type ProductPriceAlert = 'strong_reference_change' | 'strong_effective_change' | 'ambiguous_presentation' | 'none';

export interface PriceComparison {
  current: number | null;
  previous: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  status: PriceChangeStatus;
}

export interface EffectivePriceObservation {
  price: number | null;
  units: number;
  sales: number;
  buyers: number;
  activeDays: number;
}

export interface ProductPriceSnapshotPoint {
  snapshotAt: string;
  productId: string;
  productName: string;
  referencePrice: number | null;
  effectivePrice90d: number | null;
  effectiveUnits90d: number;
  effectiveSales90d: number;
  contentKg: number | null;
  referencePricePerKg: number | null;
  pricePerKgStatus: PricePerKgStatus;
  sourceLabel: string;
}

export interface EffectivePricePoint {
  period: string;
  price: number;
  units: number;
  sales: number;
  buyers: number;
  activeDays: number;
}

export interface ProductPriceRow {
  id: string;
  name: string;
  detail: string;
  reference: PriceComparison;
  effective: PriceComparison;
  referencePricePerKg: number | null;
  effectivePricePerKg: number | null;
  competitorReferencePricePerKg: number | null;
  competitorPriceSampleSize: number;
  pricePerKgStatus: PricePerKgStatus;
  pricePerKgExplanation: string;
  currentEffective: EffectivePriceObservation;
  previousEffective: EffectivePriceObservation;
  snapshotCount: number;
  lastReferenceChangeAt: string | null;
  alert: ProductPriceAlert;
  explanation: string;
}

export interface ProductPriceAnalysisPayload {
  generatedAt: string;
  sourceSystem: string;
  sourceMaxDate: string;
  coverageFrom: string;
  windowDays: PriceWindowDays;
  currentRange: { from: string; through: string };
  previousRange: { from: string; through: string };
  summary: {
    products: number;
    withReference: number;
    withEffective: number;
    withReliablePricePerKg: number;
    strongReferenceChanges: number;
    strongEffectiveChanges: number;
    ambiguousPresentations: number;
  };
  rows: ProductPriceRow[];
  rules: {
    reference: string;
    effective: string;
    normalized: string;
    alerts: string;
    history: string;
  };
}

export interface ProductPriceDetailPayload {
  generatedAt: string;
  windowDays: PriceWindowDays;
  row: ProductPriceRow;
  snapshotHistory: ProductPriceSnapshotPoint[];
  effectiveHistory: EffectivePricePoint[];
  warnings: string[];
}

export const STRONG_PRICE_CHANGE_PERCENT = 15;
export const EFFECTIVE_PRICE_MIN_UNITS = 5;
export const EFFECTIVE_PRICE_MIN_ACTIVE_DAYS = 3;

const finitePositive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const rounded = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function effectiveUnitPrice(sales: number, units: number) {
  return sales > 0 && units > 0 ? rounded(sales / units) : null;
}

export function comparePriceValues(current: number | null, previous: number | null, strongThreshold = STRONG_PRICE_CHANGE_PERCENT): PriceComparison {
  const currentValue = finitePositive(current);
  const previousValue = finitePositive(previous);
  if (currentValue == null) return { current: null, previous: previousValue, absoluteChange: null, percentChange: null, status: 'unavailable' };
  if (previousValue == null) return { current: currentValue, previous: null, absoluteChange: null, percentChange: null, status: 'new_observed' };
  const absoluteChange = rounded(currentValue - previousValue);
  const percentChange = rounded(absoluteChange / previousValue * 100, 1);
  const status: PriceChangeStatus = percentChange >= strongThreshold ? 'strong_increase'
    : percentChange > 0.1 ? 'increase'
      : percentChange <= -strongThreshold ? 'strong_decrease'
        : percentChange < -0.1 ? 'decrease'
          : 'stable';
  return { current: currentValue, previous: previousValue, absoluteChange, percentChange, status };
}

export function effectivePriceSampleIsReliable(observation: Pick<EffectivePriceObservation, 'price' | 'units' | 'activeDays'>) {
  return observation.price != null && observation.units >= EFFECTIVE_PRICE_MIN_UNITS && observation.activeDays >= EFFECTIVE_PRICE_MIN_ACTIVE_DAYS;
}

export function assessPricePerKg(product: Pick<Product, 'price' | 'contentKg' | 'referencePricePerKg' | 'vector'>): { status: PricePerKgStatus; explanation: string } {
  if (!(product.price > 0)) return { status: 'no_reference', explanation: 'GESI no entregó un precio de referencia positivo.' };
  if (product.contentKg && product.contentKg > 0 && product.referencePricePerKg && product.referencePricePerKg > 0) {
    return { status: 'reliable', explanation: `Contenido neto verificable: ${product.contentKg.toLocaleString('es-AR')} kg por U1.` };
  }
  if ((product.vector?.alimento_seco ?? 0) >= 75) {
    return { status: 'ambiguous_presentation', explanation: 'Es alimento seco, pero la presentación no permite establecer kilos por U1 con suficiente confianza.' };
  }
  return { status: 'not_applicable', explanation: 'La presentación no se expresa de forma confiable por kilo; se conserva el precio por U1.' };
}

export function lastObservedReferenceChange(points: Pick<ProductPriceSnapshotPoint, 'snapshotAt' | 'referencePrice'>[]) {
  const ordered = [...points].sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
  let changedAt: string | null = null;
  for (let index = 1; index < ordered.length; index += 1) {
    const current = finitePositive(ordered[index].referencePrice);
    const previous = finitePositive(ordered[index - 1].referencePrice);
    if (current !== previous && (current == null || previous == null || Math.abs(current - previous) >= 0.01)) changedAt = ordered[index].snapshotAt;
  }
  return changedAt;
}

export function classifyProductPriceAlert(input: {
  reference: PriceComparison;
  effective: PriceComparison;
  currentEffective: EffectivePriceObservation;
  previousEffective: EffectivePriceObservation;
  pricePerKgStatus: PricePerKgStatus;
}): ProductPriceAlert {
  if (input.reference.status === 'strong_increase' || input.reference.status === 'strong_decrease') return 'strong_reference_change';
  if ((input.effective.status === 'strong_increase' || input.effective.status === 'strong_decrease')
    && effectivePriceSampleIsReliable(input.currentEffective) && effectivePriceSampleIsReliable(input.previousEffective)) return 'strong_effective_change';
  if (input.pricePerKgStatus === 'ambiguous_presentation') return 'ambiguous_presentation';
  return 'none';
}

export function priceChangeExplanation(row: Pick<ProductPriceRow, 'alert' | 'reference' | 'effective' | 'pricePerKgExplanation'>) {
  const percent = (value: number | null) => value == null ? 'sin base' : `${value > 0 ? '+' : ''}${value.toLocaleString('es-AR')}%`;
  if (row.alert === 'strong_reference_change') return `El precio de referencia cambió ${percent(row.reference.percentChange)} entre los dos últimos snapshots.`;
  if (row.alert === 'strong_effective_change') return `El precio efectivo neto cambió ${percent(row.effective.percentChange)} frente al período anterior equivalente, con muestra suficiente.`;
  if (row.alert === 'ambiguous_presentation') return row.pricePerKgExplanation;
  if (row.reference.current == null && row.effective.current == null) return 'No hay precio de referencia ni ventas utilizables en la ventana actual.';
  return 'Sin cambios fuertes que requieran alerta con las reglas vigentes.';
}
