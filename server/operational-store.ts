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
  CommercialGoalChange,
  CommercialGoalsPayload,
  CommercialGoalRow,
  CommercialGoalVersion,
  ClientTrendDirection,
  ClientTrendReview,
  DashboardData,
  PaymentPromise,
  PaymentPromiseStatus,
  ReceivableCase,
  ReceivableCaseEvent,
  ReceivableCaseStatus,
  SavedView,
} from '../shared/models.js';
import { STATUS_TARGET_SOURCE, STATUS_TARGETS } from './data/status-targets.js';

const databasePath = process.env.SALICE_OPERATIONS_DB_PATH
  ? resolve(process.env.SALICE_OPERATIONS_DB_PATH)
  : resolve(process.cwd(), 'data/operations.sqlite');
let database: DatabaseSync | null = null;

function seedCommercialGoals(store: DatabaseSync) {
  const existing = Number(store.prepare('SELECT COUNT(*) AS total FROM commercial_goal_versions').get()?.total ?? 0);
  if (existing) {
    const generated = store.prepare(`
      SELECT id, source_label FROM commercial_goal_versions
      WHERE status = 'active' AND name = 'Synthetic demo plan' AND created_by = 'SMART Salice demo generator'
      ORDER BY version_number DESC LIMIT 1
    `).get() as { id: string; source_label: string } | undefined;
    if (!generated || generated.source_label === STATUS_TARGET_SOURCE.label) return;
    const insertGoal = store.prepare(`
      INSERT INTO commercial_goals (id, version_id, month, product, seller, kilos, accounts, invoicing)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const createdAt = new Date().toISOString();
    store.exec('BEGIN IMMEDIATE');
    try {
      store.prepare('DELETE FROM commercial_goals WHERE version_id = ?').run(generated.id);
      for (const row of STATUS_TARGETS) {
        insertGoal.run(randomUUID(), generated.id, row.month, row.product, row.seller, row.kilos, row.accounts, row.invoicing);
      }
      store.prepare(`UPDATE commercial_goal_versions SET source_label = ?, coverage_from = ?, coverage_through = ?, notes = ? WHERE id = ?`)
        .run(STATUS_TARGET_SOURCE.label, STATUS_TARGET_SOURCE.coverageFrom, STATUS_TARGET_SOURCE.coverageThrough,
          'Deterministic planning targets generated locally for the demo, with intentional wins and misses.', generated.id);
      store.prepare(`
        INSERT INTO commercial_goal_changes (
          id, version_id, event_type, entity_key, actor, comment, before_json, after_json, created_at
        ) VALUES (?, ?, 'row_updated', 'demo-plan-balance', ?, ?, NULL, ?, ?)
      `).run(randomUUID(), generated.id, 'SMART Salice demo generator',
        'Updated the packaged synthetic plan to include a balanced mix of achieved and missed months.',
        JSON.stringify({ rows: STATUS_TARGETS.length, source: STATUS_TARGET_SOURCE.label }), createdAt);
      store.exec('COMMIT');
    } catch (error) {
      store.exec('ROLLBACK');
      throw error;
    }
    return;
  }
  const versionId = randomUUID();
  const createdAt = new Date().toISOString();
  const insertGoal = store.prepare(`
    INSERT INTO commercial_goals (id, version_id, month, product, seller, kilos, accounts, invoicing)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`
      INSERT INTO commercial_goal_versions (
        id, version_number, name, status, source_label, coverage_from, coverage_through,
        notes, created_at, created_by, activated_at
      ) VALUES (?, 1, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      'Synthetic demo plan',
      STATUS_TARGET_SOURCE.label,
      STATUS_TARGET_SOURCE.coverageFrom,
      STATUS_TARGET_SOURCE.coverageThrough,
      'Deterministic planning targets generated locally for the demo.',
      createdAt,
      'SMART Salice demo generator',
      createdAt,
    );
    for (const row of STATUS_TARGETS) {
      insertGoal.run(randomUUID(), versionId, row.month, row.product, row.seller, row.kilos, row.accounts, row.invoicing);
    }
    store.prepare(`
      INSERT INTO commercial_goal_changes (
        id, version_id, event_type, entity_key, actor, comment, before_json, after_json, created_at
      ) VALUES (?, ?, 'created', '', ?, ?, NULL, ?, ?)
    `).run(
      randomUUID(), versionId, 'SMART Salice demo generator',
      'Created the synthetic versioned plan; targets remain separate from synthetic actuals.',
      JSON.stringify({ rows: STATUS_TARGETS.length, source: STATUS_TARGET_SOURCE.label }), createdAt,
    );
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
}

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
    CREATE TABLE IF NOT EXISTS receivable_cases (
      client_id INTEGER PRIMARY KEY,
      responsible TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unmanaged',
      next_follow_up_at TEXT,
      promise_amount REAL,
      promise_due_at TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_receivable_cases_status ON receivable_cases(status, next_follow_up_at);
    CREATE INDEX IF NOT EXISTS idx_receivable_cases_responsible ON receivable_cases(responsible, status);
    CREATE TABLE IF NOT EXISTS receivable_case_events (
      id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      before_json TEXT,
      after_json TEXT,
      batch_id TEXT,
      deleted_at TEXT,
      deleted_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_receivable_events_client ON receivable_case_events(client_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS client_trend_reviews (
      client_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      PRIMARY KEY (client_id, direction),
      CHECK (direction IN ('growth', 'decline'))
    );
    CREATE INDEX IF NOT EXISTS idx_client_trend_reviews_direction ON client_trend_reviews(direction, reviewed_at DESC);
    CREATE TABLE IF NOT EXISTS saved_views (
      id TEXT PRIMARY KEY,
      view_key TEXT NOT NULL,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_views_key ON saved_views(view_key, favorite DESC, updated_at DESC);
    CREATE TABLE IF NOT EXISTS commercial_goal_versions (
      id TEXT PRIMARY KEY,
      version_number INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      source_label TEXT NOT NULL,
      coverage_from TEXT NOT NULL,
      coverage_through TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      activated_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_versions_active ON commercial_goal_versions(status) WHERE status = 'active';
    CREATE TABLE IF NOT EXISTS commercial_goals (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      month TEXT NOT NULL,
      product TEXT NOT NULL DEFAULT '',
      seller TEXT NOT NULL DEFAULT '',
      kilos REAL,
      accounts REAL,
      invoicing REAL,
      FOREIGN KEY(version_id) REFERENCES commercial_goal_versions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_commercial_goals_version_month ON commercial_goals(version_id, month);
    CREATE TABLE IF NOT EXISTS commercial_goal_changes (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_key TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(version_id) REFERENCES commercial_goal_versions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_goal_changes_version ON commercial_goal_changes(version_id, created_at DESC);
    CREATE TRIGGER IF NOT EXISTS prevent_receivable_event_delete
      BEFORE DELETE ON receivable_case_events
      BEGIN SELECT RAISE(ABORT, 'The collections history is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_goal_change_update
      BEFORE UPDATE ON commercial_goal_changes
      BEGIN SELECT RAISE(ABORT, 'The goals history is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_goal_change_delete
      BEFORE DELETE ON commercial_goal_changes
      BEGIN SELECT RAISE(ABORT, 'The goals history is append-only'); END;
  `);
  const caseColumns = new Set(database.prepare('PRAGMA table_info(receivable_cases)').all().map((row) => String(row.name)));
  if (!caseColumns.has('promise_amount')) database.exec('ALTER TABLE receivable_cases ADD COLUMN promise_amount REAL');
  if (!caseColumns.has('promise_due_at')) database.exec('ALTER TABLE receivable_cases ADD COLUMN promise_due_at TEXT');
  const eventColumns = new Set(database.prepare('PRAGMA table_info(receivable_case_events)').all().map((row) => String(row.name)));
  if (!eventColumns.has('batch_id')) database.exec('ALTER TABLE receivable_case_events ADD COLUMN batch_id TEXT');
  if (!eventColumns.has('deleted_at')) database.exec('ALTER TABLE receivable_case_events ADD COLUMN deleted_at TEXT');
  if (!eventColumns.has('deleted_by')) database.exec('ALTER TABLE receivable_case_events ADD COLUMN deleted_by TEXT');
  database.exec(`
    DROP TRIGGER IF EXISTS prevent_receivable_event_update;
    CREATE TRIGGER IF NOT EXISTS prevent_receivable_event_core_update
      BEFORE UPDATE OF id, client_id, event_type, actor, comment, before_json, after_json, batch_id, created_at ON receivable_case_events
      BEGIN SELECT RAISE(ABORT, 'Collections history content is immutable'); END;
  `);
  seedCommercialGoals(database);
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

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function emptyReceivableCase(clientId: number): ReceivableCase {
  return {
    clientId,
    responsible: '',
    status: 'unmanaged',
    nextFollowUpAt: null,
    promiseAmount: null,
    promiseDueAt: null,
    updatedAt: '',
    updatedBy: '',
    lastComment: '',
    eventCount: 0,
  };
}

function receivableCaseFromRow(row: Record<string, unknown>): ReceivableCase {
  return {
    clientId: Number(row.client_id),
    responsible: textValue(row.responsible),
    status: textValue(row.status) as ReceivableCaseStatus,
    nextFollowUpAt: nullableText(row.next_follow_up_at),
    promiseAmount: row.promise_amount == null ? null : Number(row.promise_amount),
    promiseDueAt: nullableText(row.promise_due_at),
    updatedAt: textValue(row.updated_at),
    updatedBy: textValue(row.updated_by),
    lastComment: textValue(row.last_comment),
    eventCount: Number(row.event_count ?? 0),
  };
}

function receivableEventFromRow(row: Record<string, unknown>): ReceivableCaseEvent {
  return {
    id: textValue(row.id),
    clientId: Number(row.client_id),
    eventType: textValue(row.event_type) as ReceivableCaseEvent['eventType'],
    actor: textValue(row.actor),
    comment: textValue(row.comment),
    before: jsonRecord(row.before_json),
    after: jsonRecord(row.after_json),
    createdAt: textValue(row.created_at),
    deletedAt: nullableText(row.deleted_at),
    deletedBy: nullableText(row.deleted_by),
  };
}

function clientTrendReviewFromRow(row: Record<string, unknown>): ClientTrendReview {
  return {
    clientId: Number(row.client_id),
    direction: textValue(row.direction) as ClientTrendDirection,
    reviewedAt: textValue(row.reviewed_at),
  };
}

function savedViewFromRow(row: Record<string, unknown>): SavedView {
  return {
    id: textValue(row.id),
    viewKey: textValue(row.view_key) as SavedView['viewKey'],
    name: textValue(row.name),
    filters: jsonRecord(row.filters_json) as Record<string, string> ?? {},
    favorite: Boolean(row.favorite),
    createdAt: textValue(row.created_at),
    updatedAt: textValue(row.updated_at),
  };
}

function commercialGoalFromRow(row: Record<string, unknown>): CommercialGoalRow {
  return {
    id: textValue(row.id),
    month: textValue(row.month),
    product: textValue(row.product),
    seller: textValue(row.seller),
    kilos: row.kilos == null ? null : Number(row.kilos),
    accounts: row.accounts == null ? null : Number(row.accounts),
    invoicing: row.invoicing == null ? null : Number(row.invoicing),
  };
}

function commercialGoalVersionFromRow(row: Record<string, unknown>): CommercialGoalVersion {
  return {
    id: textValue(row.id),
    version: Number(row.version_number),
    name: textValue(row.name),
    status: textValue(row.status) as CommercialGoalVersion['status'],
    sourceLabel: textValue(row.source_label),
    coverageFrom: textValue(row.coverage_from),
    coverageThrough: textValue(row.coverage_through),
    notes: textValue(row.notes),
    createdAt: textValue(row.created_at),
    createdBy: textValue(row.created_by),
    activatedAt: nullableText(row.activated_at),
    rowCount: Number(row.row_count ?? 0),
  };
}

function commercialGoalChangeFromRow(row: Record<string, unknown>): CommercialGoalChange {
  return {
    id: textValue(row.id),
    versionId: textValue(row.version_id),
    eventType: textValue(row.event_type) as CommercialGoalChange['eventType'],
    entityKey: textValue(row.entity_key),
    actor: textValue(row.actor),
    comment: textValue(row.comment),
    before: jsonRecord(row.before_json),
    after: jsonRecord(row.after_json),
    createdAt: textValue(row.created_at),
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
        reason: `Follow-up scheduled after ${activity.type === 'visit' ? 'the visit' : 'the activity'}`,
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

export function listClientTrendReviews(direction?: ClientTrendDirection) {
  const rows = direction
    ? db().prepare('SELECT * FROM client_trend_reviews WHERE direction = ? ORDER BY reviewed_at DESC').all(direction)
    : db().prepare('SELECT * FROM client_trend_reviews ORDER BY reviewed_at DESC').all();
  return rows.map((row) => clientTrendReviewFromRow(row));
}

export function setClientTrendReviewed(clientId: number, direction: ClientTrendDirection, reviewed: boolean) {
  if (reviewed) {
    const reviewedAt = new Date().toISOString();
    db().prepare(`
      INSERT INTO client_trend_reviews (client_id, direction, reviewed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(client_id, direction) DO UPDATE SET reviewed_at = excluded.reviewed_at
    `).run(clientId, direction, reviewedAt);
    return { clientId, direction, reviewedAt } satisfies ClientTrendReview;
  }
  db().prepare('DELETE FROM client_trend_reviews WHERE client_id = ? AND direction = ?').run(clientId, direction);
  return null;
}

const receivablePromiseId = (clientId: number) => `receivable-case:${clientId}`;

export function syncReceivablePaymentPromise(clientId: number, seller: string) {
  const store = db();
  const workflow = getReceivableCase(clientId);
  const id = receivablePromiseId(clientId);
  if (!workflow || workflow.status !== 'promise' || workflow.promiseAmount == null || !workflow.promiseDueAt) {
    store.prepare('DELETE FROM payment_promises WHERE id = ?').run(id);
    return null;
  }
  const now = new Date().toISOString();
  const cleanSeller = seller.trim().slice(0, 120) || workflow.responsible || 'No seller';
  store.prepare(`
    INSERT INTO payment_promises (id, client_id, activity_id, seller, due_at, amount, status, note, created_at, resolved_at)
    VALUES (?, ?, NULL, ?, ?, ?, 'pending', ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      seller = excluded.seller,
      due_at = excluded.due_at,
      amount = excluded.amount,
      status = 'pending',
      note = excluded.note,
      resolved_at = NULL
  `).run(id, clientId, cleanSeller, workflow.promiseDueAt, workflow.promiseAmount, 'Promise recorded from Accounts Receivable.', now);
  return promiseFromRow(store.prepare('SELECT * FROM payment_promises WHERE id = ?').get(id)!);
}

export function listReceivableCases() {
  return db().prepare(`
    SELECT cases.*,
      (SELECT COUNT(*) FROM receivable_case_events events WHERE events.client_id = cases.client_id AND events.deleted_at IS NULL) AS event_count,
      COALESCE((
        SELECT comment FROM receivable_case_events events
        WHERE events.client_id = cases.client_id AND events.deleted_at IS NULL AND TRIM(comment) <> ''
        ORDER BY created_at DESC, rowid DESC LIMIT 1
      ), '') AS last_comment
    FROM receivable_cases cases
    ORDER BY updated_at DESC
  `).all().map((row) => receivableCaseFromRow(row));
}

export function getReceivableCase(clientId: number) {
  const row = db().prepare(`
    SELECT cases.*,
      (SELECT COUNT(*) FROM receivable_case_events events WHERE events.client_id = cases.client_id AND events.deleted_at IS NULL) AS event_count,
      COALESCE((
        SELECT comment FROM receivable_case_events events
        WHERE events.client_id = cases.client_id AND events.deleted_at IS NULL AND TRIM(comment) <> ''
        ORDER BY created_at DESC, rowid DESC LIMIT 1
      ), '') AS last_comment
    FROM receivable_cases cases WHERE client_id = ?
  `).get(clientId);
  return row ? receivableCaseFromRow(row) : null;
}

function addReceivableEvent(store: DatabaseSync, input: {
  clientId: number;
  eventType: ReceivableCaseEvent['eventType'];
  actor: string;
  comment?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  batchId?: string;
  createdAt: string;
}) {
  store.prepare(`
    INSERT INTO receivable_case_events (
      id, client_id, event_type, actor, comment, before_json, after_json, batch_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), input.clientId, input.eventType, input.actor, input.comment ?? '',
    input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null, input.batchId ?? randomUUID(),
    input.createdAt,
  );
}

export function saveReceivableCase(input: {
  clientId: number;
  responsible: string;
  status: ReceivableCaseStatus;
  nextFollowUpAt: string | null;
  promiseAmount?: number | null;
  promiseDueAt?: string | null;
  actor: string;
  comment?: string;
}) {
  const store = db();
  const current = getReceivableCase(input.clientId);
  const before = current ?? emptyReceivableCase(input.clientId);
  const createdAt = new Date().toISOString();
  const responsible = input.responsible.trim().slice(0, 120);
  const actor = input.actor.trim().slice(0, 120) || 'SMART Salice Office';
  const comment = String(input.comment ?? '').trim().slice(0, 2000);
  const promiseAmount = input.status === 'promise' && input.promiseAmount != null ? Number(input.promiseAmount) : null;
  const promiseDueAt = input.status === 'promise' ? input.promiseDueAt ?? null : null;
  const changed = !current
    || before.responsible !== responsible
    || before.status !== input.status
    || before.nextFollowUpAt !== input.nextFollowUpAt
    || before.promiseAmount !== promiseAmount
    || before.promiseDueAt !== promiseDueAt;
  if (!changed && !comment) return current;
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`
      INSERT INTO receivable_cases (client_id, responsible, status, next_follow_up_at, promise_amount, promise_due_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET
        responsible = excluded.responsible,
        status = excluded.status,
        next_follow_up_at = excluded.next_follow_up_at,
        promise_amount = excluded.promise_amount,
        promise_due_at = excluded.promise_due_at,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(input.clientId, responsible, input.status, input.nextFollowUpAt, promiseAmount, promiseDueAt, createdAt, actor);
    const after = { responsible, status: input.status, nextFollowUpAt: input.nextFollowUpAt, promiseAmount, promiseDueAt };
    addReceivableEvent(store, {
      clientId: input.clientId,
      eventType: !current ? 'created' : changed ? 'follow_up' : 'comment',
      actor,
      comment,
      before: current ? {
        responsible: before.responsible,
        status: before.status,
        nextFollowUpAt: before.nextFollowUpAt,
        promiseAmount: before.promiseAmount,
        promiseDueAt: before.promiseDueAt,
      } : null,
      after,
      createdAt,
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return getReceivableCase(input.clientId)!;
}

export function addReceivableComment(clientId: number, comment: string, actor = 'SMART Salice Office') {
  const current = getReceivableCase(clientId) ?? saveReceivableCase({
    clientId, responsible: '', status: 'unmanaged', nextFollowUpAt: null, actor,
  });
  const createdAt = new Date().toISOString();
  const cleanComment = comment.trim().slice(0, 2000);
  if (!cleanComment) return current;
  const store = db();
  store.exec('BEGIN IMMEDIATE');
  try {
    addReceivableEvent(store, {
      clientId, eventType: 'comment', actor: actor.trim().slice(0, 120) || 'SMART Salice Office',
      comment: cleanComment, before: null, after: null, createdAt,
    });
    store.prepare('UPDATE receivable_cases SET updated_at = ?, updated_by = ? WHERE client_id = ?')
      .run(createdAt, actor.trim().slice(0, 120) || 'SMART Salice Office', clientId);
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return getReceivableCase(clientId)!;
}

export function listReceivableCaseEvents(clientId: number, limit = 100) {
  return db().prepare(`
    SELECT * FROM receivable_case_events WHERE client_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT ?
  `).all(clientId, Math.max(1, Math.min(500, limit))).map((row) => receivableEventFromRow(row));
}

function rebuildReceivableCaseFromEvents(store: DatabaseSync, clientId: number) {
  const events = store.prepare(`
    SELECT * FROM receivable_case_events
    WHERE client_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC, rowid ASC
  `).all(clientId).map((row) => receivableEventFromRow(row));
  if (!events.length) {
    store.prepare('DELETE FROM receivable_cases WHERE client_id = ?').run(clientId);
    return;
  }
  const state = emptyReceivableCase(clientId);
  for (const event of events) {
    const after = event.after;
    if (!after) continue;
    if (Object.hasOwn(after, 'responsible')) state.responsible = String(after.responsible ?? '');
    if (Object.hasOwn(after, 'status')) state.status = String(after.status ?? 'unmanaged') as ReceivableCaseStatus;
    if (Object.hasOwn(after, 'nextFollowUpAt')) state.nextFollowUpAt = nullableText(after.nextFollowUpAt);
    if (Object.hasOwn(after, 'promiseAmount')) state.promiseAmount = after.promiseAmount == null ? null : Number(after.promiseAmount);
    if (Object.hasOwn(after, 'promiseDueAt')) state.promiseDueAt = nullableText(after.promiseDueAt);
  }
  const latest = events.at(-1)!;
  store.prepare(`
    INSERT INTO receivable_cases (client_id, responsible, status, next_follow_up_at, promise_amount, promise_due_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      responsible = excluded.responsible,
      status = excluded.status,
      next_follow_up_at = excluded.next_follow_up_at,
      promise_amount = excluded.promise_amount,
      promise_due_at = excluded.promise_due_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(
    clientId, state.responsible, state.status, state.nextFollowUpAt, state.promiseAmount,
    state.promiseDueAt, latest.createdAt, latest.actor,
  );
}

export function rebuildAllReceivableCasesFromEvents() {
  const store = db();
  const clientIds = store.prepare('SELECT client_id FROM receivable_cases ORDER BY client_id').all().map((row) => Number(row.client_id));
  store.exec('BEGIN IMMEDIATE');
  try {
    for (const clientId of clientIds) rebuildReceivableCaseFromEvents(store, clientId);
    // These rows project follow-up state; they are not a second source of truth.
    // They are rebuilt from valid cases on server startup.
    store.prepare("DELETE FROM payment_promises WHERE id LIKE 'receivable-case:%'").run();
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
}

export function deleteReceivableCaseEvent(clientId: number, eventId: string, actor = 'SMART Salice Office') {
  const store = db();
  const current = store.prepare('SELECT * FROM receivable_case_events WHERE id = ? AND client_id = ?').get(eventId, clientId);
  if (!current || current.deleted_at) return false;
  const deletedAt = new Date().toISOString();
  const deletedBy = actor.trim().slice(0, 120) || 'SMART Salice Office';
  store.exec('BEGIN IMMEDIATE');
  try {
    // Events created by one human action share a batch and are deleted together.
    if (current.batch_id) {
      store.prepare(`
        UPDATE receivable_case_events SET deleted_at = ?, deleted_by = ?
        WHERE client_id = ? AND batch_id = ? AND deleted_at IS NULL
      `).run(deletedAt, deletedBy, clientId, textValue(current.batch_id));
    } else {
      store.prepare(`
        UPDATE receivable_case_events SET deleted_at = ?, deleted_by = ?
        WHERE client_id = ? AND created_at = ? AND deleted_at IS NULL
      `).run(deletedAt, deletedBy, clientId, textValue(current.created_at));
    }
    rebuildReceivableCaseFromEvents(store, clientId);
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export function listSavedViews(viewKey?: SavedView['viewKey']) {
  const rows = viewKey
    ? db().prepare('SELECT * FROM saved_views WHERE view_key = ? ORDER BY favorite DESC, updated_at DESC').all(viewKey)
    : db().prepare('SELECT * FROM saved_views ORDER BY view_key, favorite DESC, updated_at DESC').all();
  return rows.map((row) => savedViewFromRow(row));
}

export function createSavedView(input: {
  viewKey: SavedView['viewKey'];
  name: string;
  filters: Record<string, string>;
  favorite?: boolean;
}) {
  const now = new Date().toISOString();
  const view: SavedView = {
    id: randomUUID(),
    viewKey: input.viewKey,
    name: input.name.trim().slice(0, 80),
    filters: input.filters,
    favorite: Boolean(input.favorite),
    createdAt: now,
    updatedAt: now,
  };
  db().prepare(`
    INSERT INTO saved_views (id, view_key, name, filters_json, favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(view.id, view.viewKey, view.name, JSON.stringify(view.filters), Number(view.favorite), view.createdAt, view.updatedAt);
  return view;
}

export function updateSavedView(id: string, input: { name?: string; filters?: Record<string, string>; favorite?: boolean }) {
  const currentRow = db().prepare('SELECT * FROM saved_views WHERE id = ?').get(id);
  if (!currentRow) return null;
  const current = savedViewFromRow(currentRow);
  const updated: SavedView = {
    ...current,
    name: input.name == null ? current.name : input.name.trim().slice(0, 80),
    filters: input.filters ?? current.filters,
    favorite: input.favorite ?? current.favorite,
    updatedAt: new Date().toISOString(),
  };
  db().prepare('UPDATE saved_views SET name = ?, filters_json = ?, favorite = ?, updated_at = ? WHERE id = ?')
    .run(updated.name, JSON.stringify(updated.filters), Number(updated.favorite), updated.updatedAt, id);
  return updated;
}

export function deleteSavedView(id: string) {
  return Number(db().prepare('DELETE FROM saved_views WHERE id = ?').run(id).changes) > 0;
}

function goalVersionQuery() {
  return `SELECT versions.*,
    (SELECT COUNT(*) FROM commercial_goals goals WHERE goals.version_id = versions.id) AS row_count
    FROM commercial_goal_versions versions`;
}

export function listCommercialGoalVersions() {
  return db().prepare(`${goalVersionQuery()} ORDER BY version_number DESC`).all()
    .map((row) => commercialGoalVersionFromRow(row));
}

export function getCommercialGoalVersion(id?: string) {
  const row = id
    ? db().prepare(`${goalVersionQuery()} WHERE versions.id = ?`).get(id)
    : db().prepare(`${goalVersionQuery()} WHERE versions.status = 'active' LIMIT 1`).get();
  return row ? commercialGoalVersionFromRow(row) : null;
}

export function listCommercialGoals(versionId: string, month?: string) {
  const rows = month
    ? db().prepare('SELECT * FROM commercial_goals WHERE version_id = ? AND month = ? ORDER BY product COLLATE NOCASE, seller COLLATE NOCASE, id').all(versionId, month)
    : db().prepare('SELECT * FROM commercial_goals WHERE version_id = ? ORDER BY month, product COLLATE NOCASE, seller COLLATE NOCASE, id').all(versionId);
  return rows.map((row) => commercialGoalFromRow(row));
}

export function listCommercialGoalChanges(versionId: string, limit = 100) {
  return db().prepare('SELECT * FROM commercial_goal_changes WHERE version_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
    .all(versionId, Math.max(1, Math.min(500, limit))).map((row) => commercialGoalChangeFromRow(row));
}

export function getActiveCommercialGoalPlan() {
  const version = getCommercialGoalVersion();
  if (!version) throw new Error('No active commercial plan exists.');
  return {
    version,
    source: {
      label: `${version.sourceLabel} · ${version.name} · v${version.version}`,
      capturedAt: version.activatedAt?.slice(0, 10) ?? version.createdAt.slice(0, 10),
      coverageFrom: version.coverageFrom,
      coverageThrough: version.coverageThrough,
    },
    rows: listCommercialGoals(version.id),
  };
}

export function getCommercialGoalsPayload(versionId?: string, month?: string): CommercialGoalsPayload {
  const versions = listCommercialGoalVersions();
  const selectedVersion = versions.find((item) => item.id === versionId) ?? versions.find((item) => item.status === 'active') ?? versions[0];
  if (!selectedVersion) throw new Error('No commercial plan is available.');
  const allRows = listCommercialGoals(selectedVersion.id);
  const months = [...new Set(allRows.map((row) => row.month))].sort();
  const selectedMonth = months.includes(month ?? '') ? month! : (months.at(-1) ?? '');
  const rows = selectedMonth ? allRows.filter((row) => row.month === selectedMonth) : allRows;
  return {
    versions,
    selectedVersion,
    selectedMonth,
    months,
    sellers: [...new Set(allRows.map((row) => row.seller).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    products: [...new Set(allRows.map((row) => row.product).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    rows,
    changes: listCommercialGoalChanges(selectedVersion.id, 100),
  };
}

function addGoalChange(store: DatabaseSync, input: {
  versionId: string;
  eventType: CommercialGoalChange['eventType'];
  entityKey?: string;
  actor: string;
  comment?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt?: string;
}) {
  store.prepare(`
    INSERT INTO commercial_goal_changes (
      id, version_id, event_type, entity_key, actor, comment, before_json, after_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), input.versionId, input.eventType, input.entityKey ?? '', input.actor,
    input.comment ?? '', input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null, input.createdAt ?? new Date().toISOString(),
  );
}

export function createCommercialGoalVersion(input: { name: string; notes?: string; cloneFromId?: string; actor?: string }) {
  const store = db();
  const source = input.cloneFromId ? getCommercialGoalVersion(input.cloneFromId) : getCommercialGoalVersion();
  if (!source) throw new Error('No base plan is available to clone.');
  const versionNumber = Number(store.prepare('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM commercial_goal_versions').get()?.next ?? 1);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const actor = input.actor?.trim().slice(0, 120) || 'SMART Salice Office';
  const name = input.name.trim().slice(0, 120) || `Commercial plan v${versionNumber}`;
  const sourceRows = listCommercialGoals(source.id);
  const insertGoal = store.prepare(`
    INSERT INTO commercial_goals (id, version_id, month, product, seller, kilos, accounts, invoicing)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`
      INSERT INTO commercial_goal_versions (
        id, version_number, name, status, source_label, coverage_from, coverage_through,
        notes, created_at, created_by, activated_at
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id, versionNumber, name, `Cloned from ${source.name} · v${source.version}`,
      source.coverageFrom, source.coverageThrough, String(input.notes ?? '').trim().slice(0, 1000), createdAt, actor,
    );
    for (const row of sourceRows) {
      insertGoal.run(randomUUID(), id, row.month, row.product, row.seller, row.kilos, row.accounts, row.invoicing);
    }
    addGoalChange(store, {
      versionId: id, eventType: 'created', actor,
      comment: `Version created from ${source.name} · v${source.version}.`,
      after: { rows: sourceRows.length, sourceVersionId: source.id }, createdAt,
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return getCommercialGoalVersion(id)!;
}

function requireDraftGoalVersion(versionId: string) {
  const version = getCommercialGoalVersion(versionId);
  if (!version) throw new Error('The goal version does not exist.');
  if (version.status !== 'draft') throw new Error('Only draft versions can be edited. Create a new version to preserve the audit trail.');
  return version;
}

export function updateCommercialGoalRow(versionId: string, rowId: string, input: {
  month: string;
  product: string;
  seller: string;
  kilos: number | null;
  accounts: number | null;
  invoicing: number | null;
  actor?: string;
  comment?: string;
}) {
  requireDraftGoalVersion(versionId);
  const store = db();
  const currentRow = store.prepare('SELECT * FROM commercial_goals WHERE id = ? AND version_id = ?').get(rowId, versionId);
  if (!currentRow) return null;
  const before = commercialGoalFromRow(currentRow);
  const after: CommercialGoalRow = {
    id: rowId,
    month: input.month,
    product: input.product.trim().slice(0, 160),
    seller: input.seller.trim().slice(0, 120),
    kilos: input.kilos,
    accounts: input.accounts,
    invoicing: input.invoicing,
  };
  const actor = input.actor?.trim().slice(0, 120) || 'SMART Salice Office';
  const createdAt = new Date().toISOString();
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`UPDATE commercial_goals SET month = ?, product = ?, seller = ?, kilos = ?, accounts = ?, invoicing = ? WHERE id = ? AND version_id = ?`)
      .run(after.month, after.product, after.seller, after.kilos, after.accounts, after.invoicing, rowId, versionId);
    addGoalChange(store, {
      versionId, eventType: 'row_updated', entityKey: rowId, actor,
      comment: String(input.comment ?? '').trim().slice(0, 1000), before: { ...before }, after: { ...after }, createdAt,
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return after;
}

export function createCommercialGoalRow(versionId: string, input: Omit<CommercialGoalRow, 'id'> & { actor?: string; comment?: string }) {
  requireDraftGoalVersion(versionId);
  const row: CommercialGoalRow = {
    id: randomUUID(),
    month: input.month,
    product: input.product.trim().slice(0, 160),
    seller: input.seller.trim().slice(0, 120),
    kilos: input.kilos,
    accounts: input.accounts,
    invoicing: input.invoicing,
  };
  const store = db();
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`
      INSERT INTO commercial_goals (id, version_id, month, product, seller, kilos, accounts, invoicing)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, versionId, row.month, row.product, row.seller, row.kilos, row.accounts, row.invoicing);
    addGoalChange(store, {
      versionId, eventType: 'row_created', entityKey: row.id,
      actor: input.actor?.trim().slice(0, 120) || 'SMART Salice Office',
      comment: String(input.comment ?? 'Goal added').trim().slice(0, 1000), before: null, after: { ...row },
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return row;
}

export function deleteCommercialGoalRow(versionId: string, rowId: string, actor = 'SMART Salice Office') {
  requireDraftGoalVersion(versionId);
  const store = db();
  const currentRow = store.prepare('SELECT * FROM commercial_goals WHERE id = ? AND version_id = ?').get(rowId, versionId);
  if (!currentRow) return false;
  const before = commercialGoalFromRow(currentRow);
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare('DELETE FROM commercial_goals WHERE id = ? AND version_id = ?').run(rowId, versionId);
    addGoalChange(store, {
      versionId, eventType: 'row_deleted', entityKey: rowId, actor: actor.trim().slice(0, 120) || 'SMART Salice Office',
      comment: 'Goal removed from draft.', before: { ...before }, after: null,
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export function activateCommercialGoalVersion(versionId: string, actor = 'SMART Salice Office', comment = '') {
  const version = requireDraftGoalVersion(versionId);
  const store = db();
  const coverage = store.prepare('SELECT MIN(month) AS first, MAX(month) AS last, COUNT(*) AS total FROM commercial_goals WHERE version_id = ?').get(versionId) as { first?: string; last?: string; total?: number };
  if (!coverage.total || !coverage.first || !coverage.last) throw new Error('The draft has no goals and cannot be activated.');
  const activatedAt = new Date().toISOString();
  const cleanActor = actor.trim().slice(0, 120) || 'SMART Salice Office';
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare("UPDATE commercial_goal_versions SET status = 'archived' WHERE status = 'active'").run();
    store.prepare(`
      UPDATE commercial_goal_versions SET status = 'active', coverage_from = ?, coverage_through = ?, activated_at = ? WHERE id = ?
    `).run(coverage.first, coverage.last, activatedAt, versionId);
    addGoalChange(store, {
      versionId, eventType: 'activated', actor: cleanActor,
      comment: comment.trim().slice(0, 1000) || `Plan ${version.name} activated for General Report.`,
      after: { coverageFrom: coverage.first, coverageThrough: coverage.last, rows: Number(coverage.total) }, createdAt: activatedAt,
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return getCommercialGoalVersion(versionId)!;
}

export function operationalStatus() {
  const store = db();
  const noteCount = Number((store.prepare('SELECT COUNT(*) AS total FROM client_notes').get()?.total) ?? 0);
  const activityCount = Number((store.prepare('SELECT COUNT(*) AS total FROM commercial_activities').get()?.total) ?? 0);
  const promiseCount = Number((store.prepare("SELECT COUNT(*) AS total FROM payment_promises WHERE status = 'pending'").get()?.total) ?? 0);
  const agendaCount = Number((store.prepare("SELECT COUNT(*) AS total FROM agenda_items WHERE status = 'pending'").get()?.total) ?? 0);
  const receivableCaseCount = Number((store.prepare('SELECT COUNT(*) AS total FROM receivable_cases').get()?.total) ?? 0);
  const savedViewCount = Number((store.prepare('SELECT COUNT(*) AS total FROM saved_views').get()?.total) ?? 0);
  const goalVersionCount = Number((store.prepare('SELECT COUNT(*) AS total FROM commercial_goal_versions').get()?.total) ?? 0);
  return {
    storage: 'SQLite local',
    notes: noteCount,
    activities: activityCount,
    pendingPromises: promiseCount,
    pendingAgendaItems: agendaCount,
    receivableCases: receivableCaseCount,
    savedViews: savedViewCount,
    goalVersions: goalVersionCount,
  };
}

export function ensureOperationalDatabase() {
  db();
  return databasePath;
}

export function getOperationalDatabasePath() {
  return databasePath;
}
