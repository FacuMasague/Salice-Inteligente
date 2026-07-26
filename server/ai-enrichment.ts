import Ajv from 'ajv';
import type {
  AiArtifactStatus,
  AiAttemptStatus,
  AiFunctionDefinition,
  AiFunctionStatusSummary,
  AiLimits,
  AiProvider,
  AiRunStatus,
  AiRunTrigger,
  AiSystemStatus,
  AiUsage,
} from '../shared/ai.js';
import { aiBudget, aiLimits, estimateAiCost, resolveOpenAiApiKey, TERRA_PRICING } from './ai-config.js';
import { assertCompactSafeEvidence, semanticRequestHash, sha256 } from './ai-evidence.js';
import { AiProviderError, OpenAiResponsesProvider } from './ai-provider.js';
import { createAiFunctionDefinitions } from './ai-functions.js';
import {
  AI_QUALITY_CHECK_VERSION,
  auditAiOutput,
  auditNarrativeContradictions,
  type AiQualityCandidate,
} from './ai-quality.js';
import { AiStore, emptyUsage } from './ai-store.js';

interface EnrichmentInput {
  snapshot: unknown;
  snapshotAt: string;
  bundleId: string | null;
  trigger: AiRunTrigger;
  definitions?: AiFunctionDefinition[];
  provider?: AiProvider;
  limits?: AiLimits;
  store?: AiStore;
  workspace?: string;
  resume?: boolean;
}

interface PendingAttempt {
  number: number;
  status: AiAttemptStatus;
  responseId: string | null;
  usage: AiUsage;
  durationMs: number;
  cost: number;
  error: string | null;
}

function addUsage(target: AiUsage, source: AiUsage) {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cachedInputTokens += source.cachedInputTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.totalTokens += source.totalTokens;
}

function statusAfter(functions: AiFunctionStatusSummary[]): Exclude<AiRunStatus, 'running'> {
  const totals = functions.reduce((sum, item) => ({
    completed: sum.completed + item.completed,
    reused: sum.reused + item.reused,
    failed: sum.failed + item.failed,
    skipped: sum.skipped + item.skipped,
  }), { completed: 0, reused: 0, failed: 0, skipped: 0 });
  if (totals.failed) return totals.completed || totals.reused ? 'partial' : 'failed';
  if (!totals.completed && !totals.reused && totals.skipped) return 'skipped';
  return 'completed';
}

export async function runAiEnrichment(input: EnrichmentInput) {
  const limits = input.limits ?? aiLimits();
  const ownStore = !input.store;
  const store = input.store ?? new AiStore();
  const definitions = input.definitions ?? createAiFunctionDefinitions({
    store,
    snapshotAt: input.snapshotAt,
  });
  if (input.resume) store.recoverInterruptedRuns();
  const runId = store.startRun({ snapshotAt: input.snapshotAt, bundleId: input.bundleId, trigger: input.trigger });
  const functionSummaries: AiFunctionStatusSummary[] = [];
  const totalUsage = emptyUsage();
  let estimatedCostUsd = 0;
  let entities = 0;
  let firstError: string | null = null;
  const qualityCandidates: Array<AiQualityCandidate & {
    outcome: 'completed' | 'reused';
    summary: AiFunctionStatusSummary;
  }> = [];

  try {
    if (!definitions.length) {
      store.finishRun(runId, {
        status: 'skipped',
        functions: [],
        entities: 0,
        completed: 0,
        reused: 0,
        failed: 0,
        skipped: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        estimatedCostUsd: 0,
        error: 'v0.9.0 instaló la infraestructura; todavía no hay funciones de enriquecimiento habilitadas.',
      });
      return store.runById(runId)!;
    }

    const apiKey = resolveOpenAiApiKey(input.workspace);
    const provider = input.provider ?? (apiKey ? new OpenAiResponsesProvider(apiKey) : null);
    const ajv = new Ajv({ allErrors: true, strict: false });
    let estimatedInputTokens = 0;

    for (const definition of definitions) {
      store.registerPrompt(definition);
      const summary: AiFunctionStatusSummary = {
        functionKey: definition.key,
        completed: 0,
        reused: 0,
        failed: 0,
        skipped: 0,
        model: definition.model,
        effort: definition.effort,
      };
      functionSummaries.push(summary);
      const validate = ajv.compile(definition.schema);
      const jobs = (await definition.buildJobs(input.snapshot)).slice(0, limits.maxEntitiesPerFunction);

      for (const job of jobs) {
        if (entities >= limits.maxEntitiesPerRun) {
          summary.skipped += 1;
          continue;
        }
        entities += 1;
        let evidenceJson = '';
        let inputHash = '';
        let requestHash = '';
        let estimatedRequestTokens = 0;
        try {
          const compact = assertCompactSafeEvidence(job.evidence, limits.maxInputBytesPerEntity);
          evidenceJson = compact.serialized;
          inputHash = sha256(evidenceJson);
          requestHash = semanticRequestHash({
            functionKey: definition.key,
            entityType: job.entityType,
            entityId: job.entityId,
            model: definition.model,
            effort: definition.effort,
            promptVersion: definition.promptVersion,
            schemaVersion: definition.schemaVersion,
            evidenceJson,
          });
          const promptTokens = Math.ceil(Buffer.byteLength(definition.prompt, 'utf8') / 4);
          estimatedRequestTokens = compact.estimatedTokens + promptTokens;
          if (estimatedInputTokens + estimatedRequestTokens > limits.maxEstimatedInputTokensPerRun) {
            store.createArtifact({
              runId,
              snapshotAt: input.snapshotAt,
              bundleId: input.bundleId,
              functionKey: definition.key,
              entityType: job.entityType,
              entityId: job.entityId,
              model: definition.model,
              effort: definition.effort,
              promptVersion: definition.promptVersion,
              schemaVersion: definition.schemaVersion,
              inputHash,
              requestHash,
              inputJson: evidenceJson,
              outputJson: null,
              evidenceRefs: job.evidenceRefs,
              status: 'skipped',
              error: 'Límite estimado de tokens de entrada alcanzado.',
            });
            summary.skipped += 1;
            continue;
          }
          estimatedInputTokens += estimatedRequestTokens;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          firstError ??= message;
          store.createArtifact({
            runId,
            snapshotAt: input.snapshotAt,
            bundleId: input.bundleId,
            functionKey: definition.key,
            entityType: job.entityType,
            entityId: job.entityId,
            model: definition.model,
            effort: definition.effort,
            promptVersion: definition.promptVersion,
            schemaVersion: definition.schemaVersion,
            inputHash: inputHash || sha256('rejected-evidence'),
            requestHash: requestHash || sha256(`${definition.key}:${job.entityType}:${job.entityId}:rejected`),
            inputJson: evidenceJson || '{}',
            outputJson: null,
            evidenceRefs: job.evidenceRefs,
            status: 'invalid',
            error: message,
          });
          summary.failed += 1;
          continue;
        }

        const reusable = store.findReusableArtifact(requestHash);
        if (reusable) {
          let artifactId = reusable.id;
          if (reusable.snapshot_at !== input.snapshotAt) {
            artifactId = store.createArtifact({
              runId,
              snapshotAt: input.snapshotAt,
              bundleId: input.bundleId,
              functionKey: definition.key,
              entityType: job.entityType,
              entityId: job.entityId,
              model: definition.model,
              effort: definition.effort,
              promptVersion: definition.promptVersion,
              schemaVersion: definition.schemaVersion,
              inputHash,
              requestHash,
              inputJson: evidenceJson,
              outputJson: reusable.output_json,
              evidenceRefs: job.evidenceRefs,
              status: 'reused',
              reusedFromArtifactId: reusable.id,
            });
          }
          const reusedOutput = JSON.parse(reusable.output_json);
          const quality = auditAiOutput({
            functionKey: definition.key,
            output: reusedOutput,
            evidence: job.evidence,
            evidenceRefs: job.evidenceRefs,
          });
          store.recordQualityReview({
            artifactId,
            status: quality.status,
            checkVersion: AI_QUALITY_CHECK_VERSION,
            issues: quality.issues,
          });
          if (quality.status === 'blocked') {
            summary.failed += 1;
            firstError ??= quality.issues[0] ?? 'La narrativa reutilizada no superó el control de calidad.';
          } else {
            summary.reused += 1;
            qualityCandidates.push({
              artifactId,
              functionKey: definition.key,
              output: reusedOutput,
              evidence: job.evidence,
              evidenceRefs: job.evidenceRefs,
              outcome: 'reused',
              summary,
            });
          }
          continue;
        }

        if (!provider) {
          const message = 'OPENAI_API_KEY no está configurada; el snapshot determinístico permanece válido.';
          store.createArtifact({
            runId,
            snapshotAt: input.snapshotAt,
            bundleId: input.bundleId,
            functionKey: definition.key,
            entityType: job.entityType,
            entityId: job.entityId,
            model: definition.model,
            effort: definition.effort,
            promptVersion: definition.promptVersion,
            schemaVersion: definition.schemaVersion,
            inputHash,
            requestHash,
            inputJson: evidenceJson,
            outputJson: null,
            evidenceRefs: job.evidenceRefs,
            status: 'skipped',
            error: message,
          });
          firstError ??= message;
          summary.skipped += 1;
          continue;
        }

        const attempts: PendingAttempt[] = [];
        let output: unknown = null;
        let finalStatus: AiArtifactStatus = 'failed';
        let finalError: string | null = null;
        const configuredMaxOutputTokens = Math.min(definition.maxOutputTokens, limits.maxOutputTokensPerRequest);

        for (let attemptNumber = 1; attemptNumber <= limits.maxAttempts; attemptNumber += 1) {
          const estimatedInputCost = estimatedRequestTokens * TERRA_PRICING.inputPerMillion / 1_000_000;
          const remainingBudget = limits.maxEstimatedCostUsdPerRun - estimatedCostUsd - estimatedInputCost;
          const affordableOutputTokens = Math.floor(Math.max(0, remainingBudget) * 1_000_000 / TERRA_PRICING.outputPerMillion);
          const maxOutputTokens = Math.min(configuredMaxOutputTokens, affordableOutputTokens);
          if (maxOutputTokens < 64) {
            finalStatus = 'skipped';
            finalError = `Límite de costo de USD ${limits.maxEstimatedCostUsdPerRun.toFixed(2)} alcanzado.`;
            firstError ??= finalError;
            break;
          }
          const startedAt = Date.now();
          try {
            const response = await provider.analyze({
              functionKey: definition.key,
              model: definition.model,
              effort: definition.effort,
              prompt: definition.prompt,
              promptVersion: definition.promptVersion,
              schemaVersion: definition.schemaVersion,
              schemaName: definition.schemaName,
              schema: definition.schema,
              evidence: job.evidence,
              maxOutputTokens,
              requestHash,
            });
            const cost = estimateAiCost(response.usage);
            addUsage(totalUsage, response.usage);
            estimatedCostUsd += cost;
            const schemaValid = validate(response.output);
            let validationError: string | null = null;
            if (!schemaValid) {
              validationError = `Salida estructuralmente inválida: ${ajv.errorsText(validate.errors).slice(0, 1_000)}`;
            } else {
              const semanticValidation = definition.validateOutput?.(response.output, job, input.snapshot);
              if (semanticValidation?.valid === false) {
                validationError = `Salida semánticamente inválida: ${semanticValidation.error.slice(0, 1_000)}`;
              }
            }
            if (validationError) {
              finalError = validationError;
              attempts.push({
                number: attemptNumber,
                status: 'structural_error',
                responseId: response.responseId,
                usage: response.usage,
                durationMs: response.durationMs,
                cost,
                error: finalError,
              });
              finalStatus = 'invalid';
              if (attemptNumber < limits.maxAttempts) continue;
            } else {
              output = response.output;
              attempts.push({
                number: attemptNumber,
                status: 'success',
                responseId: response.responseId,
                usage: response.usage,
                durationMs: response.durationMs,
                cost,
                error: null,
              });
              finalStatus = 'valid';
              finalError = null;
            }
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const transient = error instanceof AiProviderError && error.transient;
            finalError = message;
            attempts.push({
              number: attemptNumber,
              status: transient ? 'transient_error' : 'provider_error',
              responseId: null,
              usage: emptyUsage(),
              durationMs: Date.now() - startedAt,
              cost: 0,
              error: message,
            });
            if (!transient || attemptNumber >= limits.maxAttempts) break;
          }
        }

        const artifactId = store.createArtifact({
          runId,
          snapshotAt: input.snapshotAt,
          bundleId: input.bundleId,
          functionKey: definition.key,
          entityType: job.entityType,
          entityId: job.entityId,
          model: definition.model,
          effort: definition.effort,
          promptVersion: definition.promptVersion,
          schemaVersion: definition.schemaVersion,
          inputHash,
          requestHash,
          inputJson: evidenceJson,
          outputJson: output == null ? null : JSON.stringify(output),
          evidenceRefs: job.evidenceRefs,
          status: finalStatus,
          error: finalError,
        });
        for (const attempt of attempts) {
          store.recordAttempt(provider.name, {
            artifactId,
            attemptNumber: attempt.number,
            status: attempt.status,
            responseId: attempt.responseId,
            usage: attempt.usage,
            durationMs: attempt.durationMs,
            pricingVersion: TERRA_PRICING.version,
            inputRate: TERRA_PRICING.inputPerMillion,
            cachedInputRate: TERRA_PRICING.cachedInputPerMillion,
            cacheWriteRate: TERRA_PRICING.cacheWritePerMillion,
            outputRate: TERRA_PRICING.outputPerMillion,
            estimatedCostUsd: attempt.cost,
            error: attempt.error,
          });
        }
        if (finalStatus === 'valid') {
          const quality = auditAiOutput({
            functionKey: definition.key,
            output,
            evidence: job.evidence,
            evidenceRefs: job.evidenceRefs,
          });
          store.recordQualityReview({
            artifactId,
            status: quality.status,
            checkVersion: AI_QUALITY_CHECK_VERSION,
            issues: quality.issues,
          });
          if (quality.status === 'blocked') {
            summary.failed += 1;
            firstError ??= quality.issues[0] ?? 'La narrativa no superó el control de calidad.';
          } else {
            summary.completed += 1;
            qualityCandidates.push({
              artifactId,
              functionKey: definition.key,
              output,
              evidence: job.evidence,
              evidenceRefs: job.evidenceRefs,
              outcome: 'completed',
              summary,
            });
          }
        }
        else if (finalStatus === 'skipped') summary.skipped += 1;
        else {
          summary.failed += 1;
          firstError ??= finalError;
        }
      }
    }

    const contradictions = auditNarrativeContradictions(qualityCandidates);
    for (const candidate of qualityCandidates) {
      const issues = contradictions.get(candidate.artifactId);
      if (!issues?.length) continue;
      store.recordQualityReview({
        artifactId: candidate.artifactId,
        status: 'blocked',
        checkVersion: AI_QUALITY_CHECK_VERSION,
        issues,
      });
      candidate.summary[candidate.outcome] = Math.max(0, candidate.summary[candidate.outcome] - 1);
      candidate.summary.failed += 1;
      firstError ??= issues[0];
    }

    const completed = functionSummaries.reduce((sum, item) => sum + item.completed, 0);
    const reused = functionSummaries.reduce((sum, item) => sum + item.reused, 0);
    const failed = functionSummaries.reduce((sum, item) => sum + item.failed, 0);
    const skipped = functionSummaries.reduce((sum, item) => sum + item.skipped, 0);
    store.finishRun(runId, {
      status: statusAfter(functionSummaries),
      functions: functionSummaries,
      entities,
      completed,
      reused,
      failed,
      skipped,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      cachedInputTokens: totalUsage.cachedInputTokens,
      reasoningTokens: totalUsage.reasoningTokens,
      estimatedCostUsd,
      error: firstError,
    });
    return store.runById(runId)!;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.finishRun(runId, {
      status: 'failed',
      functions: functionSummaries,
      entities,
      completed: functionSummaries.reduce((sum, item) => sum + item.completed, 0),
      reused: functionSummaries.reduce((sum, item) => sum + item.reused, 0),
      failed: Math.max(1, functionSummaries.reduce((sum, item) => sum + item.failed, 0)),
      skipped: functionSummaries.reduce((sum, item) => sum + item.skipped, 0),
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      cachedInputTokens: totalUsage.cachedInputTokens,
      reasoningTokens: totalUsage.reasoningTokens,
      estimatedCostUsd,
      error: message,
    });
    throw error;
  } finally {
    if (ownStore) store.close();
  }
}

export function getAiSystemStatus(activeSnapshotAt: string, workspace = process.cwd()): AiSystemStatus {
  const limits = aiLimits();
  const budgetConfig = aiBudget();
  const store = new AiStore();
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const currentMonth = store.usagePeriod(monthStart);
    const spentUsd = currentMonth.estimatedCostUsd;
    const usedPercent = budgetConfig.monthlyLimitUsd
      ? spentUsd / budgetConfig.monthlyLimitUsd * 100
      : 0;
    return {
      configured: Boolean(resolveOpenAiApiKey(workspace)),
      provider: 'openai-responses',
      activeSnapshotAt,
      current: store.currentRun(),
      lastRun: store.lastRun(),
      activeSnapshotRun: store.lastRun(activeSnapshotAt),
      artifactCounts: store.artifactCounts(activeSnapshotAt),
      limits,
      pricing: TERRA_PRICING,
      usage: {
        currentMonth,
        allTime: store.usagePeriod(),
        functions: store.functionUsage(monthStart),
        recentRuns: store.recentRuns(),
      },
      budget: {
        ...budgetConfig,
        spentUsd,
        remainingUsd: Math.max(0, budgetConfig.monthlyLimitUsd - spentUsd),
        usedPercent,
        alert: spentUsd >= budgetConfig.monthlyLimitUsd
          ? 'exceeded'
          : usedPercent >= budgetConfig.warningPercent
            ? 'warning'
            : 'normal',
      },
      quality: store.qualitySummary(activeSnapshotAt),
      feedback: store.feedbackSummary(),
    };
  } finally {
    store.close();
  }
}

export function auditStoredAiArtifacts(snapshotAt: string) {
  const store = new AiStore();
  try {
    const candidates = store.unreviewedArtifacts(snapshotAt, AI_QUALITY_CHECK_VERSION);
    const accepted: AiQualityCandidate[] = [];
    let blocked = 0;
    for (const candidate of candidates) {
      const quality = auditAiOutput(candidate);
      store.recordQualityReview({
        artifactId: candidate.artifactId,
        status: quality.status,
        checkVersion: AI_QUALITY_CHECK_VERSION,
        issues: quality.issues,
      });
      if (quality.status === 'blocked') blocked += 1;
      else accepted.push(candidate);
    }
    const contradictions = auditNarrativeContradictions(accepted);
    for (const [artifactId, issues] of contradictions) {
      store.recordQualityReview({
        artifactId,
        status: 'blocked',
        checkVersion: AI_QUALITY_CHECK_VERSION,
        issues,
      });
    }
    return {
      reviewed: candidates.length,
      blocked: blocked + contradictions.size,
    };
  } finally {
    store.close();
  }
}
