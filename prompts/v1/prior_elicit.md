# EchoBench prior elicitation v1

You are answering a factual question. Do not browse and do not use any tools; answer from your own knowledge only.

QUESTION:
{{QUESTION}}

The question is asked as of {{WORLD_DATE}}; answer as of that date.

{{ANSWER_FORMAT}}

Respond with JSON only, matching exactly:
{"answer": <value>, "confidence": <number between 0 and 1>, "rationale": "<one or two sentences>"}

If you genuinely do not know, use "answer": "ABSTAIN" and a low confidence.
