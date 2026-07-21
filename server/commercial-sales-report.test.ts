import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCommercialSalesReport, getCommercialSalesReportMeta } from './commercial-sales-report';

const describeWithDatabase = existsSync(resolve(process.cwd(), 'data/spt-gesi.sqlite')) ? describe : describe.skip;

describeWithDatabase('Reporte Ventas - Comercial construido desde GESI', () => {
  it('expone el universo Salice y no depende del PBIX', () => {
    const meta = getCommercialSalesReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI API');
    expect(meta.rowCount).toBeGreaterThan(250_000);
    expect(meta.maxDate).toBe('2026-07-20');
    expect(meta.latestYear).toBe('2026');
    expect(meta.years.slice(0, 2)).toEqual(['2026', '2025']);
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.universe.branches).toEqual([3, 6]);
    expect(meta.universe.allowedIssuers).toEqual(['Salice Distribuciones S.A.', 'MDQ Alarcon Distribuciones S.A.']);
    expect(meta.options.seller.length).toBeGreaterThan(5);
    expect(meta.options.brand.length).toBeGreaterThan(20);
  }, 15_000);

  it('calcula corte equivalente, negocios y composición conciliable', () => {
    const report = buildCommercialSalesReport({ month: '2026-07' });
    expect(report).not.toBeNull();
    expect(report!.cutoffDay).toBe(20);
    expect(report!.current.netAmount).toBeGreaterThan(300_000_000);
    expect(report!.current.kilos).toBeGreaterThan(120_000);
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
    const report = buildCommercialSalesReport({ periodMode: 'year', year: '2026' });
    expect(report).not.toBeNull();
    expect(report!.periodMode).toBe('year');
    expect(report!.selectedPeriod).toBe('2026');
    expect(report!.periodStart).toBe('2026-01-01');
    expect(report!.periodEnd).toBe('2026-07-20');
    expect(report!.comparisonStart).toBe('2025-01-01');
    expect(report!.comparisonEnd).toBe('2025-07-20');
    expect(report!.elapsedDays).toBe(201);
    expect(report!.comparisonAvailable).toBe(true);
    expect(report!.current.netAmount).toBeGreaterThan(3_500_000_000);
    expect(report!.comparison.netAmount).toBeGreaterThan(0);
    expect(report!.monthly).toHaveLength(7);
    expect(report!.monthly[0].month).toBe('2026-01');
    expect(report!.monthly[6].month).toBe('2026-07');
    expect(report!.mix.reduce((sum, row) => sum + row.netAmount, 0)).toBeCloseTo(report!.current.netAmount, 4);
  }, 15_000);

  it('recalcula toda la respuesta al filtrar vendedor', () => {
    const full = buildCommercialSalesReport({ month: '2026-07' });
    const seller = getCommercialSalesReportMeta().options.seller.find((value) => value === 'Edgardo Larrea') ?? getCommercialSalesReportMeta().options.seller[0];
    const filtered = buildCommercialSalesReport({ month: '2026-07', seller });
    expect(filtered).not.toBeNull();
    expect(filtered!.filters.seller).toBe(seller);
    expect(filtered!.current.netAmount).toBeGreaterThan(0);
    expect(filtered!.current.netAmount).toBeLessThan(full!.current.netAmount);
    expect(filtered!.brandTotal.netAmount).toBeLessThanOrEqual(filtered!.current.netAmount + 0.001);
  }, 15_000);
});
