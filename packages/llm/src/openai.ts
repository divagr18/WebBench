import type { ChatMessage, ChatOptions, ChatResponse, ToolCall, UsageInfo } from './deepseek.js';
import { estimateCostUsd, pricingFor } from './pricing.js';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  completionTokenFloor: number;
}

export function openaiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OpenAIConfig | null {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: env.OPENAI_MODEL ?? 'gpt-5.6-luna',
    maxRetries: Number(env.OPENAI_MAX_RETRIES ?? 8),
    timeoutMs: Number(env.OPENAI_TIMEOUT_MS ?? 180000),
    reasoningEffort: (env.OPENAI_REASONING_EFFORT as OpenAIConfig['reasoningEffort'] | undefined) ?? 'none',
    completionTokenFloor: Number(env.OPENAI_COMPLETION_TOKEN_FLOOR ?? 8192),
  };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export class OpenAIClient {
  constructor(private readonly config: OpenAIConfig) {}

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
        if (err instanceof OpenAIError && !err.retriable) throw err;
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
      max_completion_tokens: Math.max(opts.maxTokens ?? 2048, this.config.completionTokenFloor),
      reasoning_effort: this.config.reasoningEffort,
    };
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
      body.tool_choice = opts.toolChoice ?? 'auto';
    }
    if (opts.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
      };
    }

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
        throw new OpenAIError(`OpenAI API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        usage: OpenAIUsage;
        choices: Array<{
          message: { content: string | null; tool_calls?: ToolCall[] };
          finish_reason: string;
        }>;
      };

      const choice = parsed.choices[0];
      if (!choice) throw new OpenAIError('OpenAI returned no choices', null, false);

      const usage: UsageInfo = {
        prompt_tokens: parsed.usage.prompt_tokens,
        completion_tokens: parsed.usage.completion_tokens,
        total_tokens: parsed.usage.total_tokens,
        prompt_cache_hit_tokens: parsed.usage.prompt_tokens_details?.cached_tokens ?? 0,
      };

      return {
        content: choice.message.content ?? '',
        toolCalls: choice.message.tool_calls ?? [],
        finishReason: choice.finish_reason,
        usage,
        modelReturned: parsed.model,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OpenAIError(`OpenAI request timed out after ${this.config.timeoutMs}ms`, null, true);
      }
      if (err instanceof TypeError) {
        throw new OpenAIError(`network error: ${err.message}`, null, true);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  estimateCost(usage: UsageInfo, modelOverride?: string): number {
    const cached = usage.prompt_cache_hit_tokens ?? 0;
    const uncached = Math.max(0, usage.prompt_tokens - cached);
    const model = modelOverride ?? this.config.model;
    const base = estimateCostUsd(model, uncached, usage.completion_tokens);
    return base + (cached / 1e6) * pricingFor(model).cacheHitInputPerM;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}
