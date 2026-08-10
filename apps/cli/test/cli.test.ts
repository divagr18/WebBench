import { describe, expect, it } from 'vitest';
import { CONDITIONS, type DatasetManifest } from '@echobench/schema';
import { selectPlans } from '../src/commands/run.js';
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
    const fullClaims = [...byClaim.values()].filter((n) => n === 6).length;
    expect(fullClaims).toBeGreaterThanOrEqual(16);
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
    expect(plans.length).toBe(12);
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
