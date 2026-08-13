export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheHitInputPerM: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 },
  'deepseek-v4-pro': { inputPerM: 0.435, outputPerM: 0.87, cacheHitInputPerM: 0.003625 },
  'deepseek-chat': { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 },
  'gpt-5.6-luna': { inputPerM: 0.2, outputPerM: 1.2, cacheHitInputPerM: 0.02 },
  'gpt-5.6-terra': { inputPerM: 2.0, outputPerM: 12.0, cacheHitInputPerM: 0.2 },
  'gpt-5.6-sol': { inputPerM: 5.0, outputPerM: 30.0, cacheHitInputPerM: 0.5 },
  'Qwen-Ambassador/Qwen3.7-Max': { inputPerM: 2.5, outputPerM: 7.5, cacheHitInputPerM: 0.5 },
  'Qwen-Ambassador/Qwen3.7-Plus': { inputPerM: 0.4, outputPerM: 1.6, cacheHitInputPerM: 0.08 },
  'qwen/qwen3.7-max': { inputPerM: 1.48, outputPerM: 4.42, cacheHitInputPerM: 0 },
  'qwen/qwen3.7-plus': { inputPerM: 0.32, outputPerM: 1.28, cacheHitInputPerM: 0 },
};

const FLASH_FALLBACK: ModelPricing = { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 };

export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? FLASH_FALLBACK;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = pricingFor(model);
  return (inputTokens / 1e6) * p.inputPerM + (outputTokens / 1e6) * p.outputPerM;
}
