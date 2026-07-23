import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DashboardData } from '../shared/models.js';
import { productPriceHistoryStats, recordProductPriceSnapshot } from './operational-store.js';

async function readSnapshot(path: string) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as DashboardData;
    return value?.meta?.source === 'gesi' && value.meta.generatedAt && Array.isArray(value.products) ? value : null;
  } catch {
    return null;
  }
}

async function preservedBundleSnapshots(workspace: string) {
  const root = resolve(workspace, 'data/bundles');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const snapshots: DashboardData[] = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const manifest = await readFile(resolve(root, entry.name, 'manifest.json'), 'utf8')
      .then((value) => JSON.parse(value) as { artifacts?: { snapshot?: { path?: string } } })
      .catch(() => null);
    const relativePath = manifest?.artifacts?.snapshot?.path;
    const snapshot = relativePath ? await readSnapshot(resolve(workspace, relativePath)) : null;
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}

async function legacyBackupSnapshots(workspace: string) {
  const root = resolve(workspace, 'data/backups');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const snapshots: DashboardData[] = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.startsWith('snapshot-') && item.name.endsWith('.json'))) {
    const snapshot = await readSnapshot(resolve(root, entry.name));
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}

export async function initializeProductPriceHistory(activeSnapshot: DashboardData, workspace = process.cwd()) {
  const candidates = [
    ...(await legacyBackupSnapshots(workspace)),
    ...(await preservedBundleSnapshots(workspace)),
    activeSnapshot,
  ];
  const bySnapshot = new Map<string, DashboardData>();
  for (const snapshot of candidates) bySnapshot.set(snapshot.meta.generatedAt, snapshot);
  let inserted = 0;
  for (const snapshot of [...bySnapshot.values()].sort((a, b) => a.meta.generatedAt.localeCompare(b.meta.generatedAt))) {
    inserted += recordProductPriceSnapshot(snapshot, snapshot.meta.generatedAt === activeSnapshot.meta.generatedAt
      ? 'Snapshot activo GESI'
      : 'Snapshot preservado localmente').inserted;
  }
  return { inserted, ...productPriceHistoryStats() };
}
