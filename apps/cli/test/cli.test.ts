import { describe, expect, it } from 'vitest';
import { CONDITIONS, type DatasetManifest } from '@echobench/schema';
import { selectPlans } from '../src/commands/run.js';
import { renderMarkdown } from '../src/commands/report.js';
import { computeReplicateStatus } from '../src/commands/replicate-status.js';
import { parseArgs, opt, optNumber } from '../src/args.js';

function fakeManifest(claimCount: number): DatasetManifest {
  const episodes: DatasetManifest['episodes'] = {};
  for (let c = 1; c <= claimCount; c++) {
    const claimId = `syn_${String(c).padStart(3, '0')}`;
    for (const condition of CONDITIONS) {
      const episodeId = `${claimId}__${condition}`;
      episodes[episodeId] = { episodeId, condition, claimId, file: `worlds/${episodeId}.json`, checksum: 'a'.repeat(64) };
    }
  }
  return {
    schemaVersion: 1,
    name: 'fake',
    split: 'dev',
    version: '0.1.0',
    createdAt: '2026-01-01T00:00:00Z',
    seed: 'fake',
    worldDate: '2031-05-01',
    proseModel: null,
    claimCount,
    episodeCount: claimCount * CONDITIONS.length,
    claims: [],
    episodes,
    integrityChecksum: 'b'.repeat(64),
  };
}

describe('selectPlans', () => {
  it('caps at max runs and groups runs by claim', () => {
    const plans = selectPlans(fakeManifest(20), 100, 1, 'seed-a');
    expect(plans.length).toBe(100);
    const byClaim = new Map<string, number>();
    for (const plan of plans) {
      const claimId = plan.episodeId.split('__')[0]!;
      byClaim.set(claimId, (byClaim.get(claimId) ?? 0) + 1);
    }
    const fullClaims = [...byClaim.values()].filter((n) => n === CONDITIONS.length).length;
    expect(fullClaims).toBeGreaterThanOrEqual(Math.floor(100 / CONDITIONS.length) - 1);
  });

  it('is deterministic for a fixed seed and differs across seeds', () => {
    const m = fakeManifest(20);
    const a = selectPlans(m, 30, 1, 'seed-a').map((p) => p.episodeId).join(',');
    const b = selectPlans(m, 30, 1, 'seed-a').map((p) => p.episodeId).join(',');
    const c = selectPlans(m, 30, 1, 'seed-b').map((p) => p.episodeId).join(',');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('multiplies by replicates', () => {
    const plans = selectPlans(fakeManifest(20), 24, 3, 'seed-a');
    expect(plans.length).toBe(24);
    const reps = new Set(plans.slice(0, 12).map((p) => p.replicate));
    expect(reps.size).toBeLessThanOrEqual(3);
  });

  it('never exceeds available episodes', () => {
    const plans = selectPlans(fakeManifest(2), 100, 1, 'seed-a');
    expect(plans.length).toBe(2 * CONDITIONS.length);
  });

  it('restricts to allowedEpisodeIds when a world set is pinned', () => {
    const m = fakeManifest(5);
    const allEpisodeIds = Object.keys(m.episodes);
    const allowed = new Set(allEpisodeIds.slice(0, 3));
    const plans = selectPlans(m, 100, 1, 'seed-a', allowed);
    expect(plans.length).toBe(3);
    for (const p of plans) expect(allowed.has(p.episodeId)).toBe(true);
  });
});

describe('computeReplicateStatus', () => {
  const worldSet = { worldSetId: 'ws-1', episodeIds: ['syn_001__clean', 'syn_002__clean'], replicatesPromised: 3 };

  it('reports full/partial/not-started per episode against promised replicates', () => {
    const entries = [
      { episodeId: 'syn_001__clean', replicate: 0, status: 'completed' as const },
      { episodeId: 'syn_001__clean', replicate: 1, status: 'completed' as const },
      { episodeId: 'syn_001__clean', replicate: 2, status: 'completed' as const },
      { episodeId: 'syn_002__clean', replicate: 0, status: 'rejected' as const },
    ];
    const report = computeReplicateStatus(worldSet, entries);
    expect(report.summary).toEqual({ fullyReplicated: 1, partiallyReplicated: 1, notStarted: 0 });
    const ep1 = report.byEpisode.find((r) => r.episodeId === 'syn_001__clean')!;
    expect(ep1).toEqual({ episodeId: 'syn_001__clean', completed: 3, rejected: 0, failed: 0, missing: 0 });
    const ep2 = report.byEpisode.find((r) => r.episodeId === 'syn_002__clean')!;
    expect(ep2).toEqual({ episodeId: 'syn_002__clean', completed: 0, rejected: 1, failed: 0, missing: 3 });
  });

  it('treats an episode with zero traces at all as not-started', () => {
    const report = computeReplicateStatus(worldSet, []);
    expect(report.summary).toEqual({ fullyReplicated: 0, partiallyReplicated: 0, notStarted: 2 });
  });

  it('ignores trace entries for episodes outside the world set', () => {
    const entries = [{ episodeId: 'syn_999__clean', replicate: 0, status: 'completed' as const }];
    const report = computeReplicateStatus(worldSet, entries);
    expect(report.summary.notStarted).toBe(2);
  });
});

describe('argument parsing', () => {
  it('parses options, flags and positionals', () => {
    const parsed = parseArgs(['run', '--verbose', '--split', 'dev', '--max-runs=50', 'extra']);
    expect(parsed.command).toBe('run');
    expect(opt(parsed, 'split', 'test')).toBe('dev');
    expect(optNumber(parsed, 'max-runs', 5)).toBe(50);
    expect(parsed.flags.has('verbose')).toBe(true);
    expect(parsed.positionals).toEqual(['extra']);
  });

  it('falls back to defaults', () => {
    const parsed = parseArgs(['validate']);
    expect(opt(parsed, 'split', 'dev')).toBe('dev');
    expect(optNumber(parsed, 'port', 4577)).toBe(4577);
  });
});

describe('renderMarkdown', () => {
  const base = {
    runSetId: 'test',
    split: 'dev',
    modelRequested: 'deepseek-chat',
    createdAt: '2026-01-01T00:00:00Z',
    totalRuns: 16,
    completedRuns: 16,
    failedRuns: 0,
    rejectedRuns: 0,
    fbar: { value: 0.5, numerator: 4, denominator: 8 },
    cur: { value: 0.8, numerator: 4, denominator: 5 },
    eas: 0.65,
    pcr: { value: 0.3, numerator: 3, denominator: 10 },
    ics: { meanPairedDiff: 0.05, pairs: 8 },
    ser: { value: 1, numerator: 8, denominator: 8 },
    psr: { value: 0.9, numerator: 14, denominator: 16 },
    prr: { value: 0.25, numerator: 3, denominator: 12 },
    ci: { value: 0.6, numerator: 9, denominator: 15 },
    tua: { value: 0.9, numerator: 9, denominator: 10 },
    calibration: { brier: 0.15, ece: 0.08, n: 16 },
    cost: { totalCostUsd: 0.1, meanInputTokens: 100, meanOutputTokens: 10, meanToolCalls: 8.1 },
  };

  it('renders EAS with 95% CI when bootstrap is present', () => {
    const md = renderMarkdown({
      ...base,
      bootstrap: { eas: { estimate: 0.65, ci95: [0.45, 0.85], samples: 200 }, resamples: 200 },
      conditionAccuracy: [],
    });
    expect(md).toContain('| **EAS** | 0.6500 [0.450, 0.850] | - | - |');
    expect(md).toContain('| PRR (lower better) | 0.2500 | 3 | 12 |');
  });

  it('renders EAS without CI when bootstrap is absent', () => {
    const md = renderMarkdown({ ...base, conditionAccuracy: [] });
    expect(md).toContain('| **EAS** | 0.6500 | - | - |');
  });

  it('renders per-condition 95% CI column when ci95 is populated', () => {
    const md = renderMarkdown({
      ...base,
      conditionAccuracy: [
        { condition: 'false_majority_true_primary', correct: 8, total: 16, accuracy: { value: 0.5, numerator: 8, denominator: 16, ci95: [0.25, 0.75] } },
        { condition: 'clean', correct: 15, total: 16, accuracy: { value: 0.9375, numerator: 15, denominator: 16, ci95: [0.8, 1.0] } },
      ],
    });
    expect(md).toContain('| false_majority_true_primary | 8 | 16 | 0.5000 | [0.250, 0.750] |');
    expect(md).toContain('| clean | 15 | 16 | 0.9375 | [0.800, 1.000] |');
    expect(md).toContain('| Condition | Correct | Total | Accuracy | 95% CI |');
  });

  it('renders dash in CI column when ci95 is absent', () => {
    const md = renderMarkdown({
      ...base,
      conditionAccuracy: [{ condition: 'clean', correct: 15, total: 16, accuracy: { value: 0.9375, numerator: 15, denominator: 16 } }],
    });
    expect(md).toContain('| clean | 15 | 16 | 0.9375 | - |');
  });
});
