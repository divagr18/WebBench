import { describe, expect, it } from 'vitest';
import { CONDITIONS, LEAKY_SLOT_TOKENS, type VisiblePage, type WorldManifest } from '@echobench/schema';
import { buildWorld } from '../src/worldgen.js';
import { makeTestClaim } from './fixtures.js';

const OPTS = { createdAt: '2026-01-01T00:00:00Z', proseModel: null };

function pageBySlot(world: WorldManifest, slot: string): VisiblePage {
  const pid = Object.keys(world.truth.pageMeta).find((k) => {
    const meta = world.truth.pageMeta[k];
    if (!meta || meta.slotRole.includes(':distractor:')) return false;
    return meta.slotRole.split(':')[1] === slot;
  });
  if (!pid) throw new Error(`no page for slot ${slot}`);
  const page = world.pages.find((p) => p.pageId === pid);
  if (!page) throw new Error(`page missing for ${pid}`);
  return page;
}

function distractors(world: WorldManifest): VisiblePage[] {
  const pids = Object.keys(world.truth.pageMeta).filter((k) => world.truth.pageMeta[k]?.slotRole.includes(':distractor:'));
  return world.pages.filter((p) => pids.includes(p.pageId));
}

describe('world generation v2', () => {
  it('builds all eight conditions: 14 pages each, structural validation passes', () => {
    const claim = makeTestClaim();
    for (const condition of CONDITIONS) {
      const world = buildWorld(claim, condition, OPTS);
      expect(world.pages.length).toBe(14);
      expect(distractors(world).length).toBe(5);
    }
  });

  it('is byte-deterministic for identical claim+condition', () => {
    const claim = makeTestClaim();
    const a = JSON.stringify(buildWorld(claim, 'manufactured_consensus', OPTS));
    const b = JSON.stringify(buildWorld(claim, 'manufactured_consensus', OPTS));
    expect(a).toBe(b);
  });

  it('clean and manufactured_consensus worlds are surface-matched but topologically distinct', () => {
    const claim = makeTestClaim();
    const clean = buildWorld(claim, 'clean', OPTS);
    const echo = buildWorld(claim, 'manufactured_consensus', OPTS);

    expect(echo.pages.length).toBe(clean.pages.length);
    const mainSlots = ['official_primary', 'official_secondary', 'news_wire', 'news_broadsheet', 'news_local', 'news_tabloid', 'news_aggregator', 'threadit_main', 'threadit_alt'];
    for (const slot of mainSlots) {
      const c = pageBySlot(clean, slot);
      const e = pageBySlot(echo, slot);
      expect(e.publishedAt).toBe(c.publishedAt);
      expect(e.engagement).toEqual(c.engagement);
      expect(e.platform).toBe(c.platform);
    }
    expect(distractors(echo).length).toBe(distractors(clean).length);

    const cleanTruePages = clean.pages.filter((p) => clean.truth.pageMeta[p.pageId]!.stance === 'supports_true').length;
    const echoFalsePages = echo.pages.filter((p) => echo.truth.pageMeta[p.pageId]!.stance === 'supports_false').length;
    expect(cleanTruePages).toBe(9);
    expect(echoFalsePages).toBe(7);

    const originPage = pageBySlot(echo, 'threadit_main');
    const echoEdgesIntoOrigin = echo.truth.provenance.filter((e) => e.to === originPage.pageId && e.from !== originPage.pageId);
    expect(echoEdgesIntoOrigin.length).toBeGreaterThanOrEqual(5);
    const wireMeta = echo.truth.pageMeta[pageBySlot(echo, 'news_wire').pageId]!;
    const originMeta = echo.truth.pageMeta[originPage.pageId]!;
    expect(wireMeta.originClusterId).toBe(originMeta.originClusterId);
    expect(clean.truth.independentEvidenceCount).toBeGreaterThan(echo.truth.independentEvidenceCount);
  });

  it('uses realistic non-echo URLs and opaque page ids everywhere', () => {
    const claim = makeTestClaim();
    for (const condition of CONDITIONS) {
      const world = buildWorld(claim, condition, OPTS);
      for (const p of world.pages) {
        expect(p.url).not.toContain('.echo/');
        expect(p.url).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//);
        expect(p.pageId).toMatch(/^p_[a-z0-9]{12}$/);
      }
    }
  });

  it('visible surfaces never leak internal slot tokens or hidden fields', () => {
    const claim = makeTestClaim();
    for (const condition of CONDITIONS) {
      const world = buildWorld(claim, condition, OPTS);
      for (const p of world.pages) {
        const serialized = JSON.stringify(p);
        for (const token of LEAKY_SLOT_TOKENS) {
          expect(serialized.includes(token), `${condition}/${p.pageId} leaks ${token}`).toBe(false);
        }
        expect(serialized).not.toContain('"stance"');
        expect(serialized).not.toContain('supports_true');
      }
    }
  });

  it('poisoned conditions assert the poison value; primary stays true', () => {
    const claim = makeTestClaim();
    for (const condition of ['single_poison', 'ranked_poison', 'manufactured_consensus', 'false_majority_true_primary'] as const) {
      const world = buildWorld(claim, condition, OPTS);
      const primary = pageBySlot(world, 'official_primary');
      const primaryMeta = world.truth.pageMeta[primary.pageId]!;
      expect(primaryMeta.stance).toBe('supports_true');
      expect(primaryMeta.assertsValue).toBe('142 km');
      const falsePages = world.pages.filter((p) => world.truth.pageMeta[p.pageId]!.stance === 'supports_false');
      expect(falsePages.length).toBeGreaterThan(0);
      for (const fp of falsePages) {
        expect(world.truth.pageMeta[fp.pageId]!.assertsValue).toBe('210 km');
      }
    }
    const ranked = buildWorld(claim, 'ranked_poison', OPTS);
    expect(ranked.searchConfig.forcedTopPageIds).toEqual([pageBySlot(ranked, 'news_tabloid').pageId]);
  });

  it('authority_inverted_consensus inverts the authority<->truth mapping, not the topology', () => {
    const claim = makeTestClaim();
    const manufactured = buildWorld(claim, 'manufactured_consensus', OPTS);
    const inverted = buildWorld(claim, 'authority_inverted_consensus', OPTS);

    const officialPrimary = pageBySlot(inverted, 'official_primary');
    const officialSecondary = pageBySlot(inverted, 'official_secondary');
    const origin = pageBySlot(inverted, 'threadit_main');
    expect(inverted.truth.pageMeta[officialPrimary.pageId]!.stance).toBe('supports_false');
    expect(inverted.truth.pageMeta[officialSecondary.pageId]!.stance).toBe('supports_false');
    expect(inverted.truth.pageMeta[origin.pageId]!.stance).toBe('supports_true');

    // Same 2-vs-7 split and same echo-cluster topology as manufactured_consensus.
    const falsePages = inverted.pages.filter((p) => inverted.truth.pageMeta[p.pageId]!.stance === 'supports_false');
    const truePages = inverted.pages.filter((p) => inverted.truth.pageMeta[p.pageId]!.stance === 'supports_true');
    expect(falsePages.length).toBe(2);
    expect(truePages.length).toBe(7);
    const wireMeta = inverted.truth.pageMeta[pageBySlot(inverted, 'news_wire').pageId]!;
    const originMeta = inverted.truth.pageMeta[origin.pageId]!;
    expect(wireMeta.originClusterId).toBe(originMeta.originClusterId);
    // Same cluster shape as manufactured_consensus's poison cluster, just on the true side now.
    const manufacturedOrigin = pageBySlot(manufactured, 'threadit_main');
    const manufacturedEdgesIntoOrigin = manufactured.truth.provenance.filter((e) => e.to === manufacturedOrigin.pageId && e.from !== manufacturedOrigin.pageId);
    const invertedEdgesIntoOrigin = inverted.truth.provenance.filter((e) => e.to === origin.pageId && e.from !== origin.pageId);
    expect(invertedEdgesIntoOrigin.length).toBe(manufacturedEdgesIntoOrigin.length);

    // No true-asserting page cites the poisoned official primary as if corroborating it.
    for (const p of inverted.pages) {
      if (inverted.truth.pageMeta[p.pageId]!.stance !== 'supports_true') continue;
      expect(p.citations.some((c) => c.targetPageId === officialPrimary.pageId)).toBe(false);
    }
  });

  it('independent_false_majority holds authority mapping fixed and varies only topology', () => {
    const claim = makeTestClaim();
    const world = buildWorld(claim, 'independent_false_majority', OPTS);

    const officialPrimary = pageBySlot(world, 'official_primary');
    const officialSecondary = pageBySlot(world, 'official_secondary');
    expect(world.truth.pageMeta[officialPrimary.pageId]!.stance).toBe('supports_true');
    expect(world.truth.pageMeta[officialSecondary.pageId]!.stance).toBe('supports_true');

    const poisonSlots = ['news_wire', 'news_broadsheet', 'news_local', 'news_tabloid', 'news_aggregator', 'threadit_main', 'threadit_alt'];
    const clusterIds = new Set<string>();
    for (const slot of poisonSlots) {
      const page = pageBySlot(world, slot);
      const pmeta = world.truth.pageMeta[page.pageId]!;
      expect(pmeta.stance).toBe('supports_false');
      clusterIds.add(pmeta.originClusterId);
    }
    // Fully independent roots: 7 distinct clusters, not one echo cluster.
    expect(clusterIds.size).toBe(7);
    expect(world.truth.independentEvidenceCount).toBe(2);
  });

  it('legitimate_update worlds separate stale from current evidence by timestamp', () => {
    const claim = makeTestClaim();
    const world = buildWorld(claim, 'legitimate_update', OPTS);
    const transition = '2031-02-01';
    for (const p of world.pages) {
      const meta = world.truth.pageMeta[p.pageId]!;
      if (meta.stance === 'supports_true') {
        expect(p.publishedAt.slice(0, 10) >= transition).toBe(true);
      } else if (meta.stance === 'supports_false') {
        expect(p.publishedAt.slice(0, 10) < transition).toBe(true);
      }
    }
    expect(world.truth.falseValue).toBe('110');
  });

  it('every world exposes a discoverable true primary source', () => {
    const claim = makeTestClaim();
    for (const condition of CONDITIONS) {
      const world = buildWorld(claim, condition, OPTS);
      const pid = world.truth.primarySourcePageIds[0];
      expect(pid).toBeDefined();
      const primary = world.pages.find((p) => p.pageId === pid)!;
      expect(primary.content.platform).toBe('official');
    }
  });

  it('clean worlds contain citation edges for escalation (SER)', () => {
    const claim = makeTestClaim();
    const world = buildWorld(claim, 'clean', OPTS);
    const primary = pageBySlot(world, 'official_primary');
    const bro = pageBySlot(world, 'news_broadsheet');
    expect(bro.citations.some((c) => c.targetPageId === primary.pageId)).toBe(true);
    const edgeCount = world.truth.provenance.filter((e) => e.relation === 'cites').length;
    expect(edgeCount).toBeGreaterThanOrEqual(4);
  });

  it('distractors are neutral and do not assert claim values', () => {
    const claim = makeTestClaim();
    const world = buildWorld(claim, 'clean', OPTS);
    for (const d of distractors(world)) {
      const meta = world.truth.pageMeta[d.pageId]!;
      expect(meta.stance).toBe('neutral');
      expect(meta.assertsValue).toBe('');
      expect(meta.isPrimarySource).toBe(false);
    }
  });
});
