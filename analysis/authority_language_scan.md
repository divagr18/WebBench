# Authority-cue vs. provenance-cue language scan (pilot, GLM 5.2 only)

**SCOPE: single-model (GLM 5.2), n<=50 completed runs, canonical dev run set `dev-glm52-gmicloud-pinned-low-20260821`. This is an exploratory proof-of-concept, not a field-wide finding — raw trace text is only locally available for this one model right now. Do not cite this as validating or refuting the arbitration construct for the field.**

Scanned 50 completed runs' `finalJudgment.conclusion` text for authority-cue terms (official/officially, authoritative, verified, government, registry) vs. provenance-cue terms (same source, copied, reposted, one origin, shared origin, echo(ed), duplicate(d/s), independent source/report/corroborate, same claim/post/thread, traces back).

| Condition | n | mean authority-cue hits | mean provenance-cue hits | mean auth. hits (correct) | mean auth. hits (incorrect) | mean prov. hits (correct) | mean prov. hits (incorrect) |
|---|---|---|---|---|---|---|---|
| clean | 9 | 1.67 | 0.33 | 1.88 | 0.00 | 0.25 | 1.00 |
| false_majority_true_primary | 8 | 1.88 | 0.12 | 2.20 | 1.33 | 0.00 | 0.33 |
| legitimate_update | 8 | 2.62 | 0.38 | 2.62 | nan | 0.38 | nan |
| manufactured_consensus | 8 | 2.25 | 0.62 | 2.57 | 0.00 | 0.57 | 1.00 |
| ranked_poison | 8 | 1.38 | 0.25 | 1.57 | 0.00 | 0.14 | 1.00 |
| single_poison | 9 | 1.33 | 0.22 | 1.38 | 1.00 | 0.25 | 0.00 |

Interpretation caveat: a raw keyword count is a weak proxy for *why* the model reached its conclusion -- it does not distinguish citing provenance as the reason for a decision from mentioning it in passing. Treat as a discussion-section pointer toward what a real process-level validation (independent human coding of reasoning traces) would need to check, not as that validation itself.
