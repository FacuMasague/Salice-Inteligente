import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startManualRefresh = vi.hoisted(() => vi.fn(() => ({ started: true as const })));

vi.mock('./manual-refresh-runner.js', () => ({ startManualRefresh }));

import { startAutomaticRefreshScheduler, stopAutomaticRefreshScheduler } from './refresh-scheduler';

describe('disparador automático v0.11', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T16:00:00.000Z'));
    process.env.SALICE_AUTO_REFRESH_ENABLED = 'true';
    process.env.SALICE_AUTO_REFRESH_TIMES = '03:00,15:00';
    process.env.SALICE_AUTO_REFRESH_TIME_ZONE = 'America/Argentina/Buenos_Aires';
    startManualRefresh.mockClear();
  });

  afterEach(() => {
    stopAutomaticRefreshScheduler();
    vi.useRealTimers();
    delete process.env.SALICE_AUTO_REFRESH_ENABLED;
    delete process.env.SALICE_AUTO_REFRESH_TIMES;
    delete process.env.SALICE_AUTO_REFRESH_TIME_ZONE;
  });

  it('inicia el bootstrap de un disco nuevo sin esperar al próximo horario', async () => {
    startAutomaticRefreshScheduler('/tmp/salice-bootstrap-test', {
      bootstrap: true,
      lastSuccessfulAt: new Date().toISOString(),
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(startManualRefresh).toHaveBeenCalledOnce();
    expect(startManualRefresh).toHaveBeenCalledWith('/tmp/salice-bootstrap-test', 'bootstrap');
  });

  it('recupera el último turno perdido después de un reinicio', async () => {
    startAutomaticRefreshScheduler('/tmp/salice-catch-up-test', {
      lastSuccessfulAt: '2026-07-26T18:30:00.000Z',
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(startManualRefresh).toHaveBeenCalledOnce();
    expect(startManualRefresh).toHaveBeenCalledWith('/tmp/salice-catch-up-test', 'scheduled');
  });
});
