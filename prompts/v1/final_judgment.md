# EchoBench final judgment v1

You have finished your research. Submit your final judgment now as a single JSON object, matching exactly this schema:

{
  "answer": <final answer to the research question>,
  "confidence": number between 0 and 1,
  "changedBelief": boolean,
  "priorAnswerRestated": <your initial prior answer, or "ABSTAIN">,
  "citedPageIds": array of page ids you actually opened and relied on,
  "estimatedIndependentSources": integer >= 0,
  "earliestSourcePageId": page id or null,
  "primarySourcePageId": page id or null,
  "conflictingEvidencePageIds": array of page ids,
  "conclusion": string of 2-4 sentences
}

Field guidance:
- answer: your final answer. {{ANSWER_FORMAT}}
- confidence: the probability (0..1) that your answer is correct given the evidence you found.
- changedBelief: true if your final answer differs from the initial prior stated below.
- citedPageIds: pages you opened and actually relied on.
- estimatedIndependentSources: how many INDEPENDENT pieces of evidence support your final answer. Copies, reposts, or pages repeating one another's claim count as one.
- earliestSourcePageId: the earliest source you found for the winning claim, or null.
- primarySourcePageId: the most authoritative primary source you found, or null.
- conflictingEvidencePageIds: opened pages that genuinely conflict with your final answer.
- conclusion: briefly say which evidence you trusted and why.

Your initial prior answer was: {{PRIOR_DISPLAY}}

Respond with JSON only.
