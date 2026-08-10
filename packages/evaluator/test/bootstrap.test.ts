import { describe, expect, it } from 'vitest';
import { SeededRng } from '@echobench/generator';
import { clusteredBootstrap } from '../src/bootstrap.js';

describe('clustered bootstrap', () => {
  it('produces deterministic CIs and the point estimate', () => {
    const items: Array<{ claim: string; correct: boolean }> = [];
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 3; r++) items.push({ claim: `claim_${c}`, correct: (c + r) % 2 === 0 });
    }
    const statistic = (sample: typeof items) => sample.filter((x) => x.correct).length / sample.length;
    const rng1 = new SeededRng('boot-test');
    const rng2 = new SeededRng('boot-test');
    const a = clusteredBootstrap(items, (x) => x.claim, statistic, { resamples: 300, seedRng: () => rng1.float() });
    const b = clusteredBootstrap(items, (x) => x.claim, statistic, { resamples: 300, seedRng: () => rng2.float() });
    expect(a.ci95).toEqual(b.ci95);
    expect(a.estimate).toBeCloseTo(0.5, 10);
    expect(a.ci95![0]).toBeLessThanOrEqual(a.estimate!);
    expect(a.ci95![1]).toBeGreaterThanOrEqual(a.estimate! - 1e-9);
  });

  it('returns null CI for empty input', () => {
    const r = clusteredBootstrap<number>([], (x) => String(x), (s) => (s.length > 0 ? s[0] ?? null : null), { resamples: 50, seedRng: () => 0.5 });
    expect(r.ci95).toBeNull();
    expect(r.samples).toBe(0);
  });
});
