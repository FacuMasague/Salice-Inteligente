import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../server/data/demo-snapshot';
import { analyzeProductVectors } from './product-vector-audit';

describe('auditoría de vectorización', () => {
  it('informa cobertura, contradicciones y cambios entre snapshots', () => {
    const previous = createDemoSnapshot();
    const current = structuredClone(previous);
    current.meta.generatedAt = '2026-07-21T10:00:00.000Z';
    current.products[0].vector.perros = 100;
    current.products[0].vector.gatos = 100;
    current.products[0].referencePricePerKg = 2000;
    previous.products[0].referencePricePerKg = 1000;
    const audit = analyzeProductVectors(current, previous);
    expect(audit.coverageByDimension.perros).toBeGreaterThan(0);
    expect(audit.review.contradictions.some((row) => row.productId === current.products[0].id)).toBe(true);
    expect(audit.totals.changedProducts).toBeGreaterThan(0);
    expect(audit.totals.largePricePerKgChanges).toBe(1);
  });
});
