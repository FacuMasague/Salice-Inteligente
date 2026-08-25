import { describe, expect, it } from 'vitest';
import type { Product } from './models';
import { hasWarehousePhysicalStock, productAvailableStock, productCommittedStock, productWarehouseStock } from './product-stock';

const product = {
  stock: 488,
  warehouseStock: 531,
  inventory: {
    rawPhysicalUnit1: 531,
    rawAvailableUnit1: 488,
    stockBasis: 'warehouse_physical',
  },
} as Product;

describe('lectura compatible del stock de producto', () => {
  it('separa existencia física, disponibilidad y compromiso', () => {
    expect(productWarehouseStock(product)).toBe(531);
    expect(productAvailableStock(product)).toBe(488);
    expect(productCommittedStock(product)).toBe(43);
    expect(hasWarehousePhysicalStock(product)).toBe(true);
  });

  it('prioriza los pedidos pendientes informados por la fuente', () => {
    const withSourcePending = { ...product, inventory: { ...product.inventory, rawPendingUnit1: 41 } } as Product;
    expect(productCommittedStock(withSourcePending)).toBe(41);
  });

  it('usa la disponibilidad cruda en snapshots anteriores', () => {
    const legacy = { ...product, stock: 17, warehouseStock: undefined, inventory: { ...product.inventory, rawPhysicalUnit1: undefined, rawAvailableUnit1: 17, stockBasis: undefined } } as Product;
    expect(productWarehouseStock(legacy)).toBe(17);
    expect(productAvailableStock(legacy)).toBe(17);
    expect(hasWarehousePhysicalStock(legacy)).toBe(false);
  });

  it('no certifica como física una cifra marcada explícitamente como fallback', () => {
    const fallback = { ...product, inventory: { ...product.inventory, rawPhysicalUnit1: 17, stockBasis: 'available_fallback' } } as Product;
    expect(hasWarehousePhysicalStock(fallback)).toBe(false);
  });

  it('no expone cantidades negativas como stock utilizable', () => {
    const negative = { ...product, stock: -4, warehouseStock: -2, inventory: { ...product.inventory, rawPhysicalUnit1: -2, rawAvailableUnit1: -4 } } as Product;
    expect(productWarehouseStock(negative)).toBe(0);
    expect(productAvailableStock(negative)).toBe(0);
  });

  it('deriva el compromiso sólo como compatibilidad cuando el paquete no lo informa', () => {
    const withoutPending = { ...product, inventory: { ...product.inventory, rawPendingUnit1: undefined } } as Product;
    expect(productCommittedStock(withoutPending)).toBe(43);
  });
});
