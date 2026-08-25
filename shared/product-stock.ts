import type { Product } from './models.js';

type ProductStockShape = Pick<Product, 'stock' | 'warehouseStock' | 'inventory'>;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Disponibilidad utilizable para decisiones comerciales. Los snapshots previos
 * a v2.1.2 no tenían el campo superior y conservan el valor crudo dentro de la
 * señal de inventario.
 */
export function productAvailableStock(product: ProductStockShape) {
  if (finite(product.inventory?.rawAvailableUnit1)) return Math.max(0, product.inventory.rawAvailableUnit1);
  return Math.max(0, product.stock);
}

/** Existencia física en U1 dentro del almacén configurado. */
export function productWarehouseStock(product: ProductStockShape) {
  if (finite(product.warehouseStock)) return Math.max(0, product.warehouseStock);
  if (finite(product.inventory?.rawPhysicalUnit1)) return Math.max(0, product.inventory.rawPhysicalUnit1);
  return Math.max(0, product.stock);
}

export function productCommittedStock(product: ProductStockShape) {
  if (finite(product.inventory?.rawPendingUnit1)) return Math.max(0, product.inventory.rawPendingUnit1);
  return Math.max(0, productWarehouseStock(product) - productAvailableStock(product));
}

export function hasWarehousePhysicalStock(product: ProductStockShape) {
  if (product.inventory?.stockBasis) return product.inventory.stockBasis === 'warehouse_physical';
  return finite(product.inventory?.rawPhysicalUnit1);
}
