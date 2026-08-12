import type { VisiblePage, WorldManifest } from '../src/index.js';

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Deterministic opaque page id matching ^p_[a-z0-9]{8,16}$. */
export function opaqueId(name: string): string {
  return `p_${fnv1a(name)}${fnv1a(name.split('').reverse().join('')).slice(0, 4)}`;
}

const SITE_BY_PLATFORM: Record<'threadit' | 'news' | 'official', string> = {
  threadit: 'threadhouse.net',
  news: 'dailyledger.com',
  official: 'bureauofrecords.gov',
};

/** Deterministic realistic URL matching the page URL pattern. */
export function realisticUrl(platform: 'threadit' | 'news' | 'official', name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `https://${SITE_BY_PLATFORM[platform]}/${slug}-${fnv1a(name).slice(0, 6)}`;
}

export function makePage(id: string, platform: 'threadit' | 'news' | 'official', opts: Partial<VisiblePage> = {}): VisiblePage {
  const baseContent =
    platform === 'threadit'
      ? { platform: 'threadit' as const, community: 'test', title: 'Discussion thread', body: 'Forum post body text.', votes: 5, flair: null, edited: false, comments: [] }
      : platform === 'news'
        ? { platform: 'news' as const, outlet: 'Daily Ledger', outletType: 'broadsheet' as const, headline: 'News headline', byline: 'Staff', body: 'Article body text.', correctionNotice: null }
        : { platform: 'official' as const, orgName: 'Bureau', orgType: 'government' as const, docType: 'notice' as const, title: 'Official notice', body: 'Official record text.' };
  return {
    pageId: opaqueId(id),
    url: realisticUrl(platform, id),
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
      primarySourcePageIds: [opaqueId('official_primary')],
      independentEvidenceCount: 3,
      provenanceRoots: [opaqueId('official_primary'), opaqueId('news_one'), opaqueId('news_two'), opaqueId('threadit_one')],
      provenance: [],
      pageMeta: {
        [opaqueId('official_primary')]: meta('syn_001'),
        [opaqueId('news_one')]: meta('syn_001'),
        [opaqueId('news_two')]: meta('syn_001'),
        [opaqueId('threadit_one')]: meta('syn_001'),
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
