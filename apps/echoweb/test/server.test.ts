import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CONDITIONS, type WorldManifest } from '@echobench/schema';
import { buildSyntheticClaims, buildWorld } from '@echobench/generator';
import { EchoWeb } from '../src/server.js';

const OPTS = { createdAt: '2026-01-01T00:00:00Z', proseModel: null };

let worlds: WorldManifest[];
let claim: ReturnType<typeof buildSyntheticClaims>[number];
let echo: EchoWeb;
let app: FastifyInstance;

beforeAll(() => {
  claim = buildSyntheticClaims(50).find((c) => c.claimId === 'syn_001')!;
  worlds = CONDITIONS.map((c) => buildWorld(claim, c, OPTS));
  echo = new EchoWeb(worlds);
  app = echo.buildApp();
});

function tokenOf(condition: string): string {
  return worlds.find((w) => w.condition === condition)!.worldToken;
}

async function search(token: string | undefined, query: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/search',
    headers: token ? { 'x-world-token': token } : {},
    payload: { query, ...extra },
  });
}

describe('echoweb isolation and search', () => {
  it('rejects requests without a world token', async () => {
    const r = await search(undefined, claim.entityName);
    expect(r.statusCode).toBe(401);
    const r2 = await app.inject({ method: 'POST', url: '/openPage', payload: { pageId: 'official_primary' } });
    expect(r2.statusCode).toBe(401);
  });

  it('rejects an invalid world token', async () => {
    const r = await search('deadbeef'.repeat(8), claim.entityName);
    expect(r.statusCode).toBe(401);
  });

  it('returns deterministic results for identical queries', async () => {
    const token = tokenOf('clean');
    const r1 = await search(token, `${claim.entityName} ${claim.attributeLabel}`);
    const r2 = await search(token, `${claim.entityName} ${claim.attributeLabel}`);
    expect(r1.statusCode).toBe(200);
    expect(r1.body).toBe(r2.body);
    const body = JSON.parse(r1.body);
    expect(body.results.length).toBeGreaterThan(0);
  });

  it('ranked_poison forces the poison page to rank one for topical queries', async () => {
    const token = tokenOf('ranked_poison');
    const r = await search(token, `${claim.entityName} ${claim.attributeLabel}`);
    const body = JSON.parse(r.body);
    expect(body.results.length).toBeGreaterThan(1);
    expect(body.results[0].pageId).toBe('news_tabloid');
    const cleanR = await search(tokenOf('clean'), `${claim.entityName} ${claim.attributeLabel}`);
    const cleanBody = JSON.parse(cleanR.body);
    expect(cleanBody.results[0].pageId).not.toBe('news_tabloid');
  });

  it('supports site filtering and pagination', async () => {
    const token = tokenOf('clean');
    const r = await search(token, claim.entityName, { site: 'news' });
    const body = JSON.parse(r.body);
    for (const hit of body.results) expect(hit.platform).toBe('news');
    expect(body.results.length).toBeLessThanOrEqual(5);
  });

  it('openPage returns the page scoped to the token world', async () => {
    const token = tokenOf('clean');
    const r = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': token },
      payload: { pageId: 'official_primary' },
    });
    expect(r.statusCode).toBe(200);
    const page = JSON.parse(r.body);
    expect(page.pageId).toBe('official_primary');
    expect(page.content.platform).toBe('official');
  });

  it('never leaks hidden evaluator metadata through search or openPage', async () => {
    const token = tokenOf('manufactured_consensus');
    const r1 = await search(token, claim.entityName);
    const r2 = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': token },
      payload: { pageId: 'news_wire' },
    });
    for (const body of [r1.body, r2.body]) {
      for (const leaked of ['"stance"', '"pageMeta"', '"originClusterId"', '"copiedFromPageId"', '"truth"', '"worldToken"']) {
        expect(body.includes(leaked), `leaked ${leaked}`).toBe(false);
      }
    }
  });

  it('rejects arbitrary external URLs through openPage', async () => {
    const token = tokenOf('clean');
    for (const pageId of [
      'https://www.google.com/search?q=test',
      'https://dailyledger.real/p/official_primary',
      'ftp://example.com/file',
      '../../../etc/passwd',
    ]) {
      const r = await app.inject({
        method: 'POST',
        url: '/openPage',
        headers: { 'x-world-token': token },
        payload: { pageId },
      });
      expect([400, 403]).toContain(r.statusCode);
    }
  });

  it('accepts synthetic .echo citation URLs and resolves them to page ids', async () => {
    const token = tokenOf('manufactured_consensus');
    const r = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': token },
      payload: { pageId: 'https://threadit.echo/p/threadit_main' },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).pageId).toBe('threadit_main');
  });

  it('404s unknown page ids', async () => {
    const token = tokenOf('clean');
    const r = await app.inject({
      method: 'POST',
      url: '/openPage',
      headers: { 'x-world-token': token },
      payload: { pageId: 'does_not_exist' },
    });
    expect(r.statusCode).toBe(404);
  });
});
