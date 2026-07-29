import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { APP_VERSION, SNAPSHOT_REVISION, type DashboardData } from '../shared/models.js';
import { createDemoSnapshot } from './data/demo-snapshot.js';
import { getActiveBundleManifest, resolveActiveDataPaths, verifyDataBundleManifest } from './data-bundle.js';
import { applyAiProductVectors } from './ai-artifacts.js';
import { importSnapshotNotes, mergeOperationalData } from './operational-store.js';
import { applyClientLocationQuality } from '../shared/client-location.js';
import { applyReceivablesPolicyToClients } from '../shared/receivables-policy.js';
import { applyCatalogPricePositioning, resolveProductContentKg } from '../shared/product-vectors.js';
import { referenceUnitPricePerKg } from '../shared/product-prices.js';

const legacySnapshotPath = resolve(process.cwd(), 'data/snapshot.json');
const backupDirectory = resolve(process.cwd(), 'data/backups');
let ensured = false;
let cachedSnapshot: DashboardData | null = null;
let cachedMtime = -1;
let cachedPath = '';

const snapshotPath = () => resolveActiveDataPaths().snapshot;

async function backupCurrentSnapshot() {
  try {
    await stat(legacySnapshotPath);
  } catch {
    return;
  }
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await copyFile(legacySnapshotPath, resolve(backupDirectory, `snapshot-${stamp}.json`));
  const backups = (await readdir(backupDirectory))
    .filter((name) => name.startsWith('snapshot-') && name.endsWith('.json'))
    .sort()
    .reverse();
  await Promise.all(backups.slice(3).map((name) => unlink(resolve(backupDirectory, name))));
}

export async function ensureSnapshot() {
  if (ensured) return;
  try {
    const manifest = getActiveBundleManifest();
    if (manifest) {
      const issues = await verifyDataBundleManifest(manifest);
      if (issues.length) throw new Error(`El manifiesto activo no supera sus checksums: ${issues.join('; ')}`);
    }
    const snapshot = JSON.parse(await readFile(snapshotPath(), 'utf8')) as DashboardData;
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
  const path = snapshotPath();
  const info = await stat(path);
  if (!cachedSnapshot || cachedPath !== path || cachedMtime !== info.mtimeMs) {
    cachedSnapshot = JSON.parse(await readFile(path, 'utf8')) as DashboardData;
    cachedPath = path;
    cachedMtime = info.mtimeMs;
  }
  // La capa de IA sólo puede afectar productos con un artefacto validado. Las
  // correcciones humanas se aplican después y, por lo tanto, siempre prevalecen.
  const merged = mergeOperationalData(applyAiProductVectors(cachedSnapshot));
  const products = applyCatalogPricePositioning(merged.products.map((product) => {
    const contentKg = product.contentKg ?? resolveProductContentKg({
      unit1: product.unit,
      unit2: product.inventory?.unit2,
      unit2PerUnit1: product.inventory?.unit2PerUnit1,
      descriptions: [product.name, product.description, product.pack],
    });
    return {
      ...product,
      contentKg,
      referencePricePerKg: referenceUnitPricePerKg(product.price, contentKg),
      kilos90d: contentKg ? Math.round(product.units90d * contentKg * 100) / 100 : 0,
      kiloDataStatus: product.units90d <= 0 || contentKg ? 'estimated' as const : 'unavailable' as const,
    };
  }));
  const policyClients = applyReceivablesPolicyToClients(merged.clients, merged.meta.generatedAt.slice(0, 10));
  const locations = applyClientLocationQuality(policyClients);
  return {
    ...merged,
    products,
    clients: locations.clients,
    meta: {
      ...merged.meta,
      version: APP_VERSION,
      coverage: merged.meta.coverage ? {
        ...merged.meta.coverage,
        includedClients: locations.clients.length,
        activeClients: locations.clients.filter((client) => client.active).length,
        inactiveClients: locations.clients.filter((client) => !client.active).length,
        geocodedClients: locations.clients.filter((client) => client.coordinates).length,
        activeGeocodedClients: locations.clients.filter((client) => client.active && client.coordinates).length,
        inactiveGeocodedClients: locations.clients.filter((client) => !client.active && client.coordinates).length,
        correctedLocationClients: locations.clients.filter((client) => client.active && client.locationStatus === 'corrected').length,
        locationReviewClients: locations.clients.filter((client) => client.active && client.locationStatus === 'review').length,
      } : undefined,
    },
  };
}

export async function saveSnapshot(snapshot: DashboardData) {
  await mkdir(dirname(legacySnapshotPath), { recursive: true });
  await backupCurrentSnapshot();
  const temporaryPath = `${legacySnapshotPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
  await rename(temporaryPath, legacySnapshotPath);
  const info = await stat(legacySnapshotPath);
  cachedSnapshot = snapshot;
  cachedMtime = info.mtimeMs;
  cachedPath = legacySnapshotPath;
}

export function getSnapshotPath() {
  return snapshotPath();
}

export async function getBackupCount() {
  if (getActiveBundleManifest()) {
    try {
      return (await readdir(resolve(process.cwd(), 'data/bundles'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).length;
    } catch {
      return 0;
    }
  }
  try {
    return (await readdir(backupDirectory)).filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}
