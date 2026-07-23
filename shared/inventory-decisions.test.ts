import { describe, expect, it } from 'vitest';
import type { Product } from './models';
import { classifyInventoryProduct, compareInventoryDecisionPriority, evaluateInventoryReviewLifecycle, inventoryIncidentKind, isInventoryDecisionCandidate, resolveInventoryThresholds, type InventoryAlertReview } from './inventory-decisions';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: '1', sku: 'P-1', name: 'Producto', description: '', family: 'Alimentos', subcategory: '', brand: 'Marca', line: '', commercialFamily: '', group: '', pack: '', unit: 'UN', unitsPerCase: null,
    masterStatus: 'active', commercialStatus: 'commercializable', discontinuationStatus: 'not_reported', catalogParticipation: ['active_master'], price: 100, contentKg: null, referencePricePerKg: null, pricePosition: 'unknown',
    stock: 10, units90d: 30, monthlyUnits: 10, sales90d: 1000, clients90d: 2, lastSaleAt: '2026-07-20', stockCoverageMonths: 1,
    inventory: { capturedAt: '2026-07-22T10:00:00Z', companyId: 3, branchId: 3, warehouseId: 2, warehouseLabel: 'WPM', completeZeroStockUniverse: true, rawAvailableUnit1: 10, rawAvailableUnit2: null, unit2: '', unit2PerUnit1: null, status: 'positive', quality: 'reliable', qualityReasons: [] },
    margin: null, vector: {} as Product['vector'], vectorMeta: { version: '2.1', confidence: 0, sourceCoverage: 0, evidence: {} },
    ...overrides,
  };
}

describe('bandeja de decisión de inventario', () => {
  it('clasifica los umbrales de cobertura sin redondear', () => {
    expect(classifyInventoryProduct(product({ stockCoverageMonths: 0.49 })).status).toBe('critical_coverage');
    expect(classifyInventoryProduct(product({ stockCoverageMonths: 0.5 })).status).toBe('low_coverage');
    expect(classifyInventoryProduct(product({ stockCoverageMonths: 1 })).status).toBe('adequate_coverage');
    expect(classifyInventoryProduct(product({ stockCoverageMonths: 3 })).status).toBe('high_coverage');
  });

  it('prioriza quiebre con demanda, inactividad e incidencias de calidad', () => {
    expect(classifyInventoryProduct(product({ stock: 0, units90d: 12, stockCoverageMonths: null, inventory: { ...product().inventory, status: 'zero', rawAvailableUnit1: 0 } })).status).toBe('no_stock_with_demand');
    expect(classifyInventoryProduct(product({ masterStatus: 'inactive' })).status).toBe('out_of_assortment');
    expect(classifyInventoryProduct(product({ inventory: { ...product().inventory, status: 'negative', quality: 'attention', qualityReasons: ['Disponibilidad negativa.'] } })).status).toBe('insufficient_data');
  });

  it('no confunde falta de historia con stock sin movimiento', () => {
    expect(classifyInventoryProduct(product({ units90d: 0, monthlyUnits: 0, stockCoverageMonths: null, lastSaleAt: '' })).status).toBe('new_or_insufficient_history');
    expect(classifyInventoryProduct(product({ units90d: 0, monthlyUnits: 0, stockCoverageMonths: null })).status).toBe('stock_without_movement');
  });

  it('admite umbrales futuros por familia sin cambiar la política general', () => {
    const resolved = resolveInventoryThresholds('Farmacia', { version: '1.0', general: { criticalBelowMonths: .5, lowBelowMonths: 1, highFromMonths: 3, demandWindowDays: 90 }, familyOverrides: { Farmacia: { highFromMonths: 2 } } });
    expect(resolved.source).toBe('family');
    expect(resolved.thresholds.highFromMonths).toBe(2);
  });

  it('trata discontinuado como excepción humana sin alterar GESI', () => {
    const decision = classifyInventoryProduct(product(), { productId: '1', status: 'reviewed', note: '', exceptionType: 'discontinued', updatedAt: '', updatedBy: '', decisionStatus: 'adequate_coverage', decisionSnapshotAt: '', resolvedAt: null, resolvedSnapshotAt: null, reopenedAt: null, incidentNumber: 1 });
    expect(decision.status).toBe('out_of_assortment');
    expect(decision.explanation).toMatch(/oficina/);
  });

  it('limita la bandeja a productos con stock o rotación reciente', () => {
    expect(isInventoryDecisionCandidate(product({ stock: 1, units90d: 0 }))).toBe(true);
    expect(isInventoryDecisionCandidate(product({ stock: 0, units90d: 1 }))).toBe(true);
    expect(isInventoryDecisionCandidate(product({ stock: 0, units90d: 0 }))).toBe(false);
  });

  it('prioriza no revisados, en revisión, revisados y luego el impacto dentro de cada grupo', () => {
    const noStock = product({ id: 'quiebre', stock: 0, units90d: 30 });
    const critical = product({ id: 'critico', stockCoverageMonths: .2 });
    const low = product({ id: 'bajo', stockCoverageMonths: .7 });
    const reviewedNoStock = { product: noStock, decision: { status: 'no_stock_with_demand' as const }, review: { status: 'reviewed' as const } };
    const inReviewNoStock = { product: noStock, decision: { status: 'no_stock_with_demand' as const }, review: { status: 'in_review' as const } };
    const ordered = [
      reviewedNoStock,
      inReviewNoStock,
      { product: low, decision: { status: 'low_coverage' as const }, review: null },
      { product: critical, decision: { status: 'critical_coverage' as const }, review: null },
      { product: noStock, decision: { status: 'no_stock_with_demand' as const }, review: null },
    ].sort(compareInventoryDecisionPriority);
    expect(ordered.map((row) => row.review?.status ?? 'unreviewed')).toEqual(['unreviewed', 'unreviewed', 'unreviewed', 'in_review', 'reviewed']);
    expect(ordered.slice(0, 3).map((row) => row.product.id)).toEqual(['quiebre', 'critico', 'bajo']);
    expect(ordered.at(-1)?.review?.status).toBe('reviewed');
  });

  it('agrupa variaciones del mismo problema sin reabrir por ruido', () => {
    expect(inventoryIncidentKind('low_coverage')).toBe('shortage');
    expect(inventoryIncidentKind('critical_coverage')).toBe('shortage');
    const review = { status: 'reviewed', exceptionType: 'none', decisionStatus: 'low_coverage', resolvedAt: null } as Pick<InventoryAlertReview, 'status' | 'exceptionType' | 'decisionStatus' | 'resolvedAt'>;
    expect(evaluateInventoryReviewLifecycle(review, 'critical_coverage')).toBe('none');
  });

  it('marca resolución y reapertura cuando el problema desaparece y vuelve', () => {
    const reviewed = { status: 'reviewed', exceptionType: 'none', decisionStatus: 'low_coverage', resolvedAt: null } as Pick<InventoryAlertReview, 'status' | 'exceptionType' | 'decisionStatus' | 'resolvedAt'>;
    expect(evaluateInventoryReviewLifecycle(reviewed, 'adequate_coverage')).toBe('resolved');
    expect(evaluateInventoryReviewLifecycle({ ...reviewed, resolvedAt: '2026-07-23T10:00:00Z' }, 'critical_coverage')).toBe('reopened');
  });

  it('reabre ante una familia de incidencia diferente y respeta discontinuado', () => {
    const reviewed = { status: 'reviewed', exceptionType: 'none', decisionStatus: 'low_coverage', resolvedAt: null } as Pick<InventoryAlertReview, 'status' | 'exceptionType' | 'decisionStatus' | 'resolvedAt'>;
    expect(evaluateInventoryReviewLifecycle(reviewed, 'high_coverage')).toBe('reopened');
    expect(evaluateInventoryReviewLifecycle({ ...reviewed, exceptionType: 'discontinued' }, 'high_coverage')).toBe('none');
  });
});
