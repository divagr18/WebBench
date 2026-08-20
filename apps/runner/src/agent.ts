import type { ClaimRecord, FinalJudgment, NormalizedAnswer, PriorResponse, VisiblePage, WorldManifest } from '@echobench/schema';
import { FinalJudgmentSchema, PriorResponseSchema } from '@echobench/schema';
import type { ChatMessage, ChatOptions, ChatResponse, LlmLike, ToolDef } from './llmIface.js';
import type { ToolGateway } from './gateway.js';
import { fillTemplate, type PromptBundle } from '@echobench/generator';
import { answerFormat, answerShapeHint, normalizeAnyAnswer } from './answerFormat.js';
import { FINAL_JUDGMENT_JSON_SCHEMA, PRIOR_RESPONSE_JSON_SCHEMA, estimateCostUsd } from '@echobench/llm';

const MAX_TOOL_RESULT_CHARS = 6000;

export interface EpisodeRunOptions {
  runId: string;
  replicate: number;
  maxToolCalls: number;
  temperature: number;
}

export interface EpisodeRunResult {
  prior: PriorResponse | null;
  finalJudgment: FinalJudgment | null;
  pagesOpened: string[];
  toolCallLog: Array<{ type: 'search_call' | 'open_page_call'; detail: string }>;
  schemaRepairAttempts: Array<{ reason: string; succeeded: boolean }>;
  modelReturned: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  status: 'completed' | 'failed' | 'rejected';
  failureReason: string | null;
}

export async function runEpisode(
  claim: ClaimRecord,
  world: WorldManifest,
  bundle: PromptBundle,
  llm: LlmLike,
  gateway: ToolGateway,
  opts: EpisodeRunOptions,
  modelRequested: string,
): Promise<EpisodeRunResult> {
  const started = Date.now();
  const result: EpisodeRunResult = {
    prior: null,
    finalJudgment: null,
    pagesOpened: [],
    toolCallLog: [],
    schemaRepairAttempts: [],
    modelReturned: null,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    estimatedCostUsd: 0,
    status: 'completed',
    failureReason: null,
  };
  const openedSet = new Set<string>();

  const addUsage = (resp: ChatResponse) => {
    result.inputTokens += resp.usage.prompt_tokens;
    result.outputTokens += resp.usage.completion_tokens;
    result.estimatedCostUsd += estimateCostUsd(modelRequested, resp.usage.prompt_tokens, resp.usage.completion_tokens);
    if (!result.modelReturned) result.modelReturned = resp.modelReturned;
  };

  try {
    result.prior = await elicitPrior(claim, bundle, llm, opts, addUsage, result);
  } catch (e) {
    result.status = 'failed';
    result.failureReason = `prior elicitation failed: ${msg(e)}`;
    result.latencyMs = Date.now() - started;
    return result;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildResearchSystem(claim, bundle, opts.maxToolCalls) },
  ];

  let toolCalls = 0;
  let guard = 0;
  try {
    while (toolCalls < opts.maxToolCalls && guard < opts.maxToolCalls + 4) {
      guard++;
      const resp = await llm.chat(messages, { tools: toolDefs(), toolChoice: 'auto', temperature: opts.temperature, maxTokens: 1024 });
      addUsage(resp);
      messages.push({
        role: 'assistant',
        content: resp.content || null,
        ...(resp.reasoningContent ? { reasoning_content: resp.reasoningContent } : {}),
        ...(resp.toolCalls.length > 0 ? { tool_calls: resp.toolCalls } : {}),
      });
      if (resp.toolCalls.length === 0) break;

      for (const tc of resp.toolCalls) {
        toolCalls++;
        const toolResult = await dispatchTool(gateway, tc.function.name, tc.function.arguments, claim, result, openedSet);
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: toolResult });
        if (toolCalls >= opts.maxToolCalls) break;
      }
    }
  } catch (e) {
    result.status = 'failed';
    result.failureReason = `research loop failed: ${msg(e)}`;
    result.latencyMs = Date.now() - started;
    return result;
  }

  try {
    result.finalJudgment = await elicitFinal(claim, world, bundle, llm, opts, result, addUsage, messages);
  } catch (e) {
    result.status = 'rejected';
    result.failureReason = `final judgment invalid: ${msg(e)}`;
    result.latencyMs = Date.now() - started;
    return result;
  }

  result.pagesOpened = [...openedSet];
  result.latencyMs = Date.now() - started;
  return result;
}

type AddUsage = (resp: ChatResponse) => void;

async function elicitPrior(
  claim: ClaimRecord,
  bundle: PromptBundle,
  llm: LlmLike,
  opts: EpisodeRunOptions,
  addUsage: AddUsage,
  result: EpisodeRunResult,
): Promise<PriorResponse | null> {
  const prompt = fillTemplate(bundle.texts.prior_elicit, {
    QUESTION: claim.question,
    WORLD_DATE: claim.asOfDate,
    ANSWER_FORMAT: `${answerFormat(claim.answerSpec)} The "answer" field must be either the string "ABSTAIN" or an object shaped exactly like ${answerShapeHint(claim.answerSpec)}.`,
  });

  const priorMessages: ChatMessage[] = [
    { role: 'system', content: 'You answer strictly from your own knowledge as JSON only.' },
    { role: 'user', content: prompt },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await llm.chat(priorMessages, { responseFormat: 'json', jsonSchema: { name: 'prior_response', schema: PRIOR_RESPONSE_JSON_SCHEMA }, temperature: opts.temperature, maxTokens: 300 });
    addUsage(resp);
    const parsed = parsePrior(claim, resp.content);
    if (parsed) return parsed;
    result.schemaRepairAttempts.push({ reason: 'prior schema mismatch', succeeded: attempt === 0 });
    priorMessages.push({ role: 'assistant', content: resp.content || '', ...(resp.reasoningContent ? { reasoning_content: resp.reasoningContent } : {}) });
    priorMessages.push({ role: 'user', content: 'Your previous response was invalid. Respond again with JSON only, matching the schema exactly.' });
  }
  return null;
}

function parsePrior(claim: ClaimRecord, content: string): PriorResponse | null {
  const obj = parseJsonLoose<Record<string, unknown>>(content);
  if (!obj) return null;
  const answerParse = normalizeAnyAnswer(claim, (obj.answer as unknown) ?? null);
  if (!answerParse.ok) return null;
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.5;
  const rationale = typeof obj.rationale === 'string' ? obj.rationale : '';
  const candidate = {
    answer: answerParse.value,
    confidence: clamp01(confidence),
    rationale,
  };
  const validated = PriorResponseSchema.safeParse(candidate);
  return validated.success ? validated.data : null;
}

async function elicitFinal(
  claim: ClaimRecord,
  world: WorldManifest,
  bundle: PromptBundle,
  llm: LlmLike,
  opts: EpisodeRunOptions,
  result: EpisodeRunResult,
  addUsage: AddUsage,
  messages: ChatMessage[],
): Promise<FinalJudgment> {
  const priorDisplay = result.prior ? JSON.stringify(result.prior.answer) : 'ABSTAIN';
  const prompt = fillTemplate(bundle.texts.final_judgment, {
    ANSWER_FORMAT: `${answerFormat(claim.answerSpec)} The "answer" field must be an object shaped exactly like ${answerShapeHint(claim.answerSpec)}.`,
    PRIOR_DISPLAY: priorDisplay,
  });

  const finalMessages: ChatMessage[] = [
    ...messages,
    { role: 'user', content: prompt },
  ];

  let lastError = 'no parse';
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await llm.chat(finalMessages, { responseFormat: 'json', jsonSchema: { name: 'final_judgment', schema: FINAL_JUDGMENT_JSON_SCHEMA }, temperature: opts.temperature, maxTokens: 900 });
    addUsage(resp);
    const obj = parseJsonLoose<Record<string, unknown>>(resp.content);
    if (obj) {
      const normalizedAnswer = normalizeAnyAnswer(claim, obj.answer);
      const normalizedPrior = normalizeAnyAnswer(claim, obj.priorAnswerRestated);
      const candidate = {
        ...obj,
        answer: normalizedAnswer.ok ? normalizedAnswer.value : obj.answer,
        priorAnswerRestated: normalizedPrior.ok ? normalizedPrior.value : (normalizedAnswer.ok ? normalizedAnswer.value : obj.priorAnswerRestated),
        confidence: clamp01(typeof obj.confidence === 'number' ? obj.confidence : 0.5),
        citedPageIds: toStringArray(obj.citedPageIds),
        conflictingEvidencePageIds: toStringArray(obj.conflictingEvidencePageIds),
        estimatedIndependentSources: typeof obj.estimatedIndependentSources === 'number' ? Math.max(0, Math.round(obj.estimatedIndependentSources)) : 0,
        conclusion: typeof obj.conclusion === 'string' ? obj.conclusion.slice(0, 3000) : '',
      };
      const validated = FinalJudgmentSchema.safeParse(candidate);
      if (validated.success) return validated.data;
      lastError = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } else {
      lastError = 'unparseable JSON';
    }
    result.schemaRepairAttempts.push({ reason: lastError, succeeded: attempt === 0 });
    finalMessages.push({ role: 'assistant', content: resp.content || '', ...(resp.reasoningContent ? { reasoning_content: resp.reasoningContent } : {}) });
    finalMessages.push({ role: 'user', content: `Your previous response was invalid (${lastError}). Respond again with JSON only, matching the schema exactly.` });
  }
  throw new Error(lastError);
}

function buildResearchSystem(claim: ClaimRecord, bundle: PromptBundle, maxToolCalls: number): string {
  return fillTemplate(bundle.texts.research_system, {
    CALL_BUDGET: String(maxToolCalls),
    TASK: claim.question,
  });
}

async function dispatchTool(
  gateway: ToolGateway,
  name: string,
  argsJson: string,
  claim: ClaimRecord,
  result: EpisodeRunResult,
  openedSet: Set<string>,
): Promise<string> {
  const args = parseJsonLoose<Record<string, unknown>>(argsJson) ?? {};
  try {
    if (name === 'search') {
      const query = typeof args.query === 'string' ? args.query : '';
      const siteRaw = typeof args.site === 'string' ? args.site : null;
      const searchResult = await gateway.search({
        query,
        ...(siteRaw ? { site: siteRaw } : {}),
        ...(typeof args.dateFrom === 'string' ? { dateFrom: args.dateFrom } : {}),
        ...(typeof args.dateTo === 'string' ? { dateTo: args.dateTo } : {}),
        ...(typeof args.cursor === 'string' ? { cursor: args.cursor } : {}),
      });
      result.toolCallLog.push({ type: 'search_call', detail: query });
      return truncate(JSON.stringify(searchResult));
    }
    if (name === 'openPage') {
      const target = typeof args.url === 'string' && args.url.length > 0 ? args.url : typeof args.pageId === 'string' ? args.pageId : '';
      const page = await gateway.openPage(target);
      result.toolCallLog.push({ type: 'open_page_call', detail: target });
      if (!page) return JSON.stringify({ error: 'page not found', requested: target });
      openedSet.add(page.pageId);
      return truncate(JSON.stringify(page));
    }
    return JSON.stringify({ error: `unknown tool: ${name}` });
  } catch (e) {
    result.toolCallLog.push({ type: name === 'search' ? 'search_call' : 'open_page_call', detail: msg(e) });
    return JSON.stringify({ error: msg(e) });
  }
}

function toolDefs(): ToolDef[] {
  return [
    {
      type: 'function',
      function: {
        name: 'search',
        description: 'Search the web. Returns up to 10 results with urls, titles, snippets, source sites, publication dates, and engagement counts.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            site: { type: 'string', description: 'optional filter: a platform type (threadit|news|official) or a site domain like dailyledger.com' },
            dateFrom: { type: 'string' },
            dateTo: { type: 'string' },
            cursor: { type: 'string' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'openPage',
        description: 'Open one page from the web and read its full content. Pass the exact url from a search result or a citation (or its page id).',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'the page url as shown in search results or citations' },
            pageId: { type: 'string', description: 'alternative: the opaque page id' },
          },
          required: ['url'],
        },
      },
    },
  ];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function parseJsonLoose<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function truncate(s: string): string {
  return s.length <= MAX_TOOL_RESULT_CHARS ? s : `${s.slice(0, MAX_TOOL_RESULT_CHARS)}... <truncated>`;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
