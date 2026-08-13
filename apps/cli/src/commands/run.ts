import { join } from 'node:path';
import { CONDITIONS, type DatasetManifest, type Split } from '@echobench/schema';
import { loadAndValidateDataset, loadPrompts, SeededRng } from '@echobench/generator';
import { HttpToolGateway, runAll, type PlannedRun } from '@echobench/runner';
import { isValidProvider, makeEvalClient, type CliContext } from '../main.js';
import { opt, optNumber, type ParsedArgs } from '../args.js';
import { startEchoWeb, makeEmbedQuery } from '../serveHelper.js';

export function selectPlans(manifest: DatasetManifest, maxRuns: number, replicates: number, seed: string): PlannedRun[] {
  const byClaim = new Map<string, string[]>();
  for (const [episodeId, entry] of Object.entries(manifest.episodes)) {
    const list = byClaim.get(entry.claimId) ?? [];
    list.push(episodeId);
    byClaim.set(entry.claimId, list);
  }
  const condIndex = (episodeId: string): number => {
    const cond = manifest.episodes[episodeId]?.condition;
    return cond ? CONDITIONS.indexOf(cond) : 99;
  };

  const claims = [...byClaim.keys()].sort();
  const rng = new SeededRng(seed);
  for (let i = claims.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const a = claims[i];
    const b = claims[j];
    if (a !== undefined && b !== undefined) {
      claims[i] = b;
      claims[j] = a;
    }
  }

  const plans: PlannedRun[] = [];
  for (const claimId of claims) {
    const episodes = (byClaim.get(claimId) ?? []).slice().sort((a, b) => condIndex(a) - condIndex(b) || a.localeCompare(b));
    for (const episodeId of episodes) {
      for (let r = 0; r < replicates; r++) {
        if (plans.length >= maxRuns) return plans;
        plans.push({ episodeId, replicate: r });
      }
    }
  }
  return plans;
}

export async function cmdRun(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const splitArg = opt(args, 'split', 'dev');
  if (splitArg !== 'dev' && splitArg !== 'test') {
    console.error(`[run] --split must be dev or test, got ${splitArg}`);
    return 2;
  }
  const split = splitArg;
  const provider = opt(args, 'provider', 'deepseek');
  if (!isValidProvider(provider)) {
    console.error(`[run] --provider must be one of deepseek, openai, modelscope, openrouter; got ${provider}`);
    return 2;
  }
  const modelArg = opt(args, 'model', '') || null;
  const dataDir = opt(args, 'data-dir', join(ctx.repoRoot, 'datasets'));
  const tracesDir = opt(args, 'traces-dir', join(ctx.repoRoot, 'traces'));
  const maxRuns = optNumber(args, 'max-runs', 100);
  const replicates = optNumber(args, 'replicates', 1);
  const budgetUsd = optNumber(args, 'budget-usd', 50);
  const maxToolCalls = optNumber(args, 'max-tool-calls', 20);
  const temperature = optNumber(args, 'temperature', 0.7);
  const planSeed = opt(args, 'plan-seed', `plan-${split}-v1`);
  const now = new Date();
  const runSetId = opt(args, 'run-set-id', `run-${split}-${now.toISOString().slice(0, 16).replace(/[:T-]/g, '')}`);

  const { dataset, validation } = loadAndValidateDataset(dataDir, split);
  if (validation.errors.length > 0) {
    console.error(`[run] dataset invalid (${validation.errors.length} errors); refusing to run. See 'echobench validate'.`);
    return 1;
  }

  const plans = selectPlans(dataset.manifest, maxRuns, replicates, planSeed);
  if (plans.length === 0) {
    console.error('[run] no episodes to run.');
    return 1;
  }

  const worlds = [...dataset.worlds.values()];
  const embedQuery = await makeEmbedQuery();
  const { baseUrl, close } = await startEchoWeb(worlds, 0, '127.0.0.1', embedQuery ? { embedQuery } : {});
  console.log(`[run] echoweb at ${baseUrl}; plan=${plans.length} runs split=${split} runSet=${runSetId} budget=$${budgetUsd}${embedQuery ? ' hybrid-search=on' : ' search=bm25-only'}`);

  const llm = makeEvalClient(ctx, provider, modelArg ?? undefined);
  const bundle = loadPrompts(ctx.repoRoot);
  console.log(`[run] provider=${provider} model=${llm.defaultModel}`);

  try {
    const outcome = await runAll(
      {
        llm,
        bundle,
        worlds: dataset.worlds,
        claims: dataset.claims,
        gatewayFor: (world) => new HttpToolGateway(baseUrl, world.worldToken),
      },
      {
        datasetRoot: dataDir,
        tracesRoot: tracesDir,
        split,
        runSetId,
        provider,
        modelRequested: llm.defaultModel,
        replicatesPerEpisode: replicates,
        maxToolCalls,
        temperature,
        budgetUsd,
        baseSeed: planSeed,
        plans,
      },
    );

    console.log(
      `[run] done: completed=${outcome.completed} failed=${outcome.failed} rejected=${outcome.rejected} skipped=${outcome.skipped} cost=$${outcome.totalCostUsd.toFixed(4)}${outcome.stoppedForBudget ? ' (budget reached)' : ''}`,
    );
    return outcome.failed > 0 && outcome.completed === 0 ? 1 : 0;
  } finally {
    await close();
  }
}
