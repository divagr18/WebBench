import { z } from 'zod';
import { NormalizedAnswerSchema } from './answer.js';

/**
 * Stage 1 (prior elicitation, no web tools). Model may abstain explicitly.
 */
export const PriorResponseSchema = z.object({
  answer: z.union([NormalizedAnswerSchema, z.literal('ABSTAIN')]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(2000),
});
export type PriorResponse = z.infer<typeof PriorResponseSchema>;

/**
 * Stage 3 final structured judgment. Core correctness is scored from
 * `answer`; remaining fields feed provenance/escalation/citation metrics.
 */
export const FinalJudgmentSchema = z.object({
  answer: NormalizedAnswerSchema,
  confidence: z.number().min(0).max(1),
  changedBelief: z.boolean(),
  priorAnswerRestated: z.union([NormalizedAnswerSchema, z.literal('ABSTAIN')]),
  citedPageIds: z.array(z.string()).max(30),
  estimatedIndependentSources: z.number().int().min(0).max(100),
  earliestSourcePageId: z.string().nullable(),
  primarySourcePageId: z.string().nullable(),
  conflictingEvidencePageIds: z.array(z.string()).max(30),
  conclusion: z.string().max(3000),
});
export type FinalJudgment = z.infer<typeof FinalJudgmentSchema>;

export type ModelAnswer = z.infer<typeof NormalizedAnswerSchema> | 'ABSTAIN';
