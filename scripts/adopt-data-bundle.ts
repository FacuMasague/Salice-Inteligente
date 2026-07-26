import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { activateDataBundle, createBundlePaths, createDataBundleManifest, getActiveBundleManifest } from '../server/data-bundle.js';
import { buildExecutiveSummary } from '../server/executive-summary.js';
import type { DashboardData } from '../shared/models.js';

if (getActiveBundleManifest()) {
  console.log('Ya existe un manifiesto de datos activo; no se realizó ninguna migración.');
  process.exit(0);
}
const id = `adopted-${randomUUID()}`;
const paths = createBundlePaths(id);
await mkdir(resolve(paths.directory, 'quality'), { recursive: true });
await Promise.all([
  copyFile(resolve('data/snapshot.json'), paths.snapshot),
  copyFile(resolve('data/staging/snapshot-gesi.json'), paths.staging),
  copyFile(resolve('data/spt-gesi.sqlite'), paths.commercial),
  copyFile(resolve('data/pending-balances.sqlite'), paths.pendingBalances),
  copyFile(resolve('data/quality/platform-audit.json'), resolve(paths.directory, 'quality/platform-audit.json')).catch(() => undefined),
  copyFile(resolve('data/quality/spt-gesi-audit.json'), resolve(paths.directory, 'quality/spt-gesi-audit.json')).catch(() => undefined),
  copyFile(resolve('data/quality/product-vectors.json'), resolve(paths.directory, 'quality/product-vectors.json')).catch(() => undefined),
]);
const snapshot = JSON.parse(await readFile(paths.snapshot, 'utf8')) as DashboardData;
const summary = buildExecutiveSummary(snapshot);
if (!summary) throw new Error('No se pudo construir el resumen ejecutivo durante la adopción.');
await writeFile(paths.executiveSummary, `${JSON.stringify(summary)}\n`, 'utf8');
const manifest = await createDataBundleManifest(id, paths);
await activateDataBundle(manifest);
console.log(`Generación activa adoptada: ${id}`);
