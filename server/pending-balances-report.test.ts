import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPendingBalancesReport, getPendingBalancesReportMeta } from './pending-balances-report';
import { resolveActiveDataPaths } from './data-bundle';

const describeWithDatabase = existsSync(resolveActiveDataPaths().pendingBalances) ? describe : describe.skip;

describeWithDatabase('Saldos Pendientes Salice construido desde GESI', () => {
  it('declara el universo visible y la ventana móvil del reporte', () => {
    const meta = getPendingBalancesReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI');
    expect(meta.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expectedSalesFrom = new Date(`${meta.asOfDate}T12:00:00Z`);
    expectedSalesFrom.setUTCDate(expectedSalesFrom.getUTCDate() - 29);
    expect(meta.salesFrom).toBe(expectedSalesFrom.toISOString().slice(0, 10));
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.universe.branches).toEqual([3]);
    expect(meta.options.sellers).toEqual(['Ana Ottaviano', 'Andres Dominguez', 'Edgardo Larrea', 'Ignacio Carea', 'Julieta Errecart']);
    expect(meta.universe.minimumDocumentOutstanding).toBe(1_000);
    expect(meta.universe.excludedClients).toContain('Consumidor Final');
  });

  it('reconcilia el corte de un vendedor con sus clientes y proporciones', () => {
    const report = buildPendingBalancesReport({ seller: 'Edgardo Larrea' });
    expect(report).not.toBeNull();
    expect(report?.pendingBalance).toBeGreaterThan(0);
    expect(report?.overdueBalance).toBeGreaterThanOrEqual(0);
    expect(report?.pendingBalance).toBeCloseTo(report?.clients.reduce((sum, row) => sum + row.pendingBalance, 0) ?? 0, 2);
    expect(report?.overdueBalance).toBeCloseTo(report?.clients.reduce((sum, row) => sum + row.overdueBalance, 0) ?? 0, 2);
    expect(report?.overdueShare).toBeCloseTo(((report?.overdueBalance ?? 0) / (report?.pendingBalance ?? 1)) * 100, 2);
  });

  it('mantiene coherentes saldo, vencido, plazo y venta móvil por cliente', () => {
    const report = buildPendingBalancesReport({ seller: 'Edgardo Larrea' });
    expect(report?.clients.length).toBeGreaterThan(0);
    for (const client of report?.clients ?? []) {
      expect(client.pendingBalance).toBeGreaterThan(0);
      expect(client.overdueBalance).toBeGreaterThanOrEqual(0);
      expect(client.overdueBalance).toBeLessThanOrEqual(client.pendingBalance + 0.01);
      expect(client.openDocuments).toBeGreaterThan(0);
      expect(client.creditTermTotalDays).toBeGreaterThanOrEqual(0);
      if (client.sales30 === 0) expect(client.overdueToSales30).toBeNull();
      else expect(client.overdueToSales30).toBeCloseTo((client.overdueBalance / client.sales30) * 100, 2);
    }
  });

  it('recalcula tarjetas, vendedores y clientes con filtros operativos', () => {
    const full = buildPendingBalancesReport({});
    const overdue = buildPendingBalancesReport({ paymentMethod: 'CTA CTE 30 DIAS', status: 'overdue' });
    expect(overdue?.filters).toMatchObject({ paymentMethod: 'CTA CTE 30 DIAS', status: 'overdue' });
    expect(overdue?.clients.every((row) => row.paymentMethod === 'CTA CTE 30 DIAS' && row.overdueBalance > 0)).toBe(true);
    expect(overdue?.sellers.reduce((sum, row) => sum + row.clients, 0)).toBe(overdue?.clientsWithBalance);
    expect(overdue?.pendingBalance).toBeLessThan(full?.pendingBalance ?? Infinity);
  });
});
