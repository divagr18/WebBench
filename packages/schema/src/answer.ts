import { z } from 'zod';

/**
 * Normalized answer specifications.
 *
 * Every claim's ground truth is expressed as a NormalizedAnswer backed by an
 * AnswerSpec so scoring is fully deterministic. Four kinds are supported:
 * boolean, enum (closed option set with alias folding), string (alias set),
 * and numeric (value with explicit absolute AND/OR relative tolerance).
 */

export const BooleanAnswerSchema = z.object({
  kind: z.literal('boolean'),
  value: z.boolean(),
});

export const EnumAnswerSchema = z.object({
  kind: z.literal('enum'),
  /** Canonical option key, must be a member of the spec's options. */
  value: z.string(),
});

export const StringAnswerSchema = z.object({
  kind: z.literal('string'),
  /** Canonical spelling of the accepted alias. */
  value: z.string(),
});

export const NumericAnswerSchema = z.object({
  kind: z.literal('numeric'),
  value: z.number(),
  unit: z.string().optional(),
});

export const NormalizedAnswerSchema = z.discriminatedUnion('kind', [
  BooleanAnswerSchema,
  EnumAnswerSchema,
  StringAnswerSchema,
  NumericAnswerSchema,
]);
export type NormalizedAnswer = z.infer<typeof NormalizedAnswerSchema>;

export const BooleanSpecSchema = z.object({
  kind: z.literal('boolean'),
});

export const EnumSpecSchema = z.object({
  kind: z.literal('enum'),
  /** Closed set of canonical option keys. */
  options: z.array(z.string()).min(2),
  /**
   * Fold raw model strings into canonical options. Keys are canonical option
   * keys; values are lower-cased alias phrasings accepted for that option.
   */
  aliases: z.record(z.string(), z.array(z.string())).optional(),
});

export const StringSpecSchema = z.object({
  kind: z.literal('string'),
  /** Accepted aliases (case-insensitive, trimmed). First entry is canonical. */
  aliases: z.array(z.string()).min(1),
});

export const NumericSpecSchema = z.object({
  kind: z.literal('numeric'),
  value: z.number(),
  /** Absolute tolerance applied symmetrically. */
  toleranceAbs: z.number().nonnegative().optional(),
  /** Relative tolerance as a fraction of |value|. */
  toleranceRel: z.number().nonnegative().optional(),
  unit: z.string().optional(),
});

export const AnswerSpecSchema = z.discriminatedUnion('kind', [
  BooleanSpecSchema,
  EnumSpecSchema,
  StringSpecSchema,
  NumericSpecSchema,
]);
export type AnswerSpec = z.infer<typeof AnswerSpecSchema>;
export type AnswerKind = AnswerSpec['kind'];

/** Validate that an answer is compatible with its spec. */
export function answerMatchesSpec(spec: AnswerSpec, ans: NormalizedAnswer): boolean {
  switch (ans.kind) {
    case 'boolean':
      return spec.kind === 'boolean';
    case 'enum':
      return spec.kind === 'enum' && spec.options.includes(ans.value);
    case 'string':
      return spec.kind === 'string' && spec.aliases.some((a) => a.toLowerCase() === ans.value.toLowerCase());
    case 'numeric':
      return spec.kind === 'numeric';
  }
}

/** Determine whether a candidate numeric value falls within the spec's tolerance. */
export function numericWithinTolerance(spec: z.infer<typeof NumericSpecSchema>, candidate: number): boolean {
  const abs = spec.toleranceAbs;
  const rel = spec.toleranceRel !== undefined ? Math.abs(spec.value) * spec.toleranceRel : undefined;
  const tol = [abs, rel].filter((t): t is number => t !== undefined);
  const effective = tol.length === 0 ? 0 : Math.max(...tol);
  return Math.abs(candidate - spec.value) <= effective + Number.EPSILON;
}
