import type { Product } from './models';

export type InventoryDecisionStatus =
  | 'out_of_assortment'
  | 'insufficient_data'
  | 'new_or_insufficient_history'
  | 'no_stock_with_demand'
  | 'critical_coverage'
  | 'low_coverage'
  | 'adequate_coverage'
  | 'high_coverage'
  | 'stock_without_movement';

export type InventoryReviewStatus = 'unreviewed' | 'in_review' | 'reviewed';
export type InventoryReviewFilter = InventoryReviewStatus;
export type InventoryExceptionType = 'none' | 'seasonal' | 'discontinued' | 'reserved_stock';
export type InventoryIncidentKind = 'shortage' | 'excess' | 'data_quality' | 'history';
export type InventoryReviewEventType = 'review_saved' | 'resolved' | 'reopened';

export interface InventoryThresholds {
  criticalBelowMonths: number;
  lowBelowMonths: number;
  highFromMonths: number;
  demandWindowDays: number;
}

export interface InventoryDecisionPolicy {
  version: '1.0';
  general: InventoryThresholds;
  familyOverrides: Record<string, Partial<InventoryThresholds>>;
}

export interface InventoryAlertReview {
  productId: string;
  status: InventoryReviewStatus;
  note: string;
  exceptionType: InventoryExceptionType;
  updatedAt: string;
  updatedBy: string;
  decisionStatus: InventoryDecisionStatus | null;
  decisionSnapshotAt: string | null;
  resolvedAt: string | null;
  resolvedSnapshotAt: string | null;
  reopenedAt: string | null;
  incidentNumber: number;
}

export interface InventoryAlertReviewEvent {
  id: string;
  productId: string;
  eventType: InventoryReviewEventType;
  reviewStatus: InventoryReviewStatus;
  decisionStatus: InventoryDecisionStatus | null;
  incidentKind: InventoryIncidentKind | null;
  incidentNumber: number;
  note: string;
  exceptionType: InventoryExceptionType;
  snapshotAt: string | null;
  actor: string;
  createdAt: string;
}

export interface InventoryDecision {
  status: InventoryDecisionStatus;
  label: string;
  explanation: string;
  thresholdSource: 'general' | 'family';
  thresholds: InventoryThresholds;
}

export const INVENTORY_DECISION_POLICY: InventoryDecisionPolicy = {
  version: '1.0',
  general: {
    criticalBelowMonths: 0.5,
    lowBelowMonths: 1,
    highFromMonths: 3,
    demandWindowDays: 90,
  },
  familyOverrides: {},
};

export const INVENTORY_DECISION_LABELS: Record<InventoryDecisionStatus, string> = {
  no_stock_with_demand: 'Sin stock con demanda reciente',
  critical_coverage: 'Cobertura crítica',
  low_coverage: 'Cobertura baja',
  adequate_coverage: 'Cobertura adecuada',
  high_coverage: 'Cobertura alta',
  stock_without_movement: 'Stock sin movimiento',
  new_or_insufficient_history: 'Producto nuevo o sin historia suficiente',
  insufficient_data: 'Sin datos suficientes',
  out_of_assortment: 'Fuera de surtido o inactivo',
};

export const INVENTORY_DECISION_ORDER: InventoryDecisionStatus[] = [
  'no_stock_with_demand',
  'critical_coverage',
  'low_coverage',
  'stock_without_movement',
  'high_coverage',
  'adequate_coverage',
  'new_or_insufficient_history',
  'insufficient_data',
  'out_of_assortment',
];

const INVENTORY_REVIEW_PRIORITY: Record<InventoryDecisionStatus, number> = {
  no_stock_with_demand: 0,
  critical_coverage: 1,
  low_coverage: 2,
  insufficient_data: 3,
  stock_without_movement: 4,
  new_or_insufficient_history: 5,
  high_coverage: 6,
  adequate_coverage: 7,
  out_of_assortment: 8,
};

export const INVENTORY_EXCEPTION_LABELS: Record<InventoryExceptionType, string> = {
  none: 'Sin excepción',
  seasonal: 'Estacional',
  discontinued: 'Discontinuado',
  reserved_stock: 'Stock reservado',
};

export const INVENTORY_REVIEW_LABELS: Record<InventoryReviewFilter, string> = {
  unreviewed: 'No revisado',
  in_review: 'En revisión',
  reviewed: 'Revisado',
};

export const INVENTORY_ATTENTION_STATUSES = new Set<InventoryDecisionStatus>([
  'no_stock_with_demand',
  'critical_coverage',
  'low_coverage',
  'high_coverage',
  'stock_without_movement',
  'new_or_insufficient_history',
  'insufficient_data',
]);

export function inventoryIncidentKind(status: InventoryDecisionStatus | null | undefined): InventoryIncidentKind | null {
  if (status === 'no_stock_with_demand' || status === 'critical_coverage' || status === 'low_coverage') return 'shortage';
  if (status === 'high_coverage' || status === 'stock_without_movement') return 'excess';
  if (status === 'insufficient_data') return 'data_quality';
  if (status === 'new_or_insufficient_history') return 'history';
  return null;
}

export function evaluateInventoryReviewLifecycle(
  review: Pick<InventoryAlertReview, 'status' | 'exceptionType' | 'decisionStatus' | 'resolvedAt'>,
  currentDecisionStatus: InventoryDecisionStatus,
): 'none' | 'baseline' | 'resolved' | 'reopened' {
  if (review.status !== 'reviewed' || review.exceptionType === 'discontinued') return 'none';
  if (!review.decisionStatus) return 'baseline';
  const reviewedKind = inventoryIncidentKind(review.decisionStatus);
  const currentKind = inventoryIncidentKind(currentDecisionStatus);
  if (review.resolvedAt) return currentKind ? 'reopened' : 'none';
  if (reviewedKind && !currentKind) return 'resolved';
  if (currentKind && reviewedKind !== currentKind) return 'reopened';
  return 'none';
}

export function inventoryReviewDisplayLabel(review: InventoryAlertReview | null | undefined) {
  if (review?.status === 'unreviewed' && review.reopenedAt) return 'Reabierto';
  return INVENTORY_REVIEW_LABELS[review?.status ?? 'unreviewed'];
}

export function resolveInventoryThresholds(family: string, policy = INVENTORY_DECISION_POLICY) {
  const override = policy.familyOverrides[family];
  return {
    thresholds: { ...policy.general, ...override },
    source: override ? 'family' as const : 'general' as const,
  };
}

export function isInventoryDecisionCandidate(product: Product) {
  return product.stock > 0 || product.units90d > 0;
}

export function compareInventoryDecisionPriority(left: {
  product: Product;
  decision: Pick<InventoryDecision, 'status'>;
  review?: Pick<InventoryAlertReview, 'status'> | null;
}, right: {
  product: Product;
  decision: Pick<InventoryDecision, 'status'>;
  review?: Pick<InventoryAlertReview, 'status'> | null;
}) {
  const reviewPriority = (status?: InventoryReviewStatus) => status === 'reviewed' ? 2 : status === 'in_review' ? 1 : 0;
  const reviewDifference = reviewPriority(left.review?.status) - reviewPriority(right.review?.status);
  if (reviewDifference) return reviewDifference;
  const statusDifference = INVENTORY_REVIEW_PRIORITY[left.decision.status] - INVENTORY_REVIEW_PRIORITY[right.decision.status];
  if (statusDifference) return statusDifference;
  const status = left.decision.status;
  if (status === 'no_stock_with_demand' || status === 'insufficient_data' || status === 'out_of_assortment') {
    const demandDifference = right.product.units90d - left.product.units90d;
    if (demandDifference) return demandDifference;
  }
  if (status === 'critical_coverage' || status === 'low_coverage' || status === 'adequate_coverage') {
    const leftCoverage = left.product.stockCoverageMonths ?? Number.POSITIVE_INFINITY;
    const rightCoverage = right.product.stockCoverageMonths ?? Number.POSITIVE_INFINITY;
    if (leftCoverage !== rightCoverage) return leftCoverage - rightCoverage;
  }
  if (status === 'high_coverage') {
    const coverageDifference = (right.product.stockCoverageMonths ?? 0) - (left.product.stockCoverageMonths ?? 0);
    if (coverageDifference) return coverageDifference;
  }
  if (status === 'stock_without_movement' || status === 'new_or_insufficient_history') {
    const stockDifference = right.product.stock - left.product.stock;
    if (stockDifference) return stockDifference;
  }
  return right.product.units90d - left.product.units90d
    || right.product.stock - left.product.stock
    || left.product.name.localeCompare(right.product.name, 'es');
}

function months(value: number) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

export function classifyInventoryProduct(
  product: Product,
  review?: InventoryAlertReview | null,
  policy = INVENTORY_DECISION_POLICY,
): InventoryDecision {
  const { thresholds, source } = resolveInventoryThresholds(product.family, policy);
  const result = (status: InventoryDecisionStatus, explanation: string): InventoryDecision => ({
    status,
    label: INVENTORY_DECISION_LABELS[status],
    explanation,
    thresholdSource: source,
    thresholds,
  });
  if (product.masterStatus === 'inactive' || review?.exceptionType === 'discontinued') {
    const reason = review?.exceptionType === 'discontinued'
      ? 'La oficina marcó el producto como discontinuado.'
      : 'El maestro del producto está inactivo en el sistema comercial.';
    return result('out_of_assortment', `${reason} La bandeja conserva sus datos históricos y no supone una baja adicional.`);
  }
  if (product.masterStatus === 'unknown' || product.inventory.quality === 'insufficient' || product.inventory.status === 'unavailable' || product.inventory.status === 'negative') {
    const reasons = product.inventory.qualityReasons.length
      ? product.inventory.qualityReasons.join(' ')
      : 'La señal de maestro o existencia no permite una clasificación operativa confiable.';
    return result('insufficient_data', reasons);
  }
  if (product.inventory.status === 'zero' && product.units90d > 0) {
    return result('no_stock_with_demand', `El sistema comercial informa stock igual a cero y se observaron ${product.units90d.toLocaleString('es-AR')} unidades vendidas en los últimos ${thresholds.demandWindowDays} días.`);
  }
  if (product.inventory.status === 'positive' && product.units90d <= 0) {
    if (!product.lastSaleAt) {
      return result('new_or_insufficient_history', `Hay ${product.stock.toLocaleString('es-AR')} unidades disponibles, pero no existe una venta positiva fechada en el historial. No se puede distinguir automáticamente un alta reciente de una falta de historia.`);
    }
    return result('stock_without_movement', `Hay ${product.stock.toLocaleString('es-AR')} unidades disponibles y no se observaron unidades vendidas en los últimos ${thresholds.demandWindowDays} días. La última venta visible es del ${product.lastSaleAt}.`);
  }
  if (product.inventory.status === 'zero') {
    return result('new_or_insufficient_history', `El stock informado es cero y no hay demanda en los últimos ${thresholds.demandWindowDays} días. Sin fecha de alta ni más historia no corresponde asumir quiebre ni discontinuación.`);
  }
  const coverage = product.stockCoverageMonths;
  if (coverage == null) {
    return result('new_or_insufficient_history', 'Hay stock observable, pero la rotación reciente es insuficiente para calcular meses de cobertura.');
  }
  if (coverage < thresholds.criticalBelowMonths) {
    return result('critical_coverage', `La cobertura es ${months(coverage)} meses: menor al umbral crítico de ${months(thresholds.criticalBelowMonths)} meses.`);
  }
  if (coverage < thresholds.lowBelowMonths) {
    return result('low_coverage', `La cobertura es ${months(coverage)} meses: está entre ${months(thresholds.criticalBelowMonths)} y menos de ${months(thresholds.lowBelowMonths)} meses.`);
  }
  if (coverage >= thresholds.highFromMonths) {
    return result('high_coverage', `La cobertura es ${months(coverage)} meses: iguala o supera el umbral alto de ${months(thresholds.highFromMonths)} meses.`);
  }
  return result('adequate_coverage', `La cobertura es ${months(coverage)} meses: está entre ${months(thresholds.lowBelowMonths)} y menos de ${months(thresholds.highFromMonths)} meses.`);
}
