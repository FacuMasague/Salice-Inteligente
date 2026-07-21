import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveActiveDataPaths } from '../server/data-bundle.js';
import { ensureLocalDemoData } from '../server/local-demo-data.js';

ensureLocalDemoData();
const path = resolveActiveDataPaths().commercial;
if (!existsSync(path)) throw new Error('Synthetic commercial database is missing.');
const database = new DatabaseSync(path, { readOnly: true });
try {
  const integrity = String(database.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '');
  const profile = database.prepare(`SELECT COUNT(*) AS rows, COUNT(DISTINCT client_id) AS clients,
    COUNT(DISTINCT product_id) AS products, COUNT(DISTINCT seller) AS sellers,
    MIN(sale_date) AS minDate, MAX(sale_date) AS maxDate,
    SUM(CASE WHEN source_kind = 'credit_note' THEN 1 ELSE 0 END) AS creditNotes
    FROM movements`).get() as Record<string, string | number>;
  const source = String(database.prepare("SELECT value FROM report_meta WHERE key = 'source_system'").get()?.value ?? '');
  const issues = [
    integrity === 'ok' ? '' : `SQLite integrity: ${integrity}`,
    Number(profile.rows) >= 500 ? '' : 'Expected at least 500 synthetic movement rows.',
    Number(profile.clients) >= 12 ? '' : 'Expected at least 12 synthetic customers.',
    Number(profile.products) >= 12 ? '' : 'Expected at least 12 synthetic products.',
    Number(profile.sellers) === 4 ? '' : 'Expected exactly four synthetic sellers.',
    Number(profile.creditNotes) > 0 ? '' : 'Expected signed credit-note movements.',
    source === 'Synthetic local demo dataset' ? '' : 'Unexpected source metadata.',
  ].filter(Boolean);
  const result = { status: issues.length ? 'failed' : 'passed', source, profile, issues };
  const output = resolveActiveDataPaths().sptAudit;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (issues.length) process.exitCode = 1;
} finally {
  database.close();
}
