import { describe, expect, it } from 'vitest';
import { ClaimRecordSchema, claimRecordErrors } from '@echobench/schema';
import { buildRealClaims } from '../src/realClaims.js';
import { sameValue } from '../src/values.js';

describe('real-fact claim corpus', () => {
  it('produces 50 fully valid claims with realEvidence', () => {
    const claims = buildRealClaims();
    expect(claims.length).toBe(50);
    const ids = new Set<string>();
    for (const c of claims) {
      expect(ids.has(c.claimId)).toBe(false);
      ids.add(c.claimId);
      const parsed = ClaimRecordSchema.safeParse(c);
      if (!parsed.success) {
        throw new Error(`${c.claimId}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      const errs = claimRecordErrors(c);
      expect(errs, `${c.claimId} errors: ${errs.join(', ')}`).toEqual([]);
      expect(c.realEvidence).toBeDefined();
      expect(c.realEvidence!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('every real claim has a genuine prior->ground transition', () => {
    for (const c of buildRealClaims()) {
      expect(sameValue(c.prior.value, c.groundTruth), `${c.claimId}: prior equals ground`).toBe(false);
      expect(sameValue(c.poisonValue, c.groundTruth), `${c.claimId}: poison equals ground`).toBe(false);
    }
  });

  it('matches the plan distribution across domains', () => {
    const claims = buildRealClaims();
    const counts: Record<string, number> = {};
    for (const c of claims) counts[c.domain] = (counts[c.domain] ?? 0) + 1;
    expect(counts['technology']).toBe(10);
    expect(counts['science']).toBe(8);
    expect(counts['policy']).toBe(8);
    expect(counts['economics']).toBe(8);
    expect(counts['history_geo']).toBe(8);
    expect(counts['consumer']).toBe(8);
  });
});
