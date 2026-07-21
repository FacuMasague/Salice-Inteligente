import { describe, expect, it } from 'vitest';
import { cutoffDate, daysInclusive, isoDate, previousThreeFullMonths, shiftDays, shiftedMonth } from './reporting-periods';

describe('canonical reporting cutoffs', () => {
  it('caps the equivalent cutoff at the actual last day of the month', () => {
    expect(isoDate(cutoffDate(2026, 1, 31))).toBe('2026-02-28');
    expect(isoDate(cutoffDate(2024, 1, 31))).toBe('2024-02-29');
  });

  it('calculates inclusive windows and offsets independently of timezone', () => {
    expect(daysInclusive('2026-07-01', '2026-07-20')).toBe(20);
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftedMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('defines the previous three complete calendar months', () => {
    expect(previousThreeFullMonths('2026-07-20')).toEqual({ from: '2026-04-01', through: '2026-06-30' });
  });
});
