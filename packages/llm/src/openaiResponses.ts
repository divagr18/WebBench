import type { ChatMessage, ChatOptions, ChatResponse, ToolCall, ToolDef, UsageInfo } from './deepseek.js';
import { estimateCostUsd, pricingFor } from './pricing.js';
import { OpenAIError, type OpenAIConfig } from './openai.js';

/**
 * OpenAI /v1/responses client. Needed for models where function tools cannot be
 * combined with a non-zero reasoning_effort on /v1/chat/completions (gpt-5.6-luna
 * returns a 400 in that combination). The Responses API accepts both.
 */
export class OpenAIResponsesClient {
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
      input: toResponseInput(messages),
      max_output_tokens: Math.max(opts.maxTokens ?? 2048, this.config.completionTokenFloor),
      reasoning: { effort: this.config.reasoningEffort },
    };
    if (opts.tools && opts.tools.length > 0) {
      body.tools = toResponseTools(opts.tools);
      body.tool_choice = opts.toolChoice ?? 'auto';
    }
    if (opts.jsonSchema) {
      body.text = { format: { type: 'json_schema', name: opts.jsonSchema.name, schema: opts.jsonSchema.schema, strict: true } };
    } else if (opts.responseFormat === 'json') {
      body.text = { format: { type: 'json_object' } };
    }

    try {
      const resp = await fetch(`${this.config.baseUrl}/responses`, {
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
        throw new OpenAIError(`OpenAI Responses API ${resp.status}: ${truncate(text, 500)}`, resp.status, retriable);
      }

      const parsed = JSON.parse(text) as {
        model: string;
        status: string;
        output: Array<{
          type: string;
          role?: string;
          content?: Array<{ type: string; text?: string }>;
          id?: string;
          call_id?: string;
          name?: string;
          arguments?: string;
        }>;
        usage?: {
          input_tokens: number;
          output_tokens: number;
          total_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
        };
      };

      const textParts = parsed.output
        .filter((i) => i.type === 'message' && i.role === 'assistant')
        .flatMap((i) => i.content ?? [])
        .filter((p) => p.type === 'output_text')
        .map((p) => p.text ?? '');
      const toolCalls: ToolCall[] = parsed.output
        .filter((i) => i.type === 'function_call')
        .map((i) => ({
          id: i.call_id ?? i.id ?? '',
          type: 'function' as const,
          function: { name: i.name ?? '', arguments: i.arguments ?? '{}' },
        }));

      const inputTokens = parsed.usage?.input_tokens ?? 0;
      const outputTokens = parsed.usage?.output_tokens ?? 0;
      const usage: UsageInfo = {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: parsed.usage?.total_tokens ?? inputTokens + outputTokens,
        prompt_cache_hit_tokens: parsed.usage?.input_tokens_details?.cached_tokens ?? 0,
      };

      return {
        content: textParts.join(''),
        toolCalls,
        finishReason: parsed.status === 'completed' ? 'stop' : parsed.status === 'incomplete' ? 'length' : parsed.status,
        usage,
        modelReturned: parsed.model,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OpenAIError(`OpenAI Responses request timed out after ${this.config.timeoutMs}ms`, null, true);
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

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function toResponseInput(messages: ChatMessage[]): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'user') {
      items.push({ role: m.role, content: [{ type: 'input_text', text: m.content ?? '' }] });
    } else if (m.role === 'assistant') {
      if (m.content) items.push({ role: 'assistant', content: [{ type: 'output_text', text: m.content }] });
      for (const tc of m.tool_calls ?? []) {
        items.push({ type: 'function_call', call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments });
      }
    } else if (m.role === 'tool') {
      items.push({ type: 'function_call_output', call_id: m.tool_call_id ?? '', output: m.content ?? '' });
    }
  }
  return items;
}

function toResponseTools(tools: ToolDef[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: 'function',
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}
