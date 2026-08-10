import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONDITIONS, type WorldManifest } from '@echobench/schema';
import { buildSyntheticClaims, buildWorld, loadPrompts } from '@echobench/generator';
import { EchoWeb } from '@echobench/echoweb';
import type { ChatOptions, ChatResponse } from '../src/llmIface.js';
import { InMemoryGateway } from './helpers.js';
import { runAll, type PlannedRun } from '../src/runner.js';
import type { ChatMessage } from '../src/llmIface.js';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const OPTS = { createdAt: '2026-01-01T00:00:00Z', proseModel: null };

type Producer = (call: number, messages: ChatMessage[], opts?: ChatOptions) => Partial<ChatResponse> | void;

class ScriptedLlm {
  calls: Array<{ messages: ChatMessage[]; opts?: ChatOptions }> = [];
  constructor(private readonly script: Producer[]) {}

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse> {
    const idx = this.calls.length;
    this.calls.push({ messages, opts });
    const producer = this.script[idx] ?? (() => ({ content: '{"answer": "ABSTAIN", "confidence": 0.1, "rationale": "fallback"}' }));
    const partial = producer(idx, messages, opts) ?? {};
    return {
      content: '',
      toolCalls: [],
      finishReason: 'stop',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      modelReturned: 'deepseek-v4-flash',
      latencyMs: 1,
      ...partial,
    };
  }
}

function setup() {
  const claim = buildSyntheticClaims(50).find((c) => c.answerType === 'numeric')!;
  const worlds = CONDITIONS.map((c) => buildWorld(claim, c, OPTS));
  const echo = new EchoWeb(worlds);
  const bundle = loadPrompts(REPO_ROOT);
  const worldMap = new Map(worlds.map((w) => [w.episodeId, w]));
  const claimsMap = new Map([[claim.claimId, claim]]);
  return { claim, worlds, echo, bundle, worldMap, claimsMap };
}

function finalJudgmentJson(claim: { groundTruth: { kind: string; value: unknown } }): string {
  return JSON.stringify({
    answer: claim.groundTruth,
    confidence: 0.82,
    changedBelief: false,
    priorAnswerRestated: claim.groundTruth,
    citedPageIds: ['official_primary'],
    estimatedIndependentSources: 2,
    earliestSourcePageId: 'official_primary',
    primarySourcePageId: 'official_primary',
    conflictingEvidencePageIds: [],
    conclusion: 'primary source verified.',
  });
}

describe('runner orchestration', () => {
  it('runs an episode end-to-end through search and openPage', async () => {
    const { claim, worlds, echo, bundle, worldMap, claimsMap } = setup();
    const episode = worlds.find((w) => w.condition === 'clean')!;

    const llm = new ScriptedLlm([
      () => ({ content: JSON.stringify({ answer: claim.groundTruth, confidence: 0.7, rationale: 'prior knowledge' }) }),
      () => ({
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: JSON.stringify({ query: claim.entityName }) } }],
      }),
      (call, messages) => {
        const last = messages[messages.length - 1];
        expect(last?.role).toBe('tool');
        return void call;
      },
      () => ({ content: finalJudgmentJson(claim) }),
    ]);

    const tmp = mkdtempSync(join(tmpdir(), 'echobench-runner-'));
    const plans: PlannedRun[] = [{ episodeId: episode.episodeId, replicate: 0 }];
    const outcome = await runAll(
      {
        llm,
        bundle,
        worlds: worldMap,
        claims: claimsMap,
        gatewayFor: (w: WorldManifest) => new InMemoryGateway(echo, w.worldToken),
      },
      {
        datasetRoot: tmp,
        tracesRoot: tmp,
        split: 'dev',
        runSetId: 'unit-run',
        modelRequested: 'deepseek-chat',
        replicatesPerEpisode: 1,
        maxToolCalls: 20,
        temperature: 0.7,
        budgetUsd: 100,
        baseSeed: 'test-seed',
        plans,
      },
    );

    expect(outcome.completed).toBe(1);
    expect(outcome.failed).toBe(0);

    const indexRaw = readFileSync(join(tmp, 'traces', 'dev', 'unit-run', 'index.jsonl'), 'utf8').trim();
    const indexLine = JSON.parse(indexRaw);
    expect(indexLine.status).toBe('completed');

    const traceRaw = readFileSync(indexLine.tracePath, 'utf8').trim().split('\n');
    expect(traceRaw.length).toBe(2);
    const traceLine = traceRaw[1];
    if (!traceLine) throw new Error('missing trace line');
    const traceObj = JSON.parse(traceLine).trace;
    expect(traceObj.finalJudgment.answer).toEqual(claim.groundTruth);
    expect(traceObj.toolCalls.length).toBe(1);
    expect(traceObj.toolCalls[0].type).toBe('search_call');
    expect(traceObj.prior?.confidence).toBe(0.7);
  });

  it('resumes without duplicate runs', async () => {
    const { claim, worlds, echo, bundle, worldMap, claimsMap } = setup();
    const episode = worlds.find((w) => w.condition === 'clean')!;
    const makeLlm = () => new ScriptedLlm([
      () => ({ content: JSON.stringify({ answer: claim.groundTruth, confidence: 0.6, rationale: 'prior' }) }),
      () => ({ content: finalJudgmentJson(claim) }),
      () => ({ content: finalJudgmentJson(claim) }),
    ]);
    const tmp = mkdtempSync(join(tmpdir(), 'echobench-runner-resume-'));
    const config = {
      datasetRoot: tmp,
      tracesRoot: tmp,
      split: 'dev' as const,
      runSetId: 'resume-run',
      modelRequested: 'deepseek-chat',
      replicatesPerEpisode: 1,
      maxToolCalls: 20,
      temperature: 0.7,
      budgetUsd: 100,
      baseSeed: 'seed',
      plans: [{ episodeId: episode.episodeId, replicate: 0 }],
    };
    const first = await runAll({ llm: makeLlm(), bundle, worlds: worldMap, claims: claimsMap, gatewayFor: (w: WorldManifest) => new InMemoryGateway(echo, w.worldToken) }, config);
    expect(first.completed).toBe(1);
    const second = await runAll({ llm: makeLlm(), bundle, worlds: worldMap, claims: claimsMap, gatewayFor: (w: WorldManifest) => new InMemoryGateway(echo, w.worldToken) }, config);
    expect(second.completed).toBe(0);
    expect(second.skipped).toBe(1);
    const indexRaw = readFileSync(join(tmp, 'traces', 'dev', 'resume-run', 'index.jsonl'), 'utf8').trim().split('\n');
    expect(indexRaw.length).toBe(1);
  });

  it('enforces the tool-call budget against a tool-happy model', async () => {
    const { claim, worlds, echo, bundle, worldMap, claimsMap } = setup();
    const episode = worlds.find((w) => w.condition === 'clean')!;
    const llm = new ScriptedLlm([
      () => ({ content: JSON.stringify({ answer: claim.groundTruth, confidence: 0.5, rationale: 'prior' }) }),
      ...Array.from({ length: 30 }, (): Producer => (_call, _messages, opts) =>
        opts?.tools
          ? {
              finishReason: 'tool_calls',
              toolCalls: [{ id: `call_${Math.random()}`, type: 'function' as const, function: { name: 'search', arguments: JSON.stringify({ query: claim.entityName }) } }],
            }
          : { content: finalJudgmentJson(claim) },
      ),
    ]);
    const tmp = mkdtempSync(join(tmpdir(), 'echobench-runner-budget-'));
    const outcome = await runAll(
      { llm, bundle, worlds: worldMap, claims: claimsMap, gatewayFor: (w: WorldManifest) => new InMemoryGateway(echo, w.worldToken) },
      {
        datasetRoot: tmp,
        tracesRoot: tmp,
        split: 'dev',
        runSetId: 'budget-run',
        modelRequested: 'deepseek-chat',
        replicatesPerEpisode: 1,
        maxToolCalls: 3,
        temperature: 0.7,
        budgetUsd: 100,
        baseSeed: 'seed',
        plans: [{ episodeId: episode.episodeId, replicate: 0 }],
      },
    );
    expect(outcome.completed).toBe(1);
    const toolCallTurns = llm.calls.filter((c) => c.opts?.tools !== undefined).length;
    expect(toolCallTurns).toBeLessThanOrEqual(4);
  });

  it('stops the run set when the cost budget is exhausted', async () => {
    const { claim, worlds, echo, bundle, worldMap, claimsMap } = setup();
    const episode = worlds.find((w) => w.condition === 'clean')!;
    const makeLlm = () => new ScriptedLlm([
      () => ({ content: JSON.stringify({ answer: claim.groundTruth, confidence: 0.6, rationale: 'prior' }) }),
      () => ({ content: finalJudgmentJson(claim) }),
    ]);
    const tmp = mkdtempSync(join(tmpdir(), 'echobench-runner-cost-'));
    const config = {
      datasetRoot: tmp,
      tracesRoot: tmp,
      split: 'dev' as const,
      runSetId: 'cost-run',
      modelRequested: 'deepseek-chat',
      replicatesPerEpisode: 1,
      maxToolCalls: 20,
      temperature: 0.7,
      budgetUsd: 0,
      baseSeed: 'seed',
      plans: [{ episodeId: episode.episodeId, replicate: 0 }],
    };
    const outcome = await runAll({ llm: makeLlm(), bundle, worlds: worldMap, claims: claimsMap, gatewayFor: (w: WorldManifest) => new InMemoryGateway(echo, w.worldToken) }, config);
    expect(outcome.stoppedForBudget).toBe(true);
    expect(outcome.completed).toBe(0);
  });

  it('marks runs rejected after unrecoverable schema failures', async () => {
    const { claim, worlds, echo, bundle, worldMap, claimsMap } = setup();
    const episode = worlds.find((w) => w.condition === 'clean')!;
    const llm = new ScriptedLlm([
      () => ({ content: JSON.stringify({ answer: claim.groundTruth, confidence: 0.6, rationale: 'prior' }) }),
      () => ({ content: 'this is not json at all' }),
      () => ({ content: 'still not json' }),
    ]);
    const tmp = mkdtempSync(join(tmpdir(), 'echobench-runner-reject-'));
    const outcome = await runAll(
      { llm, bundle, worlds: worldMap, claims: claimsMap, gatewayFor: (w: WorldManifest) => new InMemoryGateway(echo, w.worldToken) },
      {
        datasetRoot: tmp,
        tracesRoot: tmp,
        split: 'dev',
        runSetId: 'reject-run',
        modelRequested: 'deepseek-chat',
        replicatesPerEpisode: 1,
        maxToolCalls: 20,
        temperature: 0.7,
        budgetUsd: 100,
        baseSeed: 'seed',
        plans: [{ episodeId: episode.episodeId, replicate: 0 }],
      },
    );
    expect(outcome.rejected).toBe(1);
  });
});
