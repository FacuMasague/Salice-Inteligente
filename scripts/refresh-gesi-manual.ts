import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { completeRefreshRun, beginRefreshRun, failRefreshRun, listRefreshRuns, updateRefreshRunStage } from '../server/operational-store.js';
import type { DashboardData } from '../shared/models.js';
import { ACTIVE_DATA_ARTIFACTS, MANUAL_REFRESH_STAGES } from '../shared/refresh-plan.js';

const workspace = process.cwd();
const tsxCli = resolve(workspace, 'node_modules/tsx/dist/cli.mjs');
const backupRoot = resolve(workspace, 'data/refresh-backups');
const rawCapturePath = resolve(workspace, 'data/raw/gesi-salice-latest.json');
const resumeRequested = process.argv.includes('--resume');

async function exists(path: string) {
  try { await stat(path); return true; } catch { return false; }
}

let stages = MANUAL_REFRESH_STAGES;
if (resumeRequested) {
  const lastAttempt = listRefreshRuns(1)[0];
  const previousFailure = lastAttempt?.status === 'failed' ? lastAttempt : null;
  const failedStageIndex = previousFailure ? MANUAL_REFRESH_STAGES.findIndex((stage) => stage.id === previousFailure.stage) : -1;
  const rawInfo = await stat(rawCapturePath).catch(() => null);
  const rawBelongsToFailure = Boolean(previousFailure && rawInfo && rawInfo.mtimeMs >= new Date(previousFailure.startedAt).getTime());
  if (!previousFailure || failedStageIndex < 2 || !rawBelongsToFailure) {
    throw new Error('No existe una captura auditada de la última ejecución fallida que pueda reanudarse con seguridad. Ejecutá pnpm run refresh:gesi.');
  }
  // Repite la auditoría de captura y reconstruye todos los artefactos activos.
  // La captura de la API es la única etapa que se saltea.
  stages = MANUAL_REFRESH_STAGES.slice(1);
}

const run = beginRefreshRun(resumeRequested ? 'manual-resume' : 'manual');
const backupDirectory = resolve(backupRoot, run.id);
let currentStage = 'preflight';

async function backupActiveArtifacts() {
  await mkdir(backupDirectory, { recursive: true });
  for (const relative of ACTIVE_DATA_ARTIFACTS) {
    const source = resolve(workspace, relative);
    if (!await exists(source)) continue;
    const target = resolve(backupDirectory, relative);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

async function restoreActiveArtifacts() {
  for (const relative of ACTIVE_DATA_ARTIFACTS) {
    const source = resolve(backupDirectory, relative);
    if (!await exists(source)) continue;
    const target = resolve(workspace, relative);
    const temporary = `${target}.restore-${run.id}`;
    await copyFile(source, temporary);
    await rename(temporary, target);
  }
}

async function pruneBackups() {
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  const directories = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => ({
    name: entry.name,
    modifiedAt: (await stat(resolve(backupRoot, entry.name))).mtimeMs,
  })));
  directories.sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (const entry of directories.slice(3)) await rm(resolve(backupRoot, entry.name), { recursive: true, force: true });
}

async function execute(script: string) {
  await new Promise<void>((resolveStage, rejectStage) => {
    const child = spawn(process.execPath, [tsxCli, resolve(workspace, script)], {
      cwd: workspace,
      env: process.env,
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
  console.log(`${resumeRequested ? 'Reanudación' : 'Actualización'} manual Salice · ejecución ${run.id}`);
  await backupActiveArtifacts();
  for (const stage of stages) {
    currentStage = stage.id;
    updateRefreshRunStage(run.id, currentStage);
    const startedAt = Date.now();
    console.log(`\n[${stage.label}] iniciando…`);
    await execute(stage.script);
    console.log(`[${stage.label}] aprobada en ${Math.round((Date.now() - startedAt) / 1000)} s`);
  }
  const snapshot = JSON.parse(await readFile(resolve(workspace, 'data/snapshot.json'), 'utf8')) as DashboardData;
  const platformAudit = JSON.parse(await readFile(resolve(workspace, 'data/quality/platform-audit.json'), 'utf8')) as { status?: string; summary?: { warnings?: number } };
  const warnings = Number(platformAudit.summary?.warnings ?? snapshot.meta.coverage?.omittedInvoiceDetails ?? 0);
  completeRefreshRun(run.id, snapshot, warnings, platformAudit.status ?? 'passed');
  await pruneBackups();
  console.log('\nActualización manual completada y validada.');
} catch (error) {
  console.error(`\nLa actualización falló en ${currentStage}. Se restaura la última versión activa válida.`);
  try {
    await restoreActiveArtifacts();
  } catch (restoreError) {
    const reason = restoreError instanceof Error ? restoreError.message : String(restoreError);
    failRefreshRun(run.id, `${currentStage}:restore`, `${error instanceof Error ? error.message : String(error)} · La restauración también falló: ${reason}`);
    throw restoreError;
  }
  failRefreshRun(run.id, currentStage, error);
  process.exitCode = 1;
}
