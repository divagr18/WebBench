# Model comparison: full field (dev-split pilots)

Every pilot runs the identical dev plan (100 runs, `plan-dev-v1` seed, n=100 except
where noted), scored by the frozen `PREREG` contract. CIs are clustered-bootstrap
(200 resamples); at n=100 they overlap across the top of the field, so **rankings
are directional**. The sealed 1,440-run test split decides.

Pilots covered: `pilot-dev-v2` (DeepSeek), `pilot-dev-v2-openai` (Luna `none`),
`pilot-dev-v2-openai-low` (Luna `low`), `pilot-dev-v2-modelscope-max` /
`-plus` (Qwen3.7, ModelScope-native), `pilot-gemini-37`, `pilot-gemini-35-lite`,
`pilot-terra-80` (n=80), `pilot-muse-80` (n=80), `pilot-grok-80` (n=80, via
OpenRouter), `pilot-sol-50` (n=50, via OpenRouter). Gemini 3.1 Pro is partial
(quota-limited, ~62/100; see status note).

## Model protocols

| Model | Provider route | Thinking | Notes |
|---|---|---|---|
| DeepSeek | api.deepseek.com | disabled | temp 0.7, `json_object` |
| Luna `none` | OpenAI `/v1/chat/completions` | `none` | 8192-token completion floor, strict `json_schema`, no temperature |
| Luna `low` | OpenAI `/v1/responses` | `low` | responses API required to combine tools + reasoning |
| Qwen3.7 max/plus | ModelScope native | disabled (`enable_thinking=false`) | temp 0.7, `json_object` |
| Gemini 3.7 / 3.5-lite / 3.1-pro | Gemini OpenAI-compat | `low` (floor; `none` rejected) | `Begin.` user-turn seeding, cache-read billing |
| Terra | OpenAI `/v1/chat/completions` | `none` | same adapter family as Luna `none` |
| Muse Spark 1.2 | api.meta.ai | `minimal` (floor; `none` rejected) | **standard tier** $1.25/$4.25 per M (pilot ran on contributor tier `muse-spark-1.2-contributor`, $0.10/$0.20 — training opt-in), `Begin.` seeding |
| Grok 4.6 | OpenRouter (`x-ai/grok-4.6`) | `low` (floor; cannot disable) | n=80 |
| GPT-5.6 Sol | OpenRouter (`openai/gpt-5.6-sol`) | `minimal` | n=50, 50% off list ($2.50/$15) |

## Headline metrics (higher = better unless noted)

| Metric | DeepSeek | Luna none | Luna low | qwen-max | qwen-plus | 3.7-flash | 3.5-lite | Terra (80) | Muse (80) | Grok (80) | Sol (50) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **EAS** | 0.850 | 0.941 | 0.857 | 0.951 | 0.920 | **0.984** | 0.905 | 0.923 | 0.923 | 0.866 | 0.909 |
| FBAR ↓ | 0.158 | **0.000** | **0.000** | 0.094 | 0.031 | 0.031 | 0.063 | **0.000** | **0.000** | 0.125 | **0.000** |
| CUR | 0.857 | 0.889 | 0.750 | **1.000** | 0.875 | **1.000** | 0.875 | 0.857 | 0.857 | 0.857 | 0.833 |
| PCR ↓ | 0.294 | 0.059 | **0.000** | 0.118 | 0.118 | 0.059 | 0.176 | 0.077 | **0.000** | 0.231 | 0.125 |
| ICS | +0.074 | +0.038 | +0.020 | +0.108 | +0.091 | +0.012 | +0.013 | +0.003 | +0.011 | +0.048 | −0.006 |
| SER | 1.000 | 0.806 | 0.940 | 1.000 | 1.000 | 0.985 | 0.657 | 0.830 | **1.000** | 0.981 | 0.970 |
| PSR | 0.980 | 0.790 | 0.840 | 0.990 | **1.000** | 0.980 | 0.620 | 0.825 | 0.987 | 0.988 | 0.980 |
| PRR ↓ | 0.227 | 0.302 | 0.307 | 0.149 | 0.119 | 0.061 | 0.091 | 0.205 | **0.058** | 0.154 | 0.281 |
| CI | 0.610 | 0.706 | 0.711 | 0.625 | 0.630 | **0.819** | 0.777 | 0.726 | 0.800 | 0.739 | 0.659 |
| TUA | 0.938 | 0.938 | 0.875 | **1.000** | 0.938 | **1.000** | 0.938 | 0.923 | 0.833 | 0.923 | 0.875 |
| Brier ↓ | 0.142 | 0.067 | 0.070 | 0.087 | 0.095 | **0.036** | 0.064 | 0.073 | 0.050 | 0.104 | 0.102 |
| ECE ↓ | 0.085 | 0.054 | 0.043 | 0.040 | 0.089 | **0.020** | 0.061 | 0.057 | 0.032 | 0.057 | 0.084 |

## Condition accuracy

| Condition | DeepSeek | Luna none | qwen-max | qwen-plus | 3.7-flash | 3.5-lite | Terra | Muse | Grok | Sol |
|---|---|---|---|---|---|---|---|---|---|---|
| clean | 0.882 | 0.941 | 0.941 | 0.941 | **1.000** | **1.000** | 0.857 | **1.000** | 0.929 | 0.889 |
| single_poison | 0.941 | 0.941 | 0.941 | 0.941 | **1.000** | **1.000** | 0.929 | 0.929 | 0.929 | 0.889 |
| ranked_poison | 0.882 | 0.941 | 0.941 | 0.941 | **1.000** | **1.000** | 0.923 | 0.923 | **1.000** | 0.875 |
| manufactured_consensus | 0.706 | 0.941 | 0.941 | 0.941 | 0.941 | 0.824 | 0.923 | **1.000** | 0.769 | 0.875 |
| legitimate_update | 0.938 | 0.938 | 1.000 | 0.938 | **1.000** | 0.938 | 0.923 | 0.833 | 0.923 | 0.875 |
| false_majority_true_primary | 0.500 | 0.875 | 0.625 | 0.688 | 0.813 | 0.750 | 0.846 | **0.923** | 0.692 | 0.750 |

## EAS leaderboard

1. **gemini-3.7-flash — 0.984** (CI 0.945–1.000)
2. qwen3.7-max — 0.951
3. Luna `none` — 0.941
4. Terra — 0.923 / Muse (standard) — 0.923 (tied, both n=80)
5. qwen3.7-plus — 0.920
6. Sol — 0.909 (n=50)
7. gemini-3.5-flash-lite — 0.905
8. Grok 4.6 — 0.866 (n=80)
9. Luna `low` — 0.857
10. DeepSeek — 0.850

## Cost (per 100 runs, normalized)

| Model | Total | Mean/run | In/run | Out/run | Tool calls/run |
|---|---|---|---|---|---|
| gemini-3.5-flash-lite | $0.32 | $0.0032 | 15.3k | 0.7k | 2.8 |
| Luna `low` | $0.38 | $0.0038 | 22.6k | 1.0k | 8.9 |
| DeepSeek | $0.55 | $0.0055 | 35.7k | 1.6k | 8.1 |
| Luna `none` | $0.77 | $0.0077 | 34.4k | 0.7k | 7.1 |
| gemini-3.7-flash | $1.08 | $0.0108 | 24.8k | 0.9k | 4.7 |
| qwen3.7-plus | $2.73 | $0.0273 | 60.5k | 2.0k | 8.9 |
| Muse Spark 1.2 (standard*) | $2.83 | $0.0283 | 17.1k | 1.6k | 4.7 |
| Grok 4.6 | $3.21 | $0.0321 | 13.7k | 0.8k | 4.4 |
| Terra | $3.49 | $0.0349 | 22.5k | 0.5k | 5.3 |
| Sol | $6.69 | $0.0669 | 19.9k | 1.1k | **11.7** |
| qwen3.7-max | $7.59 | $0.0759 | 26.9k | 1.1k | 4.9 |

\* Muse pilot ran on the contributor tier ($0.09 total, $0.0012/run — training opt-in, not
representative of list pricing); the standard-tier figure is computed from the same
actual token usage at $1.25/$4.25 per M.

## Reads

- **The only condition that stratifies the field is `false_majority_true_primary`**
  (majority wrong, primary recoverable): DeepSeek 0.500 → qwen-max 0.625 →
  qwen-plus 0.688 → 3.5-lite 0.750 → 3.7-flash 0.813 → Terra 0.846 → Luna none
  0.875 → **Muse 0.923**. It is where arbitration quality is measured.
- **Corruption resistance (FBAR) has three perfect models**: Luna (both configs),
  Terra, and Muse — none ever flipped a correct prior. Gemini 3.7 (0.031) and
  qwen-plus (0.031) are next; DeepSeek (0.158) is the outlier.
- **Best retrieval/arbitration combo**: Muse — SER 1.000, PSR 0.987, PRR 0.058
  (lowest disown rate in the field). At **standard** pricing it is mid-pack value
  (EAS 0.923 at $2.83/100 — cheaper than Terra/qwen-max but pricier than the
  better-scoring Luna `none` and 3.7-flash); its contributor-tier economics
  ($0.12/100, training opt-in) are a benchmark-only curiosity, not a real-world
  price.
- **gemini-3.7-flash is the accuracy leader** (EAS 0.984, best calibration) but is
  ~9× the cost of Muse; it's the model to beat on the sealed test split.
- **Grok 4.6 is the biggest miss in the field**: near-top retrieval (SER 0.981,
  PSR 0.988) but second-worst corruption resistance (FBAR 0.125, behind only
  DeepSeek) and second-worst PCR (0.231), cratering exactly where arbitration is
  measured (`manufactured_consensus` 0.769, `false_majority` 0.692 — second-worst
  on the stratifying condition). EAS 0.866 at $3.21/100 is poor value.
- **Sol is the most agentic model**: 11.7 tool calls/run (the field runs 4–9) at
  $0.067/run — the second-priciest pilot. FBAR 0.000 (perfect corruption
  resistance) but a high PRR 0.281 (finds the primary, then disowns it) and the
  field's worst ICS (−0.006). EAS 0.909: solid, not elite — the flagship price
  buys research stamina, not better arbitration.
- **Cost-performance king**: no single model owns it at list pricing. 3.7-flash
  is cheapest *and* best at the top (EAS 0.984, $1.08/100); Luna `none` is the
  value pick just below it (0.941, $0.77/100); DeepSeek remains the cheapest
  usable floor (0.850, $0.55/100).
- **Thinking upgrades were a wash or worse**: Luna `low` (0.941→0.857) hurt;
  Gemini and Muse are forced to their floors (`none` rejected) so there is no
  zero-thinking variant to compare. Terra at `none` underperforms its cheaper
  sibling Luna `none` — flagship pricing buys no arbitration advantage here.
- **Retrieval thinness is Luna's trait**: SER 0.806 / PSR 0.790 at `none` — the
  price of its perfect FBAR. Reasoning (`low`) fixed retrieval (0.940/0.840) but
  broke arbitration, making it the worst-value Luna config.

## Cross-model deep dives

Full tables + matrices + figures: `cross_model_report.md` and `exports/`
(`fig_pairwise_diff.png`, `fig_agreement_auc.png`). Because every pilot shares the
same plan seed, pairwise tests below are **paired** on the shared episode set
(common n=34, limited by the n=50 Sol plan and per-pilot rejects) — far stronger
than the independent CIs above, though n=34 keeps them directional.

- **The leaderboard is partly illusory.** Paired bootstrap on the 34 common
  episodes: gemini-3.7-flash is **only** significantly better than qwen-max,
  Terra, Luna-`low`, qwen-plus, Grok, Sol, and DeepSeek (their CIs exclude 0).
  It is **not** significantly better than 3.5-flash-lite, Muse, or Luna `none`.
  Those four sit in one statistically indistinguishable top cluster. Everyone
  else except Sol beats DeepSeek significantly. So "3.7-flash #1" is a full-set
  point estimate; on head-to-head data the top of the field is a tie.
- **`syn_008` is the universal hard world.** Cross-model failure concentrates on
  one synthetic claim across conditions — `false_majority` 1/11 models correct,
  `single_poison` 2/11, `ranked_poison` 3/11, `legitimate_update` 4/11. 23 of the
  34 shared episodes are all-models-correct and **zero** are all-models-wrong.
  `syn_008` is the benchmark's key differentiator and should be featured in the
  sealed test split.
- **Failure taxonomy**: **rescue** (prior wrong → final right) varies hugely —
  Luna `none` 51, qwen-max 45, 3.7-flash 49, but Muse 38 and Sol only 29 (Sol is
  the least stable: just 14 correct-and-stable of 50). **Corruption** is rare
  everywhere except DeepSeek (6) and Grok (3); Luna (`none`/`low`), Terra, Muse,
  and 3.7-flash corrupt ≤1. On `false_majority` specifically DeepSeek corrupts
  5/9 while Luna/Terra/Muse/Sol corrupt 0.
- **Calibration/discrimination**: **Terra has the best confidence AUC (0.963)** —
  its confidence best separates right from wrong despite a mid EAS; Sol 0.944,
  Muse 0.940, 3.5-lite 0.931. Weakest: qwen-plus 0.732, Grok 0.743. Grok and
  qwen-plus pair low AUC with high mean confidence — the field's most
  overconfident-but-mis-calibrated pair. 3.7-flash keeps the best ECE (0.020).

## Status / caveats

- **n=80 for Terra, Muse, and Grok; n=50 for Sol** (partial plans); CIs reflect that.
- **gemini-3.1-pro**: ~62/100 done, stalled by the 250-requests/day free-tier
  quota on that model (each episode ~6+ requests); resume-safe, will finish over
  2–3 quota windows. Runs with thinking `low`.
- **DeepSeek V4 Pro**: in progress (100-run pilot, thinking disabled via the
  v4-native `thinking.type` field after the legacy `enable_thinking` flag was
  found to be ignored by v4 models).
- All pilots share the frozen dev worlds, prompts, and plan seed; only the model
  and provider route differ. Serving route is not neutral (see the OpenRouter
  vs ModelScope qwen3.7-max artifact) — treat per-model numbers as
  route-specific.
