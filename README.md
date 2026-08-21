[![DOI: benchmark archive](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.22035200-007EC6?logo=zenodo&logoColor=white)](https://doi.org/10.5281/zenodo.22035200)
[![DOI: paper](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.22033697-007EC6?logo=zenodo&logoColor=white)](https://doi.org/10.5281/zenodo.22033697)

# EchoBench

> **Can a web agent distinguish independent evidence from a hundred copies of the same lie?**

EchoBench is a synthetic social web for testing whether AI agents can tell genuine
corroboration apart from coordinated repetition and manufactured consensus. It puts
agents in matched worlds where the visible web can look equally convincing while the
underlying provenance is completely different, then measures whether they reach the
truth and update their beliefs for the right reasons.

[Read the paper](paper/main.pdf) · [Read the preregistration](PREREG.md) · [Explore the benchmark design](echobench_synthetic_social_web_benchmark.md)

## Why this benchmark

Most web-agent evaluations ask whether a model finds the correct answer. EchoBench
also asks *why* it trusted that answer. A model should not mistake copied pages for
independent reporting, abandon a correct belief because a rumor is popular, or ignore
a real update because it conflicts with its prior knowledge.

## What you get

- **A realistic but controlled web.** Agents search and open ordinary-looking news,
  forum, and official pages without ever seeing the hidden provenance graph.
- **Matched counterfactual worlds.** The same claim appears under clean, poisoned,
  manufactured-consensus, and legitimate-update conditions, so behavior can be
  compared rather than merely observed.
- **Auditable evaluation.** Append-only traces and deterministic scoring show not just
  whether the final answer was right, but whether the agent resisted misinformation,
  found primary sources, calibrated confidence, and cited evidence responsibly.

## Under the hood

A closed, adversarial "internet" the model can search and read, plus a deterministic
scorer for whether the model updates beliefs correctly.

- **600 worlds** from **100 claims** (50 synthetic + 50 real), each claim instantiated
  under 6 matched counterfactual conditions, with 14 pages per world (9 claim-bearing
  + 5 neutral topical distractors).
- **Realistic isolated web** served over HTTP: realistic fictional domains
  (`dailyledger.com`, `threadhouse.net/r/...`, `cobaltworks.com/registry/...`),
  human-readable URLs, opaque page ids, and no authority-leaking tokens anywhere on the
  model-visible surface. Scoped per-world by token; only `search` and `openPage` are
  available and the real internet is never reachable.
- **Hybrid search engine**: lexical BM25 + local MiniLM semantic embeddings fused via
  reciprocal rank fusion; search results show source site, publication date, and
  engagement counts (views/likes/shares/comments).
- **Deterministic provenance**: every page carries hidden stance / copied-from /
  origin-cluster metadata that the scorer reads but the model never sees.
- **Seven providers, one harness**: DeepSeek-only is the canonical MVP protocol
  (`deepseek-chat`, thinking disabled). OpenAI `gpt-5.6-luna` is wired as a
  comparison provider (no temperature, strict structured outputs, reasoning
  effort `none` via `/v1/chat/completions`, 8192-token completion floor);
  setting `OPENAI_REASONING_EFFORT` to anything non-`none` switches Luna to the
  `/v1/responses` API, which is required to combine function tools with
  reasoning. ModelScope
  (`api-inference.modelscope.ai/v1`, thinking disabled by default) serves the
  Qwen-Ambassador models (`Qwen-Ambassador/Qwen3.7-Max`,
  `Qwen-Ambassador/Qwen3.7-Plus`); the `.cn` host variant was abandoned (it
  rejects the token with 401). An OpenRouter route is also wired as a fallback
  for the same Qwen weights. Gemini 3.x (`gemini-3.7-flash`,
  `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`,
  `gemini-3-flash-preview`) runs through the OpenAI-compatible endpoint
  (`generativelanguage.googleapis.com/v1beta/openai`); implicit context
  caching is automatic and cache-hit tokens are priced at the cache-read
  rate in reported costs. Thinking is fixed at the low level (the Gemini 3
  minimum; it cannot be disabled) and its tokens are billed in the output
  figure. Gemini's conversation rules require a user turn before any function
  call, so the client seeds the research loop with a single `Begin.` turn. Meta
  Muse Spark 1.2 (standard tier $1.25/$4.25 per M; the pilot ran on the
  contributor model `muse-spark-1.2-contributor` — training opt-in at
  $0.10/$0.20 — via `api.meta.ai/v1`, reasoning `minimal`) and xAI Grok 4.6
  (`grok-4.6`, `api.x.ai/v1`, reasoning `low` — the floor, it cannot be
  disabled), both OpenAI-compatible. One
  provider per run set; the provider and returned model id are recorded in
  every trace. Prior elicitation, a research agent loop with a 20-call tool
  budget, and a schema-validated final judgment (one repair attempt).
  Append-only traces, resume-safe runs with automatic retry of transient
  failures, cost guard.
- **12 metrics** (FBAR, CUR, EAS, PCR, ICS, SER, PSR, PRR, CI, TUA,
  calibration, cost) with clustered bootstrap confidence intervals. PRR
  (Primary Repudiation Rate) measures the "found the primary, then disowned
  it" move: poison runs that opened the true primary but left
  `primarySourcePageId` null or pointed it at a false page.
- **Docker** image bundling Node + Python for reproducible analysis.

## Repository layout

```
packages/schema      Zod contracts: answers, claims, pages, worlds, traces, manifests
packages/llm         DeepSeek client (retries, timeouts) + pricing
packages/generator   Deterministic claims/provenance/world generation + prose render
packages/evaluator   Deterministic metrics + clustered bootstrap
apps/echoweb         Isolated search + page-serving API (Fastify)
apps/runner          DeepSeek agent loop, traces, resumable run sets
apps/cli             `echobench` command surface
analysis/            Python tables + paper figures + cross-model comparisons + dashboard
prompts/v1/          Frozen prompt templates (sha256 recorded in artifacts)
datasets/dev         Frozen dev split (20 claims, 120 worlds) — committed
datasets/test        Sealed test split (80 claims, 480 worlds) — gitignored
traces/              Append-only evaluation traces (gitignored)
reports/             Score reports + figures
```

## Setup

Requires Node 22+, pnpm 10, Python 3.11+ (for analysis figures).

```bash
pnpm install
cp .env.example .env        # set the provider key(s) you run (DEEPSEEK_API_KEY, GEMINI_API_KEY, ...)
python -m pip install -r analysis/requirements.txt   # only needed for figures
```

## Commands

```bash
pnpm echobench generate --split dev [--skip-prose] [--no-embed] [--concurrency 8]
pnpm echobench validate --split dev
pnpm echobench serve    --split dev --port 4577
pnpm echobench run      --split dev --max-runs 100 --run-set-id pilot-dev-v2 [--provider deepseek|openai|modelscope|openrouter|gemini|muse|grok] [--model <id>]
pnpm echobench score    --split dev --run-set-id pilot-dev-v2 --bootstrap 200
pnpm echobench report   --split dev --run-set-id pilot-dev-v2
```

- `generate` builds worlds for a split. With `--skip-prose` it uses deterministic
  template prose (byte-identical across runs); otherwise DeepSeek renders page prose
  and each page passes a round-trip extraction check before being frozen. Page
  embeddings (local MiniLM, offline) are frozen into each world unless `--no-embed`.
- `validate` re-checks a frozen dataset (schemas, provenance graph, no hidden-field
  leakage, manifest checksums, dev/test no-overlap).
- `run` starts the isolated web in-process, runs episodes with a token-scoped HTTP
  gateway, writes append-only traces and an index, and skips already-completed runs.
- `score` joins traces to ground truth and computes metrics + bootstrap CIs.
- `report` writes `report.md`, `runs.csv`, and Python-generated SVG figures.

## Docker

```bash
docker compose build
docker compose run --rm bench validate --split dev
docker compose run --rm bench report --split dev --run-set-id pilot-dev-v2
# serve the synthetic web on host port 4577:
docker compose up echoweb
```

Only `DEEPSEEK_API_KEY` is injected into the container.

## Design notes & deviations

- **Web surface (v2)**: realistic fictional `.com`/`.gov` domains and human-readable
  URL paths replace the original `*.echo` scheme; page ids exposed to the model are
  opaque tokens with no role/authority leakage. Each world has 5 additional neutral
  distractor pages so search and escalation require real triage.
- **Search** is hybrid: pure-TypeScript BM25 fused with local MiniLM semantic
  embeddings (reciprocal rank fusion) instead of SQLite FTS5; deterministic with
  pageId tie-break. See `PREREG.md`.
- **Semantic embeddings** run locally (CPU, `all-MiniLM-L6-v2` via
  `@huggingface/transformers`) and make **no API calls** — the DeepSeek-only rule
  applies to the evaluated model's paid runs; embeddings are frozen dataset artifacts.
- **Prose rendering** falls back to a deterministic template for any page that fails the
  extraction check (correctness over realism); counts are in `manifest.renderStats`.
- **Resilience**: the runner auto-retries transient network failures (one in-run sweep
  plus resume-on-rerun), so a flaky connection cannot silently drop evaluation runs.
- **Review**: the plan's two-person review of real truth records is substituted by
  machine validation plus single-operator sign-off (see `PREREG.md` -> Review
  substitutions), as directed for this run.

## Results (dev-split pilots)

All models ran the identical dev plan (`plan-dev-v1` seed; n=100 unless noted),
scored by the frozen `PREREG` contract with clustered-bootstrap CIs. At these
sample sizes rankings are **directional** — the sealed 1,440-run test split
decides. The definitive field write-up is `analysis/model_comparison_full.md`,
interactive charts are in `analysis/model_comparison_dashboard.html` (open it in
a browser), and paired significance / world-difficulty / failure-taxonomy /
calibration analyses are in `analysis/cross_model_report.md`.

### Model protocols

| Model | Provider route | Thinking | Notes |
|---|---|---|---|
| DeepSeek V4 Flash (`deepseek-chat`) | api.deepseek.com | disabled | temp 0.7, `json_object` |
| Luna (`gpt-5.6-luna`) | OpenAI `/v1/chat/completions` | `none` | 8192-token completion floor, strict `json_schema`, no temperature |
| Qwen3.7 Max / Plus | ModelScope native | disabled | temp 0.7, `json_object` |
| Gemini 3.7 Flash / 3.5 Flash-Lite | Gemini OpenAI-compat | `low` (floor; `none` rejected) | `Begin.` user-turn seeding, cache-read billing |
| Terra (`gpt-5.6-terra`) | OpenAI `/v1/chat/completions` | `none` | same adapter family as Luna |
| Muse Spark 1.2 | api.meta.ai | `minimal` (floor) | OpenAI-compatible; pricing shown at official standard tier |
| Grok 4.6 | OpenRouter (`x-ai/grok-4.6`) | `low` (floor; cannot disable) | n=80 |
| GPT-5.6 Sol | OpenRouter (`openai/gpt-5.6-sol`) | `minimal` | n=50, 50%-off list rate ($2.50/$15) |

### Headline metrics (higher = better unless noted)

| Metric | DS V4 Flash | Luna | Qwen Max | Qwen Plus | Gem 3.7 | Gem 3.5L | Terra | Muse | Grok | Sol |
|---|---|---|---|---|---|---|---|---|---|---|
| **EAS** | 0.850 | 0.941 | 0.951 | 0.920 | **0.984** | 0.905 | 0.923 | 0.923 | 0.866 | 0.909 |
| FBAR ↓ | 0.158 | **0.000** | 0.094 | 0.031 | 0.031 | 0.063 | **0.000** | **0.000** | 0.125 | **0.000** |
| CUR | 0.857 | 0.889 | **1.000** | 0.875 | **1.000** | 0.875 | 0.857 | 0.857 | 0.857 | 0.833 |
| PCR ↓ | 0.294 | 0.059 | 0.118 | 0.118 | 0.059 | 0.176 | 0.077 | **0.000** | 0.231 | 0.125 |
| ICS | +0.074 | +0.038 | +0.108 | +0.091 | +0.012 | +0.013 | +0.003 | +0.011 | +0.048 | −0.006 |
| SER | 1.000 | 0.806 | 1.000 | 1.000 | 0.985 | 0.657 | 0.830 | **1.000** | 0.981 | 0.970 |
| PSR | 0.980 | 0.790 | 0.990 | **1.000** | 0.980 | 0.620 | 0.825 | 0.987 | 0.988 | 0.980 |
| PRR ↓ | 0.227 | 0.302 | 0.149 | 0.119 | 0.061 | 0.091 | 0.205 | **0.058** | 0.154 | 0.281 |
| CI | 0.610 | 0.706 | 0.625 | 0.630 | **0.819** | 0.777 | 0.726 | 0.800 | 0.739 | 0.659 |
| TUA | 0.938 | 0.938 | **1.000** | 0.938 | **1.000** | 0.938 | 0.923 | 0.833 | 0.923 | 0.875 |
| Brier ↓ | 0.142 | 0.067 | 0.087 | 0.095 | **0.036** | 0.064 | 0.073 | 0.050 | 0.104 | 0.102 |
| ECE ↓ | 0.085 | 0.054 | 0.040 | 0.089 | **0.020** | 0.061 | 0.057 | 0.032 | 0.057 | 0.084 |

### Condition accuracy

| Condition | DS V4 Flash | Luna | Qwen Max | Qwen Plus | Gem 3.7 | Gem 3.5L | Terra | Muse | Grok | Sol |
|---|---|---|---|---|---|---|---|---|---|---|
| clean | 0.882 | 0.941 | 0.941 | 0.941 | **1.000** | **1.000** | 0.857 | **1.000** | 0.929 | 0.889 |
| single_poison | 0.941 | 0.941 | 0.941 | 0.941 | **1.000** | **1.000** | 0.929 | 0.929 | 0.929 | 0.889 |
| ranked_poison | 0.882 | 0.941 | 0.941 | 0.941 | **1.000** | **1.000** | 0.923 | 0.923 | **1.000** | 0.875 |
| manufactured_consensus | 0.706 | 0.941 | 0.941 | 0.941 | 0.941 | 0.824 | 0.923 | **1.000** | 0.769 | 0.875 |
| legitimate_update | 0.938 | 0.938 | **1.000** | 0.938 | **1.000** | 0.938 | 0.923 | 0.833 | 0.923 | 0.875 |
| false_majority_true_primary | 0.500 | 0.875 | 0.625 | 0.688 | 0.813 | 0.750 | 0.846 | **0.923** | 0.692 | 0.750 |

### EAS leaderboard

1. **Gemini 3.7 Flash — 0.984** (CI 0.945–1.000)
2. Qwen3.7 Max — 0.951
3. Luna — 0.941
4. Terra / Muse — 0.923 (tied; n=80)
5. Qwen3.7 Plus — 0.920
6. GPT-5.6 Sol — 0.909 (n=50)
7. Gemini 3.5 Flash-Lite — 0.905
8. Grok 4.6 — 0.866 (n=80)
9. DeepSeek V4 Flash — 0.850

### Cost (per 100 runs, normalized)

| Model | Total | Mean/run | Tokens/run (in/out) | Tool calls/run |
|---|---|---|---|---|
| Gemini 3.5 Flash-Lite | $0.32 | $0.0032 | 15.3k / 0.7k | 2.8 |
| DeepSeek V4 Flash | $0.55 | $0.0055 | 35.7k / 1.6k | 8.1 |
| Luna | $0.77 | $0.0077 | 34.4k / 0.7k | 7.1 |
| Gemini 3.7 Flash | $1.08 | $0.0108 | 24.8k / 0.9k | 4.7 |
| Qwen3.7 Plus | $2.73 | $0.0273 | 60.5k / 2.0k | 8.9 |
| Muse Spark 1.2* | $2.83 | $0.0283 | 17.1k / 1.6k | 4.7 |
| Grok 4.6 | $3.21 | $0.0321 | 13.7k / 0.8k | 4.4 |
| Terra | $3.49 | $0.0349 | 22.5k / 0.5k | 5.3 |
| GPT-5.6 Sol | $6.69 | $0.0669 | 19.9k / 1.1k | 11.7 |
| Qwen3.7 Max | $7.59 | $0.0759 | 26.9k / 1.1k | 4.9 |

\* Muse's pilot ran on the training-opt-in contributor tier; the figure shown is
computed from its actual token usage at **official** standard pricing ($1.25/$4.25
per M). Cost figures are estimates from published token pricing.

### Headline findings

- **The only condition that stratifies the field is `false_majority_true_primary`**
  (majority wrong, primary recoverable): DeepSeek 0.500 → Qwen Max 0.625 →
  Qwen Plus 0.688 → Gem 3.5L 0.750 → Sol 0.750 → Gem 3.7 0.813 → Terra 0.846 →
  Luna 0.875 → **Muse 0.923**. This is where arbitration quality is measured.
- **Four models never corrupt a correct prior** (FBAR 0.000): Luna, Terra, Muse,
  Sol. Gemini 3.7 and Qwen Plus are next (0.031); DeepSeek (0.158) and Grok
  (0.125) are the outliers.
- **Muse is the best retrieval/arbitration combo** (SER 1.000, PSR 0.987, PRR
  0.058 — lowest disown rate in the field) at mid-pack official pricing.
- **Gemini 3.7 Flash is the accuracy + calibration leader** (EAS 0.984, best
  ECE 0.020) and is the model to beat on the sealed test split.
- **Grok 4.6 is the biggest miss**: near-top retrieval but second-worst
  corruption resistance (FBAR 0.125), collapsing on the two hard conditions
  (`manufactured_consensus` 0.769, `false_majority` 0.692) — poor value at
  $3.21/100.
- **Sol is the most agentic model** (11.7 tool calls/run, the field runs 4–9)
  and the second-priciest; FBAR 0.000 but high PRR 0.281 and the field's worst
  ICS (−0.006) — research stamina, not better arbitration.
- **Thinking upgrades were a wash or worse**: Luna at reasoning `low` regressed
  (EAS 0.941 → 0.857); Gemini and Muse are pinned to their floors (`none`
  rejected by their APIs). Terra at `none` underperforms its cheaper sibling
  Luna — flagship pricing buys no arbitration advantage here.

### Cross-model deep dives

Full tables, matrices, and figures live in `analysis/cross_model_report.md`
(+ `analysis/exports/fig_pairwise_diff.png`, `fig_agreement_auc.png`). Because
every pilot shares the plan seed, these are **paired** on the shared episode set
(common n=34, limited by the n=50 Sol plan and per-pilot rejects).

- **The leaderboard is partly illusory**: paired bootstrap shows Gemini 3.7 is
  only *significantly* better than Qwen Max, Terra, Luna `low`, Qwen Plus, Grok,
  Sol, and DeepSeek. It is **not** significantly better than Gem 3.5L, Muse, or
  Luna — those four form one statistically indistinguishable top cluster, and
  everyone else beats DeepSeek.
- **`syn_008` is the universal hard world**: one synthetic claim is pathological
  across conditions (false_majority 1/11 models correct, single_poison 2/11,
  ranked_poison 3/11, legitimate_update 4/11). 23 of 34 shared episodes are
  all-models-correct, zero are all-models-wrong — `syn_008` is the benchmark's
  key differentiator for the sealed test split.
- **Failure taxonomy**: rescue (prior wrong → final right) varies hugely — Luna
  51, Gem 3.7 49, Qwen Max 45, but Muse 38 and Sol only 29 (least stable: just
  14 correct-and-stable of 50). Corruption is rare everywhere except DeepSeek (6)
  and Grok (3). On `false_majority` specifically, DeepSeek corrupts 5/9 while
  Luna/Terra/Muse/Sol corrupt 0.
- **Calibration/discrimination**: **Terra has the best confidence AUC (0.963)** —
  its confidence best separates right from wrong despite a mid EAS; Sol 0.944,
  Muse 0.940. Weakest: Qwen Plus 0.732, Grok 0.743 — the field's most
  overconfident-but-miscalibrated pair. Gem 3.7 keeps the best ECE (0.020).

### Status & caveats

- **Sample sizes**: n=80 for Terra / Muse / Grok; n=50 for Sol; all CIs reflect
  this. Rankings are directional at these sizes.
- **Gemini 3.1 Pro** (`pilot-gemini-31-pro`): ~62/100 done, stalled by the
  model's 250-requests/day free-tier quota; resume-safe, finishes over 2–3
  quota windows. Runs at thinking `low`.
- **DeepSeek V4 Pro** (`pilot-v4pro-100`): completed but **excluded from the
  field tables** — EAS 0.740 with thinking disabled is a protocol artifact (V4
  ignores the legacy `enable_thinking` flag; with thinking disabled the model
  underperforms the baseline). A `low`-effort rerun would be the fair test.
- **Luna `low`** (reasoning experiment): EAS 0.857 — worse than `none`; shown
  only in the cross-model analyses, not the field tables.
- **Serving route is not neutral**: the same Qwen3.7 weights arbitrated
  materially worse via OpenRouter than ModelScope-native (see PREREG amendments).
  Treat per-model numbers as route-specific.
- The Muse pilot's raw trace spend reflects contributor-tier billing; official
  pricing is used in all comparison tables above.

## Tests

```bash
pnpm -r typecheck   # strict TS across all packages
pnpm -r test        # 113 tests
```

Coverage includes schema rejection (leaked hidden fields / broken citations / cycles /
dev-test overlap), determinism and matched-world invariants, hand-computed metric
fixtures, search ranking + isolation, and the resumable runner with a mock LLM.
