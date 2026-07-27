import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let directory = '';
let store: typeof import('./operational-store');

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'salice-refresh-recovery-'));
  process.env.SALICE_OPERATIONS_DB_PATH = join(directory, 'operations.sqlite');
  vi.resetModules();
  store = await import('./operational-store');
});

afterAll(() => {
  delete process.env.SALICE_OPERATIONS_DB_PATH;
  rmSync(directory, { recursive: true, force: true });
});

describe('recuperación de actualizaciones interrumpidas v0.11', () => {
  it('cierra una ejecución huérfana y permite comenzar el catch-up inmediatamente', () => {
    const interrupted = store.beginRefreshRun('scheduled');
    store.updateRefreshRunStage(interrupted.id, 'capture');

    expect(store.recoverInterruptedRefreshRuns()).toBe(1);
    const closed = store.listRefreshRuns(1)[0];
    expect(closed).toMatchObject({
      id: interrupted.id,
      status: 'failed',
      stage: 'capture',
      qualityStatus: 'failed',
    });
    expect(closed.completedAt).not.toBeNull();
    expect(closed.error).toMatch(/reinicio del servidor/);

    const catchUp = store.beginRefreshRun('scheduled');
    expect(catchUp.status).toBe('running');
    store.failRefreshRun(catchUp.id, 'test-complete', new Error('Cierre de prueba'));
  });
});
