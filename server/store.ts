import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SNAPSHOT_REVISION, type DashboardData } from '../shared/models.js';
import { createDemoSnapshot } from './data/demo-snapshot.js';
import { importSnapshotNotes, mergeOperationalData } from './operational-store.js';

const snapshotPath = resolve(process.cwd(), 'data/snapshot.json');
const backupDirectory = resolve(process.cwd(), 'data/backups');
let ensured = false;
let cachedSnapshot: DashboardData | null = null;
let cachedMtime = -1;

async function backupCurrentSnapshot() {
  try {
    await stat(snapshotPath);
  } catch {
    return;
  }
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await copyFile(snapshotPath, resolve(backupDirectory, `snapshot-${stamp}.json`));
  const backups = (await readdir(backupDirectory))
    .filter((name) => name.startsWith('snapshot-') && name.endsWith('.json'))
    .sort()
    .reverse();
  await Promise.all(backups.slice(3).map((name) => unlink(resolve(backupDirectory, name))));
}

export async function ensureSnapshot() {
  if (ensured) return;
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as DashboardData;
    if (snapshot.meta.source === 'demo' && snapshot.meta.revision !== SNAPSHOT_REVISION) {
      await saveSnapshot(createDemoSnapshot());
    } else if (snapshot.meta.revision !== SNAPSHOT_REVISION) {
      throw new Error(`El snapshot real usa la revisión ${snapshot.meta.revision}; ejecutá npm run sync:gesi para migrarlo a ${SNAPSHOT_REVISION}.`);
    } else {
      importSnapshotNotes(snapshot);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveSnapshot(createDemoSnapshot());
    } else {
      throw new Error(`No se pudo validar el snapshot activo. Se conserva el archivo sin reemplazarlo. ${(error as Error).message}`);
    }
  }
  ensured = true;
}

export async function loadSnapshot(): Promise<DashboardData> {
  await ensureSnapshot();
  const info = await stat(snapshotPath);
  if (!cachedSnapshot || cachedMtime !== info.mtimeMs) {
    cachedSnapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as DashboardData;
    cachedMtime = info.mtimeMs;
  }
  return mergeOperationalData(cachedSnapshot);
}

export async function saveSnapshot(snapshot: DashboardData) {
  await mkdir(dirname(snapshotPath), { recursive: true });
  await backupCurrentSnapshot();
  const temporaryPath = `${snapshotPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
  await rename(temporaryPath, snapshotPath);
  const info = await stat(snapshotPath);
  cachedSnapshot = snapshot;
  cachedMtime = info.mtimeMs;
}

export function getSnapshotPath() {
  return snapshotPath;
}

export async function getBackupCount() {
  try {
    return (await readdir(backupDirectory)).filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}
