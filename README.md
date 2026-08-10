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
  under 6 matched counterfactual conditions.
- **Isolated synthetic web** served over HTTP (`*.echo` URLs), scoped per-world by token.
  The model can only `search` and `openPage`; the real internet is never reachable.
- **Deterministic provenance**: every page carries hidden stance / copied-from /
  origin-cluster metadata that the scorer reads but the model never sees.
- **DeepSeek-only evaluation**: one provider (`deepseek-chat`), prior elicitation,
  a research agent loop with a 20-call tool budget, and a schema-validated final
  judgment (one repair attempt). Append-only traces, resume-safe runs, cost guard.
- **11 metrics** (FBAR, CUR, EAS, PCR, ICS, SER, PSR, CI, TUA, calibration, cost) with
  clustered bootstrap confidence intervals.
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
pnpm echobench generate --split dev [--skip-prose] [--concurrency 8]
pnpm echobench validate --split dev
pnpm echobench serve    --split dev --port 4577
pnpm echobench run      --split dev --max-runs 100 --run-set-id pilot-dev-v1
pnpm echobench score    --split dev --run-set-id pilot-dev-v1 --bootstrap 200
pnpm echobench report   --split dev --run-set-id pilot-dev-v1
```

- `generate` builds worlds for a split. With `--skip-prose` it uses deterministic
  template prose (byte-identical across runs); otherwise DeepSeek renders page prose
  and each page passes a round-trip extraction check before being frozen.
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
docker compose run --rm bench report --split dev --run-set-id pilot-dev-v1
# serve the synthetic web on host port 4577:
docker compose up echoweb
```

Only `DEEPSEEK_API_KEY` is injected into the container.

## Design notes & deviations

- **Search** is pure-TypeScript BM25 (deterministic, byte-identical across platforms)
  instead of SQLite FTS5; ranking uses the specified BM25 family with a title boost and
  pageId tie-break. See `PREREG.md`.
- **Prose rendering** falls back to a deterministic template for any page that fails the
  extraction check (correctness over realism); counts are in `manifest.renderStats`.
- **Review**: the plan's two-person review of real truth records is substituted by
  machine validation plus single-operator sign-off (see `PREREG.md` -> Review
  substitutions), as directed for this run.

## Pilot result (100 dev-split runs, `deepseek-chat`)

| Condition | Accuracy |
|---|---|
| clean | 0.941 |
| single_poison | 1.000 |
| ranked_poison | 1.000 |
| manufactured_consensus | 0.765 |
| legitimate_update | 0.875 |
| false_majority_true_primary | 0.625 |

Headline: **EAS 0.792**, FBAR 0.111 (4/36), CUR 0.714 (5/7), PCR 0.294 (5/17),
ICS +0.102 over 17 matched pairs, Brier 0.091 / ECE 0.061, mean 8.72 tool calls,
total spend $0.342. Full details: `reports/dev/pilot-dev-v1/report.md`.

The graded difficulty is visible: clean / single- and ranked-poison are easy, while
`manufactured_consensus` (echo chamber) and especially
`false_majority_true_primary` (majority wrong, primary recoverable) degrade accuracy —
exactly the epistemic-arbitration pressure this benchmark is designed to apply.

## Tests

```bash
pnpm -r typecheck   # strict TS across all packages
pnpm -r test        # 73 tests
```

Coverage includes schema rejection (leaked hidden fields / broken citations / cycles /
dev-test overlap), determinism and matched-world invariants, hand-computed metric
fixtures, search ranking + isolation, and the resumable runner with a mock LLM.
