import { describe, expect, it } from 'vitest';
import { evaluateFreshness } from './data-health';

describe('frescura de datos', () => {
  const now = new Date('2026-07-20T15:00:00.000Z');

  it('distingue datos actuales, a revisar y desactualizados', () => {
    expect(evaluateFreshness('2026-07-20T13:00:00.000Z', now).level).toBe('current');
    expect(evaluateFreshness('2026-07-19T13:00:00.000Z', now).level).toBe('attention');
    expect(evaluateFreshness('2026-07-18T12:59:59.000Z', now).level).toBe('stale');
  });

  it('no presenta una fecha inválida como vigente', () => {
    expect(evaluateFreshness('', now)).toMatchObject({ level: 'unknown', ageHours: null });
  });
});
