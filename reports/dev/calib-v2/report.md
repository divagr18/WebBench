# EchoBench run report

- runSetId: `calib-v2`
- split: `dev`
- model: `deepseek-chat`
- createdAt: 2026-08-11T04:55:57.564Z
- runs: 30 total, 30 completed, 0 failed, 0 rejected

## Headline metrics

| Metric | Value | Numerator | Denominator |
|---|---|---|---|
| FBAR (lower better) | 0.1250 | 1 | 8 |
| CUR (higher better) | 1.0000 | 3 | 3 |
| PCR (lower better) | 0.0000 | 0 | 5 |
| SER | 1.0000 | 20 | 20 |
| PSR | 1.0000 | 30 | 30 |
| CI | 0.6154 | 96 | 156 |
| TUA | 1.0000 | 5 | 5 |
| **EAS** | 0.9333 | - | - |
| ICS (paired conf diff) | 0.1200 | - | 5 pairs |

## Accuracy by condition

| Condition | Correct | Total | Accuracy |
|---|---|---|---|
| clean | 5 | 5 | 1.0000 |
| single_poison | 5 | 5 | 1.0000 |
| ranked_poison | 4 | 5 | 0.8000 |
| manufactured_consensus | 5 | 5 | 1.0000 |
| legitimate_update | 5 | 5 | 1.0000 |
| false_majority_true_primary | 2 | 5 | 0.4000 |

## Calibration

Brier: 0.1015, ECE: 0.0453 (n=30)

## Cost

Total: $0.1661; mean tokens in/out: 36263.96666666667/1641.8333333333333; mean tool calls: 8.13
