import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type CoreDataArtifactKey = 'snapshot' | 'staging' | 'commercial' | 'pendingBalances';
export type DataArtifactKey = CoreDataArtifactKey | 'executiveSummary';

export interface DataBundleArtifact {
  path: string;
  bytes: number;
  sha256: string;
}

export interface DataBundleManifest {
  schemaVersion: 1;
  bundleId: string;
  createdAt: string;
  activatedAt: string | null;
  capturedAt: string;
  snapshotRevision: number;
  artifacts: Record<CoreDataArtifactKey, DataBundleArtifact> & Partial<Record<'executiveSummary', DataBundleArtifact>>;
}

export interface ActiveDataPaths {
  snapshot: string;
  staging: string;
  commercial: string;
  pendingBalances: string;
  executiveSummary: string;
  manifest: string | null;
  bundleId: string | null;
  platformAudit: string;
  vectorAudit: string;
  sptAudit: string;
}

const POINTER_FILE = 'data/active-bundle.json';
const LEGACY_PATHS: Record<CoreDataArtifactKey, string> & Record<'executiveSummary', string> = {
  snapshot: 'data/snapshot.json',
  staging: 'data/staging/snapshot-gesi.json',
  commercial: 'data/spt-gesi.sqlite',
  pendingBalances: 'data/pending-balances.sqlite',
  executiveSummary: 'data/executive-summary.json',
};

function absolute(workspace: string, path: string) {
  return resolve(workspace, path);
}

export function getActiveBundleManifest(workspace = process.cwd()): DataBundleManifest | null {
  const pointer = resolve(workspace, POINTER_FILE);
  if (!existsSync(pointer)) return null;
  try {
    const manifest = JSON.parse(readFileSync(pointer, 'utf8')) as DataBundleManifest;
    if (manifest.schemaVersion !== 1 || !manifest.bundleId || !manifest.artifacts) return null;
    return manifest;
  } catch {
    return null;
  }
}

export function resolveActiveDataPaths(workspace = process.cwd()): ActiveDataPaths {
  const manifest = getActiveBundleManifest(workspace);
  if (!manifest) {
    return {
      snapshot: absolute(workspace, LEGACY_PATHS.snapshot),
      staging: absolute(workspace, LEGACY_PATHS.staging),
      commercial: absolute(workspace, LEGACY_PATHS.commercial),
      pendingBalances: absolute(workspace, LEGACY_PATHS.pendingBalances),
      executiveSummary: absolute(workspace, LEGACY_PATHS.executiveSummary),
      manifest: null,
      bundleId: null,
      platformAudit: absolute(workspace, 'data/quality/platform-audit.json'),
      vectorAudit: absolute(workspace, 'data/quality/product-vectors.json'),
      sptAudit: absolute(workspace, 'data/quality/spt-gesi-audit.json'),
    };
  }
  return {
    snapshot: absolute(workspace, manifest.artifacts.snapshot.path),
    staging: absolute(workspace, manifest.artifacts.staging.path),
    commercial: absolute(workspace, manifest.artifacts.commercial.path),
    pendingBalances: absolute(workspace, manifest.artifacts.pendingBalances.path),
    executiveSummary: manifest.artifacts.executiveSummary
      ? absolute(workspace, manifest.artifacts.executiveSummary.path)
      : absolute(workspace, `data/bundles/${manifest.bundleId}/executive-summary.json`),
    manifest: resolve(workspace, POINTER_FILE),
    bundleId: manifest.bundleId,
    platformAudit: absolute(workspace, `data/bundles/${manifest.bundleId}/quality/platform-audit.json`),
    vectorAudit: absolute(workspace, `data/bundles/${manifest.bundleId}/quality/product-vectors.json`),
    sptAudit: absolute(workspace, `data/bundles/${manifest.bundleId}/quality/spt-gesi-audit.json`),
  };
}

export function createBundlePaths(bundleId: string, workspace = process.cwd()) {
  const directory = resolve(workspace, 'data/bundles', bundleId);
  return {
    directory,
    snapshot: resolve(directory, 'snapshot.json'),
    staging: resolve(directory, 'snapshot-staging.json'),
    commercial: resolve(directory, 'spt-gesi.sqlite'),
    pendingBalances: resolve(directory, 'pending-balances.sqlite'),
    executiveSummary: resolve(directory, 'executive-summary.json'),
    manifest: resolve(directory, 'manifest.json'),
  };
}

async function digest(path: string) {
  const contents = await readFile(path);
  return createHash('sha256').update(contents).digest('hex');
}

function sqliteCapturedAt(path: string) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = String(database.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '');
    if (integrity !== 'ok') throw new Error(`${path}: integrity_check devolvió ${integrity || 'sin resultado'}`);
    return String(database.prepare("SELECT value FROM report_meta WHERE key = 'captured_at'").get()?.value ?? '');
  } finally {
    database.close();
  }
}

export async function createDataBundleManifest(bundleId: string, paths: ReturnType<typeof createBundlePaths>, workspace = process.cwd()) {
  const snapshot = JSON.parse(await readFile(paths.snapshot, 'utf8')) as { meta?: { generatedAt?: string; revision?: number } };
  const staging = JSON.parse(await readFile(paths.staging, 'utf8')) as { meta?: { generatedAt?: string; revision?: number } };
  const capturedAt = snapshot.meta?.generatedAt ?? '';
  if (!capturedAt || staging.meta?.generatedAt !== capturedAt) throw new Error('Snapshot y staging no pertenecen a la misma captura.');
  if (sqliteCapturedAt(paths.commercial) !== capturedAt || sqliteCapturedAt(paths.pendingBalances) !== capturedAt) {
    throw new Error('Las bases candidatas no pertenecen al mismo corte que el snapshot.');
  }
  const entries = {
    snapshot: paths.snapshot,
    staging: paths.staging,
    commercial: paths.commercial,
    pendingBalances: paths.pendingBalances,
    executiveSummary: paths.executiveSummary,
  } satisfies Record<DataArtifactKey, string>;
  const artifacts = {} as Record<DataArtifactKey, DataBundleArtifact>;
  for (const [key, path] of Object.entries(entries) as [DataArtifactKey, string][]) {
    const info = await stat(path);
    artifacts[key] = { path: relative(workspace, path), bytes: info.size, sha256: await digest(path) };
  }
  const manifest: DataBundleManifest = {
    schemaVersion: 1,
    bundleId,
    createdAt: new Date().toISOString(),
    activatedAt: null,
    capturedAt,
    snapshotRevision: Number(snapshot.meta?.revision ?? 0),
    artifacts,
  };
  await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export async function verifyDataBundleManifest(manifest: DataBundleManifest, workspace = process.cwd()) {
  const issues: string[] = [];
  for (const [key, artifact] of Object.entries(manifest.artifacts) as [DataArtifactKey, DataBundleArtifact][]) {
    const path = absolute(workspace, artifact.path);
    const info = await stat(path).catch(() => null);
    if (!info) { issues.push(`${key}: archivo ausente`); continue; }
    if (info.size !== artifact.bytes) issues.push(`${key}: tamaño ${info.size} != ${artifact.bytes}`);
    if (await digest(path) !== artifact.sha256) issues.push(`${key}: checksum SHA-256 no coincide`);
  }
  return issues;
}

export async function activateDataBundle(manifest: DataBundleManifest, workspace = process.cwd()) {
  const issues = await verifyDataBundleManifest(manifest, workspace);
  if (issues.length) throw new Error(`El paquete candidato no se activó: ${issues.join('; ')}`);
  const pointerPath = resolve(workspace, POINTER_FILE);
  await mkdir(dirname(pointerPath), { recursive: true });
  const active = { ...manifest, activatedAt: new Date().toISOString() };
  const temporary = `${pointerPath}.tmp-${manifest.bundleId}`;
  await writeFile(temporary, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
  await rename(temporary, pointerPath);
  return active;
}

export async function pruneDataBundles(activeBundleId: string, retain = 3, workspace = process.cwd()) {
  const root = resolve(workspace, 'data/bundles');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name !== activeBundleId).map(async (entry) => ({
    name: entry.name,
    mtimeMs: (await stat(resolve(root, entry.name))).mtimeMs,
  })));
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const entry of candidates.slice(Math.max(0, retain - 1))) await rm(resolve(root, entry.name), { recursive: true, force: true });
}
