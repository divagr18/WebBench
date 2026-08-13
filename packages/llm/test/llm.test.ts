import { describe, expect, it } from 'vitest';
import { configFromEnv, estimateCostUsd, openaiConfigFromEnv, OpenAIClient, pricingFor } from '../src/index.js';

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
});
