import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AiArtifactStatus,
  AiAttemptStatus,
  AiFeedbackRating,
  AiFeedbackRecord,
  AiFunctionKey,
  AiFunctionDefinition,
  AiFunctionStatusSummary,
  AiFunctionUsageSummary,
  AiQualityStatus,
  AiRunStatus,
  AiRunSummary,
  AiRunTrigger,
  AiStoredArtifact,
  AiUsage,
  AiUsagePeriodSummary,
} from '../shared/ai.js';
import { sha256 } from './ai-evidence.js';
import { backupOperationalDatabase } from './operations-backup.js';

export function aiDatabasePath(environment: NodeJS.ProcessEnv = process.env) {
  return resolve(environment.SALICE_OPERATIONS_DB_PATH ?? 'data/operations.sqlite');
}

function tableExists(path: string, table: string) {
  if (!existsSync(path)) return false;
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  } finally {
    database.close();
  }
}

export async function prepareAiSchema(options: {
  path?: string;
  backupDirectory?: string;
  backupBeforeMigration?: boolean;
} = {}) {
  const path = resolve(options.path ?? aiDatabasePath());
  const requiredTables = [
    'ai_prompt_versions',
    'ai_enrichment_runs',
    'ai_artifacts',
    'ai_attempts',
    'ai_feedback',
    'ai_quality_reviews',
    'ai_product_vector_baseline_runs',
    'ai_product_vector_baselines',
  ];
  const pending = !existsSync(path) || requiredTables.some((table) => !tableExists(path, table));
  if (pending && existsSync(path) && options.backupBeforeMigration !== false) {
    await backupOperationalDatabase(
      path,
      resolve(options.backupDirectory ?? 'data/operations-backups'),
      Number(process.env.SALICE_OPERATIONS_BACKUP_RETENTION ?? 10),
    );
  }
  const store = new AiStore(path);
  const recoveredRuns = store.recoverStaleRuns();
  store.close();
  return { path, migrated: pending, recoveredRuns };
}

interface ArtifactInput {
  runId: string;
  snapshotAt: string;
  bundleId: string | null;
  functionKey: string;
  entityType: string;
  entityId: string;
  model: string;
  effort: string;
  promptVersion: number;
  schemaVersion: number;
  inputHash: string;
  requestHash: string;
  inputJson: string;
  outputJson: string | null;
  evidenceRefs: string[];
  status: AiArtifactStatus;
  reusedFromArtifactId?: string | null;
  error?: string | null;
}

interface AttemptInput {
  artifactId: string;
  attemptNumber: number;
  status: AiAttemptStatus;
  responseId: string | null;
  usage: AiUsage;
  durationMs: number;
  pricingVersion: string;
  inputRate: number;
  cachedInputRate: number;
  cacheWriteRate: number;
  outputRate: number;
  estimatedCostUsd: number;
  error: string | null;
}

const EMPTY_USAGE: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

export class AiStore {
  private readonly database: DatabaseSync;

  constructor(public readonly path = aiDatabasePath()) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    this.database = new DatabaseSync(resolve(path));
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    try {
      this.database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS ai_prompt_versions (
        id TEXT PRIMARY KEY,
        function_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        effort TEXT NOT NULL CHECK (effort IN ('low', 'medium', 'high')),
        prompt_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(function_key, version)
      );
      CREATE TABLE IF NOT EXISTS ai_enrichment_runs (
        id TEXT PRIMARY KEY,
        snapshot_at TEXT NOT NULL,
        bundle_id TEXT,
        trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('refresh', 'manual', 'manual-resume')),
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed', 'skipped')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        function_summary_json TEXT NOT NULL DEFAULT '[]',
        entities INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        reused INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_single_running
        ON ai_enrichment_runs(status) WHERE status = 'running';
      CREATE INDEX IF NOT EXISTS idx_ai_runs_snapshot
        ON ai_enrichment_runs(snapshot_at, started_at DESC);
      CREATE TABLE IF NOT EXISTS ai_artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        snapshot_at TEXT NOT NULL,
        bundle_id TEXT,
        function_key TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        model TEXT NOT NULL,
        effort TEXT NOT NULL CHECK (effort IN ('low', 'medium', 'high')),
        prompt_version INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        input_hash TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('valid', 'reused', 'failed', 'invalid', 'skipped')),
        reused_from_artifact_id TEXT,
        created_at TEXT NOT NULL,
        validated_at TEXT,
        error TEXT,
        FOREIGN KEY(run_id) REFERENCES ai_enrichment_runs(id),
        FOREIGN KEY(reused_from_artifact_id) REFERENCES ai_artifacts(id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_artifacts_request
        ON ai_artifacts(request_hash, status, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_artifacts_current_valid
        ON ai_artifacts(snapshot_at, function_key, entity_type, entity_id, request_hash)
        WHERE status IN ('valid', 'reused');
      CREATE INDEX IF NOT EXISTS idx_ai_artifacts_active
        ON ai_artifacts(snapshot_at, function_key, entity_type, entity_id);
      CREATE TABLE IF NOT EXISTS ai_attempts (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL CHECK (attempt_number IN (1, 2)),
        provider TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'transient_error', 'provider_error', 'structural_error')),
        response_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        pricing_version TEXT NOT NULL,
        input_rate REAL NOT NULL,
        cached_input_rate REAL NOT NULL,
        cache_write_rate REAL NOT NULL,
        output_rate REAL NOT NULL,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(artifact_id) REFERENCES ai_artifacts(id),
        UNIQUE(artifact_id, attempt_number)
      );
      CREATE TABLE IF NOT EXISTS ai_feedback (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        snapshot_at TEXT NOT NULL,
        prompt_version INTEGER NOT NULL,
        rating TEXT NOT NULL CHECK (rating IN ('useful', 'not_useful', 'incorrect', 'incomplete')),
        correction TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT 'Oficina Salice',
        subject_entity_type TEXT NOT NULL DEFAULT '',
        subject_entity_id TEXT NOT NULL DEFAULT '',
        correction_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY(artifact_id) REFERENCES ai_artifacts(id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_feedback_artifact ON ai_feedback(artifact_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS ai_quality_reviews (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'warning', 'blocked')),
        check_version INTEGER NOT NULL,
        issues_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY(artifact_id) REFERENCES ai_artifacts(id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_quality_artifact ON ai_quality_reviews(artifact_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS ai_product_vector_baseline_runs (
        id TEXT PRIMARY KEY,
        snapshot_at TEXT NOT NULL,
        product_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_product_vector_baselines (
        product_id TEXT PRIMARY KEY,
        baseline_run_id TEXT NOT NULL,
        snapshot_at TEXT NOT NULL,
        vector_version TEXT NOT NULL,
        vector_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(baseline_run_id) REFERENCES ai_product_vector_baseline_runs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_product_vector_baseline_snapshot
        ON ai_product_vector_baselines(snapshot_at, product_id);
      CREATE TRIGGER IF NOT EXISTS prevent_ai_prompt_update BEFORE UPDATE ON ai_prompt_versions
        BEGIN SELECT RAISE(ABORT, 'Las versiones de prompt son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_prompt_delete BEFORE DELETE ON ai_prompt_versions
        BEGIN SELECT RAISE(ABORT, 'Las versiones de prompt son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_artifact_update BEFORE UPDATE ON ai_artifacts
        BEGIN SELECT RAISE(ABORT, 'Los artefactos de IA son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_artifact_delete BEFORE DELETE ON ai_artifacts
        BEGIN SELECT RAISE(ABORT, 'Los artefactos de IA son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_attempt_update BEFORE UPDATE ON ai_attempts
        BEGIN SELECT RAISE(ABORT, 'Los intentos de IA son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_attempt_delete BEFORE DELETE ON ai_attempts
        BEGIN SELECT RAISE(ABORT, 'Los intentos de IA son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_feedback_update BEFORE UPDATE ON ai_feedback
        BEGIN SELECT RAISE(ABORT, 'El feedback de IA es append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_feedback_delete BEFORE DELETE ON ai_feedback
        BEGIN SELECT RAISE(ABORT, 'El feedback de IA es append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_quality_update BEFORE UPDATE ON ai_quality_reviews
        BEGIN SELECT RAISE(ABORT, 'Los controles de calidad de IA son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_quality_delete BEFORE DELETE ON ai_quality_reviews
        BEGIN SELECT RAISE(ABORT, 'Los controles de calidad de IA son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_vector_baseline_run_update BEFORE UPDATE ON ai_product_vector_baseline_runs
        BEGIN SELECT RAISE(ABORT, 'La línea base vectorial es append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_vector_baseline_run_delete BEFORE DELETE ON ai_product_vector_baseline_runs
        BEGIN SELECT RAISE(ABORT, 'La línea base vectorial es append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_vector_baseline_update BEFORE UPDATE ON ai_product_vector_baselines
        BEGIN SELECT RAISE(ABORT, 'La línea base vectorial es append-only'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_ai_vector_baseline_delete BEFORE DELETE ON ai_product_vector_baselines
        BEGIN SELECT RAISE(ABORT, 'La línea base vectorial es append-only'); END;
      COMMIT;
      `);
      this.ensureColumn('ai_feedback', 'subject_entity_type', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('ai_feedback', 'subject_entity_id', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('ai_feedback', 'correction_version', 'INTEGER NOT NULL DEFAULT 1');
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch { /* la sentencia fallida puede haber cerrado la transacción */ }
      throw error;
    }
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  close() {
    this.database.close();
  }

  registerPrompt(definition: AiFunctionDefinition) {
    const id = `${definition.key}:v${definition.promptVersion}`;
    const contentHash = sha256(definition.prompt);
    this.database.prepare(`
      INSERT OR IGNORE INTO ai_prompt_versions (
        id, function_key, version, schema_version, content_hash, model, effort, prompt_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      definition.key,
      definition.promptVersion,
      definition.schemaVersion,
      contentHash,
      definition.model,
      definition.effort,
      definition.prompt,
      new Date().toISOString(),
    );
    const current = this.database.prepare('SELECT content_hash, schema_version, model, effort FROM ai_prompt_versions WHERE id = ?').get(id);
    if (
      String(current?.content_hash) !== contentHash
      || Number(current?.schema_version) !== definition.schemaVersion
      || String(current?.model) !== definition.model
      || String(current?.effort) !== definition.effort
    ) {
      throw new Error(`La versión ${id} ya existe con otro contenido o configuración. Creá una versión nueva.`);
    }
    return id;
  }

  startRun(input: { snapshotAt: string; bundleId: string | null; trigger: AiRunTrigger }) {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO ai_enrichment_runs (id, snapshot_at, bundle_id, trigger_kind, status, started_at)
      VALUES (?, ?, ?, ?, 'running', ?)
    `).run(id, input.snapshotAt, input.bundleId, input.trigger, new Date().toISOString());
    return id;
  }

  recoverInterruptedRuns(reason = 'Ejecución interrumpida; se habilitó una reanudación administrativa.') {
    this.database.prepare(`
      UPDATE ai_enrichment_runs
      SET status = 'failed', completed_at = ?, error = COALESCE(error, ?)
      WHERE status = 'running'
    `).run(new Date().toISOString(), reason);
  }

  recoverStaleRuns(maxAgeMs = 30 * 60 * 1_000) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = this.database.prepare(`
      UPDATE ai_enrichment_runs
      SET status = 'failed', completed_at = ?, error = COALESCE(error, ?)
      WHERE status = 'running' AND started_at < ?
    `).run(
      new Date().toISOString(),
      'Ejecución interrumpida detectada al iniciar el sistema; los reportes determinísticos siguieron disponibles.',
      cutoff,
    );
    return Number(result.changes);
  }

  finishRun(id: string, input: {
    status: Exclude<AiRunStatus, 'running'>;
    functions: AiFunctionStatusSummary[];
    entities: number;
    completed: number;
    reused: number;
    failed: number;
    skipped: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    estimatedCostUsd: number;
    error?: string | null;
  }) {
    this.database.prepare(`
      UPDATE ai_enrichment_runs SET
        status = ?, completed_at = ?, function_summary_json = ?, entities = ?, completed = ?,
        reused = ?, failed = ?, skipped = ?, input_tokens = ?, output_tokens = ?,
        cached_input_tokens = ?, reasoning_tokens = ?, estimated_cost_usd = ?, error = ?
      WHERE id = ? AND status = 'running'
    `).run(
      input.status,
      new Date().toISOString(),
      JSON.stringify(input.functions),
      input.entities,
      input.completed,
      input.reused,
      input.failed,
      input.skipped,
      input.inputTokens,
      input.outputTokens,
      input.cachedInputTokens,
      input.reasoningTokens,
      input.estimatedCostUsd,
      input.error ?? null,
      id,
    );
  }

  findReusableArtifact(requestHash: string) {
    return this.database.prepare(`
      SELECT a.id, a.snapshot_at, a.output_json, a.evidence_refs_json
      FROM ai_artifacts a
      WHERE a.request_hash = ? AND a.status IN ('valid', 'reused') AND a.output_json IS NOT NULL
        AND COALESCE((
          SELECT q.status FROM ai_quality_reviews q
          WHERE q.artifact_id = a.id
          ORDER BY q.check_version DESC, q.created_at DESC, q.rowid DESC LIMIT 1
        ), 'passed') != 'blocked'
      ORDER BY a.created_at DESC LIMIT 1
    `).get(requestHash) as { id: string; snapshot_at: string; output_json: string; evidence_refs_json: string } | undefined;
  }

  createArtifact(input: ArtifactInput) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO ai_artifacts (
        id, run_id, snapshot_at, bundle_id, function_key, entity_type, entity_id, model, effort,
        prompt_version, schema_version, input_hash, request_hash, input_json, output_json,
        evidence_refs_json, status, reused_from_artifact_id, created_at, validated_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.runId,
      input.snapshotAt,
      input.bundleId,
      input.functionKey,
      input.entityType,
      input.entityId,
      input.model,
      input.effort,
      input.promptVersion,
      input.schemaVersion,
      input.inputHash,
      input.requestHash,
      input.inputJson,
      input.outputJson,
      JSON.stringify(input.evidenceRefs),
      input.status,
      input.reusedFromArtifactId ?? null,
      createdAt,
      input.status === 'valid' || input.status === 'reused' ? createdAt : null,
      input.error ?? null,
    );
    return id;
  }

  recordAttempt(provider: string, input: AttemptInput) {
    this.database.prepare(`
      INSERT INTO ai_attempts (
        id, artifact_id, attempt_number, provider, status, response_id, input_tokens, output_tokens,
        cached_input_tokens, cache_write_tokens, reasoning_tokens, total_tokens, duration_ms,
        pricing_version, input_rate, cached_input_rate, cache_write_rate, output_rate,
        estimated_cost_usd, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.artifactId,
      input.attemptNumber,
      provider,
      input.status,
      input.responseId,
      input.usage.inputTokens,
      input.usage.outputTokens,
      input.usage.cachedInputTokens,
      input.usage.cacheWriteTokens,
      input.usage.reasoningTokens,
      input.usage.totalTokens,
      input.durationMs,
      input.pricingVersion,
      input.inputRate,
      input.cachedInputRate,
      input.cacheWriteRate,
      input.outputRate,
      input.estimatedCostUsd,
      input.error,
      new Date().toISOString(),
    );
  }

  addFeedback(input: {
    artifactId: string;
    snapshotAt: string;
    promptVersion: number;
    rating: AiFeedbackRating;
    correction?: string;
    actor?: string;
    subjectEntityType?: string;
    subjectEntityId?: string;
  }) {
    const id = randomUUID();
    const subjectEntityType = (input.subjectEntityType ?? '').trim().slice(0, 120);
    const subjectEntityId = (input.subjectEntityId ?? '').trim().slice(0, 180);
    const correctionVersion = Number(this.database.prepare(`
      SELECT COALESCE(MAX(correction_version), 0) + 1 AS version
      FROM ai_feedback
      WHERE artifact_id = ? AND subject_entity_type = ? AND subject_entity_id = ?
    `).get(input.artifactId, subjectEntityType, subjectEntityId)?.version ?? 1);
    this.database.prepare(`
      INSERT INTO ai_feedback (
        id, artifact_id, snapshot_at, prompt_version, rating, correction, actor,
        subject_entity_type, subject_entity_id, correction_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.artifactId,
      input.snapshotAt,
      input.promptVersion,
      input.rating,
      (input.correction ?? '').trim().slice(0, 2_000),
      (input.actor ?? 'Oficina Salice').trim().slice(0, 120),
      subjectEntityType,
      subjectEntityId,
      correctionVersion,
      new Date().toISOString(),
    );
    return this.feedbackById(id)!;
  }

  feedbackById(id: string): AiFeedbackRecord | null {
    const row = this.database.prepare('SELECT * FROM ai_feedback WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapFeedback(row) : null;
  }

  listFeedback(artifactId: string, subjectEntityType = '', subjectEntityId = '') {
    return (this.database.prepare(`
      SELECT * FROM ai_feedback
      WHERE artifact_id = ? AND subject_entity_type = ? AND subject_entity_id = ?
      ORDER BY correction_version DESC, created_at DESC
    `).all(artifactId, subjectEntityType, subjectEntityId) as Record<string, unknown>[])
      .map((row) => this.mapFeedback(row));
  }

  artifactIdentity(id: string) {
    return this.database.prepare(`
      SELECT id, snapshot_at, prompt_version, entity_type, entity_id
      FROM ai_artifacts WHERE id = ?
    `).get(id) as {
      id: string;
      snapshot_at: string;
      prompt_version: number;
      entity_type: string;
      entity_id: string;
    } | undefined;
  }

  recordQualityReview(input: {
    artifactId: string;
    status: AiQualityStatus;
    checkVersion: number;
    issues: string[];
  }) {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO ai_quality_reviews (id, artifact_id, status, check_version, issues_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.artifactId,
      input.status,
      input.checkVersion,
      JSON.stringify([...new Set(input.issues)].slice(0, 30)),
      new Date().toISOString(),
    );
    return id;
  }

  ensureProductVectorBaseline(
    snapshotAt: string,
    products: Array<{ id: string; vectorVersion: string; vectorHash: string }>,
  ) {
    const existing = Number(this.database.prepare('SELECT COUNT(*) AS total FROM ai_product_vector_baseline_runs').get()?.total ?? 0);
    if (existing) return { created: false, products: 0 };
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const insert = this.database.prepare(`
      INSERT INTO ai_product_vector_baselines (
        product_id, baseline_run_id, snapshot_at, vector_version, vector_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO ai_product_vector_baseline_runs (id, snapshot_at, product_count, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, snapshotAt, products.length, createdAt);
      products.forEach((product) => insert.run(
        product.id,
        id,
        snapshotAt,
        product.vectorVersion,
        product.vectorHash,
        createdAt,
      ));
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return { created: true, products: products.length };
  }

  hasProductVectorBaseline(productId: string) {
    return Boolean(this.database.prepare(
      'SELECT 1 FROM ai_product_vector_baselines WHERE product_id = ?',
    ).get(productId));
  }

  hasValidProductVectorArtifact(productId: string) {
    return Boolean(this.database.prepare(`
      SELECT 1 FROM ai_artifacts a
      WHERE a.function_key = 'product_vectorization'
        AND a.entity_type = 'product'
        AND a.entity_id = ?
        AND a.status IN ('valid', 'reused')
        AND a.output_json IS NOT NULL
        AND COALESCE((
          SELECT q.status FROM ai_quality_reviews q
          WHERE q.artifact_id = a.id
          ORDER BY q.check_version DESC, q.created_at DESC, q.rowid DESC LIMIT 1
        ), 'passed') != 'blocked'
      LIMIT 1
    `).get(productId));
  }

  latestArtifact<T>(input: {
    functionKey: string;
    entityType: string;
    entityId: string;
    snapshotAt?: string;
    inputHash?: string;
  }): AiStoredArtifact<T> | null {
    const clauses = [
      'a.function_key = ?',
      'a.entity_type = ?',
      'a.entity_id = ?',
      "a.status IN ('valid', 'reused')",
      'a.output_json IS NOT NULL',
      "COALESCE((SELECT latest_status.status FROM ai_quality_reviews latest_status WHERE latest_status.artifact_id = a.id ORDER BY latest_status.check_version DESC, latest_status.created_at DESC, latest_status.rowid DESC LIMIT 1), 'passed') != 'blocked'",
    ];
    const values: Array<string> = [input.functionKey, input.entityType, input.entityId];
    if (input.snapshotAt) {
      clauses.push('a.snapshot_at = ?');
      values.push(input.snapshotAt);
    }
    if (input.inputHash) {
      clauses.push('a.input_hash = ?');
      values.push(input.inputHash);
    }
    const row = this.database.prepare(`
      SELECT a.*, q.status AS quality_status, q.issues_json AS quality_issues_json, q.created_at AS quality_reviewed_at
      FROM ai_artifacts a
      LEFT JOIN ai_quality_reviews q ON q.id = (
        SELECT latest.id FROM ai_quality_reviews latest
        WHERE latest.artifact_id = a.id ORDER BY latest.check_version DESC, latest.created_at DESC, latest.rowid DESC LIMIT 1
      )
      WHERE ${clauses.join(' AND ')}
      ORDER BY a.created_at DESC, a.rowid DESC
      LIMIT 1
    `).get(...values) as Record<string, unknown> | undefined;
    return row ? this.mapArtifact<T>(row) : null;
  }

  listArtifacts<T>(input: {
    functionKey: string;
    entityType?: string;
    snapshotAt?: string;
  }): AiStoredArtifact<T>[] {
    const clauses = [
      'a.function_key = ?',
      "a.status IN ('valid', 'reused')",
      'a.output_json IS NOT NULL',
      "COALESCE((SELECT latest_status.status FROM ai_quality_reviews latest_status WHERE latest_status.artifact_id = a.id ORDER BY latest_status.check_version DESC, latest_status.created_at DESC, latest_status.rowid DESC LIMIT 1), 'passed') != 'blocked'",
    ];
    const values: string[] = [input.functionKey];
    if (input.entityType) {
      clauses.push('a.entity_type = ?');
      values.push(input.entityType);
    }
    if (input.snapshotAt) {
      clauses.push('a.snapshot_at = ?');
      values.push(input.snapshotAt);
    }
    return (this.database.prepare(`
      SELECT a.*, q.status AS quality_status, q.issues_json AS quality_issues_json, q.created_at AS quality_reviewed_at
      FROM ai_artifacts a
      LEFT JOIN ai_quality_reviews q ON q.id = (
        SELECT latest.id FROM ai_quality_reviews latest
        WHERE latest.artifact_id = a.id ORDER BY latest.check_version DESC, latest.created_at DESC, latest.rowid DESC LIMIT 1
      )
      WHERE ${clauses.join(' AND ')}
      ORDER BY a.created_at DESC, a.rowid DESC
    `).all(...values) as Record<string, unknown>[]).map((row) => this.mapArtifact<T>(row));
  }

  runById(id: string) {
    const row = this.database.prepare('SELECT * FROM ai_enrichment_runs WHERE id = ?').get(id);
    return row ? this.mapRun(row) : null;
  }

  currentRun() {
    const row = this.database.prepare("SELECT * FROM ai_enrichment_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").get();
    return row ? this.mapRun(row) : null;
  }

  lastRun(snapshotAt?: string) {
    const row = snapshotAt
      ? this.database.prepare("SELECT * FROM ai_enrichment_runs WHERE snapshot_at = ? AND status != 'running' ORDER BY started_at DESC LIMIT 1").get(snapshotAt)
      : this.database.prepare("SELECT * FROM ai_enrichment_runs WHERE status != 'running' ORDER BY started_at DESC LIMIT 1").get();
    return row ? this.mapRun(row) : null;
  }

  artifactCounts(snapshotAt: string) {
    const rows = this.database.prepare(`
      SELECT status, COUNT(*) AS total FROM ai_artifacts WHERE snapshot_at = ? GROUP BY status
    `).all(snapshotAt);
    const counts: Record<AiArtifactStatus, number> = { valid: 0, reused: 0, failed: 0, invalid: 0, skipped: 0 };
    for (const row of rows) counts[String(row.status) as AiArtifactStatus] = Number(row.total);
    return counts;
  }

  usagePeriod(from?: string): AiUsagePeriodSummary {
    const row = this.database.prepare(`
      SELECT
        COUNT(*) AS attempts,
        SUM(CASE WHEN attempt_number > 1 THEN 1 ELSE 0 END) AS retries,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
      FROM ai_attempts
      ${from ? 'WHERE created_at >= ?' : ''}
    `).get(...(from ? [from] : [])) as Record<string, unknown>;
    return this.mapUsage(row);
  }

  functionUsage(from: string): AiFunctionUsageSummary[] {
    const attemptRows = this.database.prepare(`
      SELECT a.function_key,
        COUNT(t.id) AS attempts,
        SUM(CASE WHEN t.attempt_number > 1 THEN 1 ELSE 0 END) AS retries,
        COALESCE(SUM(t.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(t.output_tokens), 0) AS output_tokens,
        COALESCE(SUM(t.cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(t.reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(t.estimated_cost_usd), 0) AS estimated_cost_usd
      FROM ai_attempts t
      JOIN ai_artifacts a ON a.id = t.artifact_id
      WHERE t.created_at >= ?
      GROUP BY a.function_key
    `).all(from) as Record<string, unknown>[];
    const attempts = new Map(attemptRows.map((row) => [String(row.function_key), row]));
    const artifactRows = this.database.prepare(`
      SELECT function_key,
        SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'reused' THEN 1 ELSE 0 END) AS reused,
        SUM(CASE WHEN status IN ('failed', 'invalid') THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
      FROM ai_artifacts
      WHERE created_at >= ?
      GROUP BY function_key
    `).all(from) as Record<string, unknown>[];
    const artifacts = new Map(artifactRows.map((row) => [String(row.function_key), row]));
    const outcomes = new Map<string, { completed: number; reused: number; failed: number; skipped: number }>();
    const runRows = this.database.prepare(`
      SELECT * FROM ai_enrichment_runs
      WHERE started_at >= ? AND status != 'running'
    `).all(from) as Record<string, unknown>[];
    runRows.map((row) => this.mapRun(row)).forEach((run) => run.functions.forEach((item) => {
      const current = outcomes.get(item.functionKey) ?? { completed: 0, reused: 0, failed: 0, skipped: 0 };
      current.completed += item.completed;
      current.reused += item.reused;
      current.failed += item.failed;
      current.skipped += item.skipped;
      outcomes.set(item.functionKey, current);
    }));
    const keys = [...new Set([...attempts.keys(), ...artifacts.keys(), ...outcomes.keys()])].sort();
    return keys.map((functionKey) => {
      const usage = this.mapUsage(attempts.get(functionKey) ?? {});
      const runResult = outcomes.get(functionKey) ?? { completed: 0, reused: 0, failed: 0, skipped: 0 };
      const artifactResult = artifacts.get(functionKey) ?? {};
      return {
        functionKey: functionKey as AiFunctionUsageSummary['functionKey'],
        ...usage,
        completed: Math.max(runResult.completed, Number(artifactResult.completed ?? 0)),
        reused: Math.max(runResult.reused, Number(artifactResult.reused ?? 0)),
        failed: Math.max(runResult.failed, Number(artifactResult.failed ?? 0)),
        skipped: Math.max(runResult.skipped, Number(artifactResult.skipped ?? 0)),
      };
    });
  }

  recentRuns(limit = 12) {
    return (this.database.prepare(`
      SELECT * FROM ai_enrichment_runs
      WHERE status != 'running'
      ORDER BY started_at DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[]).map((row) => this.mapRun(row));
  }

  qualitySummary(snapshotAt: string) {
    const rows = this.database.prepare(`
      SELECT q.status, q.issues_json
      FROM ai_quality_reviews q
      JOIN ai_artifacts a ON a.id = q.artifact_id
      WHERE a.snapshot_at = ?
        AND q.id = (
          SELECT latest.id FROM ai_quality_reviews latest
          WHERE latest.artifact_id = q.artifact_id
          ORDER BY latest.check_version DESC, latest.created_at DESC, latest.rowid DESC LIMIT 1
        )
    `).all(snapshotAt) as Array<{ status: AiQualityStatus; issues_json: string }>;
    const summary = { total: rows.length, passed: 0, warnings: 0, blocked: 0, issues: 0 };
    rows.forEach((row) => {
      if (row.status === 'passed') summary.passed += 1;
      else if (row.status === 'warning') summary.warnings += 1;
      else summary.blocked += 1;
      try {
        const parsed = JSON.parse(row.issues_json);
        if (Array.isArray(parsed)) summary.issues += parsed.length;
      } catch { /* un registro histórico ilegible cuenta sin detalle */ }
    });
    return summary;
  }

  feedbackSummary() {
    const row = this.database.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN rating = 'useful' THEN 1 ELSE 0 END) AS useful,
        SUM(CASE WHEN rating = 'not_useful' THEN 1 ELSE 0 END) AS not_useful,
        SUM(CASE WHEN rating = 'incorrect' THEN 1 ELSE 0 END) AS incorrect,
        SUM(CASE WHEN rating = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
        SUM(CASE WHEN TRIM(correction) != '' THEN 1 ELSE 0 END) AS corrections
      FROM ai_feedback
    `).get() as Record<string, unknown>;
    return {
      total: Number(row.total ?? 0),
      useful: Number(row.useful ?? 0),
      notUseful: Number(row.not_useful ?? 0),
      incorrect: Number(row.incorrect ?? 0),
      incomplete: Number(row.incomplete ?? 0),
      corrections: Number(row.corrections ?? 0),
    };
  }

  unreviewedArtifacts(snapshotAt: string, checkVersion: number) {
    const rows = this.database.prepare(`
      SELECT a.id, a.function_key, a.input_json, a.output_json, a.evidence_refs_json
      FROM ai_artifacts a
      WHERE a.snapshot_at = ?
        AND a.status IN ('valid', 'reused')
        AND a.output_json IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ai_quality_reviews q
          WHERE q.artifact_id = a.id AND q.check_version >= ?
        )
      ORDER BY a.created_at, a.rowid
    `).all(snapshotAt, checkVersion) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      artifactId: String(row.id),
      functionKey: String(row.function_key) as AiFunctionKey,
      evidence: JSON.parse(String(row.input_json)),
      output: JSON.parse(String(row.output_json)),
      evidenceRefs: JSON.parse(String(row.evidence_refs_json)) as string[],
    }));
  }

  private mapRun(row: Record<string, unknown>): AiRunSummary {
    let functions: AiFunctionStatusSummary[] = [];
    try {
      const parsed = JSON.parse(String(row.function_summary_json ?? '[]'));
      if (Array.isArray(parsed)) functions = parsed;
    } catch {
      functions = [];
    }
    return {
      id: String(row.id),
      snapshotAt: String(row.snapshot_at),
      bundleId: row.bundle_id == null ? null : String(row.bundle_id),
      trigger: String(row.trigger_kind) as AiRunTrigger,
      status: String(row.status) as AiRunStatus,
      startedAt: String(row.started_at),
      completedAt: row.completed_at == null ? null : String(row.completed_at),
      functions,
      entities: Number(row.entities ?? 0),
      completed: Number(row.completed ?? 0),
      reused: Number(row.reused ?? 0),
      failed: Number(row.failed ?? 0),
      skipped: Number(row.skipped ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      cachedInputTokens: Number(row.cached_input_tokens ?? 0),
      reasoningTokens: Number(row.reasoning_tokens ?? 0),
      estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
      error: row.error == null ? null : String(row.error),
    };
  }

  private mapArtifact<T>(row: Record<string, unknown>): AiStoredArtifact<T> {
    return {
      artifactId: String(row.id),
      snapshotAt: String(row.snapshot_at),
      functionKey: String(row.function_key) as AiStoredArtifact<T>['functionKey'],
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      model: String(row.model),
      effort: String(row.effort) as AiStoredArtifact<T>['effort'],
      promptVersion: Number(row.prompt_version),
      schemaVersion: Number(row.schema_version),
      generatedAt: String(row.created_at),
      output: JSON.parse(String(row.output_json)) as T,
      quality: row.quality_status == null ? null : {
        status: String(row.quality_status) as AiQualityStatus,
        issues: JSON.parse(String(row.quality_issues_json ?? '[]')) as string[],
        reviewedAt: String(row.quality_reviewed_at),
      },
    };
  }

  private mapUsage(row: Record<string, unknown>): AiUsagePeriodSummary {
    return {
      attempts: Number(row.attempts ?? 0),
      retries: Number(row.retries ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      cachedInputTokens: Number(row.cached_input_tokens ?? 0),
      reasoningTokens: Number(row.reasoning_tokens ?? 0),
      estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    };
  }

  private mapFeedback(row: Record<string, unknown>): AiFeedbackRecord {
    return {
      id: String(row.id),
      artifactId: String(row.artifact_id),
      snapshotAt: String(row.snapshot_at),
      promptVersion: Number(row.prompt_version),
      subjectEntityType: String(row.subject_entity_type ?? ''),
      subjectEntityId: String(row.subject_entity_id ?? ''),
      correctionVersion: Number(row.correction_version ?? 1),
      rating: String(row.rating) as AiFeedbackRating,
      correction: String(row.correction ?? ''),
      actor: String(row.actor),
      createdAt: String(row.created_at),
    };
  }
}

export function emptyUsage(): AiUsage {
  return { ...EMPTY_USAGE };
}
