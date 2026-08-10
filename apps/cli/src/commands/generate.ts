import { join } from 'node:path';
import { CONDITIONS, episodeIdOf, type Split, type WorldManifest } from '@echobench/schema';
import { buildCorpus, buildWorld, loadPrompts, renderWorld, writeDataset, GENERATOR_VERSION } from '@echobench/generator';
import { makeDeepSeekClient, type CliContext } from '../main.js';
import { opt, optNumber, type ParsedArgs } from '../args.js';

export async function cmdGenerate(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const splitArg = opt(args, 'split', 'dev');
  const dataDir = opt(args, 'data-dir', join(ctx.repoRoot, 'datasets'));
  const createdAt = opt(args, 'created-at', '2026-08-11T00:00:00Z');
  const worldDate = opt(args, 'world-date', '2031-05-01');
  const seed = opt(args, 'seed', 'echobench-v1');
  const concurrency = optNumber(args, 'concurrency', 8);
  const skipProse = args.flags.has('skip-prose');

  const splits: Split[] = splitArg === 'all' ? ['dev', 'test'] : [splitArg as Split];

  const corpus = buildCorpus();
  const bundle = loadPrompts(ctx.repoRoot);
  const client = skipProse ? null : makeDeepSeekClient(ctx);

  for (const split of splits) {
    const claims = split === 'dev' ? corpus.dev : corpus.test;
    console.log(`[generate] split=${split} claims=${claims.length} episodes=${claims.length * CONDITIONS.length} prose=${client ? client.defaultModel : 'skip'} concurrency=${client ? concurrency : 0}`);

    interface BuildTask {
      claim: (typeof claims)[number];
      condition: (typeof CONDITIONS)[number];
    }
    const tasks: BuildTask[] = [];
    for (const claim of claims) {
      for (const condition of CONDITIONS) tasks.push({ claim, condition });
    }

    const results = new Map<string, WorldManifest>();
    let rendered = 0;
    let fallback = 0;
    let retries = 0;
    let cost = 0;
    let done = 0;

    const worker = async () => {
      while (tasks.length > 0) {
        const task = tasks.shift();
        if (!task) return;
        let world = buildWorld(task.claim, task.condition, { createdAt, proseModel: null });
        if (client) {
          const r = await renderWorld(client, task.claim, world, bundle);
          world = r.world;
          rendered += r.stats.pagesRendered;
          fallback += r.stats.pagesFallback;
          retries += r.stats.extractionRetries;
          cost += r.stats.estimatedCostUsd;
        }
        results.set(world.episodeId, world);
        done++;
        if (done % 12 === 0 || done === tasks.length) {
          console.log(`[generate] ${split}: ${done}/${claims.length * CONDITIONS.length} worlds (rendered=${rendered} fallback=${fallback} retries=${retries} cost=$${cost.toFixed(3)})`);
        }
      }
    };
    const workers = client ? Math.max(1, concurrency) : 1;
    await Promise.all(Array.from({ length: workers }, () => worker()));

    const worlds: WorldManifest[] = [];
    for (const claim of claims) {
      for (const condition of CONDITIONS) {
        const world = results.get(episodeIdOf(claim.claimId, condition));
        if (!world) throw new Error(`missing world for ${claim.claimId}/${condition}`);
        worlds.push(world);
      }
    }

    const manifest = writeDataset(dataDir, split, claims, worlds, {
      datasetName: `echobench-${split}`,
      createdAt,
      seed,
      worldDate,
      proseModel: client ? client.defaultModel : null,
      renderStats: { pagesRendered: rendered, pagesFallback: fallback, extractionRetries: retries, estimatedCostUsd: cost },
    });
    console.log(`[generate] wrote ${split}: episodes=${manifest.episodeCount} generator=${GENERATOR_VERSION} integrity=${manifest.integrityChecksum.slice(0, 12)}…`);
  }
  return 0;
}
