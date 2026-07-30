import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import type { AiLimits, AiPricing } from '../shared/ai.js';

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function positiveNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export const TERRA_PRICING: AiPricing = {
  version: 'gpt-5.6-terra-2026-07-25',
  currency: 'USD',
  inputPerMillion: 2.5,
  cachedInputPerMillion: 0.25,
  cacheWritePerMillion: 3.125,
  outputPerMillion: 15,
};

export const SOL_PRICING: AiPricing = {
  version: 'gpt-5.6-sol-2026-07-30',
  currency: 'USD',
  inputPerMillion: 5,
  cachedInputPerMillion: 0.5,
  cacheWritePerMillion: 6.25,
  outputPerMillion: 30,
};

export const LUNA_PRICING: AiPricing = {
  version: 'gpt-5.6-luna-2026-07-29',
  currency: 'USD',
  inputPerMillion: 1,
  cachedInputPerMillion: 0.1,
  cacheWritePerMillion: 1.25,
  outputPerMillion: 6,
};

export function pricingForModel(model: string) {
  if (model === 'gpt-5.6-sol') return SOL_PRICING;
  if (model === 'gpt-5.6-terra') return TERRA_PRICING;
  if (model === 'gpt-5.6-luna') return LUNA_PRICING;
  throw new Error(`No hay una tarifa de IA registrada para el modelo ${model}.`);
}

export function aiLimits(environment: NodeJS.ProcessEnv = process.env): AiLimits {
  return {
    maxEntitiesPerFunction: positiveInteger(environment.SALICE_AI_MAX_ENTITIES_PER_FUNCTION, 100, 1, 10_000),
    maxEntitiesPerRun: positiveInteger(environment.SALICE_AI_MAX_ENTITIES_PER_RUN, 250, 1, 25_000),
    maxInputBytesPerEntity: positiveInteger(environment.SALICE_AI_MAX_INPUT_BYTES_PER_ENTITY, 24_000, 1_000, 250_000),
    maxEstimatedInputTokensPerRun: positiveInteger(environment.SALICE_AI_MAX_INPUT_TOKENS_PER_RUN, 120_000, 1_000, 5_000_000),
    maxOutputTokensPerRequest: positiveInteger(environment.SALICE_AI_MAX_OUTPUT_TOKENS_PER_REQUEST, 2_500, 64, 32_000),
    maxEstimatedCostUsdPerRun: positiveNumber(environment.SALICE_AI_MAX_COST_USD_PER_RUN, 1, 0.01, 1_000),
    maxEstimatedCostUsdPerDay: positiveNumber(environment.SALICE_AI_DAILY_BUDGET_USD, 1, 0.01, 1_000),
    maxAttempts: positiveInteger(environment.SALICE_AI_MAX_ATTEMPTS, 2, 1, 2) as 1 | 2,
  };
}

export function aiBudget(environment: NodeJS.ProcessEnv = process.env) {
  return {
    dailyLimitUsd: positiveNumber(environment.SALICE_AI_DAILY_BUDGET_USD, 1, 0.01, 1_000),
    monthlyLimitUsd: positiveNumber(environment.SALICE_AI_MONTHLY_BUDGET_USD, 30, 1, 100_000),
    warningPercent: positiveInteger(environment.SALICE_AI_MONTHLY_BUDGET_WARNING_PERCENT, 80, 1, 100),
  };
}

export function estimateAiCost(usage: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens?: number;
}, pricing = TERRA_PRICING) {
  const cacheWrites = Math.max(0, usage.cacheWriteTokens ?? 0);
  const cached = Math.max(0, usage.cachedInputTokens);
  const regular = Math.max(0, usage.inputTokens - cached - cacheWrites);
  return (
    regular * pricing.inputPerMillion
    + cached * pricing.cachedInputPerMillion
    + cacheWrites * pricing.cacheWritePerMillion
    + Math.max(0, usage.outputTokens) * pricing.outputPerMillion
  ) / 1_000_000;
}

export function resolveOpenAiApiKey(workspace = process.cwd(), environment: NodeJS.ProcessEnv = process.env) {
  const file = resolve(workspace, '.env');
  if (existsSync(file)) {
    const fromFile = dotenv.parse(readFileSync(file, 'utf8')).OPENAI_API_KEY?.trim();
    if (fromFile) return fromFile;
  }
  return environment.OPENAI_API_KEY?.trim() || '';
}
