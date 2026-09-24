# EchoBench MVP — Preregistration (frozen contracts)

This document freezes the evaluation contract for the MVP pilot. Any change after the
pilot starts requires a version bump of the affected artifact.

*Naming note:* this benchmark is released as EchoBench (this repo's DOI); the
accompanying paper refers to the same benchmark as EchoNet. See README.md.

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
  calibration), `pilot-dev-v2` (100-run v2 pilot, canonical DeepSeek),
  `pilot-dev-v2-openai` (100-run v2 pilot, OpenAI gpt-5.6-luna comparison),
  `pilot-dev-v2-modelscope-max` and `pilot-dev-v2-modelscope-plus` (100-run v2
  pilots, ModelScope-native Qwen-Ambassador comparisons),
  `pilot-dev-v2-qwen37max` (73-run OpenRouter partial, superseded — route-
  sensitivity artifact only).
- v2 pilot headline: EAS 0.850, FBAR 0.158 (6/38), CUR 0.857 (6/7), PCR 0.294 (5/17),
  ICS +0.074 (17 pairs), PSR 0.98, CI 0.61, Brier 0.142, ECE 0.085; per-condition
  accuracy clean 0.882 / single 0.941 / ranked 0.882 / manufactured 0.706 /
  legitimate_update 0.938 / false_majority 0.500; total cost $0.546.
- v2 OpenAI comparison headline (gpt-5.6-luna): EAS 0.941, FBAR 0.000 (0/28),
  CUR 0.889 (8/9), PCR 0.059 (1/17), PRR 0.302 (16/53), SER 0.806, PSR 0.79,
  CI 0.706, Brier 0.067, ECE 0.054; near-flat per-condition accuracy 0.941
  across clean/poison conditions, false_majority 0.875; total cost $0.7688.
  Analysis: `analysis/openai_vs_deepseek_pilot.md`.

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
- **Third provider (ModelScope), canonical Qwen route:** `--provider
  modelscope` targets `api-inference.modelscope.ai/v1` (OpenAI-compatible,
  `enable_thinking=false`, temperature 0.7, `json_object`). NOTE: the endpoint
  is the `.ai` host — the `.cn` host (`api-inference.modelscope.cn/v1`)
  consistently rejects the same token with 401 on every model and was
  abandoned; all "token blocked" diagnoses traced to that host, not the token.
  `json_object` returns null content when messages lack the word "json"; the
  frozen prompts contain it, so structured calls are safe. Run sets:
  `pilot-dev-v2-modelscope-max` (100/100, `Qwen-Ambassador/Qwen3.7-Max`) and
  `pilot-dev-v2-modelscope-plus` (100/100, `Qwen-Ambassador/Qwen3.7-Plus`).
  Cost estimated from Model Studio list pricing as a guard
  (Qwen3.7-Max: $2.5/M input, $7.5/M output; Qwen3.7-Plus: $0.4/M input,
  $1.6/M output); actual ModelScope billing is separate.
- **Fourth provider (OpenRouter), superseded Qwen route:** an early attempt
  ran `qwen/qwen3.7-max` through `openrouter.ai/api/v1` before the ModelScope
  `.ai` endpoint was discovered. Run set `pilot-dev-v2-qwen37max` (73/100 —
  stopped by OpenRouter account credits) is retained only as a
  route-sensitivity artifact: it shows materially worse arbitration (EAS 0.800,
  FBAR 0.250) than the ModelScope-native run of the same weights (EAS 0.951,
  FBAR 0.094), so serving route is recorded and treated as non-neutral.
  Provider details, recorded in every trace: reasoning effort fixed to `none`
  (the only variant probed to zero reasoning tokens), `tool_choice` only with
  `tools` present, `json_object` mode; pricing qwen/qwen3.7-max $1.48/$4.42,
  qwen/qwen3.7-plus $0.32/$1.28 per M.

## Counterbalanced authority x topology ablation amendment (2026-08-22)

Recorded per the version-bump clause above. This is an **exploratory, post-hoc
addition** — it does not modify, reinterpret, or supersede any previously
published metric on the original six matched conditions, and its own results
are reported separately from the headline field comparison, never folded into
it. Prompted by peer review of the paper draft, which noted that
`manufactured_consensus` confounds source-authority styling with copy-topology
(the two official pages are always true and independent; the seven non-official
pages are always false and share one origin), so a model succeeding there could
be "trusting the official label" rather than detecting shared provenance.

- **Two new conditions**, added to the frozen six-condition set (dataset
  generator version and `manifest.integrityChecksum` both bump accordingly for
  any split regenerated after this amendment):
  - `authority_inverted_consensus`: identical copy-topology and 2-vs-7 stance
    split as `manufactured_consensus`, but the authority<->truth mapping is
    inverted — the two official pages assert the poison value, the seven-page
    echo cluster asserts ground truth. Isolates "trusts the official label"
    from "notices the pages share one origin."
  - `independent_false_majority`: same authority mapping and 2-vs-7 split as
    `manufactured_consensus`, but the seven non-official pages are independent
    roots (no shared derivation), not one echo cluster. Varies topology while
    holding authority and stance-count fixed. This is a genuinely harder
    Bayesian case (seven truly independent sources contradicting an official
    one), not merely a surface-cue swap; interpret jointly with the
    independent-source-count diagnostic (PCR-style), not raw accuracy alone.
- **Schema invariant relaxation:** the structural rule that a designated
  primary source must support ground truth is narrowed, not removed — it is
  gated specifically to `authority_inverted_consensus`, where the primary
  source must support the poisoned value instead (a positive counter-invariant,
  still catches a generator defect that leaves the official page truthful by
  accident). Every other condition, including `independent_false_majority`,
  keeps the original invariant unchanged.
- **Scoring:** results on these two conditions are reported in a new, fully
  additive `authorityAblation` block (per-condition FBAR/PCR/PRR/SER/accuracy
  plus an `authorityIndependenceGap` scalar). They are **not** added to
  `POISON_CONDITIONS` and do not affect headline FBAR/EAS/SER/PRR for any
  model, on any run set, regenerated before or after this amendment — a
  regression test enforces this. PRR's polarity is flipped under
  `authority_inverted_consensus` (repudiating the poisoned primary is the
  correct behavior there) and must be interpreted accordingly when reported.
- **Execution scope:** planned as a dev-split-only pilot (3 replicates per
  new-condition episode, matching the existing replicate commitment) on
  configurations that already have complete, checksummed dev data under the
  field-eligibility rule — not the full eleven-configuration field, and not
  the sealed test split. Any expansion beyond the dev pilot is a further
  amendment, not implied by this one.

## Model protocol amendments (2026-08-22)

Recorded per the version-bump clause above; the frozen DeepSeek protocol and
all previously published metric values are unchanged. This amendment records
**protocol only** (serving route, thinking-mode setting, pricing basis) for
the seven roster configurations that reached the eleven-configuration roster
(`\RosterSize{}` in the paper) after the 2026-08-13 amendment but whose route
was never separately dated in this document — it does not promote any of them
to the comparative field; that is governed solely by the completeness/
rejection-rate eligibility rule in `main.tex`'s leaderboard section, decided
per-configuration once each one's run data lands. Details below are
transcribed from `main.tex`'s `tab:protocols` table and its surrounding
protocol prose, both already committed.

- **Gemini 3.7 Flash and Gemini 3.5 Flash-Lite:** `gemini` provider, OpenAI-
  compatible endpoint. Thinking fixed at the lowest level the API allows (it
  cannot be fully disabled). Gemini's conversational API requires a user turn
  before any tool call; research loops are seeded with a single literal
  `"Begin."` turn to satisfy this, recorded in every trace. Cache-read tokens
  are billed at the cache rate. Estimated cost: \$0.011/episode (3.7 Flash),
  \$0.003/episode (3.5 Flash-Lite), at published list pricing.
- **GPT-5.6 Terra:** OpenAI chat completions endpoint, reasoning disabled
  (`none`) where the API allows it. Estimated cost \$0.035/episode.
- **GPT-5.6 Sol:** served via OpenRouter, thinking at `minimal`. Pricing uses
  a 50%-off list rate (recorded as a route-specific discount, not the general
  OpenAI list price); estimated cost \$0.067/episode at that discounted rate.
- **Muse Spark 1.2:** `api.meta.ai`, thinking at `minimal` (floor — cannot be
  fully disabled). The pilot ran on a contributor (training-opt-in) pricing
  tier at \$0.09 total actual spend; the paper instead reports the same
  logged token usage priced at the official standard tier
  (\$1.25/\$4.25 per million input/output tokens) as the cost a non-
  contributor benchmark consumer would actually pay, on the assumption that
  the tier affects billing and training-data use but not the served weights.
  Estimated cost at that standard-tier basis: \$0.035/episode.
- **Grok 4.6:** served via OpenRouter, thinking at `low` (floor — cannot be
  fully disabled). Estimated cost \$0.040/episode.
- **GLM 5.2:** served via OpenRouter (`z-ai/glm-5.2`), thinking at `low`. A
  100-run OpenRouter sensitivity run (24% rejected — see
  `paper/run_manifest.json`) is reported as a route-appendix note, not in the
  field.
- All seven: strict structured-output/JSON enforcement per the OpenAI-
  compatible schema each provider exposes; costs are estimates from published
  list prices applied to logged token counts, not invoices (per the existing
  "Costs are estimates" limitation already in the paper). Serving route is
  recorded in every trace and treated as part of the measurement, not a
  neutral implementation detail — the same underlying weights have already
  been shown to arbitrate materially differently across routes for Qwen3.7
  (see the fourth-provider amendment above).

## New model configurations (2026-08-31)

Recorded per the version-bump clause above; all previously published metric
values are unchanged. Six additional configurations were run and added to
`paper/run_manifest.json` since the previous amendment. All use OpenRouter,
temperature 0.7, JSON-object enforcement, matching the frozen dev plan
(one replicate per episode, deterministic claim-shuffled order).

- **Nemotron 3 Ultra** (`nvidia/nemotron-3-ultra-550b-a55b`): pinned to the
  DeepInfra host (`OPENROUTER_PROVIDER_ORDER=deepinfra`). Pricing confirmed
  against OpenRouter's own DeepInfra row and DeepInfra's published pricing
  ($0.50/$2.20 per M input/output, 2026-08-23). 50-run dev pilot, field role.
- **Inkling Small** (`thinkingmachines/inkling-small`): provider **not
  pinned** in this run — OpenRouter lists three near-identical hosts
  (DeepInfra $0.45/$1.20, Baseten and Together both $0.50/$1.20 per M); cost
  is estimated at the DeepInfra rate as the lowest/most common default, not a
  confirmed-for-this-run rate the way the pinned configurations below are.
  100-run dev pilot (run-set name says 50; the actual completed count is 100
  — a naming artifact, not a data error), field role.
- **Qwen3.8 27B and Qwen3.8 Flash** (`qwen/qwen3.8-27b`,
  `qwen/qwen3.8-flash`): both pinned to the Alibaba host
  (`OPENROUTER_PROVIDER_ORDER=alibaba`). Rates confirmed against OpenRouter's
  `/models/.../endpoints` API, 2026-08-28. Note for 27B specifically: cheaper
  third-party hosts exist on OpenRouter (e.g. Chutes at $0.35/$2.75 per M),
  but pinning to Alibaba means Alibaba's own rate applies here, not the
  cheapest available. 50-run dev pilots, field role.
- **DeepSeek V4 Pro, low-effort rerun** (`deepseek/deepseek-v4-pro-0813`,
  run set `dev-v4pro-0813-gmicloud-fp8-low-20260821`): pinned to the
  `gmicloud` OpenRouter host, FP8. This is the low-effort rerun this
  document's original Pilot section called for as "the fair test" after the
  original DeepSeek V4 Pro pilot (`pilot-v4pro-100`, deepseek-v4-pro,
  thinking left at default) turned out to be a protocol artifact — V4 Pro
  ignores the legacy `enable_thinking` flag, so "thinking disabled" silently
  ran at default effort. 49/50 completed (1 rejected); **the completeness
  eligibility rule (≥50 completed runs) currently excludes it from the
  comparative field, pairwise table, and cost frontier** even though its data
  is otherwise usable — it remains a field-role manifest entry, just below
  the completeness bar for now, not miscategorized. The original 100-run
  pilot is kept as an effort-appendix entry (`deepseek-v4-pro-thinking-
  disabled`) for the effort-sensitivity analysis only, per its original
  exclusion rationale.
- **Pricing bug found and corrected while adding these:** three of the
  models added since the 2026-08-22 amendments (`z-ai/glm-5.2`, and now
  `deepseek/deepseek-v4-pro-0813`) had no exact-string match in
  `packages/llm/src/pricing.ts` at the time their runs executed, so their
  cost was silently computed at the DeepSeek-flash fallback rate instead of
  their real price. Both now have real pricing.ts entries (with regression
  tests) and their already-scored reports were retroactively recomputed by
  `paper/fix_glm_pricing.py` from their recorded token counts at the
  confirmed rate. This does not change any accuracy/EAS/FBAR/etc. metric —
  only the `cost` field of the affected reports.

## Roster changes (2026-09-24)

Recorded per the version-bump clause above; the frozen protocol, prompts, scorer and
eligibility rule are unchanged.

- **Re-scored from original traces (not re-run):** GPT-5.6 Terra (`pilot-terra-80`),
  GPT-5.6 Sol (`pilot-sol-50`), Muse Spark 1.2 (`pilot-muse-80`) and Grok 4.6
  (`pilot-grok-80`). Their score reports had never been committed; they were
  regenerated with the current scorer from the raw traces, and each reproduces the
  EAS reported in v0.1.0. All four clear the eligibility rule and join the field.
- **New configurations:** Gemini 3.8 Flash (`gemini38-flash-50-20260903`, Gemini API,
  thinking at the lowest level, 100/100 completed) and Muse Spark 1.3
  (`muse13-contributor-100-20260903`, `api.meta.ai` contributor tier, reasoning
  `minimal`, 100/100 completed). Muse Spark 1.3 has no published standard-tier price;
  its cost is reported at the 1.2 standard rate and flagged as an estimate.
- **Unrecoverable:** Gemini 3.7 Flash, Gemini 3.5 Flash-Lite and GPT-5.6 Luna (low
  reasoning effort). No raw traces or per-run reports survive in the repository
  history, the second worktree, or the second machine used for runs. They are
  marked `unrecoverable` in `paper/run_manifest.json`, excluded from every table,
  figure and roster count, and disclosed as a limitation. Their v0.1.0 summary
  numbers are not reported, because they cannot be regenerated or audited.
- **Planned, not yet run:** GPT-6 Sol and GPT-6 Luna on the OpenAI API. Not part of
  this version.
