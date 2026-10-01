import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveActiveDataPaths } from '../server/data-bundle.js';
import { SPT_HISTORY_CONTINUITY_VERSION } from '../server/gesi/capture-window.js';

const databasePath = resolve(process.env.SALICE_SPT_DB_PATH ?? resolveActiveDataPaths().commercial);
const outputPath = resolve(process.env.SALICE_SPT_AUDIT_OUTPUT_PATH ?? resolveActiveDataPaths().sptAudit);
const database = new DatabaseSync(databasePath, { readOnly: true });

const metadata = new Map((database.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[])
  .map((row) => [row.key, row.value]));
const grain = database.prepare(`
  SELECT COUNT(*) AS rows,
         COUNT(DISTINCT source_document_key || ':' || source_item_id || ':' || source_kind) AS uniqueRows,
         MIN(sale_date) AS minDate,
         MAX(sale_date) AS maxDate,
         SUM(CASE WHEN TRIM(product_id) = '' THEN 1 ELSE 0 END) AS missingProductIds,
         SUM(CASE WHEN client_id <= 0 THEN 1 ELSE 0 END) AS missingClientIds,
         SUM(CASE WHEN company_id <> 3 OR branch_id <> 3 THEN 1 ELSE 0 END) AS outOfScopeRows
  FROM movements
`).get() as Record<string, number | string>;
const months = database.prepare(`
  SELECT substr(sale_date, 1, 7) AS month,
         COUNT(*) AS rows,
         SUM(kilos) AS kilos,
         COUNT(DISTINCT client_id) AS clients
  FROM movements
  GROUP BY month
  ORDER BY month
`).all() as { month: string; rows: number; kilos: number; clients: number }[];

const sourceDocumentCount = Number(metadata.get('source_document_count') ?? 0);
const unavailableDocumentCount = Number(metadata.get('unavailable_document_count') ?? 0);
const unavailableRate = sourceDocumentCount
  ? unavailableDocumentCount / (sourceDocumentCount + unavailableDocumentCount)
  : 0;
const months2025 = months.filter((row) => row.month.startsWith('2025-'));
const checks = {
  historyUsesCompleteBoundaryDays: metadata.get('history_continuity_version') === String(SPT_HISTORY_CONTINUITY_VERSION),
  coverageStartsIn2025: (metadata.get('coverage_from') ?? '') <= '2025-01-01',
  firstMovementByJanuary2: String(grain.minDate) <= '2025-01-02',
  all2025MonthsPresent: months2025.length === 12,
  uniqueMovementGrain: Number(grain.rows) === Number(grain.uniqueRows),
  noMissingProductIds: Number(grain.missingProductIds) === 0,
  noMissingClientIds: Number(grain.missingClientIds) === 0,
  onlyCompany3Branch3: Number(grain.outOfScopeRows) === 0
    && metadata.get('company_scope') === '3'
    && metadata.get('branch_scope') === '3',
  unavailableDocumentsBelowHalfPercent: unavailableRate < 0.005,
};
const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const result = {
  generatedAt: new Date().toISOString(),
  source: 'GESI API · empresa 3 / sucursal 3',
  intendedGrain: 'Un renglón por comprobante, ítem y tipo de documento',
  status: failures.length ? 'failed' : 'passed',
  checks,
  failures,
  profile: {
    rows: Number(grain.rows),
    uniqueRows: Number(grain.uniqueRows),
    coverageFrom: metadata.get('coverage_from'),
    minDate: grain.minDate,
    maxDate: grain.maxDate,
    sourceDocumentCount,
    unavailableDocumentCount,
    unavailableDocumentRate: unavailableRate,
    missingProductIds: Number(grain.missingProductIds),
    missingClientIds: Number(grain.missingClientIds),
    outOfScopeRows: Number(grain.outOfScopeRows),
  },
  months2025,
};

database.close();
await mkdir(resolve(process.cwd(), 'data/quality'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
