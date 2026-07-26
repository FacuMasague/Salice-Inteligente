import Ajv from 'ajv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { AiReasoningEffort } from '../shared/ai.js';
import { estimateAiCost, resolveOpenAiApiKey } from '../server/ai-config.js';
import { semanticRequestHash, canonicalJson } from '../server/ai-evidence.js';
import { createAiFunctionDefinitions } from '../server/ai-functions.js';
import { OpenAiResponsesProvider } from '../server/ai-provider.js';
import { AiStore } from '../server/ai-store.js';
import { loadSnapshot } from '../server/store.js';

const workspace = process.cwd();
const outputPath = resolve(workspace, 'data/quality/ai-commercial-effort-evaluation.json');
const apiKey = resolveOpenAiApiKey(workspace);
if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada.');

const snapshot = await loadSnapshot();
const store = new AiStore();
const definition = createAiFunctionDefinitions({
  store,
  snapshotAt: snapshot.meta.generatedAt,
}).find((item) => item.key === 'commercial_inbox_explanation')!;
const job = (await definition.buildJobs(snapshot))[0];
if (!job) throw new Error('No existe un lote de bandeja elegible para comparar.');

const provider = new OpenAiResponsesProvider(apiKey);
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(definition.schema);

async function evaluate(effort: AiReasoningEffort) {
  const requestHash = semanticRequestHash({
    functionKey: definition.key,
    entityType: job.entityType,
    entityId: job.entityId,
    model: definition.model,
    effort,
    promptVersion: definition.promptVersion,
    schemaVersion: definition.schemaVersion,
    evidenceJson: canonicalJson(job.evidence),
  });
  const response = await provider.analyze({
    functionKey: definition.key,
    model: definition.model,
    effort,
    prompt: definition.prompt,
    promptVersion: definition.promptVersion,
    schemaVersion: definition.schemaVersion,
    schemaName: definition.schemaName,
    schema: definition.schema,
    evidence: job.evidence,
    maxOutputTokens: definition.maxOutputTokens,
    requestHash,
  });
  const structural = Boolean(validateSchema(response.output));
  const semantic = structural
    ? definition.validateOutput?.(response.output, job, snapshot) ?? { valid: true as const }
    : { valid: false as const, error: ajv.errorsText(validateSchema.errors) };
  const items = Array.isArray((response.output as { items?: unknown[] }).items)
    ? (response.output as { items: Array<Record<string, unknown>> }).items
    : [];
  return {
    effort,
    structuralValid: structural,
    semanticValid: semantic.valid,
    error: semantic.valid ? null : semantic.error,
    items: items.length,
    averageExplanationCharacters: items.length
      ? Math.round(items.reduce((sum, item) => sum + String(item.explanation ?? '').length, 0) / items.length)
      : 0,
    citedEvidence: items.reduce((sum, item) => sum + (Array.isArray(item.evidenceIds) ? item.evidenceIds.length : 0), 0),
    usage: response.usage,
    durationMs: response.durationMs,
    estimatedCostUsd: estimateAiCost(response.usage),
  };
}

try {
  const results = [];
  for (const effort of ['low', 'medium'] as const) results.push(await evaluate(effort));
  const low = results[0];
  const medium = results[1];
  const recommendation = low.structuralValid && low.semanticValid && low.items === medium.items
    ? 'low'
    : 'medium';
  const report = {
    generatedAt: new Date().toISOString(),
    snapshotAt: snapshot.meta.generatedAt,
    functionKey: definition.key,
    batchId: job.entityId,
    entities: Array.isArray((job.evidence as { clients?: unknown[] }).clients)
      ? (job.evidence as { clients: unknown[] }).clients.length
      : 0,
    results,
    recommendation,
    rationale: recommendation === 'low'
      ? 'Low cumplió el mismo contrato estructural y semántico del lote; se conserva por costo.'
      : 'Low no alcanzó el contrato del lote; se requiere Medium.',
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (recommendation !== 'low') process.exitCode = 1;
} finally {
  store.close();
}
