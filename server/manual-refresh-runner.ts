import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

let activeProcess: ChildProcess | null = null;
let startedAt = '';
let trigger = '';
let lastExit: { at: string; code: number | null; signal: NodeJS.Signals | null } | null = null;

export function manualRefreshProcessStatus() {
  return {
    running: Boolean(activeProcess),
    startedAt: activeProcess ? startedAt : null,
    trigger: activeProcess ? trigger : null,
    pid: activeProcess?.pid ?? null,
    lastExit,
  };
}

export function startManualRefresh(workspace = process.cwd(), requestedTrigger = 'manual') {
  if (activeProcess) return { started: false as const, ...manualRefreshProcessStatus() };
  const tsxCli = resolve(workspace, 'node_modules/tsx/dist/cli.mjs');
  const script = resolve(workspace, 'scripts/refresh-gesi-manual.ts');
  startedAt = new Date().toISOString();
  trigger = requestedTrigger;
  const child = spawn(process.execPath, [tsxCli, script], {
    cwd: workspace,
    env: { ...process.env, SALICE_REFRESH_TRIGGER: requestedTrigger },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  activeProcess = child;
  child.once('error', (error) => {
    console.error(`No se pudo iniciar la actualización manual: ${error.message}`);
    lastExit = { at: new Date().toISOString(), code: null, signal: null };
    activeProcess = null;
  });
  child.once('exit', (code, signal) => {
    lastExit = { at: new Date().toISOString(), code, signal };
    activeProcess = null;
  });
  return { started: true as const, ...manualRefreshProcessStatus() };
}
