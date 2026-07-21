import { beforeAll, describe, expect, it } from 'vitest';
import { rebuildLocalDemoData } from './local-demo-data.js';
import { buildBairesReport, getBairesReportMeta } from './baires-report.js';
import { buildCommercialSalesReport, getCommercialSalesReportMeta } from './commercial-sales-report.js';
import { buildGeneralReport, getGeneralReportMeta } from './general-report.js';
import { buildMarsReport, getMarsReportMeta } from './mars-report.js';
import { buildNonBuyerReport, getNonBuyerReportMeta } from './non-buyers-report.js';
import { buildNutriPetReport, getNutriPetReportMeta } from './nutripet-report.js';
import { buildPendingBalancesReport, getPendingBalancesReportMeta, listPendingBalanceDocuments } from './pending-balances-report.js';
import { buildSptReport, getSptReportMeta } from './spt-report.js';

beforeAll(() => rebuildLocalDemoData());

describe('synthetic local report pack', () => {
  it('makes every advertised analytics surface available from the same local source', () => {
    const metas = [
      getSptReportMeta(), getCommercialSalesReportMeta(), getGeneralReportMeta(), getMarsReportMeta(),
      getNutriPetReportMeta(), getBairesReportMeta(), getNonBuyerReportMeta(), getPendingBalancesReportMeta(),
    ];
    expect(metas.every((meta) => meta.available)).toBe(true);
    expect(metas.every((meta) => meta.sourceSystem === 'Synthetic local demo dataset')).toBe(true);
  });

  it('supports positive totals, signed credits, and equivalent-period comparisons', () => {
    const spt = buildSptReport({ month: '2026-07' });
    const commercial = buildCommercialSalesReport({ month: '2026-07' });
    expect(spt?.current.kilos).toBeGreaterThan(0);
    expect(spt?.current.netAmount).toBeGreaterThan(0);
    expect(commercial?.current.netAmount).toBeGreaterThan(0);
    expect(commercial?.comparison.netAmount).toBeGreaterThan(0);
    expect(commercial?.cutoffDay).toBe(15);
  });

  it('keeps supplier views isolated by fictional product group', () => {
    const orbit = buildMarsReport({ year: '2026', period: 'P07' });
    const nova = buildNutriPetReport({ year: '2026', month: '07' });
    const harbor = buildBairesReport({ year: '2026', month: '07' });
    expect(orbit?.current.kilos).toBeGreaterThan(0);
    expect(nova?.current.kilos).toBeGreaterThan(0);
    expect(harbor?.current.kilos).toBeGreaterThan(0);
    expect(getMarsReportMeta().universe.productGroup).toBe('Orbit Nutrition');
    expect(getNutriPetReportMeta().universe.productGroup).toBe('Nova Pet');
    expect(getBairesReportMeta().universe.productGroups).toEqual(['Harbor SPT', 'Harbor Retail']);
  });

  it('keeps synthetic targets separate from actual commercial results', () => {
    const report = buildGeneralReport({ mode: 'core', month: '2026-07' });
    expect(report?.actual).toBeGreaterThan(0);
    expect(report?.target).toBeGreaterThan(0);
    expect(getGeneralReportMeta().targetSource.label).toContain('Synthetic commercial plan');
  });

  it('provides actionable dormant accounts and document-level receivables', () => {
    const dormant = buildNonBuyerReport({});
    const balances = buildPendingBalancesReport({});
    expect(dormant?.accountsSummary.nonBuyers30).toBeGreaterThan(0);
    expect(balances?.pendingBalance).toBeGreaterThan(0);
    expect(balances?.clients.length).toBeGreaterThan(0);
    expect(listPendingBalanceDocuments().length).toBeGreaterThan(0);
    expect(balances?.clients.some((client) => client.overdueBalance > 0)).toBe(true);
  });
});
