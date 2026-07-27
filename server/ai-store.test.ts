import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { AiStore, prepareAiSchema } from './ai-store';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('migración y persistencia IA', () => {
  it('respalda operations.sqlite antes de agregar el esquema v0.9.0', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'salice-ai-migration-'));
    directories.push(directory);
    const path = resolve(directory, 'operations.sqlite');
    const database = new DatabaseSync(path);
    database.exec("CREATE TABLE notes(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO notes(value) VALUES ('preservar');");
    database.close();
    const backups = resolve(directory, 'backups');
    const result = await prepareAiSchema({ path, backupDirectory: backups });
    expect(result.migrated).toBe(true);
    expect((await readdir(backups)).some((name) => name.endsWith('.sqlite'))).toBe(true);
    const verify = new DatabaseSync(path, { readOnly: true });
    expect(verify.prepare("SELECT value FROM notes").get()?.value).toBe('preservar');
    expect(Number(verify.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name LIKE 'ai_%'").get()?.total)).toBe(8);
    verify.close();
  });

  it('impide modificar o borrar feedback ya registrado', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'salice-ai-append-only-'));
    directories.push(directory);
    const store = new AiStore(resolve(directory, 'operations.sqlite'));
    const runId = store.startRun({ snapshotAt: '2026-07-24T00:00:00.000Z', bundleId: 'bundle', trigger: 'manual' });
    const artifactId = store.createArtifact({
      runId,
      snapshotAt: '2026-07-24T00:00:00.000Z',
      bundleId: 'bundle',
      functionKey: 'report_narrative',
      entityType: 'report',
      entityId: 'general',
      model: 'gpt-5.6-terra',
      effort: 'medium',
      promptVersion: 1,
      schemaVersion: 1,
      inputHash: 'input',
      requestHash: 'request',
      inputJson: '{}',
      outputJson: '{"summary":"ok"}',
      evidenceRefs: [],
      status: 'valid',
    });
    const firstFeedback = store.addFeedback({
      artifactId,
      snapshotAt: '2026-07-24T00:00:00.000Z',
      promptVersion: 1,
      rating: 'incorrect',
      correction: 'La comparación correcta usa el mismo corte.',
      subjectEntityType: 'report',
      subjectEntityId: 'general',
    });
    const secondFeedback = store.addFeedback({
      artifactId,
      snapshotAt: '2026-07-24T00:00:00.000Z',
      promptVersion: 1,
      rating: 'useful',
      subjectEntityType: 'report',
      subjectEntityId: 'general',
    });
    expect(firstFeedback.correctionVersion).toBe(1);
    expect(secondFeedback.correctionVersion).toBe(2);
    expect(store.listFeedback(artifactId, 'report', 'general')).toHaveLength(2);
    const raw = new DatabaseSync(store.path);
    expect(() => raw.exec("UPDATE ai_feedback SET rating = 'incorrect'")).toThrow(/append-only/);
    expect(() => raw.exec('DELETE FROM ai_feedback')).toThrow(/append-only/);
    raw.close();
    store.close();
  });

  it('bloquea un artefacto observado sin modificar el registro original', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'salice-ai-quality-'));
    directories.push(directory);
    const store = new AiStore(resolve(directory, 'operations.sqlite'));
    const runId = store.startRun({ snapshotAt: '2026-07-24T00:00:00.000Z', bundleId: 'bundle', trigger: 'manual' });
    const artifactId = store.createArtifact({
      runId,
      snapshotAt: '2026-07-24T00:00:00.000Z',
      bundleId: 'bundle',
      functionKey: 'report_narrative',
      entityType: 'report',
      entityId: 'general',
      model: 'gpt-5.6-terra',
      effort: 'medium',
      promptVersion: 1,
      schemaVersion: 1,
      inputHash: 'input',
      requestHash: 'request',
      inputJson: '{}',
      outputJson: '{"summary":"problemática"}',
      evidenceRefs: [],
      status: 'valid',
    });
    expect(store.latestArtifact({ functionKey: 'report_narrative', entityType: 'report', entityId: 'general' })).not.toBeNull();
    store.recordQualityReview({
      artifactId,
      status: 'blocked',
      checkVersion: 1,
      issues: ['Afirmación sin evidencia.'],
    });
    expect(store.latestArtifact({ functionKey: 'report_narrative', entityType: 'report', entityId: 'general' })).toBeNull();
    const raw = new DatabaseSync(store.path);
    expect(() => raw.exec("UPDATE ai_quality_reviews SET status = 'passed'")).toThrow(/append-only/);
    raw.close();
    store.close();
  });

  it('resume resultados reutilizados por función aunque no creen un artefacto duplicado', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'salice-ai-usage-'));
    directories.push(directory);
    const store = new AiStore(resolve(directory, 'operations.sqlite'));
    const runId = store.startRun({ snapshotAt: '2026-07-24T00:00:00.000Z', bundleId: 'bundle', trigger: 'manual' });
    store.finishRun(runId, {
      status: 'completed',
      functions: [{
        functionKey: 'report_narrative',
        completed: 1,
        reused: 2,
        failed: 0,
        skipped: 1,
        model: 'gpt-5.6-terra',
        effort: 'medium',
      }],
      entities: 4,
      completed: 1,
      reused: 2,
      failed: 0,
      skipped: 1,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      estimatedCostUsd: 0,
    });
    const usage = store.functionUsage('2000-01-01T00:00:00.000Z');
    expect(usage).toMatchObject([{
      functionKey: 'report_narrative',
      completed: 1,
      reused: 2,
      failed: 0,
      skipped: 1,
    }]);
    store.close();
  });

  it('reconoce como explicado un cliente guardado en los lotes históricos', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'salice-ai-commercial-history-'));
    directories.push(directory);
    const store = new AiStore(resolve(directory, 'operations.sqlite'));
    const runId = store.startRun({ snapshotAt: '2026-07-24T00:00:00.000Z', bundleId: 'bundle', trigger: 'manual' });
    const artifactId = store.createArtifact({
      runId,
      snapshotAt: '2026-07-24T00:00:00.000Z',
      bundleId: 'bundle',
      functionKey: 'commercial_inbox_explanation',
      entityType: 'commercial_inbox_batch',
      entityId: '2026-07-21:1',
      model: 'gpt-5.6-terra',
      effort: 'low',
      promptVersion: 4,
      schemaVersion: 3,
      inputHash: 'input',
      requestHash: 'request',
      inputJson: '{}',
      outputJson: JSON.stringify({ items: [{
        clientId: 42,
        primaryReason: 'Motivo inicial',
        secondaryReasons: [],
        explanation: 'Explicación inicial.',
        evidenceIds: ['client:42:metric:collection-risk'],
        commercialOpportunity: '',
        caution: 'Confirmar.',
      }] }),
      evidenceRefs: ['client:42:metric:collection-risk'],
      status: 'valid',
    });
    store.recordQualityReview({ artifactId, status: 'passed', checkVersion: 1, issues: [] });
    expect(store.hasCommercialInboxExplanation(42)).toBe(true);
    expect(store.hasCommercialInboxExplanation(43)).toBe(false);
    store.close();
  });
});
