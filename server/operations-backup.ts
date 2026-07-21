import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { activeServerPid } from './runtime-lock.js';

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function checksum(path: string) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export function checkOperationalIntegrity(path: string) {
  if (!existsSync(path)) throw new Error(`No existe la base operativa: ${path}`);
  const database = new DatabaseSync(path);
  try {
    database.exec('PRAGMA busy_timeout = 5000;');
    const result = String(database.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '');
    if (result !== 'ok') throw new Error(`integrity_check devolvió ${result || 'sin resultado'}`);
    const tables = Number(database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table'").get()?.total ?? 0);
    return { integrity: result, tables };
  } finally {
    database.close();
  }
}

export async function backupOperationalDatabase(sourcePath: string, backupDirectory: string, retain = 10) {
  checkOperationalIntegrity(sourcePath);
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const finalPath = resolve(backupDirectory, `operations-${stamp}-${randomUUID().slice(0, 8)}.sqlite`);
  const temporaryPath = `${finalPath}.tmp`;
  await rm(temporaryPath, { force: true });
  const source = new DatabaseSync(sourcePath);
  try {
    source.exec('PRAGMA busy_timeout = 5000; PRAGMA wal_checkpoint(PASSIVE);');
    source.exec(`VACUUM INTO ${sqlString(temporaryPath)}`);
  } finally {
    source.close();
  }
  checkOperationalIntegrity(temporaryPath);
  await rename(temporaryPath, finalPath);
  const info = await stat(finalPath);
  const metadata = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    source: sourcePath,
    file: basename(finalPath),
    bytes: info.size,
    sha256: await checksum(finalPath),
  };
  await writeFile(`${finalPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  const backups = (await readdir(backupDirectory)).filter((name) => /^operations-.*\.sqlite$/.test(name)).sort().reverse();
  for (const name of backups.slice(Math.max(1, retain))) {
    await rm(resolve(backupDirectory, name), { force: true });
    await rm(resolve(backupDirectory, `${name}.json`), { force: true });
  }
  return metadata;
}

export async function countOperationalBackups(backupDirectory = resolve(process.cwd(), 'data/operations-backups')) {
  return (await readdir(backupDirectory).catch(() => [])).filter((name) => /^operations-.*\.sqlite$/.test(name)).length;
}

export async function restoreOperationalDatabase(sourceBackup: string, targetPath: string) {
  checkOperationalIntegrity(sourceBackup);
  const runningPid = activeServerPid(resolve(dirname(targetPath), 'salice-server.lock'));
  if (runningPid) throw new Error(`Salice Inteligente está ejecutándose (PID ${runningPid}). Cerralo antes de restaurar.`);
  await mkdir(dirname(targetPath), { recursive: true });
  if (existsSync(targetPath)) {
    const active = new DatabaseSync(targetPath);
    try {
      active.exec('PRAGMA busy_timeout = 1000; PRAGMA wal_checkpoint(TRUNCATE); BEGIN EXCLUSIVE; COMMIT;');
    } catch {
      throw new Error('La base operativa está en uso. Cerrá Salice Inteligente antes de restaurarla.');
    } finally {
      active.close();
    }
  }
  const safetyPath = `${targetPath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (existsSync(targetPath)) await copyFile(targetPath, safetyPath);
  const temporaryPath = `${targetPath}.restore.tmp`;
  await copyFile(sourceBackup, temporaryPath);
  checkOperationalIntegrity(temporaryPath);
  await rm(`${targetPath}-wal`, { force: true });
  await rm(`${targetPath}-shm`, { force: true });
  await rename(temporaryPath, targetPath);
  return { restoredFrom: sourceBackup, targetPath, safetyPath: existsSync(safetyPath) ? safetyPath : null };
}
