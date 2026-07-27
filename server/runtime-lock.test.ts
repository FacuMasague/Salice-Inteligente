import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireServerLock, activeServerPid } from './runtime-lock.js';

let temporaryDirectory = '';

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = '';
});

async function lockPath() {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'salice-runtime-lock-'));
  return join(temporaryDirectory, 'server.lock');
}

describe('runtime lock', () => {
  it('descarta un PID de otra instancia aunque coincida con un proceso local activo', async () => {
    const path = await lockPath();
    await writeFile(path, JSON.stringify({
      pid: process.pid,
      hostname: 'render-instance-anterior',
      token: 'anterior',
    }));

    expect(activeServerPid(path, 'render-instance-nueva')).toBeNull();
    expect(existsSync(path)).toBe(false);
  });

  it('mantiene la exclusión dentro de la misma instancia y libera sólo su propio lock', async () => {
    const path = await lockPath();
    const release = acquireServerLock(path);
    const lock = JSON.parse(await readFile(path, 'utf8')) as {
      pid: number;
      hostname: string;
      token: string;
    };

    expect(lock.pid).toBe(process.pid);
    expect(lock.hostname).toBe(hostname());
    expect(activeServerPid(path)).toBe(process.pid);
    expect(() => acquireServerLock(path)).toThrow(/ya está ejecutándose/);

    await writeFile(path, JSON.stringify({ ...lock, token: 'reemplazado' }));
    release();
    expect(existsSync(path)).toBe(true);
  });
});
