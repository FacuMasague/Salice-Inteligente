import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNutriPetReport, getNutriPetReportMeta } from './nutripet-report';

const describeWithDatabase = existsSync(resolve(process.cwd(), 'data/spt-gesi.sqlite')) ? describe : describe.skip;

describeWithDatabase('Reporte NutriPet construido desde GESI', () => {
  it('declara el universo Salice y los filtros observados en Power BI', () => {
    const meta = getNutriPetReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI API');
    expect(meta.rowCount).toBe(32_494);
    expect(meta.maxDate).toBe('2026-07-20');
    expect(meta.latestMonth).toBe('2026-07');
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
    const report = buildNutriPetReport({ year: '2026', month: '07' });
    expect(report).not.toBeNull();
    expect(report!.filters.channelGroup).toBe('Especializado');
    expect(report!.isPartial).toBe(true);
    expect(report!.elapsedDays).toBe(20);
    expect(report!.current.kilos).toBeCloseTo(22_085.1, 3);
    expect(report!.current.clients).toBe(135);
    expect(report!.previousMonth.kilos).toBeCloseTo(33_141, 3);
    expect(report!.previousYear.kilos).toBeCloseTo(23_752.136, 3);
    expect(report!.ytd.kilos).toBeCloseTo(262_326.08, 3);
    expect(report!.previousYtd.kilos).toBeCloseTo(262_615.836, 3);
    expect(report!.monthly).toHaveLength(13);
    expect(report!.monthly.at(-1)).toMatchObject({ month: '2026-07', isPartial: true, clients: 135 });
  }, 15_000);

  it('reproduce las cifras testigo visibles de MaxPet y línea Cat', () => {
    const report = buildNutriPetReport({ year: '2026', month: '06', brand: 'MaxPet', line: 'Cat', channelGroup: 'Especializado' });
    expect(report).not.toBeNull();
    expect(report!.current.kilos).toBe(15);
    expect(report!.current.clients).toBe(1);
    expect(report!.ytd.kilos).toBe(405);
    expect(report!.ytd.clients).toBe(9);
    expect(report!.previousYtd.clients).toBe(0);
    expect(report!.quarters.map((row) => [row.quarter, row.kilos])).toEqual([['T-1', 195], ['T-2', 210]]);
    const october = report!.monthly.find((row) => row.month === '2025-10');
    expect(october).toMatchObject({ kilos: 255, clients: 7 });
  }, 15_000);

  it('reconcilia las tablas de marca y producto con el total del período', () => {
    const report = buildNutriPetReport({ year: '2026', month: '07' });
    expect(report).not.toBeNull();
    expect(report!.brands.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.brands.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
    expect(report!.products.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.products.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
  }, 15_000);
});
