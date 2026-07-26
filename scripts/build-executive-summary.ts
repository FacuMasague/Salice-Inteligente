import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveActiveDataPaths } from '../server/data-bundle.js';
import { buildExecutiveSummary } from '../server/executive-summary.js';
import type { DashboardData } from '../shared/models.js';

const activePaths = resolveActiveDataPaths();
const snapshotPath = resolve(process.env.SALICE_SNAPSHOT_PATH ?? activePaths.snapshot);
const outputPath = resolve(process.env.SALICE_EXECUTIVE_SUMMARY_OUTPUT_PATH ?? activePaths.executiveSummary);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as DashboardData;
const summary = buildExecutiveSummary(snapshot);

if (!summary) {
  throw new Error('No se pudo construir “¿Cómo estamos?” porque falta al menos una fuente analítica candidata.');
}
if (summary.snapshotAt !== snapshot.meta.generatedAt) {
  throw new Error('El resumen ejecutivo no pertenece al mismo corte que el snapshot candidato.');
}

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(summary)}\n`, 'utf8');
await rename(temporaryPath, outputPath);

console.log(`Resumen ejecutivo preparado para ${summary.snapshotAt}.`);
