import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Product } from '../shared/models';
import type { ProductPriceSnapshotPoint } from '../shared/product-prices';
import { buildProductPriceAnalysisFromDatabase, buildProductPriceDetailFromDatabase } from './product-price-analysis';

const vector = (food = true) => ({ alimento_seco: food ? 100 : 0 } as Product['vector']);
const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id, sku: id, name: `Producto ${id}`, description: '', family: 'Alimentos', subcategory: '', brand: 'Marca', line: '', commercialFamily: '', group: '', pack: 'Bolsa 10 kg', unit: 'UN', unitsPerCase: null,
  masterStatus: 'active', commercialStatus: 'commercializable', discontinuationStatus: 'not_reported', catalogParticipation: ['active_master'], price: 120, contentKg: 10, referencePricePerKg: 12, pricePosition: 'market', stock: 1, units90d: 1, monthlyUnits: 1, sales90d: 120, clients90d: 1, lastSaleAt: '2026-07-22', stockCoverageMonths: 1,
  inventory: { capturedAt: '2026-07-22', companyId: 3, branchId: 3, warehouseId: 2, warehouseLabel: 'WPM', completeZeroStockUniverse: true, rawAvailableUnit1: 1, rawAvailableUnit2: 10, unit2: 'KG', unit2PerUnit1: 10, status: 'positive', quality: 'reliable', qualityReasons: [] },
  margin: null, vector: vector(), vectorMeta: { version: '2.2', confidence: 90, sourceCoverage: 90, evidence: {} }, ...overrides,
});

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE report_meta(key TEXT PRIMARY KEY, value TEXT); INSERT INTO report_meta VALUES ('max_date','2026-07-22'),('min_date','2025-01-01'),('coverage_from','2025-01-01'),('source_system','GESI prueba');
    CREATE TABLE movements(sale_date TEXT, product_id TEXT, net_amount REAL, units REAL, client_id INTEGER, company_id INTEGER, branch_id INTEGER, source_kind TEXT);`);
  const insert = db.prepare('INSERT INTO movements VALUES (?, ?, ?, ?, ?, 3, 3, \'invoice\')');
  for (const [date, amount, units, client] of [
    ['2026-07-01', 780, 6, 1], ['2026-07-10', 520, 4, 2], ['2026-07-20', 260, 2, 3],
    ['2026-06-01', 500, 5, 1], ['2026-06-10', 500, 5, 2], ['2026-06-20', 500, 5, 3],
    ['2026-05-01', 400, 4, 1],
  ] as [string, number, number, number][]) insert.run(date, 'A', amount, units, client);
  return db;
}

const history: ProductPriceSnapshotPoint[] = [
  { snapshotAt: '2026-07-20T10:00:00.000Z', productId: 'A', productName: 'Producto A', referencePrice: 100, effectivePrice90d: 100, effectiveUnits90d: 10, effectiveSales90d: 1000, contentKg: 10, referencePricePerKg: 10, pricePerKgStatus: 'reliable', sourceLabel: 'Prueba' },
  { snapshotAt: '2026-07-22T10:00:00.000Z', productId: 'A', productName: 'Producto A', referencePrice: 120, effectivePrice90d: 110, effectiveUnits90d: 10, effectiveSales90d: 1100, contentKg: 10, referencePricePerKg: 12, pricePerKgStatus: 'reliable', sourceLabel: 'Prueba' },
];

describe('análisis histórico de precios', () => {
  it('separa referencia, efectivo y precio por kilo con cambios reproducibles', () => {
    const db = database();
    const result = buildProductPriceAnalysisFromDatabase(db, [product('A')], history, '2026-07-22T10:00:00.000Z', { window: 30 });
    const row = result.rows[0];
    expect(row.reference).toMatchObject({ current: 120, previous: 100, percentChange: 20, status: 'strong_increase' });
    expect(row.currentEffective.price).toBe(130);
    expect(row.previousEffective.price).toBe(100);
    expect(row.effectivePricePerKg).toBe(13);
    expect(row.lastReferenceChangeAt).toBe('2026-07-22T10:00:00.000Z');
    expect(row.alert).toBe('strong_reference_change');
    db.close();
  });

  it('expone la evolución mensual efectiva y los snapshots preservados', () => {
    const db = database();
    const detail = buildProductPriceDetailFromDatabase(db, product('A'), history, '2026-07-22T10:00:00.000Z', { window: 30 });
    expect(detail.snapshotHistory).toHaveLength(2);
    expect(detail.effectiveHistory.map((point) => point.period)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(detail.warnings).toEqual([]);
    db.close();
  });

  it('advierte una presentación alimenticia ambigua sin fabricar precio por kilo', () => {
    const db = database();
    const ambiguous = product('B', { price: 90, contentKg: null, referencePricePerKg: null, vector: vector(true) });
    const result = buildProductPriceAnalysisFromDatabase(db, [ambiguous], [], '2026-07-22T10:00:00.000Z', { window: 30 });
    expect(result.rows[0]).toMatchObject({ pricePerKgStatus: 'ambiguous_presentation', effectivePricePerKg: null, alert: 'ambiguous_presentation' });
    db.close();
  });
});
