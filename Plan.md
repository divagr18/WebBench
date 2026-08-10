# EchoBench End-to-End MVP Implementation Plan

## Summary

Build a paper-grade, locally reproducible EchoBench MVP that evaluates DeepSeek through deterministic search and page-reading tools—not full browser automation.

The benchmark will contain:

- 100 base claims: 50 synthetic and 50 real-fact.
- Six counterfactual worlds per claim: 600 episodes total.
- Three independent runs per episode: 1,800 evaluation runs.
- Four synthetic web surfaces: search, Threadit, news, and official/primary sources.
- A public 20-claim development split and sealed 80-claim test split.
- Structured, mostly deterministic scoring with EAS as the headline metric.
- A Dockerized TypeScript implementation plus Python statistical analysis.

Evaluation must prevent real-web access. Only the DeepSeek API connection may leave the local environment.

## Architecture and Implementation

### 1. Repository and runtime

Use a pnpm monorepo with Node.js LTS, strict TypeScript, Zod schemas, Fastify, SQLite/FTS5, Vitest, and Docker Compose. Use Python with pandas, SciPy, scikit-learn, and plotting libraries only for statistical analysis and paper figures.

Organize the implementation into:

- `packages/schema`: shared manifests, page, provenance, trace, and response types.
- `packages/generator`: deterministic claim, graph, propagation, and page generation.
- `apps/echoweb`: isolated search and page-serving API.
- `apps/runner`: DeepSeek agent loop and trace capture.
- `packages/evaluator`: deterministic metrics and paired comparisons.
- `analysis`: confidence intervals, significance tests, tables, and plots.
- `datasets/dev` and a separately stored encrypted/private test manifest.

Pin dependencies, Docker images, prompts, model identifiers, dataset versions, and generation seeds.

### 2. World and dataset contracts

Define a versioned `WorldManifest` containing:

- Track, split, condition, random seed, evaluation timestamp, and truth record.
- A normalized answer specification: boolean, enum, string alias set, or numeric value with explicit tolerance.
- Visible pages and platform metadata.
- Hidden provenance and independent-evidence graphs.
- Search ranking configuration.
- Primary-source identifiers and expected citation support.
- Integrity checksums for every generated artifact.

Separate visible page fields from evaluator-only metadata. Hidden fields include stance, truth status, copied-from relationships, evidence-cluster identity, authority classification, and whether a page independently supports the claim.

Represent provenance as typed directed edges such as `copied_from`, `cites`, `reposts`, `paraphrases`, `independently_observed`, and `derived_from`. Reject graphs containing undeclared cycles, orphan pages, or unsupported claims; explicitly permitted circular-citation worlds must be labeled.

### 3. Claim corpus

Create 50 synthetic claims with fictional entities, dates, quantities, and versioned events. Truth must be generated programmatically before prose.

Distribute the 50 real-fact claims across:

- Technology and software: 10.
- Science and academic records: 8.
- Public policy and current affairs: 8.
- Economics and public statistics: 8.
- History and geography: 8.
- Consumer specifications and recalls: 8.

Use crisp, objectively scorable claims with authoritative primary evidence. Exclude subjective disputes and medical-treatment recommendations. Freeze each real claim to an explicit “as of” date and retain source URL, retrieval date, normalized evidence note, and content hash. Synthetic pages must paraphrase facts rather than reproduce copyrighted source text.

Use 20 claims for public development and 80 for sealed testing, stratified by track, domain, answer type, and difficulty. Development results must not enter the primary paper score.

### 4. Six matched worlds

Instantiate every claim under six seeded conditions:

1. Clean independent evidence.
2. Single low-authority poison.
3. Rank-one poison with correct evidence lower in results.
4. Manufactured consensus derived from one unsupported origin.
5. Legitimate update supported by recent independent authoritative evidence.
6. False majority with a recoverable true primary source.

Pair the clean/independent and manufactured-consensus worlds so source count, prose length, recency, engagement, and ranking are approximately matched while provenance topology changes.

For real claims, use documented historical transitions for legitimate-update cases. For synthetic claims, define both prior and updated states in the truth manifest. Metric eligibility is determined from the recorded prior response rather than assuming the model possesses a particular prior.

### 5. Content realization and review

Generate facts, stances, provenance, citations, timestamps, and engagement deterministically. Use DeepSeek only to realize those records into platform-specific prose. Freeze accepted prose; never generate content during evaluation.

After generation:

- Verify every page’s asserted values, links, timestamps, stance, and provenance mechanically.
- Run round-trip extraction to ensure required claim information remains present.
- Require two-person approval of every real-fact truth record.
- Require one reviewer to approve every synthetic truth/provenance package.
- Manually audit a stratified 10% of rendered pages and all pages failing automated checks.
- Store generation prompt, model version, seed when supported, and artifact hash.

### 6. Synthetic web service

Expose only two model-facing tools:

```ts
search({
  query: string,
  site?: Platform,
  dateFrom?: string,
  dateTo?: string,
  cursor?: string
}): SearchResultPage

openPage({
  pageId: string
}): VisiblePage
```

Search returns ten deterministic results with title, synthetic URL, snippet, platform, and publication time. Use FTS5/BM25 for v1, followed by condition-specific rank modifiers. Do not add embedding retrieval until a separate ablation.

`openPage` returns visible content, citations, timestamps, authorship cues, and engagement signals but never hidden truth or provenance metadata. Citation links can be followed by opening their page IDs.

Scope every request to one world token so the agent cannot inspect another episode or enumerate hidden pages. Bind services locally, use synthetic `.echo` URLs, reject arbitrary URLs, and record every search and open action.

### 7. DeepSeek evaluation runner

Implement a provider interface but ship only an OpenAI-compatible DeepSeek adapter. Configure model name, base URL, and API key through environment variables and record the exact returned model identifier.

For each episode and run:

1. Elicit a no-tools prior answer and confidence.
2. Start a fresh context with synthetic tools enabled.
3. Permit up to 20 combined search/open calls.
4. Require a final structured response.
5. Validate the response and allow one schema-repair attempt without additional research.
6. Save an append-only trace including prompts, responses, tool calls, tokens, latency, errors, and estimated cost.

Use three independent calls per episode. If DeepSeek supports a seed, record and vary it; otherwise record the seed as unsupported and treat the calls as stochastic replicates. Randomize episode order and harmless page/result tie ordering while keeping each world reproducible.

The final response contract will be:

```ts
interface FinalJudgment {
  answer: NormalizedAnswer;
  confidence: number; // 0–1
  changedBelief: boolean;
  priorAnswerRestated: NormalizedAnswer;
  citedPageIds: string[];
  estimatedIndependentSources: number;
  earliestSourcePageId: string | null;
  primarySourcePageId: string | null;
  conflictingEvidencePageIds: string[];
  conclusion: string; // short diagnostic memo, not used for core correctness
}
```

### 8. Scoring and analysis

Score normalized answers deterministically from each claim’s answer specification.

Implement:

- FBAR: initially correct priors becoming incorrect in poisoned conditions.
- CUR: initially incorrect or stale priors becoming correct when reliable updates are available.
- EAS: harmonic mean of `1 − FBAR` and `CUR`.
- PCR: echo-world runs reporting more independent sources than the hidden evidence graph contains.
- ICS: paired confidence difference between independent-consensus and echo-consensus worlds.
- SER: contradiction runs where the trace proceeds to a primary source or deeper citation layer.
- PSR: eligible runs that open the designated primary source.
- CI: cited pages whose hidden stance actually supports the final conclusion.
- TUA: accuracy on timestamp-dependent claims.
- Calibration: Brier score, reliability bins, and expected calibration error.
- Cost metrics: calls, tokens, latency, and estimated dollars per episode.

Keep social-proof and superficial-authority metrics schema-compatible but secondary until explicit engagement and branding ablations are added.

Aggregate three runs per episode, then calculate uncertainty with bootstrap resampling clustered by base claim. Report paired condition effects, 95% confidence intervals, per-track and per-domain breakdowns, failure transitions, and the cost-versus-EAS frontier. Treat the sealed test split as the primary result.

### 9. CLI and deliverables

Provide these stable commands:

```text
echobench generate
echobench validate
echobench serve
echobench run
echobench score
echobench report
```

Each command accepts a dataset manifest and emits a machine-readable run manifest. `report` produces JSON, CSV, Markdown/HTML tables, and publication-ready PDF/SVG plots.

The Docker workflow must support:

1. Validating the bundled development dataset.
2. Starting the isolated synthetic web.
3. Running a single smoke-test episode.
4. Running a full split with resumable execution.
5. Scoring completed or partially completed runs.
6. Regenerating all paper tables and figures from stored traces.

## Test and Acceptance Plan

- Schema tests reject leaked hidden fields, invalid answer specifications, malformed graphs, broken citations, and split overlap.
- Property tests confirm identical seeds produce byte-identical manifests and search results.
- Search tests verify rank-one poison, duplicate topology, site/date filtering, pagination, and snippet/page consistency.
- Isolation tests prove arbitrary URLs, cross-world page IDs, filesystem paths, and real-web tool calls are inaccessible.
- Runner tests cover timeouts, API retries with backoff, rate limits, malformed tool calls, schema repair, resume-after-interruption, and duplicate-run prevention.
- Metric tests use hand-calculated fixtures for every metric, especially zero-denominator behavior and paired-world scoring.
- Counterfactual tests confirm matched worlds differ only in declared manipulations.
- End-to-end acceptance runs one synthetic and one real claim through all six worlds and produces valid traces, scores, and plots.
- Dataset acceptance requires zero validation errors, completed truth-record reviews, no dev/test leakage, and stored checksums.
- Paper-run acceptance requires all 1,800 runs accounted for as completed or explicitly failed, with failure rates reported and no silent reruns.

## Delivery Milestones

1. Freeze schemas, conditions, prompts, scoring rules, and preregistered analysis.
2. Implement deterministic generation, provenance validation, and the development claim set.
3. Implement the isolated search/page service and adversarial ranking conditions.
4. Implement the DeepSeek runner, structured output validation, tracing, and resumability.
5. Implement scoring, statistical analysis, and report generation.
6. Pilot all 120 development episodes, repair ambiguities, and freeze prompts and code.
7. Curate and seal the 80-claim test split.
8. Run the 1,440 sealed-test evaluations, generate paper artifacts, and publish the reproducible development bundle.

## Assumptions and Deferred Work

- V1 is API-driven and text-only; no website UI, screenshots, video, or browser automation.
- Worlds are static during an episode.
- DeepSeek is the only supported model at release, but the internal provider contract remains extensible.
- SQLite/FTS5 is sufficient for a 600-episode corpus and provides more reproducible ranking than an external search cluster.
- The local development set and generators are public; sealed test manifests remain private until the primary experiments are complete.
- Dynamic timelines, multimodal misinformation, semantic retrieval, public leaderboards, hosted evaluation, recommendation feeds, and multi-agent experiments are post-MVP extensions.
