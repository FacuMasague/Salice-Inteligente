import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMarsReport, getMarsReportMeta, marsPeriodsForYear } from './mars-report';
import { resolveActiveDataPaths } from './data-bundle';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

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
    expect(meta.rowCount).toBeGreaterThan(0);
    expect(meta.maxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.latestYear).toBe(meta.maxDate.slice(0, 4));
    expect(meta.latestPeriod).toMatch(/^P(?:0[1-9]|1[0-3])$/);
    expect(meta.universe).toEqual({
      companies: [3],
      branches: [3],
      productGroup: 'Pet Nutrition',
      excludedClients: ['Via Salice MDP S.A.'],
    });
    expect(meta.options.brand).toEqual(expect.arrayContaining(['Iams', 'Optimum', 'Pedigree', 'Whiskas']));
  }, 15_000);

  it('reconcilia un período completo entre cuentas, sucursales y evolución', () => {
    const report = buildMarsReport({ year: '2026', period: 'P07', clientMode: 'branch' });
    expect(report).not.toBeNull();
    expect(report!.isPartial).toBe(false);
    expect(report!.elapsedDays).toBe(28);
    expect(report!.current.kilos).toBeGreaterThan(0);
    expect(report!.current.accounts).toBeGreaterThan(0);
    expect(report!.current.clientBranches).toBeGreaterThanOrEqual(report!.current.accounts);
    expect(report!.current.clients).toBe(report!.current.clientBranches);
    expect(report!.ytd.accounts).toBeGreaterThanOrEqual(report!.current.accounts);
    expect(report!.periods.find((period) => period.label === 'P07')?.kilos).toBeCloseTo(report!.current.kilos, 6);
  }, 15_000);

  it('marca el último período como parcial y usa un corte interanual equivalente', () => {
    const meta = getMarsReportMeta();
    const report = buildMarsReport({ year: meta.latestYear, period: meta.latestPeriod, clientMode: 'account' });
    expect(report).not.toBeNull();
    const definition = marsPeriodsForYear(Number(meta.latestYear)).find((period) => period.label === meta.latestPeriod)!;
    expect(report!.isPartial).toBe(meta.maxDate < definition.end);
    expect(report!.elapsedDays).toBeGreaterThan(0);
    expect(report!.elapsedDays).toBeLessThanOrEqual(35);
    expect(report!.current.kilos).toBeGreaterThan(0);
    expect(report!.current.clients).toBe(report!.current.accounts);
    expect(report!.periods.find((period) => period.label === meta.latestPeriod)?.isPartial).toBe(report!.isPartial);
    expect(report!.brands.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(report!.current.kilos, 6);
    expect(report!.quarters.length).toBeGreaterThanOrEqual(1);
    expect(report!.quarters.length).toBeLessThanOrEqual(4);
    expect(report!.quarters.at(-1)?.end).toBe(meta.reportingDate);
    expect(report!.quarters.every((row) => row.year === Number(meta.latestYear) && new RegExp(`^Q[1-4] ${meta.latestYear}$`).test(row.label))).toBe(true);
    expect(report!.quarters.filter((row) => !row.comparisonAvailable).every((row) => row.previousYearKilos == null)).toBe(true);
    const windowStart = report!.quarters[0].start;
    const windowEnd = report!.quarters.at(-1)!.end;
    const windowPeriods = report!.periods.filter((period) => period.start >= windowStart && period.start <= windowEnd);
    expect(report!.quarters.reduce((sum, row) => sum + row.kilos, 0)).toBeCloseTo(windowPeriods.reduce((sum, row) => sum + row.kilos, 0), 6);
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
