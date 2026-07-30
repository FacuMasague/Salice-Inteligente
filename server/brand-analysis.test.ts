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
        company_id INTEGER, branch_id INTEGER, issuer_name TEXT, client_name TEXT,
        source_kind TEXT, units REAL, kilos REAL, net_amount REAL, client_id INTEGER,
        seller TEXT, branch_seller TEXT
      );
    `);
    const insert = database.prepare("INSERT INTO movements VALUES (?, ?, ?, ?, 3, ?, ?, ?, ?, ?, ?, ?, ?, 'Andres Dominguez', 'Andres Dominguez')");
    const add = (date: string, product: string, productName: string, brand: string, branch: number, issuer: string, clientName: string, kind: string, units: number, kilos: number, amount: number, client: number) => (
      insert.run(date, product, productName, brand, branch, issuer, clientName, kind, units, kilos, amount, client)
    );
    add('2026-07-10', 'A', 'Producto A', 'Marca A', 3, 'Salice Distribuciones S.A.', 'Cliente 1', 'invoice', 10, 20, 1_000, 1);
    add('2026-07-11', 'B', 'Producto B', 'Marca B', 3, 'Salice Distribuciones S.A.', 'Cliente 2', 'invoice', 5, 30, 500, 2);
    add('2026-07-12', 'A', 'Producto A', 'Marca A', 3, 'Salice Distribuciones S.A.', 'Cliente 1', 'credit_note', -2, -4, -200, 1);
    add('2026-07-13', 'X', 'Sin clasificar', '', 3, 'Salice Distribuciones S.A.', 'Cliente 3', 'invoice', 1, 4, 100, 3);
    add('2026-07-14', 'C', 'Producto C', 'Marca C', 6, 'MDQ Alarcon Distribuciones S.A.', 'Cliente 4', 'invoice', 1, 10, 100, 4);
    add('2026-07-15', 'E', 'Excluido', 'Marca excluida', 3, 'Salice Distribuciones S.A.', 'GBA M6 S.A.', 'invoice', 99, 99, 9_900, 5);
    add('2026-07-16', 'I', 'Otro emisor', 'Marca excluida', 3, 'Emisor no permitido', 'Cliente 6', 'invoice', 99, 99, 9_900, 6);
  });

  afterEach(() => database.close());

  it('incluye notas de crédito y la marca ausente en ambos denominadores', () => {
    const result = buildBrandAnalysisFromDatabase(database, [
      { id: 'A', contentKg: 2 },
      { id: 'B', contentKg: 6 },
      { id: 'X', contentKg: 4 },
      { id: 'C', contentKg: 10 },
    ]);
    const brandA = result.brands.find((brand) => brand.name === 'Marca A')!;
    expect(result.totals).toMatchObject({ netAmount: 1_400, kilos: 50, units: 14, buyers: 3 });
    expect(brandA).toMatchObject({ netAmount: 800, kilos: 16, salesSharePercent: 57.14, kiloSharePercent: 32 });
    expect(result.brands.find((brand) => brand.name === 'Sin marca informada')).toMatchObject({ netAmount: 100, kilos: 4 });
    expect(result.brands.some((brand) => brand.name === 'Marca C')).toBe(false);
    expect(result.brands.some((brand) => brand.name === 'Marca excluida')).toBe(false);
    expect(result.brands.reduce((sum, brand) => sum + brand.salesSharePercent, 0)).toBeCloseTo(100, 1);
    expect(result.unavailableDocumentCount).toBe(2);
    expect(result.productsWithoutKiloConversion).toBe(0);
  });
});
