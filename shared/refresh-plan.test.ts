import { describe, expect, it } from 'vitest';
import { MANUAL_REFRESH_STAGES } from './refresh-plan';

describe('plan de actualización manual', () => {
  it('audita antes de activar y vuelve a auditar al final', () => {
    expect(MANUAL_REFRESH_STAGES.map((stage) => stage.id)).toEqual([
      'capture', 'capture-audit', 'sales-build', 'sales-audit', 'activation', 'snapshot-audit', 'vector-audit', 'platform-audit',
    ]);
  });

  it('construye y audita sin mutar archivos activos antes del manifiesto', () => {
    expect(MANUAL_REFRESH_STAGES.every((stage) => stage.mutatesActiveData === false)).toBe(true);
  });
});
