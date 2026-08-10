import Fastify, { type FastifyInstance } from 'fastify';
import type { Platform, SearchHit, SearchResultPage, VisiblePage, WorldManifest } from '@echobench/schema';
import { SearchQuerySchema, OpenPageRequestSchema } from '@echobench/schema';
import { WorldSearchIndex, makeSnippet, pageTitle } from './bm25.js';

const PAGE_SIZE = 10;
const TOKEN_HEADER = 'x-world-token';
const SYNTH_URL_PATTERN = /^https:\/\/(threadit|news|official)\.echo\/p\/([a-z][a-z0-9_]*)$/;

export class EchoWeb {
  private worldsByToken = new Map<string, WorldManifest>();
  private indexByToken = new Map<string, WorldSearchIndex>();

  constructor(worlds: WorldManifest[]) {
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

  search(world: WorldManifest, input: { query: string; site?: Platform; dateFrom?: string; dateTo?: string; cursor?: string }): SearchResultPage {
    const idx = this.indexFor(world);
    const ranked = idx.rankedIds(input.query);

    const filtered = ranked.filter(({ pageId }) => {
      const page = world.pages.find((p) => p.pageId === pageId)!;
      if (input.site && page.platform !== input.site) return false;
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
        publishedAt: page.publishedAt,
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

  openPage(world: WorldManifest, pageId: string): VisiblePage | null {
    return world.pages.find((p) => p.pageId === pageId) ?? null;
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
      const out = this.search(world, {
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

      let pageId = parsed.data.pageId.trim();
      if (pageId.includes('://') || pageId.includes('.echo/')) {
        const m = pageId.match(SYNTH_URL_PATTERN);
        const target = m?.[2];
        if (!target) return reply.code(403).send({ error: 'only synthetic .echo pages are accessible; external URLs cannot be opened' });
        pageId = target;
      }
      if (/[/\\]|\.\./.test(pageId)) {
        return reply.code(403).send({ error: 'invalid page identifier' });
      }

      const page = this.openPage(world, pageId);
      if (!page) return reply.code(404).send({ error: `page not found in this world: ${pageId}` });
      return page;
    });

    return app;
  }
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
