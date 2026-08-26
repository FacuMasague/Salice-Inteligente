import { describe, expect, it } from 'vitest';
import { calendarQuarterWindowsForYear, rollingCalendarQuarterWindows } from './rolling-quarter-series';

describe('serie móvil de trimestres calendario', () => {
  it('incluye los cinco trimestres observables en trece meses y declara los extremos parciales', () => {
    expect(rollingCalendarQuarterWindows('2026-08-24')).toEqual([
      expect.objectContaining({ label: 'T3 2025', start: '2025-08-01', end: '2025-09-30', isPartial: true, previousYearStart: '2024-08-01', previousYearEnd: '2024-09-30' }),
      expect.objectContaining({ label: 'T4 2025', start: '2025-10-01', end: '2025-12-31', isPartial: false }),
      expect.objectContaining({ label: 'T1 2026', start: '2026-01-01', end: '2026-03-31', isPartial: false }),
      expect.objectContaining({ label: 'T2 2026', start: '2026-04-01', end: '2026-06-30', isPartial: false }),
      expect.objectContaining({ label: 'T3 2026', start: '2026-07-01', end: '2026-08-24', isPartial: true, previousYearStart: '2025-07-01', previousYearEnd: '2025-08-24' }),
    ]);
  });

  it('respeta febrero bisiesto al formar la comparación interanual', () => {
    const latest = rollingCalendarQuarterWindows('2024-02-29').at(-1);
    expect(latest).toMatchObject({ label: 'T1 2024', end: '2024-02-29', previousYearEnd: '2023-02-28' });
  });

  it('publica solamente los trimestres alcanzados del año del corte', () => {
    expect(calendarQuarterWindowsForYear('2026-08-24')).toEqual([
      expect.objectContaining({ label: 'T1 2026', start: '2026-01-01', end: '2026-03-31', isPartial: false }),
      expect.objectContaining({ label: 'T2 2026', start: '2026-04-01', end: '2026-06-30', isPartial: false }),
      expect.objectContaining({ label: 'T3 2026', start: '2026-07-01', end: '2026-08-24', isPartial: true }),
    ]);
    expect(calendarQuarterWindowsForYear('2026-12-31')).toHaveLength(4);
  });

  it('no completa trimestres anteriores a la cobertura disponible', () => {
    const windows = rollingCalendarQuarterWindows('2026-08-24', 13, '2026-05-12');
    expect(windows[0]).toMatchObject({ label: 'T2 2026', start: '2026-05-12', isPartial: true });
    expect(windows).toHaveLength(2);
  });

  it('rechaza entradas inválidas sin inventar períodos', () => {
    expect(rollingCalendarQuarterWindows('')).toEqual([]);
    expect(rollingCalendarQuarterWindows('2026-08-24', 0)).toEqual([]);
  });
});
