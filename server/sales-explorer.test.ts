import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { resolveActiveDataPaths } from './data-bundle';
import { readMovementMetrics } from './report-metrics';
import {
  buildSalesExplorer,
  buildSalesExplorerWhere,
  getSalesExplorerDocument,
  getSalesExplorerMeta,
} from './sales-explorer';

const databasePath = resolveActiveDataPaths().commercial;
const describeWithDatabase = existsSync(databasePath) ? describe : describe.skip;

describeWithDatabase('explorador general de ventas', () => {
  it('publica el universo y todas las dimensiones administrativas requeridas', () => {
    const meta = getSalesExplorerMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI');
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.options.sellers.length).toBeGreaterThan(0);
    expect(meta.options.clients.length).toBeGreaterThan(1_000);
    expect(meta.options.products.length).toBeGreaterThan(1_000);
    expect(meta.options.brands.length).toBeGreaterThan(0);
    expect(meta.options.categories.length).toBeGreaterThan(0);
    expect(meta.options.channels.length).toBeGreaterThan(0);
    expect(meta.options.zones.length).toBeGreaterThan(0);
  });

  it('reconcilia sus indicadores con la consulta canónica bajo los mismos filtros', () => {
    const meta = getSalesExplorerMeta();
    const report = buildSalesExplorer({ from: meta.maxDate, to: meta.maxDate });
    expect(report).not.toBeNull();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const where = buildSalesExplorerWhere(report!.filters);
    const canonical = readMovementMetrics(database, where.sql, where.parameters);
    const documents = Number(database.prepare(`
      SELECT COUNT(DISTINCT source_document_key) AS total FROM movements WHERE ${where.sql}
    `).get(...where.parameters)?.total ?? 0);
    database.close();

    expect(report!.summary.netAmount).toBeCloseTo(canonical.netAmount, 6);
    expect(report!.summary.kilos).toBeCloseTo(canonical.kilos, 6);
    expect(report!.summary.units).toBeCloseTo(canonical.units, 6);
    expect(report!.summary.clients).toBe(canonical.clients);
    expect(report!.summary.documents).toBe(documents);
    expect(report!.summary.averageTicket).toBeCloseTo(canonical.netAmount / documents, 6);
  });

  it('permite recorrer período, cliente o producto y comprobante hasta sus renglones exactos', () => {
    const meta = getSalesExplorerMeta();
    const report = buildSalesExplorer({ from: meta.maxDate, to: meta.maxDate, pageSize: 100 });
    expect(report?.timeline).toHaveLength(1);
    expect(report?.clients.length).toBeGreaterThan(0);
    const client = report!.clients[0];
    const clientReport = buildSalesExplorer({
      from: meta.maxDate,
      to: meta.maxDate,
      client: String(client.clientId),
      pageSize: 100,
    });
    expect(clientReport?.documents.length).toBeGreaterThan(0);
    expect(clientReport?.documents.every((document) => document.clientId === client.clientId)).toBe(true);
    const documentRow = clientReport!.documents[0];
    const detail = getSalesExplorerDocument(documentRow.key);
    expect(detail).not.toBeNull();
    expect(detail?.items).toBe(detail?.lineItems.length);
    expect(detail?.netAmount).toBeCloseTo(detail!.lineItems.reduce((sum, item) => sum + item.netAmount, 0), 6);
    expect(detail?.kilos).toBeCloseTo(detail!.lineItems.reduce((sum, item) => sum + item.kilos, 0), 6);
    expect(detail?.units).toBeCloseTo(detail!.lineItems.reduce((sum, item) => sum + item.units, 0), 6);

    const product = report!.products[0];
    const productReport = buildSalesExplorer({
      from: meta.maxDate,
      to: meta.maxDate,
      product: product.productId,
      pageSize: 100,
    });
    expect(productReport?.summary.netAmount).toBeCloseTo(product.netAmount, 6);
    expect(productReport?.summary.kilos).toBeCloseTo(product.kilos, 6);
    expect(productReport?.documents.length).toBeGreaterThan(0);
    const productDocument = getSalesExplorerDocument(productReport!.documents[0].key);
    expect(productDocument?.lineItems.some((item) => item.productId === product.productId)).toBe(true);
  });
});
