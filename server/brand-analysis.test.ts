import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBrandAnalysisFromDatabase } from './brand-analysis';

describe('participación comercial por marca', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO report_meta VALUES
        ('max_date', '2026-07-22'), ('coverage_from', '2025-01-01'),
        ('source_system', 'GESI prueba'), ('unavailable_document_count', '2');
      CREATE TABLE movements (
        sale_date TEXT, product_id TEXT, product_name TEXT, brand TEXT,
        company_id INTEGER, branch_id INTEGER, source_kind TEXT,
        units REAL, kilos REAL, net_amount REAL, client_id INTEGER
      );
    `);
    const insert = database.prepare('INSERT INTO movements VALUES (?, ?, ?, ?, 3, 3, ?, ?, ?, ?, ?)');
    insert.run('2026-07-10', 'A', 'Producto A', 'Marca A', 'invoice', 10, 20, 1_000, 1);
    insert.run('2026-07-11', 'B', 'Producto B', 'Marca B', 'invoice', 5, 30, 500, 2);
    insert.run('2026-07-12', 'A', 'Producto A', 'Marca A', 'credit_note', -2, -4, -200, 1);
    insert.run('2026-07-13', 'X', 'Sin clasificar', '', 'invoice', 1, 4, 100, 3);
  });

  afterEach(() => database.close());

  it('incluye notas de crédito y la marca ausente en ambos denominadores', () => {
    const result = buildBrandAnalysisFromDatabase(database);
    const brandA = result.brands.find((brand) => brand.name === 'Marca A')!;
    expect(result.totals).toMatchObject({ netAmount: 1_400, kilos: 50, units: 14, buyers: 3 });
    expect(brandA).toMatchObject({ netAmount: 800, kilos: 16, salesSharePercent: 57.14, kiloSharePercent: 32 });
    expect(result.brands.find((brand) => brand.name === 'Sin marca informada')).toMatchObject({ netAmount: 100, kilos: 4 });
    expect(result.brands.reduce((sum, brand) => sum + brand.salesSharePercent, 0)).toBeCloseTo(100, 1);
    expect(result.unavailableDocumentCount).toBe(2);
  });
});
