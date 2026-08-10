import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CliContext } from '../main.js';
import { opt, type ParsedArgs } from '../args.js';

export async function cmdReport(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const split = opt(args, 'split', 'dev');
  const runSetId = opt(args, 'run-set-id', '');
  const reportsDir = opt(args, 'reports-dir', join(ctx.repoRoot, 'reports'));
  if (!runSetId) {
    console.error('[report] --run-set-id <id> is required');
    return 2;
  }

  const outDir = join(reportsDir, split, runSetId);
  const scorePath = join(outDir, 'score-report.json');
  if (!existsSync(scorePath)) {
    console.error(`[report] missing score report: ${scorePath} (run 'echobench score' first)`);
    return 1;
  }
  const score = JSON.parse(readFileSync(scorePath, 'utf8')) as Record<string, unknown>;
  writeFileSync(join(outDir, 'report.md'), renderMarkdown(score), 'utf8');
  console.log(`[report] wrote ${join(outDir, 'report.md')}`);

  const analysisScript = join(ctx.repoRoot, 'analysis', 'report.py');
  if (existsSync(analysisScript)) {
    const py = spawnSync('python', [analysisScript, '--score', scorePath, '--out', outDir], { encoding: 'utf8' });
    if (py.status === 0) {
      console.log(`[report] python analysis complete -> ${outDir}`);
    } else {
      console.warn(`[report] python analysis failed (status ${py.status}); tables only.\n${(py.stderr ?? '').slice(0, 800)}`);
    }
  }
  return 0;
}

function renderMarkdown(score: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('# EchoBench run report');
  lines.push('');
  lines.push(`- runSetId: \`${score.runSetId}\``);
  lines.push(`- split: \`${score.split}\``);
  lines.push(`- model: \`${score.modelRequested}\``);
  lines.push(`- createdAt: ${score.createdAt}`);
  lines.push(`- runs: ${score.totalRuns} total, ${score.completedRuns} completed, ${score.failedRuns} failed, ${score.rejectedRuns} rejected`);
  lines.push('');
  lines.push('## Headline metrics');
  lines.push('');
  lines.push('| Metric | Value | Numerator | Denominator |');
  lines.push('|---|---|---|---|');
  const metricRows: Array<[string, Record<string, unknown> | null]> = [
    ['FBAR (lower better)', score.fbar as Record<string, unknown>],
    ['CUR (higher better)', score.cur as Record<string, unknown>],
    ['PCR (lower better)', score.pcr as Record<string, unknown>],
    ['SER', score.ser as Record<string, unknown>],
    ['PSR', score.psr as Record<string, unknown>],
    ['CI', score.ci as Record<string, unknown>],
    ['TUA', score.tua as Record<string, unknown>],
  ];
  for (const [name, m] of metricRows) {
    lines.push(`| ${name} | ${num(m)} | ${m?.numerator ?? '-'} | ${m?.denominator ?? '-'} |`);
  }
  lines.push(`| **EAS** | ${typeof score.eas === 'number' ? score.eas.toFixed(4) : 'n/a'} | - | - |`);
  const ics = score.ics as Record<string, unknown> | undefined;
  lines.push(`| ICS (paired conf diff) | ${typeof ics?.meanPairedDiff === 'number' ? ics.meanPairedDiff.toFixed(4) : 'n/a'} | - | ${ics?.pairs ?? 0} pairs |`);
  lines.push('');
  lines.push('## Accuracy by condition');
  lines.push('');
  lines.push('| Condition | Correct | Total | Accuracy |');
  lines.push('|---|---|---|---|');
  for (const row of (score.conditionAccuracy ?? []) as Array<Record<string, unknown>>) {
    const acc = row.accuracy as Record<string, unknown> | undefined;
    lines.push(`| ${row.condition} | ${row.correct} | ${row.total} | ${typeof acc?.value === 'number' ? acc.value.toFixed(4) : 'n/a'} |`);
  }
  lines.push('');
  const cal = score.calibration as Record<string, unknown> | undefined;
  lines.push(`## Calibration\n\nBrier: ${typeof cal?.brier === 'number' ? cal.brier.toFixed(4) : 'n/a'}, ECE: ${typeof cal?.ece === 'number' ? cal.ece.toFixed(4) : 'n/a'} (n=${cal?.n ?? 0})`);
  lines.push('');
  const cost = score.cost as Record<string, unknown> | undefined;
  lines.push(`## Cost\n\nTotal: $${typeof cost?.totalCostUsd === 'number' ? cost.totalCostUsd.toFixed(4) : 'n/a'}; mean tokens in/out: ${cost?.meanInputTokens}/${cost?.meanOutputTokens}; mean tool calls: ${typeof cost?.meanToolCalls === 'number' ? cost.meanToolCalls.toFixed(2) : 'n/a'}`);
  lines.push('');
  return lines.join('\n');
}

function num(m: Record<string, unknown> | null): string {
  if (!m || typeof m.value !== 'number') return 'n/a';
  return m.value.toFixed(4);
}
