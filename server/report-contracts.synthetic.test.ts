import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSyntheticReportFixture } from './test-support/report-fixtures';

let fixture: ReturnType<typeof createSyntheticReportFixture>;
let reports: {
  commercial: typeof import('./commercial-sales-report');
  mars: typeof import('./mars-report');
  nutripet: typeof import('./nutripet-report');
  baires: typeof import('./baires-report');
  nonBuyers: typeof import('./non-buyers-report');
  pending: typeof import('./pending-balances-report');
};

beforeAll(async () => {
  fixture = createSyntheticReportFixture();
  process.env.SALICE_SPT_DB_PATH = fixture.commercial;
  process.env.SALICE_PENDING_BALANCES_DB_PATH = fixture.pendingBalances;
  reports = {
    commercial: await import('./commercial-sales-report'),
    mars: await import('./mars-report'),
    nutripet: await import('./nutripet-report'),
    baires: await import('./baires-report'),
    nonBuyers: await import('./non-buyers-report'),
    pending: await import('./pending-balances-report'),
  };
});

afterAll(() => {
  delete process.env.SALICE_SPT_DB_PATH;
  delete process.env.SALICE_PENDING_BALANCES_DB_PATH;
  fixture.cleanup();
});

describe('contratos de reportes sobre un fixture sintético estable', () => {
  it('calcula cortes equivalentes y composición comercial sin depender del snapshot activo', () => {
    const report = reports.commercial.buildCommercialSalesReport({ month: '2026-07' });
    expect(report?.cutoffDay).toBe(20);
    expect(report?.current.netAmount).toBe(8_200);
    expect(report?.difference).toBeCloseTo((report?.current.netAmount ?? 0) - (report?.comparison.netAmount ?? 0), 6);
    expect(report?.mix.reduce((sum, row) => sum + row.netAmount, 0)).toBeCloseTo(report?.current.netAmount ?? 0, 6);
  });

  it('respeta el calendario Mars y reconcilia marca, período y quarter', () => {
    const report = reports.mars.buildMarsReport({ year: '2026', period: 'P08', brand: 'Whiskas' });
    expect(report?.current.kilos).toBe(11);
    expect(report?.elapsedDays).toBe(3);
    expect(report?.brands).toHaveLength(1);
    expect(report?.brands[0].kilos).toBe(report?.current.kilos);
  });

  it('calcula NutriPet con filtros y comparaciones equivalentes', () => {
    const report = reports.nutripet.buildNutriPetReport({ year: '2026', month: '07', brand: 'MaxPet', line: 'Cat' });
    expect(report?.current).toMatchObject({ kilos: 7, clients: 1 });
    expect(report?.previousMonth.kilos).toBe(5);
    expect(report?.previousYear.kilos).toBe(3);
    expect(report?.products.reduce((sum, row) => sum + row.kilos, 0)).toBe(7);
  });

  it('separa segmentos Baires y conserva el signo de notas de crédito', () => {
    const total = reports.baires.buildBairesReport({ year: '2026', month: '07' });
    const specialized = reports.baires.buildBairesReport({ year: '2026', month: '07', segment: 'Especializado' });
    const mass = reports.baires.buildBairesReport({ year: '2026', month: '07', segment: 'Masivo' });
    expect(total?.current.kilos).toBe(13);
    expect((specialized?.current.kilos ?? 0) + (mass?.current.kilos ?? 0)).toBe(total?.current.kilos);
  });

  it('clasifica recurrencia con ventanas móviles sobre entidades sintéticas', () => {
    const report = reports.nonBuyers.buildNonBuyerReport({});
    expect(report?.sourceMaxDate).toBe('2026-07-20');
    expect(report?.accounts.filter((row) => row.isNonBuyer30)).toHaveLength(report?.accountsSummary.nonBuyers30 ?? 0);
    expect(report?.accountSellers.reduce((sum, row) => sum + row.nonBuyers30, 0)).toBe(report?.accountsSummary.nonBuyers30);
  });

  it('calcula saldos, vencido y filtros sin datos operativos reales', () => {
    const full = reports.pending.buildPendingBalancesReport({});
    const overdue = reports.pending.buildPendingBalancesReport({ seller: 'Edgardo Larrea', status: 'overdue' });
    expect(full).toMatchObject({ pendingBalance: 23_000, overdueBalance: 10_000, clientsWithBalance: 2, openDocuments: 3 });
    expect(full?.clients.map((row) => row.name)).not.toContain('Consumidor Final');
    expect(overdue).toMatchObject({ pendingBalance: 15_000, overdueBalance: 10_000, clientsWithBalance: 1, openDocuments: 2 });
    expect(overdue?.overdueShare).toBeCloseTo(66.67, 2);
  });
});
