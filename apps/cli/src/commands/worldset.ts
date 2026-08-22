import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldSetManifestSchema, type Split } from '@echobench/schema';
import { loadAndValidateDataset } from '@echobench/generator';
import type { CliContext } from '../main.js';
import { opt, type ParsedArgs } from '../args.js';

/**
 * `echobench worldset create --split dev --world-set-id <id> [--episode-ids-file <path>]`
 *
 * Freezes an explicit, named episode-id list so multiple `echobench run`
 * invocations (across different models/configs, possibly run at different
 * times) can be pointed at the exact same set via `run --world-set <path>`,
 * instead of a fixed subset being an emergent, undeclared property of
 * matching --plan-seed/--max-runs by hand.
 *
 * Without --episode-ids-file, freezes every episode in the split's dataset
 * manifest. With it (one episodeId per line), freezes that explicit subset
 * instead -- e.g. a curated common-episode set from cross_field_data.json.
 */
export function worldSetPath(dataDir: string, split: Split, worldSetId: string): string {
  return join(dataDir, split, 'worldsets', `${worldSetId}.json`);
}

export async function cmdWorldset(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const action = args.positionals[0] ?? '';
  if (action !== 'create') {
    console.error(`[worldset] unknown action '${action}'. Usage: echobench worldset create --split <dev|test> --world-set-id <id> [--replicates-promised <n>] [--episode-ids-file <path>]`);
    return 2;
  }

  const splitArg = opt(args, 'split', 'dev');
  if (splitArg !== 'dev' && splitArg !== 'test') {
    console.error(`[worldset] --split must be dev or test, got ${splitArg}`);
    return 2;
  }
  const split = splitArg;
  const worldSetId = opt(args, 'world-set-id', '');
  if (!worldSetId) {
    console.error('[worldset] --world-set-id <id> is required');
    return 2;
  }
  const dataDir = opt(args, 'data-dir', join(ctx.repoRoot, 'datasets'));
  const replicatesPromised = Number(opt(args, 'replicates-promised', '3'));
  const episodeIdsFile = opt(args, 'episode-ids-file', '');

  const { dataset, validation } = loadAndValidateDataset(dataDir, split);
  if (validation.errors.length > 0) {
    console.error(`[worldset] dataset invalid (${validation.errors.length} errors); refusing to freeze a world set against it.`);
    return 1;
  }

  let episodeIds: string[];
  if (episodeIdsFile) {
    if (!existsSync(episodeIdsFile)) {
      console.error(`[worldset] --episode-ids-file not found: ${episodeIdsFile}`);
      return 1;
    }
    episodeIds = readFileSync(episodeIdsFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const unknown = episodeIds.filter((id) => !dataset.manifest.episodes[id]);
    if (unknown.length > 0) {
      console.error(`[worldset] ${unknown.length} episode id(s) in --episode-ids-file are not in the ${split} dataset manifest, e.g. ${unknown.slice(0, 5).join(', ')}`);
      return 1;
    }
  } else {
    episodeIds = Object.keys(dataset.manifest.episodes).sort();
  }

  const out = WorldSetManifestSchema.parse({
    schemaVersion: 1,
    worldSetId,
    split,
    episodeIds,
    replicatesPromised,
    createdAt: new Date().toISOString(),
    sourceDatasetManifestHash: dataset.manifest.integrityChecksum,
  });

  const path = worldSetPath(dataDir, split, worldSetId);
  mkdirSync(join(dataDir, split, 'worldsets'), { recursive: true });
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log(`[worldset] wrote ${path}: ${episodeIds.length} episodes, ${replicatesPromised} replicates promised`);
  return 0;
}
