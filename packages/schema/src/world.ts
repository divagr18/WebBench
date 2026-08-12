import { z } from 'zod';
import { NormalizedAnswerSchema } from './answer.js';
import { SplitSchema, TrackSchema } from './claim.js';
import { HiddenPageMetaSchema, ProvenanceEdgeSchema, VisiblePageSchema } from './page.js';

export const ConditionSchema = z.enum([
  'clean',
  'single_poison',
  'ranked_poison',
  'manufactured_consensus',
  'legitimate_update',
  'false_majority_true_primary',
]);
export type Condition = z.infer<typeof ConditionSchema>;

export const CONDITIONS: readonly Condition[] = [
  'clean',
  'single_poison',
  'ranked_poison',
  'manufactured_consensus',
  'legitimate_update',
  'false_majority_true_primary',
];

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SearchRankConfigSchema = z.object({
  mode: z.enum(['bm25', 'bm25_with_overrides']),
  forcedTopPageIds: z.array(z.string()),
});
export type SearchRankConfig = z.infer<typeof SearchRankConfigSchema>;

export const WorldTruthSchema = z.object({
  groundTruth: NormalizedAnswerSchema,
  priorValue: NormalizedAnswerSchema,
  /** Normalized string form of the false value asserted by poison pages. */
  falseValue: z.string().nullable(),
  primarySourcePageIds: z.array(z.string()).min(1),
  independentEvidenceCount: z.number().int().nonnegative(),
  provenanceRoots: z.array(z.string()),
  provenance: z.array(ProvenanceEdgeSchema),
  pageMeta: z.record(z.string(), HiddenPageMetaSchema),
});
export type WorldTruth = z.infer<typeof WorldTruthSchema>;

export const PromptHashesSchema = z.record(z.string(), z.string());

export const ChecksumsSchema = z.object({
  pages: z.string().regex(/^[a-f0-9]{64}$/),
  manifest: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * One counterfactual world = one claim under one evidence condition.
 * `pages` is the ONLY model-visible surface; `truth` is evaluator-only.
 */
export const WorldManifestSchema = z.object({
  schemaVersion: z.literal(1),
  episodeId: z.string().regex(/^(syn|real)_\d{3}__[a-z_]+$/),
  claimId: z.string(),
  track: TrackSchema,
  split: SplitSchema,
  condition: ConditionSchema,
  seed: z.string(),
  worldDate: IsoDateSchema,
  generatedAt: z.string(),
  generatorVersion: z.string(),
  proseModel: z.string().nullable(),
  truth: WorldTruthSchema,
  pages: z.array(VisiblePageSchema).min(4),
  searchConfig: SearchRankConfigSchema,
  promptHashes: PromptHashesSchema,
  checksums: ChecksumsSchema,
  worldToken: z.string().regex(/^[a-f0-9]{64}$/),
  /** Frozen semantic embeddings per page (pageId -> vector). Never served to the model. */
  pageEmbeddings: z.record(z.string(), z.array(z.number())).optional(),
});
export type WorldManifest = z.infer<typeof WorldManifestSchema>;

export function episodeIdOf(claimId: string, condition: Condition): string {
  return `${claimId}__${condition}`;
}

/** Internal slot tokens that must never appear on model-visible surfaces. */
export const LEAKY_SLOT_TOKENS = [
  'official_primary',
  'official_secondary',
  'news_wire',
  'news_broadsheet',
  'news_local',
  'news_tabloid',
  'news_aggregator',
  'threadit_main',
  'threadit_alt',
] as const;

/** Structural invariants beyond Zod (cycles, orphans, leakage, support). */
export function worldManifestErrors(w: WorldManifest): string[] {
  const errs: string[] = [];
  const pageIds = new Set(w.pages.map((p) => p.pageId));

  if (w.episodeId !== episodeIdOf(w.claimId, w.condition)) {
    errs.push('episodeId != claimId__condition');
  }
  for (const p of w.pages) {
    if (p.content.platform !== p.platform) errs.push(`${p.pageId}: content.platform mismatch`);
    for (const c of p.citations) {
      if (!pageIds.has(c.targetPageId)) {
        errs.push(`${p.pageId}: citation targets unknown page ${c.targetPageId}`);
      }
    }
    const serialized = JSON.stringify(p);
    const leaked = serialized.match(/"stance"|"truth_status"|"originClusterId"|"origin_source_id"|"copiedFromPageId"|"pageMeta"|"valueRole"|"supports_true"|"supports_false"/);
    if (leaked) errs.push(`${p.pageId}: hidden field leaked into visible page (${leaked[0]})`);
    for (const token of LEAKY_SLOT_TOKENS) {
      if (serialized.includes(token)) {
        errs.push(`${p.pageId}: internal slot token leaked into visible page (${token})`);
      }
    }
  }

  for (const e of w.truth.provenance) {
    if (!pageIds.has(e.from)) errs.push(`provenance.from unknown: ${e.from}`);
    if (!pageIds.has(e.to)) errs.push(`provenance.to unknown: ${e.to}`);
    if (e.from === e.to) errs.push(`self-edge: ${e.from}`);
  }
  const cycle = detectCycle(w.truth.provenance);
  if (cycle) errs.push(`provenance cycle: ${cycle.join(' -> ')}`);

  const referenced = new Set<string>();
  for (const e of w.truth.provenance) {
    referenced.add(e.from);
    referenced.add(e.to);
  }
  for (const pid of pageIds) {
    if (!referenced.has(pid) && !w.truth.provenanceRoots.includes(pid)) {
      errs.push(`orphan page (no provenance edge, not a root): ${pid}`);
    }
  }
  for (const root of w.truth.provenanceRoots) {
    if (!pageIds.has(root)) errs.push(`root unknown: ${root}`);
  }

  for (const [pid, meta] of Object.entries(w.truth.pageMeta)) {
    if (!pageIds.has(pid)) errs.push(`pageMeta for unknown page: ${pid}`);
    if (meta.claimId !== w.claimId) errs.push(`${pid}: pageMeta.claimId mismatch`);
  }
  for (const pid of pageIds) {
    if (!w.truth.pageMeta[pid]) errs.push(`missing pageMeta for page: ${pid}`);
  }

  for (const ps of w.truth.primarySourcePageIds) {
    const meta = w.truth.pageMeta[ps];
    if (!meta) {
      errs.push(`primary source ${ps} has no pageMeta`);
    } else if (meta.stance !== 'supports_true') {
      errs.push(`primary source ${ps} does not support ground truth`);
    }
    if (!pageIds.has(ps)) errs.push(`primary source page missing: ${ps}`);
  }

  for (const f of w.searchConfig.forcedTopPageIds) {
    if (!pageIds.has(f)) errs.push(`forcedTopPageId unknown: ${f}`);
  }

  return errs;
}

function detectCycle(edges: { from: string; to: string }[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
  }
  for (const n of [...nodes].sort()) color.set(n, WHITE);

  function dfs(u: string): string[] | null {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        const path = [u, v];
        let x = u;
        while (x !== v && parent.has(x)) {
          x = parent.get(x) as string;
          path.push(x);
        }
        return path.reverse();
      }
      if (color.get(v) === WHITE) {
        parent.set(v, u);
        const r = dfs(v);
        if (r) return r;
      }
    }
    color.set(u, BLACK);
    return null;
  }

  for (const n of [...nodes].sort()) {
    if (color.get(n) === WHITE) {
      parent.set(n, null);
      const r = dfs(n);
      if (r) return r;
    }
  }
  return null;
}
