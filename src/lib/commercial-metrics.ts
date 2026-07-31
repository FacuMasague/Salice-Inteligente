import type { Client, Product } from '../../shared/models';

export interface KiloMetric {
  kilos: number;
  knownPurchases: number;
  unavailablePurchases: number;
  complete: boolean;
}

export function productContentById(products: Pick<Product, 'id' | 'contentKg'>[]) {
  return new Map(products.map((product) => [product.id, product.contentKg]));
}

export function clientKilos90d(client: Pick<Client, 'purchases'>, products: Pick<Product, 'id' | 'contentKg'>[] | Map<string, number | null>): KiloMetric {
  const contentById = products instanceof Map ? products : productContentById(products);
  return client.purchases.reduce<KiloMetric>((metric, purchase) => {
    const contentKg = contentById.get(purchase.productId);
    if (contentKg == null || !Number.isFinite(contentKg)) {
      metric.unavailablePurchases += 1;
      metric.complete = false;
      return metric;
    }
    metric.kilos += purchase.quantity * contentKg;
    metric.knownPurchases += 1;
    return metric;
  }, { kilos: 0, knownPurchases: 0, unavailablePurchases: 0, complete: true });
}
