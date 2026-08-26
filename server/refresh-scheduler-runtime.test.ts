import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startManualRefresh = vi.hoisted(() => vi.fn((
  _workspace: string,
  _trigger: string,
  _options?: { onExit?: (outcome: unknown) => void },
) => ({ started: true as const })));

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
    expect(startManualRefresh).toHaveBeenCalledWith(
      '/tmp/salice-bootstrap-test',
      'bootstrap',
      expect.objectContaining({ onExit: expect.any(Function) }),
    );
  });

  it('recupera el último turno perdido después de un reinicio', async () => {
    startAutomaticRefreshScheduler('/tmp/salice-catch-up-test', {
      lastSuccessfulAt: '2026-07-26T18:30:00.000Z',
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(startManualRefresh).toHaveBeenCalledOnce();
    expect(startManualRefresh).toHaveBeenCalledWith(
      '/tmp/salice-catch-up-test',
      'scheduled',
      expect.objectContaining({ onExit: expect.any(Function) }),
    );
  });

  it('reintenta un timeout una hora después y se detiene luego del tercer intento', async () => {
    process.env.SALICE_AUTO_REFRESH_TIMES = '03:00';
    startAutomaticRefreshScheduler('/tmp/salice-timeout-retry-test', {
      bootstrap: true,
      lastSuccessfulAt: new Date().toISOString(),
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const firstOptions = startManualRefresh.mock.calls[0]?.[2] as { onExit: (outcome: unknown) => void };
    firstOptions.onExit({ code: 75, signal: null, timedOut: true });

    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000 - 1);
    expect(startManualRefresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(startManualRefresh).toHaveBeenNthCalledWith(
      2,
      '/tmp/salice-timeout-retry-test',
      'bootstrap-retry-2',
      expect.objectContaining({ onExit: expect.any(Function) }),
    );

    const secondOptions = startManualRefresh.mock.calls[1]?.[2] as { onExit: (outcome: unknown) => void };
    secondOptions.onExit({ code: 75, signal: null, timedOut: true });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(startManualRefresh).toHaveBeenNthCalledWith(
      3,
      '/tmp/salice-timeout-retry-test',
      'bootstrap-retry-3',
      expect.objectContaining({ onExit: expect.any(Function) }),
    );

    const thirdOptions = startManualRefresh.mock.calls[2]?.[2] as { onExit: (outcome: unknown) => void };
    thirdOptions.onExit({ code: 75, signal: null, timedOut: true });
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1_000);
    expect(startManualRefresh).toHaveBeenCalledTimes(3);
  });

  it('no reintenta fallas que no sean timeouts', async () => {
    process.env.SALICE_AUTO_REFRESH_TIMES = '03:00';
    startAutomaticRefreshScheduler('/tmp/salice-functional-failure-test', {
      bootstrap: true,
      lastSuccessfulAt: new Date().toISOString(),
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const options = startManualRefresh.mock.calls[0]?.[2] as { onExit: (outcome: unknown) => void };
    options.onExit({ code: 1, signal: null, timedOut: false });
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1_000);
    expect(startManualRefresh).toHaveBeenCalledTimes(1);
  });
});
