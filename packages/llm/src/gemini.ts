import type { ChatMessage, ChatOptions, ChatResponse, ToolCall, UsageInfo } from './deepseek.js';
import { estimateCostUsd, pricingFor } from './pricing.js';

export interface GeminiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  thinkingLevel: 'low' | 'high';
}

const THINKING_LEVELS = ['low', 'high'] as const;

export function geminiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GeminiConfig | null {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  const rawLevel = env.GEMINI_THINKING_LEVEL ?? 'low';
  return {
    apiKey,
    baseUrl: env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: env.GEMINI_MODEL ?? 'gemini-3.7-flash',
    maxRetries: Number(env.GEMINI_MAX_RETRIES ?? 8),
    timeoutMs: Number(env.GEMINI_TIMEOUT_MS ?? 180000),
    thinkingLevel: (THINKING_LEVELS as readonly string[]).includes(rawLevel) ? (rawLevel as GeminiConfig['thinkingLevel']) : 'low',
  };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

interface GeminiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export class GeminiClient {
  constructor(private readonly config: GeminiConfig) {}

  get defaultModel(): string {
    return this.config.model;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    ensureInitialUserTurn(messages);
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
        if (err instanceof GeminiError && !err.retriable) throw err;
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
      extra_body: { google: { thinking_config: { thinking_level: this.config.thinkingLevel, include_thoughts: false } } },
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
        throw new GeminiError(`Gemini API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        usage: GeminiUsage;
        choices: Array<{
          message: { content: string | null; tool_calls?: ToolCall[]; extra_content?: unknown };
          finish_reason: string;
        }>;
      };

      const choice = parsed.choices[0];
      if (!choice) throw new GeminiError('Gemini returned no choices', null, false);

      const promptTokens = parsed.usage.prompt_tokens;
      const completionTokens = parsed.usage.completion_tokens;
      // Thinking tokens are billed at the output rate but land only in total_tokens.
      const thinkingTokens = Math.max(0, parsed.usage.total_tokens - promptTokens - completionTokens);
      const usage: UsageInfo = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens + thinkingTokens,
        total_tokens: parsed.usage.total_tokens,
        prompt_cache_hit_tokens: parsed.usage.prompt_tokens_details?.cached_tokens ?? 0,
      };

      return {
        content: choice.message.content ?? '',
        toolCalls: choice.message.tool_calls ?? [],
        finishReason: choice.finish_reason,
        usage,
        modelReturned: parsed.model,
        ...(choice.message.extra_content !== undefined ? { extraContent: choice.message.extra_content } : {}),
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new GeminiError(`Gemini request timed out after ${this.config.timeoutMs}ms`, null, true);
      }
      if (err instanceof TypeError) {
        throw new GeminiError(`network error: ${err.message}`, null, true);
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

function ensureInitialUserTurn(messages: ChatMessage[]): void {
  if (messages.some((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')) return;
  messages.push({ role: 'user', content: 'Begin.' });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}
