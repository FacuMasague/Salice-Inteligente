import { describe, expect, it } from 'vitest';
import { evaluateProductVectorVersionGovernance } from './product-vector-version-governance';

describe('gobierno de versiones vectoriales', () => {
  it('no exige repetir la comparación durante una actualización de datos con el mismo motor', () => {
    expect(evaluateProductVectorVersionGovernance({
      snapshotAt: '2026-07-22T16:50:00.000Z',
      currentVersion: '2.2',
      previousVersion: '2.2',
      comparison: null,
      comparisonPath: '/candidate/quality/comparison.json',
    })).toMatchObject({ passed: true, transitionRequired: false });
  });

  it('exige evidencia aprobada cuando cambia el motor', () => {
    expect(evaluateProductVectorVersionGovernance({
      snapshotAt: '2026-07-22T16:50:00.000Z',
      currentVersion: '2.2',
      previousVersion: '2.1',
      comparison: null,
      comparisonPath: '/candidate/quality/comparison.json',
    })).toMatchObject({ passed: false, transitionRequired: true });
  });

  it('acepta una transición respaldada por la comparación del mismo snapshot', () => {
    expect(evaluateProductVectorVersionGovernance({
      snapshotAt: '2026-07-22T16:50:00.000Z',
      currentVersion: '2.2',
      previousVersion: '2.1',
      comparisonPath: '/candidate/quality/comparison.json',
      comparison: {
        snapshotAt: '2026-07-22T16:50:00.000Z',
        versions: { from: '2.1', to: '2.2' },
        criteria: { passed: true },
      },
    })).toMatchObject({ passed: true, transitionRequired: true });
  });
});
