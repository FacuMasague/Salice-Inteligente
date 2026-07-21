import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { METRIC_CATALOG, REPORT_UNIVERSES } from '../shared/metrics.js';
import { SNAPSHOT_REVISION, type DashboardData } from '../shared/models.js';

type CheckLevel = 'required' | 'warning';
interface AuditCheck {
  id: string;
  label: string;
  level: CheckLevel;
  passed: boolean;
  detail: string;
}

const workspace = process.cwd();
const snapshotPath = resolve(workspace, 'data/snapshot.json');
const stagingPath = resolve(workspace, 'data/staging/snapshot-gesi.json');
const sptPath = resolve(workspace, 'data/spt-gesi.sqlite');
const pendingPath = resolve(workspace, 'data/pending-balances.sqlite');
const outputPath = resolve(workspace, 'data/quality/platform-audit.json');

function metadata(database: DatabaseSync) {
  return new Map((database.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[])
    .map((row) => [row.key, row.value]));
}

const checks: AuditCheck[] = [];
const add = (id: string, label: string, passed: boolean, detail: string, level: CheckLevel = 'required') => {
  checks.push({ id, label, level, passed, detail });
};

const [snapshotRaw, stagingRaw, snapshotFile, stagingFile, sptFile, pendingFile] = await Promise.all([
  readFile(snapshotPath, 'utf8'),
  readFile(stagingPath, 'utf8'),
  stat(snapshotPath),
  stat(stagingPath),
  stat(sptPath),
  stat(pendingPath),
]);
const snapshot = JSON.parse(snapshotRaw) as DashboardData;
const staging = JSON.parse(stagingRaw) as DashboardData;
const sptDatabase = new DatabaseSync(sptPath, { readOnly: true });
const pendingDatabase = new DatabaseSync(pendingPath, { readOnly: true });
const sptMeta = metadata(sptDatabase);
const pendingMeta = metadata(pendingDatabase);
const movementRows = Number(sptDatabase.prepare('SELECT COUNT(*) AS total FROM movements').get()?.total ?? 0);
const pendingDocuments = Number(pendingDatabase.prepare('SELECT COUNT(*) AS total FROM documents').get()?.total ?? 0);
sptDatabase.close();
pendingDatabase.close();

const snapshotDate = snapshot.meta.generatedAt.slice(0, 10);
const metricIds = METRIC_CATALOG.map((metric) => metric.id);
const universeIds = REPORT_UNIVERSES.map((universe) => universe.id);

add('snapshot-source', 'El snapshot activo proviene de GESI', snapshot.meta.source === 'gesi', `Fuente: ${snapshot.meta.source}`);
add('snapshot-revision', 'La revisión del snapshot coincide con el contrato actual', snapshot.meta.revision === SNAPSHOT_REVISION, `Revisión ${snapshot.meta.revision}; esperada ${SNAPSHOT_REVISION}`);
add('staging-activation', 'Staging y snapshot activo corresponden a la misma captura', staging.meta.generatedAt === snapshot.meta.generatedAt, `${staging.meta.generatedAt} / ${snapshot.meta.generatedAt}`);
add('staging-revision', 'Staging y snapshot usan la misma revisión', staging.meta.revision === snapshot.meta.revision, `Revisiones ${staging.meta.revision} / ${snapshot.meta.revision}`);
add('commercial-capture', 'La base comercial corresponde al snapshot activo', sptMeta.get('captured_at') === snapshot.meta.generatedAt, `${sptMeta.get('captured_at') ?? 'sin fecha'} / ${snapshot.meta.generatedAt}`);
add('commercial-cutoff', 'La base comercial no contiene movimientos posteriores al snapshot', (sptMeta.get('max_date') ?? '') <= snapshotDate, `Máximo ${sptMeta.get('max_date') ?? 'sin fecha'}; snapshot ${snapshotDate}`);
add('commercial-grain', 'El conteo físico de movimientos coincide con su metadata', movementRows === Number(sptMeta.get('row_count') ?? -1), `${movementRows} filas físicas / ${sptMeta.get('row_count') ?? 'sin metadata'}`);
add('pending-capture', 'Saldos pendientes corresponde al snapshot activo', pendingMeta.get('captured_at') === snapshot.meta.generatedAt, `${pendingMeta.get('captured_at') ?? 'sin fecha'} / ${snapshot.meta.generatedAt}`);
add('pending-cutoff', 'El corte de saldos coincide con la fecha del snapshot', pendingMeta.get('as_of_date') === snapshotDate, `${pendingMeta.get('as_of_date') ?? 'sin fecha'} / ${snapshotDate}`);
add('pending-grain', 'El conteo físico de documentos abiertos coincide con su metadata', pendingDocuments === Number(pendingMeta.get('document_count') ?? -1), `${pendingDocuments} documentos físicos / ${pendingMeta.get('document_count') ?? 'sin metadata'}`);
add('metric-identifiers', 'Los identificadores de métricas son únicos', new Set(metricIds).size === metricIds.length, `${metricIds.length} métricas`);
add('universe-identifiers', 'Los identificadores de universos son únicos', new Set(universeIds).size === universeIds.length, `${universeIds.length} universos`);
add('metric-traceability', 'Todas las métricas declaran fuente, fecha, fórmula y consumidores', METRIC_CATALOG.every((metric) => metric.source && metric.dateBasis && metric.formula && metric.consumers.length > 0), 'Contrato central shared/metrics.ts');
add('zone-catalog', 'El maestro de zonas está disponible', Boolean(snapshot.meta.coverage?.zoneLabelsAvailable), 'GESI no expuso un catálogo de zonas utilizable; se conservan identificadores visibles.', 'warning');
add('invoice-details', 'Todas las facturas consultadas entregaron detalle', (snapshot.meta.coverage?.omittedInvoiceDetails ?? 0) === 0, `${snapshot.meta.coverage?.omittedInvoiceDetails ?? 0} factura(s) sin detalle`, 'warning');
add('portfolio-membership', 'Todos los clientes activos tienen pertenencia Salice confirmada', (snapshot.meta.coverage?.activePortfolioReviewClients ?? 0) === 0, `${snapshot.meta.coverage?.activePortfolioReviewClients ?? 0} cliente(s) activos a revisar`, 'warning');
add('commercial-documents', 'Todos los comprobantes comerciales tienen detalle disponible', Number(sptMeta.get('unavailable_document_count') ?? 0) === 0, `${sptMeta.get('unavailable_document_count') ?? 0} comprobante(s) no disponible(s)`, 'warning');

const failed = checks.filter((check) => check.level === 'required' && !check.passed);
const warnings = checks.filter((check) => check.level === 'warning' && !check.passed);
const result = {
  generatedAt: new Date().toISOString(),
  status: failed.length ? 'failed' : warnings.length ? 'passed_with_warnings' : 'passed',
  sourceSnapshotAt: snapshot.meta.generatedAt,
  summary: { total: checks.length, passed: checks.filter((check) => check.passed).length, failed: failed.length, warnings: warnings.length },
  checks,
  artifacts: [
    { path: 'data/snapshot.json', bytes: snapshotFile.size, modifiedAt: snapshotFile.mtime.toISOString() },
    { path: 'data/staging/snapshot-gesi.json', bytes: stagingFile.size, modifiedAt: stagingFile.mtime.toISOString() },
    { path: 'data/spt-gesi.sqlite', bytes: sptFile.size, modifiedAt: sptFile.mtime.toISOString() },
    { path: 'data/pending-balances.sqlite', bytes: pendingFile.size, modifiedAt: pendingFile.mtime.toISOString() },
  ],
};

await mkdir(resolve(workspace, 'data/quality'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exitCode = 1;
