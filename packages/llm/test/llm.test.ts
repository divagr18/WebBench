import { describe, expect, it } from 'vitest';
import { configFromEnv, estimateCostUsd, pricingFor } from '../src/index.js';

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
});
