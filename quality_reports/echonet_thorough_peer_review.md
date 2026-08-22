# Thorough peer review: *Consensus Is Not Corroboration*

**Recommendation: Reject / resubmit after major revision.**

## Editorial summary

This is a compelling and clearly written benchmark-design paper. The closed-web setting, hidden provenance graph, matched-world ambition, and emphasis on both gullibility and stubbornness are worthwhile. The present submission, however, does not yet support its comparative leaderboard and cost conclusions. The analysis artifact needed to regenerate the appendix is missing; the visible generation scripts also embed analytical results; one evaluated configuration with the best raw score is excluded from the headline paired analysis without a predeclared eligibility rule; and the available run reports do not identify the source run for every value in `paper_data.json`. These are validity and reproducibility issues, not merely presentation issues.

The benchmark paper could be publishable after a complete, auditable evaluation release. The results paper should not be accepted in its current form.

## Reviewer 1 — methodology and construct validity

### Major concerns

1. **The manipulation does not isolate provenance sensitivity from source-type and stance heuristics.** In manufactured consensus, the two official records are true while the seven non-official pages are false; in clean, all nine pages are true and independent (`paper/main.tex`, lines 191–216). Thus topology changes together with the visible majority, the truth-bearing source class, and the agreement pattern. A model can succeed by privileging official-looking pages, not by recognizing that seven pages share an origin. PCR is based on a model's stated count of independent sources, not a behavioral test proving that it inferred provenance. Add a factorial, counterbalanced design: hold visible source classes and stance counts fixed while varying only copy topology; then independently vary authority styling and majority direction.

2. **The central construct is under-validated.** The paper calls false-majority worlds “the arbitration test,” but does not show that models notice copy relations or use citations as evidence rather than merely choosing the official record. Include process-level tests: ablate links/provenance cues, randomize official styling, compare citation traversal under matched evidence, and show that the behavior predicts performance out of sample.

3. **EAS mixes different, model-dependent populations.** FBAR conditions on a prior-correct poisoned run, while CUR conditions on a wrong-or-abstained prior in legitimate-update worlds (`paper/main.tex`, lines 360–392). The harmonic mean therefore compares models on different subsets determined by their unobserved priors. Report all numerators/denominators in the main table, add unconditional transition rates and a prior-stratified analysis, and avoid treating EAS as a standalone model-quality ranking.

4. **Excluding rejected runs can bias every reported metric.** The protocol says schema-invalid runs are excluded (`paper/main.tex`, lines 304–310), but gives no rejection rate by model, condition, or failure stage. A model that fails on difficult worlds can look better after exclusion. Predefine an intention-to-evaluate score (for example, rejected final judgments count as incorrect/abstain), report both analyses, and release the rejected traces.

5. **Real-claim truth validation is not adequate for the claimed benchmark standard.** The limitation reports machine checks plus one operator's sign-off (`paper/main.tex`, lines 788–790). For a benchmark about source reliability, this needs claim-level source packets, version/as-of metadata, independent adjudication, and an error-correction protocol.

## Reviewer 2 — empirical claims, statistics, and reproducibility

### Major concerns

1. **The paired “top cluster” does not include the raw EAS leader.** The paper reports GLM 5.2 as the raw leader (EAS 1.000) but conducts the paired analysis among ten configurations and declares Gemini 3.7 Flash's three-model top cluster (`paper/main.tex`, lines 487–518). GLM has only 50 completed worlds in `paper/paper_data.json`, but that is not a principled reason to omit it after reporting it as leader. This makes “the leader,” “top cluster,” and the cost frontier ambiguous. State an eligibility rule fixed before inspection; either evaluate every eligible model on the same complete episode set or label partial pilots as non-comparable and remove them from rank claims.

2. **The included analysis is not reproducible end-to-end.** `paper/gen_tables.py` first regenerates three tables but then raises `FileNotFoundError` for the required `paper/cross_field_report.md`. That file is absent. The same script parses pairwise, world-difficulty, and calibration results from that missing report; `paper/gen_figures.py` contains hard-coded taxonomy, AUC, and pairwise values. Release a single versioned analysis program that reads only raw traces/manifests, produces every table and figure, records environment hashes, and fails before writing partial output.

3. **Several displayed values cannot be traced to the shipped reports.** `paper_data.json` labels GPT-5.6 Luna's source run as `pilot-dev-v2-openai-low` and gives EAS 0.857, but the included `reports/dev/pilot-dev-v2-openai/score-report.json` is the nearby Luna report and reports EAS 0.941; there is no matching `-low` report in the workspace. This may reflect a legitimate alternate run, but readers cannot determine so. Add a manifest mapping each plotted value to immutable trace IDs, scorer version, command, and report checksum.

4. **The paired analysis is too weak for the strength of the claims.** The common set is only 34 episodes, and performance is concentrated: the paper states 23 of those are solved by all ten configurations and four hard episodes belong to one synthetic claim (`paper/main.tex`, lines 682–693). A percentile bootstrap over 34 clustered episodes cannot establish a stable field ranking, especially after many pairwise comparisons. Report the actual shared-episode IDs, multiplicity-adjusted intervals or a hierarchical model, effect sizes with uncertainty, and a claim-family sensitivity analysis. Do not infer equality from a confidence interval that includes zero; call it “inconclusive.”

5. **Run completeness is heterogeneous despite “identical dev plan.”** The source says eleven configurations ran an identical plan (`paper/main.tex`, lines 437–439), while the supplied summary contains 100, 80, 77, and 50 completed episodes across configurations. The manuscript needs a flow table per configuration and condition: planned, started, completed, rejected, retried, and scored. Results from incomplete, differently selected subsets should not be mixed in one ordered leaderboard.

6. **Cost comparisons are not controlled experimental comparisons.** The paper acknowledges route-specific protocols, different thinking settings, a contributor tier, a Sol discount, and estimates rather than invoices (`paper/main.tex`, lines 445–481). These choices can be meaningful, but the paper cannot then present a general model-cost Pareto frontier. Version provider price cards and dates, separate observed spend from normalized cost, and frame results as configuration-specific efficiency observations.

### Required replication package before reconsideration

- Immutable public release of worlds, manifests, prompts, all raw traces (including rejected/failed runs), scorer, and locked dependencies.
- One command from a clean checkout that regenerates every number, table, figure, and PDF without manually transcribed or hard-coded results.
- A data dictionary defining every metric, designated-primary assignment, completion rule, and all analysis exclusions.
- A preregistered test evaluation with all configurations completing the same fixed world set and at least the promised three replicates.

## Reviewer 3 — exposition and presentation

### Major concerns

1. **Configuration counts are inconsistent.** The paper alternates between eleven configurations (abstract; setup; the 11-row headline/condition tables) and ten “field configurations” (contribution, results, appendices, conclusion). Define the field set once and show exclusions in every caption.

2. **The paper overstates what non-significance means.** “Statistically indistinguishable” and “stand level” should become “the current pilot does not resolve the difference.” This matters acutely with the 34-episode common set.

3. **Several causal phrases exceed the evidence.** Examples include “accounts for most of the observed separation” and “the arbitration test.” They should be narrowed to descriptive statements until the ablations above establish the mechanism.

4. **The final PDF needs a layout pass.** The rendered PDF has conspicuous red/green hyperlink boxes around cross-references and URLs, and page 17 contains a small table surrounded by most of a blank page. The Tectonic logs also report repeated underfull vboxes (including badness 10000). Use unobtrusive link coloring or hidden borders and place/resize appendix floats to avoid the orphan page.

### Strengths

- The motivation is accessible and the paper distinguishes resistance to bad evidence from willingness to update on good evidence.
- The protocol and metric table are unusually clear for a systems-style paper.
- The limitations section candidly acknowledges several important threats, which offers a good foundation for a revised version.

## Decision and prioritized revision plan

**Decision: reject in the present results-paper form; encourage resubmission.**

1. Repair and release the reproducibility path before changing prose.
2. Re-run a balanced, fully completed, preregistered evaluation and include GLM under the same eligibility rule or remove its leaderboard placement.
3. Add counterbalanced provenance/authority/stance ablations and revise the construct claim to what those experiments actually identify.
4. Recompute uncertainty and multiplicity-aware comparisons from released traces.
5. Only then rewrite the abstract, conclusion, leaderboard, and cost claims; make the final visual cleanup after the regenerated PDF is stable.
