import { describe, expect, it } from 'vitest';
import type { Product } from './models';
import { areCoverageValuesComparable, arePricePerKgComparable, compareProductPair, suggestComparableProducts } from './product-comparison';

const vector = (overrides: Partial<Product['vector']> = {}): Product['vector'] => ({
  perros: 100, gatos: 0, otras_especies: 0, cachorros: 0, adultos: 100, senior: 0,
  tamano_pequeno: 0, tamano_mediano: 100, tamano_grande: 0, premium: 0, economico: 0, natural: 0, granel: 0, promocional: 0,
  alimento_seco: 100, alimento_humedo: 0, snacks: 0, farmacia: 0, antiparasitario: 0, higiene: 0, accesorios: 0, consumo_humano: 0,
  funcional: 0, esterilizados: 0, control_peso: 0, piel_pelaje: 0, salud_urinaria: 0, salud_digestiva: 0, salud_dental: 0,
  sabor_pollo: 0, sabor_carne: 100, sabor_pescado: 0, sabor_cordero: 0,
  ...overrides,
});

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id, sku: id, name: `Producto ${id}`, description: '', family: 'Alimentos balanceados', subcategory: 'Perros adultos', brand: 'Marca', line: 'Adulto', commercialFamily: 'Mercado', group: 'Secos', pack: 'Bolsa 15 kg', unit: 'UN', unitsPerCase: null,
    masterStatus: 'active', commercialStatus: 'commercializable', discontinuationStatus: 'not_reported', catalogParticipation: ['active_master'], price: 15000, contentKg: 15, referencePricePerKg: 1000, pricePosition: 'market', stock: 30, units90d: 90, monthlyUnits: 30, sales90d: 900000, clients90d: 20, lastSaleAt: '2026-07-22', stockCoverageMonths: 1,
    inventory: { capturedAt: '2026-07-22', companyId: 3, branchId: 3, warehouseId: 2, warehouseLabel: 'WPM', completeZeroStockUniverse: true, rawAvailableUnit1: 30, rawAvailableUnit2: 450, unit2: 'KG', unit2PerUnit1: 15, status: 'positive', quality: 'reliable', qualityReasons: [] },
    margin: null, vector: vector(), vectorMeta: { version: '2.2', confidence: 90, sourceCoverage: 90, evidence: {} }, ...overrides,
  };
}

describe('comparador operativo de productos', () => {
  it('separa las seis conclusiones y explica cuándo hay un sustituto cercano', () => {
    const result = compareProductPair(product('A'), product('B', { brand: 'Otra marca', price: 16500, referencePricePerKg: 1100 }));
    expect(result.dimensions.map((item) => item.id)).toEqual(['use', 'classification', 'presentation', 'price', 'commercial', 'confidence']);
    expect(result.dimensions.find((item) => item.id === 'use')?.score).toBe(100);
    expect(result.conclusion).toContain('alternativas cercanas');
  });

  it('no presenta precio por kilo como comparable entre usos diferentes o cuando falta peso', () => {
    const catFood = product('G', { vector: vector({ perros: 0, gatos: 100 }) });
    expect(arePricePerKgComparable([product('P'), catFood])).toBe(false);
    expect(arePricePerKgComparable([product('P'), product('S', { contentKg: null, referencePricePerKg: null })])).toBe(false);
    expect(compareProductPair(product('P'), catFood).dimensions.find((item) => item.id === 'price')?.score).toBeNull();
  });

  it('sugiere primero artículos de uso, categoría y presentación realmente cercanos', () => {
    const seed = product('A');
    const close = product('B', { brand: 'Otra' });
    const far = product('C', { family: 'Accesorios', subcategory: 'Correas', line: 'Paseo', contentKg: null, referencePricePerKg: null, vector: vector({ perros: 0, adultos: 0, tamano_mediano: 0, alimento_seco: 0, accesorios: 100 }) });
    expect(suggestComparableProducts(seed, [far, close, seed])[0]?.product.id).toBe('B');
  });

  it('sólo compara cobertura cuando todos los productos tienen una señal calculable', () => {
    expect(areCoverageValuesComparable([product('A'), product('B')])).toBe(true);
    expect(areCoverageValuesComparable([product('A'), product('B', { stockCoverageMonths: null, monthlyUnits: 0 })])).toBe(false);
  });
});
