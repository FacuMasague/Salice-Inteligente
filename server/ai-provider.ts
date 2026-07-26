import OpenAI from 'openai';
import type { AiProvider, AiProviderRequest, AiProviderResponse, AiUsage } from '../shared/ai.js';

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
    public readonly status: number | null = null,
  ) {
    super(message);
  }
}

export class OpenAiResponsesProvider implements AiProvider {
  readonly name = 'openai-responses';
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 120_000 });
  }

  async analyze(request: AiProviderRequest): Promise<AiProviderResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.client.responses.create({
        model: request.model,
        reasoning: { effort: request.effort },
        instructions: request.prompt,
        input: JSON.stringify(request.evidence),
        max_output_tokens: request.maxOutputTokens,
        store: false,
        service_tier: 'default',
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: request.schemaName,
            schema: request.schema,
            strict: true,
          },
        },
        metadata: {
          function: request.functionKey,
          prompt_version: String(request.promptVersion),
          schema_version: String(request.schemaVersion),
          request_hash: request.requestHash.slice(0, 64),
        },
      });
      if (response.status !== 'completed') {
        throw new AiProviderError(`OpenAI devolvió estado ${response.status}.`, response.status === 'incomplete');
      }
      if (!response.output_text) throw new AiProviderError('OpenAI no devolvió texto estructurado.', false);
      let output: unknown;
      try {
        output = JSON.parse(response.output_text);
      } catch {
        throw new AiProviderError('OpenAI devolvió una salida que no es JSON válido.', false);
      }
      const usage: AiUsage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        cacheWriteTokens: response.usage?.input_tokens_details?.cache_write_tokens ?? 0,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      };
      return { responseId: response.id, output, usage, durationMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
      const transient = status === 408 || status === 409 || status === 429 || Boolean(status && status >= 500);
      throw new AiProviderError(error instanceof Error ? error.message : String(error), transient, status);
    }
  }
}

export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  readonly calls: AiProviderRequest[] = [];

  constructor(
    private readonly result: unknown | ((request: AiProviderRequest) => unknown),
    private readonly usage: Partial<AiUsage> = {},
  ) {}

  async analyze(request: AiProviderRequest): Promise<AiProviderResponse> {
    this.calls.push(request);
    return {
      responseId: `fake-${this.calls.length}`,
      output: typeof this.result === 'function' ? this.result(request) : this.result,
      durationMs: 1,
      usage: {
        inputTokens: this.usage.inputTokens ?? 20,
        outputTokens: this.usage.outputTokens ?? 10,
        cachedInputTokens: this.usage.cachedInputTokens ?? 0,
        cacheWriteTokens: this.usage.cacheWriteTokens ?? 0,
        reasoningTokens: this.usage.reasoningTokens ?? 0,
        totalTokens: this.usage.totalTokens ?? 30,
      },
    };
  }
}
