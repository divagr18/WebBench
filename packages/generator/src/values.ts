import type { ClaimRecord, NormalizedAnswer } from '@echobench/schema';
import { numericWithinTolerance } from '@echobench/schema';

export function formatValue(ans: NormalizedAnswer, claim: ClaimRecord): string {
  switch (ans.kind) {
    case 'boolean':
      return ans.value ? 'yes' : 'no';
    case 'enum':
    case 'string':
      return ans.value;
    case 'numeric': {
      const unit = typeof claim.answerSpec === 'object' && 'unit' in claim.answerSpec ? claim.answerSpec.unit : undefined;
      const num = formatNumber(ans.value);
      return unit ? `${num} ${unit}` : num;
    }
  }
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Which of the three claim phrases matches a given asserted value. */
export function phraseForValue(claim: ClaimRecord, value: NormalizedAnswer): string {
  if (sameValue(value, claim.groundTruth)) return claim.phraseGround;
  if (sameValue(value, claim.prior.value)) return claim.phrasePrior;
  if (sameValue(value, claim.poisonValue)) return claim.phrasePoison;
  return claim.phraseGround;
}

export function sameValue(a: NormalizedAnswer, b: NormalizedAnswer): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'boolean':
      return a.value === (b as typeof a).value;
    case 'enum':
    case 'string':
      return a.value === (b as typeof a).value;
    case 'numeric':
      return Math.abs(a.value - (b as typeof a).value) < 1e-9;
  }
}

/** Parse a raw candidate into a NormalizedAnswer using the claim's spec. Returns null if unparseable. */
export function normalizeRawToAnswer(claim: ClaimRecord, raw: string): NormalizedAnswer | null {
  const spec = claim.answerSpec;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  switch (spec.kind) {
    case 'boolean': {
      const lower = trimmed.toLowerCase();
      if (['yes', 'true', 'y', 'correct', 'supported'].includes(lower)) return { kind: 'boolean', value: true };
      if (['no', 'false', 'n', 'incorrect', 'not supported'].includes(lower)) return { kind: 'boolean', value: false };
      return null;
    }
    case 'enum': {
      for (const opt of spec.options) {
        if (opt.toLowerCase() === trimmed.toLowerCase()) return { kind: 'enum', value: opt };
      }
      for (const [opt, aliases] of Object.entries(spec.aliases ?? {})) {
        if (aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) return { kind: 'enum', value: opt };
      }
      return null;
    }
    case 'string': {
      for (const alias of spec.aliases) {
        if (alias.toLowerCase() === trimmed.toLowerCase()) return { kind: 'string', value: spec.aliases[0] };
      }
      return null;
    }
    case 'numeric': {
      const cleaned = trimmed.replace(/[,]/g, '').replace(new RegExp(`\\s*${escapeRegex(spec.unit ?? '')}\\s*$`, 'i'), '');
      const num = Number(cleaned);
      if (Number.isFinite(num)) return { kind: 'numeric', value: num };
      return null;
    }
  }
}

export function isCorrect(claim: ClaimRecord, ans: NormalizedAnswer | 'ABSTAIN' | null): boolean {
  if (ans === null || ans === 'ABSTAIN') return false;
  if (ans.kind !== claim.groundTruth.kind) return false;
  if (ans.kind === 'numeric' && claim.groundTruth.kind === 'numeric' && claim.answerSpec.kind === 'numeric') {
    return numericWithinTolerance(claim.answerSpec, ans.value);
  }
  return sameValue(ans, claim.groundTruth);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
