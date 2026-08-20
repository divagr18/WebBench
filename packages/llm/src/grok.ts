import type { ChatMessage, ChatOptions, ChatResponse, ToolCall, UsageInfo } from './deepseek.js';
import { estimateCostUsd, pricingFor } from './pricing.js';

export interface GrokConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh';
}

const GROK_REASONING_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const;

export function grokConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GrokConfig | null {
  const apiKey = env.GROK_API_KEY;
  if (!apiKey) return null;
  const raw = env.GROK_REASONING_EFFORT ?? 'low';
  return {
    apiKey,
    baseUrl: env.GROK_BASE_URL ?? 'https://api.x.ai/v1',
    model: env.GROK_MODEL ?? 'grok-4.6',
    maxRetries: Number(env.GROK_MAX_RETRIES ?? 8),
    timeoutMs: Number(env.GROK_TIMEOUT_MS ?? 180000),
    reasoningEffort: (GROK_REASONING_LEVELS as readonly string[]).includes(raw) ? (raw as GrokConfig['reasoningEffort']) : 'low',
  };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class GrokError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

interface GrokUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export class GrokClient {
  constructor(private readonly config: GrokConfig) {}

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
        if (err instanceof GrokError && !err.retriable) throw err;
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
      reasoning_effort: this.config.reasoningEffort,
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
        throw new GrokError(`Grok API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        usage: GrokUsage;
        choices: Array<{
          message: { content: string | null; tool_calls?: ToolCall[] };
          finish_reason: string;
        }>;
      };

      const choice = parsed.choices[0];
      if (!choice) throw new GrokError('Grok returned no choices', null, false);

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
        throw new GrokError(`Grok request timed out after ${this.config.timeoutMs}ms`, null, true);
      }
      if (err instanceof TypeError) {
        throw new GrokError(`network error: ${err.message}`, null, true);
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
