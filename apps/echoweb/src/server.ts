import Fastify, { type FastifyInstance } from 'fastify';
import type { Platform, SearchHit, SearchResultPage, VisiblePage, WorldManifest } from '@echobench/schema';
import { SearchQuerySchema, OpenPageRequestSchema } from '@echobench/schema';
import { WorldSearchIndex, makeSnippet, pageTitle, pageOutletLabel } from './bm25.js';

const PAGE_SIZE = 10;
const TOKEN_HEADER = 'x-world-token';
const PLATFORMS: Platform[] = ['threadit', 'news', 'official'];

export interface EchoWebOptions {
  /** Optional semantic query embedder; used only for worlds with frozen pageEmbeddings. */
  embedQuery?: (query: string) => Promise<number[]>;
}

export class EchoWeb {
  private worldsByToken = new Map<string, WorldManifest>();
  private indexByToken = new Map<string, WorldSearchIndex>();
  private readonly embedQuery?: (query: string) => Promise<number[]>;

  constructor(worlds: WorldManifest[], opts: EchoWebOptions = {}) {
    this.embedQuery = opts.embedQuery;
    for (const w of worlds) {
      this.worldsByToken.set(w.worldToken, w);
    }
  }

  get tokens(): string[] {
    return [...this.worldsByToken.keys()];
  }

  resolve(token: string | undefined): WorldManifest | null {
    if (!token) return null;
    return this.worldsByToken.get(token) ?? null;
  }

  indexFor(world: WorldManifest): WorldSearchIndex {
    let idx = this.indexByToken.get(world.worldToken);
    if (!idx) {
      idx = new WorldSearchIndex(world);
      this.indexByToken.set(world.worldToken, idx);
    }
    return idx;
  }

  async search(world: WorldManifest, input: { query: string; site?: string; dateFrom?: string; dateTo?: string; cursor?: string }): Promise<SearchResultPage> {
    const idx = this.indexFor(world);
    const ranked = await idx.rankedIds(input.query, this.embedQuery);

    const filtered = ranked.filter(({ pageId }) => {
      const page = world.pages.find((p) => p.pageId === pageId);
      if (!page) return false;
      if (input.site && !matchesSite(page, input.site)) return false;
      const day = page.publishedAt.slice(0, 10);
      if (input.dateFrom && day < input.dateFrom) return false;
      if (input.dateTo && day > input.dateTo) return false;
      return true;
    });

    const offset = parseCursor(input.cursor);
    const slice = filtered.slice(offset, offset + PAGE_SIZE);
    const results: SearchHit[] = slice.map(({ pageId }) => {
      const page = world.pages.find((p) => p.pageId === pageId)!;
      return {
        pageId: page.pageId,
        url: page.url,
        title: pageTitle(page),
        snippet: makeSnippet(page, input.query),
        platform: page.platform,
        siteDomain: domainOf(page.url),
        outlet: pageOutletLabel(page),
        publishedAt: page.publishedAt,
        engagement: page.engagement,
      };
    });

    const nextOffset = offset + PAGE_SIZE;
    return {
      query: input.query,
      site: input.site ?? null,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      totalResults: filtered.length,
      nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
      results,
    };
  }

  openPage(world: WorldManifest, target: string): VisiblePage | null {
    return world.pages.find((p) => p.pageId === target || normalizeUrl(p.url) === normalizeUrl(target)) ?? null;
  }

  buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });

    app.get('/health', async () => ({ ok: true, worlds: this.worldsByToken.size }));

    app.post('/search', async (req, reply) => {
      const world = this.resolve(headerToken(req.headers));
      if (!world) return reply.code(401).send({ error: 'missing or invalid world token' });
      const parsed = SearchQuerySchema.safeParse((req.body ?? {}) as Record<string, unknown>);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid search request', issues: parsed.error.issues.map((i) => i.message) });
      }
      const out = await this.search(world, {
        query: parsed.data.query,
        ...(parsed.data.site ? { site: parsed.data.site } : {}),
        ...(parsed.data.dateFrom ? { dateFrom: parsed.data.dateFrom } : {}),
        ...(parsed.data.dateTo ? { dateTo: parsed.data.dateTo } : {}),
        ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      });
      return out;
    });

    app.post('/openPage', async (req, reply) => {
      const world = this.resolve(headerToken(req.headers));
      if (!world) return reply.code(401).send({ error: 'missing or invalid world token' });
      const parsed = OpenPageRequestSchema.safeParse((req.body ?? {}) as Record<string, unknown>);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid openPage request' });

      const raw = parsed.data.pageId.trim();
      if (/[/\\]|\.\./.test(raw) && !raw.includes('://')) {
        return reply.code(403).send({ error: 'invalid page identifier' });
      }

      const page = this.openPage(world, raw);
      if (!page) {
        if (raw.includes('://') || /\.[a-z]{2,}\//i.test(raw)) {
          return reply.code(403).send({ error: 'this URL is not part of the archived web and cannot be opened' });
        }
        return reply.code(404).send({ error: 'page not found in this archive' });
      }
      return page;
    });

    return app;
  }
}

function matchesSite(page: VisiblePage, site: string): boolean {
  const s = site.toLowerCase();
  if (PLATFORMS.includes(s as Platform)) return page.platform === s;
  return domainOf(page.url).includes(s) || page.url.includes(s);
}

function domainOf(url: string): string {
  const m = url.match(/^https:\/\/([^/]+)\//);
  return m?.[1] ?? '';
}

function normalizeUrl(u: string): string {
  let out = u.trim().toLowerCase();
  if (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function headerToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  const v = headers[TOKEN_HEADER];
  return Array.isArray(v) ? v[0] : v;
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number.parseInt(Buffer.from(cursor, 'base64url').toString('utf8'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}
