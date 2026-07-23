import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGeneralReport, getGeneralReportMeta } from './general-report';
import { resolveActiveDataPaths } from './data-bundle';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

describeWithDatabase('Reporte General construido desde GESI', () => {
  it('separa movimientos reales y objetivos comerciales', () => {
    const meta = getGeneralReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI');
    expect(meta.targetSource.label.length).toBeGreaterThan(0);
    expect(meta.targetSource.coverageFrom).toMatch(/^\d{4}-\d{2}$/);
    expect(meta.targetSource.coverageThrough).toMatch(/^\d{4}-\d{2}$/);
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.universe.branches).toEqual([3]);
    expect(meta.latestMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it('reconcilia el tablero de objetivos generales con sus desgloses', () => {
    const report = buildGeneralReport({ mode: 'core' });
    expect(report).not.toBeNull();
    expect(report?.target).toBeGreaterThan(0);
    expect(report?.actual).toBeGreaterThan(0);
    expect(report?.completion).toBeCloseTo((report!.actual / report!.target) * 100, 6);
    expect(report?.sellers.reduce((sum, row) => sum + row.target, 0)).toBeCloseTo(report?.target ?? 0, 6);
    expect(report?.sellers.reduce((sum, row) => sum + row.actual, 0)).toBeCloseTo(report?.actual ?? 0, 6);
  });

  it('concilia estratégicas y facturación de autoservicio con sus desgloses', () => {
    const strategic = buildGeneralReport({ mode: 'strategic' });
    expect(strategic?.actual).toBeGreaterThan(0);
    expect(strategic?.target).toBeGreaterThan(0);
    expect(strategic?.brands.reduce((sum, row) => sum + row.actual, 0)).toBeCloseTo(strategic?.actual ?? 0, 6);

    const autoservice = buildGeneralReport({ mode: 'autoservice' });
    expect(autoservice?.actual).toBeGreaterThan(0);
    expect(autoservice?.target).toBeGreaterThan(0);
    expect(autoservice?.sellers).toHaveLength(2);
    expect(autoservice?.sellers.reduce((sum, row) => sum + row.actual, 0)).toBeCloseTo(autoservice?.actual ?? 0, 5);
  });

  it('recalcula metas, tablas y tendencia con los filtros publicados', () => {
    const seller = buildGeneralReport({ mode: 'core', seller: 'Reventas' });
    expect(seller?.actual).toBeGreaterThanOrEqual(0);
    expect(seller?.target).toBeGreaterThan(0);
    expect(seller?.sellers).toHaveLength(1);
    expect(seller?.sellers[0]?.actual).toBeCloseTo(seller?.actual ?? 0, 6);

    const strategicBrand = buildGeneralReport({ mode: 'strategic', brand: 'MaxPet' });
    expect(strategicBrand?.target).toBeGreaterThan(0);
    expect(strategicBrand?.brands).toHaveLength(1);
    expect(strategicBrand?.brands[0]?.actual).toBeCloseTo(strategicBrand?.actual ?? 0, 6);
    expect(strategicBrand?.trend).toHaveLength(13);
  });

  it('relaciona los mismos resultados GESI con una versión explícita de objetivos', () => {
    const month = getGeneralReportMeta().latestMonth;
    const customGoals = [{
      id: 'objetivo-versionado-prueba',
      month,
      product: 'Pedigree',
      seller: 'Reventas',
      kilos: 123,
      accounts: null,
      invoicing: null,
    }];
    const report = buildGeneralReport({ mode: 'core', month }, customGoals);
    expect(report?.target).toBe(123);
    expect(report?.sellers.find((row) => row.name === 'Reventas')?.target).toBe(123);
    expect(report?.actual).toBeGreaterThanOrEqual(0);
  });
});
