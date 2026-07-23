import { describe, expect, it } from 'vitest';
import { calculateInventoryMetrics, catalogParticipationReasons } from './inventory-metrics';

describe('métricas compartidas de inventario', () => {
  it('calcula rotación y cobertura sin redondear antes de dividir', () => {
    const result = calculateInventoryMetrics({ availableUnit1: 10, units90d: 15, masterStatus: 'active', price: 100, unit1: 'UN', capturedAllProducts: true });
    expect(result.monthlyRotation).toBe(5);
    expect(result.coverageMonths).toBe(2);
    expect(result.quality).toBe('reliable');
    expect(result.commercialStatus).toBe('commercializable');
  });

  it('preserva el negativo como alerta sin exponerlo como disponibilidad operativa', () => {
    const result = calculateInventoryMetrics({ availableUnit1: -3, units90d: 12, masterStatus: 'active', price: 100, unit1: 'UN', capturedAllProducts: true });
    expect(result.stockStatus).toBe('negative');
    expect(result.rawAvailableUnit1).toBe(-3);
    expect(result.operationalStock).toBe(0);
    expect(result.coverageMonths).toBeNull();
    expect(result.quality).toBe('attention');
  });

  it('distingue cero observado de fila ausente', () => {
    expect(calculateInventoryMetrics({ availableUnit1: 0, units90d: 0, masterStatus: 'inactive', price: 0, unit1: 'UN', capturedAllProducts: true }).stockStatus).toBe('zero');
    expect(calculateInventoryMetrics({ availableUnit1: null, units90d: 0, masterStatus: 'unknown', price: 0, unit1: '', capturedAllProducts: false }).stockStatus).toBe('unavailable');
  });

  it('explica por qué cada producto participa en el catálogo', () => {
    expect(catalogParticipationReasons({ masterStatus: 'active', soldRecently: true, availableUnit1: 0, availableUnit2: 0 })).toEqual(['active_master', 'recent_sale']);
    expect(catalogParticipationReasons({ masterStatus: 'inactive', soldRecently: false, availableUnit1: 0, availableUnit2: .2 })).toEqual(['nonzero_inventory']);
    expect(catalogParticipationReasons({ masterStatus: 'inactive', soldRecently: false, availableUnit1: 0, availableUnit2: 0 })).toEqual([]);
  });
});
