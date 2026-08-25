import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildNutriPetReport, getNutriPetReportMeta } from './nutripet-report';
import { resolveActiveDataPaths } from './data-bundle';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

describeWithDatabase('Reporte NutriPet construido desde GESI', () => {
  it('declara el universo Salice y los filtros observados en Power BI', () => {
    const meta = getNutriPetReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI API');
    expect(meta.rowCount).toBeGreaterThan(0);
    expect(meta.maxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.latestMonth).toBe(meta.reportingDate.slice(0, 7));
    expect(meta.universe).toEqual({
      companies: [3],
      branches: [3],
      allowedIssuers: ['Salice Distribuciones S.A.'],
      productGroup: 'Nutri Pet',
      excludedCategories: ['POP'],
      excludedClients: ['Via Salice MDP S.A.'],
    });
    expect(meta.options.channelGroup).toEqual(expect.arrayContaining(['Especializado', 'Masivo']));
    expect(meta.options.brand).toEqual(expect.arrayContaining(['Raza', 'Gaucho', 'MaxPet']));
    expect(meta.options.line).toEqual(expect.arrayContaining(['Adulto', 'Cat', 'Puppy']));
  }, 15_000);

  it('calcula el último mes parcial con comparaciones equivalentes', () => {
    const meta = getNutriPetReportMeta();
    const report = buildNutriPetReport({ year: meta.latestMonth.slice(0, 4), month: meta.latestMonth.slice(5, 7) });
    expect(report).not.toBeNull();
    expect(report!.filters.channelGroup).toBe('Especializado');
    const lastDay = new Date(Date.UTC(Number(meta.latestMonth.slice(0, 4)), Number(meta.latestMonth.slice(5, 7)), 0)).getUTCDate();
    expect(report!.isPartial).toBe(Number(meta.maxDate.slice(8, 10)) < lastDay);
    expect(report!.elapsedDays).toBe(Number(meta.maxDate.slice(8, 10)));
    expect(report!.current.kilos).toBeGreaterThan(0);
    expect(report!.current.clients).toBeGreaterThan(0);
    expect(report!.ytd.kilos).toBeGreaterThanOrEqual(report!.current.kilos);
    expect(report!.monthly).toHaveLength(13);
    expect(report!.monthly.at(-1)).toMatchObject({ month: meta.latestMonth, isPartial: report!.isPartial, clients: report!.current.clients });
    expect(report!.quarters).toHaveLength(5);
    expect(report!.quarters[0].start).toBe(`${report!.monthly[0].month}-01`);
    expect(report!.quarters.at(-1)?.end).toBe(meta.reportingDate);
    expect(report!.quarters.map((row) => row.label)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^T[1-4] \d{4}$/),
    ]));
    expect(report!.quarters.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.monthly.reduce((sum, row) => sum + row.kilos, 0), 6);
    expect(report!.quarters.reduce((sum, row) => sum + row.units, 0)).toBeCloseTo(report!.monthly.reduce((sum, row) => sum + row.units, 0), 6);
    expect(report!.quarters.reduce((sum, row) => sum + row.netAmount, 0)).toBeCloseTo(report!.monthly.reduce((sum, row) => sum + row.netAmount, 0), 6);
    expect(report!.quarters.filter((row) => !row.comparisonAvailable).every((row) => row.previousYearKilos == null)).toBe(true);
  }, 15_000);

  it('aplica conjuntamente marca, línea y canal sobre todos los desgloses', () => {
    const report = buildNutriPetReport({ year: '2026', month: '06', brand: 'MaxPet', line: 'Cat', channelGroup: 'Especializado' });
    expect(report).not.toBeNull();
    expect(report!.filters).toMatchObject({ brand: 'MaxPet', line: 'Cat', channelGroup: 'Especializado' });
    expect(report!.current.clients).toBeGreaterThanOrEqual(0);
    expect(report!.quarters).toHaveLength(5);
    expect(report!.quarters.every((row) => row.kilos >= 0 && row.label.includes(String(row.year)))).toBe(true);
  }, 15_000);

  it('reconcilia las tablas de marca y producto con el total del período', () => {
    const meta = getNutriPetReportMeta();
    const report = buildNutriPetReport({ year: meta.latestMonth.slice(0, 4), month: meta.latestMonth.slice(5, 7) });
    expect(report).not.toBeNull();
    expect(report!.brands.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.brands.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
    expect(report!.products.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.products.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
  }, 15_000);
});
