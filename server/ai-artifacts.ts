import type {
  AiCommercialExplanation,
  AiExecutiveBrief,
  AiOperationalBrief,
  AiReportNarrative,
  AiSellerSummary,
  AiStoredArtifact,
} from '../shared/ai.js';
import type {
  CommercialInboxPayload,
  DashboardData,
  ExecutiveSummaryPayload,
  VectorKey,
} from '../shared/models.js';
import { VECTOR_KEYS } from '../shared/product-vectors.js';
import {
  executiveBriefHash,
  reportNarrativeHash,
  type AiReportId,
} from './ai-functions.js';
import { AiStore } from './ai-store.js';

interface ProductVectorOutput {
  vector: Record<VectorKey, number>;
  confidence: number;
  evidence: Array<{ dimension: VectorKey; source: string; explanation: string }>;
  warnings: string[];
  declaredCombinations: {
    species: string;
    lifeStage: string;
    petSize: string;
  };
}

function withStore<T>(action: (store: AiStore) => T) {
  const store = new AiStore();
  try {
    return action(store);
  } finally {
    store.close();
  }
}

export function applyAiProductVectors(snapshot: DashboardData): DashboardData {
  return withStore((store) => ({
    ...snapshot,
    products: snapshot.products.map((product) => {
      const artifact = store.latestArtifact<ProductVectorOutput>({
        functionKey: 'product_vectorization',
        entityType: 'product',
        entityId: product.id,
      });
      if (!artifact) return product;
      const evidence = Object.fromEntries(VECTOR_KEYS.map((key) => [
        key,
        artifact.output.evidence
          .filter((item) => item.dimension === key)
          .map((item) => `IA auditable · ${item.source}: ${item.explanation}`)
          .slice(0, 4),
      ]).filter(([, values]) => (values as string[]).length)) as Partial<Record<VectorKey, string[]>>;
      const declaredCombinations = Object.fromEntries(
        Object.entries(artifact.output.declaredCombinations)
          .filter(([, value]) => value.trim()),
      );
      return {
        ...product,
        vector: artifact.output.vector,
        vectorMeta: {
          ...product.vectorMeta,
          confidence: artifact.output.confidence,
          evidence,
          declaredCombinations,
        },
      };
    }),
  }));
}

export function getReportNarrative(
  reportId: AiReportId,
  payload: unknown,
  snapshotAt: string,
): AiStoredArtifact<AiReportNarrative> | null {
  return withStore((store) => store.latestArtifact<AiReportNarrative>({
    functionKey: 'report_narrative',
    entityType: 'report',
    entityId: reportId,
    snapshotAt,
    inputHash: reportNarrativeHash(reportId, payload),
  }));
}

export function getExecutiveBrief(
  payload: ExecutiveSummaryPayload,
): AiStoredArtifact<AiExecutiveBrief> | null {
  return withStore((store) => store.latestArtifact<AiExecutiveBrief>({
    functionKey: 'executive_summary',
    entityType: 'executive',
    entityId: 'how-are-we',
    snapshotAt: payload.snapshotAt,
    inputHash: executiveBriefHash(payload),
  }));
}

export function attachCommercialExplanations(
  payload: CommercialInboxPayload,
  snapshotAt: string,
): CommercialInboxPayload {
  return withStore((store) => {
    const artifacts = store.listArtifacts<{ items: AiCommercialExplanation[] }>({
      functionKey: 'commercial_inbox_explanation',
    });
    const byClient = new Map<number, AiStoredArtifact<AiCommercialExplanation>>();
    artifacts.forEach((artifact) => artifact.output.items.forEach((item) => {
      if (byClient.has(item.clientId)) return;
      byClient.set(item.clientId, {
        ...artifact,
        entityType: 'client',
        entityId: String(item.clientId),
        output: item,
      });
    }));
    return {
      ...payload,
      entries: payload.entries.map((entry) => ({
        ...entry,
        aiExplanation: byClient.get(entry.clientId) ?? null,
      })),
    };
  });
}

export function getCommercialExplanation(clientId: number) {
  return withStore((store) => {
    const artifacts = store.listArtifacts<{ items: AiCommercialExplanation[] }>({
      functionKey: 'commercial_inbox_explanation',
    });
    for (const artifact of artifacts) {
      const item = artifact.output.items.find((candidate) => candidate.clientId === clientId);
      if (item) {
        return {
          ...artifact,
          entityType: 'client',
          entityId: String(clientId),
          output: item,
        } satisfies AiStoredArtifact<AiCommercialExplanation>;
      }
    }
    return null;
  });
}

export function getSellerSummaries(snapshotAt: string) {
  return withStore((store) => {
    const artifacts = store.listArtifacts<{ items: AiSellerSummary[] }>({
      functionKey: 'seller_summary',
      snapshotAt,
    });
    const bySeller = new Map<string, AiStoredArtifact<AiSellerSummary>>();
    artifacts.forEach((artifact) => artifact.output.items.forEach((item) => {
      if (bySeller.has(item.seller)) return;
      bySeller.set(item.seller, {
        ...artifact,
        entityType: 'seller',
        entityId: item.seller,
        output: item,
      });
    }));
    return [...bySeller.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, 'es'));
  });
}

export function getOperationalBrief(
  functionKey: 'commercial_daily_brief' | 'product_demand_brief',
  snapshotAt: string,
) {
  return withStore((store) => store.listArtifacts<AiOperationalBrief>({
    functionKey,
    snapshotAt,
  })[0] ?? null);
}
