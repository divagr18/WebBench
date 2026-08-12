import {
  episodeIdOf,
  worldManifestErrors,
  WorldManifestSchema,
  type ClaimRecord,
  type Condition,
  type PageCitation,
  type ProvenanceEdge,
  type ProvenanceRelation,
  type WorldManifest,
} from '@echobench/schema';
import { sha256Hex, canonicalJson } from './hash.js';
import { SeededRng } from './rng.js';
import { buildSlotRecords, buildDistractorRecords, buildVisiblePage, renderTemplateContent, type SlotRecord } from './pagegen.js';
import { layoutFor } from './layout.js';

export const GENERATOR_VERSION = '0.2.0';

export interface WorldGenOptions {
  createdAt: string;
  proseModel: string | null;
  distractors?: number;
}

export function buildWorld(claim: ClaimRecord, condition: Condition, opts: WorldGenOptions): WorldManifest {
  const layout = layoutFor(condition);
  const mainRecords = buildSlotRecords(claim, condition);
  const distractorRecords = buildDistractorRecords(claim, condition, opts.distractors ?? 5);
  const records = [...mainRecords, ...distractorRecords];
  const bySlot = new Map(records.map((r) => [r.slot, r]));

  const clusterRoot = new Map<string, string>();
  function rootOf(slot: string): string {
    if (clusterRoot.has(slot)) return clusterRoot.get(slot)!;
    const rec = bySlot.get(slot)!;
    const root = rec.layout.derivedFrom ? rootOf(rec.layout.derivedFrom) : slot;
    clusterRoot.set(slot, root);
    return root;
  }

  const edges: ProvenanceEdge[] = [];
  for (const rec of records) {
    if (!rec.layout.derivedFrom) continue;
    const src = bySlot.get(rec.layout.derivedFrom)!;
    edges.push({ from: rec.pageId, to: src.pageId, relation: relationBetween(rec, src) });
  }

  const citationPlan = buildCitationPlan(mainRecords, bySlot);
  for (const [fromSlot, targets] of citationPlan) {
    const fromRec = bySlot.get(fromSlot);
    if (!fromRec) continue;
    for (const targetSlot of targets) {
      const target = bySlot.get(targetSlot);
      if (!target) continue;
      if (fromRec.layout.derivedFrom === targetSlot) continue;
      edges.push({ from: fromRec.pageId, to: target.pageId, relation: 'cites' });
    }
  }

  const roots = records.filter((r) => !r.layout.derivedFrom).map((r) => r.pageId).sort();
  const groundRoots = mainRecords.filter((r) => !r.layout.derivedFrom && r.valueRole === 'ground');
  const independentEvidenceCount = groundRoots.length;

  const pageMeta: WorldManifest['truth']['pageMeta'] = {};
  for (const rec of records) {
    const isDistractor = rec.slot.startsWith('extra_');
    pageMeta[rec.pageId] = {
      claimId: claim.claimId,
      stance: isDistractor || rec.valueRole === 'neutral'
        ? 'neutral'
        : rec.valueRole === 'ground'
          ? 'supports_true'
          : 'supports_false',
      assertsValue: isDistractor ? '' : rec.assertsValueText,
      originClusterId: `cluster_${rootOf(rec.slot)}`,
      copiedFromPageId: rec.layout.derivedFrom ? (bySlot.get(rec.layout.derivedFrom)?.pageId ?? null) : null,
      authorityClass: rec.slotDef.platform === 'official'
        ? (rec.slot === 'official_primary' ? 'primary_official' : 'secondary_reputable')
        : rec.slotDef.authorityBase === 'primary_official' ? 'secondary_reputable' : rec.slotDef.authorityBase,
      isPrimarySource: rec.slot === 'official_primary',
      slotRole: isDistractor
        ? `${condition}:distractor:${rec.slot}`
        : `${condition}:${rec.slot}${rec.layout.isEchoOrigin ? ':echo_origin' : ''}`,
      renderMode: 'template',
    };
  }

  const pages = records.map((rec) => {
    const rng = new SeededRng(`${claim.claimId}|content|${condition}|${rec.slot}`);
    const content = renderTemplateContent(claim, rec, rng);
    const citations: PageCitation[] = [];
    if (rec.layout.derivedFrom) {
      const src = bySlot.get(rec.layout.derivedFrom);
      if (src) citations.push({ targetPageId: src.pageId, anchorText: 'source', url: src.url });
    }
    for (const targetSlot of citationPlan.get(rec.slot) ?? []) {
      if (rec.layout.derivedFrom === targetSlot) continue;
      const target = bySlot.get(targetSlot);
      if (target) citations.push({ targetPageId: target.pageId, anchorText: anchorFor(target), url: target.url });
    }
    return buildVisiblePage(claim, rec, content, citations);
  });

  const episodeId = episodeIdOf(claim.claimId, condition);
  const primary = bySlot.get('official_primary');
  if (!primary) throw new Error('missing official_primary record');

  const world: WorldManifest = {
    schemaVersion: 1,
    episodeId,
    claimId: claim.claimId,
    track: claim.track,
    split: claim.split,
    condition,
    seed: `${claim.claimId}|${condition}`,
    worldDate: claim.asOfDate,
    generatedAt: opts.createdAt,
    generatorVersion: GENERATOR_VERSION,
    proseModel: opts.proseModel,
    truth: {
      groundTruth: claim.groundTruth,
      priorValue: claim.prior.value,
      falseValue: condition === 'legitimate_update'
        ? formatFalse(claim, claim.prior.value)
        : formatFalse(claim, claim.poisonValue),
      primarySourcePageIds: [primary.pageId],
      independentEvidenceCount,
      provenanceRoots: roots,
      provenance: edges,
      pageMeta,
    },
    pages,
    searchConfig: {
      mode: layout.forcedTopSlot ? 'bm25_with_overrides' : 'bm25',
      forcedTopPageIds: layout.forcedTopSlot ? [bySlot.get(layout.forcedTopSlot)!.pageId] : [],
    },
    promptHashes: {},
    checksums: { pages: '', manifest: '' },
    worldToken: '',
  };

  return finalizeWorld(world);
}

/** Ground pages cite authoritative records in every condition so citation-traversal exists everywhere. */
function buildCitationPlan(mainRecords: SlotRecord[], bySlot: Map<string, SlotRecord>): Map<string, string[]> {
  const plan = new Map<string, string[]>();
  const roleOf = (slot: string) => bySlot.get(slot)?.valueRole;

  for (const rec of mainRecords) {
    const targets: string[] = [];
    if (rec.slot === 'official_secondary' && rec.valueRole === 'ground') {
      targets.push('official_primary');
    } else if (rec.slotDef.platform === 'news' && rec.valueRole === 'ground') {
      if (rec.slot === 'news_wire' || rec.slot === 'news_broadsheet') targets.push('official_primary');
      else targets.push(roleOf('news_wire') === 'ground' ? 'news_wire' : 'official_primary');
    } else if (rec.slot === 'news_local' && rec.valueRole === 'prior' && roleOf('official_secondary') === 'prior') {
      targets.push('official_secondary');
    } else if (rec.slotDef.platform === 'threadit' && rec.valueRole === 'ground') {
      const groundNews = (['news_wire', 'news_broadsheet'] as const).find((s) => roleOf(s) === 'ground');
      targets.push(groundNews ?? 'official_primary');
    } else if (rec.slot === 'threadit_main' && rec.valueRole === 'prior' && roleOf('news_local') === 'prior') {
      targets.push('news_local');
    }
    if (targets.length > 0) plan.set(rec.slot, targets);
  }
  return plan;
}

function anchorFor(target: SlotRecord): string {
  if (target.slotDef.platform === 'official') return 'official record';
  if (target.slotDef.outletType === 'wire') return 'wire report';
  return 'report';
}

/** Recompute pages/manifest checksums + world token, then structurally validate. */
export function finalizeWorld(world: WorldManifest): WorldManifest {
  const pagesChecksum = sha256Hex(canonicalJson(world.pages));
  world.checksums.pages = pagesChecksum;
  world.checksums.manifest = '';
  world.worldToken = '';
  const manifestChecksum = sha256Hex(canonicalJson(world));
  world.checksums.manifest = manifestChecksum;
  world.worldToken = sha256Hex(`world|${world.episodeId}|${manifestChecksum}`);

  const parsed = WorldManifestSchema.parse(world);
  const errs = worldManifestErrors(parsed);
  if (errs.length > 0) {
    throw new Error(`world ${world.episodeId} failed structural validation:\n  - ${errs.join('\n  - ')}`);
  }
  return parsed;
}

function formatFalse(claim: ClaimRecord, value: ClaimRecord['groundTruth']): string {
  switch (value.kind) {
    case 'boolean':
      return String(value.value);
    case 'enum':
    case 'string':
      return value.value;
    case 'numeric':
      return String(value.value);
  }
}

function relationBetween(from: SlotRecord, to: SlotRecord): ProvenanceRelation {
  if (to.slotDef.platform === 'official' || from.slotDef.platform === 'official') return 'cites';
  if (from.slotDef.platform === 'threadit' && to.slotDef.platform === 'threadit') return 'reposts';
  if (from.slotDef.platform === 'news' && to.slotDef.platform === 'threadit') return 'quotes';
  if (from.slotDef.platform === 'threadit' && to.slotDef.platform === 'news') return 'reposts';
  return 'paraphrases';
}
