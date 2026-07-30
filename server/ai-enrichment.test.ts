import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiFunctionDefinition, AiProvider } from '../shared/ai';
import { FakeAiProvider, AiProviderError } from './ai-provider';
import { argentinaDayStartIso, argentinaMonthStartIso, runAiEnrichment } from './ai-enrichment';
import { aiLimits } from './ai-config';
import { AiStore } from './ai-store';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: { summary: { type: 'string' } },
  required: ['summary'],
};

function definition(evidence: unknown = { netSales: 1250 }): AiFunctionDefinition {
  return {
    key: 'report_narrative',
    model: 'gpt-5.6-terra',
    effort: 'medium',
    prompt: 'Describí sólo la evidencia recibida.',
    promptVersion: 1,
    schemaVersion: 1,
    schemaName: 'salice_test_summary',
    schema,
    maxOutputTokens: 120,
    buildJobs: () => [{ entityType: 'report', entityId: 'general', evidence, evidenceRefs: ['metric:net-sales'] }],
  };
}

async function testStore() {
  const directory = await mkdtemp(resolve(tmpdir(), 'salice-ai-'));
  directories.push(directory);
  return new AiStore(resolve(directory, 'operations.sqlite'));
}

describe('orquestador de enriquecimiento IA', () => {
  it('corta día y mes con la zona horaria de Argentina', () => {
    expect(argentinaDayStartIso(new Date('2026-07-30T02:59:59.000Z'))).toBe('2026-07-29T03:00:00.000Z');
    expect(argentinaDayStartIso(new Date('2026-07-30T03:00:00.000Z'))).toBe('2026-07-30T03:00:00.000Z');
    expect(argentinaMonthStartIso(new Date('2026-08-01T02:59:59.000Z'))).toBe('2026-07-01T03:00:00.000Z');
  });

  it('no consume proveedor cuando v0.9.0 todavía no tiene funciones habilitadas', async () => {
    const store = await testStore();
    const provider = new FakeAiProvider({ summary: 'No debe ejecutarse.' });
    const run = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-1',
      trigger: 'manual',
      definitions: [],
      provider,
      store,
    });
    expect(run.status).toBe('skipped');
    expect(provider.calls).toHaveLength(0);
    store.close();
  });

  it('reutiliza por hash la misma entrada semántica en otro snapshot', async () => {
    const store = await testStore();
    const provider = new FakeAiProvider({ summary: 'Ventas estables.' });
    const first = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-1',
      trigger: 'manual',
      definitions: [definition()],
      provider,
      store,
    });
    const second = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-25T16:19:50.818Z',
      bundleId: 'bundle-2',
      trigger: 'manual',
      definitions: [definition()],
      provider,
      store,
    });
    expect(first.completed).toBe(1);
    expect(second.reused).toBe(1);
    expect(provider.calls).toHaveLength(1);
    const repeated = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-25T16:19:50.818Z',
      bundleId: 'bundle-2',
      trigger: 'manual',
      definitions: [definition()],
      provider,
      store,
    });
    expect(repeated.reused).toBe(1);
    expect(provider.calls).toHaveLength(1);

    const changed = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-25T18:19:50.818Z',
      bundleId: 'bundle-3',
      trigger: 'refresh',
      definitions: [definition({ netSales: 1_300 })],
      provider,
      store,
    });
    expect(changed.completed).toBe(1);
    expect(provider.calls).toHaveLength(2);
    store.close();
  });

  it('reintenta una sola vez una salida estructural inválida y registra ambos intentos', async () => {
    const store = await testStore();
    let invocation = 0;
    const provider = new FakeAiProvider(() => (++invocation === 1 ? { wrong: true } : { summary: 'Salida válida.' }));
    const run = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-1',
      trigger: 'manual',
      definitions: [definition()],
      provider,
      store,
    });
    expect(run.status).toBe('completed');
    expect(run.completed).toBe(1);
    expect(provider.calls).toHaveLength(2);
    store.close();
  });

  it('reintenta una salida estructurada que el control de calidad bloquea', async () => {
    const store = await testStore();
    let invocation = 0;
    const qualityDefinition: AiFunctionDefinition = {
      ...definition({
        reportId: 'general',
        period: '2026-07-01 — 2026-07-27',
        universe: 'Universo sintético',
        partial: true,
        metrics: [{ id: 'metric:net-sales', label: 'Venta neta', value: 1_250, unit: 'ARS' }],
      }),
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          finding: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'evidenceIds'],
          },
        },
        required: ['finding'],
      },
    };
    const provider = new FakeAiProvider(() => ({
      finding: {
        text: 'La venta neta asciende a 1.250 ARS.',
        evidenceIds: ++invocation === 1 ? [] : ['metric:net-sales'],
      },
    }));
    const run = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-quality-retry',
      trigger: 'manual',
      definitions: [qualityDefinition],
      provider,
      store,
    });
    expect(run.status).toBe('completed');
    expect(run.completed).toBe(1);
    expect(provider.calls).toHaveLength(2);
    store.close();
  });

  it('aísla una falla del proveedor y conserva un resultado auditable sin lanzar la excepción', async () => {
    const store = await testStore();
    const provider: AiProvider = {
      name: 'failing',
      analyze: async () => { throw new AiProviderError('Proveedor temporalmente fuera de servicio.', true, 503); },
    };
    const run = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-1',
      trigger: 'refresh',
      definitions: [definition()],
      provider,
      store,
    });
    expect(run.status).toBe('failed');
    expect(run.failed).toBe(1);
    expect(run.error).toMatch(/fuera de servicio/);
    store.close();
  });

  it('aísla una versión de prompt incompatible y continúa con las demás funciones', async () => {
    const store = await testStore();
    const provider = new FakeAiProvider({ summary: 'Salida válida.' });
    await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-prompt-original',
      trigger: 'manual',
      definitions: [definition()],
      provider,
      store,
    });
    const incompatible = { ...definition({ netSales: 1_300 }), model: 'gpt-5.6-luna' };
    const independent: AiFunctionDefinition = {
      ...definition({ netSales: 1_500 }),
      key: 'executive_summary',
      promptVersion: 2,
    };
    const run = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-25T16:19:50.818Z',
      bundleId: 'bundle-prompt-conflict',
      trigger: 'refresh',
      definitions: [incompatible, independent],
      provider,
      store,
    });
    expect(run.status).toBe('partial');
    expect(run.failed).toBe(1);
    expect(run.completed).toBe(1);
    expect(run.error).toMatch(/ya existe con otro contenido o configuración/);
    expect(provider.calls.at(-1)?.functionKey).toBe('executive_summary');
    store.close();
  });

  it('rechaza evidencia sensible antes de invocar al proveedor', async () => {
    const store = await testStore();
    const provider = new FakeAiProvider({ summary: 'No debe ejecutarse.' });
    const run = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-1',
      trigger: 'manual',
      definitions: [definition({ metrics: { netSales: 1 }, telefono: '223...' })],
      provider,
      store,
    });
    expect(run.failed).toBe(1);
    expect(provider.calls).toHaveLength(0);
    store.close();
  });

  it('aplica un techo monetario antes de iniciar una solicitud que podría excederlo', async () => {
    const store = await testStore();
    const provider = new FakeAiProvider({ summary: 'No debe ejecutarse.' });
    const run = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-cost-cap',
      trigger: 'manual',
      definitions: [definition()],
      provider,
      store,
      limits: {
        ...aiLimits({}),
        maxEstimatedCostUsdPerRun: 0.0001,
      },
    });
    expect(run.status).toBe('skipped');
    expect(run.skipped).toBe(1);
    expect(provider.calls).toHaveLength(0);
    expect(run.error).toMatch(/Límite de costo/);
    store.close();
  });

  it('comparte el límite diario entre ejecuciones de la mañana y de la tarde', async () => {
    const store = await testStore();
    const expensive = new FakeAiProvider({ summary: 'Consume el presupuesto diario.' }, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T16:19:50.818Z',
      bundleId: 'bundle-daily-first',
      trigger: 'refresh',
      definitions: [definition()],
      provider: expensive,
      store,
    });
    const secondProvider = new FakeAiProvider({ summary: 'No debe ejecutarse.' });
    const second = await runAiEnrichment({
      snapshot: {},
      snapshotAt: '2026-07-24T18:19:50.818Z',
      bundleId: 'bundle-daily-second',
      trigger: 'refresh',
      definitions: [definition({ netSales: 1_500 })],
      provider: secondProvider,
      store,
    });
    expect(second.status).toBe('skipped');
    expect(second.error).toMatch(/Límite diario/);
    expect(secondProvider.calls).toHaveLength(0);
    store.close();
  });
});
