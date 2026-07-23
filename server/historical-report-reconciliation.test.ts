import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DataBundleManifest } from './data-bundle';

type Fixture = {
  schemaVersion: 1;
  fixtureId: string;
  capturedAt: string;
  snapshotRevision: number;
  artifacts: { commercialSha256: string; pendingBalancesSha256: string };
  witnesses: Record<string, Record<string, unknown>>;
};

const fixturePath = resolve(process.cwd(), 'server/test-fixtures/reconciliation-2026-07-20.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;

function matchingBundle() {
  const bundles = resolve(process.cwd(), 'data/bundles');
  if (!existsSync(bundles)) return null;
  for (const bundleId of readdirSync(bundles)) {
    const manifestPath = resolve(bundles, bundleId, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DataBundleManifest;
    const commercial = resolve(process.cwd(), manifest.artifacts.commercial.path);
    const pendingBalances = resolve(process.cwd(), manifest.artifacts.pendingBalances.path);
    if (
      manifest.capturedAt === fixture.capturedAt
      && manifest.snapshotRevision === fixture.snapshotRevision
      && manifest.artifacts.commercial.sha256 === fixture.artifacts.commercialSha256
      && manifest.artifacts.pendingBalances.sha256 === fixture.artifacts.pendingBalancesSha256
      && existsSync(commercial)
      && existsSync(pendingBalances)
      && createHash('sha256').update(readFileSync(commercial)).digest('hex') === fixture.artifacts.commercialSha256
      && createHash('sha256').update(readFileSync(pendingBalances)).digest('hex') === fixture.artifacts.pendingBalancesSha256
    ) {
      return { commercial, pendingBalances };
    }
  }
  return null;
}

const historical = matchingBundle();
const describeHistorical = historical ? describe : describe.skip;
let reports: {
  general: typeof import('./general-report');
  commercial: typeof import('./commercial-sales-report');
  mars: typeof import('./mars-report');
  nutripet: typeof import('./nutripet-report');
  baires: typeof import('./baires-report');
  nonBuyers: typeof import('./non-buyers-report');
  pending: typeof import('./pending-balances-report');
};

describeHistorical(`conciliación histórica ${fixture.fixtureId}`, () => {
  beforeAll(async () => {
    process.env.SALICE_SPT_DB_PATH = historical!.commercial;
    process.env.SALICE_PENDING_BALANCES_DB_PATH = historical!.pendingBalances;
    reports = {
      general: await import('./general-report'),
      commercial: await import('./commercial-sales-report'),
      mars: await import('./mars-report'),
      nutripet: await import('./nutripet-report'),
      baires: await import('./baires-report'),
      nonBuyers: await import('./non-buyers-report'),
      pending: await import('./pending-balances-report'),
    };
  });

  it('ejecuta las cifras testigo generales sólo contra el artefacto identificado', () => {
    const expected = fixture.witnesses.general;
    expect(reports.general.getGeneralReportMeta().latestMonth).toBe(expected.month);
    expect(reports.general.buildGeneralReport({ mode: 'core' })?.actual).toBeCloseTo(Number(expected.coreActual), 3);
    expect(reports.general.buildGeneralReport({ mode: 'strategic' })?.actual).toBeCloseTo(Number(expected.strategicActual), 3);
    expect(reports.general.buildGeneralReport({ mode: 'autoservice' })?.actual).toBeCloseTo(Number(expected.autoserviceActual), 3);
    expect(reports.general.buildGeneralReport({ mode: 'core', seller: 'Reventas' })?.actual).toBeCloseTo(Number(expected.reventasActual), 3);
  });

  it('concilia Ventas Comercial al corte versionado', () => {
    const expected = fixture.witnesses.commercialSales;
    const meta = reports.commercial.getCommercialSalesReportMeta();
    const month = reports.commercial.buildCommercialSalesReport({ month: '2026-07' });
    const year = reports.commercial.buildCommercialSalesReport({ periodMode: 'year', year: '2026' });
    expect(meta.maxDate).toBe(expected.maxDate);
    expect(month?.cutoffDay).toBe(expected.cutoffDay);
    expect(year?.periodEnd).toBe(expected.annualPeriodEnd);
    expect(year?.comparisonEnd).toBe(expected.annualComparisonEnd);
  });

  it('concilia Mars al corte versionado', () => {
    const expected = fixture.witnesses.mars;
    const p07 = reports.mars.buildMarsReport({ year: '2026', period: 'P07', clientMode: 'branch' });
    const p08 = reports.mars.buildMarsReport({ year: '2026', period: 'P08', clientMode: 'account' });
    expect(reports.mars.getMarsReportMeta().maxDate).toBe(expected.maxDate);
    expect(p07?.current.kilos).toBeCloseTo(Number(expected.p07Kilos), 3);
    expect(p07?.current.accounts).toBe(expected.p07Accounts);
    expect(p07?.current.clientBranches).toBe(expected.p07ClientBranches);
    expect(p08?.elapsedDays).toBe(expected.p08ElapsedDays);
  });

  it('concilia NutriPet al corte versionado', () => {
    const expected = fixture.witnesses.nutripet;
    const meta = reports.nutripet.getNutriPetReportMeta();
    const july = reports.nutripet.buildNutriPetReport({ year: '2026', month: '07' });
    const witness = reports.nutripet.buildNutriPetReport({ year: '2026', month: '06', brand: 'MaxPet', line: 'Cat', channelGroup: 'Especializado' });
    expect(meta.rowCount).toBe(expected.rowCount);
    expect(meta.maxDate).toBe(expected.maxDate);
    expect(july?.elapsedDays).toBe(expected.julyElapsedDays);
    expect(july?.current.kilos).toBeCloseTo(Number(expected.julySpecializedKilos), 3);
    expect(july?.current.clients).toBe(expected.julySpecializedClients);
    expect(witness?.current.kilos).toBe(expected.maxPetCatJuneKilos);
  });

  it('concilia Baires al corte versionado', () => {
    const expected = fixture.witnesses.baires;
    const meta = reports.baires.getBairesReportMeta();
    const july = reports.baires.buildBairesReport({ year: '2026', month: '07' });
    const may = reports.baires.buildBairesReport({ year: '2026', month: '05' });
    expect(meta.rowCount).toBe(expected.rowCount);
    expect(meta.maxDate).toBe(expected.maxDate);
    expect(july?.elapsedDays).toBe(expected.julyElapsedDays);
    expect(july?.current.kilos).toBeCloseTo(Number(expected.julyKilos), 3);
    expect(july?.current.clients).toBe(expected.julyClients);
    expect(may?.current.kilos).toBeCloseTo(Number(expected.mayKilos), 3);
    expect(may?.current.clients).toBe(expected.mayClients);
  });

  it('concilia Cuentas no compradoras al corte versionado', () => {
    const expected = fixture.witnesses.nonBuyers;
    const report = reports.nonBuyers.buildNonBuyerReport({});
    expect(report?.sourceMaxDate).toBe(expected.maxDate);
    expect(report?.accountsSummary.universe90).toBe(expected.accountsUniverse90);
    expect(report?.accountsSummary.nonBuyers30).toBe(expected.accountsNonBuyers30);
    expect(report?.brandsSummary.universe90).toBe(expected.brandsUniverse90);
    expect(report?.brandsSummary.nonBuyers30).toBe(expected.brandsNonBuyers30);
    expect(report?.brandSellers.slice(0, 6).map((row) => row.nonBuyers30)).toEqual(expected.brandSellerCounts);
  });

  it('concilia Saldos Pendientes al corte versionado', () => {
    const expected = fixture.witnesses.pendingBalances;
    const meta = reports.pending.getPendingBalancesReportMeta();
    const report = reports.pending.buildPendingBalancesReport({ seller: 'Edgardo Larrea' });
    expect(meta.asOfDate).toBe(expected.asOfDate);
    expect(meta.salesFrom).toBe(expected.salesFrom);
    expect(report?.pendingBalance).toBeCloseTo(Number(expected.edgardoPending), 1);
    expect(report?.overdueBalance).toBeCloseTo(Number(expected.edgardoOverdue), 1);
    expect(report?.overdueShare).toBeCloseTo(Number(expected.edgardoOverdueShare), 1);
  });
});
