import {
  episodeIdOf,
  worldManifestErrors,
  WorldManifestSchema,
  type ClaimRecord,
  type Condition,
  type ProvenanceEdge,
  type ProvenanceRelation,
  type WorldManifest,
} from '@echobench/schema';
import { sha256Hex, canonicalJson } from './hash.js';
import { SeededRng } from './rng.js';
import { buildSlotRecords, buildVisiblePage, renderTemplateContent, pageIdFor, type SlotRecord } from './pagegen.js';
import { layoutFor } from './layout.js';

export const GENERATOR_VERSION = '0.1.0';

export interface WorldGenOptions {
  createdAt: string;
  proseModel: string | null;
}

export function buildWorld(claim: ClaimRecord, condition: Condition, opts: WorldGenOptions): WorldManifest {
  const layout = layoutFor(condition);
  const records = buildSlotRecords(claim, condition);
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
    edges.push({
      from: rec.pageId,
      to: src.pageId,
      relation: relationBetween(rec, src),
    });
  }

  const roots = records.filter((r) => !r.layout.derivedFrom).map((r) => r.pageId).sort();
  const groundRoots = records.filter((r) => !r.layout.derivedFrom && r.valueRole === 'ground');
  const independentEvidenceCount = groundRoots.length;

  const pageMeta: WorldManifest['truth']['pageMeta'] = {};
  for (const rec of records) {
    pageMeta[rec.pageId] = {
      claimId: claim.claimId,
      stance: rec.valueRole === 'ground' ? 'supports_true' : 'supports_false',
      assertsValue: rec.assertsValueText,
      originClusterId: `cluster_${rootOf(rec.slot)}`,
      copiedFromPageId: rec.layout.derivedFrom ? pageIdFor(rec.layout.derivedFrom) : null,
      authorityClass: rec.slotDef.platform === 'official'
        ? (rec.slot === 'official_primary' ? 'primary_official' : 'secondary_reputable')
        : rec.slotDef.authorityBase === 'primary_official' ? 'secondary_reputable' : rec.slotDef.authorityBase,
      isPrimarySource: rec.slot === 'official_primary',
      slotRole: `${condition}:${rec.slot}${rec.layout.isEchoOrigin ? ':echo_origin' : ''}`,
      renderMode: 'template',
    };
  }

  const pages = records.map((rec) => {
    const rng = new SeededRng(`${claim.claimId}|content|${condition}|${rec.slot}`);
    const content = renderTemplateContent(claim, rec, rng);
    const citations = rec.layout.derivedFrom
      ? [{
          targetPageId: pageIdFor(rec.layout.derivedFrom),
          anchorText: 'source',
          url: `https://${bySlot.get(rec.layout.derivedFrom)!.slotDef.platform}.echo/p/${pageIdFor(rec.layout.derivedFrom)}`,
        }]
      : [];
    return buildVisiblePage(claim, rec, content, citations);
  });

  const episodeId = episodeIdOf(claim.claimId, condition);

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
      primarySourcePageIds: ['official_primary'],
      independentEvidenceCount,
      provenanceRoots: roots,
      provenance: edges,
      pageMeta,
    },
    pages,
    searchConfig: {
      mode: layout.forcedTopSlot ? 'bm25_with_overrides' : 'bm25',
      forcedTopPageIds: layout.forcedTopSlot ? [pageIdFor(layout.forcedTopSlot)] : [],
    },
    promptHashes: {},
    checksums: { pages: '', manifest: '' },
    worldToken: '',
  };

  return finalizeWorld(world);
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
