import type { VisiblePage, WorldManifest } from '../src/index.js';

export function makePage(id: string, platform: 'threadit' | 'news' | 'official', opts: Partial<VisiblePage> = {}): VisiblePage {
  const baseContent =
    platform === 'threadit'
      ? { platform: 'threadit' as const, community: 'r/test', title: `T ${id}`, body: `Body ${id}`, votes: 5, flair: null, edited: false, comments: [] }
      : platform === 'news'
        ? { platform: 'news' as const, outlet: 'Daily Ledger', outletType: 'broadsheet' as const, headline: `H ${id}`, byline: 'Staff', body: `Article ${id}`, correctionNotice: null }
        : { platform: 'official' as const, orgName: 'Bureau', orgType: 'government' as const, docType: 'notice' as const, title: `O ${id}`, body: `Official ${id}` };
  return {
    pageId: id,
    url: `https://${platform}.echo/p/${id}`,
    platform,
    publishedAt: '2026-01-01T00:00:00Z',
    content: opts.content ?? baseContent,
    engagement: { views: 10, likes: 1, shares: 0, comments: 0 },
    citations: opts.citations ?? [],
  };
}

export function makeWorld(overrides: Partial<WorldManifest> = {}): WorldManifest {
  const pPrimary = makePage('official_primary', 'official');
  const pNews = makePage('news_one', 'news');
  const pNews2 = makePage('news_two', 'news');
  const pForum = makePage('threadit_one', 'threadit');
  const pages = [pPrimary, pNews, pNews2, pForum];
  const sha = 'a'.repeat(64);
  return {
    schemaVersion: 1,
    episodeId: 'syn_001__clean',
    claimId: 'syn_001',
    track: 'synthetic',
    split: 'dev',
    condition: 'clean',
    seed: 'seed-1',
    worldDate: '2026-01-15',
    generatedAt: '2026-01-01T00:00:00Z',
    generatorVersion: '0.1.0',
    proseModel: null,
    truth: {
      groundTruth: { kind: 'boolean', value: true },
      priorValue: { kind: 'boolean', value: false },
      falseValue: 'false',
      primarySourcePageIds: ['official_primary'],
      independentEvidenceCount: 3,
      provenanceRoots: ['official_primary', 'news_one', 'news_two', 'threadit_one'],
      provenance: [],
      pageMeta: {
        official_primary: meta('syn_001'),
        news_one: meta('syn_001'),
        news_two: meta('syn_001'),
        threadit_one: meta('syn_001'),
      },
    },
    pages,
    searchConfig: { mode: 'bm25', forcedTopPageIds: [] },
    promptHashes: { research: sha },
    checksums: { pages: sha, manifest: sha },
    worldToken: sha,
    ...overrides,
  };
}

export function meta(claimId: string, over: Partial<WorldManifest['truth']['pageMeta'][string]> = {}): WorldManifest['truth']['pageMeta'][string] {
  return {
    claimId,
    stance: 'supports_true',
    assertsValue: 'true',
    originClusterId: 'cluster_primary',
    copiedFromPageId: null,
    authorityClass: 'primary_official',
    isPrimarySource: true,
    slotRole: 'primary',
    renderMode: 'template',
    ...over,
  };
}
