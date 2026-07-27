import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import chain from 'stream-chain';
import { parser } from 'stream-json';
import { ignore } from 'stream-json/filters/ignore.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';
import { normalizeCapture, validateNormalizedSnapshot } from '../server/gesi/normalize.js';
import type { GesiRawCapture } from '../server/gesi/types.js';
import { saveSnapshot } from '../server/store.js';
import { importSnapshotNotes, recordSuccessfulSync } from '../server/operational-store.js';
import { buildPendingBalancesDatabase } from '../server/pending-balances-build.js';
import { getActiveBundleManifest } from '../server/data-bundle.js';
import type { DashboardData } from '../shared/models.js';

const capturePath = resolve(process.env.SALICE_CAPTURE_PATH ?? 'data/raw/gesi-salice-latest.json');
const stagingPath = resolve(process.env.SALICE_STAGING_OUTPUT_PATH ?? 'data/staging/snapshot-gesi.json');
const snapshotOutputPath = process.env.SALICE_SNAPSHOT_OUTPUT_PATH ? resolve(process.env.SALICE_SNAPSHOT_OUTPUT_PATH) : null;
const pendingOutputPath = resolve(process.env.SALICE_PENDING_BALANCES_OUTPUT_PATH ?? 'data/pending-balances.sqlite');
const candidateMode = Boolean(snapshotOutputPath);

if (!candidateMode && getActiveBundleManifest()) {
  throw new Error('La activación directa de sync:gesi está deshabilitada desde v0.3.3. Usá pnpm run refresh:gesi para construir, auditar y activar el paquete completo.');
}

async function readNormalizationCapture() {
  const output = chain([
    createReadStream(capturePath),
    parser(),
    ignore({
      filter: /^(sptInvoices|sptCreditNotes)$/,
      streamKeys: false,
      packKeys: true,
    }),
    streamObject(),
  ]);
  const capture: Partial<GesiRawCapture> = {};
  for await (const item of output as AsyncIterable<{ key: string; value: unknown }>) {
    (capture as Record<string, unknown>)[item.key] = item.value;
  }
  // La base SPT se procesa en streaming en su propia etapa. La normalización
  // operativa no usa esas dos colecciones históricas y evita materializarlas.
  capture.sptInvoices = [];
  capture.sptCreditNotes = [];
  return capture as GesiRawCapture;
}

console.log('Leyendo la captura cruda sin materializar el histórico SPT…');
const capture = await readNormalizationCapture();
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

await mkdir(resolve(stagingPath, '..'), { recursive: true });
const temporaryPath = `${stagingPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
await rename(temporaryPath, stagingPath);

if (snapshotOutputPath) {
  await mkdir(resolve(snapshotOutputPath, '..'), { recursive: true });
  const snapshotTemporary = `${snapshotOutputPath}.tmp`;
  await writeFile(snapshotTemporary, `${JSON.stringify(snapshot)}\n`, 'utf8');
  await rename(snapshotTemporary, snapshotOutputPath);
}

// Migra cualquier nota escrita en versiones anteriores antes de reemplazar la
// foto GESI. Desde v0.0.3 las notas viven en SQLite y sobreviven a cada sync.
if (!candidateMode) {
  try {
    const current = JSON.parse(await readFile(resolve(process.cwd(), 'data/snapshot.json'), 'utf8')) as DashboardData;
    importSnapshotNotes(current);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await saveSnapshot(snapshot);
  recordSuccessfulSync(snapshot);
}
const pendingBalances = buildPendingBalancesDatabase(capture, pendingOutputPath);

console.log(candidateMode ? 'Paquete candidato normalizado; todavía no está activo.' : 'Snapshot GESI validado y activado.');
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
