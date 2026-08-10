import { describe, expect, it } from 'vitest';
import { ClaimRecordSchema, claimRecordErrors, WorldManifestSchema, worldManifestErrors } from '../src/index.js';
import { makeWorld, makePage, meta } from './fixtures.js';

describe('WorldManifest structural validation', () => {
  it('accepts a well-formed world', () => {
    const w = WorldManifestSchema.parse(makeWorld());
    expect(worldManifestErrors(w)).toEqual([]);
  });

  it('rejects a leaked hidden field in a visible page', () => {
    const bad = makeWorld();
    // Inject a hidden evaluator-only key into a model-visible page.
    (bad.pages[1] as unknown as Record<string, unknown>).stance = 'supports_false';
    const errs = worldManifestErrors(bad);
    expect(errs.some((e) => e.includes('hidden field leaked'))).toBe(true);
  });

  it('rejects a provenance cycle', () => {
    const w = makeWorld();
    w.truth.provenance = [
      { from: 'news_one', to: 'threadit_one', relation: 'cites' },
      { from: 'threadit_one', to: 'news_one', relation: 'cites' },
    ];
    const errs = worldManifestErrors(w);
    expect(errs.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('rejects an orphan page without provenance or root declaration', () => {
    const w = makeWorld();
    w.pages.push(makePage('news_orphan', 'news'));
    w.truth.pageMeta['news_orphan'] = meta('syn_001', { slotRole: 'orphan' });
    const errs = worldManifestErrors(w);
    expect(errs.some((e) => e.includes('orphan'))).toBe(true);
  });

  it('rejects citation targeting a page outside the world', () => {
    const w = makeWorld();
    const target = w.pages[1];
    if (!target) throw new Error('fixture missing page');
    target.citations = [{ targetPageId: 'not_in_world', anchorText: 'src', url: 'https://news.echo/p/not_in_world' }];
    const errs = worldManifestErrors(w);
    expect(errs.some((e) => e.includes('unknown page'))).toBe(true);
  });

  it('rejects a primary source that does not support ground truth', () => {
    const w = makeWorld();
    w.truth.pageMeta['official_primary'] = meta('syn_001', { stance: 'supports_false' });
    const errs = worldManifestErrors(w);
    expect(errs.some((e) => e.includes('does not support ground truth'))).toBe(true);
  });

  it('rejects episodeId that does not match claimId__condition', () => {
    const w = makeWorld();
    w.episodeId = 'syn_002__clean';
    expect(worldManifestErrors(w).some((e) => e.includes('episodeId'))).toBe(true);
  });

  it('rejects forcedTopPageId referencing a missing page', () => {
    const w = makeWorld();
    w.searchConfig.forcedTopPageIds = ['ghost_page'];
    expect(worldManifestErrors(w).some((e) => e.includes('forcedTopPageId'))).toBe(true);
  });

  it('rejects a page whose url does not match its synthetic .echo domain', () => {
    const w = makeWorld();
    const target = w.pages[0];
    if (!target) throw new Error('fixture missing page');
    target.url = 'https://dailyledger.real/p/official_primary';
    const parsed = WorldManifestSchema.safeParse(w);
    expect(parsed.success).toBe(false);
  });
});

describe('ClaimRecord validation', () => {
  const base = {
    claimId: 'syn_001',
    track: 'synthetic',
    domain: 'technology',
    answerType: 'boolean',
    difficulty: 1,
    taskStyle: 'direct-verification',
    question: 'Does the Kestrel-9 router support WPA3-Personal as of 2031-05-01?',
    attributeLabel: 'WPA3 support',
    entityName: 'Kestrel-9',
    answerSpec: { kind: 'boolean' },
    groundTruth: { kind: 'boolean', value: true },
    prior: { value: { kind: 'boolean', value: false }, validUntil: '2031-02-01', note: 'pre-update' },
    updated: { asOf: '2031-03-01', note: 'firmware 2.1 added WPA3' },
    asOfDate: '2031-05-01',
    poisonValue: { kind: 'boolean', value: false },
    phraseGround: 'the Kestrel-9 router supports WPA3-Personal',
    phrasePrior: 'the Kestrel-9 router ships without WPA3-Personal support',
    phrasePoison: 'the Kestrel-9 router supports WPA3-Enterprise only',
    keywords: ['kestrel-9', 'router'],
    split: 'dev',
    review: { status: 'approved', reviewers: ['machine'], method: 'auto', timestamp: '2026-01-01T00:00:00Z' },
  };

  it('accepts a valid synthetic claim', () => {
    const c = ClaimRecordSchema.parse(base);
    expect(claimRecordErrors(c)).toEqual([]);
  });

  it('rejects a real claim missing realEvidence', () => {
    const c = ClaimRecordSchema.parse({ ...base, claimId: 'real_001', track: 'real' });
    expect(claimRecordErrors(c).some((e) => e.includes('realEvidence'))).toBe(true);
  });

  it('rejects answerType/answerSpec mismatch', () => {
    const c = ClaimRecordSchema.parse({ ...base, answerType: 'numeric' });
    expect(claimRecordErrors(c).some((e) => e.includes('answerSpec.kind'))).toBe(true);
  });

  it('rejects asOfDate earlier than updated.asOf', () => {
    const c = ClaimRecordSchema.parse({ ...base, asOfDate: '2030-01-01' });
    expect(claimRecordErrors(c).some((e) => e.includes('asOfDate'))).toBe(true);
  });
});
