import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SERVER_LOCK_PATH = resolve(process.cwd(), 'data/salice-server.lock');

export function processIsAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function activeServerPid(path = SERVER_LOCK_PATH) {
  if (!existsSync(path)) return null;
  try {
    const pid = Number((JSON.parse(readFileSync(path, 'utf8')) as { pid?: number }).pid);
    if (processIsAlive(pid)) return pid;
  } catch { /* el lock inválido se reemplaza */ }
  rmSync(path, { force: true });
  return null;
}

export function acquireServerLock(path = SERVER_LOCK_PATH) {
  const active = activeServerPid(path);
  if (active) throw new Error(`Salice Inteligente ya está ejecutándose (PID ${active}).`);
  const descriptor = openSync(path, 'wx');
  writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  closeSync(descriptor);
  const release = () => rmSync(path, { force: true });
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  process.once('SIGTERM', () => { release(); process.exit(143); });
  return release;
}
