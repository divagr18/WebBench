# EchoBench run report

- runSetId: `glm52-streamlake-openrouter-low-100-20260821`
- split: `dev`
- model: `z-ai/glm-5.2`
- createdAt: 2026-08-21T15:11:52.247Z
- runs: 100 total, 76 completed, 0 failed, 24 rejected

## Headline metrics

| Metric | Value | Numerator | Denominator |
|---|---|---|---|
| FBAR (lower better) | 0.0000 | 0 | 21 |
| CUR (higher better) | 1.0000 | 5 | 5 |
| PCR (lower better) | 0.1818 | 2 | 11 |
| SER | 0.9375 | 45 | 48 |
| PSR | 0.9211 | 70 | 76 |
| PRR (lower better) | 0.0889 | 4 | 45 |
| CI | 0.6585 | 189 | 287 |
| TUA | 1.0000 | 12 | 12 |
| **EAS** | 1.0000 [1.000, 1.000] | - | - |
| ICS (paired conf diff) | 0.0573 | - | 11 pairs |

## Accuracy by condition

| Condition | Correct | Total | Accuracy | 95% CI |
|---|---|---|---|---|
| clean | 15 | 16 | 0.9375 | [0.813, 1.000] |
| single_poison | 14 | 14 | 1.0000 | [1.000, 1.000] |
| ranked_poison | 14 | 14 | 1.0000 | [1.000, 1.000] |
| manufactured_consensus | 10 | 11 | 0.9091 | [0.727, 1.000] |
| legitimate_update | 12 | 12 | 1.0000 | [1.000, 1.000] |
| false_majority_true_primary | 6 | 9 | 0.6667 | [0.444, 1.000] |

## Calibration

Brier: 0.0544, ECE: 0.0655 (n=76)

## Cost

Total: $0.4177; mean tokens in/out: 34954.57894736842/2151.342105263158; mean tool calls: 6.93
