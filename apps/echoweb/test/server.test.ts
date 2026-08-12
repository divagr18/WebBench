import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CONDITIONS, type WorldManifest } from '@echobench/schema';
import { buildSyntheticClaims, buildWorld } from '@echobench/generator';
import { EchoWeb } from '../src/server.js';

const OPTS = { createdAt: '2026-01-01T00:00:00Z', proseModel: null };

function fnvHash(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function fakeEmbed(text: string): number[] {
  const v = new Array<number>(384).fill(0);
  for (const t of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!t) continue;
    const idx = fnvHash(t) % 384;
    v[idx] = (v[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

const embedQuery = async (q: string): Promise<number[]> => fakeEmbed(q);

let worlds: WorldManifest[];
let claim: ReturnType<typeof buildSyntheticClaims>[number];
let app: FastifyInstance;

function tokenOf(condition: string): string {
  return worlds.find((w) => w.condition === condition)!.worldToken;
}

async function search(token: string, query: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/search',
    headers: { 'x-world-token': token, 'content-type': 'application/json' },
    payload: JSON.stringify({ query, ...extra }),
  });
}

beforeAll(() => {
  claim = buildSyntheticClaims(50).find((c) => c.answerType === 'numeric')!;
  worlds = CONDITIONS.map((c) => buildWorld(claim, c, OPTS));
  const echo = new EchoWeb(worlds, { embedQuery });
  app = echo.buildApp();
});

describe('echoweb v2: search surface', () => {
  it('health reports loaded worlds', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(JSON.parse(r.body).worlds).toBe(6);
  });

  it('rejects missing and invalid tokens', async () => {
    const r1 = await app.inject({ method: 'POST', url: '/search', payload: JSON.stringify({ query: 'x' }), headers: { 'content-type': 'application/json' } });
    expect(r1.statusCode).toBe(401);
    const r2 = await search('f'.repeat(64), 'x');
    expect(r2.statusCode).toBe(401);
  });

  it('returns realistic hits with engagement, outlet and siteDomain', async () => {
    const r = await search(tokenOf('clean'), claim.entityName);
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.results.length).toBeGreaterThan(3);
    for (const hit of body.results) {
      expect(hit.url).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//);
      expect(hit.url).not.toContain('.echo/');
      expect(hit.pageId).toMatch(/^p_[a-z0-9]{12}$/);
      expect(hit.engagement.views).toBeGreaterThanOrEqual(0);
      expect(typeof hit.siteDomain).toBe('string');
      expect(hit.siteDomain.length).toBeGreaterThan(3);
    }
  });

  it('search is deterministic for identical queries', async () => {
    const r1 = await search(tokenOf('clean'), claim.entityName);
    const r2 = await search(tokenOf('clean'), claim.entityName);
    expect(r1.body).toBe(r2.body);
  });

  it('ranked_poison forces the poison page to rank one for topical queries', async () => {
    const cleanBody = JSON.parse((await search(tokenOf('clean'), claim.entityName)).body);
    const poisonBody = JSON.parse((await search(tokenOf('ranked_poison'), claim.entityName)).body);
    expect(poisonBody.results[0].outlet).toMatch(/blast|scoop|rumor/i);
    expect(cleanBody.results[0].outlet).not.toMatch(/blast|scoop|rumor/i);
  });

  it('supports site filtering by platform and by domain', async () => {
    const byPlatform = JSON.parse((await search(tokenOf('clean'), claim.entityName, { site: 'news' })).body);
    expect(byPlatform.results.length).toBeGreaterThan(0);
    for (const hit of byPlatform.results) expect(hit.platform).toBe('news');
    const someDomain = byPlatform.results[0].siteDomain;
    const byDomain = JSON.parse((await search(tokenOf('clean'), claim.entityName, { site: someDomain })).body);
    expect(byDomain.results.length).toBeGreaterThan(0);
    for (const hit of byDomain.results) expect(hit.siteDomain).toBe(someDomain);
  });

  it('hybrid search retrieves a page via semantics when lexical matches nothing', async () => {
    const clean = worlds.find((w) => w.condition === 'clean')!;
    const target = clean.pages.find((p) => p.platform === 'official')!;
    const ghostQuery = 'zebra quantum flux capacitor';
    const lexicalOnly = JSON.parse((await search(tokenOf('clean'), ghostQuery)).body);
    expect(lexicalOnly.results.length).toBe(0);

    const boosted: WorldManifest = {
      ...clean,
      pageEmbeddings: { ...(clean.pageEmbeddings ?? {}), [target.pageId]: fakeEmbed(ghostQuery) },
    };
    const echo2 = new EchoWeb([boosted], { embedQuery });
    const app2 = echo2.buildApp();
    const r = await app2.inject({
      method: 'POST',
      url: '/search',
      headers: { 'x-world-token': boosted.worldToken, 'content-type': 'application/json' },
      payload: JSON.stringify({ query: ghostQuery }),
    });
    const body = JSON.parse(r.body);
    expect(body.results.length).toBe(1);
    expect(body.results[0].pageId).toBe(target.pageId);
  });

  it('paginates beyond 10 results', async () => {
    const broad = claim.keywords.join(' ');
    const r1 = await search(tokenOf('clean'), broad);
    const body1 = JSON.parse(r1.body);
    if (body1.totalResults <= 10) return;
    expect(body1.results.length).toBe(10);
    expect(body1.nextCursor).not.toBeNull();
    const r2 = await search(tokenOf('clean'), broad, { cursor: body1.nextCursor });
    const body2 = JSON.parse(r2.body);
    expect(body2.results.length).toBe(body1.totalResults - 10);
    const ids1 = new Set(body1.results.map((h: { pageId: string }) => h.pageId));
    for (const hit of body2.results) expect(ids1.has(hit.pageId)).toBe(false);
  });
});

describe('echoweb v2: openPage isolation', () => {
  it('opens a page by opaque pageId and by realistic URL', async () => {
    const w = worlds.find((x) => x.condition === 'clean')!;
    const target = w.pages.find((p) => p.platform === 'news')!;
    const r1 = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': w.worldToken, 'content-type': 'application/json' },
      payload: JSON.stringify({ pageId: target.pageId }),
    });
    expect(r1.statusCode).toBe(200);
    expect(JSON.parse(r1.body).pageId).toBe(target.pageId);
    const r2 = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': w.worldToken, 'content-type': 'application/json' },
      payload: JSON.stringify({ pageId: target.url }),
    });
    expect(r2.statusCode).toBe(200);
    expect(JSON.parse(r2.body).url).toBe(target.url);
  });

  it('serves pages only within the token-scoped world', async () => {
    const clean = worlds.find((w) => w.condition === 'clean')!;
    const echoWorld = worlds.find((w) => w.condition === 'manufactured_consensus')!;
    const cleanOnly = clean.pages.find((p) => p.platform === 'official')!;
    const r = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': echoWorld.worldToken, 'content-type': 'application/json' },
      payload: JSON.stringify({ pageId: cleanOnly.pageId }),
    });
    expect(r.statusCode).toBe(404);
  });

  it('rejects external URLs and path traversal', async () => {
    const w = worlds.find((x) => x.condition === 'clean')!;
    for (const bad of ['https://www.google.com/search?q=x', 'https://reddit.com/r/anything', '../../etc/passwd', 'a/b']) {
      const r = await app.inject({
        method: 'POST',
        url: '/openPage',
        headers: { 'x-world-token': w.worldToken, 'content-type': 'application/json' },
        payload: JSON.stringify({ pageId: bad }),
      });
      expect([403, 404]).toContain(r.statusCode);
      if (bad.startsWith('https://')) expect(r.statusCode).toBe(403);
    }
  });

  it('never leaks hidden metadata through search or openPage', async () => {
    const w = worlds.find((x) => x.condition === 'manufactured_consensus')!;
    const s = await search(w.worldToken, claim.entityName);
    const target = w.pages[0]!;
    const o = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': w.worldToken, 'content-type': 'application/json' },
      payload: JSON.stringify({ pageId: target.pageId }),
    });
    for (const body of [s.body, o.body]) {
      for (const leaked of ['"stance"', '"pageMeta"', '"originClusterId"', '"copiedFromPageId"', '"worldToken"', 'supports_true', 'official_primary', 'news_wire', 'threadit_main']) {
        expect(body.includes(leaked), `leaked ${leaked}`).toBe(false);
      }
    }
  });
});
