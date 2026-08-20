import { estimateCostUsd } from './pricing.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Provider-supplied reasoning state that must be replayed on a later tool turn. */
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDef[];
  toolChoice?: 'auto' | 'none' | 'required';
  responseFormat?: 'json' | null;
  /** Strict structured-output schema; used by providers that require an explicit schema (OpenAI). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Disable DeepSeek thinking mode for deterministic, low-cost calls. Default true. */
  disableThinking?: boolean;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens?: number;
}

export interface ChatResponse {
  content: string;
  reasoningContent?: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: UsageInfo;
  modelReturned: string;
  latencyMs: number;
}

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig | null {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    model: env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    maxRetries: Number(env.DEEPSEEK_MAX_RETRIES ?? 8),
    timeoutMs: Number(env.DEEPSEEK_TIMEOUT_MS ?? 120000),
  };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

export class DeepSeekClient {
  constructor(private readonly config: DeepSeekConfig) {}

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
        if (err instanceof DeepSeekError && !err.retriable) throw err;
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
      tool_choice: opts.toolChoice ?? 'auto',
      enable_thinking: opts.disableThinking === false ? true : false,
    };
    if (typeof opts.temperature === 'number') body.temperature = opts.temperature;
    if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;
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
        throw new DeepSeekError(`DeepSeek API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        usage: UsageInfo;
        choices: Array<{
          message: { content: string | null; tool_calls?: ToolCall[] };
          finish_reason: string;
        }>;
      };

      const choice = parsed.choices[0];
      if (!choice) throw new DeepSeekError('DeepSeek returned no choices', null, false);

      return {
        content: choice.message.content ?? '',
        toolCalls: choice.message.tool_calls ?? [],
        finishReason: choice.finish_reason,
        usage: parsed.usage,
        modelReturned: parsed.model,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new DeepSeekError(`DeepSeek request timed out after ${this.config.timeoutMs}ms`, null, true);
      }
      if (err instanceof TypeError) {
        throw new DeepSeekError(`network error: ${err.message}`, null, true);
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
    const { cacheHitInputPerM } = { cacheHitInputPerM: 0.0028 };
    return base + (cached / 1e6) * cacheHitInputPerM;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}
