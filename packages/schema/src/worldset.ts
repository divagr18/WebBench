import { z } from 'zod';
import { SplitSchema } from './claim.js';

/**
 * A frozen, named subset of episode IDs that multiple run invocations (across
 * different models/configs, possibly at different times) can be pointed at
 * via `echobench run --world-set <path>`, so "the same fixed world set" is a
 * saved, auditable artifact instead of an emergent property of matching
 * --plan-seed/--max-runs by hand.
 *
 * Pairs with `echobench replicate-status`, which cross-references trace
 * indices against `replicatesPromised` to report how many of the promised
 * replicates are actually done, per episode, per run set.
 */
export const WorldSetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  worldSetId: z.string().min(1),
  split: SplitSchema,
  episodeIds: z.array(z.string()).min(1),
  replicatesPromised: z.number().int().positive(),
  createdAt: z.string(),
  /** manifest.integrityChecksum of the dataset this world set was frozen from,
   *  so a later run can detect if the underlying dataset has since changed. */
  sourceDatasetManifestHash: z.string(),
  note: z.string().optional(),
});
export type WorldSetManifest = z.infer<typeof WorldSetManifestSchema>;

export function worldSetManifestErrors(w: WorldSetManifest): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const id of w.episodeIds) {
    if (seen.has(id)) errs.push(`duplicate episodeId in world set: ${id}`);
    seen.add(id);
  }
  return errs;
}
