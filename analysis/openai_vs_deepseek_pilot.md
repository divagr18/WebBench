# Model comparison: DeepSeek, gpt-5.6-luna, qwen3.7-max, qwen3.7-plus (dev pilots)

Run sets (identical dev split — 20 claims × 6 conditions, 1 replicate, same
plan seed, same worlds, same prompts, same hybrid-search web):

| Run set | Provider route | Model | Runs | Status |
|---|---|---|---|---|
| `pilot-dev-v2` | DeepSeek API | `deepseek-chat` | 100/100 | canonical |
| `pilot-dev-v2-openai` | OpenAI API | `gpt-5.6-luna` | 100/100 | complete |
| `pilot-dev-v2-modelscope-max` | ModelScope API (`api-inference.modelscope.ai`) | `Qwen-Ambassador/Qwen3.7-Max` | 100/100 | complete |
| `pilot-dev-v2-modelscope-plus` | ModelScope API (`api-inference.modelscope.ai`) | `Qwen-Ambassador/Qwen3.7-Plus` | 100/100 | complete |
| `pilot-dev-v2-qwen37max` | OpenRouter (superseded) | `qwen/qwen3.7-max` | 73/100 | **superseded** — early attempt before the ModelScope `.ai` endpoint was discovered; retained only as a route-sensitivity artifact (see below) |

Model protocol notes (see PREREG amendments): DeepSeek runs with thinking
disabled, temperature 0.7, `json_object` mode. Luna runs with reasoning effort
`none`, no temperature (API-unsupported), strict structured outputs
(`json_schema`). Both Qwen models run natively on ModelScope with
`enable_thinking=false` (verified: reasoning tokens suppressed), temperature
0.7, `json_object`. Zero schema repairs on all four pilots.

## Headline

| Metric | DeepSeek (100) | Luna (100) | qwen3.7-max (100) | qwen3.7-plus (100) | Direction |
|---|---|---|---|---|---|
| **EAS** | 0.850 [0.636, 0.972] | 0.941 [0.778, 1.000] | **0.951 [0.900, 1.000]** | 0.919 [0.660, 1.000] | higher better |
| FBAR | 0.158 (6/38) | **0.000 (0/28)** | 0.094 (3/32) | 0.031 (1/32) | lower better |
| CUR | 0.857 (6/7) | 0.889 (8/9) | **1.000 (8/8)** | 0.875 (7/8) | higher better |
| PCR | 0.294 (5/17) | **0.059 (1/17)** | 0.118 (2/17) | 0.118 (2/17) | lower better |
| PRR | 0.227 (15/66) | 0.302 (16/53) | 0.149 (10/67) | **0.119 (8/67)** | lower better |
| SER | 1.000 (67/67) | 0.806 (54/67) | 1.000 (67/67) | 1.000 (67/67) | higher |
| PSR | 0.980 (98/100) | 0.790 (79/100) | 0.990 (99/100) | **1.000 (100/100)** | higher |
| CI | 0.610 (286/469) | **0.706 (166/235)** | 0.625 (185/296) | 0.629 (316/502) | higher better |
| TUA | 0.938 (15/16) | 0.938 (15/16) | **1.000 (16/16)** | 0.938 (15/16) | higher |
| ICS | +0.074 | +0.038 | +0.108 | +0.091 | higher better |
| Brier | 0.142 | **0.067** | 0.087 | 0.095 | lower better |
| ECE | 0.085 | 0.054 | **0.040** | 0.089 | lower better |
| Cost | $0.55 | $0.77 | $7.59 | $2.73 | — |
| Mean tool calls | 8.1 | 7.1 | 4.8 | 8.9 | — |
| Mean latency | 17s | 10s | 23s | 50s | — |

EAS ranking: **qwen3.7-max 0.951 > luna 0.941 > qwen3.7-plus 0.919 > deepseek
0.850**. CIs overlap across all four — directional at n=100 each; the sealed
test split is what decides the ordering.

## Per-condition accuracy

| Condition | DeepSeek | Luna | qwen3.7-max | qwen3.7-plus |
|---|---|---|---|---|
| clean | 0.882 | 0.941 | 0.941 | 0.941 |
| single_poison | 0.941 | 0.941 | 0.941 | 0.941 |
| ranked_poison | 0.882 | 0.941 | 0.941 | 0.941 |
| manufactured_consensus | **0.706** | 0.941 | 0.941 | 0.941 |
| legitimate_update | 0.938 | 0.938 | **1.000** | 0.938 |
| false_majority_true_primary | **0.500** | **0.875** | 0.625 | 0.688 |

All four models hold ≥0.94 on clean / single_poison / ranked_poison /
manufactured_consensus (legitimate_update too for max). The *only* condition
that separates them is **false_majority_true_primary**: Luna 0.875, then plus
0.688, then max 0.625, then DeepSeek 0.500. Even the best model drops from
~0.94 to 0.875 there; the benchmark's hardest construct is the one place the
field stratifies.

## What drives the ranking

1. **Belief corruption (FBAR) is rare across three of four models.** Luna is
   corruption-free (0/28), plus is near-free (1/32), max is low (3/32);
   DeepSeek is the outlier at 0.158 (6/38). The deference-inversion mechanism
   documented in `analysis/case_studies_false_majority.md` is primarily a
   DeepSeek phenomenon on this split.

2. **Updating (CUR) is strong everywhere**, with qwen3.7-max perfect (8/8).
   All four models correctly adopt legitimate updates when they start from a
   wrong or absent prior.

3. **qwen3.7-max is the strongest all-rounder:** best EAS, best CUR, best ECE,
   best PRR (least likely to disown a primary it opened), TUA perfect. Its one
   soft spot is false_majority (0.625), where it still collapses more than
   Luna. It retrieves efficiently (4.8 tool calls, PSR 0.99) and is the
   best-calibrated model here.

4. **qwen3.7-plus is the corruption-resistance workhorse:** FBAR 0.031 (only
   luna is lower), PSR 1.000 (opens every primary), SER 1.000, and the lowest
   PRR (0.119). It is the most thorough retriever and the least likely to
   repudiate an opened primary, at the cost of the worst calibration (ECE
   0.089, Brier 0.095) and the highest latency (50s, 8.9 tool calls).

5. **Retrieval style differs by model, not by correctness.** Luna opens fewer
   pages (PSR 0.79) yet resists corruption; the three others open nearly every
   primary. Both strategies defend the truth on this split — opening the
   primary is not what protects a model, its arbitration is.

6. **Cost.** DeepSeek and Luna are ~$0.6–0.8 per 100 runs; the native Qwen
   pilots are far more expensive on the ModelScope list-price estimate (max
   $7.59, plus $2.73). A sealed 1,440-run test projects ~$8 (DeepSeek), ~$11
   (Luna), ~$110 (qwen-max), ~$40 (qwen-plus) at these rates — budget is a
   real constraint for the larger Qwen models.

## Route sensitivity: OpenRouter vs ModelScope-native (qwen3.7-max)

The superseded `pilot-dev-v2-qwen37max` ran the same `qwen3.7-max` weights
through **OpenRouter** (73 runs, before the ModelScope `.ai` endpoint was
found) and gave **EAS 0.800, FBAR 0.250 (5/20), false_majority 0.500** —
substantially worse than the **ModelScope-native** run (EAS 0.951, FBAR 0.094,
false_majority 0.625).

Two non-exclusive explanations:
- **Sampling:** the OpenRouter attempt died mid-plan at 73/100 and is not a
  like-for-like sample; its FBAR denominator (20 prior-correct poison runs) is
  also smaller.
- **Route behavior:** OpenRouter and ModelScope may serve the same weights with
  different decoding defaults / wrapper behavior, producing genuinely different
  arbitration under misinformation.

Because the native ModelScope route is the intended and complete run, it is the
canonical qwen3.7-max result in this doc. The OpenRouter artifact is retained
as a caution that **serving route is not a neutral detail** on this benchmark —
worth controlling in any sealed test that compares across providers.

## DeepSeek vs Luna (complete pilots)

DeepSeek's signature is a *collapse under coordinated misinformation*: its
accuracy drops from ~0.9 on clean/poison to 0.706 on the echo chamber and 0.50
on the false majority. Luna is *flat at ~0.94 across all six conditions*.

1. **Zero belief corruption for Luna (FBAR 0/28).** All six DeepSeek
   corruptions were real claims where a correct prior was abandoned after
   reading a fabricated majority (the deference-inversion mechanism in
   `analysis/case_studies_false_majority.md`).

2. **Luna abstains more, knows less (priors: 52 ABSTAIN vs DeepSeek 37).**
   Its parametric knowledge is weaker/cautious, shrinking the FBAR denominator
   (28 vs 38). The corruption-free claim must be read alongside this: what
   Luna *does* assert it defends, but it asserts less.

3. **Calibration.** Luna is much better calibrated than DeepSeek (Brier 0.067
   vs 0.142, ECE 0.054 vs 0.085). DeepSeek's bin-8 overconfidence cluster (see
   `analysis/calibration_and_housekeeping.md`) is largely absent for Luna.

4. **Residual errors concentrate on the same hard synthetic claims** — e.g.
   `syn_008` (solvaneq, the distrust-hypervigilance claim) is structurally
   hard across models.

## Harness notes (for the record)

- All four pilots: zero `rejected`, zero schema-repair attempts.
- **ModelScope endpoint correction:** the working host is
  `api-inference.modelscope.ai/v1`. The `.cn` host
  (`api-inference.modelscope.cn/v1`) consistently rejected the same token with
  401 on every model and was the entire source of the earlier "token blocked"
  diagnoses. ModelScope-native runs use `enable_thinking=false`, temperature
  0.7, `json_object`. Modelscope `json_object` returns **null** content if the
  messages lack the word "json" — the frozen prompts contain it, so structured
  calls are safe.
- Luna adapter: flat `reasoning_effort`, `tool_choice` only with `tools`
  present, `temperature` omitted entirely.
- OpenRouter adapter (superseded qwen route): `reasoning: {effort: 'none'}`
  zeroes reasoning tokens; `tool_choice` only with `tools` present;
  `json_object` requires the word "json" in messages.
- Provider route and returned model id are recorded in every trace; run
  manifests under `traces/dev/<run-set-id>/`.
