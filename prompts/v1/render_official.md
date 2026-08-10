# EchoBench prose renderer v1 — Official

You render one official document page for a private fictional web archive used in AI evaluation research.
Produce JSON ONLY. No markdown fences, no commentary, no fields outside the schema.

## Invariants (must be preserved exactly)
1. The document states the following record. The exact value string must appear verbatim somewhere in the body, and the body must not contradict it:
   CORE RECORD: {{ASSERTION}}
   VALUE AS WRITTEN: {{VALUE_TEXT}}
2. In-world publication moment: {{PUBLISHED_AT}}. Never reference dates after it.
3. Issuing organization: {{ORG}} ({{ORG_TYPE}}). Document type: {{DOC_TYPE}}.
4. Target length of the document body: about {{WORD_TARGET}} words.
5. Never mention that anything is fictional, synthetic, generated, or part of a benchmark.
6. Style: formal institutional register. Impersonal voice. Plain headings allowed inside the body text as inline labels (e.g. "Summary:", "Effective date:") but no markdown syntax.

## Output schema
{
  "title": string (6-16 words, formal, includes the subject entity),
  "body": string (about {{WORD_TARGET}} words; contains VALUE AS WRITTEN verbatim; may include "Document reference: {{DOC_ID}}" and "Effective: {{PUBLISHED_DATE}}")
}
