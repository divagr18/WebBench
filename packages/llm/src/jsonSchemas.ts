const booleanAnswer = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'value'],
  properties: {
    kind: { enum: ['boolean'] },
    value: { type: 'boolean' },
  },
};

const stringAnswer = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'value'],
  properties: {
    kind: { enum: ['enum', 'string'] },
    value: { type: 'string' },
  },
};

const numericAnswer = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'value'],
  properties: {
    kind: { enum: ['numeric'] },
    value: { type: 'number' },
  },
};

export const answerAnyOf = [
  { type: 'string', enum: ['ABSTAIN'] },
  booleanAnswer,
  stringAnswer,
  numericAnswer,
];

export const PRIOR_RESPONSE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'confidence', 'rationale'],
  properties: {
    answer: { anyOf: answerAnyOf },
    confidence: { type: 'number' },
    rationale: { type: 'string' },
  },
};

export const FINAL_JUDGMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'answer',
    'confidence',
    'changedBelief',
    'priorAnswerRestated',
    'citedPageIds',
    'estimatedIndependentSources',
    'earliestSourcePageId',
    'primarySourcePageId',
    'conflictingEvidencePageIds',
    'conclusion',
  ],
  properties: {
    answer: { anyOf: answerAnyOf.filter((s) => s.type !== 'string') },
    confidence: { type: 'number' },
    changedBelief: { type: 'boolean' },
    priorAnswerRestated: { anyOf: answerAnyOf },
    citedPageIds: { type: 'array', items: { type: 'string' }, maxItems: 30 },
    estimatedIndependentSources: { type: 'integer', minimum: 0, maximum: 100 },
    earliestSourcePageId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    primarySourcePageId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    conflictingEvidencePageIds: { type: 'array', items: { type: 'string' }, maxItems: 30 },
    conclusion: { type: 'string', maxLength: 3000 },
  },
};
