import { describe, expect, it } from 'vitest';
import { GESI_PRICE_BATCH_SIZE, priceProductIdBatches } from './price-query.js';

describe('lotes de consulta de precios GESI', () => {
  it('mantiene cada URL dentro del lote operativo seguro sin perder productos', () => {
    const productIDs = Array.from({ length: 101 }, (_, index) => `producto-${index + 1}`);
    const batches = priceProductIdBatches(productIDs);

    expect(batches.map((batch) => batch.length)).toEqual([40, 40, 21]);
    expect(Math.max(...batches.map((batch) => batch.length))).toBe(GESI_PRICE_BATCH_SIZE);
    expect(batches.flat()).toEqual(productIDs);
  });

  it('rechaza tamaños inválidos', () => {
    expect(() => priceProductIdBatches(['producto-1'], 0)).toThrow('entero positivo');
  });
});
