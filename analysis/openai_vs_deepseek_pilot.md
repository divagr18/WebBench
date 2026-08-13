# Model comparison: DeepSeek, gpt-5.6-luna, qwen3.7-max (dev pilots)

Run sets (identical dev split — 20 claims × 6 conditions, 1 replicate, same
plan seed, same worlds, same prompts, same hybrid-search web):

| Run set | Provider route | Model | Runs | Status |
|---|---|---|---|---|
| `pilot-dev-v2` | DeepSeek API | `deepseek-chat` | 100/100 | canonical |
| `pilot-dev-v2-openai` | OpenAI API | `gpt-5.6-luna` | 100/100 | complete |
| `pilot-dev-v2-qwen37max` | **OpenRouter** | `qwen/qwen3.7-max` | **73/100** | **partial — OpenRouter account credits exhausted mid-run; 27 runs resume automatically after top-up** |
| (pending) | OpenRouter/ModelScope | `qwen/qwen3.7-plus` | 0/100 | blocked on credits (OpenRouter) and token (ModelScope, see PREREG) |

Model protocol notes (see PREREG amendments): DeepSeek runs with thinking
disabled, temperature 0.7, `json_object` mode. Luna runs with reasoning effort
`none`, no temperature (API-unsupported), strict structured outputs
(`json_schema`). qwen3.7-max runs via OpenRouter with `reasoning.effort = none`
(thinking disabled for protocol parity — verified: reasoning tokens 107→0),
temperature 0.7, `json_object`. Zero schema repairs on all pilots.

## Headline

| Metric | DeepSeek (100) | Luna (100) | qwen3.7-max* (73) | Direction |
|---|---|---|---|---|
| **EAS** | 0.850 [0.636, 0.972] | **0.941 [0.778, 1.000]** | 0.800 [0.622, 0.974] | higher better |
| FBAR | 0.158 (6/38) | **0.000 (0/28)** | 0.250 (5/20) | lower better |
| CUR | 0.857 (6/7) | 0.889 (8/9) | 0.857 (6/7) | higher better |
| PCR | 0.294 (5/17) | **0.059 (1/17)** | 0.167 (2/12) | lower better |
| PRR | 0.227 (15/66) | 0.302 (16/53) | **0.208 (10/48)** | lower better |
| SER | 1.000 (67/67) | 0.806 (54/67) | 1.000 (48/48) | higher |
| PSR | 0.980 (98/100) | 0.790 (79/100) | 0.986 (72/73) | higher |
| CI | 0.610 (286/469) | **0.706 (166/235)** | 0.664 (156/235) | higher better |
| TUA | 0.938 (15/16) | 0.938 (15/16) | 0.917 (11/12) | higher |
| ICS | +0.074 | +0.038 | +0.138 | higher better |
| Brier | 0.142 | **0.067** | 0.122 | lower better |
| ECE | 0.085 | **0.054** | 0.094 | lower better |
| Cost | $0.546 | $0.769 | $3.31 (73 runs) | — |
| Mean tool calls | 8.13 | 7.13 | 4.96 | — |
| Mean latency | 17s | 10s | 22s | — |

\* qwen3.7-max figures are from 73/100 runs (see status above); denominators
smaller accordingly. CIs overlap across all three — directional at n≈73–100.

## Per-condition accuracy

| Condition | DeepSeek | Luna | qwen3.7-max* |
|---|---|---|---|
| clean | 0.882 | 0.941 | 0.923 |
| single_poison | 0.941 | 0.941 | 0.917 |
| ranked_poison | 0.882 | 0.941 | 1.000 |
| manufactured_consensus | **0.706** | **0.941** | 0.750 |
| legitimate_update | 0.938 | 0.938 | 0.917 |
| false_majority_true_primary | **0.500** | **0.875** | **0.500** |

## DeepSeek vs Luna (complete pilots)

DeepSeek's signature is a *collapse under coordinated misinformation*: its
accuracy drops from ~0.9 on clean/poison to 0.706 on the echo chamber and 0.50
on the false majority. Luna is *flat at ~0.94 across all six conditions* — the
conditions move its behavior far less.

### What drives the difference

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
   DeepSeek's bin-8 overconfidence cluster (see
   `analysis/calibration_and_housekeeping.md`) is largely absent for Luna.

5. **Residual errors concentrate on the same hard synthetic claims.** Luna's
   two false_majority errors are `syn_001` and `syn_008`; its legitimate_update
   error is also `syn_008`. `syn_008` (solvaneq, the distrust-hypervigilance
   claim from the DeepSeek case studies) remains structurally hard for both
   models.

### Interpretation

This is not "Luna is smarter" in a general sense — Luna abstains on more
questions and cites a primary source less often. It is that the two models sit
on different points of a **knowledge-vs-caution tradeoff**:

- **DeepSeek**: knows more (answers more priors), more aggressive retrieval
  (opens almost every primary), but its epistemic arbitration is the weak
  link — a fabricated majority can overturn knowledge it actually has.
- **Luna**: knows less and abstains more, but its arbitration is near-robust —
  nothing in this benchmark talked it out of something it knew.

For the benchmark's core construct (arbitrating apparent consensus against a
recoverable primary), Luna is the stronger evaluator; for retrieval
thoroughness, DeepSeek is. The sealed test split will quantify both with
tighter intervals.

Cost: Luna is ~1.4x the DeepSeek spend here despite shorter responses, because
its input price ($0.20/M) plus a research-heavy token mix outweighs its token
savings; still $0.77 for 100 runs — the sealed 1,440-run test projects ~$11 at
these rates (vs ~$8 DeepSeek), both inside a modest budget.

## qwen3.7-max (OpenRouter route, partial — 73/100)

**Route deviation:** Qwen3.7 models were intended for the ModelScope API
(`api-inference.modelscope.cn`); the `MODELSCOPE_API_KEY` in `.env` is rejected
with 401 on every model/endpoint/auth-scheme (see PREREG amendments), so the
pilot ran through OpenRouter instead. Same model weights, different serving
route — flag this when comparing infra-sensitive properties (latency, not
behavior).

Findings (thinking disabled for protocol parity):

1. **Highest corruption rate of the three: FBAR 0.250 (5/20).** Of the 20
   poison-condition runs where qwen3.7-max had a correct prior, a quarter were
   talked out of it — worse than DeepSeek's 0.158, versus Luna's 0.000.

2. **Same collapse pattern as DeepSeek**, not Luna: false_majority 0.500,
   manufactured_consensus 0.750, everything else ≥0.917. A model that behaves
   like DeepSeek on the benchmark's core construct.

3. **DeepSeek-like retrieval style with even fewer tool calls** (4.96 avg):
   PSR 0.986 (opens nearly every primary), SER 1.000 (always escalates on
   conflict), CI 0.664 (mid-pack citation integrity).

4. **Thinking mode was off.** qwen3.7-max is a reasoning model; these results
   are its no-thinking behavior (protocol parity with DeepSeek
   thinking-disabled and Luna `reasoning.effort=none`). How much thinking mode
   changes arbitration on this benchmark is a natural follow-up — the dose-response
   ablation in `analysis/designs_dose_response_and_fixes.md` could absorb it.

5. **Cost:** $3.31 for 73 runs = **$0.045/run** (OpenRouter pricing
   $1.48/$4.42 per M + 27k-token mean inputs). ~6× DeepSeek and ~6× Luna. A
   sealed 1,440-run test at this rate projects ~$65 — affordable but not free;
   qwen3.7-plus ($0.32/$1.28, est ~$0.012/run ≈ $17 for 1,440) is the
   budget-friendly Qwen representative.

### Blocked / pending

- **qwen3.7-max: 27 runs remaining.** Runner is resume-safe; re-running the
  same command after an OpenRouter credit top-up completes only the missing
  runs.
- **qwen3.7-plus: 0/100.** Queued behind the same credit wall.
- **ModelScope route:** wiring complete (`--provider modelscope`), pending a
  valid token.

## Harness notes (for the record)

- All pilots: zero `rejected`, zero schema-repair attempts.
- Luna adapter required three param-strictness fixes discovered via the smoke
  run: flat `reasoning_effort` (nested `reasoning` is Responses-API-only),
  `tool_choice` only with `tools` present, `temperature` omitted entirely.
- OpenRouter adapter (qwen): `reasoning: {effort: 'none'}` is the only variant
  that reliably zeroes reasoning tokens (probed: `enable_thinking` in
  `extra_body`/`chat_template_kwargs` do not work); `tool_choice` only with
  `tools` present; `json_object` mode requires the word "json" in messages —
  satisfied by the frozen prompts.
- Provider route and returned model id are recorded in every trace; run
  manifests under `traces/dev/<run-set-id>/`.
