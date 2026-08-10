import { describe, expect, it } from 'vitest';
import { buildCorpus } from '../src/corpus.js';

describe('corpus assembly and splits', () => {
  it('builds 100 valid claims, split 20 dev / 80 test, balanced by track', () => {
    const corpus = buildCorpus();
    expect(corpus.claims.length).toBe(100);
    expect(corpus.dev.length).toBe(20);
    expect(corpus.test.length).toBe(80);

    const devSyn = corpus.dev.filter((c) => c.track === 'synthetic').length;
    const devReal = corpus.dev.filter((c) => c.track === 'real').length;
    expect(devSyn).toBe(10);
    expect(devReal).toBe(10);
  });

  it('stratifies dev across domains within each track', () => {
    const corpus = buildCorpus();
    for (const track of ['synthetic', 'real'] as const) {
      const devClaims = corpus.dev.filter((c) => c.track === track);
      const domains = new Set(devClaims.map((c) => c.domain));
      expect(domains.size).toBeGreaterThanOrEqual(4);
    }
  });

  it('no claim appears in both splits', () => {
    const corpus = buildCorpus();
    const devIds = new Set(corpus.dev.map((c) => c.claimId));
    for (const c of corpus.test) {
      expect(devIds.has(c.claimId)).toBe(false);
    }
  });

  it('is deterministic across invocations', () => {
    const a = buildCorpus().claims.map((c) => `${c.claimId}:${c.split}`).join(',');
    const b = buildCorpus().claims.map((c) => `${c.claimId}:${c.split}`).join(',');
    expect(a).toBe(b);
  });
});
