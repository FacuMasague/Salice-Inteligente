import { describe, expect, it } from 'vitest';
import { calculateInventoryMetrics, catalogParticipationReasons } from './inventory-metrics';

describe('métricas compartidas de inventario', () => {
  it('calcula rotación y cobertura sin redondear antes de dividir', () => {
    const result = calculateInventoryMetrics({ physicalUnit1: 12, availableUnit1: 10, pendingUnit1: 2, units90d: 15, masterStatus: 'active', price: 100, unit1: 'UN', capturedAllProducts: true });
    expect(result.physicalStock).toBe(12);
    expect(result.availableStock).toBe(10);
    expect(result.monthlyRotation).toBe(5);
    expect(result.coverageMonths).toBe(2);
    expect(result.stockBasis).toBe('warehouse_physical');
    expect(result.quality).toBe('reliable');
    expect(result.commercialStatus).toBe('commercializable');
  });

  it('preserva el negativo como alerta sin exponerlo como disponibilidad operativa', () => {
    const result = calculateInventoryMetrics({ physicalUnit1: -2, availableUnit1: -3, pendingUnit1: 1, units90d: 12, masterStatus: 'active', price: 100, unit1: 'UN', capturedAllProducts: true });
    expect(result.stockStatus).toBe('negative');
    expect(result.physicalStockStatus).toBe('negative');
    expect(result.rawAvailableUnit1).toBe(-3);
    expect(result.physicalStock).toBe(0);
    expect(result.operationalStock).toBe(0);
    expect(result.coverageMonths).toBeNull();
    expect(result.quality).toBe('attention');
  });

  it('distingue cero observado de fila ausente', () => {
    expect(calculateInventoryMetrics({ availableUnit1: 0, units90d: 0, masterStatus: 'inactive', price: 0, unit1: 'UN', capturedAllProducts: true }).stockStatus).toBe('zero');
    expect(calculateInventoryMetrics({ availableUnit1: null, units90d: 0, masterStatus: 'unknown', price: 0, unit1: '', capturedAllProducts: false }).stockStatus).toBe('unavailable');
  });

  it('mantiene compatibilidad explícita cuando una captura anterior no trae existencia física', () => {
    const result = calculateInventoryMetrics({ availableUnit1: 7, units90d: 0, masterStatus: 'active', price: 100, unit1: 'UN', capturedAllProducts: true });
    expect(result.physicalStock).toBe(7);
    expect(result.availableStock).toBe(7);
    expect(result.stockBasis).toBe('available_fallback');
    expect(result.quality).toBe('attention');
  });

  it('marca una conciliación incoherente sin alterar las cifras determinísticas', () => {
    const result = calculateInventoryMetrics({ physicalUnit1: 20, availableUnit1: 15, pendingUnit1: 3, units90d: 0, masterStatus: 'active', price: 100, unit1: 'UN', capturedAllProducts: true });
    expect(result.physicalStock).toBe(20);
    expect(result.availableStock).toBe(15);
    expect(result.qualityReasons).toContain('La existencia física, la disponibilidad y los pedidos pendientes no reconcilian entre sí.');
  });

  it('explica por qué cada producto participa en el catálogo', () => {
    expect(catalogParticipationReasons({ masterStatus: 'active', soldRecently: true, availableUnit1: 0, availableUnit2: 0 })).toEqual(['active_master', 'recent_sale']);
    expect(catalogParticipationReasons({ masterStatus: 'inactive', soldRecently: false, availableUnit1: 0, availableUnit2: .2 })).toEqual(['nonzero_inventory']);
    expect(catalogParticipationReasons({ masterStatus: 'inactive', soldRecently: false, availableUnit1: 0, availableUnit2: 0 })).toEqual([]);
  });

  it('mantiene en catálogo un producto con existencia física aunque esté totalmente comprometida', () => {
    expect(catalogParticipationReasons({
      masterStatus: 'inactive',
      soldRecently: false,
      physicalUnit1: 5,
      availableUnit1: 0,
      availableUnit2: 0,
    })).toEqual(['nonzero_inventory']);
  });
});
