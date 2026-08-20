import { describe, expect, it, vi } from 'vitest';
import { configFromEnv, estimateCostUsd, estimateCostUsdCached, geminiConfigFromEnv, GeminiClient, grokConfigFromEnv, GrokClient, ModelScopeClient, modelscopeConfigFromEnv, museConfigFromEnv, MuseClient, openaiConfigFromEnv, OpenAIClient, OpenAIResponsesClient, openrouterConfigFromEnv, pricingFor, type ChatMessage } from '../src/index.js';

describe('llm package', () => {
  it('parses DeepSeek config from env and uses only DeepSeek keys', () => {
    const cfg = configFromEnv({
      DEEPSEEK_API_KEY: 'sk-test',
      DEEPSEEK_MODEL: 'deepseek-chat',
      OPENAI_API_KEY: 'sk-should-not-matter',
    } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.apiKey).toBe('sk-test');
    expect(cfg!.baseUrl).toBe('https://api.deepseek.com');
    expect(cfg!.model).toBe('deepseek-chat');
  });

  it('returns null when DeepSeek key missing', () => {
    expect(configFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('computes flash pricing', () => {
    const p = pricingFor('deepseek-v4-flash');
    expect(p.inputPerM).toBe(0.14);
    expect(p.outputPerM).toBe(0.28);
    const cost = estimateCostUsd('deepseek-v4-flash', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.42, 5);
  });

  it('parses OpenAI config from env and uses only OpenAI keys', () => {
    const cfg = openaiConfigFromEnv({
      OPENAI_API_KEY: 'sk-openai-test',
      OPENAI_MODEL: 'gpt-5.6-luna',
      DEEPSEEK_API_KEY: 'sk-should-not-matter',
    } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.apiKey).toBe('sk-openai-test');
    expect(cfg!.baseUrl).toBe('https://api.openai.com/v1');
    expect(cfg!.model).toBe('gpt-5.6-luna');
    expect(cfg!.reasoningEffort).toBe('none');
  });

  it('returns null OpenAI config when key missing', () => {
    expect(openaiConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('computes gpt-5.6-luna pricing with cached discount', () => {
    const p = pricingFor('gpt-5.6-luna');
    expect(p.inputPerM).toBe(0.2);
    expect(p.outputPerM).toBe(1.2);
    expect(p.cacheHitInputPerM).toBe(0.02);
    const client = new OpenAIClient({
      apiKey: 'x',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6-luna',
      maxRetries: 0,
      timeoutMs: 1000,
      reasoningEffort: 'none',
      completionTokenFloor: 8192,
    });
    const cost = client.estimateCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000, total_tokens: 2_000_000, prompt_cache_hit_tokens: 500_000 });
    expect(cost).toBeCloseTo(0.1 + 1.2 + 0.01, 5);
  });

  it('parses ModelScope config from env and uses only ModelScope keys', () => {
    const cfg = modelscopeConfigFromEnv({
      MODELSCOPE_API_KEY: 'ms-test',
      OPENAI_API_KEY: 'sk-should-not-matter',
    } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.apiKey).toBe('ms-test');
    expect(cfg!.baseUrl).toBe('https://api-inference.modelscope.ai/v1');
    expect(cfg!.model).toBe('Qwen-Ambassador/Qwen3.7-Max');
  });

  it('uses Alibaba Qwen3.8-Max-Preview low reasoning without a thinking budget', async () => {
    const cfg = modelscopeConfigFromEnv({ DASHSCOPE_API_KEY: 'ds-test', DASHSCOPE_BASE_URL: 'https://workspace.example/compatible-mode/v1', DASHSCOPE_REASONING_EFFORT: 'low' } as NodeJS.ProcessEnv);
    expect(cfg).toMatchObject({
      apiKey: 'ds-test',
      baseUrl: 'https://workspace.example/compatible-mode/v1',
      model: 'qwen3.8-max-preview',
      reasoningEffort: 'low',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => fakeResponse(200, {
      model: 'qwen3.8-max-preview',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
    const client = new ModelScopeClient({ ...cfg!, maxRetries: 0, timeoutMs: 1000 });
    await client.chat([{ role: 'user', content: 'hi' }]);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as { enable_thinking?: boolean; preserve_thinking?: boolean; reasoning_effort?: string; thinking_budget?: number };
    expect(body).toMatchObject({ enable_thinking: true, preserve_thinking: true, reasoning_effort: 'low' });
    expect(body.thinking_budget).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it('captures and replays ModelScope Qwen reasoning across turns without leaking generic extra_content', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(fakeResponse(200, {
        model: 'Qwen/Qwen3-8B',
        choices: [{ message: { content: '', reasoning_content: 'consider sources', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"query":"x"}' } }] }, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      }))
      .mockResolvedValueOnce(fakeResponse(200, {
        model: 'Qwen/Qwen3-8B',
        choices: [{ message: { content: 'final' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 },
      }));
    const client = new ModelScopeClient({ apiKey: 'x', baseUrl: 'http://localhost:9999/v1', model: 'qwen3.8-max-preview', maxRetries: 0, timeoutMs: 1000, reasoningEffort: 'low' });
    const first = await client.chat([{ role: 'user', content: 'research' }], { tools: [{ type: 'function', function: { name: 'search', description: 'Search', parameters: {} } }] });
    expect(first.extraContent).toEqual({ modelscope: { reasoning_content: 'consider sources' } });
    await client.chat([
      { role: 'user', content: 'research' },
      { role: 'assistant', content: null, tool_calls: first.toolCalls, extra_content: first.extraContent },
      { role: 'tool', tool_call_id: 'call_1', content: 'result' },
    ]);
    const secondBody = JSON.parse(String(fetchSpy.mock.calls[1]![1]!.body)) as { messages: Array<Record<string, unknown>> };
    expect(secondBody.messages[1]).toMatchObject({ role: 'assistant', reasoning_content: 'consider sources' });
    expect(secondBody.messages[1]?.extra_content).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it('returns null ModelScope config when key missing', () => {
    expect(modelscopeConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('has qwen3.7 pricing entries for cost-guard estimates', () => {
    const max = pricingFor('Qwen-Ambassador/Qwen3.7-Max');
    const plus = pricingFor('Qwen-Ambassador/Qwen3.7-Plus');
    expect(max.inputPerM).toBeGreaterThan(0);
    expect(max.outputPerM).toBeGreaterThan(0);
    expect(plus.inputPerM).toBeGreaterThan(0);
    expect(plus.outputPerM).toBeGreaterThan(0);
    expect(pricingFor('qwen3.8-max-preview')).toEqual({ inputPerM: 2.0, outputPerM: 6.0, cacheHitInputPerM: 0.25 });
  });

  it('parses OpenRouter config from env and uses only OpenRouter keys', () => {
    const cfg = openrouterConfigFromEnv({
      OPENROUTER_API_KEY: 'sk-or-test',
      MODELSCOPE_API_KEY: 'ms-should-not-matter',
    } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.apiKey).toBe('sk-or-test');
    expect(cfg!.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(cfg!.model).toBe('qwen/qwen3.7-max');
    expect(cfg!.reasoningEffort).toBe('none');
  });

  it('returns null OpenRouter config when key missing', () => {
    expect(openrouterConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('parses Gemini config from env and uses only Gemini keys', () => {
    const cfg = geminiConfigFromEnv({
      GEMINI_API_KEY: 'gk-test',
      GEMINI_MODEL: 'gemini-3.1-pro-preview',
      OPENAI_API_KEY: 'sk-should-not-matter',
    } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.apiKey).toBe('gk-test');
    expect(cfg!.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(cfg!.model).toBe('gemini-3.1-pro-preview');
  });

  it('returns null Gemini config when key missing', () => {
    expect(geminiConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('has gemini pricing entries for all wired models', () => {
    for (const model of ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview']) {
      const p = pricingFor(model);
      expect(p.inputPerM).toBeGreaterThan(0);
      expect(p.outputPerM).toBeGreaterThan(0);
      expect(p.cacheHitInputPerM).toBeLessThan(p.inputPerM);
    }
  });

  it('prices cached input tokens at the cache-read rate', () => {
    const cost = estimateCostUsdCached('gemini-3.7-flash', 1_000_000, 1_000_000, 500_000);
    expect(cost).toBeCloseTo(0.5 * 0.375 + 0.5 * 0.0375 + 1.875, 5);
  });

  it('GeminiClient estimateCost applies cache discount via cached tokens', () => {
    const client = new GeminiClient({
      apiKey: 'x',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-3.7-flash',
      maxRetries: 0,
      timeoutMs: 1000,
      thinkingLevel: 'low',
    });
    const cost = client.estimateCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000, total_tokens: 2_000_000, prompt_cache_hit_tokens: 500_000 });
    expect(cost).toBeCloseTo(0.5 * 0.375 + 0.5 * 0.0375 + 1.875, 5);
  });

  const geminiUsageFixture = (overrides: Record<string, unknown> = {}) => ({
    model: 'gemini-3.7-flash',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, ...overrides },
  });

  function fakeResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  function testGeminiClient(maxRetries: number): GeminiClient {
    return new GeminiClient({
      apiKey: 'x',
      baseUrl: 'http://localhost:9999/v1beta/openai',
      model: 'gemini-3.7-flash',
      maxRetries,
      timeoutMs: 1000,
      thinkingLevel: 'low',
    });
  }

  it('appends Begin. to a system-only conversation so Gemini accepts it; keeps others untouched', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => fakeResponse(200, geminiUsageFixture()));
    const client = testGeminiClient(0);

    const systemOnly: ChatMessage[] = [{ role: 'system', content: 'sys' }];
    await client.chat(systemOnly);
    expect(systemOnly).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Begin.' },
    ]);

    const withUser: ChatMessage[] = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'q' }];
    await client.chat(withUser);
    expect(withUser).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'q' }]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('sends low thinking level and folds thinking tokens into completion accounting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => fakeResponse(200, geminiUsageFixture()));
    const resp = await testGeminiClient(0).chat([{ role: 'user', content: 'hi' }]);

    const sentBody = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as { extra_body?: { google?: { thinking_config?: { thinking_level?: string } } } };
    expect(sentBody.extra_body?.google?.thinking_config?.thinking_level).toBe('low');
    expect(resp.usage.completion_tokens).toBe(20 + (120 - 100 - 20));
    fetchSpy.mockRestore();
  });

  it('maps cached tokens from prompt_tokens_details and retries 429', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(fakeResponse(429, { error: { message: 'rate limited' } }))
      .mockResolvedValueOnce(fakeResponse(200, geminiUsageFixture({ total_tokens: 120, prompt_tokens_details: { cached_tokens: 60 } })));

    const resp = await testGeminiClient(1).chat([{ role: 'user', content: 'hi' }]);
    expect(resp.usage.prompt_cache_hit_tokens).toBe(60);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('round-trips Gemini thought signatures through tool-call turns', async () => {
    const signature = { google: { thought_signature: 'sig-abc-123' } };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        fakeResponse(200, {
          model: 'gemini-3.7-flash',
          choices: [
            {
              message: {
                content: '',
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"query":"x"}' } }],
                extra_content: signature,
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      )
      .mockImplementation(async () => fakeResponse(200, geminiUsageFixture()));

    const client = testGeminiClient(0);
    const resp1 = await client.chat([{ role: 'user', content: 'go' }]);
    expect(resp1.extraContent).toEqual(signature);

    await client.chat([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: null, tool_calls: resp1.toolCalls, extra_content: resp1.extraContent },
      { role: 'tool', tool_call_id: 'call_1', name: 'search', content: '{}' },
    ]);
    const sentBody = JSON.parse(String(fetchSpy.mock.calls[1]![1]!.body)) as { messages: Array<{ extra_content?: unknown }> };
    expect(sentBody.messages[1]!.extra_content).toEqual(signature);
    fetchSpy.mockRestore();
  });

  it('parses Gemini thinking-level override from env', () => {
    const cfg = geminiConfigFromEnv({ GEMINI_API_KEY: 'gk', GEMINI_THINKING_LEVEL: 'high' } as NodeJS.ProcessEnv);
    expect(cfg!.thinkingLevel).toBe('high');
    const bad = geminiConfigFromEnv({ GEMINI_API_KEY: 'gk', GEMINI_THINKING_LEVEL: 'none' } as NodeJS.ProcessEnv);
    expect(bad!.thinkingLevel).toBe('low');
  });

  const responsesFixture = () => ({
    model: 'gpt-5.6-luna',
    status: 'completed',
    output: [
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Thinking...' }] },
      { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'search', arguments: '{"query":"x"}' },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, input_tokens_details: { cached_tokens: 40 } },
  });

  function testResponsesClient(): OpenAIResponsesClient {
    return new OpenAIResponsesClient({
      apiKey: 'x',
      baseUrl: 'http://localhost:9999/v1',
      model: 'gpt-5.6-luna',
      maxRetries: 0,
      timeoutMs: 1000,
      reasoningEffort: 'low',
      completionTokenFloor: 8192,
    });
  }

  it('OpenAIResponsesClient sends /v1/responses items with reasoning and flat tools', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => fakeResponse(200, responsesFixture()));
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'interim reasoning', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"query":"x"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', name: 'search', content: '{"results":[]}' },
    ];
    await testResponsesClient().chat(messages, {
      tools: [{ type: 'function', function: { name: 'search', description: 'd', parameters: { type: 'object', properties: {} } } }],
      responseFormat: 'json',
      jsonSchema: { name: 's', schema: { type: 'object' } },
      maxTokens: 300,
    });
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as Record<string, unknown>;
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBe(8192);
    expect((body.text as { format: { type: string } }).format.type).toBe('json_schema');
    expect(body.input).toEqual([
      { role: 'system', content: [{ type: 'input_text', text: 'sys' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'q' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'interim reasoning' }] },
      { type: 'function_call', call_id: 'call_1', name: 'search', arguments: '{"query":"x"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"results":[]}' },
    ]);
    expect(body.tools).toEqual([{ type: 'function', name: 'search', description: 'd', parameters: { type: 'object', properties: {} } }]);
    fetchSpy.mockRestore();
  });

  it('OpenAIResponsesClient maps output items, finish reason, and cached usage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => fakeResponse(200, responsesFixture()));
    const resp = await testResponsesClient().chat([{ role: 'user', content: 'q' }]);
    expect(resp.content).toBe('Thinking...');
    expect(resp.finishReason).toBe('stop');
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]!.id).toBe('call_1');
    expect(resp.toolCalls[0]!.function.name).toBe('search');
    expect(resp.usage.prompt_cache_hit_tokens).toBe(40);
    expect(resp.usage.completion_tokens).toBe(50);
    fetchSpy.mockRestore();
  });

  it('parses Muse config from env with contributor defaults and rejects reasoning none', () => {
    const cfg = museConfigFromEnv({ MUSE_API_KEY: 'mk-test' } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.baseUrl).toBe('https://api.meta.ai/v1');
    expect(cfg!.model).toBe('muse-spark-1.2-contributor');
    expect(cfg!.reasoningEffort).toBe('minimal');
    const overridden = museConfigFromEnv({ MUSE_API_KEY: 'mk-test', MUSE_REASONING_EFFORT: 'low', MUSE_MODEL: 'muse-spark-1.2' } as NodeJS.ProcessEnv);
    expect(overridden!.reasoningEffort).toBe('low');
    expect(overridden!.model).toBe('muse-spark-1.2');
    expect(museConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('parses Grok config from env with low reasoning default', () => {
    const cfg = grokConfigFromEnv({ GROK_API_KEY: 'gk-test' } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.baseUrl).toBe('https://api.x.ai/v1');
    expect(cfg!.model).toBe('grok-4.6');
    expect(cfg!.reasoningEffort).toBe('low');
    const overridden = grokConfigFromEnv({ GROK_API_KEY: 'gk-test', GROK_REASONING_EFFORT: 'high', GROK_MODEL: 'grok-4.5' } as NodeJS.ProcessEnv);
    expect(overridden!.reasoningEffort).toBe('high');
    expect(overridden!.model).toBe('grok-4.5');
    expect(grokConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('has muse and grok pricing entries; contributor tier priced below standard', () => {
    const contributor = pricingFor('muse-spark-1.2-contributor');
    const standard = pricingFor('muse-spark-1.2');
    const grok = pricingFor('grok-4.6');
    expect(contributor.inputPerM).toBe(0.1);
    expect(contributor.outputPerM).toBe(0.2);
    expect(contributor.inputPerM).toBeLessThan(standard.inputPerM);
    expect(grok.inputPerM).toBe(2.0);
    expect(grok.outputPerM).toBe(6.0);
    expect(grok.cacheHitInputPerM).toBe(0.5);
  });

  it('MuseClient sends minimal reasoning and maps cached tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      fakeResponse(200, {
        model: 'muse-spark-1.2-contributor',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 60 } },
      }),
    );
    const client = new MuseClient({ apiKey: 'x', baseUrl: 'http://localhost:9999/v1', model: 'muse-spark-1.2-contributor', maxRetries: 0, timeoutMs: 1000, reasoningEffort: 'minimal' });
    const resp = await client.chat([{ role: 'user', content: 'hi' }]);
    const sentBody = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as { reasoning_effort?: string };
    expect(sentBody.reasoning_effort).toBe('minimal');
    expect(resp.usage.prompt_cache_hit_tokens).toBe(60);
    fetchSpy.mockRestore();
  });

  it('GrokClient sends low reasoning and maps cached tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      fakeResponse(200, {
        model: 'grok-4.6',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 40 } },
      }),
    );
    const client = new GrokClient({ apiKey: 'x', baseUrl: 'http://localhost:9999/v1', model: 'grok-4.6', maxRetries: 0, timeoutMs: 1000, reasoningEffort: 'low' });
    const resp = await client.chat([{ role: 'user', content: 'hi' }]);
    const sentBody = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as { reasoning_effort?: string };
    expect(sentBody.reasoning_effort).toBe('low');
    expect(resp.usage.prompt_cache_hit_tokens).toBe(40);
    fetchSpy.mockRestore();
  });
});
