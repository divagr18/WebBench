# EchoBench

Benchmarking **epistemic arbitration** on a synthetic social web: can a web-enabled
language model distinguish genuine corroboration from manufactured consensus, and know
when to trust the web over its own parametric knowledge?

This repository implements the paper-grade, locally reproducible MVP described in
`Plan.md`. Research motivation and the full benchmark design are in
`echobench_synthetic_social_web_benchmark.md`. The frozen evaluation contract is in
`PREREG.md`.

## What was built

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
- **Four providers, one harness**: DeepSeek-only is the canonical MVP protocol
  (`deepseek-chat`, thinking disabled). OpenAI `gpt-5.6-luna` is wired as a
  comparison provider (no temperature, strict structured outputs, reasoning
  effort `none`, 8192-token completion floor). ModelScope
  (`api-inference.modelscope.cn/v1`, `enable_thinking=false`) is wired for
  Qwen but currently unusable — its token is rejected with 401 pending
  regeneration (see `PREREG.md`). Qwen3.7 pilots therefore ran via OpenRouter
  (`qwen/qwen3.7-max`, `qwen/qwen3.7-plus`, reasoning effort `none`). One
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
analysis/            Python tables + paper figures
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
cp .env.example .env        # set DEEPSEEK_API_KEY (the only key EchoBench reads)
python -m pip install -r analysis/requirements.txt   # only needed for figures
```

## Commands

```bash
pnpm echobench generate --split dev [--skip-prose] [--no-embed] [--concurrency 8]
pnpm echobench validate --split dev
pnpm echobench serve    --split dev --port 4577
pnpm echobench run      --split dev --max-runs 100 --run-set-id pilot-dev-v2 [--provider deepseek|openai|modelscope|openrouter] [--model <id>]
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

## Pilot result (100 dev-split runs, `deepseek-chat`, v2 internet layer)

| Condition | Accuracy |
|---|---|
| clean | 0.882 |
| single_poison | 0.941 |
| ranked_poison | 0.882 |
| manufactured_consensus | 0.706 |
| legitimate_update | 0.938 |
| false_majority_true_primary | 0.500 |

Headline: **EAS 0.850**, FBAR 0.158 (6/38), CUR 0.857 (6/7), PCR 0.294 (5/17),
ICS +0.074 over 17 matched pairs, PSR 0.98, CI 0.61, Brier 0.142 / ECE 0.085,
mean 8.13 tool calls, total spend $0.546. Full details:
`reports/dev/pilot-dev-v2/report.md` (30-run calibration: `reports/dev/calib-v2/`).

The graded difficulty is visible: clean / poison worlds stay high, while
`manufactured_consensus` (echo chamber) drops and
`false_majority_true_primary` (majority wrong, primary recoverable) drops hardest —
exactly the epistemic-arbitration pressure this benchmark is designed to apply. Adding
distractors and realistic ranking made even the clean world non-trivial (0.88), so the
benchmark now discriminates across its full range.

## Comparison pilot (100 dev-split runs, `gpt-5.6-luna`, same plan)

| Condition | DeepSeek | Luna |
|---|---|---|
| clean | 0.882 | 0.941 |
| single_poison | 0.941 | 0.941 |
| ranked_poison | 0.882 | 0.941 |
| manufactured_consensus | 0.706 | 0.941 |
| legitimate_update | 0.938 | 0.938 |
| false_majority_true_primary | 0.500 | 0.875 |

Luna is near-flat at ~0.94 across all conditions and posts **FBAR 0.000** (zero
belief corruptions) with **EAS 0.941**, but abstains on more priors (52/100 vs
37/100) — it sits on a different knowledge-vs-caution tradeoff, and its retrieval
is thinner (PSR 0.79 vs 0.98). Full analysis and all 12 metrics:
`analysis/openai_vs_deepseek_pilot.md`.

## Qwen pilot (partial: 73/100 runs, `qwen/qwen3.7-max` via OpenRouter)

| Condition | DeepSeek | Luna | qwen3.7-max* |
|---|---|---|---|
| clean | 0.882 | 0.941 | 0.923 |
| single_poison | 0.941 | 0.941 | 0.917 |
| ranked_poison | 0.882 | 0.941 | 1.000 |
| manufactured_consensus | 0.706 | 0.941 | 0.750 |
| legitimate_update | 0.938 | 0.938 | 0.917 |
| false_majority_true_primary | 0.500 | 0.875 | 0.500 |

With thinking disabled, qwen3.7-max behaves most like DeepSeek: aggressive
retrieval (PSR 0.986, SER 1.0), but the same collapse under coordinated
misinformation — **FBAR 0.250 (5/20), the highest of the three so far**, with
false_majority at 0.500. The run stopped early when the OpenRouter account
credits ran out ($3.32 spent); the remaining 27 runs resume automatically after
a top-up. `qwen3.7-plus` is queued behind the same credit wall; the ModelScope
route (`--provider modelscope`) is wired but its token is rejected with 401
pending regeneration — see `PREREG.md` amendments.

## Tests

```bash
pnpm -r typecheck   # strict TS across all packages
pnpm -r test        # 95 tests
```

Coverage includes schema rejection (leaked hidden fields / broken citations / cycles /
dev-test overlap), determinism and matched-world invariants, hand-computed metric
fixtures, search ranking + isolation, and the resumable runner with a mock LLM.
