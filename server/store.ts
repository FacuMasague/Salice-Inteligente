import { readFile, stat } from 'node:fs/promises';
import { APP_VERSION, type DashboardData } from '../shared/models.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { ensureLocalDemoData } from './local-demo-data.js';
import { mergeOperationalData } from './operational-store.js';

let cachedSnapshot: DashboardData | null = null;
let cachedMtime = -1;

export async function ensureSnapshot() {
  ensureLocalDemoData();
}

export async function loadSnapshot(): Promise<DashboardData> {
  await ensureSnapshot();
  const path = resolveActiveDataPaths().snapshot;
  const info = await stat(path);
  if (!cachedSnapshot || cachedMtime !== info.mtimeMs) {
    cachedSnapshot = JSON.parse(await readFile(path, 'utf8')) as DashboardData;
    cachedMtime = info.mtimeMs;
  }
  const merged = mergeOperationalData(cachedSnapshot);
  return { ...merged, meta: { ...merged.meta, version: APP_VERSION } };
}

export function getSnapshotPath() {
  return resolveActiveDataPaths().snapshot;
}

export async function getBackupCount() {
  return 0;
}
