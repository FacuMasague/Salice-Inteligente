import { describe, expect, it } from 'vitest';
import { estimateAiCost, LUNA_PRICING, pricingForModel, SOL_PRICING, TERRA_PRICING } from './ai-config';
import { createAiFunctionDefinitions } from './ai-functions';
import type { AiStore } from './ai-store';

describe('enrutamiento y costo de IA v1.3', () => {
  it('asigna modelo, razonamiento y una nueva versión inmutable a cada función', () => {
    const definitions = createAiFunctionDefinitions({ store: {} as AiStore, snapshotAt: '2026-07-29T12:00:00.000Z' });
    const routing = Object.fromEntries(definitions.map((definition) => [definition.key, {
      model: definition.model,
      effort: definition.effort,
      promptVersion: definition.promptVersion,
    }]));
    expect(routing).toMatchObject({
      product_vectorization: { model: 'gpt-5.6-terra', effort: 'medium', promptVersion: 2 },
      report_narrative: { model: 'gpt-5.6-terra', effort: 'low', promptVersion: 4 },
      executive_summary: { model: 'gpt-5.6-sol', effort: 'low', promptVersion: 4 },
      commercial_inbox_explanation: { model: 'gpt-5.6-luna', effort: 'low', promptVersion: 5 },
      seller_summary: { model: 'gpt-5.6-luna', effort: 'low', promptVersion: 6 },
      commercial_daily_brief: { model: 'gpt-5.6-terra', effort: 'low', promptVersion: 2 },
      product_demand_brief: { model: 'gpt-5.6-terra', effort: 'low', promptVersion: 1 },
    });
  });

  it('calcula cada intento con la tarifa del modelo realmente utilizado', () => {
    expect(pricingForModel('gpt-5.6-sol')).toBe(SOL_PRICING);
    expect(pricingForModel('gpt-5.6-luna')).toBe(LUNA_PRICING);
    expect(pricingForModel('gpt-5.6-terra')).toBe(TERRA_PRICING);
    expect(() => pricingForModel('modelo-desconocido')).toThrow(/tarifa de IA/);
    expect(estimateAiCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1_000_000,
    }, LUNA_PRICING)).toBe(7);
  });
});
