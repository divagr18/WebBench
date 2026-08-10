# EchoBench

Benchmarking **epistemic arbitration** on a synthetic social web: can a web-enabled
language model distinguish genuine corroboration from manufactured consensus, and know
when to trust the web over its own parametric knowledge?

This repository implements a paper-grade, locally reproducible MVP described in
`Plan.md` (research motivation in `echobench_synthetic_social_web_benchmark.md`).

## Status

Under construction. See `Plan.md` for the full design.

## Key constraints

- Only the DeepSeek API is used (single provider), configured via `.env`.
- The evaluated model only ever sees the isolated synthetic web (`*.echo` URLs) served
  locally; it never touches the real internet during an episode.

## Layout

```
packages/schema      Zod contracts: answers, claims, pages, worlds, traces, manifests
packages/generator   Deterministic claim/provenance/world generation + prose rendering
packages/evaluator   Deterministic metrics (FBAR, CUR, EAS, PCR, ICS, ...)
apps/echoweb         Isolated search + page-serving API (Fastify)
apps/runner          DeepSeek agent loop + trace capture
apps/cli             `echobench` command surface
analysis/            Python statistical analysis + figures
datasets/            Frozen generated worlds (dev split public)
```
