# EchoBench run report

- runSetId: `pilot-dev-v1`
- split: `dev`
- model: `deepseek-chat`
- createdAt: 2026-08-10T20:04:23.564Z
- runs: 100 total, 100 completed, 0 failed, 0 rejected

## Headline metrics

| Metric | Value | Numerator | Denominator |
|---|---|---|---|
| FBAR (lower better) | 0.1111 | 4 | 36 |
| CUR (higher better) | 0.7143 | 5 | 7 |
| PCR (lower better) | 0.2941 | 5 | 17 |
| SER | 1.0000 | 67 | 67 |
| PSR | 1.0000 | 100 | 100 |
| CI | 0.6645 | 412 | 620 |
| TUA | 0.8750 | 14 | 16 |
| **EAS** | 0.7921 | - | - |
| ICS (paired conf diff) | 0.1018 | - | 17 pairs |

## Accuracy by condition

| Condition | Correct | Total | Accuracy |
|---|---|---|---|
| clean | 16 | 17 | 0.9412 |
| single_poison | 17 | 17 | 1.0000 |
| ranked_poison | 17 | 17 | 1.0000 |
| manufactured_consensus | 13 | 17 | 0.7647 |
| legitimate_update | 14 | 16 | 0.8750 |
| false_majority_true_primary | 10 | 16 | 0.6250 |

## Calibration

Brier: 0.0910, ECE: 0.0610 (n=100)

## Cost

Total: $0.3420; mean tokens in/out: 21662.34/1383.96; mean tool calls: 8.72
