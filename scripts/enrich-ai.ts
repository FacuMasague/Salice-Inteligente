import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveActiveDataPaths } from '../server/data-bundle.js';
import { prepareAiSchema } from '../server/ai-store.js';
import { runAiEnrichment } from '../server/ai-enrichment.js';
import type { DashboardData } from '../shared/models.js';

const workspace = process.cwd();
const resume = process.argv.includes('--resume');
await prepareAiSchema();
const active = resolveActiveDataPaths(workspace);
const snapshot = JSON.parse(await readFile(active.snapshot, 'utf8')) as DashboardData;
const result = await runAiEnrichment({
  snapshot,
  snapshotAt: snapshot.meta.generatedAt,
  bundleId: active.bundleId,
  trigger: resume ? 'manual-resume' : 'manual',
  resume,
  workspace,
});
console.log(JSON.stringify(result, null, 2));
if (result.status === 'failed' || result.status === 'partial') process.exitCode = 1;
