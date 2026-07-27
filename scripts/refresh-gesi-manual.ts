import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  beginRefreshRun,
  completeRefreshRun,
  failRefreshRun,
  importSnapshotNotes,
  listRefreshRuns,
  recordSuccessfulSync,
  updateRefreshRunStage,
} from '../server/operational-store.js';
import {
  activateDataBundle,
  createBundlePaths,
  createDataBundleManifest,
  pruneDataBundles,
  resolveActiveDataPaths,
} from '../server/data-bundle.js';
import { runAiEnrichment } from '../server/ai-enrichment.js';
import { prepareAiSchema } from '../server/ai-store.js';
import type { DashboardData } from '../shared/models.js';
import { MANUAL_REFRESH_STAGES } from '../shared/refresh-plan.js';

const workspace = process.cwd();
const tsxCli = resolve(workspace, 'node_modules/tsx/dist/cli.mjs');
const rawCapturePath = resolve(workspace, 'data/raw/gesi-salice-latest.json');
const resumeRequested = process.argv.includes('--resume');

await prepareAiSchema();

let stages = MANUAL_REFRESH_STAGES;
if (resumeRequested) {
  const lastAttempt = listRefreshRuns(1)[0];
  const previousFailure = lastAttempt?.status === 'failed' ? lastAttempt : null;
  const failedStageIndex = previousFailure ? MANUAL_REFRESH_STAGES.findIndex((stage) => stage.id === previousFailure.stage) : -1;
  const failureHappenedAfterCapture = failedStageIndex >= 2 || previousFailure?.stage === 'manifest' || previousFailure?.stage === 'atomic-activation';
  const rawInfo = await stat(rawCapturePath).catch(() => null);
  const rawBelongsToFailure = Boolean(previousFailure && rawInfo && rawInfo.mtimeMs >= new Date(previousFailure.startedAt).getTime());
  if (!previousFailure || !failureHappenedAfterCapture || !rawBelongsToFailure) {
    throw new Error('No existe una captura auditada de la última ejecución fallida que pueda reanudarse con seguridad. Ejecutá pnpm run refresh:gesi.');
  }
  stages = MANUAL_REFRESH_STAGES.slice(1);
}

const configuredTrigger = String(process.env.SALICE_REFRESH_TRIGGER ?? '');
const runTrigger = resumeRequested
  ? 'manual-resume'
  : configuredTrigger === 'scheduled' || configuredTrigger === 'bootstrap'
    ? configuredTrigger
    : 'manual';
const run = beginRefreshRun(runTrigger);
const bundlePaths = createBundlePaths(run.id, workspace);
const previousSnapshotPath = resolveActiveDataPaths(workspace).snapshot;
let currentStage = 'preflight';
let bundleActivated = false;

await mkdir(resolve(bundlePaths.directory, 'quality'), { recursive: true });

const candidateEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  SALICE_CAPTURE_PATH: rawCapturePath,
  SALICE_SPT_OUTPUT_PATH: bundlePaths.commercial,
  SALICE_SPT_DB_PATH: bundlePaths.commercial,
  SALICE_SPT_AUDIT_OUTPUT_PATH: resolve(bundlePaths.directory, 'quality/spt-gesi-audit.json'),
  SALICE_SNAPSHOT_OUTPUT_PATH: bundlePaths.snapshot,
  SALICE_SNAPSHOT_PATH: bundlePaths.snapshot,
  SALICE_STAGING_OUTPUT_PATH: bundlePaths.staging,
  SALICE_STAGING_PATH: bundlePaths.staging,
  SALICE_PENDING_BALANCES_OUTPUT_PATH: bundlePaths.pendingBalances,
  SALICE_PENDING_BALANCES_DB_PATH: bundlePaths.pendingBalances,
  SALICE_EXECUTIVE_SUMMARY_OUTPUT_PATH: bundlePaths.executiveSummary,
  SALICE_PLATFORM_AUDIT_OUTPUT_PATH: resolve(bundlePaths.directory, 'quality/platform-audit.json'),
  SALICE_VECTOR_AUDIT_OUTPUT_PATH: resolve(bundlePaths.directory, 'quality/product-vectors.json'),
  SALICE_PREVIOUS_SNAPSHOT_PATH: previousSnapshotPath,
};

async function execute(script: string) {
  await new Promise<void>((resolveStage, rejectStage) => {
    const child = spawn(process.execPath, [tsxCli, resolve(workspace, script)], {
      cwd: workspace,
      env: candidateEnvironment,
      stdio: 'inherit',
    });
    child.once('error', rejectStage);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveStage();
      else rejectStage(new Error(`${basename(script)} terminó con ${signal ? `señal ${signal}` : `código ${code}`}`));
    });
  });
}

try {
  const triggerLabel = runTrigger === 'bootstrap'
    ? 'Actualización inicial'
    : runTrigger === 'scheduled'
      ? 'Actualización automática'
      : runTrigger === 'manual-resume'
        ? 'Reanudación manual'
        : 'Actualización manual';
  console.log(`${triggerLabel} Salice · ejecución ${run.id}`);
  console.log(`Paquete candidato: ${bundlePaths.directory}`);
  for (const stage of stages) {
    currentStage = stage.id;
    updateRefreshRunStage(run.id, currentStage);
    const startedAt = Date.now();
    console.log(`\n[${stage.label}] iniciando…`);
    await execute(stage.script);
    console.log(`[${stage.label}] aprobada en ${Math.round((Date.now() - startedAt) / 1000)} s`);
  }

  currentStage = 'manifest';
  updateRefreshRunStage(run.id, currentStage);
  const manifest = await createDataBundleManifest(run.id, bundlePaths, workspace);
  const snapshot = JSON.parse(await readFile(bundlePaths.snapshot, 'utf8')) as DashboardData;
  const platformAudit = JSON.parse(await readFile(resolve(bundlePaths.directory, 'quality/platform-audit.json'), 'utf8')) as { status?: string; summary?: { warnings?: number } };

  // Las notas históricas se importan antes del único cambio de estado activo.
  // Todos los artefactos candidatos ya fueron auditados en este punto.
  try {
    const current = JSON.parse(await readFile(previousSnapshotPath, 'utf8')) as DashboardData;
    importSnapshotNotes(current);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  currentStage = 'atomic-activation';
  updateRefreshRunStage(run.id, currentStage);
  await activateDataBundle(manifest, workspace);
  bundleActivated = true;
  recordSuccessfulSync(snapshot);
  const warnings = Number(platformAudit.summary?.warnings ?? snapshot.meta.coverage?.omittedInvoiceDetails ?? 0);
  await pruneDataBundles(run.id, 3, workspace).catch((error) => console.warn(`No se pudieron depurar paquetes antiguos: ${String(error)}`));
  console.log('\nEl manifiesto activo cambió en una única operación atómica.');
  currentStage = 'ai-enrichment';
  updateRefreshRunStage(run.id, currentStage);
  try {
    const aiRun = await runAiEnrichment({
      snapshot,
      snapshotAt: snapshot.meta.generatedAt,
      bundleId: run.id,
      trigger: 'refresh',
      workspace,
    });
    console.log(`Enriquecimiento IA: ${aiRun.status} · ${aiRun.completed} nuevos · ${aiRun.reused} reutilizados · USD ${aiRun.estimatedCostUsd.toFixed(4)}.`);
  } catch (error) {
    console.warn(`El snapshot quedó aprobado, pero el enriquecimiento IA no pudo completarse: ${error instanceof Error ? error.message : String(error)}`);
  }
  completeRefreshRun(run.id, snapshot, warnings, platformAudit.status ?? 'passed');
  console.log('Actualización manual completada con el resumen ejecutivo listo para cargar.');
} catch (error) {
  console.error(bundleActivated
    ? `\nLa actualización falló en ${currentStage} después de activar el paquete. Los datos permanecen activos, pero falló el registro operativo posterior.`
    : `\nLa actualización falló en ${currentStage}. El manifiesto activo no fue reemplazado.`);
  failRefreshRun(run.id, currentStage, error);
  if (!bundleActivated) {
    await rm(bundlePaths.directory, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exitCode = 1;
}
