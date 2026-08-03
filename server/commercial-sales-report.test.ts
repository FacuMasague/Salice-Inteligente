import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCommercialSalesReport, buildCommercialSellerVariations, getCommercialSalesReportMeta } from './commercial-sales-report';
import { resolveActiveDataPaths } from './data-bundle';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

describeWithDatabase('Reporte Ventas - Comercial construido desde GESI', () => {
  it('expone el universo Salice y no depende del PBIX', () => {
    const meta = getCommercialSalesReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI API');
    expect(meta.rowCount).toBeGreaterThan(0);
    expect(meta.maxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.latestYear).toBe(meta.reportingDate.slice(0, 4));
    expect(meta.years).toContain(meta.latestYear);
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.universe.branches).toEqual([3]);
    expect(meta.universe.allowedIssuers).toEqual(['Salice Distribuciones S.A.']);
    expect(meta.options.seller.length).toBeGreaterThan(5);
    expect(meta.options.brand.length).toBeGreaterThan(20);
  }, 15_000);

  it('calcula corte equivalente, negocios y composición conciliable', () => {
    const meta = getCommercialSalesReportMeta();
    const report = buildCommercialSalesReport({ month: meta.latestMonth });
    expect(report).not.toBeNull();
    expect(report!.cutoffDay).toBe(Number(meta.reportingDate.slice(8, 10)));
    expect(report!.current.netAmount).toBeGreaterThan(0);
    expect(report!.current.kilos).toBeGreaterThan(0);
    expect(report!.periodMode).toBe('month');
    expect(report!.comparison.netAmount).toBeGreaterThan(0);
    expect(report!.difference).toBeCloseTo(report!.current.netAmount - report!.comparison.netAmount, 6);
    expect(report!.mix.reduce((sum, row) => sum + row.netAmount, 0)).toBeCloseTo(report!.current.netAmount, 4);
    expect(report!.mix.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
    expect(report!.segments.balanceado.netAmount).toBeGreaterThan(report!.segments.drovet.netAmount);
    expect(report!.segments.autoservicio.netAmount).toBeGreaterThan(report!.segments.sanitarios.netAmount);
    expect(report!.brands.reduce((sum, row) => sum + row.netAmount, 0)).toBeCloseTo(report!.brandTotal.netAmount, 4);
    expect(report!.brandTotal.averagePricePerKilo).toBeGreaterThan(0);
  }, 15_000);

  it('ofrece una vista anual completa y compara el mismo corte del año anterior', () => {
    const meta = getCommercialSalesReportMeta();
    const report = buildCommercialSalesReport({ periodMode: 'year', year: meta.latestYear });
    expect(report).not.toBeNull();
    expect(report!.periodMode).toBe('year');
    expect(report!.selectedPeriod).toBe(meta.latestYear);
    expect(report!.periodStart).toBe(`${meta.latestYear}-01-01`);
    expect(report!.periodEnd).toBe(meta.reportingDate);
    expect(report!.comparisonStart).toBe(`${Number(meta.latestYear) - 1}-01-01`);
    expect(report!.comparisonEnd).toBe(`${Number(meta.latestYear) - 1}${meta.reportingDate.slice(4)}`);
    expect(report!.elapsedDays).toBeGreaterThan(0);
    expect(report!.comparisonAvailable).toBe(true);
    expect(report!.current.netAmount).toBeGreaterThan(0);
    expect(report!.comparison.netAmount).toBeGreaterThan(0);
    expect(report!.monthly).toHaveLength(Number(meta.latestMonth.slice(5, 7)));
    expect(report!.monthly[0].month).toBe(`${meta.latestYear}-01`);
    expect(report!.monthly.at(-1)?.month).toBe(meta.latestMonth);
    expect(report!.monthly.every((row) => row.currentKilos >= 0 && row.previousYearKilos >= 0)).toBe(true);
    expect(report!.monthly.reduce((sum, row) => sum + row.currentKilos, 0)).toBeCloseTo(report!.current.kilos, 4);
    expect(report!.mix.reduce((sum, row) => sum + row.netAmount, 0)).toBeCloseTo(report!.current.netAmount, 4);
  }, 15_000);

  it('recalcula toda la respuesta al filtrar vendedor', () => {
    const month = getCommercialSalesReportMeta().latestMonth;
    const full = buildCommercialSalesReport({ month });
    const seller = getCommercialSalesReportMeta().options.seller.find((value) => value === 'Edgardo Larrea') ?? getCommercialSalesReportMeta().options.seller[0];
    const filtered = buildCommercialSalesReport({ month, seller });
    expect(filtered).not.toBeNull();
    expect(filtered!.filters.seller).toBe(seller);
    expect(filtered!.current.netAmount).toBeGreaterThan(0);
    expect(filtered!.current.netAmount).toBeLessThan(full!.current.netAmount);
    expect(filtered!.brandTotal.netAmount).toBeLessThanOrEqual(filtered!.current.netAmount + 0.001);
  }, 15_000);

  it('compara vendedores con exactamente los períodos resueltos por el reporte', () => {
    const report = buildCommercialSalesReport({});
    expect(report).not.toBeNull();
    const variations = buildCommercialSellerVariations(report!);
    expect(variations.length).toBeGreaterThan(0);
    expect(variations.reduce((sum, row) => sum + row.currentNetAmount, 0)).toBeCloseTo(report!.current.netAmount, 4);
    expect(variations.reduce((sum, row) => sum + row.comparisonNetAmount, 0)).toBeCloseTo(report!.comparison.netAmount, 4);
    expect(variations.map((row) => Math.abs(row.difference))).toEqual(
      [...variations].map((row) => Math.abs(row.difference)).sort((left, right) => right - left),
    );
  }, 15_000);
});
