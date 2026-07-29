import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildProductDemandAnalysisFromDatabase } from './product-demand-analysis';

describe('análisis de demanda y rotación', () => {
  let database: DatabaseSync;
  const products = [
    { id: 'A', sku: 'A', name: 'Producto A', brand: 'Marca 1', family: 'Alimentos', group: 'Perros', line: 'Secos', stock: 10, masterStatus: 'active' as const, commercialStatus: 'commercializable' as const },
    { id: 'B', sku: 'B', name: 'Producto B', brand: 'Marca 1', family: 'Alimentos', group: 'Perros', line: 'Secos', stock: 0, masterStatus: 'active' as const, commercialStatus: 'not_commercializable' as const },
    { id: 'C', sku: 'C', name: 'Producto C', brand: 'Marca 2', family: 'Higiene', group: 'Higiene', line: 'Limpieza', stock: 8, masterStatus: 'active' as const, commercialStatus: 'commercializable' as const },
    { id: 'D', sku: 'D', name: 'Sin movimientos', brand: 'Marca 2', family: 'Higiene', group: 'Higiene', line: 'Limpieza', stock: 0, masterStatus: 'inactive' as const, commercialStatus: 'not_commercializable' as const },
  ];

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO report_meta VALUES ('max_date', '2026-07-22'), ('coverage_from', '2025-01-01'), ('source_system', 'GESI prueba');
      CREATE TABLE movements (
        sale_date TEXT, product_id TEXT, brand TEXT, category TEXT, product_group TEXT,
        company_id INTEGER, branch_id INTEGER, source_kind TEXT, units REAL, kilos REAL, net_amount REAL, client_id INTEGER
      );
    `);
    const insert = database.prepare('INSERT INTO movements VALUES (?, ?, ?, ?, ?, 3, 3, ?, ?, ?, ?, ?)');
    const add = (date: string, product: string, units: number, client: number, kind = 'invoice') => insert.run(date, product, product === 'C' ? 'Marca 2' : 'Marca 1', product === 'C' ? 'Higiene' : 'Alimentos', product === 'C' ? 'Higiene' : 'Perros', kind, units, units * 2, units * 100, client);
    add('2026-06-01', 'A', 10, 1);
    add('2026-06-01', 'B', 10, 1);
    add('2026-06-25', 'A', 4, 1);
    add('2026-07-05', 'A', 6, 2);
    add('2026-07-18', 'A', 5, 1);
    add('2026-07-02', 'B', 5, 1);
    add('2026-07-15', 'C', 3, 2);
    add('2026-07-16', 'A', -2, 1, 'credit_note');
  });

  afterEach(() => database.close());

  it('compara períodos equivalentes, compradores y estabilidad por producto', () => {
    const result = buildProductDemandAnalysisFromDatabase(database, products, { window: '30', dimension: 'product' });
    const a = result.rows.find((row) => row.id === 'A')!;
    const b = result.rows.find((row) => row.id === 'B')!;
    const c = result.rows.find((row) => row.id === 'C')!;
    const d = result.rows.find((row) => row.id === 'D')!;
    expect(a.current.units).toBe(15);
    expect(a.previous.units).toBe(10);
    expect(a.current.buyers).toBe(2);
    expect(a.trend).toBe('accelerating');
    expect(a.stability).toBe('stable');
    expect(b.trend).toBe('declining');
    expect(c.trend).toBe('new_observed');
    expect(d.trend).toBe('no_demand');
  });

  it('agrega compradores sin sumarlos entre productos y conserva entidades sin demanda', () => {
    const result = buildProductDemandAnalysisFromDatabase(database, products, { window: '30', dimension: 'brand' });
    const brand = result.rows.find((row) => row.id === 'Marca 1')!;
    expect(brand.productCount).toBe(2);
    expect(brand.current.units).toBe(20);
    expect(brand.current.buyers).toBe(2);
    expect(result.rows.some((row) => row.id === 'Marca 2')).toBe(true);
  });

  it('expone cobertura parcial en vez de declarar falta de demanda', () => {
    database.prepare("UPDATE report_meta SET value = '2026-07-01' WHERE key = 'coverage_from'").run();
    const result = buildProductDemandAnalysisFromDatabase(database, products, { window: '30', dimension: 'product' });
    expect(result.historyStatus).toBe('partial_current');
    expect(result.rows.every((row) => row.trend === 'insufficient_history')).toBe(true);
  });
});
