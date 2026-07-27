import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFRESH_TIME_ZONE,
  nextScheduledRefresh,
  parseRefreshTimes,
  previousScheduledRefresh,
} from './refresh-scheduler';

describe('programación automática v0.11', () => {
  it('normaliza y deduplica los horarios configurados', () => {
    expect(parseRefreshTimes('15:00, 03:00,15:00,25:00')).toEqual(['03:00', '15:00']);
    expect(parseRefreshTimes(undefined)).toEqual(['03:00', '15:00']);
  });

  it('programa las 03:00 y 15:00 según la hora de Buenos Aires', () => {
    expect(nextScheduledRefresh(
      new Date('2026-07-27T12:00:00.000Z'),
      ['03:00', '15:00'],
      DEFAULT_REFRESH_TIME_ZONE,
    )?.toISOString()).toBe('2026-07-27T18:00:00.000Z');

    expect(nextScheduledRefresh(
      new Date('2026-07-27T18:00:00.000Z'),
      ['03:00', '15:00'],
      DEFAULT_REFRESH_TIME_ZONE,
    )?.toISOString()).toBe('2026-07-28T06:00:00.000Z');

    expect(nextScheduledRefresh(
      new Date('2026-07-27T19:00:00.000Z'),
      ['03:00', '15:00'],
      DEFAULT_REFRESH_TIME_ZONE,
    )?.toISOString()).toBe('2026-07-28T06:00:00.000Z');

    expect(previousScheduledRefresh(
      new Date('2026-07-27T19:00:00.000Z'),
      ['03:00', '15:00'],
      DEFAULT_REFRESH_TIME_ZONE,
    )?.toISOString()).toBe('2026-07-27T18:00:00.000Z');
  });
});
