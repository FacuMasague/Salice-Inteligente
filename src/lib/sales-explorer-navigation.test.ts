import { describe, expect, it } from 'vitest';
import { shouldAdvanceFromPeriod } from './sales-explorer-navigation';

describe('navegación del Explorador de ventas', () => {
  it('permanece en períodos al elegir un mes o rango', () => {
    expect(shouldAdvanceFromPeriod('2026-07-01', '2026-07-30')).toBe(false);
  });

  it('avanza automáticamente sólo al llegar a un día', () => {
    expect(shouldAdvanceFromPeriod('2026-07-15', '2026-07-15')).toBe(true);
  });
});
