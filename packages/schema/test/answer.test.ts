import { describe, expect, it } from 'vitest';
import {
  AnswerSpecSchema,
  NumericSpecSchema,
  answerMatchesSpec,
  numericWithinTolerance,
} from '../src/answer.js';

describe('answer spec', () => {
  it('accepts all four spec kinds', () => {
    expect(AnswerSpecSchema.parse({ kind: 'boolean' }).kind).toBe('boolean');
    expect(AnswerSpecSchema.parse({ kind: 'enum', options: ['a', 'b'] }).kind).toBe('enum');
    expect(AnswerSpecSchema.parse({ kind: 'string', aliases: ['X'] }).kind).toBe('string');
    const num = AnswerSpecSchema.parse({ kind: 'numeric', value: 10, toleranceAbs: 1 });
    expect(num.kind).toBe('numeric');
  });

  it('rejects enum with <2 options', () => {
    expect(() => AnswerSpecSchema.parse({ kind: 'enum', options: ['only'] })).toThrow();
  });

  it('rejects string spec with empty aliases', () => {
    expect(() => AnswerSpecSchema.parse({ kind: 'string', aliases: [] })).toThrow();
  });

  it('rejects unknown spec kind', () => {
    expect(() => AnswerSpecSchema.parse({ kind: 'complex' })).toThrow();
  });

  it('rejects negative tolerances', () => {
    expect(() => NumericSpecSchema.parse({ kind: 'numeric', value: 1, toleranceAbs: -1 })).toThrow();
  });

  it('matches enum answers against options', () => {
    const spec = AnswerSpecSchema.parse({ kind: 'enum', options: ['left', 'right'] });
    expect(answerMatchesSpec(spec, { kind: 'enum', value: 'left' })).toBe(true);
    expect(answerMatchesSpec(spec, { kind: 'enum', value: 'center' })).toBe(false);
    expect(answerMatchesSpec(spec, { kind: 'boolean', value: true })).toBe(false);
  });

  it('numeric tolerance uses max of abs and rel', () => {
    const spec = NumericSpecSchema.parse({ kind: 'numeric', value: 100, toleranceAbs: 2, toleranceRel: 0.05 });
    expect(numericWithinTolerance(spec, 105)).toBe(true); // rel allows +5
    expect(numericWithinTolerance(spec, 105.1)).toBe(false);
    expect(numericWithinTolerance(spec, 98)).toBe(true);
  });

  it('numeric zero tolerance is exact', () => {
    const spec = NumericSpecSchema.parse({ kind: 'numeric', value: 7 });
    expect(numericWithinTolerance(spec, 7)).toBe(true);
    expect(numericWithinTolerance(spec, 7.5)).toBe(false);
  });
});
