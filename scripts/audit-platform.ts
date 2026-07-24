import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { METRIC_CATALOG, REPORT_UNIVERSES } from '../shared/metrics.js';
import { SNAPSHOT_REVISION, type DashboardData } from '../shared/models.js';
import { evaluateProductVectorVersionGovernance, type ProductVectorComparisonEvidence } from '../shared/product-vector-version-governance.js';
import { getActiveBundleManifest, resolveActiveDataPaths, verifyDataBundleManifest } from '../server/data-bundle.js';
import { checkOperationalIntegrity } from '../server/operations-backup.js';
import { validateExecutableUniverses } from '../server/report-universes.js';

type CheckLevel = 'required' | 'warning';
interface AuditCheck {
  id: string;
  label: string;
  level: CheckLevel;
  passed: boolean;
  detail: string;
}

const workspace = process.cwd();
const activePaths = resolveActiveDataPaths(workspace);
const snapshotPath = resolve(process.env.SALICE_SNAPSHOT_PATH ?? activePaths.snapshot);
const stagingPath = resolve(process.env.SALICE_STAGING_PATH ?? activePaths.staging);
const sptPath = resolve(process.env.SALICE_SPT_DB_PATH ?? activePaths.commercial);
const pendingPath = resolve(process.env.SALICE_PENDING_BALANCES_DB_PATH ?? activePaths.pendingBalances);
const outputPath = resolve(process.env.SALICE_PLATFORM_AUDIT_OUTPUT_PATH ?? activePaths.platformAudit);
const vectorAuditPath = resolve(process.env.SALICE_VECTOR_AUDIT_OUTPUT_PATH ?? activePaths.vectorAudit);
const vectorComparisonPath = resolve(process.env.SALICE_VECTOR_COMPARISON_OUTPUT_PATH ?? resolve(dirname(vectorAuditPath), 'product-vector-v2.2-comparison.json'));
const previousSnapshotPath = process.env.SALICE_PREVIOUS_SNAPSHOT_PATH ? resolve(process.env.SALICE_PREVIOUS_SNAPSHOT_PATH) : null;
const operationsPath = resolve(process.env.SALICE_OPERATIONS_DB_PATH ?? resolve(workspace, 'data/operations.sqlite'));

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
const executableUniverseIssues = validateExecutableUniverses();
const vectorAudit = JSON.parse(await readFile(vectorAuditPath, 'utf8')) as { snapshotAt?: string; status?: string };
const vectorComparison = await readFile(vectorComparisonPath, 'utf8')
  .then((value) => JSON.parse(value) as ProductVectorComparisonEvidence)
  .catch(() => null);
const previousSnapshot = previousSnapshotPath
  ? await readFile(previousSnapshotPath, 'utf8').then((value) => JSON.parse(value) as DashboardData).catch(() => null)
  : null;
const vectorVersionGovernance = evaluateProductVectorVersionGovernance({
  snapshotAt: snapshot.meta.generatedAt,
  currentVersion: snapshot.meta.productVectorVersion,
  previousVersion: previousSnapshot?.meta.productVectorVersion,
  comparison: vectorComparison,
  comparisonPath: vectorComparisonPath,
});
const activeManifest = process.env.SALICE_SNAPSHOT_PATH ? null : getActiveBundleManifest(workspace);
const manifestIssues = activeManifest ? await verifyDataBundleManifest(activeManifest, workspace) : [];
const operationsIntegrity = (() => {
  try { return checkOperationalIntegrity(operationsPath).integrity; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
})();
const administrativeStorage = (() => {
  try {
    const operations = new DatabaseSync(operationsPath, { readOnly: true });
    const requiredTables = ['receivable_cases', 'receivable_case_events', 'client_trend_reviews', 'inventory_alert_reviews', 'inventory_alert_review_events', 'saved_views', 'commercial_opportunity_links', 'commercial_goal_versions', 'commercial_goals', 'commercial_goal_changes', 'product_vector_corrections', 'product_vector_correction_events', 'product_price_snapshots'];
    const requiredTriggers = ['prevent_inventory_review_event_update', 'prevent_inventory_review_event_delete', 'prevent_vector_correction_event_update', 'prevent_vector_correction_event_delete', 'prevent_product_price_snapshot_update', 'prevent_product_price_snapshot_delete'];
    const tables = new Set((operations.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name));
    const triggers = new Set((operations.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[]).map((row) => row.name));
    const missing = requiredTables.filter((table) => !tables.has(table));
    const missingTriggers = requiredTriggers.filter((trigger) => !triggers.has(trigger));
    const activeVersions = missing.length ? 0 : Number(operations.prepare("SELECT COUNT(*) AS total FROM commercial_goal_versions WHERE status = 'active'").get()?.total ?? 0);
    const activeRows = missing.length ? 0 : Number(operations.prepare("SELECT COUNT(*) AS total FROM commercial_goals goals JOIN commercial_goal_versions versions ON versions.id = goals.version_id WHERE versions.status = 'active'").get()?.total ?? 0);
    operations.close();
    return { missing, missingTriggers, activeVersions, activeRows, error: '' };
  } catch (error) {
    return { missing: [] as string[], missingTriggers: [] as string[], activeVersions: 0, activeRows: 0, error: error instanceof Error ? error.message : String(error) };
  }
})();

add('snapshot-source', 'El snapshot activo proviene de GESI', snapshot.meta.source === 'gesi', `Fuente: ${snapshot.meta.source}`);
add('snapshot-revision', 'La revisión del snapshot coincide con el contrato actual', snapshot.meta.revision === SNAPSHOT_REVISION, `Revisión ${snapshot.meta.revision}; esperada ${SNAPSHOT_REVISION}`);
const inventory = snapshot.meta.coverage?.inventory;
add('inventory-context', 'El inventario pertenece a Salice y al depósito principal', inventory?.companyId === 3 && inventory.branchId === 3 && inventory.warehouseId === 2, inventory ? `Empresa ${inventory.companyId} / sucursal ${inventory.branchId} / depósito ${inventory.warehouseId} · ${inventory.warehouseLabel}` : 'Sin metadata de inventario');
add('inventory-zero-universe', 'El inventario distingue existencia cero de producto ausente', inventory?.completeZeroStockUniverse === true && inventory.missingStockProducts === 0, inventory ? `${inventory.uniqueStockProducts}/${inventory.uniqueMasterProducts} maestros con fila · ${inventory.zeroStockProducts} ceros observados` : 'Sin metadata de inventario');
add('product-catalog-traceability', 'Cada producto explica por qué participa en el catálogo operativo', snapshot.products.every((product) => product.catalogParticipation?.length > 0), `${snapshot.products.length} productos evaluados`);
const logistics = snapshot.meta.coverage?.logistics;
const logisticsInvoices = snapshot.logistics?.invoices ?? [];
const logisticsSheets = snapshot.logistics?.sheets ?? [];
add(
  'logistics-coverage',
  'El snapshot conserva la cobertura logística y sus estados explícitos',
  Boolean(snapshot.logistics)
    && logisticsInvoices.length === (logistics?.invoices ?? -1)
    && logisticsSheets.length === (logistics?.sheets ?? -1),
  `${logisticsInvoices.length} facturas / ${logisticsSheets.length} fojas`,
);
add(
  'logistics-assignment-reconciliation',
  'Cada factura logística pertenece a un único estado de asignación',
  logisticsInvoices.every((invoice) => ['unassigned', 'open_sheet', 'closed_sheet', 'unknown'].includes(invoice.assignmentStatus))
    && logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'unassigned').length === (logistics?.unassignedInvoices ?? -1)
    && logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'open_sheet').length === (logistics?.openSheetInvoices ?? -1)
    && logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'closed_sheet').length === (logistics?.closedSheetInvoices ?? -1)
    && logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'unknown').length === (logistics?.unknownInvoices ?? -1),
  `${logistics?.unassignedInvoices ?? 0} sin foja · ${logistics?.openSheetInvoices ?? 0} en abiertas · ${logistics?.closedSheetInvoices ?? 0} en cerradas · ${logistics?.unknownInvoices ?? 0} desconocidas`,
);
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
add('executable-universes', 'Los universos ejecutables coinciden con el catálogo', executableUniverseIssues.length === 0, executableUniverseIssues.join('; ') || 'Contratos centralizados');
add('vector-audit', 'La auditoría vectorial corresponde al snapshot evaluado', vectorAudit.snapshotAt === snapshot.meta.generatedAt && vectorAudit.status !== 'failed', `${vectorAudit.snapshotAt ?? 'sin fecha'} / ${snapshot.meta.generatedAt} · ${vectorAudit.status ?? 'sin estado'}`);
add(
  'vector-version-governance',
  'Todo cambio del motor vectorial tiene una comparación aprobada',
  vectorVersionGovernance.passed,
  vectorVersionGovernance.detail,
);
add('operations-integrity', 'La persistencia operativa supera integrity_check', operationsIntegrity === 'ok', operationsIntegrity);
add(
  'administrative-storage',
  'La persistencia operativa contiene todos los contratos hasta v0.7.0',
  !administrativeStorage.error && administrativeStorage.missing.length === 0 && administrativeStorage.missingTriggers.length === 0,
  administrativeStorage.error || (administrativeStorage.missing.length || administrativeStorage.missingTriggers.length
    ? `Faltan tablas: ${administrativeStorage.missing.join(', ') || 'ninguna'} · triggers: ${administrativeStorage.missingTriggers.join(', ') || 'ninguno'}`
    : 'Seguimientos, listas y oportunidades vinculadas, incidencias de inventario auditables, correcciones vectoriales, historial de precios y objetivos disponibles'),
);
add(
  'active-commercial-plan',
  'Existe exactamente un plan comercial activo y con objetivos',
  administrativeStorage.activeVersions === 1 && administrativeStorage.activeRows > 0,
  `${administrativeStorage.activeVersions} versión activa · ${administrativeStorage.activeRows} objetivos`,
);
if (process.env.SALICE_SNAPSHOT_PATH) {
  add('candidate-isolation', 'Los artefactos evaluados pertenecen al paquete candidato aislado', [snapshotPath, stagingPath, sptPath, pendingPath].every((path) => path.includes(`${resolve(workspace, 'data/bundles')}/`)), 'La auditoría previa no modifica el manifiesto activo');
} else {
  add('active-manifest', 'El manifiesto activo verifica tamaños y checksums SHA-256', Boolean(activeManifest) && manifestIssues.length === 0, activeManifest ? manifestIssues.join('; ') || `Paquete ${activeManifest.bundleId}` : 'Todavía se usan rutas heredadas');
}
add('zone-catalog', 'El maestro de zonas está disponible', Boolean(snapshot.meta.coverage?.zoneLabelsAvailable), 'GESI no expuso un catálogo de zonas utilizable; se conservan identificadores visibles.', 'warning');
add('invoice-details', 'Todas las facturas consultadas entregaron detalle', (snapshot.meta.coverage?.omittedInvoiceDetails ?? 0) === 0, `${snapshot.meta.coverage?.omittedInvoiceDetails ?? 0} factura(s) sin detalle`, 'warning');
add('portfolio-membership', 'Todos los clientes activos tienen pertenencia Salice confirmada', (snapshot.meta.coverage?.activePortfolioReviewClients ?? 0) === 0, `${snapshot.meta.coverage?.activePortfolioReviewClients ?? 0} cliente(s) activos a revisar`, 'warning');
add('commercial-documents', 'Todos los comprobantes comerciales tienen detalle disponible', Number(sptMeta.get('unavailable_document_count') ?? 0) === 0, `${sptMeta.get('unavailable_document_count') ?? 0} comprobante(s) no disponible(s)`, 'warning');
add('product-primary-units', 'Todos los maestros informan unidad primaria', (inventory?.productsWithMissingPrimaryUnit ?? 0) === 0, `${inventory?.productsWithMissingPrimaryUnit ?? 0} maestro(s) sin U1`, 'warning');

const failed = checks.filter((check) => check.level === 'required' && !check.passed);
const warnings = checks.filter((check) => check.level === 'warning' && !check.passed);
const result = {
  generatedAt: new Date().toISOString(),
  status: failed.length ? 'failed' : warnings.length ? 'passed_with_warnings' : 'passed',
  sourceSnapshotAt: snapshot.meta.generatedAt,
  summary: { total: checks.length, passed: checks.filter((check) => check.passed).length, failed: failed.length, warnings: warnings.length },
  checks,
  artifacts: [
    { path: snapshotPath, bytes: snapshotFile.size, modifiedAt: snapshotFile.mtime.toISOString() },
    { path: stagingPath, bytes: stagingFile.size, modifiedAt: stagingFile.mtime.toISOString() },
    { path: sptPath, bytes: sptFile.size, modifiedAt: sptFile.mtime.toISOString() },
    { path: pendingPath, bytes: pendingFile.size, modifiedAt: pendingFile.mtime.toISOString() },
  ],
};

await mkdir(resolve(workspace, 'data/quality'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exitCode = 1;
