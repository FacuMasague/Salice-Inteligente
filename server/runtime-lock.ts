import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const SERVER_LOCK_PATH = process.env.SALICE_SERVER_LOCK_PATH
  ? resolve(process.env.SALICE_SERVER_LOCK_PATH)
  : resolve(process.cwd(), 'data/salice-server.lock');

export function processIsAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

interface ServerLock {
  pid?: number;
  hostname?: string;
  token?: string;
}

export function activeServerPid(path = SERVER_LOCK_PATH, currentHostname = hostname()) {
  if (!existsSync(path)) return null;
  try {
    const lock = JSON.parse(readFileSync(path, 'utf8')) as ServerLock;
    // Los PID sólo son comparables dentro de la misma instancia. En un redeploy
    // de Render, el contenedor nuevo puede reutilizar el PID del anterior aunque
    // el proceso viejo ya no exista en su namespace.
    if (
      (lock.hostname && lock.hostname !== currentHostname)
      || (process.env.RENDER && !lock.hostname)
    ) {
      rmSync(path, { force: true });
      return null;
    }
    const pid = Number(lock.pid);
    if (processIsAlive(pid)) return pid;
  } catch { /* el lock inválido se reemplaza */ }
  rmSync(path, { force: true });
  return null;
}

export function acquireServerLock(path = SERVER_LOCK_PATH) {
  const active = activeServerPid(path);
  if (active) throw new Error(`Salice Inteligente ya está ejecutándose (PID ${active}).`);
  const token = randomUUID();
  const descriptor = openSync(path, 'wx');
  writeFileSync(descriptor, JSON.stringify({
    pid: process.pid,
    hostname: hostname(),
    token,
    startedAt: new Date().toISOString(),
  }));
  closeSync(descriptor);
  const release = () => {
    try {
      const current = JSON.parse(readFileSync(path, 'utf8')) as ServerLock;
      if (current.token === token) rmSync(path, { force: true });
    } catch { /* otro proceso ya liberó o reemplazó el lock */ }
  };
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  process.once('SIGTERM', () => { release(); process.exit(143); });
  return release;
}
