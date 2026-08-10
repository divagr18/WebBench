export interface DeepSeekPricing {
  inputPerM: number;
  outputPerM: number;
  cacheHitInputPerM: number;
}

export const PRICING: Record<string, DeepSeekPricing> = {
  'deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 },
  'deepseek-v4-pro': { inputPerM: 0.435, outputPerM: 0.87, cacheHitInputPerM: 0.003625 },
  'deepseek-chat': { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 },
};

const FLASH_FALLBACK: DeepSeekPricing = { inputPerM: 0.14, outputPerM: 0.28, cacheHitInputPerM: 0.0028 };

export function pricingFor(model: string): DeepSeekPricing {
  return PRICING[model] ?? FLASH_FALLBACK;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = pricingFor(model);
  return (inputTokens / 1e6) * p.inputPerM + (outputTokens / 1e6) * p.outputPerM;
}
