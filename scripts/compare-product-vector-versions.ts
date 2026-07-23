import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DashboardData } from '../shared/models.js';
import { compareProductVectorVersions } from '../shared/product-vector-version-comparison.js';
import { resolveActiveDataPaths } from '../server/data-bundle.js';

const snapshotPath = resolve(process.env.SALICE_SNAPSHOT_PATH ?? resolveActiveDataPaths().snapshot);
const outputPath = resolve(process.env.SALICE_VECTOR_COMPARISON_OUTPUT_PATH ?? 'data/quality/product-vector-v2.2-comparison.json');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as DashboardData;
const result = compareProductVectorVersions(snapshot);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (!result.criteria.passed) process.exitCode = 1;
