import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { backupOperationalDatabase, checkOperationalIntegrity, restoreOperationalDatabase } from './operations-backup';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('human operations backup', () => {
  it('creates an intact copy and restores it with a prior safety backup', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'salice-operations-'));
    directories.push(directory);
    const source = resolve(directory, 'operations.sqlite');
    const database = new DatabaseSync(source);
    database.exec('PRAGMA journal_mode=WAL; CREATE TABLE notes(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO notes(value) VALUES (\'original\');');
    database.close();
    const metadata = await backupOperationalDatabase(source, resolve(directory, 'backups'), 3);
    const backup = resolve(directory, 'backups', metadata.file);
    const changed = new DatabaseSync(source);
    changed.exec("UPDATE notes SET value='changed'");
    changed.close();
    const restored = await restoreOperationalDatabase(backup, source);
    expect(restored.safetyPath).toBeTruthy();
    expect(checkOperationalIntegrity(source).integrity).toBe('ok');
    const verify = new DatabaseSync(source, { readOnly: true });
    expect(verify.prepare('SELECT value FROM notes').get()?.value).toBe('original');
    verify.close();
  });

  it('rejects a restore while the server is marked as running', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'salice-operations-lock-'));
    directories.push(directory);
    const source = resolve(directory, 'operations.sqlite');
    const backup = resolve(directory, 'backup.sqlite');
    for (const path of [source, backup]) {
      const database = new DatabaseSync(path);
      database.exec('CREATE TABLE notes(id INTEGER PRIMARY KEY)');
      database.close();
    }
    await writeFile(resolve(directory, 'salice-server.lock'), JSON.stringify({ pid: process.pid }));
    await expect(restoreOperationalDatabase(backup, source)).rejects.toThrow(/running/);
  });
});
