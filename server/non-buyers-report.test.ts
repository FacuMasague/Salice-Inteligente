import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildNonBuyerReport, getNonBuyerReportMeta } from './non-buyers-report';
import { resolveActiveDataPaths } from './data-bundle';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

describeWithDatabase('Cuentas no compradoras construido desde GESI', () => {
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

  it('deriva el corte y las tasas desde el snapshot activo', () => {
    const report = buildNonBuyerReport({});
    expect(report).not.toBeNull();
    expect(report?.sourceMaxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(report?.accountsSummary.universe180).toBeGreaterThanOrEqual(report?.accountsSummary.universe90 ?? 0);
    expect(report?.brandsSummary.universe180).toBeGreaterThanOrEqual(report?.brandsSummary.universe90 ?? 0);
    expect(report?.accountsSummary.rate).toBeCloseTo((report!.accountsSummary.nonBuyers30 / report!.accountsSummary.universe90) * 100, 6);
    expect(report?.brandsSummary.rate).toBeCloseTo((report!.brandsSummary.nonBuyers30 / report!.brandsSummary.universe90) * 100, 6);
  });

  it('reconcilia el detalle y la distribución por vendedor', () => {
    const report = buildNonBuyerReport({});
    expect(report).not.toBeNull();
    expect(report?.accounts.filter((row) => row.isNonBuyer30)).toHaveLength(report?.accountsSummary.nonBuyers30 ?? 0);
    expect(report?.brands.filter((row) => row.isNonBuyer30)).toHaveLength(report?.brandsSummary.nonBuyers30 ?? 0);
    expect(report?.accountSellers.reduce((sum, row) => sum + row.nonBuyers30, 0)).toBe(report?.accountsSummary.nonBuyers30);
    expect(report?.brandSellers.every((row) => row.nonBuyers30 <= (report?.brandsSummary.nonBuyers30 ?? 0))).toBe(true);
    expect(report?.brandSellers.map((row) => row.nonBuyers30)).toEqual(
      [...(report?.brandSellers ?? [])].map((row) => row.nonBuyers30).sort((left, right) => right - left),
    );
    expect(report?.accounts.every((row) => row.daysSinceLastPurchase == null || row.daysSinceLastPurchase >= 0)).toBe(true);
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
