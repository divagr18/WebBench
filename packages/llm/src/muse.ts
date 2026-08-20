import type { ChatMessage, ChatOptions, ChatResponse, ToolCall, UsageInfo } from './deepseek.js';
import { estimateCostUsd, pricingFor } from './pricing.js';

export interface MuseConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

const MUSE_REASONING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export function museConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MuseConfig | null {
  const apiKey = env.MUSE_API_KEY ?? env.META_API_KEY ?? env.MODEL_API_KEY;
  if (!apiKey) return null;
  const raw = env.MUSE_REASONING_EFFORT ?? 'minimal';
  return {
    apiKey,
    baseUrl: env.MUSE_BASE_URL ?? 'https://api.meta.ai/v1',
    model: env.MUSE_MODEL ?? 'muse-spark-1.2-contributor',
    maxRetries: Number(env.MUSE_MAX_RETRIES ?? 8),
    timeoutMs: Number(env.MUSE_TIMEOUT_MS ?? 180000),
    reasoningEffort: (MUSE_REASONING_LEVELS as readonly string[]).includes(raw) ? (raw as MuseConfig['reasoningEffort']) : 'minimal',
  };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class MuseError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

interface MuseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export class MuseClient {
  constructor(private readonly config: MuseConfig) {}

  get defaultModel(): string {
    return this.config.model;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    ensureUserOrToolTurn(messages);
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
        if (err instanceof MuseError && !err.retriable) throw err;
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
        throw new MuseError(`Muse API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        usage: MuseUsage;
        choices: Array<{
          message: { content: string | null; tool_calls?: ToolCall[] };
          finish_reason: string;
        }>;
      };

      const choice = parsed.choices[0];
      if (!choice) throw new MuseError('Muse returned no choices', null, false);

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
        throw new MuseError(`Muse request timed out after ${this.config.timeoutMs}ms`, null, true);
      }
      if (err instanceof TypeError) {
        throw new MuseError(`network error: ${err.message}`, null, true);
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

function ensureUserOrToolTurn(messages: ChatMessage[]): void {
  if (messages.some((m) => m.role === 'user' || m.role === 'tool')) return;
  messages.push({ role: 'user', content: 'Begin.' });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}
