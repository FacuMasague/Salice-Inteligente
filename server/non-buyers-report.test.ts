import { describe, expect, it } from 'vitest';
import { buildNonBuyerReport, getNonBuyerReportMeta } from './non-buyers-report';

describe('Cuentas no compradoras construido desde GESI', () => {
  it('declara el universo publicado y la dimensión que la API no entrega', () => {
    const meta = getNonBuyerReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI');
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.universe.branches).toEqual([3]);
    expect(meta.universe.clientStatuses).toEqual(['Activo']);
    expect(meta.universe.excludedProductGroups).toEqual(['Drovet', 'Kualcos']);
    expect(meta.universe.excludedCategories).toEqual(['POP', 'Promociones']);
    expect(meta.universe.excludedSellers).toEqual(['Administración', 'Carolina', '']);
    expect(meta.agreementsAvailable).toBe(false);
  });

  it('reproduce el orden de magnitud y las marcas testigo del Power BI', () => {
    const report = buildNonBuyerReport({});
    expect(report).not.toBeNull();
    expect(report?.sourceMaxDate).toBe('2026-07-20');
    expect(report?.accountsSummary).toMatchObject({ universe90: 771, nonBuyers30: 212 });
    expect(report?.brandsSummary).toMatchObject({ universe90: 67, nonBuyers30: 15 });
    expect(report?.brandsSummary.rate).toBeCloseTo(22.4, 1);
    expect(Math.abs((report?.accountsSummary.universe90 ?? 0) - 764)).toBeLessThanOrEqual(10);
    expect(Math.abs((report?.accountsSummary.nonBuyers30 ?? 0) - 213)).toBeLessThanOrEqual(2);
  });

  it('reconcilia el detalle y la distribución por vendedor', () => {
    const report = buildNonBuyerReport({});
    expect(report).not.toBeNull();
    expect(report?.accounts.filter((row) => row.isNonBuyer30)).toHaveLength(report?.accountsSummary.nonBuyers30 ?? 0);
    expect(report?.brands.filter((row) => row.isNonBuyer30)).toHaveLength(report?.brandsSummary.nonBuyers30 ?? 0);
    expect(report?.accountSellers.reduce((sum, row) => sum + row.nonBuyers30, 0)).toBe(report?.accountsSummary.nonBuyers30);
    expect(report?.brandSellers.slice(0, 6).map((row) => row.nonBuyers30)).toEqual([13, 9, 8, 7, 5, 2]);
    expect(report?.accounts[0]).toMatchObject({ clientId: 33608, daysSinceLastPurchase: 10 });
  });

  it('recalcula el universo completo al aplicar un filtro operativo', () => {
    const meta = getNonBuyerReportMeta();
    const productGroup = meta.options.productGroup.find((value) => value === 'Baires SPT') ?? meta.options.productGroup[0];
    const full = buildNonBuyerReport({});
    const filtered = buildNonBuyerReport({ productGroup });
    expect(filtered?.filters.productGroup).toBe(productGroup);
    expect(filtered?.accountsSummary.universe180).toBeLessThanOrEqual(full?.accountsSummary.universe180 ?? 0);
    expect(filtered?.brandsSummary.universe180).toBeLessThanOrEqual(full?.brandsSummary.universe180 ?? 0);
  });
});
