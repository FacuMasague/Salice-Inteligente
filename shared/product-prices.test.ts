import { describe, expect, it } from 'vitest';
import { assessPricePerKg, classifyProductPriceAlert, comparePriceValues, effectivePriceSampleIsReliable, effectiveUnitPrice, lastObservedReferenceChange } from './product-prices';

const observation = (price: number | null, units = 10, activeDays = 4) => ({ price, units, activeDays, sales: price ? price * units : 0, buyers: 2 });

describe('reglas compartidas de precios de producto', () => {
  it('calcula el precio efectivo ponderado y variaciones sin inventar una base cero', () => {
    expect(effectiveUnitPrice(1250, 10)).toBe(125);
    expect(comparePriceValues(120, 100)).toMatchObject({ absoluteChange: 20, percentChange: 20, status: 'strong_increase' });
    expect(comparePriceValues(80, 100).status).toBe('strong_decrease');
    expect(comparePriceValues(100, null).status).toBe('new_observed');
    expect(comparePriceValues(null, 100).status).toBe('unavailable');
  });

  it('exige muestra suficiente para alertar por precio efectivo', () => {
    const reference = comparePriceValues(100, 100);
    const effective = comparePriceValues(130, 100);
    expect(effectivePriceSampleIsReliable(observation(130))).toBe(true);
    expect(effectivePriceSampleIsReliable(observation(130, 1, 1))).toBe(false);
    expect(classifyProductPriceAlert({ reference, effective, currentEffective: observation(130), previousEffective: observation(100), pricePerKgStatus: 'reliable' })).toBe('strong_effective_change');
    expect(classifyProductPriceAlert({ reference, effective, currentEffective: observation(130, 1, 1), previousEffective: observation(100), pricePerKgStatus: 'reliable' })).toBe('none');
  });

  it('separa precio por kilo confiable, presentación ambigua y casos donde no corresponde', () => {
    const vector = { alimento_seco: 100 } as never;
    expect(assessPricePerKg({ price: 15000, contentKg: 15, referencePricePerKg: 1000, vector }).status).toBe('reliable');
    expect(assessPricePerKg({ price: 15000, contentKg: null, referencePricePerKg: null, vector }).status).toBe('ambiguous_presentation');
    expect(assessPricePerKg({ price: 15000, contentKg: null, referencePricePerKg: null, vector: { alimento_seco: 0 } as never }).status).toBe('not_applicable');
  });

  it('ubica la última modificación real entre snapshots', () => {
    expect(lastObservedReferenceChange([
      { snapshotAt: '2026-07-20T10:00:00Z', referencePrice: 100 },
      { snapshotAt: '2026-07-21T10:00:00Z', referencePrice: 100 },
      { snapshotAt: '2026-07-22T10:00:00Z', referencePrice: 115 },
      { snapshotAt: '2026-07-22T12:00:00Z', referencePrice: 115 },
    ])).toBe('2026-07-22T10:00:00Z');
  });
});
