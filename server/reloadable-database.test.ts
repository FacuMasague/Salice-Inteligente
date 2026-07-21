import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { ReloadableReadonlyDatabase } from './reloadable-database';

let directory = '';

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = '';
});

function writeDatabase(path: string, value: string) {
  const temporary = `${path}.next`;
  const db = new DatabaseSync(temporary);
  db.exec('CREATE TABLE meta(value TEXT NOT NULL)');
  db.prepare('INSERT INTO meta(value) VALUES (?)').run(value);
  db.close();
  renameSync(temporary, path);
}

describe('reloadable analytical database', () => {
  it('opens an atomic replacement without restarting the server', () => {
    directory = mkdtempSync(join(tmpdir(), 'salice-db-'));
    const path = join(directory, 'report.sqlite');
    writeDatabase(path, 'primera');
    const source = new ReloadableReadonlyDatabase(path);
    const first = source.get();
    expect(first?.changed).toBe(true);
    expect(first?.database.prepare('SELECT value FROM meta').get()?.value).toBe('primera');

    writeDatabase(path, 'longer second version');
    const second = source.get();
    expect(second?.changed).toBe(true);
    expect(second?.database.prepare('SELECT value FROM meta').get()?.value).toBe('longer second version');
    source.close();
  });

  it('switches files when the resolver points to a new generation', () => {
    directory = mkdtempSync(join(tmpdir(), 'salice-db-generation-'));
    const firstPath = join(directory, 'first.sqlite');
    const secondPath = join(directory, 'second.sqlite');
    writeDatabase(firstPath, 'primera');
    writeDatabase(secondPath, 'segunda');
    let activePath = firstPath;
    const source = new ReloadableReadonlyDatabase(() => activePath);
    expect(source.get()?.database.prepare('SELECT value FROM meta').get()?.value).toBe('primera');
    activePath = secondPath;
    const second = source.get();
    expect(second?.changed).toBe(true);
    expect(second?.database.prepare('SELECT value FROM meta').get()?.value).toBe('segunda');
    source.close();
  });
});
