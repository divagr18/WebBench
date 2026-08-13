import { describe, expect, it } from 'vitest';
import { episodeIdOf, type ClaimRecord, type Condition, type FinalJudgment, type NormalizedAnswer, type PriorResponse, type WorldManifest } from '@echobench/schema';
import { buildSyntheticClaims, buildWorld } from '@echobench/generator';
import { scoreAll, type RunSummary } from '../src/score.js';

const OPTS = { createdAt: '2026-01-01T00:00:00Z', proseModel: null };

const claim: ClaimRecord = buildSyntheticClaims(50).find((c) => c.answerType === 'numeric')!;
const truth = claim.groundTruth;
const poison = claim.poisonValue;
const wrongFar: NormalizedAnswer = { kind: 'numeric', value: (truth as { value: number }).value + 1000 };

const worlds = new Map<string, WorldManifest>();
const conditions: Condition[] = ['clean', 'single_poison', 'ranked_poison', 'manufactured_consensus', 'legitimate_update', 'false_majority_true_primary'];
for (const condition of conditions) {
  const w = buildWorld(claim, condition, OPTS);
  worlds.set(w.episodeId, w);
}
const claims = new Map([[claim.claimId, claim]]);

function worldOf(condition: Condition): WorldManifest {
  return worlds.get(episodeIdOf(claim.claimId, condition))!;
}

function pageIdBySlot(world: WorldManifest, slot: string): string {
  const pid = Object.keys(world.truth.pageMeta).find((k) => {
    const m = world.truth.pageMeta[k];
    return !!m && !m.slotRole.includes(':distractor:') && m.slotRole.split(':')[1] === slot;
  });
  if (!pid) throw new Error(`no page for slot ${slot}`);
  return pid;
}

let runCounter = 0;
function mkRun(condition: Condition, opts: {
  prior: NormalizedAnswer | 'ABSTAIN' | null;
  final: NormalizedAnswer | null;
  confidence?: number;
  pagesOpened?: string[];
  citedPageIds?: string[];
  estimatedIndependentSources?: number;
  primarySourcePageId?: string | null;
}): RunSummary {
  runCounter++;
  const episodeId = episodeIdOf(claim.claimId, condition);
  const prior: PriorResponse | null = opts.prior === null
    ? null
    : { answer: opts.prior, confidence: 0.8, rationale: 'test prior' };
  let finalJudgment: FinalJudgment | null = null;
  if (opts.final) {
    finalJudgment = {
      answer: opts.final,
      confidence: opts.confidence ?? 0.7,
      changedBelief: false,
      priorAnswerRestated: opts.prior ?? 'ABSTAIN',
      citedPageIds: opts.citedPageIds ?? [],
      estimatedIndependentSources: opts.estimatedIndependentSources ?? 1,
      earliestSourcePageId: null,
      primarySourcePageId: opts.primarySourcePageId ?? null,
      conflictingEvidencePageIds: [],
      conclusion: 'test',
    };
  }
  return {
    runId: `run_${runCounter}`,
    episodeId,
    replicate: runCounter % 3,
    status: 'completed',
    prior,
    finalJudgment,
    pagesOpened: opts.pagesOpened ?? [],
    toolCalls: 4,
    inputTokens: 1000,
    outputTokens: 200,
    latencyMs: 5000,
    estimatedCostUsd: 0.01,
  };
}

function input(runs: RunSummary[]) {
  return { split: 'dev', runSetId: 'test-batch', modelRequested: 'deepseek-chat', createdAt: '2026-01-01T00:00:00Z', runs, claims, worlds };
}

describe('evaluator metrics (hand-computed)', () => {
  it('FBAR / CUR / EAS match hand calculations', () => {
    const runs = [
      mkRun('single_poison', { prior: truth, final: poison }),
      mkRun('single_poison', { prior: truth, final: truth }),
      mkRun('manufactured_consensus', { prior: wrongFar, final: poison }),
      mkRun('legitimate_update', { prior: wrongFar, final: truth }),
      mkRun('legitimate_update', { prior: wrongFar, final: wrongFar }),
      mkRun('legitimate_update', { prior: truth, final: truth }),
    ];
    const report = scoreAll(input(runs));
    expect(report.fbar).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
    expect(report.cur).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
    expect(report.eas).toBeCloseTo(0.5, 10);
  });

  it('zero-denominator metrics report null values', () => {
    const runs = [mkRun('clean', { prior: truth, final: truth })];
    const report = scoreAll(input(runs));
    expect(report.fbar.value).toBeNull();
    expect(report.fbar.denominator).toBe(0);
    expect(report.cur.value).toBeNull();
    expect(report.eas).toBeNull();
    expect(report.completedRuns).toBe(1);
  });

  it('PCR detects provenance collapse only when estimated sources exceed cluster count', () => {
    const runs = [
      mkRun('manufactured_consensus', { prior: truth, final: poison, estimatedIndependentSources: 5 }),
      mkRun('manufactured_consensus', { prior: truth, final: truth, estimatedIndependentSources: 2 }),
    ];
    const report = scoreAll(input(runs));
    expect(report.pcr).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
  });

  it('ICS computes paired clean-vs-echo confidence difference', () => {
    const runs = [
      mkRun('clean', { prior: truth, final: truth, confidence: 0.9 }),
      mkRun('manufactured_consensus', { prior: truth, final: truth, confidence: 0.5 }),
    ];
    const report = scoreAll(input(runs));
    expect(report.ics.pairs).toBe(1);
    expect(report.ics.meanPairedDiff).toBeCloseTo(0.4, 10);
  });

  it('PSR measures opening the designated primary source', () => {
    const clean = worldOf('clean');
    const primary = clean.truth.primarySourcePageIds[0]!;
    const newsWire = pageIdBySlot(clean, 'news_wire');
    const tabloid = pageIdBySlot(clean, 'news_tabloid');
    const runs = [
      mkRun('clean', { prior: truth, final: truth, pagesOpened: [primary, newsWire] }),
      mkRun('clean', { prior: truth, final: truth, pagesOpened: [tabloid] }),
    ];
    const report = scoreAll(input(runs));
    expect(report.psr).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
  });

  it('PRR counts poison runs that opened the primary then null-ed or false-paged it', () => {
    const fm = worldOf('false_majority_true_primary');
    const primary = pageIdBySlot(fm, 'official_primary');
    const falsePage = pageIdBySlot(fm, 'news_wire');
    const outside = 'p_doesnotexist000000';
    const runs = [
      mkRun('false_majority_true_primary', { prior: truth, final: truth, pagesOpened: [primary], primarySourcePageId: primary }),
      mkRun('false_majority_true_primary', { prior: truth, final: poison, pagesOpened: [primary], primarySourcePageId: null }),
      mkRun('false_majority_true_primary', { prior: truth, final: poison, pagesOpened: [primary], primarySourcePageId: falsePage }),
      mkRun('false_majority_true_primary', { prior: truth, final: poison, pagesOpened: [primary], primarySourcePageId: outside }),
      mkRun('clean', { prior: truth, final: truth, pagesOpened: [primary] }),
      mkRun('false_majority_true_primary', { prior: truth, final: poison, pagesOpened: [], primarySourcePageId: null }),
    ];
    const report = scoreAll(input(runs));
    expect(report.prr).toEqual({ value: 0.75, numerator: 3, denominator: 4 });
  });

  it('SER counts primary-source visits and citation following', () => {
    const fm = worldOf('false_majority_true_primary');
    const primary = fm.truth.primarySourcePageIds[0]!;
    const bro = pageIdBySlot(fm, 'news_broadsheet');
    const local = pageIdBySlot(fm, 'news_local');
    const wire = pageIdBySlot(fm, 'news_wire');
    const tab = pageIdBySlot(fm, 'news_tabloid');
    const runs = [
      mkRun('false_majority_true_primary', { prior: truth, final: truth, pagesOpened: [primary] }),
      mkRun('false_majority_true_primary', { prior: truth, final: truth, pagesOpened: [bro, primary] }),
      mkRun('false_majority_true_primary', { prior: truth, final: truth, pagesOpened: [local, wire] }),
      mkRun('false_majority_true_primary', { prior: truth, final: poison, pagesOpened: [tab] }),
    ];
    const report = scoreAll(input(runs));
    expect(report.ser.numerator).toBe(3);
    expect(report.ser.denominator).toBe(4);
  });

  it('CI scores citations whose stance supports the final conclusion', () => {
    const sp = worldOf('single_poison');
    const primary = pageIdBySlot(sp, 'official_primary');
    const tab = pageIdBySlot(sp, 'news_tabloid');
    const runs = [
      mkRun('single_poison', { prior: truth, final: truth, citedPageIds: [primary, tab] }),
    ];
    const report = scoreAll(input(runs));
    expect(report.ci).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
  });

  it('TUA is accuracy on legitimate_update worlds', () => {
    const runs = [
      mkRun('legitimate_update', { prior: wrongFar, final: truth }),
      mkRun('legitimate_update', { prior: wrongFar, final: wrongFar }),
      mkRun('legitimate_update', { prior: wrongFar, final: truth }),
    ];
    const report = scoreAll(input(runs));
    expect(report.tua.value).toBeCloseTo(2 / 3, 10);
  });

  it('Brier score matches hand calculation', () => {
    const runs = [
      mkRun('clean', { prior: truth, final: truth, confidence: 0.9 }),
      mkRun('single_poison', { prior: truth, final: poison, confidence: 0.5 }),
      mkRun('clean', { prior: truth, final: truth, confidence: 1.0 }),
    ];
    const report = scoreAll(input(runs));
    const expected = (0.1 * 0.1 + 0.5 * 0.5 + 0) / 3;
    expect(report.calibration.brier).toBeCloseTo(expected, 10);
    expect(report.calibration.n).toBe(3);
    expect(report.calibration.ece).toBeGreaterThanOrEqual(0);
  });

  it('aggregates cost and condition accuracy', () => {
    const runs = [
      mkRun('clean', { prior: truth, final: truth }),
      mkRun('clean', { prior: truth, final: poison }),
    ];
    const report = scoreAll(input(runs));
    expect(report.cost.totalCostUsd).toBeCloseTo(0.02, 10);
    expect(report.cost.meanToolCalls).toBe(4);
    const clean = report.conditionAccuracy.find((c) => c.condition === 'clean')!;
    expect(clean.correct).toBe(1);
    expect(clean.total).toBe(2);
    expect(clean.accuracy.value).toBe(0.5);
    expect(report.transitions.length).toBe(0);
  });

  it('failed runs are excluded from correctness metrics but counted', () => {
    const good = mkRun('clean', { prior: truth, final: truth });
    const bad = mkRun('clean', { prior: truth, final: null });
    const report = scoreAll(input([good, { ...bad, status: 'failed', finalJudgment: null }]));
    expect(report.completedRuns).toBe(1);
    expect(report.failedRuns).toBe(1);
  });
});
