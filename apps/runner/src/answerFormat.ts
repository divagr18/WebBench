import type { AnswerSpec, ClaimRecord } from '@echobench/schema';
import { NormalizedAnswerSchema, normalizeRawToAnswer } from '@echobench/schema';

export function answerFormat(spec: AnswerSpec): string {
  switch (spec.kind) {
    case 'boolean':
      return 'Your answer must be a JSON boolean: true or false.';
    case 'enum':
      return `Your answer must be exactly one of these options: ${JSON.stringify(spec.options)}.`;
    case 'string':
      return 'Your answer must be a short exact string (a name or identifier).';
    case 'numeric': {
      const unit = spec.unit ? ` The unit is ${spec.unit}.` : '';
      return `Your answer must be a single number.${unit}`;
    }
  }
}

export function answerShapeHint(spec: AnswerSpec): string {
  switch (spec.kind) {
    case 'boolean':
      return '{"kind":"boolean","value":true} or {"kind":"boolean","value":false}';
    case 'enum':
      return `{"kind":"enum","value":"<one of: ${spec.options.join(' | ')}>"}`;
    case 'string':
      return '{"kind":"string","value":"<exact string>"}';
    case 'numeric':
      return '{"kind":"numeric","value":<number>}';
  }
}

export type ParsedAnswer = ReturnType<typeof normalizePriorAnswer>;

export function normalizePriorAnswer(claim: ClaimRecord, raw: unknown): NormalizedAnswerParse {
  return normalizeAnyAnswer(claim, raw);
}

export type NormalizedAnswerParse =
  | { ok: true; value: 'ABSTAIN' | import('@echobench/schema').NormalizedAnswer }
  | { ok: false };

export function normalizeAnyAnswer(claim: ClaimRecord, raw: unknown): NormalizedAnswerParse {
  if (raw === 'ABSTAIN' || raw === 'abstain') return { ok: true, value: 'ABSTAIN' };
  if (raw !== null && typeof raw === 'object') {
    const candidate = NormalizedAnswerSchema.safeParse(raw);
    if (candidate.success) {
      return { ok: true, value: candidate.data };
    }
    const obj = raw as Record<string, unknown>;
    if ('value' in obj) return normalizeAnyAnswer(claim, obj.value);
    return { ok: false };
  }
  if (typeof raw === 'string') {
    const normalized = normalizeRawToAnswer(claim, raw);
    if (normalized) return { ok: true, value: normalized };
    return { ok: false };
  }
  if (typeof raw === 'number') {
    if (claim.answerSpec.kind === 'numeric') return { ok: true, value: { kind: 'numeric', value: raw } };
    return { ok: false };
  }
  if (typeof raw === 'boolean') {
    if (claim.answerSpec.kind === 'boolean') return { ok: true, value: { kind: 'boolean', value: raw } };
    return { ok: false };
  }
  return { ok: false };
}
