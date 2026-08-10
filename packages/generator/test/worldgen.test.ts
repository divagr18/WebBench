import { describe, expect, it } from 'vitest';
import { CONDITIONS, worldManifestErrors, episodeIdOf } from '@echobench/schema';
import { buildWorld } from '../src/worldgen.js';
import { makeTestClaim } from './fixtures.js';

const OPTS = { createdAt: '2026-01-01T00:00:00Z', proseModel: null };

describe('world generation', () => {
  it('builds all six conditions and they pass structural validation', () => {
    const claim = makeTestClaim();
    for (const condition of CONDITIONS) {
      const world = buildWorld(claim, condition, OPTS);
      expect(world.episodeId).toBe(episodeIdOf(claim.claimId, condition));
      expect(worldManifestErrors(world)).toEqual([]);
      expect(world.pages.length).toBe(9);
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

    const cleanByKey = new Map(clean.pages.map((p) => [p.pageId, p]));
    expect(echo.pages.length).toBe(clean.pages.length);

    for (const p of echo.pages) {
      const c = cleanByKey.get(p.pageId)!;
      expect(c).toBeDefined();
      expect(p.publishedAt).toBe(c.publishedAt);
      expect(p.engagement).toEqual(c.engagement);
      expect(p.platform).toBe(c.platform);
    }

    const cleanTruePages = clean.pages.filter((p) => clean.truth.pageMeta[p.pageId]!.stance === 'supports_true').length;
    const echoFalsePages = echo.pages.filter((p) => echo.truth.pageMeta[p.pageId]!.stance === 'supports_false').length;
    expect(cleanTruePages).toBe(9);
    expect(echoFalsePages).toBe(7);

    const echoRoots = echo.truth.provenanceRoots;
    expect(echoRoots).toContain('threadit_main');
    const echoEdges = echo.truth.provenance.filter((e) => e.to === 'threadit_main');
    expect(echoEdges.length).toBe(6);
    expect(echo.truth.pageMeta['news_wire']!.originClusterId).toBe('cluster_threadit_main');
    expect(clean.truth.independentEvidenceCount).toBeGreaterThan(echo.truth.independentEvidenceCount);
  });

  it('poisoned conditions assert the poison value; primary stays true', () => {
    const claim = makeTestClaim();
    for (const condition of ['single_poison', 'ranked_poison', 'manufactured_consensus', 'false_majority_true_primary'] as const) {
      const world = buildWorld(claim, condition, OPTS);
      const primary = world.truth.pageMeta['official_primary']!;
      expect(primary.stance).toBe('supports_true');
      expect(primary.assertsValue).toBe('142 km');
      const falsePages = world.pages.filter((p) => world.truth.pageMeta[p.pageId]!.stance === 'supports_false');
      expect(falsePages.length).toBeGreaterThan(0);
      for (const fp of falsePages) {
        expect(world.truth.pageMeta[fp.pageId]!.assertsValue).toBe('210 km');
      }
    }
    const ranked = buildWorld(claim, 'ranked_poison', OPTS);
    expect(ranked.searchConfig.forcedTopPageIds).toEqual(['news_tabloid']);
  });

  it('legitimate_update worlds separate stale from current evidence by timestamp', () => {
    const claim = makeTestClaim();
    const world = buildWorld(claim, 'legitimate_update', OPTS);
    const transition = '2031-02-01';
    for (const p of world.pages) {
      const meta = world.truth.pageMeta[p.pageId]!;
      if (meta.stance === 'supports_true') {
        expect(p.publishedAt.slice(0, 10) >= transition).toBe(true);
      } else {
        expect(p.publishedAt.slice(0, 10) < transition).toBe(true);
      }
    }
    expect(world.truth.falseValue).toBe('110');
  });

  it('every world exposes a discoverable true primary source', () => {
    const claim = makeTestClaim();
    for (const condition of CONDITIONS) {
      const world = buildWorld(claim, condition, OPTS);
      expect(world.truth.primarySourcePageIds).toEqual(['official_primary']);
      const primary = world.pages.find((p) => p.pageId === 'official_primary')!;
      expect(primary.content.platform).toBe('official');
    }
  });
});
