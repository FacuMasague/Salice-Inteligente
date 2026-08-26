export type StockSignalStatus = 'positive' | 'zero' | 'negative' | 'unavailable';
export type StockSignalQuality = 'reliable' | 'attention' | 'insufficient';
export type ProductCommercialStatus = 'commercializable' | 'not_commercializable' | 'insufficient';
export type CatalogParticipationReason = 'active_master' | 'recent_sale' | 'nonzero_inventory';
export type StockBasis = 'warehouse_physical' | 'available_fallback';

export interface InventoryMetricInput {
  physicalUnit1?: number | null;
  physicalUnit2?: number | null;
  availableUnit1: number | null;
  availableUnit2?: number | null;
  pendingUnit1?: number | null;
  pendingUnit2?: number | null;
  units90d: number;
  masterStatus: 'active' | 'inactive' | 'unknown';
  price: number;
  unit1: string;
  unit2?: string;
  capturedAllProducts: boolean;
  duplicateRows?: number;
}

export interface InventoryMetricResult {
  physicalStock: number;
  availableStock: number;
  operationalStock: number;
  rawPhysicalUnit1: number | null;
  rawPhysicalUnit2: number | null;
  rawAvailableUnit1: number | null;
  rawAvailableUnit2: number | null;
  rawPendingUnit1: number | null;
  rawPendingUnit2: number | null;
  physicalStockStatus: StockSignalStatus;
  stockStatus: StockSignalStatus;
  stockBasis: StockBasis;
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
  physicalUnit1?: number | null;
  physicalUnit2?: number | null;
  availableUnit1: number | null;
  availableUnit2: number | null;
}): CatalogParticipationReason[] {
  const reasons: CatalogParticipationReason[] = [];
  if (input.masterStatus === 'active') reasons.push('active_master');
  if (input.soldRecently) reasons.push('recent_sale');
  const unit1 = input.physicalUnit1 ?? input.availableUnit1 ?? 0;
  const unit2 = input.physicalUnit2 ?? input.availableUnit2 ?? 0;
  if (unit1 !== 0 || unit2 !== 0) reasons.push('nonzero_inventory');
  return reasons;
}

export function calculateInventoryMetrics(input: InventoryMetricInput): InventoryMetricResult {
  const rawAvailableUnit1 = finiteOrNull(input.availableUnit1);
  const rawAvailableUnit2 = finiteOrNull(input.availableUnit2);
  const capturedPhysicalUnit1 = finiteOrNull(input.physicalUnit1);
  const capturedPhysicalUnit2 = finiteOrNull(input.physicalUnit2);
  const rawPhysicalUnit1 = capturedPhysicalUnit1 ?? rawAvailableUnit1;
  const rawPhysicalUnit2 = capturedPhysicalUnit2 ?? rawAvailableUnit2;
  const rawPendingUnit1 = finiteOrNull(input.pendingUnit1);
  const rawPendingUnit2 = finiteOrNull(input.pendingUnit2);
  const stockBasis: StockBasis = capturedPhysicalUnit1 == null ? 'available_fallback' : 'warehouse_physical';
  const stockStatus: StockSignalStatus = rawAvailableUnit1 == null
    ? 'unavailable'
    : rawAvailableUnit1 > 0 ? 'positive' : rawAvailableUnit1 < 0 ? 'negative' : 'zero';
  const physicalStockStatus: StockSignalStatus = rawPhysicalUnit1 == null
    ? 'unavailable'
    : rawPhysicalUnit1 > 0 ? 'positive' : rawPhysicalUnit1 < 0 ? 'negative' : 'zero';
  const qualityReasons: string[] = [];
  if (!input.capturedAllProducts) qualityReasons.push('La captura no incluyó explícitamente los productos sin existencias.');
  if (rawAvailableUnit1 == null) qualityReasons.push('GESI no entregó una fila de existencias para este producto.');
  if (capturedPhysicalUnit1 == null && rawAvailableUnit1 != null) qualityReasons.push('La fuente no informó la existencia física; se usa la disponibilidad sólo como compatibilidad.');
  if (physicalStockStatus === 'negative') qualityReasons.push('La fuente informó existencia física negativa; se conserva para auditoría y se muestra cero como stock del almacén.');
  if (stockStatus === 'negative') qualityReasons.push('GESI informó disponibilidad negativa; se conserva para auditoría y no se usa como stock operativo.');
  if (
    capturedPhysicalUnit1 != null
    && rawAvailableUnit1 != null
    && rawPendingUnit1 != null
    && Math.abs(capturedPhysicalUnit1 - rawAvailableUnit1 - rawPendingUnit1) > .01
  ) qualityReasons.push('La existencia física, la disponibilidad y los pedidos pendientes no reconcilian entre sí.');
  if (
    capturedPhysicalUnit2 != null
    && rawAvailableUnit2 != null
    && rawPendingUnit2 != null
    && Math.abs(capturedPhysicalUnit2 - rawAvailableUnit2 - rawPendingUnit2) > .01
  ) qualityReasons.push('La existencia física U2, la disponibilidad U2 y los pedidos pendientes U2 no reconcilian entre sí.');
  if (!input.unit1.trim()) qualityReasons.push('El maestro no informa la unidad primaria de venta.');
  const duplicateRows = input.duplicateRows ?? 0;
  if (duplicateRows > 0) qualityReasons.push(`GESI devolvió ${duplicateRows + 1} filas para el mismo producto y almacén.`);
  const monthlyRotation = Math.max(0, input.units90d) / 3;
  const physicalStock = rawPhysicalUnit1 == null ? 0 : Math.max(0, rawPhysicalUnit1);
  const availableStock = rawAvailableUnit1 == null ? 0 : Math.max(0, rawAvailableUnit1);
  const operationalStock = availableStock;
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
    physicalStock,
    availableStock,
    operationalStock,
    rawPhysicalUnit1,
    rawPhysicalUnit2,
    rawAvailableUnit1,
    rawAvailableUnit2,
    rawPendingUnit1,
    rawPendingUnit2,
    physicalStockStatus,
    stockStatus,
    stockBasis,
    quality,
    qualityReasons,
    monthlyRotation,
    coverageMonths,
    commercialStatus,
  };
}
