import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiProviderRequest } from '../shared/ai';
import type { DashboardData, Product, VectorKey } from '../shared/models';
import { VECTOR_KEYS } from '../shared/product-vectors';
import { createDemoSnapshot } from './data/demo-snapshot';
import { resolveActiveDataPaths } from './data-bundle';
import { createAiFunctionDefinitions, buildReportEvidence } from './ai-functions';
import { FakeAiProvider } from './ai-provider';
import { runAiEnrichment } from './ai-enrichment';
import { AiStore } from './ai-store';
import { loadSnapshot } from './store';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function testStore() {
  const directory = await mkdtemp(resolve(tmpdir(), 'salice-ai-functions-'));
  directories.push(directory);
  return new AiStore(resolve(directory, 'operations.sqlite'));
}

function vectorOutput(product: Product) {
  return {
    vector: product.vector,
    confidence: product.vectorMeta.confidence,
    evidence: VECTOR_KEYS.filter((key) => product.vector[key] > 0).map((key) => ({
      dimension: key,
      source: 'Señal determinística',
      explanation: product.vectorMeta.evidence[key]?.[0] ?? 'Señal conservada desde el motor auditado.',
    })),
    warnings: ['Clasificación conservadora basada únicamente en los maestros disponibles.'],
    declaredCombinations: {
      species: product.vectorMeta.declaredCombinations?.species ?? '',
      lifeStage: product.vectorMeta.declaredCombinations?.lifeStage ?? '',
      petSize: product.vectorMeta.declaredCombinations?.petSize ?? '',
    },
  };
}

describe('funciones productivas de IA v0.9.x', () => {
  it('crea una línea base y procesa solamente una alta posterior', async () => {
    const store = await testStore();
    const baseline = createDemoSnapshot();
    const baselineDefinitions = createAiFunctionDefinitions({ store, snapshotAt: baseline.meta.generatedAt });
    const productDefinition = baselineDefinitions.find((item) => item.key === 'product_vectorization')!;
    expect(await productDefinition.buildJobs(baseline)).toHaveLength(0);

    const original = baseline.products[0];
    const newProduct: Product = {
      ...original,
      id: 'new-product-v091',
      sku: 'NEW-V091',
      name: `${original.name} ALTA NUEVA`,
    };
    const next: DashboardData = {
      ...baseline,
      meta: { ...baseline.meta, generatedAt: '2026-07-26T12:00:00.000Z' },
      products: [...baseline.products, newProduct],
    };
    const jobs = await productDefinition.buildJobs(next);
    expect(jobs.map((job) => job.entityId)).toEqual([newProduct.id]);

    const provider = new FakeAiProvider(() => vectorOutput(newProduct));
    const result = await runAiEnrichment({
      snapshot: next,
      snapshotAt: next.meta.generatedAt,
      bundleId: 'bundle-new-product',
      trigger: 'manual',
      definitions: [productDefinition],
      provider,
      store,
    });
    expect(result.completed).toBe(1);
    expect(provider.calls).toHaveLength(1);
    expect(store.hasValidProductVectorArtifact(newProduct.id)).toBe(true);
    expect(await productDefinition.buildJobs(next)).toHaveLength(0);
    store.close();
  });

  it('rechaza un candidato que debilita señales fuertes o contradice auditorías existentes', async () => {
    const store = await testStore();
    const snapshot = createDemoSnapshot();
    const product = snapshot.products.find((item) => VECTOR_KEYS.some((key) => item.vector[key] >= 75))!;
    const definition = createAiFunctionDefinitions({ store, snapshotAt: snapshot.meta.generatedAt })
      .find((item) => item.key === 'product_vectorization')!;
    const key = VECTOR_KEYS.find((item) => product.vector[item] >= 75)!;
    const invalid = vectorOutput(product);
    invalid.vector = { ...invalid.vector, [key]: 0 } as Record<VectorKey, number>;
    const validation = definition.validateOutput!(invalid, {
      entityType: 'product',
      entityId: product.id,
      evidence: {},
      evidenceRefs: [],
    }, snapshot);
    expect(validation.valid).toBe(false);
    store.close();
  });

  it('compacta Cuentas no compradoras sin enviar las tablas de cuentas o marcas', () => {
    const evidence = buildReportEvidence('non-buyers', {
      sourceMaxDate: '2026-07-24',
      windows: { from180: '2026-01-26', through: '2026-07-24' },
      accountsSummary: { nonBuyers30: 200, universe90: 770, rate: 26 },
      brandsSummary: { nonBuyers30: 15, universe90: 67, rate: 22 },
      accounts: Array.from({ length: 900 }, (_, index) => ({ name: `Cuenta sensible ${index}` })),
      brands: Array.from({ length: 80 }, (_, index) => ({ name: `Marca ${index}` })),
      accountSellers: [{ seller: 'Vendedor A', nonBuyers30: 40 }],
      brandSellers: [{ seller: 'Vendedor A', nonBuyers30: 4 }],
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('Cuenta sensible');
    expect(serialized.length).toBeLessThan(8_000);
  });

  it('exige referencias internas válidas en narrativas y prohíbe un puntaje ejecutivo general', async () => {
    const store = await testStore();
    const definitions = createAiFunctionDefinitions({ store, snapshotAt: '2026-07-24T00:00:00.000Z' });
    const report = definitions.find((item) => item.key === 'report_narrative')!;
    const reportValidation = report.validateOutput!({
      title: 'Lectura',
      currentState: 'Estado',
      findings: [{ text: 'Hallazgo', evidenceIds: ['inventada'] }],
      drivers: [{ text: 'Impulsor', evidenceIds: ['real'] }],
      reviewItems: [],
      limitations: ['Limitación'],
      faqs: [{ question: '¿Qué pasó?', answer: 'Respuesta', evidenceIds: ['real'] }],
    }, { entityType: 'report', entityId: 'general', evidence: {}, evidenceRefs: ['real'] }, {});
    expect(reportValidation.valid).toBe(false);

    const executive = definitions.find((item) => item.key === 'executive_summary')!;
    const executiveValidation = executive.validateOutput!({
      currentState: 'El semáforo general es verde.',
      keyIssues: [{ text: 'Asunto', evidenceIds: ['real'] }],
      favorableIndicators: [{ text: 'Favorable', evidenceIds: ['real'] }],
      reviewItems: [{ text: 'Revisión', evidenceIds: ['real'] }],
      limitations: ['Limitación'],
      faqs: [{ question: '¿Cómo?', answer: 'Así', evidenceIds: ['real'] }],
    }, { entityType: 'executive', entityId: 'how-are-we', evidence: {}, evidenceRefs: ['real'] }, {});
    expect(executiveValidation.valid).toBe(false);
    store.close();
  });
});

const paths = resolveActiveDataPaths();
const describeWithReports = existsSync(paths.commercial) && existsSync(paths.pendingBalances) ? describe : describe.skip;

describeWithReports('paquetes reales compactos de los ocho reportes', () => {
  it('construye exactamente ocho trabajos y cada paquete queda bajo el límite por entidad', async () => {
    const store = await testStore();
    const definition = createAiFunctionDefinitions({ store, snapshotAt: '2026-07-24T00:00:00.000Z' })
      .find((item) => item.key === 'report_narrative')!;
    const jobs = await definition.buildJobs({});
    expect(jobs.map((job) => job.entityId).sort()).toEqual([
      'baires',
      'commercial-sales',
      'general',
      'mars',
      'non-buyers',
      'nutripet',
      'pending-balances',
      'spt',
    ]);
    jobs.forEach((job) => expect(Buffer.byteLength(JSON.stringify(job.evidence))).toBeLessThan(24_000));
    store.close();
  }, 30_000);

  it('completa las cuatro funciones visibles con proveedor falso y sin red', async () => {
    const store = await testStore();
    const snapshot = await loadSnapshot();
    const definitions = createAiFunctionDefinitions({ store, snapshotAt: snapshot.meta.generatedAt });
    const ids = (value: unknown, found: string[] = []): string[] => {
      if (!value || typeof value !== 'object') return found;
      if (Array.isArray(value)) {
        value.forEach((item) => ids(item, found));
        return found;
      }
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        if (key === 'id' && typeof child === 'string') found.push(child);
        else ids(child, found);
      });
      return found;
    };
    const provider = new FakeAiProvider((request: AiProviderRequest) => {
      const evidence = request.evidence as Record<string, any>;
      const refs = ids(evidence);
      const ref = refs[0];
      if (request.functionKey === 'report_narrative') return {
        title: `Lectura ${evidence.reportLabel}`,
        currentState: 'Estado calculado desde el paquete recibido.',
        findings: [
          { text: 'Primer hallazgo verificable.', evidenceIds: [ref] },
          { text: 'Segundo hallazgo verificable.', evidenceIds: [ref] },
        ],
        drivers: [{ text: 'Impulsor verificable.', evidenceIds: [ref] }],
        reviewItems: [],
        limitations: ['Lectura descriptiva; no recalcula cifras.'],
        faqs: [
          { question: '¿Qué período usa?', answer: evidence.period, evidenceIds: [ref] },
          { question: '¿Es una predicción?', answer: 'No.', evidenceIds: [ref] },
        ],
      };
      if (request.functionKey === 'executive_summary') return {
        currentState: 'Lectura compacta sin combinar universos.',
        keyIssues: [{ text: 'Asunto principal.', evidenceIds: [ref] }],
        favorableIndicators: [{ text: 'Indicador favorable.', evidenceIds: [ref] }],
        reviewItems: [{ text: 'Aspecto para revisar.', evidenceIds: [ref] }],
        limitations: ['Cada bloque conserva su universo.'],
        faqs: [
          { question: '¿Suma universos?', answer: 'No.', evidenceIds: [ref] },
          { question: '¿Crea tareas?', answer: 'No.', evidenceIds: [ref] },
        ],
      };
      if (request.functionKey === 'commercial_inbox_explanation') return {
        items: evidence.clients.map((client: Record<string, any>) => {
          const clientRefs = ids(client);
          return {
            clientId: client.clientId,
            primaryReason: client.signals[0]?.label ?? 'Revisión determinística',
            secondaryReasons: [],
            explanation: 'Explicación basada en C, O y P separados.',
            evidenceIds: [clientRefs[0]],
            commercialOpportunity: client.eligibleForOpportunity && client.opportunities.length
              ? `Oportunidad existente: ${client.opportunities[0].product}`
              : '',
            caution: 'No representa una tarea ni una oferta realizada.',
          };
        }),
      };
      if (request.functionKey === 'seller_summary') return {
        items: evidence.sellers.map((seller: Record<string, any>) => ({
          seller: seller.seller,
          summary: 'Resumen agregado de la cartera activa.',
          portfolioSignals: [{ text: 'Señal agregada.', evidenceIds: [seller.refs[0]] }],
          reviewItems: [],
          limitations: ['No evalúa productividad.'],
        })),
      };
      throw new Error(`Función inesperada: ${request.functionKey}`);
    });
    const run = await runAiEnrichment({
      snapshot,
      snapshotAt: snapshot.meta.generatedAt,
      bundleId: 'fake-full-v094',
      trigger: 'manual',
      definitions,
      provider,
      store,
    });
    expect(run.status).toBe('completed');
    expect(run.failed).toBe(0);
    expect(new Set(provider.calls.map((call) => call.functionKey))).toEqual(new Set([
      'report_narrative',
      'executive_summary',
      'commercial_inbox_explanation',
      'seller_summary',
    ]));
    expect(store.listArtifacts({ functionKey: 'report_narrative', snapshotAt: snapshot.meta.generatedAt })).toHaveLength(8);
    store.close();
  }, 30_000);
});
