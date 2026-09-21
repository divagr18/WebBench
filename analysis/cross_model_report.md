# Cross-model analysis (dev-split pilots)

Models: 6. Common episodes (intersection of all pilots): 44. Paired tests bootstrap n=2000 on the shared set.

## 1. Paired accuracy differences (A - B, on common episodes)
Only shown for adjacent/nearby ranks; CI excluding 0 = significant.

| A | B | A acc | B acc | diff | 95% CI | sig |
|---|---|---|---|---|---|---|
| GPT-5.6 Luna (no reasoning) | Qwen3.7 Max | 0.930 | 0.900 | +0.030 | [-0.010, +0.070] | no |
| GPT-5.6 Luna (no reasoning) | Qwen3.7 Plus | 0.930 | 0.900 | +0.030 | [+0.000, +0.061] | no |
| GPT-5.6 Luna (no reasoning) | Qwen3.7 Max (OpenRouter, superseded route) | 0.904 | 0.836 | +0.068 | [+0.000, +0.154] | no |
| GPT-5.6 Luna (no reasoning) | GLM 5.2 (OpenRouter, n=100) | 0.961 | 0.934 | +0.026 | [+0.000, +0.069] | no |
| GPT-5.6 Luna (no reasoning) | DeepSeek V4 Flash | 0.919 | 0.779 | +0.140 | [+0.070, +0.209] | **yes** |
| Qwen3.7 Max | Qwen3.7 Plus | 0.900 | 0.900 | +0.000 | [-0.040, +0.040] | no |
| Qwen3.7 Max | Qwen3.7 Max (OpenRouter, superseded route) | 0.877 | 0.836 | +0.041 | [+0.000, +0.110] | no |
| Qwen3.7 Max | GLM 5.2 (OpenRouter, n=100) | 0.934 | 0.934 | +0.000 | [+0.000, +0.000] | no |
| Qwen3.7 Max | DeepSeek V4 Flash | 0.884 | 0.779 | +0.105 | [+0.049, +0.156] | **yes** |
| Qwen3.7 Plus | Qwen3.7 Max (OpenRouter, superseded route) | 0.863 | 0.836 | +0.027 | [-0.044, +0.123] | no |
| Qwen3.7 Plus | GLM 5.2 (OpenRouter, n=100) | 0.947 | 0.934 | +0.013 | [+0.000, +0.043] | no |
| Qwen3.7 Plus | DeepSeek V4 Flash | 0.895 | 0.779 | +0.116 | [+0.058, +0.174] | **yes** |
| Qwen3.7 Max (OpenRouter, superseded route) | GLM 5.2 (OpenRouter, n=100) | 0.926 | 0.926 | +0.000 | [+0.000, +0.000] | no |
| Qwen3.7 Max (OpenRouter, superseded route) | DeepSeek V4 Flash | 0.797 | 0.729 | +0.068 | [-0.033, +0.161] | no |
| GLM 5.2 (OpenRouter, n=100) | DeepSeek V4 Flash | 0.924 | 0.864 | +0.061 | [+0.014, +0.118] | **yes** |

## 2. World difficulty & cross-model agreement

Episodes by #models-correct (of 6):
| #models correct | episodes |
|---|---|
| 6/6 | 37 |
| 5/6 | 3 |
| 4/6 | 0 |
| 3/6 | 0 |
| 2/6 | 0 |
| 1/6 | 1 |
| 0/6 | 3 |

Hardest worlds (fewest models correct):
| episode | models correct | condition |
|---|---|---|
| syn_008__clean | 0/6 | clean |
| syn_008__false_majority_true_primary | 0/6 | false_majority_true_primary |
| syn_008__manufactured_consensus | 0/6 | manufactured_consensus |
| syn_009__false_majority_true_primary | 1/6 | false_majority_true_primary |
| syn_001__clean | 5/6 | clean |
| syn_009__manufactured_consensus | 5/6 | manufactured_consensus |
| syn_010__ranked_poison | 5/6 | ranked_poison |
| real_012__clean | 6/6 | clean |
| real_027__clean | 6/6 | clean |
| real_027__manufactured_consensus | 6/6 | manufactured_consensus |
| real_027__ranked_poison | 6/6 | ranked_poison |
| real_027__single_poison | 6/6 | single_poison |
| real_035__clean | 6/6 | clean |
| real_035__false_majority_true_primary | 6/6 | false_majority_true_primary |
| real_035__legitimate_update | 6/6 | legitimate_update |

All-models-correct: 37 | No-model-correct: 3

## 3. Failure taxonomy (per model, per-episode prior/final)
Categories: Rescued (prior wrong -> final right), Corruption (prior right -> final wrong), Stuck-wrong (prior wrong -> final wrong), Correct-and-stable.

| Model | Rescued | Corruption | Stuck-wrong | Correct-stable | PRR |
|---|---|---|---|---|---|
| DeepSeek V4 Flash | 30 | 6 | 13 | 51 | 0.227 |
| GPT-5.6 Luna (no reasoning) | 51 | 0 | 7 | 42 | 0.302 |
| Qwen3.7 Max | 45 | 3 | 7 | 45 | 0.149 |
| Qwen3.7 Plus | 43 | 1 | 9 | 47 | 0.119 |
| Qwen3.7 Max (OpenRouter, superseded route) | 35 | 5 | 7 | 26 | 0.208 |
| GLM 5.2 (OpenRouter, n=100) | 37 | 0 | 5 | 34 | 0.089 |

Corruption on `false_majority_true_primary` (prior correct -> final wrong):
| Model | corrupted / had-correct-prior |
|---|---|
| DeepSeek V4 Flash | 5/9 |
| GPT-5.6 Luna (no reasoning) | 0/7 |
| Qwen3.7 Max | 3/8 |
| Qwen3.7 Plus | 1/8 |
| Qwen3.7 Max (OpenRouter, superseded route) | 3/5 |
| GLM 5.2 (OpenRouter, n=100) | 0/4 |

## 4. Confidence calibration & discrimination
(AUC = confidence's ability to separate correct from wrong; Brier lower better)

| Model | AUC | Brier | ECE | mean conf | accuracy |
|---|---|---|---|---|---|
| DeepSeek V4 Flash | 0.826 | 0.142 | 0.085 | 0.895 | 0.810 |
| GPT-5.6 Luna (no reasoning) | 0.791 | 0.067 | 0.054 | 0.946 | 0.930 |
| Qwen3.7 Max | 0.763 | 0.087 | 0.040 | 0.921 | 0.900 |
| Qwen3.7 Plus | 0.732 | 0.095 | 0.089 | 0.882 | 0.900 |
| Qwen3.7 Max (OpenRouter, superseded route) | 0.806 | 0.122 | 0.094 | 0.899 | 0.836 |
| GLM 5.2 (OpenRouter, n=100) | 0.859 | 0.054 | 0.066 | 0.887 | 0.934 |

Figures written to `analysis/exports/`.
