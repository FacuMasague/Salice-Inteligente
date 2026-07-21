import { describe, expect, it } from 'vitest';
import { ACTIVE_DATA_ARTIFACTS, MANUAL_REFRESH_STAGES } from './refresh-plan';

describe('plan de actualización manual', () => {
  it('audita antes de activar y vuelve a auditar al final', () => {
    expect(MANUAL_REFRESH_STAGES.map((stage) => stage.id)).toEqual([
      'capture', 'capture-audit', 'sales-build', 'sales-audit', 'activation', 'snapshot-audit', 'platform-audit',
    ]);
  });

  it('incluye todas las bases activas que deben recuperarse ante una falla', () => {
    expect(ACTIVE_DATA_ARTIFACTS).toEqual(expect.arrayContaining([
      'data/snapshot.json', 'data/spt-gesi.sqlite', 'data/pending-balances.sqlite',
    ]));
  });
});
