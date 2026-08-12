import type { ClaimRecord, PageContent, VisiblePage, WorldManifest } from '@echobench/schema';
import { PageContentSchema } from '@echobench/schema';
import type { DeepSeekClient } from '@echobench/llm';
import { buildSlotRecords, buildDistractorRecords, type SlotRecord } from './pagegen.js';
import { finalizeWorld } from './worldgen.js';
import { fillTemplate, type PromptBundle } from './prompts.js';
import { normalizeRawToAnswer, sameValue } from './values.js';
import { SeededRng } from './rng.js';

export interface RenderStats {
  pagesRendered: number;
  pagesFallback: number;
  extractionRetries: number;
  estimatedCostUsd: number;
}

interface ThreaditProse { title: string; body: string; comments: Array<{ body: string; votes: number }>; }
interface NewsProse { headline: string; body: string; }
interface OfficialProse { title: string; body: string; }

const RENDER_ATTEMPTS = 3;

export interface RenderWorldOptions {
  wordTarget: (slot: string) => number;
}

export async function renderWorld(
  client: DeepSeekClient,
  claim: ClaimRecord,
  world: WorldManifest,
  bundle: PromptBundle,
): Promise<{ world: WorldManifest; stats: RenderStats }> {
  const records = [...buildSlotRecords(claim, world.condition), ...buildDistractorRecords(claim, world.condition)];
  const byPage = new Map(records.map((r) => [r.pageId, r]));
  const stats: RenderStats = { pagesRendered: 0, pagesFallback: 0, extractionRetries: 0, estimatedCostUsd: 0 };
  const pages: VisiblePage[] = [];

  for (const page of world.pages) {
    const rec = byPage.get(page.pageId);
    if (!rec || rec.slot.startsWith('extra_')) {
      pages.push(page);
      continue;
    }
    const rendered = await renderPage(client, claim, page, rec, bundle, stats);
    pages.push(rendered);
  }

  const updated: WorldManifest = {
    ...world,
    pages,
    proseModel: client.defaultModel,
    promptHashes: { ...world.promptHashes, ...pickRenderHashes(bundle) },
  };
  for (let i = 0; i < world.pages.length; i++) {
    const orig = world.pages[i];
    const next = pages[i];
    if (orig && next && next !== orig) {
      const meta = updated.truth.pageMeta[orig.pageId];
      if (meta) meta.renderMode = 'llm';
    }
  }
  const finalized = finalizeWorld(updated);
  return { world: finalized, stats };
}

function pickRenderHashes(bundle: PromptBundle): Record<string, string> {
  return {
    render_threadit: bundle.hashes.render_threadit,
    render_news: bundle.hashes.render_news,
    render_official: bundle.hashes.render_official,
    extract_assertion: bundle.hashes.extract_assertion,
  };
}

async function renderPage(
  client: DeepSeekClient,
  claim: ClaimRecord,
  page: VisiblePage,
  rec: SlotRecord,
  bundle: PromptBundle,
  stats: RenderStats,
): Promise<VisiblePage> {
  const rng = new SeededRng(`${claim.claimId}|wordtarget|${rec.slot}`);
  const wordTarget = 60 + rng.int(0, 60);

  for (let attempt = 0; attempt < RENDER_ATTEMPTS; attempt++) {
    try {
      const prompt = buildRenderPrompt(rec, bundle, wordTarget);
      const resp = await client.chat(
        [
          { role: 'system', content: 'You are a precise content renderer. You output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        { responseFormat: 'json', maxTokens: 900, temperature: 0.7 },
      );
      stats.estimatedCostUsd += client.estimateCost(resp.usage);

      const merged = mergeProse(page, rec, resp.content);
      if (!merged) throw new Error('prose failed schema merge');

      const ok = await verifyAssertion(client, claim, merged, rec, bundle, stats);
      if (ok) {
        stats.pagesRendered++;
        return merged;
      }
      stats.extractionRetries++;
    } catch {
      stats.extractionRetries++;
    }
  }
  stats.pagesFallback++;
  return page;
}

function buildRenderPrompt(rec: SlotRecord, bundle: PromptBundle, wordTarget: number): string {
  const platform = rec.slotDef.platform;
  const base: Record<string, string> = {
    ASSERTION: rec.assertsPhrase,
    VALUE_TEXT: rec.assertsValueText,
    PUBLISHED_AT: rec.publishedAt,
    WORD_TARGET: String(wordTarget),
  };
  if (platform === 'threadit') {
    const template = bundle.texts.render_threadit;
    const commentCount = 2 + (rec.engagement.comments > 20 ? 2 : 1);
    return fillTemplate(template, {
      ...base,
      COMMUNITY: rec.slotDef.community,
      AUTHOR: rec.author.displayName,
      COMMENT_COUNT: String(commentCount),
    });
  }
  if (platform === 'news') {
    return fillTemplate(bundle.texts.render_news, {
      ...base,
      OUTLET: rec.slotDef.outletType === 'wire' ? 'Continental Wire Service' : rec.outlet,
      OUTLET_TYPE: rec.slotDef.outletType,
      AUTHOR: rec.author.displayName,
    });
  }
  return fillTemplate(bundle.texts.render_official, {
    ...base,
    ORG: rec.org,
    ORG_TYPE: rec.slotDef.orgType,
    DOC_TYPE: rec.slotDef.docType,
    DOC_ID: `${(rec.siteDomain.split('.')[0] ?? 'doc').toUpperCase()}-${rec.publishedAt.slice(0, 10)}`,
    PUBLISHED_DATE: rec.publishedAt.slice(0, 10),
  });
}

function parseJsonLoose<T>(raw: string): T | null {
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

function mergeProse(page: VisiblePage, rec: SlotRecord, raw: string): VisiblePage | null {
  const content = page.content;
  if (content.platform === 'threadit') {
    const prose = parseJsonLoose<ThreaditProse>(raw);
    if (!prose || typeof prose.title !== 'string' || typeof prose.body !== 'string' || !Array.isArray(prose.comments)) return null;
    const comments = content.comments.map((c, i) => {
      const pc = prose.comments[i];
      return {
        ...c,
        body: pc && typeof pc.body === 'string' ? pc.body : c.body,
        votes: pc && Number.isFinite(pc.votes) ? Math.max(0, Math.round(pc.votes)) : c.votes,
      };
    });
    const next: PageContent = { ...content, title: prose.title, body: prose.body, comments };
    return parseContent(page, next);
  }
  if (content.platform === 'news') {
    const prose = parseJsonLoose<NewsProse>(raw);
    if (!prose || typeof prose.headline !== 'string' || typeof prose.body !== 'string') return null;
    const next: PageContent = { ...content, headline: prose.headline, body: prose.body };
    return parseContent(page, next);
  }
  const prose = parseJsonLoose<OfficialProse>(raw);
  if (!prose || typeof prose.title !== 'string' || typeof prose.body !== 'string') return null;
  const next: PageContent = { ...content, title: prose.title, body: prose.body };
  return parseContent(page, next);
}

function parseContent(page: VisiblePage, content: PageContent): VisiblePage | null {
  const parsed = PageContentSchema.safeParse(content);
  if (!parsed.success) return null;
  return { ...page, content: parsed.data };
}

function pageToText(page: VisiblePage): string {
  const c = page.content;
  if (c.platform === 'threadit') {
    const comments = c.comments.map((x) => x.body).join(' ');
    return `${c.title}\n${c.body}\n${comments}`;
  }
  if (c.platform === 'news') return `${c.headline}\n${c.body}`;
  return `${c.title}\n${c.body}`;
}

async function verifyAssertion(
  client: DeepSeekClient,
  claim: ClaimRecord,
  page: VisiblePage,
  rec: SlotRecord,
  bundle: PromptBundle,
  stats: RenderStats,
): Promise<boolean> {
  const prompt = fillTemplate(bundle.texts.extract_assertion, { QUESTION: claim.question });
  const resp = await client.chat(
    [
      { role: 'system', content: 'You are a strict fact extractor. Output only valid JSON.' },
      { role: 'user', content: `${prompt}\n\n=== PAGE CONTENT ===\n${pageToText(page)}` },
    ],
    { responseFormat: 'json', maxTokens: 60, temperature: 0 },
  );
  stats.estimatedCostUsd += client.estimateCost(resp.usage);
  const parsed = parseJsonLoose<{ asserts?: string }>(resp.content);
  const assertsRaw = parsed?.asserts;
  if (!assertsRaw || assertsRaw.toLowerCase() === 'unknown') return false;
  const extracted = normalizeRawToAnswer(claim, assertsRaw);
  if (!extracted) return false;
  return sameValue(extracted, rec.assertsValue);
}
