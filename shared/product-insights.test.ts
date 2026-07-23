import { describe, expect, it } from 'vitest';
import type { Client, Product } from './models';
import { buildProductCommercialInsight, productPresentationLabel, summarizeProductForOffice } from './product-insights';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'P1', sku: 'P1', name: 'Producto', description: '', family: 'Alimentos Balanceados', subcategory: '', brand: 'Marca', line: '', commercialFamily: '', group: '', pack: 'Bolsa 15 kg', unit: 'UN', unitsPerCase: null,
    masterStatus: 'active', commercialStatus: 'commercializable', discontinuationStatus: 'not_reported', catalogParticipation: ['active_master'], price: 10, contentKg: 15, referencePricePerKg: 1, pricePosition: 'premium', stock: 20, units90d: 10, monthlyUnits: 3.33, sales90d: 100, clients90d: 1, lastSaleAt: '2026-07-20', stockCoverageMonths: 6,
    inventory: { capturedAt: '2026-07-22', companyId: 3, branchId: 3, warehouseId: 2, warehouseLabel: 'WPM', completeZeroStockUniverse: true, rawAvailableUnit1: 20, rawAvailableUnit2: null, unit2: '', unit2PerUnit1: null, status: 'positive', quality: 'reliable', qualityReasons: [] },
    margin: null,
    vector: { perros: 100, gatos: 0, otras_especies: 0, cachorros: 0, adultos: 100, senior: 0, tamano_pequeno: 0, tamano_mediano: 0, tamano_grande: 0, premium: 80, economico: 0, natural: 0, granel: 0, promocional: 0, alimento_seco: 100, alimento_humedo: 0, snacks: 0, farmacia: 0, antiparasitario: 0, higiene: 0, accesorios: 0, consumo_humano: 0, funcional: 0, esterilizados: 0, control_peso: 0, piel_pelaje: 0, salud_urinaria: 0, salud_digestiva: 0, salud_dental: 0, sabor_pollo: 0, sabor_carne: 0, sabor_pescado: 0, sabor_cordero: 0 },
    vectorMeta: { version: '2.1', confidence: 90, sourceCoverage: 90, evidence: {} },
    ...overrides,
  };
}

function client(id: number, purchases: Client['purchases']): Client {
  return { id, name: `Cliente ${id}`, tradeName: '', active: true, purchases } as Client;
}

describe('lectura administrativa de producto', () => {
  it('resume solamente atributos con evidencia vectorial', () => {
    expect(summarizeProductForOffice(product())).toBe('Alimento seco para perros adultos, segmento premium.');
    expect(summarizeProductForOffice(product({ vector: { ...product().vector, perros: 0, adultos: 0, premium: 0, alimento_seco: 0 } }))).toBe('Producto de alimentos balanceados.');
  });

  it('prioriza una presentación explícita y usa la equivalencia U2/U1 cuando el embalaje sólo repite la unidad', () => {
    expect(productPresentationLabel(product({ pack: 'Bolsa 15 kg' }))).toBe('Bolsa 15 kg');
    expect(productPresentationLabel(product({ pack: 'UN', unit: 'UN', inventory: { ...product().inventory, unit2: 'KG', unit2PerUnit1: 15 } }))).toBe('15 KG por UN');
  });

  it('construye tres ventanas consecutivas de 30 días y ordena compradores por venta', () => {
    const insight = buildProductCommercialInsight('P1', [
      client(1, [{ productId: 'P1', date: '2026-07-20', quantity: 3, total: 300 }, { productId: 'P1', date: '2026-06-20', quantity: 1, total: 100 }]),
      client(2, [{ productId: 'P1', date: '2026-07-01', quantity: 2, total: 250 }, { productId: 'OTRO', date: '2026-07-21', quantity: 9, total: 900 }]),
    ], '2026-07-22T13:55:00.000Z');
    expect(insight.periods.map((period) => period.sales)).toEqual([0, 100, 550]);
    expect(insight.periods.map((period) => period.buyers)).toEqual([0, 1, 2]);
    expect(insight.buyers.map((buyer) => buyer.client.id)).toEqual([1, 2]);
    expect(insight.trend).toMatchObject({ value: 450, direction: 'up' });
  });

  it('no inventa variación porcentual cuando falta la base anterior', () => {
    const insight = buildProductCommercialInsight('P1', [client(1, [{ productId: 'P1', date: '2026-07-20', quantity: 1, total: 50 }])], '2026-07-22');
    expect(insight.trend).toEqual({ value: null, direction: 'new', label: 'Sin base comparable anterior' });
  });
});
