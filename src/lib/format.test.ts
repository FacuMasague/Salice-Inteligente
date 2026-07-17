import { describe, expect, it } from 'vitest';
import { longDate } from './format';

describe('formatos de fecha', () => {
  it('mantiene el día calendario en fechas sin hora', () => {
    expect(longDate('2026-07-17')).toContain('17 de julio de 2026');
  });
});
