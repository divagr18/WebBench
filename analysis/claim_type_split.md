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
