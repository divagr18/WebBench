import type { Split } from '@echobench/schema';
import { EpisodeTraceSchema, RunManifestSchema, type EpisodeTrace, type ProviderId } from '@echobench/schema';
import type { PromptBundle } from '@echobench/generator';
import type { WorldManifest, ClaimRecord } from '@echobench/schema';
import type { LlmLike } from './llmIface.js';
import type { ToolGateway } from './gateway.js';
import { runEpisode } from './agent.js';
import { appendIndex, loadIndex, tracePathFor, writeRunManifest, writeTraceLines, type TraceMeta } from './traces.js';

export interface PlannedRun {
  episodeId: string;
  replicate: number;
}

export interface RunnerDeps {
  llm: LlmLike;
  bundle: PromptBundle;
  worlds: Map<string, WorldManifest>;
  claims: Map<string, ClaimRecord>;
  gatewayFor: (world: WorldManifest) => ToolGateway;
}

export interface RunnerConfig {
  datasetRoot: string;
  tracesRoot: string;
  split: Split;
  runSetId: string;
  provider: ProviderId;
  modelRequested: string;
  replicatesPerEpisode: number;
  maxToolCalls: number;
  temperature: number;
  budgetUsd: number;
  baseSeed: string;
  plans: PlannedRun[];
}

export interface RunnerOutcome {
  completed: number;
  failed: number;
  rejected: number;
  skipped: number;
  totalCostUsd: number;
  stoppedForBudget: boolean;
}

export async function runAll(deps: RunnerDeps, config: RunnerConfig): Promise<RunnerOutcome> {
  const existing = loadIndex(config.tracesRoot, config.split, config.runSetId);
  const keyOf = (episodeId: string, replicate: number) => `${episodeId}|${replicate}`;
  const terminalKeys = new Set(existing.filter((e) => e.status === 'completed' || e.status === 'rejected').map((e) => keyOf(e.episodeId, e.replicate)));

  const outcome: RunnerOutcome = { completed: 0, failed: 0, rejected: 0, skipped: 0, totalCostUsd: 0, stoppedForBudget: false };
  const entriesByKey = new Map<string, { runId: string; episodeId: string; replicate: number; tracePath: string; status: 'completed' | 'failed' | 'rejected'; modelReturned: string | null; checksum: string; finishedAt: string }>();
  for (const e of existing) entriesByKey.set(keyOf(e.episodeId, e.replicate), { ...e, finishedAt: e.finishedAt });

  const queue = config.plans.filter((p) => !terminalKeys.has(keyOf(p.episodeId, p.replicate)));
  outcome.skipped = config.plans.length - queue.length;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let pending = queue;

  for (let sweep = 0; sweep < 2; sweep++) {
    if (sweep === 1 && pending.length > 0) {
      console.log(`[run] retry sweep: ${pending.length} failed run(s) after 30s pause ...`);
      await sleep(30000);
    }
    const failedThisSweep: PlannedRun[] = [];
    for (const plan of pending) {
      if (outcome.totalCostUsd >= config.budgetUsd) {
        outcome.stoppedForBudget = true;
        break;
      }
      const entry = await executeRun(deps, config, plan);
      outcome.totalCostUsd += entry.costUsd;
      entriesByKey.set(keyOf(plan.episodeId, plan.replicate), entry.entry);
      if (entry.status === 'completed') outcome.completed++;
      else if (entry.status === 'rejected') outcome.rejected++;
      else failedThisSweep.push(plan);
    }
    pending = failedThisSweep;
    if (pending.length === 0 || outcome.stoppedForBudget) break;
  }
  outcome.failed = pending.length;

  const manifest = {
    schemaVersion: 1,
    runSetId: config.runSetId,
    split: config.split,
    provider: config.provider,
    modelRequested: config.modelRequested,
    replicatesPerEpisode: config.replicatesPerEpisode,
    createdAt: new Date().toISOString(),
    entries: [...entriesByKey.values()],
  };
  const validatedManifest = RunManifestSchema.parse(manifest);
  writeRunManifest(config.tracesRoot, config.split, config.runSetId, validatedManifest);

  return outcome;
}

async function executeRun(
  deps: RunnerDeps,
  config: RunnerConfig,
  plan: PlannedRun,
): Promise<{ status: 'completed' | 'failed' | 'rejected'; costUsd: number; entry: { runId: string; episodeId: string; replicate: number; tracePath: string; status: 'completed' | 'failed' | 'rejected'; modelReturned: string | null; checksum: string; finishedAt: string } }> {
  const world = deps.worlds.get(plan.episodeId);
  if (!world) throw new Error(`world not found for episode ${plan.episodeId}`);
  const claim = deps.claims.get(world.claimId);
  if (!claim) throw new Error(`claim not found for episode ${plan.episodeId}`);

  const runId = `${plan.episodeId}__r${plan.replicate}__${Date.now().toString(36)}`;
  const gateway = deps.gatewayFor(world);
  const startedAt = new Date().toISOString();

  const meta: TraceMeta = {
    type: 'meta',
    runId,
    episodeId: plan.episodeId,
    claimId: claim.claimId,
    condition: world.condition,
    split: config.split,
    replicate: plan.replicate,
    provider: config.provider,
    modelRequested: config.modelRequested,
    worldToken: world.worldToken,
    callBudget: config.maxToolCalls,
    temperature: config.temperature,
    promptHashes: deps.bundle.hashes,
    startedAt,
  };
  const traceFile = tracePathFor(config.tracesRoot, config.split, config.runSetId, plan.episodeId, plan.replicate);
  writeTraceLines(traceFile, [meta]);

  const result = await runEpisode(claim, world, deps.bundle, deps.llm, gateway, {
    runId,
    replicate: plan.replicate,
    maxToolCalls: config.maxToolCalls,
    temperature: config.temperature,
  }, config.modelRequested);

  const trace: EpisodeTrace = {
    schemaVersion: 1,
    runId,
    episodeId: plan.episodeId,
    worldToken: world.worldToken,
    replicate: plan.replicate,
    provider: config.provider,
    modelRequested: config.modelRequested,
    modelReturned: result.modelReturned,
    seedRequested: config.baseSeed,
    seedSupported: false,
    prior: result.prior,
    toolCalls: result.toolCallLog.map((t) =>
      t.type === 'search_call'
        ? { type: 'search_call', query: t.detail, site: null, dateFrom: null, dateTo: null, cursor: null, resultCount: 0, totalResults: 0 }
        : { type: 'open_page_call', pageId: t.detail, found: true },
    ),
    pagesOpened: result.pagesOpened,
    finalJudgment: result.finalJudgment,
    schemaRepairAttempts: result.schemaRepairAttempts,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: result.latencyMs,
    estimatedCostUsd: result.estimatedCostUsd,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status,
    failureReason: result.failureReason,
  };
  const validatedTrace = EpisodeTraceSchema.parse(trace);

  const checksum = sha256HexSafe(JSON.stringify(validatedTrace));
  writeTraceLines(traceFile, [{ type: 'episode_trace', trace: validatedTrace }]);

  const entry = {
    runId,
    episodeId: plan.episodeId,
    replicate: plan.replicate,
    tracePath: traceFile,
    status: validatedTrace.status,
    modelReturned: validatedTrace.modelReturned,
    checksum,
    finishedAt: validatedTrace.finishedAt ?? new Date().toISOString(),
  };
  appendIndexEntry(config, entry);
  return { status: validatedTrace.status, costUsd: validatedTrace.estimatedCostUsd, entry };
}

function appendIndexEntry(config: RunnerConfig, entry: { runId: string; episodeId: string; replicate: number; tracePath: string; status: 'completed' | 'failed' | 'rejected'; modelReturned: string | null; checksum: string }): void {
  appendIndex(config.tracesRoot, config.split, config.runSetId, { ...entry, finishedAt: new Date().toISOString() });
}

import { createHash } from 'node:crypto';
function sha256HexSafe(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
