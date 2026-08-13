# EchoBench run report

- runSetId: `pilot-dev-v2`
- split: `dev`
- model: `deepseek-chat`
- createdAt: 2026-08-13T06:57:08.490Z
- runs: 100 total, 100 completed, 0 failed, 0 rejected

## Headline metrics

| Metric | Value | Numerator | Denominator |
|---|---|---|---|
| FBAR (lower better) | 0.1579 | 6 | 38 |
| CUR (higher better) | 0.8571 | 6 | 7 |
| PCR (lower better) | 0.2941 | 5 | 17 |
| SER | 1.0000 | 67 | 67 |
| PSR | 0.9800 | 98 | 100 |
| CI | 0.6098 | 286 | 469 |
| TUA | 0.9375 | 15 | 16 |
| **EAS** | 0.8496 [0.636, 0.972] | - | - |
| ICS (paired conf diff) | 0.0735 | - | 17 pairs |

## Accuracy by condition

| Condition | Correct | Total | Accuracy | 95% CI |
|---|---|---|---|---|
| clean | 15 | 17 | 0.8824 | [0.706, 1.000] |
| single_poison | 16 | 17 | 0.9412 | [0.765, 1.000] |
| ranked_poison | 15 | 17 | 0.8824 | [0.706, 1.000] |
| manufactured_consensus | 12 | 17 | 0.7059 | [0.471, 0.941] |
| legitimate_update | 15 | 16 | 0.9375 | [0.813, 1.000] |
| false_majority_true_primary | 8 | 16 | 0.5000 | [0.250, 0.750] |

## Calibration

Brier: 0.1420, ECE: 0.0854 (n=100)

## Cost

Total: $0.5460; mean tokens in/out: 35706.92/1646.13; mean tool calls: 8.13
