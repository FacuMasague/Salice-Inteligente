import { describe, expect, it } from 'vitest';
import { buildPendingBalancesReport, getPendingBalancesReportMeta } from './pending-balances-report';

describe('Saldos Pendientes Salice construido desde GESI', () => {
  it('declara el universo visible y la ventana móvil del reporte', () => {
    const meta = getPendingBalancesReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI');
    expect(meta.asOfDate).toBe('2026-07-20');
    expect(meta.salesFrom).toBe('2026-06-21');
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.universe.branches).toEqual([3]);
    expect(meta.options.sellers).toEqual(['Ana Ottaviano', 'Andres Dominguez', 'Edgardo Larrea', 'Ignacio Carea', 'Julieta Errecart']);
  });

  it('reconcilia el corte de Edgardo con el Power BI dentro de la diferencia horaria de fuente', () => {
    const report = buildPendingBalancesReport({ seller: 'Edgardo Larrea' });
    expect(report).not.toBeNull();
    expect(report?.pendingBalance).toBeCloseTo(107_437_498.35, 1);
    expect(report?.overdueBalance).toBeCloseTo(31_597_928.53, 1);
    expect(report?.overdueShare).toBeCloseTo(29.41, 1);
    expect(Math.abs((report?.pendingBalance ?? 0) - 104_882_683) / 104_882_683).toBeLessThan(.05);
    expect(Math.abs((report?.overdueBalance ?? 0) - 30_750_989) / 30_750_989).toBeLessThan(.05);
  });

  it('reproduce filas testigo de saldo, vencido, plazo y venta bruta de 30 días', () => {
    const report = buildPendingBalancesReport({ seller: 'Edgardo Larrea' });
    const masson = report?.clients.find((row) => row.name === 'Masson Guillermo');
    const sculli = report?.clients.find((row) => row.name === 'Sculli Eduardo Martin');
    const botta = report?.clients.find((row) => row.name === 'Botta Ayelen');
    const sileoni = report?.clients.find((row) => row.name === 'Sileoni Gaston Ezequiel');
    expect(masson).toMatchObject({ earliestDue: '2026-07-03', creditTermTotalDays: 90, creditTermAverageDays: 30 });
    expect(masson?.pendingBalance).toBeCloseTo(1_320_971.24, 1);
    expect(masson?.overdueBalance).toBeCloseTo(786_664.24, 1);
    expect(masson?.sales30).toBeCloseTo(534_307, 1);
    expect(sculli?.overdueToSales30).toBeCloseTo(156.64, 1);
    expect(botta).toMatchObject({ sales30: 0, overdueToSales30: null, creditTermAverageDays: 30 });
    expect(sileoni?.pendingBalance).toBeCloseTo(416_765.3, 1);
    expect(sileoni?.overdueBalance).toBeCloseTo(416_765.3, 1);
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
