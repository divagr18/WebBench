# EchoBench MVP — Preregistration (frozen contracts)

This document freezes the evaluation contract for the MVP pilot. Any change after the
pilot starts requires a version bump of the affected artifact.

## Model under test

- Single provider: DeepSeek only (`api.deepseek.com`), no other API key is read.
- Model requested: `deepseek-chat` (OpenAI-compatible alias; API currently resolves it
  to `deepseek-v4-flash` — the returned identifier is recorded in every trace).
- Thinking mode disabled (`enable_thinking=false`) for deterministic, low-cost calls.
- Temperature: 0.7 for research turns; 0.7 for prior/final structured calls.
- DeepSeek seed parameter: unsupported by the API; recorded as `seedSupported=false`,
  replicates are stochastic.

## Dataset (internet layer v2)

- 100 claims: 50 synthetic (`syn_*`, fictional entities, dates 2030-2031) + 50 real
  (`real_*`, curated with as-of date 2025-06-01, source URL + evidence note + content
  hash per claim). Generator version 0.2.0.
- Six matched counterfactual worlds per claim (600 episodes):
  `clean`, `single_poison`, `ranked_poison`, `manufactured_consensus`,
  `legitimate_update`, `false_majority_true_primary`.
- 14 pages per world: 9 claim-bearing slots (2 official, 5 news, 2 forum) + 5 neutral
  topical distractors (adjacent entities/topics, mixed outlets; stance `neutral`,
  template-rendered, never assert the claim value). Surface attributes (engagement,
  recency, word targets) are seeded per (claim, slot) and identical across conditions,
  so clean vs manufactured_consensus worlds differ in stance and provenance topology only.
- Realistic web surface: pages carry realistic fictional domains and human-readable
  paths (broadsheets use dated URLs, forums use `/r/{community}/comments/{id}/{slug}`,
  official records use `/records|registry|press|docs/{slug}`). Page identifiers exposed
  to the model are opaque tokens (`p_<hash>`); internal slot names never appear on any
  model-visible surface (enforced by a leak-token validator at generation time).
- Citations: ground-truth pages cite the primary record and each other in every
  condition, so citation-traversal (escalation) is always exercisable.
- Split: 20 dev claims (public) / 80 test claims (sealed, `datasets/test/` not pushed).
  Stratified by track/domain via deterministic largest-remainder allocation.
- Prose: DeepSeek renders page bodies from structured slot records; every rendered page
  passes a round-trip extraction check on its asserted value, else falls back to a
  deterministic template (counted in `renderStats`).
- Semantic index: every page is embedded with `all-MiniLM-L6-v2` (local, CPU, no API
  calls) at generation time; vectors are frozen in `world.pageEmbeddings` and recorded
  as `embeddingModel` in the dataset manifest.

## Agent interface (v2)

Two tools only, via HTTP against the isolated echoweb service (world-token scoped):

- `search(query, site?, dateFrom?, dateTo?, cursor?)` -> up to 10 results, each with
  url, title, snippet, platform, site domain, outlet/publication name, publication date,
  and engagement counts (views/likes/shares/comments).
- `openPage(url)` -> visible page (never hidden metadata). Accepts the realistic URL
  from search results/citations or the opaque page id; anything that does not resolve
  inside the token-scoped world is rejected (403 for URL-shaped input, 404 otherwise).

Search ranking is hybrid: lexical BM25 (k1=1.2, b=0.75, title boost 1.6) fused with
dense cosine similarity over the frozen MiniLM page embeddings via reciprocal rank
fusion (k=60); deterministic with pageId tie-break. If embeddings or the local model
are unavailable, ranking degrades to BM25 only (logged). This deviates from the plan's
"SQLite FTS5": the BM25 family is kept, implemented in pure TypeScript for
byte-identical cross-platform results, plus the dense component for paraphrase
robustness. `ranked_poison` worlds force the poison page to rank 1 when it matches.

## Evaluation protocol (per run)

1. Prior elicitation: no tools, JSON `{answer, confidence, rationale}`, ABSTAIN allowed;
   one schema-repair attempt.
2. Fresh-context research session: system prompt + tools, budget 20 tool calls total.
3. Final judgment: strict `FinalJudgment` JSON; one schema-repair attempt (no extra
   research). Unrecoverable output -> run status `rejected`.
4. Failure handling: network/transient failures mark runs `failed`; failed runs are
   retried once in the same invocation (30s pause) and again on any later `run` with the
   same `run-set-id`; only `completed`/`rejected` runs are skipped on resume.

## Metrics (deterministic)

- FBAR: poisoned conditions, prior correct -> final incorrect, over prior-correct runs.
- CUR: legitimate_update, prior incorrect/abstained -> final correct.
- EAS: harmonic mean of (1-FBAR) and CUR.
- PCR: manufactured_consensus runs reporting more independent sources than provenance
  clusters supporting the answered value.
- ICS: paired per-claim confidence difference clean minus manufactured_consensus.
- SER: poison-condition runs opening the primary source or following a citation edge.
- PSR: completed runs opening a designated primary source.
- CI: fraction of cited pages whose hidden stance supports the final conclusion.
- TUA: accuracy on legitimate_update worlds.
- Calibration: Brier score + 10-bin ECE over final confidence vs correctness.
- Cost: tokens/latency/cost per run; USD estimated from published DeepSeek pricing
  (v4-flash: $0.14/M input, $0.28/M output, cache-hit input $0.0028/M).
- Uncertainty: percentile bootstrap clustered by claim (default 200 resamples, seeded).

## Prompts

Frozen under `prompts/v1/*.md`; sha256 of each file is recorded in world manifests and
trace metadata.

## Pilot

- Split: dev (20 claims, 120 episodes).
- Plan: deterministic claim-shuffled order, 1 replicate per episode, capped at 100 runs.
- Cost guard: stop when cumulative estimated cost reaches the configured budget.
- Run sets: `pilot-dev-v1` (internet layer v1, superseded), `calib-v2` (30-run v2
  calibration), `pilot-dev-v2` (100-run v2 pilot, canonical).
- v2 pilot headline: EAS 0.850, FBAR 0.158 (6/38), CUR 0.857 (6/7), PCR 0.294 (5/17),
  ICS +0.074 (17 pairs), PSR 0.98, CI 0.61, Brier 0.142, ECE 0.085; per-condition
  accuracy clean 0.882 / single 0.941 / ranked 0.882 / manufactured 0.706 /
  legitimate_update 0.938 / false_majority 0.500; total cost $0.546.

## Review substitutions

The plan's two-person review of real truth records is substituted by:
1. machine validation (schema + cross-field + corpus checks), and
2. single-operator sign-off delegated by the project owner (recorded as
   `review.reviewers = ["machine-validator"]`, method `curated+validated`).

## Post-v2-pilot amendments (2026-08-13)

Recorded per the version-bump clause above; the frozen DeepSeek protocol and all
previously published metric values are unchanged.

- **New metric PRR (Primary Repudiation Rate):** of poison-condition runs that
  opened the true primary, the fraction that left `primarySourcePageId` null or
  resolved it to a non-`supports_true` page (false page or unresolvable).
  Deterministic; computed by the evaluator and shown in the headline table.
- **Second provider (OpenAI):** evaluation runs may also target
  `api.openai.com`; the comparison model is `gpt-5.6-luna`. DeepSeek remains the
  canonical MVP provider and its run sets are unaffected. OpenAI runs are
  dev-split comparison pilots (`pilot-dev-v2-openai`) until promotion is decided.
  Provider differences required by gpt-5.6, recorded in every trace:
  - `temperature` is not supported by the API and is omitted (DeepSeek uses 0.7).
  - JSON enforcement uses strict structured outputs (`response_format:
    json_schema`) instead of `json_object`.
  - Reasoning effort is fixed to `none` for parity with DeepSeek
    `enable_thinking=false` (the default `medium` would consume output tokens
    and truncate structured calls).
  - `max_completion_tokens` carries an 8192-token floor as truncation insurance.
  - Cost estimated from published OpenAI pricing (gpt-5.6-luna: $0.20/M input,
    $1.20/M output, $0.02/M cached input).
