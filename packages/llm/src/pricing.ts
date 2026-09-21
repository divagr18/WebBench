export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheHitInputPerM: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 },
  'deepseek-v4-pro': { inputPerM: 0.435, outputPerM: 0.87, cacheHitInputPerM: 0.003625 },
  // OpenRouter-style dated identifier for the same weights; without this exact-string
  // entry, pricingFor() silently fell through to FLASH_FALLBACK for the low-effort rerun
  // (dev-v4pro-0813-gmicloud-fp8-low-20260821) -- same bug pattern as z-ai/glm-5.2 below.
  'deepseek/deepseek-v4-pro-0813': { inputPerM: 0.435, outputPerM: 0.87, cacheHitInputPerM: 0.003625 },
  'deepseek-chat': { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 },
  'gpt-5.6-luna': { inputPerM: 0.2, outputPerM: 1.2, cacheHitInputPerM: 0.02 },
  'gpt-5.6-terra': { inputPerM: 2.0, outputPerM: 12.0, cacheHitInputPerM: 0.2 },
  'gpt-5.6-sol': { inputPerM: 5.0, outputPerM: 30.0, cacheHitInputPerM: 0.5 },
  'Qwen-Ambassador/Qwen3.7-Max': { inputPerM: 2.5, outputPerM: 7.5, cacheHitInputPerM: 0.5 },
  'Qwen-Ambassador/Qwen3.7-Plus': { inputPerM: 0.4, outputPerM: 1.6, cacheHitInputPerM: 0.08 },
  'qwen/qwen3.7-max': { inputPerM: 1.48, outputPerM: 4.42, cacheHitInputPerM: 0 },
  'qwen/qwen3.7-plus': { inputPerM: 0.32, outputPerM: 1.28, cacheHitInputPerM: 0 },
  // Alibaba Model Studio Qwen3.8-Max family. Reasoning tokens are billed as output tokens.
  'qwen3.8-max-preview': { inputPerM: 2.0, outputPerM: 6.0, cacheHitInputPerM: 0.25 },
  'qwen3.8-max': { inputPerM: 2.0, outputPerM: 6.0, cacheHitInputPerM: 0.25 },
  // qwen/qwen3.8-flash and qwen/qwen3.8-27b via OpenRouter, pinned to the
  // Alibaba host specifically (OPENROUTER_PROVIDER_ORDER=alibaba) -- rates
  // confirmed against OpenRouter's own /models/.../endpoints API, 2026-08-28.
  // Flash has only one listed host (Alibaba) so this rate applies regardless
  // of pinning; 27B has several cheaper third-party hosts (e.g. Chutes
  // $0.35/$2.75) but pinning to Alibaba specifically means its own rate applies.
  'qwen/qwen3.8-flash': { inputPerM: 0.15, outputPerM: 0.47, cacheHitInputPerM: 0.016 },
  'qwen/qwen3.8-27b': { inputPerM: 0.425, outputPerM: 2.55, cacheHitInputPerM: 0.085 },
  // Gemini 3.x (per ai.google.dev/gemini-api/docs/pricing); output price includes thinking tokens
  'gemini-3.7-flash': { inputPerM: 0.375, outputPerM: 1.875, cacheHitInputPerM: 0.0375 }, // promo thru Dec 31 2026; $0.75/$3.75/$0.075 from Jan 1 2027
  // Gemini 3.8 Flash, confirmed against ai.google.dev/gemini-api/docs/pricing 2026-09-03;
  // promo thru Dec 31 2026, $1.50/$7.50/$0.15 from Jan 1 2027.
  'gemini-3.8-flash': { inputPerM: 0.75, outputPerM: 3.75, cacheHitInputPerM: 0.075 },
  'gemini-3.5-flash': { inputPerM: 0.75, outputPerM: 4.5, cacheHitInputPerM: 0.08 },
  'gemini-3.5-flash-lite': { inputPerM: 0.15, outputPerM: 1.25, cacheHitInputPerM: 0.02 },
  'gemini-3.1-pro-preview': { inputPerM: 1.0, outputPerM: 6.0, cacheHitInputPerM: 0.2 },
  'gemini-3-flash-preview': { inputPerM: 0.25, outputPerM: 1.5, cacheHitInputPerM: 0.05 },
  'sarvam-105b': { inputPerM: 0.353, outputPerM: 0.882, cacheHitInputPerM: 0.132 },
  'sarvam-105b-conversations': { inputPerM: 0.353, outputPerM: 0.882, cacheHitInputPerM: 0.132 },
  'sarvam-m': { inputPerM: 0.353, outputPerM: 0.882, cacheHitInputPerM: 0.132 },
  // Meta Muse Spark 1.2 (contributor tier = training-opt-in, model id muse-spark-1.2-contributor)
  'muse-spark-1.2': { inputPerM: 1.25, outputPerM: 4.25, cacheHitInputPerM: 0.15 },
  'muse-spark-1.2-contributor': { inputPerM: 0.1, outputPerM: 0.2, cacheHitInputPerM: 0.002 },
  // Muse Spark 1.3 contributor tier -- no public pricing page exists yet;
  // user-confirmed 2026-09-03 to reuse the 1.2 contributor rate as the best
  // available estimate. Flag if a real 1.3 rate is published later.
  'muse-spark-1.3-contributor': { inputPerM: 0.1, outputPerM: 0.2, cacheHitInputPerM: 0.002 },
  'grok-4.6': { inputPerM: 2.0, outputPerM: 6.0, cacheHitInputPerM: 0.5 },
  'x-ai/grok-4.6': { inputPerM: 2.0, outputPerM: 6.0, cacheHitInputPerM: 0.5 },
  // z-ai/glm-5.2 via OpenRouter/StreamLake: list $1.40/$4.40, 76% off applied
  // (confirmed against the OpenRouter provider pricing table 2026-08-22).
  // This model previously had no pricing entry and silently fell through to
  // FLASH_FALLBACK (DeepSeek-flash rates) -- see paper/fix_glm_pricing.py for
  // the retroactive correction applied to already-scored GLM 5.2 reports.
  'z-ai/glm-5.2': { inputPerM: 0.336, outputPerM: 1.056, cacheHitInputPerM: 0.0624 },
  // nvidia/nemotron-3-ultra-550b-a55b via OpenRouter, confirmed pinned to the
  // DeepInfra host (run-set name + OpenRouter's own DeepInfra pricing row and
  // DeepInfra's own site both agree: $0.50/$2.20 per M, 2026-08-23).
  'nvidia/nemotron-3-ultra-550b-a55b': { inputPerM: 0.5, outputPerM: 2.2, cacheHitInputPerM: 0.5 },
  // thinkingmachines/inkling-small via OpenRouter, provider NOT pinned in this
  // run -- OpenRouter lists three near-identical hosts (DeepInfra $0.45,
  // Baseten/Together $0.50, all $1.20 output, $0.10 cache read); using the
  // DeepInfra (lowest/most common default) rate as a best estimate, 2026-08-23.
  'thinkingmachines/inkling-small': { inputPerM: 0.45, outputPerM: 1.2, cacheHitInputPerM: 0.1 },
  // OpenAI GPT-5.6 Sol flagship via OpenRouter (50% off list $5/$30); cache read $0.25
  'openai/gpt-5.6-sol': { inputPerM: 2.5, outputPerM: 15.0, cacheHitInputPerM: 0.25 },
};

const FLASH_FALLBACK: ModelPricing = { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 };

export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? FLASH_FALLBACK;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  return estimateCostUsdCached(model, inputTokens, outputTokens, 0);
}

export function estimateCostUsdCached(model: string, inputTokens: number, outputTokens: number, cacheHitInputTokens: number): number {
  const p = pricingFor(model);
  const uncached = Math.max(0, inputTokens - cacheHitInputTokens);
  return (uncached / 1e6) * p.inputPerM + (cacheHitInputTokens / 1e6) * p.cacheHitInputPerM + (outputTokens / 1e6) * p.outputPerM;
}
