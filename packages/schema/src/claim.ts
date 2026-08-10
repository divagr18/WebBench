import { z } from 'zod';
import { AnswerSpecSchema, NormalizedAnswerSchema } from './answer.js';

export const TrackSchema = z.enum(['synthetic', 'real']);
export type Track = z.infer<typeof TrackSchema>;

export const DomainSchema = z.enum([
  'technology',
  'science',
  'policy',
  'economics',
  'history_geo',
  'consumer',
]);
export type Domain = z.infer<typeof DomainSchema>;

export const SplitSchema = z.enum(['dev', 'test']);
export type Split = z.infer<typeof SplitSchema>;

export const TaskStyleSchema = z.enum([
  'direct-verification',
  'research-question',
  'contradiction-resolution',
  'breaking-news',
]);
export type TaskStyle = z.infer<typeof TaskStyleSchema>;

export const PoisonHintSchema = z.enum([
  'boolean-flip',
  'enum-alternative',
  'numeric-perturb',
  'alias-near-miss',
]);
export type PoisonHint = z.infer<typeof PoisonHintSchema>;

/**
 * A claim is the unit of evaluation. Truth is generated programmatically
 * BEFORE prose; `prior` captures the documented earlier state (used to build
 * legitimate_update worlds and stale pages) and `groundTruth` is the state of
 * the world as of `asOfDate`.
 */
export const PriorStateSchema = z.object({
  value: NormalizedAnswerSchema,
  /** ISO date: the prior value stopped being true on this date. */
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
});
export type PriorState = z.infer<typeof PriorStateSchema>;

export const UpdatedStateSchema = z.object({
  /** ISO date the updated value became true. */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
});
export type UpdatedState = z.infer<typeof UpdatedStateSchema>;

/** Real-fact track only: provenance of the curated ground truth. */
export const RealEvidenceSchema = z.object({
  sourceUrl: z.string().url(),
  primarySourceName: z.string(),
  /** ISO date the evidence was retrieved/checked. */
  retrievalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Normalized evidence note (paraphrased, not copyrighted text). */
  evidenceNote: z.string().min(20),
  /** sha256(evidenceNote + '|' + sourceUrl) — integrity anchor. */
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RealEvidence = z.infer<typeof RealEvidenceSchema>;

export const ClaimReviewSchema = z.object({
  status: z.enum(['approved', 'pending']),
  /** Named reviewers; MVP substitutes machine validation + delegated sign-off. */
  reviewers: z.array(z.string()),
  method: z.string(),
  timestamp: z.string(),
});
export type ClaimReview = z.infer<typeof ClaimReviewSchema>;

export const ClaimRecordSchema = z.object({
  claimId: z.string().regex(/^(syn|real)_\d{3}$/),
  track: TrackSchema,
  domain: DomainSchema,
  answerType: z.enum(['boolean', 'enum', 'string', 'numeric']),
  /** 1=easy surface consensus, 2=laundered/structural, 3=temporal/adversarial. */
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  taskStyle: TaskStyleSchema,
  /** The task prompt shown to the evaluated model. */
  question: z.string().min(10),
  /** Short label of the attribute under test, e.g. "VAT standard rate". */
  attributeLabel: z.string().min(3),
  /** Primary entity of the claim (fictional for synthetic track). */
  entityName: z.string().min(2),
  answerSpec: AnswerSpecSchema,
  /** Current (post-transition) truth, correct answer at evaluation time. */
  groundTruth: NormalizedAnswerSchema,
  /** Documented earlier state. Required for all MVP claims. */
  prior: PriorStateSchema,
  updated: UpdatedStateSchema,
  /** Truth is evaluated as of this date; world timestamps are around it. */
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Extra search keywords that should surface this claim's topic. */
  keywords: z.array(z.string()),
  poisonHint: PoisonHintSchema,
  split: SplitSchema,
  /** Required (validated cross-field) iff track === 'real'. */
  realEvidence: RealEvidenceSchema.optional(),
  review: ClaimReviewSchema,
});
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;

/** Extra cross-field invariants that Zod alone cannot express. */
export function claimRecordErrors(c: ClaimRecord): string[] {
  const errs: string[] = [];
  if (c.track === 'real' && !c.realEvidence) {
    errs.push('real-track claim requires realEvidence');
  }
  if (c.track === 'synthetic' && c.realEvidence) {
    errs.push('synthetic claim must not carry realEvidence');
  }
  if (c.answerSpec.kind !== c.answerType) {
    errs.push(`answerSpec.kind (${c.answerSpec.kind}) != answerType (${c.answerType})`);
  }
  if (c.prior.value.kind !== c.answerType) {
    errs.push('prior.value kind mismatch');
  }
  if (c.groundTruth.kind !== c.answerType) {
    errs.push('groundTruth kind mismatch');
  }
  if (c.track === 'synthetic' && !c.claimId.startsWith('syn_')) {
    errs.push('synthetic claim id must start with syn_');
  }
  if (c.track === 'real' && !c.claimId.startsWith('real_')) {
    errs.push('real claim id must start with real_');
  }
  if (c.prior.validUntil > c.updated.asOf) {
    errs.push('prior.validUntil later than updated.asOf');
  }
  if (c.asOfDate < c.updated.asOf) {
    errs.push('asOfDate earlier than updated.asOf (truth not yet in effect)');
  }
  return errs;
}
