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

export const ClaimReviewSchema = z.object({
  status: z.enum(['approved', 'pending']),
  reviewers: z.array(z.string()),
  method: z.string(),
  timestamp: z.string(),
});
export type ClaimReview = z.infer<typeof ClaimReviewSchema>;

export const PriorStateSchema = z.object({
  value: NormalizedAnswerSchema,
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
});
export type PriorState = z.infer<typeof PriorStateSchema>;

export const UpdatedStateSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
});
export type UpdatedState = z.infer<typeof UpdatedStateSchema>;

/** Real-fact track only: provenance of the curated ground truth. */
export const RealEvidenceSchema = z.object({
  sourceUrl: z.string().url(),
  primarySourceName: z.string(),
  retrievalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidenceNote: z.string().min(20),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RealEvidence = z.infer<typeof RealEvidenceSchema>;

/**
 * A claim is the unit of evaluation. Truth is fixed programmatically BEFORE
 * prose. `prior`/`updated` capture a documented transition so every claim can
 * be instantiated under all six counterfactual conditions. `poisonValue` is a
 * curated/generated false value used by adversarial conditions; it must differ
 * from groundTruth.
 */
export const ClaimRecordSchema = z.object({
  claimId: z.string().regex(/^(syn|real)_\d{3}$/),
  track: TrackSchema,
  domain: DomainSchema,
  answerType: z.enum(['boolean', 'enum', 'string', 'numeric']),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  taskStyle: TaskStyleSchema,
  question: z.string().min(10),
  attributeLabel: z.string().min(3),
  entityName: z.string().min(2),
  answerSpec: AnswerSpecSchema,
  groundTruth: NormalizedAnswerSchema,
  prior: PriorStateSchema,
  updated: UpdatedStateSchema,
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** False value asserted by adversarial pages; must differ from groundTruth. */
  poisonValue: NormalizedAnswerSchema,
  /**
   * Deterministic human phrasing for each of the claim's three values, so prose
   * rendering never has to invent wording (ground=current truth, prior=stale-but-
   * true before the transition, poison=fabricated false value).
   */
  phraseGround: z.string().min(4),
  phrasePrior: z.string().min(4),
  phrasePoison: z.string().min(4),
  keywords: z.array(z.string()),
  split: SplitSchema,
  realEvidence: RealEvidenceSchema.optional(),
  review: ClaimReviewSchema,
});
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;

export function claimRecordErrors(c: ClaimRecord): string[] {
  const errs: string[] = [];
  if (c.track === 'real' && !c.realEvidence) errs.push('real-track claim requires realEvidence');
  if (c.track === 'synthetic' && c.realEvidence) errs.push('synthetic claim must not carry realEvidence');
  if (c.answerSpec.kind !== c.answerType) errs.push(`answerSpec.kind (${c.answerSpec.kind}) != answerType (${c.answerType})`);
  if (c.prior.value.kind !== c.answerType) errs.push('prior.value kind mismatch');
  if (c.groundTruth.kind !== c.answerType) errs.push('groundTruth kind mismatch');
  if (c.poisonValue.kind !== c.answerType) errs.push('poisonValue kind mismatch');
  if (c.track === 'synthetic' && !c.claimId.startsWith('syn_')) errs.push('synthetic claim id must start with syn_');
  if (c.track === 'real' && !c.claimId.startsWith('real_')) errs.push('real claim id must start with real_');
  if (c.prior.validUntil > c.updated.asOf) errs.push('prior.validUntil later than updated.asOf');
  if (c.asOfDate < c.updated.asOf) errs.push('asOfDate earlier than updated.asOf (truth not yet in effect)');
  if (JSON.stringify(c.poisonValue) === JSON.stringify(c.groundTruth)) {
    errs.push('poisonValue must differ from groundTruth');
  }
  return errs;
}
