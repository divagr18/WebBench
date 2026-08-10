import type { ClaimRecord } from '@echobench/schema';

export function makeTestClaim(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    claimId: 'syn_001',
    track: 'synthetic',
    domain: 'technology',
    answerType: 'numeric',
    difficulty: 2,
    taskStyle: 'research-question',
    question: 'What is the listed maximum flight range of the Kestrel-9 survey drone as of 2031-05-01?',
    attributeLabel: 'maximum flight range',
    entityName: 'Kestrel-9',
    answerSpec: { kind: 'numeric', value: 142, toleranceAbs: 1, unit: 'km' },
    groundTruth: { kind: 'numeric', value: 142 },
    prior: { value: { kind: 'numeric', value: 110 }, validUntil: '2031-01-15', note: 'original firmware' },
    updated: { asOf: '2031-02-01', note: 'battery upgrade extended range' },
    asOfDate: '2031-05-01',
    poisonValue: { kind: 'numeric', value: 210 },
    phraseGround: 'the Kestrel-9 survey drone has a maximum flight range of 142 km',
    phrasePrior: 'the Kestrel-9 survey drone has a maximum flight range of 110 km',
    phrasePoison: 'the Kestrel-9 survey drone has a maximum flight range of 210 km',
    keywords: ['kestrel-9', 'drone', 'flight range'],
    split: 'dev',
    review: { status: 'approved', reviewers: ['machine'], method: 'auto', timestamp: '2026-01-01T00:00:00Z' },
    ...overrides,
  };
}
