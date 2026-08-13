# Claim-type split of headline metrics (pilot-dev-v2)

FBAR and CUR pool two structurally different failure modes. Splitting by claim
type (real vs synthetic) separates them cleanly.

Source: dev-split pilot `pilot-dev-v2`, scored with the same `scoreAll` code
path, subset by claim-id prefix (`real_*` vs `syn_*`).

| Metric | ALL (100) | REAL (58) | SYNTHETIC (42) |
|---|---|---|---|
| FBAR (lower better) | 0.158 (6/38) | **0.158 (6/38)** | **n/a (0/0)** |
| CUR (higher better) | 0.857 (6/7) | **n/a (0/0)** | **0.857 (6/7)** |
| EAS | 0.850 | **n/a** | **n/a** |
| PCR (lower better) | 0.294 (5/17) | 0.200 (2/10) | 0.429 (3/7) |
| PSR | 0.980 (98/100) | 0.966 (56/58) | 1.000 (42/42) |
| CI (higher better) | 0.610 (286/469) | 0.714 (180/252) | 0.488 (106/217) |

## Findings

1. **FBAR is entirely a real-claim phenomenon.** All 6 corruptions
   ("got talked out of the truth") involve the model's real-world parametric
   knowledge. Synthetic claims never produce an FBAR event: the model has no
   prior to be talked out of.

2. **CUR is entirely a synthetic-claim phenomenon.** All 7 update successes
   ("correctly updated belief on legitimate change") are synthetic claims where
   the model had no prior and learned the update from the web. Real claims
   contribute nothing to CUR's denominator.

3. **EAS is uncomputable per subgroup.** Its harmonic-mean structure
   (resistance × updating) requires both terms; each subgroup has only one.
   The pooled EAS of 0.850 is therefore a *compound* number describing two
   disjoint behaviors, not a single ability.

4. **CI (citation integrity) diverges sharply**: 0.714 for real vs 0.488 for
   synthetic. The model cites more accurately when it can anchor on its own
   knowledge; on fictional material its citations are nearly coin-flip.

5. **PCR is higher for synthetic (0.429) than real (0.200)** — provenance
   collapse is worse when the model has no prior to check the echo chamber
   against.

## Interpretation

These are two different findings currently reported as one number:

- **"Social pressure corrupts known truth"** — FBAR 0.158, exclusively real:
  a model with correct parametric knowledge can be talked out of it by a
  fabricated majority. This is the headline corruption result.
- **"Model under-trusts / over-trusts legitimate information"** — CUR 0.857,
  exclusively synthetic: when it has no prior, it correctly updates; but its
  evidence quality on fictional ground truth is poor (CI 0.488, PCR 0.429).

Any paper reporting these should present the split, not just the pooled
FBAR/CUR/EAS, because the pooled numbers hide that the corruption signal and
the updating signal come from disjoint halves of the dataset.

## Cross-model generalization (Luna, qwen3.7-max)

The same split computed for the other two pilots (same code path, same
claim-id-prefix subset):

| Run set | REAL FBAR | REAL CUR | SYN FBAR | SYN CUR | SYN abstains |
|---|---|---|---|---|---|
| deepseek-chat (100) | 0.158 (6/38) | n/a (0/0) | n/a (0/0) | 0.857 (6/7) | 37 |
| gpt-5.6-luna (100) | 0.000 (0/28) | 1.000 (1/1) | n/a (0/0) | 0.875 (7/8) | 52 |
| qwen3.7-max* (73) | 0.250 (5/20) | n/a (0/0) | n/a (0/0) | 0.857 (6/7) | 42 |

\* partial pilot, credit wall at 73/100; sample balanced across conditions.

1. **The split is a dataset-structural property, not a DeepSeek artifact.**
   Across all three model families, every FBAR event occurs on a real claim
   (6/6, 5/5) and every CUR eligibility is a synthetic claim with an absent or
   wrong prior (6/7, 7/8). Zero synthetic-claim corruptions anywhere: a model
   cannot be talked out of knowledge it never had.

2. **Exposure does not imply corruption.** Luna had the largest real-claim
   exposure (28 prior-correct poison runs — more than qwen3.7-max's 20) and
   zero corruptions. The *exposure* is dataset-determined; the *corruption* is
   model-determined. This is what makes the FBAR comparison meaningful rather
   than tautological.

3. **Real-claim CUR is effectively unmeasurable.** Luna's single real-claim
   CUR eligibility (1/1) is the only real-claim update opportunity in all
   three pilots combined. The legitimate-update dataset fix for real claims
   (see `analysis/designs_dose_response_and_fixes.md`) is the prerequisite for
   a comparable updating metric on the real half.

4. **Abstention is synthetic-only and model-dependent** (37 / 52 / 42). No
   model abstains on real claims (all real priors answered); synthetic claims
   are fictional-with-future-dates by design, so abstention rates there track
   each model's epistemic caution on unknown entities.
