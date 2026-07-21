import { describe, expect, it } from 'vitest';
import { buildGeneralReport, getGeneralReportMeta } from './general-report';

describe('Reporte General construido desde GESI', () => {
  it('separa movimientos reales y objetivos comerciales', () => {
    const meta = getGeneralReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI');
    expect(meta.targetSource.label).toContain('Plan comercial Status Salice');
    expect(meta.universe.companies).toEqual([3]);
    expect(meta.universe.branches).toEqual([3]);
    expect(meta.latestMonth).toBe('2026-07');
  });

  it('reproduce el tablero de objetivos generales dentro de la cobertura GESI', () => {
    const report = buildGeneralReport({ mode: 'core' });
    expect(report).not.toBeNull();
    expect(report?.target).toBe(249_200);
    expect(report?.actual).toBeCloseTo(116_871.162, 3);
    expect(Math.abs((report?.actual ?? 0) - 116_891.162)).toBeLessThanOrEqual(20.001);
    expect(report?.completion).toBeCloseTo(46.8985, 3);
    expect(report?.sellers.reduce((sum, row) => sum + row.target, 0)).toBe(249_200);
    expect(report?.sellers.reduce((sum, row) => sum + row.actual, 0)).toBeCloseTo(report?.actual ?? 0, 6);
  });

  it('concilia estratégicas y facturación de autoservicio', () => {
    const strategic = buildGeneralReport({ mode: 'strategic' });
    expect(strategic?.actual).toBe(4_294);
    expect(strategic?.target).toBe(13_800);
    expect(strategic?.brands.reduce((sum, row) => sum + row.actual, 0)).toBeCloseTo(4_294, 6);

    const autoservice = buildGeneralReport({ mode: 'autoservice' });
    expect(autoservice?.actual).toBeCloseTo(45_810_772.354, 3);
    expect(autoservice?.target).toBe(85_000_000);
    expect(autoservice?.sellers).toHaveLength(2);
    expect(autoservice?.sellers.reduce((sum, row) => sum + row.actual, 0)).toBeCloseTo(autoservice?.actual ?? 0, 5);
  });

  it('recalcula metas, tablas y tendencia con los filtros publicados', () => {
    const seller = buildGeneralReport({ mode: 'core', seller: 'Reventas' });
    expect(seller?.actual).toBeCloseTo(5_186.664, 3);
    expect(seller?.target).toBe(8_050);
    expect(seller?.sellers).toHaveLength(1);

    const strategicBrand = buildGeneralReport({ mode: 'strategic', brand: 'MaxPet' });
    expect(strategicBrand?.target).toBe(2_300);
    expect(strategicBrand?.brands).toHaveLength(1);
    expect(strategicBrand?.trend).toHaveLength(13);
  });
});
