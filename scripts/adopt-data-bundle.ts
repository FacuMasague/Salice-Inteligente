import { randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { activateDataBundle, createBundlePaths, createDataBundleManifest, getActiveBundleManifest } from '../server/data-bundle.js';

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
const manifest = await createDataBundleManifest(id, paths);
await activateDataBundle(manifest);
console.log(`Generación activa adoptada: ${id}`);
