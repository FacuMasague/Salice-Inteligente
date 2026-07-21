import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { METRIC_CATALOG, REPORT_UNIVERSES } from '../shared/metrics.js';
import { SNAPSHOT_REVISION, type DashboardData } from '../shared/models.js';
import { resolveActiveDataPaths } from '../server/data-bundle.js';
import { ensureLocalDemoData } from '../server/local-demo-data.js';
import { checkOperationalIntegrity } from '../server/operations-backup.js';
import { operationalStatus } from '../server/operational-store.js';
import { validateExecutableUniverses } from '../server/report-universes.js';

interface AuditCheck { id: string; label: string; passed: boolean; detail: string }
ensureLocalDemoData();
operationalStatus();
const workspace = process.cwd();
const paths = resolveActiveDataPaths(workspace);
const snapshot = JSON.parse(readFileSync(paths.snapshot, 'utf8')) as DashboardData;
const staging = JSON.parse(readFileSync(paths.staging, 'utf8')) as DashboardData;
const commercial = new DatabaseSync(paths.commercial, { readOnly: true });
const pending = new DatabaseSync(paths.pendingBalances, { readOnly: true });
const commercialMeta = new Map((commercial.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[]).map((row) => [row.key, row.value]));
const pendingMeta = new Map((pending.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[]).map((row) => [row.key, row.value]));
const movementRows = Number(commercial.prepare('SELECT COUNT(*) AS total FROM movements').get()?.total ?? 0);
const pendingDocuments = Number(pending.prepare('SELECT COUNT(*) AS total FROM documents').get()?.total ?? 0);
const commercialIntegrity = String(commercial.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '');
const pendingIntegrity = String(pending.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '');
commercial.close();
pending.close();

const checks: AuditCheck[] = [];
const add = (id: string, label: string, passed: boolean, detail: string) => checks.push({ id, label, passed, detail });
add('synthetic-source', 'The active snapshot is explicitly synthetic', snapshot.meta.source === 'demo' && snapshot.meta.disclaimer?.includes('fictional') === true, snapshot.meta.sourceLabel);
add('snapshot-revision', 'Snapshot revision matches the application contract', snapshot.meta.revision === SNAPSHOT_REVISION, `${snapshot.meta.revision} / ${SNAPSHOT_REVISION}`);
add('staging-match', 'Staging and active snapshot use the same deterministic cutoff', staging.meta.generatedAt === snapshot.meta.generatedAt, `${staging.meta.generatedAt} / ${snapshot.meta.generatedAt}`);
add('commercial-source', 'Commercial analytics declare the synthetic local source', commercialMeta.get('source_system') === 'Synthetic local demo dataset', commercialMeta.get('source_system') ?? 'missing');
add('commercial-cutoff', 'Commercial analytics match the snapshot cutoff', commercialMeta.get('captured_at') === snapshot.meta.generatedAt, commercialMeta.get('captured_at') ?? 'missing');
add('commercial-rows', 'Commercial row metadata matches the physical database', movementRows === Number(commercialMeta.get('row_count')), `${movementRows} rows`);
add('commercial-integrity', 'Commercial SQLite integrity check passes', commercialIntegrity === 'ok', commercialIntegrity);
add('pending-source', 'Pending balances declare the synthetic local source', pendingMeta.get('source_system') === 'Synthetic local demo dataset', pendingMeta.get('source_system') ?? 'missing');
add('pending-cutoff', 'Pending balances match the snapshot cutoff', pendingMeta.get('captured_at') === snapshot.meta.generatedAt, pendingMeta.get('captured_at') ?? 'missing');
add('pending-rows', 'Pending document metadata matches the physical database', pendingDocuments === Number(pendingMeta.get('document_count')), `${pendingDocuments} documents`);
add('pending-integrity', 'Pending-balance SQLite integrity check passes', pendingIntegrity === 'ok', pendingIntegrity);
add('metric-contract', 'Every metric declares source, formula, date basis, and consumers', METRIC_CATALOG.every((metric) => metric.source && metric.formula && metric.dateBasis && metric.consumers.length), `${METRIC_CATALOG.length} metrics`);
add('universe-contract', 'Executable report universes match the documented catalog', validateExecutableUniverses().length === 0, validateExecutableUniverses().join('; ') || `${REPORT_UNIVERSES.length} universes`);
add('operations-integrity', 'Local human-entered workflow storage passes integrity check', checkOperationalIntegrity(resolve(workspace, 'data/operations.sqlite')).integrity === 'ok', 'operations.sqlite');
add('vector-audit', 'Product-vector audit is available for this snapshot', existsSync(paths.vectorAudit), existsSync(paths.vectorAudit) ? paths.vectorAudit : 'Run pnpm run audit:vectors first.');

const failed = checks.filter((check) => !check.passed);
const result = {
  generatedAt: new Date().toISOString(),
  status: failed.length ? 'failed' : 'passed',
  sourceSnapshotAt: snapshot.meta.generatedAt,
  summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length, warnings: 0 },
  checks,
  artifacts: [paths.snapshot, paths.staging, paths.commercial, paths.pendingBalances].map((path) => ({ path, bytes: statSync(path).size })),
};
mkdirSync(dirname(paths.platformAudit), { recursive: true });
writeFileSync(paths.platformAudit, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exitCode = 1;
