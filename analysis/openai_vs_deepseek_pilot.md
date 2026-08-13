# Head-to-head: DeepSeek `deepseek-chat` vs OpenAI `gpt-5.6-luna` (dev pilot, n=100 each)

Run sets: `pilot-dev-v2` (DeepSeek, canonical) vs `pilot-dev-v2-openai` (OpenAI),
identical dev split (20 claims × 6 conditions, 1 replicate, deterministic plan —
same plan seed, same worlds, same prompts, same hybrid-search web), $5 budget.

Model protocol notes (see PREREG amendments): DeepSeek runs with thinking
disabled, temperature 0.7, `json_object` mode. Luna runs with reasoning effort
`none`, no temperature (API-unsupported for this model), strict structured
outputs (`json_schema`). Zero schema repairs on either pilot.

## Headline

| Metric | DeepSeek | Luna | Direction |
|---|---|---|---|
| **EAS** | 0.850 [0.636, 0.972] | **0.941 [0.778, 1.000]** | higher better |
| FBAR | 0.158 (6/38) | **0.000 (0/28)** | lower better |
| CUR | 0.857 (6/7) | 0.889 (8/9) | higher better |
| PCR | 0.294 (5/17) | **0.059 (1/17)** | lower better |
| PRR | **0.227 (15/66)** | 0.302 (16/53) | lower better |
| SER | **1.000 (67/67)** | 0.806 (54/67) | higher |
| PSR | **0.980 (98/100)** | 0.790 (79/100) | higher |
| CI | 0.610 (286/469) | **0.706 (166/235)** | higher better |
| TUA | 0.938 (15/16) | 0.938 (15/16) | higher |
| ICS | +0.074 (17 pairs) | +0.038 (17 pairs) | higher better |
| Brier | 0.142 | **0.067** | lower better |
| ECE | 0.085 | **0.054** | lower better |
| Cost | $0.546 | $0.769 | — |
| Mean tool calls | 8.13 | 7.13 | — |
| Mean latency | 17s | 10s | — |

CIs overlap, so this is directional evidence at n≈100 — the sealed 1,440-run
test is what decides it. But the *pattern* is internally consistent.

## Per-condition accuracy

| Condition | DeepSeek | Luna |
|---|---|---|
| clean | 0.882 | 0.941 |
| single_poison | 0.941 | 0.941 |
| ranked_poison | 0.882 | 0.941 |
| manufactured_consensus | **0.706** | **0.941** |
| legitimate_update | 0.938 | 0.938 |
| false_majority_true_primary | **0.500** | **0.875** |

DeepSeek's signature is a *collapse under coordinated misinformation*: its
accuracy drops from ~0.9 on clean/poison to 0.706 on the echo chamber and 0.50
on the false majority. Luna is *flat at ~0.94 across all six conditions* — the
conditions move its behavior far less.

## What drives the difference

1. **Zero belief corruption for Luna (FBAR 0/28).** All six DeepSeek
   corruptions were real claims where a correct prior was abandoned after
   reading a fabricated majority (the deference-inversion mechanism in
   `analysis/case_studies_false_majority.md`). Luna resisted every such case.

2. **Luna abstains more, knows less (priors: 52 ABSTAIN vs DeepSeek 37).**
   Its parametric knowledge is weaker/cautious, which shrinks the FBAR
   denominator (28 vs 38) — Luna had fewer correct priors to corrupt. The
   corruption-free claim must be read alongside this: what Luna *does* assert
   it defends, but it asserts less.

3. **Different research style.** Luna opens fewer pages (PSR 0.79 vs 0.98) and
   escalates less (SER 0.806 vs 1.0), yet is MORE accurate on the poisoned
   conditions. Its CI is higher (0.706 vs 0.610): when it cites, it cites
   correctly more often. Its PRR is slightly higher (0.302) partly because it
   names `primarySourcePageId` less often, not because it rejects true
   primaries it trusts.

4. **Calibration.** Luna is much better calibrated (Brier 0.067 vs 0.142, ECE
   0.054 vs 0.085) — its confidence tracks its accuracy more closely.
   DeepSeek's bin-8 overconfidence cluster (see `analysis/calibration_and_housekeeping.md`)
   is largely absent for Luna.

5. **Residual errors concentrate on the same hard synthetic claims.** Luna's
   two false_majority errors are `syn_001` and `syn_008`; its legitimate_update
   error is also `syn_008`. `syn_008` (solvaneq, the distrust-hypervigilance
   claim from the DeepSeek case studies) remains structurally hard for both
   models.

## Interpretation

This is not "Luna is smarter" in a general sense — Luna abstains on more
questions and cites a primary source less often. It is that the two models sit
on different points of a **knowledge-vs-caution tradeoff**:

- **DeepSeek**: knows more (answers more priors), more aggressive retrieval
  (opens almost every primary), but its epistemic arbitration is the weak
  link — a fabricated majority can overturn knowledge it actually has.
- **Luna**: knows less and abstains more, but its arbitration is near-robust —
  nothing in this benchmark talked it out of something it knew.

For the benchmark's core construct (arbitrating apparent consensus against a
recoverable primary), Luna is the stronger evaluator; for retrieval thoroughness,
DeepSeek is. The sealed test split will quantify both with tighter intervals.

Cost: Luna is ~1.4x the DeepSeek spend here despite shorter responses, because
its input price ($0.20/M) plus a research-heavy token mix outweighs its token
savings; still $0.77 for 100 runs — the sealed 1,440-run test projects ~$11 at
these rates (vs ~$8 DeepSeek), both inside a modest budget.

## Harness notes (for the record)

- Both pilots: zero `failed`, zero `rejected`, zero schema-repair attempts.
- Luna adapter required three param-strictness fixes discovered via the smoke
  run: flat `reasoning_effort` (nested `reasoning` is Responses-API-only),
  `tool_choice` only with `tools` present, `temperature` omitted entirely.
- Provider and returned model id are recorded in every trace; run manifests:
  `traces/dev/pilot-dev-v2/` (deepseek) and `traces/dev/pilot-dev-v2-openai/`
  (openai).
