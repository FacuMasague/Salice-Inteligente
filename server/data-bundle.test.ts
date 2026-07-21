import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateDataBundle,
  createBundlePaths,
  createDataBundleManifest,
  getActiveBundleManifest,
  resolveActiveDataPaths,
} from './data-bundle';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function candidate(workspace: string, id: string, capturedAt: string) {
  const paths = createBundlePaths(id, workspace);
  await mkdir(paths.directory, { recursive: true });
  const snapshot = JSON.stringify({ meta: { generatedAt: capturedAt, revision: 9 }, clients: [], products: [] });
  await writeFile(paths.snapshot, snapshot);
  await writeFile(paths.staging, snapshot);
  for (const path of [paths.commercial, paths.pendingBalances]) {
    const database = new DatabaseSync(path);
    database.exec('CREATE TABLE report_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    database.prepare('INSERT INTO report_meta VALUES (?, ?)').run('captured_at', capturedAt);
    database.close();
  }
  return { paths, manifest: await createDataBundleManifest(id, paths, workspace) };
}

describe('activación atómica de paquetes de datos', () => {
  it('cambia todos los artefactos mediante un único manifiesto activo', async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), 'salice-bundle-'));
    directories.push(workspace);
    const first = await candidate(workspace, 'first', '2026-07-20T10:00:00.000Z');
    await activateDataBundle(first.manifest, workspace);
    expect(resolveActiveDataPaths(workspace).bundleId).toBe('first');
    const second = await candidate(workspace, 'second', '2026-07-21T10:00:00.000Z');
    await activateDataBundle(second.manifest, workspace);
    const active = resolveActiveDataPaths(workspace);
    expect(active.bundleId).toBe('second');
    expect([active.snapshot, active.commercial, active.pendingBalances].every((path) => path.includes('/second/'))).toBe(true);
  });

  it('conserva intacto el paquete anterior si falla una verificación intermedia', async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), 'salice-bundle-failure-'));
    directories.push(workspace);
    const first = await candidate(workspace, 'stable', '2026-07-20T10:00:00.000Z');
    await activateDataBundle(first.manifest, workspace);
    const pointerBefore = await readFile(resolve(workspace, 'data/active-bundle.json'), 'utf8');
    const broken = await candidate(workspace, 'broken', '2026-07-21T10:00:00.000Z');
    await writeFile(broken.paths.snapshot, '{"corrupted":true}');
    await expect(activateDataBundle(broken.manifest, workspace)).rejects.toThrow(/checksum/);
    expect(await readFile(resolve(workspace, 'data/active-bundle.json'), 'utf8')).toBe(pointerBefore);
    expect(getActiveBundleManifest(workspace)?.bundleId).toBe('stable');
  });
});
