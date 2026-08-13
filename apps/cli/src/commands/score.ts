import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClaimRecord, EpisodeTrace, NormalizedAnswer, Split } from '@echobench/schema';
import { isCorrect } from '@echobench/schema';
import { loadAndValidateDataset, SeededRng } from '@echobench/generator';
import { clusteredBootstrap, scoreAll, type RunSummary, type ScoreReport } from '@echobench/evaluator';
import type { CliContext } from '../main.js';
import { opt, optNumber, type ParsedArgs } from '../args.js';

export interface LoadedRuns {
  runs: RunSummary[];
  modelRequested: string;
}

export function loadRunsFromTraces(tracesDir: string, split: Split, runSetId: string): LoadedRuns {
  const dir = join(tracesDir, split, runSetId);
  if (!existsSync(dir)) throw new Error(`traces directory not found: ${dir}`);
  const runs: RunSummary[] = [];
  let modelRequested = 'deepseek-chat';
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.jsonl') || file === 'index.jsonl') continue;
    const lines = readFileSync(join(dir, file), 'utf8').split('\n').filter((l) => l.trim().length > 0);
    let trace: EpisodeTrace | null = null;
    for (const line of lines) {
      const obj = JSON.parse(line) as { type: string; trace?: EpisodeTrace };
      if (obj.type === 'episode_trace' && obj.trace) trace = obj.trace;
    }
    if (!trace) continue;
    modelRequested = trace.modelRequested;
    runs.push({
      runId: trace.runId,
      episodeId: trace.episodeId,
      replicate: trace.replicate,
      status: trace.status,
      prior: trace.prior,
      finalJudgment: trace.finalJudgment,
      pagesOpened: trace.pagesOpened,
      toolCalls: trace.toolCalls.length,
      inputTokens: trace.inputTokens,
      outputTokens: trace.outputTokens,
      latencyMs: trace.latencyMs,
      estimatedCostUsd: trace.estimatedCostUsd,
      ...(trace.failureReason ? { failureReason: trace.failureReason } : {}),
    });
  }
  return { runs, modelRequested };
}

export async function cmdScore(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const split = opt(args, 'split', 'dev') as Split;
  const dataDir = opt(args, 'data-dir', join(ctx.repoRoot, 'datasets'));
  const tracesDir = opt(args, 'traces-dir', join(ctx.repoRoot, 'traces'));
  const reportsDir = opt(args, 'reports-dir', join(ctx.repoRoot, 'reports'));
  const runSetId = opt(args, 'run-set-id', '');
  const bootstrapResamples = optNumber(args, 'bootstrap', 200);
  if (!runSetId) {
    console.error('[score] --run-set-id <id> is required');
    return 2;
  }

  const { dataset, validation } = loadAndValidateDataset(dataDir, split);
  if (validation.errors.length > 0) {
    console.error(`[score] dataset invalid (${validation.errors.length} errors)`);
    return 1;
  }
  const { runs, modelRequested } = loadRunsFromTraces(tracesDir, split, runSetId);
  if (runs.length === 0) {
    console.error(`[score] no traces found for split=${split} runSet=${runSetId}`);
    return 1;
  }

  const input = {
    split,
    runSetId,
    modelRequested,
    createdAt: new Date().toISOString(),
    runs,
    claims: dataset.claims,
    worlds: dataset.worlds,
  };
  const report = scoreAll(input);

  if (bootstrapResamples > 0) {
    const completedRuns = runs.filter((r) => r.status === 'completed');
    const claimOf = (r: RunSummary): string => dataset.worlds.get(r.episodeId)?.claimId ?? r.episodeId;
    const rng = new SeededRng(`bootstrap-${runSetId}`);
    const seedRng = () => rng.float();
    const easBoot = clusteredBootstrap(
      completedRuns,
      claimOf,
      (sample) => scoreAll({ ...input, runs: sample }).eas,
      { resamples: bootstrapResamples, seedRng },
    );
    const conditionAccuracy = report.conditionAccuracy.map((row) => {
      const subset = completedRuns.filter((r) => dataset.worlds.get(r.episodeId)?.condition === row.condition);
      const boot = clusteredBootstrap(
        subset,
        claimOf,
        (sample) => {
          const done = sample.filter((r) => r.finalJudgment !== null);
          if (done.length === 0) return null;
          const correct = done.filter((r) => {
            const w = dataset.worlds.get(r.episodeId);
            const c = w ? dataset.claims.get(w.claimId) : undefined;
            return c !== undefined && r.finalJudgment !== null && isCorrectFor(c, r.finalJudgment.answer);
          }).length;
          return correct / done.length;
        },
        { resamples: bootstrapResamples, seedRng },
      );
      return { ...row, accuracy: { ...row.accuracy, ci95: boot.ci95 } };
    });
    (report as ScoreReport & { bootstrap?: unknown }).bootstrap = {
      eas: easBoot,
      resamples: bootstrapResamples,
    };
    report.conditionAccuracy = conditionAccuracy;
  }

  const outDir = join(reportsDir, split, runSetId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'score-report.json'), JSON.stringify(report, null, 1) + '\n', 'utf8');

  const csvHeader = 'runId,episodeId,replicate,status,priorCorrect,finalCorrect,confidence,estimatedIndependentSources,toolCalls,inputTokens,outputTokens,latencyMs,estimatedCostUsd';
  const csvRows = runs.map((r) => {
    const world = dataset.worlds.get(r.episodeId);
    const claim = world ? dataset.claims.get(world.claimId) : undefined;
    const priorCorrect = claim && r.prior ? String(isCorrectFor(claim, r.prior.answer)) : '';
    const finalCorrect = claim && r.finalJudgment ? String(isCorrectFor(claim, r.finalJudgment.answer)) : '';
    const confidence = r.finalJudgment ? String(r.finalJudgment.confidence) : '';
    const est = r.finalJudgment ? String(r.finalJudgment.estimatedIndependentSources) : '';
    return [r.runId, r.episodeId, r.replicate, r.status, priorCorrect, finalCorrect, confidence, est, r.toolCalls, r.inputTokens, r.outputTokens, Math.round(r.latencyMs), r.estimatedCostUsd.toFixed(6)].join(',');
  });
  writeFileSync(join(outDir, 'runs.csv'), [csvHeader, ...csvRows].join('\n') + '\n', 'utf8');

  console.log(`[score] runs=${report.totalRuns} completed=${report.completedRuns} EAS=${fmt(report.eas)} FBAR=${fmtStat(report.fbar.value)} CUR=${fmtStat(report.cur.value)}`);
  console.log(`[score] wrote ${join(outDir, 'score-report.json')} and runs.csv`);
  return 0;
}

function isCorrectFor(claim: ClaimRecord, answer: NormalizedAnswer | 'ABSTAIN'): boolean {
  return isCorrect(claim, answer);
}

function fmt(v: number | null): string {
  return v === null ? 'n/a' : v.toFixed(4);
}

function fmtStat(v: number | null): string {
  return fmt(v);
}
