import type { ChatMessage, ChatOptions, ChatResponse } from './deepseek.js';
import { estimateCostUsd } from './pricing.js';

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
}

export function openrouterConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OpenRouterConfig | null {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    model: env.OPENROUTER_MODEL ?? 'qwen/qwen3.7-max',
    maxRetries: Number(env.OPENROUTER_MAX_RETRIES ?? 8),
    timeoutMs: Number(env.OPENROUTER_TIMEOUT_MS ?? 180000),
    reasoningEffort: (env.OPENROUTER_REASONING_EFFORT as OpenRouterConfig['reasoningEffort'] | undefined) ?? 'none',
  };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

export class OpenRouterClient {
  constructor(private readonly config: OpenRouterConfig) {}

  get defaultModel(): string {
    return this.config.model;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    const started = Date.now();
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(30000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
        await sleep(backoff);
      }
      try {
        const res = await this.singleAttempt(messages, opts);
        return { ...res, latencyMs: Date.now() - started };
      } catch (err) {
        lastError = err;
        if (err instanceof OpenRouterError && !err.retriable) throw err;
        if (attempt === this.config.maxRetries) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async singleAttempt(messages: ChatMessage[], opts: ChatOptions): Promise<Omit<ChatResponse, 'latencyMs'>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      reasoning: { effort: this.config.reasoningEffort },
    };
    if (typeof opts.temperature === 'number') body.temperature = opts.temperature;
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
      body.tool_choice = opts.toolChoice ?? 'auto';
    }
    if (opts.responseFormat === 'json') body.response_format = { type: 'json_object' };

    try {
      const resp = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await resp.text();
      if (!resp.ok) {
        const retriable = RETRYABLE_STATUS.has(resp.status);
        throw new OpenRouterError(`OpenRouter API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        choices: Array<{
          message: { content: string | null; tool_calls?: ChatResponse['toolCalls'] };
          finish_reason: string;
        }>;
      };

      const choice = parsed.choices[0];
      if (!choice) throw new OpenRouterError('OpenRouter returned no choices', null, false);

      return {
        content: choice.message.content ?? '',
        toolCalls: choice.message.tool_calls ?? [],
        finishReason: choice.finish_reason,
        usage: {
          prompt_tokens: parsed.usage.prompt_tokens,
          completion_tokens: parsed.usage.completion_tokens,
          total_tokens: parsed.usage.total_tokens,
        },
        modelReturned: parsed.model,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OpenRouterError(`OpenRouter request timed out after ${this.config.timeoutMs}ms`, null, true);
      }
      if (err instanceof TypeError) {
        throw new OpenRouterError(`network error: ${err.message}`, null, true);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  estimateCost(usage: { prompt_tokens: number; completion_tokens: number }, modelOverride?: string): number {
    const model = modelOverride ?? this.config.model;
    return estimateCostUsd(model, usage.prompt_tokens, usage.completion_tokens);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}
