import { describe, expect, it } from 'vitest';
import { estimateAiCost, LUNA_PRICING, pricingForModel, TERRA_PRICING } from './ai-config';
import { createAiFunctionDefinitions } from './ai-functions';
import type { AiStore } from './ai-store';

describe('enrutamiento y costo de IA v1.2', () => {
  it('usa Luna en tareas estructuradas de alto volumen y Terra en lecturas complejas', () => {
    const definitions = createAiFunctionDefinitions({ store: {} as AiStore, snapshotAt: '2026-07-29T12:00:00.000Z' });
    const models = Object.fromEntries(definitions.map((definition) => [definition.key, definition.model]));
    expect(models).toMatchObject({
      product_vectorization: 'gpt-5.6-luna',
      commercial_inbox_explanation: 'gpt-5.6-luna',
      seller_summary: 'gpt-5.6-luna',
      report_narrative: 'gpt-5.6-terra',
      executive_summary: 'gpt-5.6-terra',
    });
  });

  it('calcula cada intento con la tarifa del modelo realmente utilizado', () => {
    expect(pricingForModel('gpt-5.6-luna')).toBe(LUNA_PRICING);
    expect(pricingForModel('gpt-5.6-terra')).toBe(TERRA_PRICING);
    expect(estimateAiCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1_000_000,
    }, LUNA_PRICING)).toBe(7);
  });
});
