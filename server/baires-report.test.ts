import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBairesReport, getBairesReportMeta } from './baires-report';
import { resolveActiveDataPaths } from './data-bundle';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

describeWithDatabase('Reporte Baires construido desde GESI', () => {
  it('declara el universo Baires de Salice y los filtros publicados', () => {
    const meta = getBairesReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI API');
    expect(meta.rowCount).toBe(49_252);
    expect(meta.maxDate).toBe('2026-07-20');
    expect(meta.latestMonth).toBe('2026-07');
    expect(meta.universe).toEqual({
      companies: [3],
      branches: [3],
      allowedIssuers: ['Salice Distribuciones S.A.'],
      productGroups: ['Baires SPT', 'Baires Masivo'],
      excludedCategories: ['POP'],
      excludedClients: ['Via Salice MDP S.A.'],
    });
    expect(meta.options.segment).toEqual(['Especializado', 'Masivo']);
    expect(meta.options.branch).toEqual(['Mar del Plata']);
    expect(meta.options.brand).toEqual(expect.arrayContaining(['Old Prince Noveles', 'Kongo', 'Fawna']));
  }, 15_000);

  it('calcula el último mes parcial con cortes comparables', () => {
    const report = buildBairesReport({ year: '2026', month: '07' });
    expect(report).not.toBeNull();
    expect(report!.filters.segment).toBe('');
    expect(report!.isPartial).toBe(true);
    expect(report!.elapsedDays).toBe(20);
    expect(report!.current.kilos).toBeCloseTo(70_886, 3);
    expect(report!.current.clients).toBe(350);
    expect(report!.previousMonth.kilos).toBeCloseTo(76_551, 3);
    expect(report!.previousYear.kilos).toBeCloseTo(87_392, 3);
    expect(report!.ytd.kilos).toBeCloseTo(858_605.5, 3);
    expect(report!.previousYtd.kilos).toBeCloseTo(860_192, 3);
    expect(report!.monthly).toHaveLength(13);
    expect(report!.monthly.at(-1)).toMatchObject({ month: '2026-07', isPartial: true, clients: 350 });
  }, 15_000);

  it('reproduce las cifras testigo visibles de mayo de 2026', () => {
    const report = buildBairesReport({ year: '2026', month: '05' });
    expect(report).not.toBeNull();
    expect(report!.current.kilos).toBe(143_158);
    expect(report!.current.clients).toBe(430);
    expect(report!.previousMonth.kilos).toBe(112_026);
    expect(report!.previousMonth.clients).toBe(417);
    expect(report!.previousYear.kilos).toBeCloseTo(116_838.5, 3);
    expect(report!.previousYear.clients).toBe(433);
    expect(report!.quarters.map((row) => [row.quarter, row.kilos])).toEqual([
      ['T-1', 397_857], ['T-2', 389_862.5], ['T-3', 70_886],
    ]);
  }, 15_000);

  it('reconcilia segmentos y desgloses contra el total seleccionado', () => {
    const total = buildBairesReport({ year: '2026', month: '05' });
    const specialized = buildBairesReport({ year: '2026', month: '05', segment: 'Especializado' });
    const mass = buildBairesReport({ year: '2026', month: '05', segment: 'Masivo' });
    expect(total).not.toBeNull();
    expect(specialized!.current.kilos + mass!.current.kilos).toBeCloseTo(total!.current.kilos, 6);
    expect(total!.brands.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(total!.current.kilos, 6);
    expect(total!.brands.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
    expect(total!.subcategories.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(total!.current.kilos, 6);
    expect(total!.subcategories.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
  }, 20_000);
});
