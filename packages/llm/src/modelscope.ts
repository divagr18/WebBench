import type { ChatMessage, ChatOptions, ChatResponse } from './deepseek.js';
import { estimateCostUsd, pricingFor } from './pricing.js';

export interface ModelScopeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  /** Qwen3.8 Max family inference intensity; only supported by the DashScope route. */
  reasoningEffort?: 'low' | 'medium' | 'xhigh';
}

export function modelscopeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelScopeConfig | null {
  const apiKey = env.DASHSCOPE_API_KEY ?? env.MODELSCOPE_API_KEY;
  if (!apiKey) return null;
  const reasoningEffort = qwenReasoningEffort(env.DASHSCOPE_REASONING_EFFORT ?? env.MODELSCOPE_REASONING_EFFORT);
  const usesDashScope = Boolean(env.DASHSCOPE_API_KEY);
  return {
    apiKey,
    baseUrl: env.DASHSCOPE_BASE_URL ?? env.MODELSCOPE_BASE_URL ?? (usesDashScope ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' : 'https://api-inference.modelscope.ai/v1'),
    model: env.DASHSCOPE_MODEL ?? env.MODELSCOPE_MODEL ?? (usesDashScope ? 'qwen3.8-max-preview' : 'Qwen-Ambassador/Qwen3.7-Max'),
    maxRetries: Number(env.MODELSCOPE_MAX_RETRIES ?? 8),
    timeoutMs: Number(env.MODELSCOPE_TIMEOUT_MS ?? 180000),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class ModelScopeError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retriable: boolean,
  ) {
    super(message);
  }
}

export class ModelScopeClient {
  constructor(private readonly config: ModelScopeConfig) {}

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
        if (err instanceof ModelScopeError && !err.retriable) throw err;
        if (attempt === this.config.maxRetries) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async singleAttempt(messages: ChatMessage[], opts: ChatOptions): Promise<Omit<ChatResponse, 'latencyMs'>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const thinkingEnabled = this.config.reasoningEffort !== undefined || opts.disableThinking === false;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(toModelScopeMessage),
      max_tokens: opts.maxTokens ?? 2048,
      tool_choice: opts.toolChoice ?? 'auto',
      enable_thinking: thinkingEnabled,
    };
    if (this.config.reasoningEffort !== undefined) body.reasoning_effort = this.config.reasoningEffort;
    if (thinkingEnabled) body.preserve_thinking = true;
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
        throw new ModelScopeError(`ModelScope API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        choices: Array<{
          message: { content: string | null; reasoning_content?: string | null; tool_calls?: ChatResponse['toolCalls'] };
          finish_reason: string;
        }>;
      };

      const choice = parsed.choices[0];
      if (!choice) throw new ModelScopeError('ModelScope returned no choices', null, false);

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
        ...(choice.message.reasoning_content ? { extraContent: { modelscope: { reasoning_content: choice.message.reasoning_content } } } : {}),
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ModelScopeError(`ModelScope request timed out after ${this.config.timeoutMs}ms`, null, true);
      }
      if (err instanceof TypeError) {
        throw new ModelScopeError(`network error: ${err.message}`, null, true);
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

function qwenReasoningEffort(value: string | undefined): ModelScopeConfig['reasoningEffort'] | null {
  return value === 'low' || value === 'medium' || value === 'xhigh' ? value : null;
}

function toModelScopeMessage(message: ChatMessage): Omit<ChatMessage, 'extra_content'> & { reasoning_content?: string } {
  const { extra_content, ...base } = message;
  const reasoningContent = modelscopeReasoning(extra_content);
  return reasoningContent ? { ...base, reasoning_content: reasoningContent } : base;
}

function modelscopeReasoning(extraContent: unknown): string | null {
  if (!extraContent || typeof extraContent !== 'object') return null;
  const providerPayload = (extraContent as { modelscope?: unknown }).modelscope;
  if (!providerPayload || typeof providerPayload !== 'object') return null;
  const reasoningContent = (providerPayload as { reasoning_content?: unknown }).reasoning_content;
  return typeof reasoningContent === 'string' && reasoningContent.length > 0 ? reasoningContent : null;
}

export { pricingFor };
