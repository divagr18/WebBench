import { z } from 'zod';
import { ConditionSchema } from './world.js';

export const DatasetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  split: z.enum(['dev', 'test']),
  version: z.string(),
  createdAt: z.string(),
  seed: z.string(),
  worldDate: z.string(),
  proseModel: z.string().nullable(),
  embeddingModel: z.string().nullable().optional(),
  claimCount: z.number().int().nonnegative(),
  episodeCount: z.number().int().nonnegative(),
  claims: z.array(z.object({
    claimId: z.string(),
    track: z.enum(['synthetic', 'real']),
    domain: z.string(),
    answerType: z.enum(['boolean', 'enum', 'string', 'numeric']),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    file: z.string(),
  })),
  episodes: z.record(z.string(), z.object({
    episodeId: z.string(),
    condition: ConditionSchema,
    claimId: z.string(),
    file: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })),
  integrityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  renderStats: z.object({
    pagesRendered: z.number().int().nonnegative(),
    pagesFallback: z.number().int().nonnegative(),
    extractionRetries: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
  }).optional(),
});
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;

export const SplitPairSchema = z.object({
  dev: z.string(),
  test: z.string(),
});
export type SplitPair = z.infer<typeof SplitPairSchema>;
