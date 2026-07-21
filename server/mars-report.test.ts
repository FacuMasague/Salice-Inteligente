import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMarsReport, getMarsReportMeta, marsPeriodsForYear } from './mars-report';

const describeWithDatabase = existsSync(resolve(process.cwd(), 'data/spt-gesi.sqlite')) ? describe : describe.skip;

describeWithDatabase('Reporte Mars construido desde GESI', () => {
  it('reconstruye el calendario comercial de 13 períodos', () => {
    const periods = marsPeriodsForYear(2026);
    expect(periods).toHaveLength(13);
    expect(periods[0]).toMatchObject({ label: 'P01', quarter: 'Q1', start: '2025-12-28', end: '2026-01-24', days: 28 });
    expect(periods[6]).toMatchObject({ label: 'P07', quarter: 'Q3', start: '2026-06-14', end: '2026-07-11', days: 28 });
    expect(periods[12]).toMatchObject({ label: 'P13', quarter: 'Q4', start: '2026-11-29', end: '2027-01-02', days: 35 });
  });

  it('declara a GESI como fuente y aplica el universo Mars de Salice', () => {
    const meta = getMarsReportMeta();
    expect(meta.available).toBe(true);
    expect(meta.sourceSystem).toContain('GESI API');
    expect(meta.rowCount).toBeGreaterThan(120_000);
    expect(meta.maxDate).toBe('2026-07-20');
    expect(meta.latestYear).toBe('2026');
    expect(meta.latestPeriod).toBe('P08');
    expect(meta.universe).toEqual({
      companies: [3],
      branches: [3],
      productGroup: 'Pet Nutrition',
      excludedClients: ['Via Salice MDP S.A.'],
    });
    expect(meta.options.brand).toEqual(expect.arrayContaining(['Iams', 'Optimum', 'Pedigree', 'Whiskas']));
  }, 15_000);

  it('concilia P07 con las cuentas y sucursales de referencia', () => {
    const report = buildMarsReport({ year: '2026', period: 'P07', clientMode: 'branch' });
    expect(report).not.toBeNull();
    expect(report!.isPartial).toBe(false);
    expect(report!.elapsedDays).toBe(28);
    expect(report!.current.kilos).toBeCloseTo(37_375.825, 3);
    expect(report!.current.accounts).toBe(491);
    expect(report!.current.clientBranches).toBe(520);
    expect(report!.current.clients).toBe(520);
    expect(report!.ytd.accounts).toBe(787);
    expect(report!.periods.find((period) => period.label === 'P07')?.kilos).toBeCloseTo(report!.current.kilos, 6);
  }, 15_000);

  it('marca el último período como parcial y usa un corte interanual equivalente', () => {
    const report = buildMarsReport({ year: '2026', period: 'P08', clientMode: 'account' });
    expect(report).not.toBeNull();
    expect(report!.isPartial).toBe(true);
    expect(report!.elapsedDays).toBe(9);
    expect(report!.current.kilos).toBeGreaterThan(8_000);
    expect(report!.current.clients).toBe(report!.current.accounts);
    expect(report!.periods.at(-1)?.isPartial).toBe(true);
    expect(report!.brands.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.quarters.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.periods.reduce((sum, row) => sum + row.kilos, 0), 6);
  }, 15_000);

  it('recalcula todas las métricas al filtrar una marca', () => {
    const full = buildMarsReport({ year: '2026', period: 'P07' });
    const filtered = buildMarsReport({ year: '2026', period: 'P07', brand: 'Whiskas' });
    expect(filtered).not.toBeNull();
    expect(filtered!.filters.brand).toBe('Whiskas');
    expect(filtered!.current.kilos).toBeGreaterThan(0);
    expect(filtered!.current.kilos).toBeLessThan(full!.current.kilos);
    expect(filtered!.brands).toHaveLength(1);
    expect(filtered!.brands[0].brand).toBe('Whiskas');
  }, 15_000);
});
