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
  CommercialOpportunityLink,
  ClientTrendDirection,
  ClientTrendReview,
  DashboardData,
  PaymentPromise,
  PaymentPromiseStatus,
  Product,
  ProductVectorCorrection,
  ProductVectorCorrectionEvent,
  ReceivableCase,
  ReceivableCaseEvent,
  ReceivableCaseStatus,
  SavedView,
  SavedViewPurpose,
  VectorKey,
} from '../shared/models.js';
import { STATUS_TARGET_SOURCE, STATUS_TARGETS } from './data/status-targets.js';
import {
  classifyInventoryProduct,
  evaluateInventoryReviewLifecycle,
  inventoryIncidentKind,
  type InventoryAlertReview,
  type InventoryAlertReviewEvent,
  type InventoryDecisionStatus,
  type InventoryExceptionType,
  type InventoryReviewEventType,
  type InventoryReviewStatus,
} from '../shared/inventory-decisions.js';
import { assessPricePerKg, effectiveUnitPrice, type ProductPriceSnapshotPoint, type PricePerKgStatus } from '../shared/product-prices.js';

const databasePath = process.env.SALICE_OPERATIONS_DB_PATH
  ? resolve(process.env.SALICE_OPERATIONS_DB_PATH)
  : resolve(process.cwd(), 'data/operations.sqlite');
let database: DatabaseSync | null = null;

function migrateInventoryReviewStatuses(store: DatabaseSync) {
  const row = store.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory_alert_reviews'").get();
  const definition = String(row?.sql ?? '');
  if (!definition || definition.includes("'unreviewed'")) return;
  try {
    store.exec(`
      BEGIN IMMEDIATE;
      DROP INDEX IF EXISTS idx_inventory_alert_reviews_status;
      ALTER TABLE inventory_alert_reviews RENAME TO inventory_alert_reviews_legacy;
      CREATE TABLE inventory_alert_reviews (
        product_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'unreviewed',
        note TEXT NOT NULL DEFAULT '',
        exception_type TEXT NOT NULL DEFAULT 'none',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        CHECK (status IN ('unreviewed', 'in_review', 'reviewed')),
        CHECK (exception_type IN ('none', 'seasonal', 'discontinued', 'reserved_stock'))
      );
      INSERT INTO inventory_alert_reviews (product_id, status, note, exception_type, updated_at, updated_by)
        SELECT product_id, CASE
          WHEN status = 'reviewed' THEN 'reviewed'
          WHEN status = 'in_review' THEN 'in_review'
          ELSE 'unreviewed'
        END,
          note, exception_type, updated_at, updated_by
        FROM inventory_alert_reviews_legacy;
      DROP TABLE inventory_alert_reviews_legacy;
      CREATE INDEX idx_inventory_alert_reviews_status ON inventory_alert_reviews(status, updated_at DESC);
      COMMIT;
    `);
  } catch (error) {
    try { store.exec('ROLLBACK'); } catch { /* la sentencia fallida puede haber cerrado la transacción */ }
    throw error;
  }
}

function migrateInventoryReviewLifecycle(store: DatabaseSync) {
  const columns = new Set(store.prepare('PRAGMA table_info(inventory_alert_reviews)').all().map((row) => String(row.name)));
  if (!columns.has('decision_status')) store.exec('ALTER TABLE inventory_alert_reviews ADD COLUMN decision_status TEXT');
  if (!columns.has('decision_snapshot_at')) store.exec('ALTER TABLE inventory_alert_reviews ADD COLUMN decision_snapshot_at TEXT');
  if (!columns.has('resolved_at')) store.exec('ALTER TABLE inventory_alert_reviews ADD COLUMN resolved_at TEXT');
  if (!columns.has('resolved_snapshot_at')) store.exec('ALTER TABLE inventory_alert_reviews ADD COLUMN resolved_snapshot_at TEXT');
  if (!columns.has('reopened_at')) store.exec('ALTER TABLE inventory_alert_reviews ADD COLUMN reopened_at TEXT');
  if (!columns.has('incident_number')) store.exec('ALTER TABLE inventory_alert_reviews ADD COLUMN incident_number INTEGER NOT NULL DEFAULT 1');
}

function seedCommercialGoals(store: DatabaseSync) {
  const existing = Number(store.prepare('SELECT COUNT(*) AS total FROM commercial_goal_versions').get()?.total ?? 0);
  if (existing) return;
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
      'Plan histórico inicial',
      STATUS_TARGET_SOURCE.label,
      STATUS_TARGET_SOURCE.coverageFrom,
      STATUS_TARGET_SOURCE.coverageThrough,
      'Importación inicial reconstruida desde la fuente externa del Reporte Status Salice.',
      createdAt,
      'Migración v0.4.0',
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
      randomUUID(), versionId, 'Migración v0.4.0',
      'Importación inicial del plan histórico; los resultados reales permanecen en GESI.',
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
    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      completed_at TEXT NOT NULL,
      snapshot_at TEXT NOT NULL,
      status TEXT NOT NULL,
      clients INTEGER NOT NULL,
      products INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS refresh_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      trigger_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      snapshot_at TEXT,
      quality_status TEXT,
      clients INTEGER,
      products INTEGER,
      warnings INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_runs_started ON refresh_runs(started_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_runs_single_running ON refresh_runs(status) WHERE status = 'running';
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
    CREATE TABLE IF NOT EXISTS inventory_alert_reviews (
      product_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'unreviewed',
      note TEXT NOT NULL DEFAULT '',
      exception_type TEXT NOT NULL DEFAULT 'none',
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      decision_status TEXT,
      decision_snapshot_at TEXT,
      resolved_at TEXT,
      resolved_snapshot_at TEXT,
      reopened_at TEXT,
      incident_number INTEGER NOT NULL DEFAULT 1,
      CHECK (status IN ('unreviewed', 'in_review', 'reviewed')),
      CHECK (exception_type IN ('none', 'seasonal', 'discontinued', 'reserved_stock'))
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_alert_reviews_status ON inventory_alert_reviews(status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS inventory_alert_review_events (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      review_status TEXT NOT NULL,
      decision_status TEXT,
      incident_kind TEXT,
      incident_number INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      exception_type TEXT NOT NULL DEFAULT 'none',
      snapshot_at TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK (event_type IN ('review_saved', 'resolved', 'reopened')),
      CHECK (review_status IN ('unreviewed', 'in_review', 'reviewed')),
      CHECK (exception_type IN ('none', 'seasonal', 'discontinued', 'reserved_stock'))
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_alert_review_events_product ON inventory_alert_review_events(product_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS product_vector_corrections (
      product_id TEXT NOT NULL,
      vector_key TEXT NOT NULL,
      value REAL NOT NULL,
      reason TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      PRIMARY KEY (product_id, vector_key),
      CHECK (value >= 0 AND value <= 100)
    );
    CREATE TABLE IF NOT EXISTS product_vector_correction_events (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      vector_key TEXT NOT NULL,
      value REAL NOT NULL,
      reason TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      event_type TEXT NOT NULL,
      CHECK (value >= 0 AND value <= 100),
      CHECK (event_type IN ('set', 'removed'))
    );
    CREATE INDEX IF NOT EXISTS idx_product_vector_corrections_product ON product_vector_corrections(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_vector_correction_events_product ON product_vector_correction_events(product_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS product_price_snapshots (
      snapshot_at TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      reference_price REAL,
      effective_price_90d REAL,
      effective_units_90d REAL NOT NULL,
      effective_sales_90d REAL NOT NULL,
      content_kg REAL,
      reference_price_per_kg REAL,
      price_per_kg_status TEXT NOT NULL,
      source_label TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (snapshot_at, product_id),
      CHECK (price_per_kg_status IN ('reliable', 'ambiguous_presentation', 'not_applicable', 'no_reference'))
    );
    CREATE INDEX IF NOT EXISTS idx_product_price_snapshots_product ON product_price_snapshots(product_id, snapshot_at);
    CREATE TABLE IF NOT EXISTS saved_views (
      id TEXT PRIMARY KEY,
      view_key TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'general',
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_views_key ON saved_views(view_key, favorite DESC, updated_at DESC);
    CREATE TABLE IF NOT EXISTS commercial_opportunity_links (
      id TEXT PRIMARY KEY,
      saved_view_id TEXT,
      client_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      recommendation_kinds_json TEXT NOT NULL,
      activity_id TEXT,
      snapshot_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(saved_view_id) REFERENCES saved_views(id) ON DELETE CASCADE,
      FOREIGN KEY(activity_id) REFERENCES commercial_activities(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_link_list_product
      ON commercial_opportunity_links(saved_view_id, client_id, product_id)
      WHERE saved_view_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_opportunity_links_client ON commercial_opportunity_links(client_id, created_at DESC);
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
      BEGIN SELECT RAISE(ABORT, 'El historial de cobranzas es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_goal_change_update
      BEFORE UPDATE ON commercial_goal_changes
      BEGIN SELECT RAISE(ABORT, 'El historial de objetivos es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_goal_change_delete
      BEFORE DELETE ON commercial_goal_changes
      BEGIN SELECT RAISE(ABORT, 'El historial de objetivos es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_vector_correction_event_update
      BEFORE UPDATE ON product_vector_correction_events
      BEGIN SELECT RAISE(ABORT, 'El historial de correcciones vectoriales es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_vector_correction_event_delete
      BEFORE DELETE ON product_vector_correction_events
      BEGIN SELECT RAISE(ABORT, 'El historial de correcciones vectoriales es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_product_price_snapshot_update
      BEFORE UPDATE ON product_price_snapshots
      BEGIN SELECT RAISE(ABORT, 'El historial de precios por snapshot es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_product_price_snapshot_delete
      BEFORE DELETE ON product_price_snapshots
      BEGIN SELECT RAISE(ABORT, 'El historial de precios por snapshot es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_inventory_review_event_update
      BEFORE UPDATE ON inventory_alert_review_events
      BEGIN SELECT RAISE(ABORT, 'El historial de revisiones de inventario es append-only'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_inventory_review_event_delete
      BEFORE DELETE ON inventory_alert_review_events
      BEGIN SELECT RAISE(ABORT, 'El historial de revisiones de inventario es append-only'); END;
  `);
  migrateInventoryReviewStatuses(database);
  migrateInventoryReviewLifecycle(database);
  const savedViewColumns = new Set(database.prepare('PRAGMA table_info(saved_views)').all().map((row) => String(row.name)));
  if (!savedViewColumns.has('purpose')) {
    database.exec("ALTER TABLE saved_views ADD COLUMN purpose TEXT NOT NULL DEFAULT 'general'");
    database.exec("UPDATE saved_views SET purpose = 'client_recovery' WHERE view_key = 'non-buyers'");
    database.exec("UPDATE saved_views SET purpose = 'collections' WHERE view_key = 'receivables'");
  }
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
      BEGIN SELECT RAISE(ABORT, 'El contenido del historial de cobranzas es inmutable'); END;
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

function inventoryAlertReviewFromRow(row: Record<string, unknown>): InventoryAlertReview {
  return {
    productId: textValue(row.product_id),
    status: textValue(row.status) as InventoryReviewStatus,
    note: textValue(row.note),
    exceptionType: textValue(row.exception_type) as InventoryExceptionType,
    updatedAt: textValue(row.updated_at),
    updatedBy: textValue(row.updated_by),
    decisionStatus: nullableText(row.decision_status) as InventoryDecisionStatus | null,
    decisionSnapshotAt: nullableText(row.decision_snapshot_at),
    resolvedAt: nullableText(row.resolved_at),
    resolvedSnapshotAt: nullableText(row.resolved_snapshot_at),
    reopenedAt: nullableText(row.reopened_at),
    incidentNumber: Math.max(1, Number(row.incident_number ?? 1)),
  };
}

function inventoryAlertReviewEventFromRow(row: Record<string, unknown>): InventoryAlertReviewEvent {
  return {
    id: textValue(row.id),
    productId: textValue(row.product_id),
    eventType: textValue(row.event_type) as InventoryReviewEventType,
    reviewStatus: textValue(row.review_status) as InventoryReviewStatus,
    decisionStatus: nullableText(row.decision_status) as InventoryDecisionStatus | null,
    incidentKind: nullableText(row.incident_kind) as InventoryAlertReviewEvent['incidentKind'],
    incidentNumber: Math.max(1, Number(row.incident_number ?? 1)),
    note: textValue(row.note),
    exceptionType: textValue(row.exception_type) as InventoryExceptionType,
    snapshotAt: nullableText(row.snapshot_at),
    actor: textValue(row.actor),
    createdAt: textValue(row.created_at),
  };
}

function savedViewFromRow(row: Record<string, unknown>): SavedView {
  return {
    id: textValue(row.id),
    viewKey: textValue(row.view_key) as SavedView['viewKey'],
    purpose: (textValue(row.purpose) || 'general') as SavedViewPurpose,
    name: textValue(row.name),
    filters: jsonRecord(row.filters_json) as Record<string, string> ?? {},
    favorite: Boolean(row.favorite),
    createdAt: textValue(row.created_at),
    updatedAt: textValue(row.updated_at),
  };
}

function commercialOpportunityLinkFromRow(row: Record<string, unknown>): CommercialOpportunityLink {
  return {
    id: textValue(row.id),
    savedViewId: nullableText(row.saved_view_id),
    clientId: Number(row.client_id),
    productId: textValue(row.product_id),
    recommendationKinds: parseProductIds(row.recommendation_kinds_json) as CommercialOpportunityLink['recommendationKinds'],
    activityId: nullableText(row.activity_id),
    snapshotAt: textValue(row.snapshot_at),
    createdAt: textValue(row.created_at),
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
  const corrections = listProductVectorCorrections();
  const correctionsByProduct = new Map<string, ProductVectorCorrection[]>();
  corrections.forEach((correction) => correctionsByProduct.set(correction.productId, [...(correctionsByProduct.get(correction.productId) ?? []), correction]));
  return {
    ...snapshot,
    clients: snapshot.clients.map((client) => notes.has(client.id) ? { ...client, note: notes.get(client.id)! } : client),
    products: snapshot.products.map((product) => {
      const productCorrections = correctionsByProduct.get(product.id);
      if (!productCorrections?.length) return product;
      const vector = { ...product.vector };
      const evidence = { ...product.vectorMeta.evidence };
      productCorrections.forEach((correction) => {
        vector[correction.key] = correction.value;
        evidence[correction.key] = [`Corrección de oficina: ${correction.reason}`, ...(evidence[correction.key] ?? [])].slice(0, 4);
      });
      return { ...product, vector, vectorMeta: { ...product.vectorMeta, evidence } };
    }),
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

export function createCommercialNote(input: {
  clientId: number;
  seller: string;
  type: CommercialActivityType;
  occurredAt: string;
  note: string;
  productIds?: string[];
}) {
  return createCommercialActivity({
    clientId: input.clientId,
    seller: input.seller,
    type: input.type,
    outcome: 'noted',
    occurredAt: input.occurredAt,
    note: input.note,
    amount: null,
    productIds: input.productIds ?? [],
    nextActionAt: null,
    agendaItemId: null,
    promise: null,
  });
}

export function deleteCommercialOpportunityNote(activityId: string, clientId: number) {
  const store = db();
  const row = store.prepare('SELECT * FROM commercial_activities WHERE id = ? AND client_id = ?').get(activityId, clientId);
  if (!row) return null;
  const activity = activityFromRow(row);
  if (!activity.productIds.length) return null;
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`
      DELETE FROM commercial_opportunity_links
      WHERE activity_id = ? AND saved_view_id IS NULL
    `).run(activityId);
    store.prepare(`
      UPDATE commercial_opportunity_links SET activity_id = NULL
      WHERE activity_id = ? AND saved_view_id IS NOT NULL
    `).run(activityId);
    store.prepare('DELETE FROM commercial_activities WHERE id = ? AND client_id = ?').run(activityId, clientId);
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return activity;
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

export function listInventoryAlertReviews() {
  return db().prepare('SELECT * FROM inventory_alert_reviews ORDER BY updated_at DESC').all()
    .map((row) => inventoryAlertReviewFromRow(row));
}

export function listInventoryAlertReviewEvents(productId?: string) {
  const rows = productId
    ? db().prepare('SELECT * FROM inventory_alert_review_events WHERE product_id = ? ORDER BY created_at DESC, rowid DESC').all(productId)
    : db().prepare('SELECT * FROM inventory_alert_review_events ORDER BY created_at DESC, rowid DESC').all();
  return rows.map((row) => inventoryAlertReviewEventFromRow(row));
}

function appendInventoryReviewEvent(input: {
  productId: string;
  eventType: InventoryReviewEventType;
  reviewStatus: InventoryReviewStatus;
  decisionStatus: InventoryDecisionStatus | null;
  incidentNumber: number;
  note: string;
  exceptionType: InventoryExceptionType;
  snapshotAt: string | null;
  actor: string;
  createdAt: string;
}) {
  db().prepare(`
    INSERT INTO inventory_alert_review_events (
      id, product_id, event_type, review_status, decision_status, incident_kind,
      incident_number, note, exception_type, snapshot_at, actor, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), input.productId, input.eventType, input.reviewStatus, input.decisionStatus,
    inventoryIncidentKind(input.decisionStatus), input.incidentNumber, input.note, input.exceptionType,
    input.snapshotAt, input.actor, input.createdAt,
  );
}

export function saveInventoryAlertReview(productId: string, input: {
  status: InventoryReviewStatus;
  note: string;
  exceptionType: InventoryExceptionType;
  actor: string;
  decisionStatus: InventoryDecisionStatus;
  snapshotAt: string;
}) {
  const updatedAt = new Date().toISOString();
  const note = input.note.trim().slice(0, 2000);
  const actor = input.actor.trim().slice(0, 120);
  const previous = db().prepare('SELECT * FROM inventory_alert_reviews WHERE product_id = ?').get(productId);
  const incidentNumber = Math.max(1, Number(previous?.incident_number ?? 1));
  const reopenedAt = nullableText(previous?.reopened_at);
  db().exec('BEGIN IMMEDIATE');
  try {
    db().prepare(`
      INSERT INTO inventory_alert_reviews (
        product_id, status, note, exception_type, updated_at, updated_by,
        decision_status, decision_snapshot_at, resolved_at, resolved_snapshot_at, reopened_at, incident_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET
        status = excluded.status,
        note = excluded.note,
        exception_type = excluded.exception_type,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by,
        decision_status = excluded.decision_status,
        decision_snapshot_at = excluded.decision_snapshot_at,
        resolved_at = NULL,
        resolved_snapshot_at = NULL,
        reopened_at = excluded.reopened_at,
        incident_number = excluded.incident_number
    `).run(
      productId, input.status, note, input.exceptionType, updatedAt, actor,
      input.decisionStatus, input.snapshotAt, reopenedAt, incidentNumber,
    );
    appendInventoryReviewEvent({
      productId, eventType: 'review_saved', reviewStatus: input.status, decisionStatus: input.decisionStatus,
      incidentNumber, note, exceptionType: input.exceptionType, snapshotAt: input.snapshotAt, actor, createdAt: updatedAt,
    });
    db().exec('COMMIT');
  } catch (error) {
    db().exec('ROLLBACK');
    throw error;
  }
  return inventoryAlertReviewFromRow(db().prepare('SELECT * FROM inventory_alert_reviews WHERE product_id = ?').get(productId)!);
}

export function reconcileInventoryAlertReviews(products: Product[], snapshotAt: string) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const reviews = listInventoryAlertReviews();
  const now = new Date().toISOString();
  const result = { baselined: 0, resolved: 0, reopened: 0 };
  db().exec('BEGIN IMMEDIATE');
  try {
    for (const review of reviews) {
      const product = productsById.get(review.productId);
      if (!product) continue;
      const currentDecision = classifyInventoryProduct(product, null).status;
      const action = evaluateInventoryReviewLifecycle(review, currentDecision);
      if (action === 'none') continue;
      if (action === 'baseline') {
        db().prepare(`UPDATE inventory_alert_reviews SET decision_status = ?, decision_snapshot_at = ? WHERE product_id = ?`)
          .run(currentDecision, snapshotAt, review.productId);
        result.baselined += 1;
        continue;
      }
      if (action === 'resolved') {
        db().prepare(`UPDATE inventory_alert_reviews SET resolved_at = ?, resolved_snapshot_at = ? WHERE product_id = ?`)
          .run(now, snapshotAt, review.productId);
        appendInventoryReviewEvent({
          productId: review.productId, eventType: 'resolved', reviewStatus: 'reviewed', decisionStatus: currentDecision,
          incidentNumber: review.incidentNumber, note: review.note, exceptionType: review.exceptionType,
          snapshotAt, actor: 'Sistema Salice', createdAt: now,
        });
        result.resolved += 1;
        continue;
      }
      const incidentNumber = review.incidentNumber + 1;
      db().prepare(`
        UPDATE inventory_alert_reviews SET
          status = 'unreviewed', decision_status = ?, decision_snapshot_at = ?,
          resolved_at = NULL, resolved_snapshot_at = NULL, reopened_at = ?, incident_number = ?,
          updated_at = ?, updated_by = 'Sistema Salice'
        WHERE product_id = ?
      `).run(currentDecision, snapshotAt, now, incidentNumber, now, review.productId);
      appendInventoryReviewEvent({
        productId: review.productId, eventType: 'reopened', reviewStatus: 'unreviewed', decisionStatus: currentDecision,
        incidentNumber, note: review.note, exceptionType: review.exceptionType,
        snapshotAt, actor: 'Sistema Salice', createdAt: now,
      });
      result.reopened += 1;
    }
    db().exec('COMMIT');
  } catch (error) {
    db().exec('ROLLBACK');
    throw error;
  }
  return result;
}

function productVectorCorrectionFromRow(row: Record<string, unknown>): ProductVectorCorrection {
  return {
    productId: textValue(row.product_id),
    key: textValue(row.vector_key) as VectorKey,
    value: Number(row.value),
    reason: textValue(row.reason),
    updatedAt: textValue(row.updated_at),
    updatedBy: textValue(row.updated_by),
  };
}

function productVectorCorrectionEventFromRow(row: Record<string, unknown>): ProductVectorCorrectionEvent {
  return {
    id: textValue(row.id),
    ...productVectorCorrectionFromRow(row),
    eventType: textValue(row.event_type) as ProductVectorCorrectionEvent['eventType'],
  };
}

export function listProductVectorCorrections(productId?: string) {
  const rows = productId
    ? db().prepare('SELECT * FROM product_vector_corrections WHERE product_id = ? ORDER BY vector_key').all(productId)
    : db().prepare('SELECT * FROM product_vector_corrections ORDER BY product_id, vector_key').all();
  return rows.map((row) => productVectorCorrectionFromRow(row));
}

export function listProductVectorCorrectionEvents(productId: string) {
  return db().prepare('SELECT * FROM product_vector_correction_events WHERE product_id = ? ORDER BY updated_at DESC, rowid DESC').all(productId)
    .map((row) => productVectorCorrectionEventFromRow(row));
}

export function saveProductVectorCorrection(productId: string, input: {
  key: VectorKey;
  value: number;
  reason: string;
  actor: string;
}) {
  const store = db();
  const updatedAt = new Date().toISOString();
  const reason = input.reason.trim().slice(0, 1000);
  const actor = input.actor.trim().slice(0, 120);
  const eventId = randomUUID();
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare(`
      INSERT INTO product_vector_corrections (product_id, vector_key, value, reason, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_id, vector_key) DO UPDATE SET
        value = excluded.value, reason = excluded.reason,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `).run(productId, input.key, input.value, reason, updatedAt, actor);
    store.prepare(`
      INSERT INTO product_vector_correction_events
        (id, product_id, vector_key, value, reason, updated_at, updated_by, event_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'set')
    `).run(eventId, productId, input.key, input.value, reason, updatedAt, actor);
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return productVectorCorrectionFromRow(store.prepare('SELECT * FROM product_vector_corrections WHERE product_id = ? AND vector_key = ?').get(productId, input.key)!);
}

export function removeProductVectorCorrection(productId: string, key: VectorKey, reason: string, actor: string) {
  const store = db();
  const current = store.prepare('SELECT * FROM product_vector_corrections WHERE product_id = ? AND vector_key = ?').get(productId, key);
  if (!current) return null;
  const updatedAt = new Date().toISOString();
  const eventId = randomUUID();
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare('DELETE FROM product_vector_corrections WHERE product_id = ? AND vector_key = ?').run(productId, key);
    store.prepare(`
      INSERT INTO product_vector_correction_events
        (id, product_id, vector_key, value, reason, updated_at, updated_by, event_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'removed')
    `).run(eventId, productId, key, Number(current.value), reason.trim().slice(0, 1000), updatedAt, actor.trim().slice(0, 120));
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return productVectorCorrectionEventFromRow(store.prepare('SELECT * FROM product_vector_correction_events WHERE id = ?').get(eventId)!);
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
  const cleanSeller = seller.trim().slice(0, 120) || workflow.responsible || 'Sin vendedor';
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
  `).run(id, clientId, cleanSeller, workflow.promiseDueAt, workflow.promiseAmount, 'Promesa registrada desde Cuentas por cobrar.', now);
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
  const actor = input.actor.trim().slice(0, 120) || 'Oficina Salice';
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

export function addReceivableComment(clientId: number, comment: string, actor = 'Oficina Salice') {
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
      clientId, eventType: 'comment', actor: actor.trim().slice(0, 120) || 'Oficina Salice',
      comment: cleanComment, before: null, after: null, createdAt,
    });
    store.prepare('UPDATE receivable_cases SET updated_at = ?, updated_by = ? WHERE client_id = ?')
      .run(createdAt, actor.trim().slice(0, 120) || 'Oficina Salice', clientId);
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
    // Estas filas son una proyección de los seguimientos, no un segundo origen.
    // Se recrean desde los casos válidos al iniciar el servidor.
    store.prepare("DELETE FROM payment_promises WHERE id LIKE 'receivable-case:%'").run();
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
}

export function deleteReceivableCaseEvent(clientId: number, eventId: string, actor = 'Oficina Salice') {
  const store = db();
  const current = store.prepare('SELECT * FROM receivable_case_events WHERE id = ? AND client_id = ?').get(eventId, clientId);
  if (!current || current.deleted_at) return false;
  const deletedAt = new Date().toISOString();
  const deletedBy = actor.trim().slice(0, 120) || 'Oficina Salice';
  store.exec('BEGIN IMMEDIATE');
  try {
    // Las versiones anteriores guardaban una misma acción humana como varios
    // eventos con el mismo timestamp. Se eliminan juntos para no dejar activo
    // un estado o una promesa huérfanos.
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

export function listSavedViews(viewKey?: SavedView['viewKey'], purpose?: SavedViewPurpose) {
  const rows = viewKey && purpose
    ? db().prepare('SELECT * FROM saved_views WHERE view_key = ? AND purpose = ? ORDER BY favorite DESC, updated_at DESC').all(viewKey, purpose)
    : viewKey
    ? db().prepare('SELECT * FROM saved_views WHERE view_key = ? ORDER BY favorite DESC, updated_at DESC').all(viewKey)
    : purpose
    ? db().prepare('SELECT * FROM saved_views WHERE purpose = ? ORDER BY view_key, favorite DESC, updated_at DESC').all(purpose)
    : db().prepare('SELECT * FROM saved_views ORDER BY view_key, favorite DESC, updated_at DESC').all();
  return rows.map((row) => savedViewFromRow(row));
}

export function createSavedView(input: {
  viewKey: SavedView['viewKey'];
  name: string;
  filters: Record<string, string>;
  favorite?: boolean;
  purpose?: SavedViewPurpose;
}) {
  const now = new Date().toISOString();
  const view: SavedView = {
    id: randomUUID(),
    viewKey: input.viewKey,
    purpose: input.purpose ?? 'general',
    name: input.name.trim().slice(0, 80),
    filters: input.filters,
    favorite: Boolean(input.favorite),
    createdAt: now,
    updatedAt: now,
  };
  db().prepare(`
    INSERT INTO saved_views (id, view_key, purpose, name, filters_json, favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(view.id, view.viewKey, view.purpose, view.name, JSON.stringify(view.filters), Number(view.favorite), view.createdAt, view.updatedAt);
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

export function getSavedView(id: string) {
  const row = db().prepare('SELECT * FROM saved_views WHERE id = ?').get(id);
  return row ? savedViewFromRow(row) : null;
}

export function listCommercialOpportunityLinks(filters: { clientId?: number; productId?: string; savedViewId?: string } = {}) {
  return db().prepare('SELECT * FROM commercial_opportunity_links ORDER BY created_at DESC').all()
    .map((row) => commercialOpportunityLinkFromRow(row))
    .filter((link) => (
      (filters.clientId == null || link.clientId === filters.clientId)
      && (!filters.productId || link.productId === filters.productId)
      && (!filters.savedViewId || link.savedViewId === filters.savedViewId)
    ));
}

export function createCommercialOpportunityLink(input: {
  savedViewId?: string | null;
  clientId: number;
  productId: string;
  recommendationKinds: CommercialOpportunityLink['recommendationKinds'];
  activityId?: string | null;
  snapshotAt: string;
}) {
  const link: CommercialOpportunityLink = {
    id: randomUUID(),
    savedViewId: input.savedViewId ?? null,
    clientId: input.clientId,
    productId: input.productId,
    recommendationKinds: input.recommendationKinds,
    activityId: input.activityId ?? null,
    snapshotAt: input.snapshotAt,
    createdAt: new Date().toISOString(),
  };
  db().prepare(`
    INSERT INTO commercial_opportunity_links (
      id, saved_view_id, client_id, product_id, recommendation_kinds_json, activity_id, snapshot_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    link.id, link.savedViewId, link.clientId, link.productId, JSON.stringify(link.recommendationKinds),
    link.activityId, link.snapshotAt, link.createdAt,
  );
  return link;
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
  if (!version) throw new Error('No existe un plan comercial activo.');
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
  if (!selectedVersion) throw new Error('No existe un plan comercial disponible.');
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
  if (!source) throw new Error('No existe un plan base para clonar.');
  const versionNumber = Number(store.prepare('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM commercial_goal_versions').get()?.next ?? 1);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const actor = input.actor?.trim().slice(0, 120) || 'Oficina Salice';
  const name = input.name.trim().slice(0, 120) || `Plan comercial v${versionNumber}`;
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
      id, versionNumber, name, `Clonado de ${source.name} · v${source.version}`,
      source.coverageFrom, source.coverageThrough, String(input.notes ?? '').trim().slice(0, 1000), createdAt, actor,
    );
    for (const row of sourceRows) {
      insertGoal.run(randomUUID(), id, row.month, row.product, row.seller, row.kilos, row.accounts, row.invoicing);
    }
    addGoalChange(store, {
      versionId: id, eventType: 'created', actor,
      comment: `Versión creada desde ${source.name} · v${source.version}.`,
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
  if (!version) throw new Error('La versión de objetivos no existe.');
  if (version.status !== 'draft') throw new Error('Sólo se pueden modificar versiones en borrador. Creá una nueva versión para conservar la trazabilidad.');
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
  const actor = input.actor?.trim().slice(0, 120) || 'Oficina Salice';
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
      actor: input.actor?.trim().slice(0, 120) || 'Oficina Salice',
      comment: String(input.comment ?? 'Objetivo agregado').trim().slice(0, 1000), before: null, after: { ...row },
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return row;
}

export function deleteCommercialGoalRow(versionId: string, rowId: string, actor = 'Oficina Salice') {
  requireDraftGoalVersion(versionId);
  const store = db();
  const currentRow = store.prepare('SELECT * FROM commercial_goals WHERE id = ? AND version_id = ?').get(rowId, versionId);
  if (!currentRow) return false;
  const before = commercialGoalFromRow(currentRow);
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare('DELETE FROM commercial_goals WHERE id = ? AND version_id = ?').run(rowId, versionId);
    addGoalChange(store, {
      versionId, eventType: 'row_deleted', entityKey: rowId, actor: actor.trim().slice(0, 120) || 'Oficina Salice',
      comment: 'Objetivo eliminado del borrador.', before: { ...before }, after: null,
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export function activateCommercialGoalVersion(versionId: string, actor = 'Oficina Salice', comment = '') {
  const version = requireDraftGoalVersion(versionId);
  const store = db();
  const coverage = store.prepare('SELECT MIN(month) AS first, MAX(month) AS last, COUNT(*) AS total FROM commercial_goals WHERE version_id = ?').get(versionId) as { first?: string; last?: string; total?: number };
  if (!coverage.total || !coverage.first || !coverage.last) throw new Error('El borrador no contiene objetivos y no puede activarse.');
  const activatedAt = new Date().toISOString();
  const cleanActor = actor.trim().slice(0, 120) || 'Oficina Salice';
  store.exec('BEGIN IMMEDIATE');
  try {
    store.prepare("UPDATE commercial_goal_versions SET status = 'archived' WHERE status = 'active'").run();
    store.prepare(`
      UPDATE commercial_goal_versions SET status = 'active', coverage_from = ?, coverage_through = ?, activated_at = ? WHERE id = ?
    `).run(coverage.first, coverage.last, activatedAt, versionId);
    addGoalChange(store, {
      versionId, eventType: 'activated', actor: cleanActor,
      comment: comment.trim().slice(0, 1000) || `Plan ${version.name} activado para Reporte General.`,
      after: { coverageFrom: coverage.first, coverageThrough: coverage.last, rows: Number(coverage.total) }, createdAt: activatedAt,
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return getCommercialGoalVersion(versionId)!;
}

export function recordSuccessfulSync(snapshot: DashboardData) {
  recordProductPriceSnapshot(snapshot, 'Actualización manual aprobada');
  db().prepare(`
    INSERT INTO sync_runs (completed_at, snapshot_at, status, clients, products)
    VALUES (?, ?, 'success', ?, ?)
  `).run(new Date().toISOString(), snapshot.meta.generatedAt, snapshot.clients.length, snapshot.products.length);
}

function productPriceSnapshotFromRow(row: Record<string, unknown>): ProductPriceSnapshotPoint {
  return {
    snapshotAt: textValue(row.snapshot_at),
    productId: textValue(row.product_id),
    productName: textValue(row.product_name),
    referencePrice: row.reference_price == null ? null : Number(row.reference_price),
    effectivePrice90d: row.effective_price_90d == null ? null : Number(row.effective_price_90d),
    effectiveUnits90d: Number(row.effective_units_90d ?? 0),
    effectiveSales90d: Number(row.effective_sales_90d ?? 0),
    contentKg: row.content_kg == null ? null : Number(row.content_kg),
    referencePricePerKg: row.reference_price_per_kg == null ? null : Number(row.reference_price_per_kg),
    pricePerKgStatus: textValue(row.price_per_kg_status) as PricePerKgStatus,
    sourceLabel: textValue(row.source_label),
  };
}

export function recordProductPriceSnapshot(snapshot: DashboardData, sourceLabel = 'Snapshot GESI preservado') {
  if (snapshot.meta.source !== 'gesi' || !snapshot.meta.generatedAt) return { inserted: 0, products: 0 };
  const store = db();
  const insert = store.prepare(`
    INSERT OR IGNORE INTO product_price_snapshots (
      snapshot_at, product_id, product_name, reference_price, effective_price_90d,
      effective_units_90d, effective_sales_90d, content_kg, reference_price_per_kg,
      price_per_kg_status, source_label, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const recordedAt = new Date().toISOString();
  let inserted = 0;
  store.exec('BEGIN IMMEDIATE');
  try {
    for (const product of snapshot.products) {
      const pricePerKg = assessPricePerKg(product);
      const result = insert.run(
        snapshot.meta.generatedAt,
        product.id,
        product.name,
        product.price > 0 ? product.price : null,
        effectiveUnitPrice(product.sales90d, product.units90d),
        Math.max(0, product.units90d || 0),
        Math.max(0, product.sales90d || 0),
        product.contentKg && product.contentKg > 0 ? product.contentKg : null,
        product.referencePricePerKg && product.referencePricePerKg > 0 ? product.referencePricePerKg : null,
        pricePerKg.status,
        sourceLabel.slice(0, 160),
        recordedAt,
      );
      inserted += Number(result.changes ?? 0);
    }
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return { inserted, products: snapshot.products.length };
}

export function listProductPriceSnapshots(productId?: string): ProductPriceSnapshotPoint[] {
  const rows = productId
    ? db().prepare('SELECT * FROM product_price_snapshots WHERE product_id = ? ORDER BY snapshot_at').all(productId)
    : db().prepare('SELECT * FROM product_price_snapshots ORDER BY snapshot_at, product_id').all();
  return rows.map((row) => productPriceSnapshotFromRow(row));
}

export function productPriceHistoryStats() {
  const store = db();
  const row = store.prepare(`SELECT COUNT(*) observations, COUNT(DISTINCT snapshot_at) snapshots,
    COUNT(DISTINCT product_id) products, MIN(snapshot_at) first_snapshot, MAX(snapshot_at) last_snapshot
    FROM product_price_snapshots`).get();
  return {
    observations: Number(row?.observations ?? 0),
    snapshots: Number(row?.snapshots ?? 0),
    products: Number(row?.products ?? 0),
    firstSnapshotAt: nullableText(row?.first_snapshot),
    lastSnapshotAt: nullableText(row?.last_snapshot),
  };
}

export type RefreshRunStatus = 'running' | 'success' | 'failed';

export interface RefreshRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  trigger: string;
  status: RefreshRunStatus;
  stage: string;
  snapshotAt: string | null;
  qualityStatus: string | null;
  clients: number | null;
  products: number | null;
  warnings: number;
  durationMs: number | null;
  error: string | null;
}

function refreshRunFromRow(row: Record<string, unknown>): RefreshRun {
  return {
    id: textValue(row.id),
    startedAt: textValue(row.started_at),
    completedAt: nullableText(row.completed_at),
    trigger: textValue(row.trigger_kind),
    status: textValue(row.status) as RefreshRunStatus,
    stage: textValue(row.stage),
    snapshotAt: nullableText(row.snapshot_at),
    qualityStatus: nullableText(row.quality_status),
    clients: row.clients == null ? null : Number(row.clients),
    products: row.products == null ? null : Number(row.products),
    warnings: Number(row.warnings ?? 0),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    error: nullableText(row.error),
  };
}

export function beginRefreshRun(trigger = 'manual') {
  const store = db();
  const existing = store.prepare("SELECT id, started_at, stage FROM refresh_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").get();
  if (existing) {
    const ageMs = Date.now() - new Date(String(existing.started_at)).getTime();
    if (Number.isFinite(ageMs) && ageMs < 12 * 60 * 60 * 1000) {
      throw new Error(`Ya existe una actualización en curso desde ${existing.started_at} (etapa ${existing.stage}).`);
    }
    store.prepare("UPDATE refresh_runs SET status = 'failed', completed_at = ?, quality_status = 'failed', error = ? WHERE id = ?")
      .run(new Date().toISOString(), 'Ejecución interrumpida sin cierre; se liberó al iniciar un nuevo proceso.', existing.id);
  }
  const run: RefreshRun = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    trigger,
    status: 'running',
    stage: 'preflight',
    snapshotAt: null,
    qualityStatus: null,
    clients: null,
    products: null,
    warnings: 0,
    durationMs: null,
    error: null,
  };
  store.prepare(`INSERT INTO refresh_runs (
    id, started_at, completed_at, trigger_kind, status, stage, snapshot_at,
    quality_status, clients, products, warnings, duration_ms, error
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    run.id, run.startedAt, run.completedAt, run.trigger, run.status, run.stage,
    run.snapshotAt, run.qualityStatus, run.clients, run.products, run.warnings,
    run.durationMs, run.error,
  );
  return run;
}

export function recoverInterruptedRefreshRuns(
  reason = 'Ejecución interrumpida por un reinicio del servidor; se habilitó la recuperación automática.',
) {
  const store = db();
  const rows = store.prepare(
    "SELECT id, started_at FROM refresh_runs WHERE status = 'running' ORDER BY started_at DESC",
  ).all() as Array<{ id: string; started_at: string }>;
  if (!rows.length) return 0;
  const completedAt = new Date().toISOString();
  const update = store.prepare(`UPDATE refresh_runs SET
    completed_at = ?, status = 'failed', quality_status = 'failed', duration_ms = ?, error = ?
    WHERE id = ? AND status = 'running'`);
  store.exec('BEGIN IMMEDIATE');
  try {
    rows.forEach((row) => {
      const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(row.started_at).getTime());
      update.run(completedAt, Number.isFinite(durationMs) ? durationMs : 0, reason.slice(0, 2_000), row.id);
    });
    store.exec('COMMIT');
  } catch (error) {
    store.exec('ROLLBACK');
    throw error;
  }
  return rows.length;
}

export function updateRefreshRunStage(id: string, stage: string) {
  db().prepare("UPDATE refresh_runs SET stage = ? WHERE id = ? AND status = 'running'").run(stage.slice(0, 120), id);
}

export function completeRefreshRun(id: string, snapshot: DashboardData, warnings = 0, qualityStatus = warnings ? 'passed_with_warnings' : 'passed') {
  const completedAt = new Date().toISOString();
  const current = db().prepare('SELECT started_at FROM refresh_runs WHERE id = ?').get(id);
  const startedAt = current ? String(current.started_at) : completedAt;
  const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
  db().prepare(`UPDATE refresh_runs SET
    completed_at = ?, status = 'success', stage = 'complete', snapshot_at = ?,
    quality_status = ?, clients = ?, products = ?, warnings = ?, duration_ms = ?, error = NULL
    WHERE id = ?`).run(
    completedAt, snapshot.meta.generatedAt, qualityStatus, snapshot.clients.length, snapshot.products.length,
    warnings, durationMs, id,
  );
}

export function failRefreshRun(id: string, stage: string, error: unknown) {
  const completedAt = new Date().toISOString();
  const current = db().prepare('SELECT started_at FROM refresh_runs WHERE id = ?').get(id);
  const startedAt = current ? String(current.started_at) : completedAt;
  const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  db().prepare(`UPDATE refresh_runs SET
    completed_at = ?, status = 'failed', stage = ?, quality_status = 'failed', duration_ms = ?, error = ?
    WHERE id = ?`).run(completedAt, stage.slice(0, 120), durationMs, message, id);
}

export function listRefreshRuns(limit = 10): RefreshRun[] {
  return db().prepare('SELECT * FROM refresh_runs ORDER BY started_at DESC LIMIT ?').all(Math.max(1, Math.min(100, limit)))
    .map((row) => refreshRunFromRow(row));
}

export function operationalStatus() {
  const store = db();
  const noteCount = Number((store.prepare('SELECT COUNT(*) AS total FROM client_notes').get()?.total) ?? 0);
  const activityCount = Number((store.prepare('SELECT COUNT(*) AS total FROM commercial_activities').get()?.total) ?? 0);
  const promiseCount = Number((store.prepare("SELECT COUNT(*) AS total FROM payment_promises WHERE status = 'pending'").get()?.total) ?? 0);
  const agendaCount = Number((store.prepare("SELECT COUNT(*) AS total FROM agenda_items WHERE status = 'pending'").get()?.total) ?? 0);
  const receivableCaseCount = Number((store.prepare('SELECT COUNT(*) AS total FROM receivable_cases').get()?.total) ?? 0);
  const savedViewCount = Number((store.prepare('SELECT COUNT(*) AS total FROM saved_views').get()?.total) ?? 0);
  const inventoryReviewCount = Number((store.prepare("SELECT COUNT(*) AS total FROM inventory_alert_reviews WHERE status = 'reviewed'").get()?.total) ?? 0);
  const priceHistory = productPriceHistoryStats();
  const goalVersionCount = Number((store.prepare('SELECT COUNT(*) AS total FROM commercial_goal_versions').get()?.total) ?? 0);
  const lastSync = store.prepare('SELECT completed_at, snapshot_at, status FROM sync_runs ORDER BY id DESC LIMIT 1').get();
  const refreshRuns = listRefreshRuns(6);
  const lastSuccessRow = store.prepare("SELECT * FROM refresh_runs WHERE status = 'success' ORDER BY started_at DESC LIMIT 1").get();
  const currentRow = store.prepare("SELECT * FROM refresh_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").get();
  return {
    storage: 'SQLite local',
    notes: noteCount,
    activities: activityCount,
    pendingPromises: promiseCount,
    pendingAgendaItems: agendaCount,
    receivableCases: receivableCaseCount,
    savedViews: savedViewCount,
    inventoryReviews: inventoryReviewCount,
    priceHistory,
    goalVersions: goalVersionCount,
    lastSync: lastSync ? {
      completedAt: String(lastSync.completed_at),
      snapshotAt: String(lastSync.snapshot_at),
      status: String(lastSync.status),
    } : null,
    refresh: {
      current: currentRow ? refreshRunFromRow(currentRow) : null,
      lastAttempt: refreshRuns[0] ?? null,
      lastSuccess: lastSuccessRow ? refreshRunFromRow(lastSuccessRow) : null,
      recent: refreshRuns,
    },
  };
}

export function getOperationalDatabasePath() {
  return databasePath;
}
