import { z } from 'zod';
import { FinalJudgmentSchema, PriorResponseSchema } from './judgment.js';

export const ProviderIdSchema = z.enum(['deepseek', 'openai', 'modelscope', 'openrouter']);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const TraceSearchCallSchema = z.object({
  type: z.literal('search_call'),
  query: z.string(),
  site: z.string().nullable(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  cursor: z.string().nullable(),
  resultCount: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
});

export const TraceOpenPageCallSchema = z.object({
  type: z.literal('open_page_call'),
  pageId: z.string(),
  found: z.boolean(),
});

export const TraceToolCallSchema = z.discriminatedUnion('type', [
  TraceSearchCallSchema,
  TraceOpenPageCallSchema,
]);
export type TraceToolCall = z.infer<typeof TraceToolCallSchema>;

export const SchemaRepairAttemptSchema = z.object({
  reason: z.string(),
  succeeded: z.boolean(),
});

/** One append-only trace record; the full ordered log is stored per run. */
export const EpisodeTraceSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  episodeId: z.string(),
  worldToken: z.string(),
  replicate: z.number().int().nonnegative(),
  provider: ProviderIdSchema,
  modelRequested: z.string(),
  modelReturned: z.string().nullable(),
  seedRequested: z.string().nullable(),
  seedSupported: z.boolean(),
  prior: PriorResponseSchema.nullable(),
  toolCalls: z.array(TraceToolCallSchema),
  pagesOpened: z.array(z.string()),
  finalJudgment: FinalJudgmentSchema.nullable(),
  schemaRepairAttempts: z.array(SchemaRepairAttemptSchema),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(['completed', 'failed', 'rejected']),
  failureReason: z.string().nullable(),
});
export type EpisodeTrace = z.infer<typeof EpisodeTraceSchema>;

export const RunManifestEntrySchema = z.object({
  runId: z.string(),
  episodeId: z.string(),
  replicate: z.number().int().nonnegative(),
  tracePath: z.string(),
  status: z.enum(['completed', 'failed', 'rejected']),
  modelReturned: z.string().nullable(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RunManifestEntry = z.infer<typeof RunManifestEntrySchema>;

export const RunManifestSchema = z.object({
  schemaVersion: z.literal(1),
  runSetId: z.string(),
  split: z.enum(['dev', 'test']),
  provider: ProviderIdSchema,
  modelRequested: z.string(),
  replicatesPerEpisode: z.number().int().nonnegative(),
  createdAt: z.string(),
  entries: z.array(RunManifestEntrySchema),
});
export type RunManifest = z.infer<typeof RunManifestSchema>;
