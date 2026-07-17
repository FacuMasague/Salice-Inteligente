import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import type { DashboardData } from '../shared/models.js';

const databasePath = resolve(process.cwd(), 'data/operations.sqlite');
let database: DatabaseSync | null = null;

function db() {
  if (database) return database;
  mkdirSync(dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS client_notes (
      client_id INTEGER PRIMARY KEY,
      note TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      completed_at TEXT NOT NULL,
      snapshot_at TEXT NOT NULL,
      status TEXT NOT NULL,
      clients INTEGER NOT NULL,
      products INTEGER NOT NULL
    );
  `);
  return database;
}

export function importSnapshotNotes(snapshot: DashboardData) {
  const rows = snapshot.clients.filter((client) => client.note.trim());
  if (!rows.length) return;
  const store = db();
  const insert = store.prepare('INSERT OR IGNORE INTO client_notes (client_id, note, updated_at) VALUES (?, ?, ?)');
  const importedAt = new Date().toISOString();
  store.exec('BEGIN IMMEDIATE');
  try {
    rows.forEach((client) => insert.run(client.id, client.note, importedAt));
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
}

export function mergeOperationalData(snapshot: DashboardData): DashboardData {
  const notes = new Map(
    db().prepare('SELECT client_id, note FROM client_notes').all()
      .map((row) => [Number(row.client_id), String(row.note)]),
  );
  if (!notes.size) return snapshot;
  return {
    ...snapshot,
    clients: snapshot.clients.map((client) => notes.has(client.id) ? { ...client, note: notes.get(client.id)! } : client),
  };
}

export function saveClientNote(clientId: number, note: string) {
  db().prepare(`
    INSERT INTO client_notes (client_id, note, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at
  `).run(clientId, note, new Date().toISOString());
}

export function recordSuccessfulSync(snapshot: DashboardData) {
  db().prepare(`
    INSERT INTO sync_runs (completed_at, snapshot_at, status, clients, products)
    VALUES (?, ?, 'success', ?, ?)
  `).run(new Date().toISOString(), snapshot.meta.generatedAt, snapshot.clients.length, snapshot.products.length);
}

export function operationalStatus() {
  const store = db();
  const noteCount = Number((store.prepare('SELECT COUNT(*) AS total FROM client_notes').get()?.total) ?? 0);
  const lastSync = store.prepare('SELECT completed_at, snapshot_at, status FROM sync_runs ORDER BY id DESC LIMIT 1').get();
  return {
    storage: 'SQLite local',
    notes: noteCount,
    lastSync: lastSync ? {
      completedAt: String(lastSync.completed_at),
      snapshotAt: String(lastSync.snapshot_at),
      status: String(lastSync.status),
    } : null,
  };
}

export function getOperationalDatabasePath() {
  return databasePath;
}
