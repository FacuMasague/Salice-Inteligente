import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../server/data/demo-snapshot';
import { compareProductVectorVersions } from './product-vector-version-comparison';

describe('comparación versionada de vectores', () => {
  it('exige mayor cobertura y menos contradicciones antes de aprobar v2.2', () => {
    const data = createDemoSnapshot();
    const seed = data.products[0];
    data.products = [
      {
        ...seed,
        id: 'drovet-empty-v21',
        name: 'ACEDAN GOTAS X 10 CC',
        description: '',
        family: 'Sin clasificar',
        subcategory: 'Sin subrubro',
        line: 'Sin línea',
        commercialFamily: 'Sin familia comercial',
        group: 'Drovet',
        pack: 'UN',
        unit: 'UN',
        inventory: { ...seed.inventory, unit2: '', unit2PerUnit1: null },
      },
      {
        ...seed,
        id: 'explicit-multi-species',
        name: 'Suplemento para perros y gatos',
        description: '',
        family: 'Sin clasificar',
        subcategory: 'Sin subrubro',
        line: 'Sin línea',
        commercialFamily: 'Sin familia comercial',
        group: 'Sin grupo',
        pack: 'UN',
        unit: 'UN',
        inventory: { ...seed.inventory, unit2: '', unit2PerUnit1: null },
      },
    ];

    const comparison = compareProductVectorVersions(data);
    expect(comparison.totals).toMatchObject({
      products: 2,
      v21ProductsWithSignals: 1,
      v22ProductsWithSignals: 2,
      v21Contradictions: 1,
      v22Contradictions: 0,
    });
    expect(comparison.criteria).toMatchObject({
      coverageImproved: true,
      contradictionsReduced: true,
      passed: true,
    });
  });
});
