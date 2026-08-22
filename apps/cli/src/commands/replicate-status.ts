import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldSetManifestSchema } from '@echobench/schema';
import { loadIndex } from '@echobench/runner';
import type { CliContext } from '../main.js';
import { opt, type ParsedArgs } from '../args.js';

export interface EpisodeReplicateStatus {
  episodeId: string;
  completed: number;
  rejected: number;
  failed: number;
  missing: number;
}

export interface ReplicateStatusReport {
  worldSetId: string;
  replicatesPromised: number;
  runSetIds: string[];
  byEpisode: EpisodeReplicateStatus[];
  summary: { fullyReplicated: number; partiallyReplicated: number; notStarted: number };
}

/**
 * Cross-references one or more run sets' trace indices against a frozen
 * world set's promised replicate count -- additive read-only tooling on top
 * of loadIndex/RunManifestSchema, no changes to the runner's execution loop.
 */
export function computeReplicateStatus(
  worldSet: { worldSetId: string; episodeIds: string[]; replicatesPromised: number },
  indexEntries: { episodeId: string; replicate: number; status: 'completed' | 'failed' | 'rejected' }[],
): ReplicateStatusReport {
  const byEpisode = new Map<string, { completed: Set<number>; rejected: Set<number>; failed: Set<number> }>();
  for (const id of worldSet.episodeIds) {
    byEpisode.set(id, { completed: new Set(), rejected: new Set(), failed: new Set() });
  }
  for (const entry of indexEntries) {
    const bucket = byEpisode.get(entry.episodeId);
    if (!bucket) continue; // trace for an episode outside this world set -- ignore
    if (entry.status === 'completed') bucket.completed.add(entry.replicate);
    else if (entry.status === 'rejected') bucket.rejected.add(entry.replicate);
    else bucket.failed.add(entry.replicate);
  }

  const rows: EpisodeReplicateStatus[] = [];
  let fullyReplicated = 0;
  let notStarted = 0;
  for (const episodeId of worldSet.episodeIds) {
    const b = byEpisode.get(episodeId)!;
    const completed = b.completed.size;
    const missing = Math.max(0, worldSet.replicatesPromised - completed);
    rows.push({ episodeId, completed, rejected: b.rejected.size, failed: b.failed.size, missing });
    if (completed >= worldSet.replicatesPromised) fullyReplicated++;
    else if (completed === 0 && b.rejected.size === 0 && b.failed.size === 0) notStarted++;
  }
  const partiallyReplicated = rows.length - fullyReplicated - notStarted;

  return {
    worldSetId: worldSet.worldSetId,
    replicatesPromised: worldSet.replicatesPromised,
    runSetIds: [],
    byEpisode: rows,
    summary: { fullyReplicated, partiallyReplicated, notStarted },
  };
}

export async function cmdReplicateStatus(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const splitArg = opt(args, 'split', 'dev');
  if (splitArg !== 'dev' && splitArg !== 'test') {
    console.error(`[replicate-status] --split must be dev or test, got ${splitArg}`);
    return 2;
  }
  const split = splitArg;
  const worldSetPathArg = opt(args, 'world-set', '');
  if (!worldSetPathArg || !existsSync(worldSetPathArg)) {
    console.error('[replicate-status] --world-set <path> is required and must exist');
    return 2;
  }
  const runSetIdsArg = opt(args, 'run-set-ids', '');
  if (!runSetIdsArg) {
    console.error('[replicate-status] --run-set-ids <id1,id2,...> is required');
    return 2;
  }
  const runSetIds = runSetIdsArg.split(',').map((s) => s.trim()).filter(Boolean);
  const tracesRoot = opt(args, 'traces-dir', join(ctx.repoRoot, 'traces'));

  const worldSet = WorldSetManifestSchema.parse(JSON.parse(readFileSync(worldSetPathArg, 'utf8')));
  if (worldSet.split !== split) {
    console.error(`[replicate-status] world set was frozen for split=${worldSet.split}, not ${split}`);
    return 1;
  }

  const allEntries = runSetIds.flatMap((rs) => loadIndex(tracesRoot, split, rs));
  const report = computeReplicateStatus(worldSet, allEntries);
  report.runSetIds = runSetIds;

  console.log(
    `[replicate-status] world-set=${report.worldSetId} promised=${report.replicatesPromised} ` +
    `run-sets=${runSetIds.join(',')}: fully=${report.summary.fullyReplicated} ` +
    `partial=${report.summary.partiallyReplicated} not-started=${report.summary.notStarted} ` +
    `(of ${report.byEpisode.length} episodes)`,
  );
  const incomplete = report.byEpisode.filter((r) => r.missing > 0);
  for (const r of incomplete.slice(0, 25)) {
    console.log(`  ${r.episodeId}: completed=${r.completed} rejected=${r.rejected} failed=${r.failed} missing=${r.missing}`);
  }
  if (incomplete.length > 25) console.log(`  ... and ${incomplete.length - 25} more incomplete episodes`);
  return 0;
}
