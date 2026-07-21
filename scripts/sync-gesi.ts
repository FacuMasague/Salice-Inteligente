import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeCapture, validateNormalizedSnapshot } from '../server/gesi/normalize.js';
import type { GesiRawCapture } from '../server/gesi/types.js';
import { saveSnapshot } from '../server/store.js';
import { importSnapshotNotes, recordSuccessfulSync } from '../server/operational-store.js';
import { buildPendingBalancesDatabase } from '../server/pending-balances-build.js';
import type { DashboardData } from '../shared/models.js';

const capturePath = resolve(process.cwd(), 'data/raw/gesi-salice-latest.json');
const stagingDirectory = resolve(process.cwd(), 'data/staging');
const stagingPath = resolve(stagingDirectory, 'snapshot-gesi.json');

console.log('Leyendo la última captura cruda de Salice…');
const capture = JSON.parse(await readFile(capturePath, 'utf8')) as GesiRawCapture;
if (capture.captureMeta.empresaID !== 3 || capture.captureMeta.sucursalID !== 3) {
  throw new Error('La captura no pertenece a Salice (empresa 3, sucursal 3).');
}

console.log('Normalizando clientes, ventas, cobranzas y catálogo…');
const snapshot = normalizeCapture(capture);
const issues = validateNormalizedSnapshot(snapshot);
if (issues.length) {
  console.error(`La captura no se activó: ${issues.length} problema(s) de consistencia.`);
  issues.slice(0, 50).forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

await mkdir(stagingDirectory, { recursive: true });
const temporaryPath = `${stagingPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
await rename(temporaryPath, stagingPath);

// Migra cualquier nota escrita en versiones anteriores antes de reemplazar la
// foto GESI. Desde v0.0.3 las notas viven en SQLite y sobreviven a cada sync.
try {
  const current = JSON.parse(await readFile(resolve(process.cwd(), 'data/snapshot.json'), 'utf8')) as DashboardData;
  importSnapshotNotes(current);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
await saveSnapshot(snapshot);
recordSuccessfulSync(snapshot);
const pendingBalances = buildPendingBalancesDatabase(capture);

console.log('Snapshot GESI validado y activado.');
console.log(JSON.stringify({
  generatedAt: snapshot.meta.generatedAt,
  clients: snapshot.clients.length,
  activeClients: snapshot.meta.coverage?.activeClients,
  inactiveClients: snapshot.meta.coverage?.inactiveClients,
  geocodedClients: snapshot.meta.coverage?.geocodedClients,
  activeGeocodedClients: snapshot.meta.coverage?.activeGeocodedClients,
  products: snapshot.products.length,
  pricedProducts: snapshot.meta.coverage?.pricedProducts,
  invoices90d: snapshot.meta.coverage?.invoices90d,
  openDocuments: snapshot.meta.coverage?.openDocuments,
  paymentSamples: snapshot.meta.coverage?.paymentSamples,
  pendingBalanceClients: pendingBalances.clientCount,
  pendingBalanceDocuments: pendingBalances.documentCount,
}, null, 2));
