import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSptReport, getSptReportMeta } from './spt-report';
import { resolveActiveDataPaths } from './data-bundle';
import { SPT_MAIN_PRODUCT_GROUPS } from './report-product-groups';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

describeWithDatabase('reporte SPT construido desde GESI', () => {
  it('declara GESI como fuente operativa y expone su cobertura real', () => {
    const meta = getSptReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI API');
    expect(meta.rowCount).toBeGreaterThan(250_000);
    expect(meta.coverageFrom <= '2025-01-01').toBe(true);
    expect(meta.minDate <= '2025-01-02').toBe(true);
    expect(meta.maxDate >= '2026-07-20').toBe(true);
    expect(meta.unavailableDocumentCount).toBeLessThan(100);
    expect(meta.defaultUniverse.companies).toEqual([3]);
    expect(meta.defaultUniverse.branches).toEqual([3]);
    expect(meta.defaultUniverse.productGroups).toEqual([...SPT_MAIN_PRODUCT_GROUPS]);
  }, 15_000);

  it('calcula un corte actual coherente dentro del universo de empresa 3', () => {
    const report = buildSptReport({ month: '2026-07' });
    expect(report).not.toBeNull();
    expect(report!.current.kilos).toBeGreaterThan(0);
    expect(report!.current.clients).toBeGreaterThan(0);
    expect(report!.current.netAmount).toBeGreaterThan(0);
    expect(report!.daily.reduce((sum, row) => sum + row.current, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.current.units).toBeGreaterThan(0);
    expect(report!.previousYear.kilos).toBeGreaterThan(0);
    expect(report!.previousYtd.kilos).toBeGreaterThan(0);
    expect(new Set(report!.productGroups.map((row) => row.label))).toEqual(new Set(SPT_MAIN_PRODUCT_GROUPS));
    expect(report!.productGroups.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.productGroups.reduce((sum, row) => sum + row.previousMonth.kilos, 0)).toBeCloseTo(report!.previousMonth.kilos, 6);
    expect(report!.productGroups.reduce((sum, row) => sum + row.previousYear.kilos, 0)).toBeCloseTo(report!.previousYear.kilos, 6);
    expect(report!.productGroups.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
    expect(report!.mixPeriods.current).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    expect(report!.mixPeriods.previousMonth).toMatchObject({ start: '2026-06-01', end: '2026-06-30', available: true });
    expect(report!.mixPeriods.previousYear).toMatchObject({ start: '2025-07-01', end: '2025-07-31', available: true });
    const comparableGroup = report!.productGroups.find((row) => row.previousMonth.kilos !== 0);
    expect(comparableGroup?.kilosVariationPreviousMonth).toBeCloseTo(
      ((comparableGroup?.kilos ?? 0) - (comparableGroup?.previousMonth.kilos ?? 0)) / (comparableGroup?.previousMonth.kilos ?? 1) * 100,
      6,
    );
  }, 15_000);

  it('respeta el universo más amplio de la página Vendedores', () => {
    const main = buildSptReport({ month: '2026-07' });
    const report = buildSptReport({ month: '2026-07', page: 'sellers' });
    expect(report).not.toBeNull();
    expect(report!.current.kilos).toBeGreaterThan(main!.current.kilos);
    expect(report!.current.clients).toBeGreaterThanOrEqual(main!.current.clients);
    expect(report!.current.netAmount).toBeGreaterThan(main!.current.netAmount);
  }, 15_000);
});
