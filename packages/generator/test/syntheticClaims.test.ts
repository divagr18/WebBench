import { describe, expect, it } from 'vitest';
import { ClaimRecordSchema, claimRecordErrors } from '@echobench/schema';
import { buildSyntheticClaims } from '../src/syntheticClaims.js';

describe('synthetic claim corpus', () => {
  it('produces 50 fully valid claims', () => {
    const claims = buildSyntheticClaims(50);
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
    }
  });

  it('covers all six domains and all four answer types', () => {
    const claims = buildSyntheticClaims(50);
    const domains = new Set(claims.map((c) => c.domain));
    const types = new Set(claims.map((c) => c.answerType));
    expect(domains.size).toBe(6);
    expect(types.size).toBe(4);
    expect(types).toContain('boolean');
    expect(types).toContain('numeric');
    expect(types).toContain('enum');
  });
});
