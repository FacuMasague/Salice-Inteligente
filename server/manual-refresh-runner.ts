import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { sendDeveloperAlert } from './developer-alerts.js';
import { listRefreshRuns, recoverInterruptedRefreshRuns } from './operational-store.js';
import { REFRESH_TIMEOUT_EXIT_CODE } from '../shared/refresh-retry.js';

let activeProcess: ChildProcess | null = null;
let startedAt = '';
let trigger = '';
let lastExit: { at: string; code: number | null; signal: NodeJS.Signals | null } | null = null;

export interface RefreshProcessOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

interface StartManualRefreshOptions {
  onExit?: (outcome: RefreshProcessOutcome) => void;
}

export function manualRefreshProcessStatus() {
  return {
    running: Boolean(activeProcess),
    startedAt: activeProcess ? startedAt : null,
    trigger: activeProcess ? trigger : null,
    pid: activeProcess?.pid ?? null,
    lastExit,
  };
}

export function startManualRefresh(
  workspace = process.cwd(),
  requestedTrigger = 'manual',
  options: StartManualRefreshOptions = {},
) {
  if (activeProcess) return { started: false as const, ...manualRefreshProcessStatus() };
  const tsxCli = resolve(workspace, 'node_modules/tsx/dist/cli.mjs');
  const script = resolve(workspace, 'scripts/refresh-gesi-manual.ts');
  const controllerHeapMb = Math.max(256, Number(process.env.SALICE_REFRESH_CONTROLLER_HEAP_MB) || 384);
  startedAt = new Date().toISOString();
  trigger = requestedTrigger;
  const child = spawn(process.execPath, [`--max-old-space-size=${controllerHeapMb}`, tsxCli, script], {
    cwd: workspace,
    env: { ...process.env, SALICE_REFRESH_TRIGGER: requestedTrigger },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  activeProcess = child;
  let exitReported = false;
  const reportExit = (outcome: RefreshProcessOutcome) => {
    if (exitReported) return;
    exitReported = true;
    options.onExit?.(outcome);
  };
  const closeOrphanedRun = (reason: string) => {
    try {
      recoverInterruptedRefreshRuns(reason, { startedAfter: startedAt, trigger: requestedTrigger });
    } catch (error) {
      console.error(`No se pudo cerrar el registro de la actualización interrumpida: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  child.once('error', (error) => {
    console.error(`No se pudo iniciar la actualización manual: ${error.message}`);
    lastExit = { at: new Date().toISOString(), code: null, signal: null };
    activeProcess = null;
    closeOrphanedRun('El controlador no pudo iniciar o sostener el proceso de actualización; se liberó el estado en curso.');
    void sendDeveloperAlert({
      kind: 'refresh-process', severity: 'critical', title: 'No se pudo iniciar la actualización de datos',
      detail: error.message, source: `controlador de actualización · ${requestedTrigger}`,
    }).catch(() => undefined);
    reportExit({ code: null, signal: null, timedOut: false });
  });
  child.once('exit', (code, signal) => {
    lastExit = { at: new Date().toISOString(), code, signal };
    activeProcess = null;
    closeOrphanedRun(signal
      ? `El proceso de actualización terminó por la señal ${signal}; se liberó el estado en curso.`
      : `El proceso de actualización terminó con código ${code ?? 'desconocido'} sin cerrar su ejecución; se liberó el estado en curso.`);
    if (code !== 0 || signal) {
      try {
        const lastAttempt = listRefreshRuns(1)[0];
        const alreadyReported = lastAttempt?.status === 'failed'
          && new Date(lastAttempt.startedAt).getTime() >= new Date(startedAt).getTime() - 5_000;
        if (!alreadyReported) {
          void sendDeveloperAlert({
            kind: 'refresh-process', severity: 'error', title: 'La actualización de datos terminó de forma anormal',
            detail: signal ? `Señal: ${signal}` : `Código de salida: ${code ?? 'desconocido'}`,
            source: `controlador de actualización · ${requestedTrigger}`,
          }).catch(() => undefined);
        }
      } catch {
        void sendDeveloperAlert({
          kind: 'refresh-process', severity: 'error', title: 'La actualización de datos terminó de forma anormal',
          detail: signal ? `Señal: ${signal}` : `Código de salida: ${code ?? 'desconocido'}`,
          source: `controlador de actualización · ${requestedTrigger}`,
        }).catch(() => undefined);
      }
    }
    reportExit({ code, signal, timedOut: !signal && code === REFRESH_TIMEOUT_EXIT_CODE });
  });
  return { started: true as const, ...manualRefreshProcessStatus() };
}
