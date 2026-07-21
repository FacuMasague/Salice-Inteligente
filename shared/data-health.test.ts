import { describe, expect, it } from 'vitest';
import { evaluateFreshness } from './data-health';

describe('data freshness', () => {
  const now = new Date('2026-07-20T15:00:00.000Z');

  it('distinguishes current, review-needed, and outdated data', () => {
    expect(evaluateFreshness('2026-07-20T13:00:00.000Z', now).level).toBe('current');
    expect(evaluateFreshness('2026-07-19T13:00:00.000Z', now).level).toBe('attention');
    expect(evaluateFreshness('2026-07-18T12:59:59.000Z', now).level).toBe('stale');
  });

  it('does not present an invalid date as current', () => {
    expect(evaluateFreshness('', now)).toMatchObject({ level: 'unknown', ageHours: null });
  });
});
