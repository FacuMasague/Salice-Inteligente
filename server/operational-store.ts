import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import type {
  AgendaSource,
  AgendaStatus,
  CommercialActivity,
  CommercialActivityOutcome,
  CommercialActivityType,
  DashboardData,
  PaymentPromise,
  PaymentPromiseStatus,
} from '../shared/models.js';

const databasePath = process.env.SALICE_OPERATIONS_DB_PATH
  ? resolve(process.env.SALICE_OPERATIONS_DB_PATH)
  : resolve(process.cwd(), 'data/operations.sqlite');
let database: DatabaseSync | null = null;

function db() {
  if (database) return database;
  mkdirSync(dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
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
    CREATE TABLE IF NOT EXISTS commercial_activities (
      id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL,
      seller TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      outcome TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      amount REAL,
      product_ids_json TEXT NOT NULL DEFAULT '[]',
      next_action_at TEXT,
      agenda_item_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activities_client_date ON commercial_activities(client_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activities_seller_date ON commercial_activities(seller, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS payment_promises (
      id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL,
      activity_id TEXT,
      seller TEXT NOT NULL,
      due_at TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(activity_id) REFERENCES commercial_activities(id)
    );
    CREATE INDEX IF NOT EXISTS idx_promises_status_due ON payment_promises(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_promises_client ON payment_promises(client_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS agenda_items (
      id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL,
      seller TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      action_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_activity_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agenda_seller_date ON agenda_items(seller, scheduled_for, status);
  `);
  return database;
}

function textValue(value: unknown) {
  return value == null ? '' : String(value);
}

function nullableText(value: unknown) {
  return value == null || value === '' ? null : String(value);
}

function parseProductIds(value: unknown): string[] {
  try {
    const parsed = JSON.parse(textValue(value) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function activityFromRow(row: Record<string, unknown>): CommercialActivity {
  return {
    id: textValue(row.id),
    clientId: Number(row.client_id),
    seller: textValue(row.seller),
    type: textValue(row.activity_type) as CommercialActivityType,
    outcome: textValue(row.outcome) as CommercialActivityOutcome,
    occurredAt: textValue(row.occurred_at),
    note: textValue(row.note),
    amount: row.amount == null ? null : Number(row.amount),
    productIds: parseProductIds(row.product_ids_json),
    nextActionAt: nullableText(row.next_action_at),
    createdAt: textValue(row.created_at),
  };
}

function promiseFromRow(row: Record<string, unknown>): PaymentPromise {
  return {
    id: textValue(row.id),
    clientId: Number(row.client_id),
    activityId: nullableText(row.activity_id),
    seller: textValue(row.seller),
    dueAt: textValue(row.due_at),
    amount: Number(row.amount),
    status: textValue(row.status) as PaymentPromiseStatus,
    note: textValue(row.note),
    createdAt: textValue(row.created_at),
    resolvedAt: nullableText(row.resolved_at),
  };
}

export interface StoredAgendaItem {
  id: string;
  clientId: number;
  seller: string;
  scheduledFor: string;
  actionType: CommercialActivityType;
  reason: string;
  source: AgendaSource;
  status: AgendaStatus;
  createdAt: string;
  completedActivityId: string | null;
}

function agendaFromRow(row: Record<string, unknown>): StoredAgendaItem {
  return {
    id: textValue(row.id),
    clientId: Number(row.client_id),
    seller: textValue(row.seller),
    scheduledFor: textValue(row.scheduled_for),
    actionType: textValue(row.action_type) as CommercialActivityType,
    reason: textValue(row.reason),
    source: textValue(row.source) as AgendaSource,
    status: textValue(row.status) as AgendaStatus,
    createdAt: textValue(row.created_at),
    completedActivityId: nullableText(row.completed_activity_id),
  };
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

interface CreateActivityInput {
  clientId: number;
  seller: string;
  type: CommercialActivityType;
  outcome: CommercialActivityOutcome;
  occurredAt: string;
  note: string;
  amount: number | null;
  productIds: string[];
  nextActionAt: string | null;
  agendaItemId: string | null;
  promise: { dueAt: string; amount: number; note: string } | null;
}

export function createCommercialActivity(input: CreateActivityInput) {
  const store = db();
  const createdAt = new Date().toISOString();
  const activity: CommercialActivity = {
    id: randomUUID(),
    clientId: input.clientId,
    seller: input.seller,
    type: input.type,
    outcome: input.outcome,
    occurredAt: input.occurredAt,
    note: input.note,
    amount: input.amount,
    productIds: input.productIds,
    nextActionAt: input.nextActionAt,
    createdAt,
  };
  let promise: PaymentPromise | null = null;
  let nextAgendaItem: StoredAgendaItem | null = null;
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`
      INSERT INTO commercial_activities (
        id, client_id, seller, activity_type, outcome, occurred_at, note, amount,
        product_ids_json, next_action_at, agenda_item_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      activity.id, activity.clientId, activity.seller, activity.type, activity.outcome,
      activity.occurredAt, activity.note, activity.amount, JSON.stringify(activity.productIds),
      activity.nextActionAt, input.agendaItemId, activity.createdAt,
    );
    if (input.agendaItemId) {
      store.prepare(`
        UPDATE agenda_items SET status = 'completed', completed_activity_id = ? WHERE id = ?
      `).run(activity.id, input.agendaItemId);
    }
    if (input.promise) {
      promise = {
        id: randomUUID(),
        clientId: activity.clientId,
        activityId: activity.id,
        seller: activity.seller,
        dueAt: input.promise.dueAt,
        amount: input.promise.amount,
        status: 'pending',
        note: input.promise.note,
        createdAt,
        resolvedAt: null,
      };
      store.prepare(`
        INSERT INTO payment_promises (id, client_id, activity_id, seller, due_at, amount, status, note, created_at, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        promise.id, promise.clientId, promise.activityId, promise.seller, promise.dueAt,
        promise.amount, promise.status, promise.note, promise.createdAt, promise.resolvedAt,
      );
    }
    if (activity.nextActionAt) {
      nextAgendaItem = {
        id: randomUUID(),
        clientId: activity.clientId,
        seller: activity.seller,
        scheduledFor: activity.nextActionAt.slice(0, 10),
        actionType: activity.type === 'collection' ? 'collection' : 'visit',
        reason: `Seguimiento programado después de ${activity.type === 'visit' ? 'la visita' : 'la gestión'}`,
        source: 'manual',
        status: 'pending',
        createdAt,
        completedActivityId: null,
      };
      store.prepare(`
        INSERT INTO agenda_items (id, client_id, seller, scheduled_for, action_type, reason, source, status, created_at, completed_activity_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nextAgendaItem.id, nextAgendaItem.clientId, nextAgendaItem.seller, nextAgendaItem.scheduledFor,
        nextAgendaItem.actionType, nextAgendaItem.reason, nextAgendaItem.source, nextAgendaItem.status,
        nextAgendaItem.createdAt, nextAgendaItem.completedActivityId,
      );
    }
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return { activity, promise, nextAgendaItem };
}

export function createAgendaItem(input: {
  clientId: number;
  seller: string;
  scheduledFor: string;
  actionType: CommercialActivityType;
  reason: string;
}) {
  const item: StoredAgendaItem = {
    id: randomUUID(),
    clientId: input.clientId,
    seller: input.seller,
    scheduledFor: input.scheduledFor,
    actionType: input.actionType,
    reason: input.reason,
    source: 'manual',
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedActivityId: null,
  };
  db().prepare(`
    INSERT INTO agenda_items (id, client_id, seller, scheduled_for, action_type, reason, source, status, created_at, completed_activity_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id, item.clientId, item.seller, item.scheduledFor, item.actionType, item.reason,
    item.source, item.status, item.createdAt, item.completedActivityId,
  );
  return item;
}

export function listActivities(filters: { clientId?: number; seller?: string; from?: string; to?: string; limit?: number } = {}) {
  const rows = db().prepare('SELECT * FROM commercial_activities ORDER BY occurred_at DESC, created_at DESC').all()
    .map((row) => activityFromRow(row));
  return rows.filter((activity) => (
    (filters.clientId == null || activity.clientId === filters.clientId)
    && (!filters.seller || activity.seller === filters.seller)
    && (!filters.from || activity.occurredAt >= filters.from)
    && (!filters.to || activity.occurredAt <= filters.to)
  )).slice(0, filters.limit ?? 100);
}

export function listPromises(filters: { clientId?: number; seller?: string; status?: PaymentPromiseStatus; dueThrough?: string; limit?: number } = {}) {
  const rows = db().prepare('SELECT * FROM payment_promises ORDER BY due_at ASC, created_at DESC').all()
    .map((row) => promiseFromRow(row));
  return rows.filter((promise) => (
    (filters.clientId == null || promise.clientId === filters.clientId)
    && (!filters.seller || promise.seller === filters.seller)
    && (!filters.status || promise.status === filters.status)
    && (!filters.dueThrough || promise.dueAt <= filters.dueThrough)
  )).slice(0, filters.limit ?? 100);
}

export function listAgendaItems(filters: { clientId?: number; seller?: string; date?: string; includeCancelled?: boolean } = {}) {
  const rows = db().prepare('SELECT * FROM agenda_items ORDER BY scheduled_for ASC, created_at ASC').all()
    .map((row) => agendaFromRow(row));
  return rows.filter((item) => (
    (filters.clientId == null || item.clientId === filters.clientId)
    && (!filters.seller || item.seller === filters.seller)
    && (!filters.date || item.scheduledFor === filters.date)
    && (filters.includeCancelled || item.status !== 'cancelled')
  ));
}

export function updatePromiseStatus(id: string, status: PaymentPromiseStatus) {
  const current = db().prepare('SELECT * FROM payment_promises WHERE id = ?').get(id);
  if (!current) return null;
  const resolvedAt = status === 'pending' ? null : new Date().toISOString();
  db().prepare('UPDATE payment_promises SET status = ?, resolved_at = ? WHERE id = ?').run(status, resolvedAt, id);
  return promiseFromRow({ ...current, status, resolved_at: resolvedAt });
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
  const activityCount = Number((store.prepare('SELECT COUNT(*) AS total FROM commercial_activities').get()?.total) ?? 0);
  const promiseCount = Number((store.prepare("SELECT COUNT(*) AS total FROM payment_promises WHERE status = 'pending'").get()?.total) ?? 0);
  const agendaCount = Number((store.prepare("SELECT COUNT(*) AS total FROM agenda_items WHERE status = 'pending'").get()?.total) ?? 0);
  const lastSync = store.prepare('SELECT completed_at, snapshot_at, status FROM sync_runs ORDER BY id DESC LIMIT 1').get();
  return {
    storage: 'SQLite local',
    notes: noteCount,
    activities: activityCount,
    pendingPromises: promiseCount,
    pendingAgendaItems: agendaCount,
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
