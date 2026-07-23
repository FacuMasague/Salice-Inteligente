export type StockSignalStatus = 'positive' | 'zero' | 'negative' | 'unavailable';
export type StockSignalQuality = 'reliable' | 'attention' | 'insufficient';
export type ProductCommercialStatus = 'commercializable' | 'not_commercializable' | 'insufficient';
export type CatalogParticipationReason = 'active_master' | 'recent_sale' | 'nonzero_inventory';

export interface InventoryMetricInput {
  availableUnit1: number | null;
  availableUnit2?: number | null;
  units90d: number;
  masterStatus: 'active' | 'inactive' | 'unknown';
  price: number;
  unit1: string;
  unit2?: string;
  capturedAllProducts: boolean;
  duplicateRows?: number;
}

export interface InventoryMetricResult {
  operationalStock: number;
  rawAvailableUnit1: number | null;
  rawAvailableUnit2: number | null;
  stockStatus: StockSignalStatus;
  quality: StockSignalQuality;
  qualityReasons: string[];
  monthlyRotation: number;
  coverageMonths: number | null;
  commercialStatus: ProductCommercialStatus;
}

const finiteOrNull = (value: number | null | undefined) => value != null && Number.isFinite(value) ? value : null;

export function catalogParticipationReasons(input: {
  masterStatus: 'active' | 'inactive' | 'unknown';
  soldRecently: boolean;
  availableUnit1: number | null;
  availableUnit2: number | null;
}): CatalogParticipationReason[] {
  const reasons: CatalogParticipationReason[] = [];
  if (input.masterStatus === 'active') reasons.push('active_master');
  if (input.soldRecently) reasons.push('recent_sale');
  if ((input.availableUnit1 ?? 0) !== 0 || (input.availableUnit2 ?? 0) !== 0) reasons.push('nonzero_inventory');
  return reasons;
}

export function calculateInventoryMetrics(input: InventoryMetricInput): InventoryMetricResult {
  const rawAvailableUnit1 = finiteOrNull(input.availableUnit1);
  const rawAvailableUnit2 = finiteOrNull(input.availableUnit2);
  const stockStatus: StockSignalStatus = rawAvailableUnit1 == null
    ? 'unavailable'
    : rawAvailableUnit1 > 0 ? 'positive' : rawAvailableUnit1 < 0 ? 'negative' : 'zero';
  const qualityReasons: string[] = [];
  if (!input.capturedAllProducts) qualityReasons.push('La captura no incluyó explícitamente los productos sin existencias.');
  if (rawAvailableUnit1 == null) qualityReasons.push('GESI no entregó una fila de existencias para este producto.');
  if (stockStatus === 'negative') qualityReasons.push('GESI informó disponibilidad negativa; se conserva para auditoría y no se usa como stock operativo.');
  if (!input.unit1.trim()) qualityReasons.push('El maestro no informa la unidad primaria de venta.');
  const duplicateRows = input.duplicateRows ?? 0;
  if (duplicateRows > 0) qualityReasons.push(`GESI devolvió ${duplicateRows + 1} filas para el mismo producto y depósito.`);
  const monthlyRotation = Math.max(0, input.units90d) / 3;
  const operationalStock = rawAvailableUnit1 == null ? 0 : Math.max(0, rawAvailableUnit1);
  const coverageMonths = stockStatus === 'positive' && monthlyRotation > 0
    ? operationalStock / monthlyRotation
    : null;
  const quality: StockSignalQuality = rawAvailableUnit1 == null || !input.unit1.trim()
    ? 'insufficient'
    : qualityReasons.length ? 'attention' : 'reliable';
  const commercialStatus: ProductCommercialStatus = input.masterStatus === 'unknown'
    ? 'insufficient'
    : input.masterStatus === 'active' && input.price > 0 ? 'commercializable' : 'not_commercializable';
  return {
    operationalStock,
    rawAvailableUnit1,
    rawAvailableUnit2,
    stockStatus,
    quality,
    qualityReasons,
    monthlyRotation,
    coverageMonths,
    commercialStatus,
  };
}
