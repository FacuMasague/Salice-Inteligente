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
    expect(meta.rowCount).toBeGreaterThan(0);
    expect(meta.maxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.latestMonth).toBe(meta.reportingDate.slice(0, 7));
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
    const meta = getBairesReportMeta();
    const report = buildBairesReport({ year: meta.latestMonth.slice(0, 4), month: meta.latestMonth.slice(5, 7) });
    expect(report).not.toBeNull();
    expect(report!.filters.segment).toBe('');
    const lastDay = new Date(Date.UTC(Number(meta.latestMonth.slice(0, 4)), Number(meta.latestMonth.slice(5, 7)), 0)).getUTCDate();
    expect(report!.isPartial).toBe(Number(meta.maxDate.slice(8, 10)) < lastDay);
    expect(report!.elapsedDays).toBe(Number(meta.maxDate.slice(8, 10)));
    expect(report!.current.kilos).toBeGreaterThan(0);
    expect(report!.current.clients).toBeGreaterThan(0);
    expect(report!.ytd.kilos).toBeGreaterThanOrEqual(report!.current.kilos);
    expect(report!.monthly).toHaveLength(13);
    expect(report!.monthly.at(-1)).toMatchObject({ month: meta.latestMonth, isPartial: report!.isPartial, clients: report!.current.clients });
  }, 15_000);

  it('mantiene conciliados los períodos y trimestres de un mes cerrado', () => {
    const report = buildBairesReport({ year: '2026', month: '05' });
    expect(report).not.toBeNull();
    expect(report!.isPartial).toBe(false);
    expect(report!.current.kilos).toBeGreaterThan(0);
    expect(report!.current.clients).toBeGreaterThan(0);
    expect(report!.quarters.reduce((sum, row) => sum + row.kilos, 0)).toBeGreaterThanOrEqual(report!.ytd.kilos);
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
