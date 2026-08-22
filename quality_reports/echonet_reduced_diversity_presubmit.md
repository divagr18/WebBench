## Pre-Submit Report: *Consensus Is Not Corroboration: Measuring Epistemic Arbitration on a Synthetic Social Web*

Date: 2026-08-22  
Review mode: **same-model independent review** (two blind Codex cohorts, reciprocal evidence cross-check; no Claude call)  
Recommendation: **Hold for new analysis and archival work**  
Issues: **5 critical, 5 recommended, 3 minor**

### Editor's Note (revision strategy — read first)

The highest-value revision is not a prose rewrite: establish a single, auditable analysis universe. Decide before rerunning which configurations qualify for the comparative leaderboard, run each on the same fixed episodes with the promised replicates, and map every displayed number to released traces and a scorer version. This would simultaneously resolve the raw-leader/top-cluster inconsistency, the false cost frontier, incomplete-run ambiguity, and much of the statistical concern.

The current closed synthetic-web design is a real contribution. The argument becomes substantially stronger if the next evaluation counterbalances source authority, visible stance, citation position, and hidden copy topology. That test can distinguish a model that follows official-looking pages from one that actually responds to evidential independence. It is a new analysis/design addition, not a weakening concession.

The reproducibility and preregistration issues require archival and protocol work, not rhetorical qualification. The paper already helpfully acknowledges single-replicate uncertainty, route dependence, synthetic realism, and estimated costs. Expand those candid limitations, but do not use them as substitutes for trace release, analysis provenance, or a documented full-field amendment trail.

After those changes, update the abstract, conclusion, pairwise language, and cost section together. DOI enrichment, naming consistency, availability/end-matter statements, double-blind preparation, and float cleanup can be completed later in the same revision cycle; they should not delay the core reanalysis.

### Critical Issues (must fix before submission)

1. **[CRITICAL | Mutual, confirmed | Confidence: High] The raw leader is excluded from the inferential comparison.**  
   **Location:** `paper/main.tex:490–518`; `paper/tables/tab_pairwise.tex:2`; `paper/paper_data.json:1038–1078`.  
   **Issue:** GLM 5.2 is reported as raw EAS leader (1.000) but omitted from the ten-configuration paired table, so the Gemini-centred “leader,” top-cluster, and tied-cost claims do not cover the reported raw winner.  
   **Quote:** “GLM 5.2 leads the raw EAS ranking at 1.000” and “All pairwise accuracy differences across the ten field configurations on their 34 shared episodes.”  
   **Fix:** Prespecify eligibility and a common episode set; include every eligible configuration in paired inference, or move GLM to a clearly non-comparative partial-pilot appendix and remove leader/frontier language that treats Gemini as the overall winner.

2. **[CRITICAL | Mutual, confirmed | Confidence: High] The stated cost frontier is numerically inconsistent with the headline table.**  
   **Location:** `paper/main.tex:656–664`; `paper/tables/tab_headline.tex:4–5`; `paper/gen_figures.py:160–165`.  
   **Issue:** GLM (EAS 1.000; $0.007/episode) dominates Gemini 3.7 Flash (0.984; $0.011/episode), yet the text and figure define a two-point frontier containing Gemini 3.7 Flash.  
   **Quote:** “The cost Pareto frontier contains two points: Gemini 3.5 Flash-Lite ($0.003, EAS 0.905) and Gemini 3.7 Flash ($0.011, 0.984). Everything else is dominated.”  
   **Fix:** Apply the same eligibility rule to cost and accuracy, recompute the frontier, and show uncertainty or label it a scenario analysis for a restricted field.

3. **[CRITICAL | Mutual, confirmed | Confidence: High] The shipped analysis cannot reproduce all displayed results.**  
   **Location:** `paper/gen_tables.py:144–230`; `paper/gen_figures.py:160–268`; `paper/main.tex:421–431`.  
   **Issue:** `gen_tables.py` requires the absent `paper/cross_field_report.md`; pairwise, taxonomy, and AUC values are parsed from that missing derivative or hard-coded rather than recomputed from released traces.  
   **Quote:** `MD = open(os.path.join(HERE, "cross_field_report.md"), encoding="utf-8").read()`  
   **Fix:** Publish one locked pipeline that starts from immutable manifests/traces, generates every table/figure/PDF, records dependency versions and seeds, and validates all outputs before writing them.

4. **[CRITICAL | Mutual, confirmed | Confidence: High] Paper-data run identifiers do not resolve to the provided reports.**  
   **Location:** `paper/paper_data.json:122–124,1038–1041`; `reports/dev/pilot-dev-v2-openai/score-report.json:4–21`; `reports/dev/dev-glm52-gmicloud-pinned-low-20260821/score-report.json:4–21`.  
   **Issue:** Luna is labelled `pilot-dev-v2-openai-low` (EAS 0.857) while the supplied nearby report is `pilot-dev-v2-openai` (EAS 0.941); GLM likewise has a nonmatching run-set name. Without a mapping, readers cannot audit plotted inputs.  
   **Quote:** `"runSet": "pilot-dev-v2-openai-low",`  
   **Fix:** Release a machine-readable result manifest mapping each paper value to run-set IDs, trace/index checksums, scorer commit, command, and report.

5. **[CRITICAL | Mutual, confirmed | Confidence: High] The claimed full-field comparison is not covered by the visible preregistration trail.**  
   **Location:** `PREREG.md:8–14,135–171`; `paper/main.tex:437–481`.  
   **Issue:** The preregistration starts DeepSeek-only and its visible amendments cover OpenAI and ModelScope/Qwen, but not all eleven reported configurations or their selection/completion/pairwise rules.  
   **Quote:** “Single provider: DeepSeek only” and “Eleven frontier model configurations were evaluated on the identical dev plan.”  
   **Fix:** Publish dated immutable amendments for each model/protocol and analytic choice; label unregistered expansions explicitly exploratory.

### Recommended Changes (should fix, not blocking)

1. **[RECOMMENDED | Mutual, confirmed | Confidence: High] Separate provenance sensitivity from authority and citation heuristics.** `paper/main.tex:202–212` always makes official records true in the hard conditions. Add counterbalanced source-type/citation/topology worlds before attributing success to provenance reasoning. Quote: “The two official records assert the true value.”

2. **[RECOMMENDED | Cohort A, cross-confirmed | Confidence: High] Report attempted, completed, rejected, failed, and retried runs by model and condition.** Excluding schema-invalid runs can bias accuracy conditional on completion. `paper/main.tex:304–308,551–553`: “runs that fail validation are recorded as rejected and excluded from scoring.” Add an intention-to-evaluate sensitivity analysis.

3. **[RECOMMENDED | Cohort A, cross-confirmed | Confidence: Medium] Treat pairwise tests as exploratory or provide a multiplicity plan.** The many nominal 95% bootstrap intervals over 34 common episodes do not support strong field-ranking language. The paper already calls rankings directional; retain that caution and avoid calling non-significant pairs equal.

4. **[RECOMMENDED | Cohort B, cross-confirmed | Confidence: High] Add a manuscript availability statement.** The README has Zenodo DOI links, so this is not a claim that no archive exists. The paper should name the exact release/version, license, sealed-split governance, trace availability, and figure/table-to-input mapping.

5. **[RECOMMENDED | Cohort B, cross-confirmed | Confidence: High] Use one canonical benchmark name.** The paper uses “EchoNet,” while the README and preregistration use “EchoBench.” State an alias/rename once or standardize it across the manuscript, metadata, preregistration, and archive.

### Minor Issues (nice to have)

- **[MINOR]** Add verified DOI/venue metadata for published references while retaining arXiv links for preprints. The local citation-key check itself passed.
- **[MINOR]** Produce a blind-submission build if targeting a double-blind venue; the author name/email and PDF metadata are currently identifying (`paper/main.tex:27–31`).
- **[MINOR]** Resolve underfull-vbox/float placement warnings and the mostly blank appendix page after substantive revisions; the build otherwise has no undefined-reference error.

### Strengths (what is working well)

- The problem—distinguishing repeated claims from independent corroboration—is important and well motivated.
- The hidden-provenance synthetic web creates an unusually tractable way to score a difficult epistemic behavior.
- Metric definitions, route-specific caveats, and the limitations section are clearer than in many benchmark papers.
- Local checks found all cited bibliography keys present and all referenced figure files available.

### Journal-Readiness Checklist

| Dimension | Status | Notes |
|---|---|---|
| Compiles cleanly | PARTIAL | PDF builds; underfull/float warnings remain. |
| Anonymized for double-blind | FAIL | Named author/email and identifying metadata. |
| Argument & logic | PARTIAL | Core motivation strong; mechanism needs counterbalancing. |
| Internal numerical consistency | FAIL | Leader/frontier and result-provenance issues. |
| References complete | PASS | Local cited-key audit passes. |
| DOIs present | PARTIAL | Add verified canonical metadata where available. |
| Writing quality | PASS | Clear overall; narrow inferential language. |
| Figures/tables correct | FAIL | Cost frontier conflicts with displayed GLM point. |
| Formatting consistent | PARTIAL | Appendix float/link presentation needs polish. |
| Abstract & keywords | PARTIAL | Explain/revise excluded-leader and cluster claims. |
| Word/page count compliant | NA | Target venue unspecified. |
| Replication archive ready | FAIL | Missing analysis input and unmapped run IDs/traces. |
| CONSORT participant flow | NA | Benchmark evaluation, not human-subject trial. |
| ITT & baseline balance reported | NA | Benchmark evaluation, not human-subject trial. |
| Attrition-by-arm reported | NA | Benchmark evaluation, not human-subject trial. |
| Pre-registration deviations disclosed | FAIL | Full-field expansion not visibly documented. |
| Data availability statement | PARTIAL | README has DOIs; manuscript needs formal statement. |
| Ethics/IRB statement | NA | Synthetic benchmark; add brief confirmation if venue expects it. |
| Preregistration disclosure | PARTIAL | Present, but incomplete for field analysis. |
| AI use disclosure | MISSING | Add if required by target venue. |
| COI declaration | MISSING | Add target-venue end matter. |
| Funding/acknowledgments | MISSING | Add target-venue end matter. |

### What Still Needs Your Input

- Target journal/conference and its blind-review, word-count, AI-disclosure, ethics, and end-matter rules.
- Canonical archive release/tag, license, Zenodo version, and access policy for sealed data and raw traces.
- Whether the unmatched Luna/GLM identifiers represent missing artifacts, aliases, or intentionally different runs.
- Whether the eleven-model comparison and its inclusion/exclusion rules have additional dated preregistration amendments not present in this checkout.
