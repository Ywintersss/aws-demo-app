import { describe, expect, it } from 'vitest';
import { mrnSchema } from '@aethelgard/shared';
import { ValidationError } from '../../src/domain/errors.js';
import { assertValidDateOfBirth, formatMrn, generateMrnCandidate } from '../../src/domain/patient.js';

describe('formatMrn', () => {
  it('zero-pads the sequence to six digits behind the branch code', () => {
    expect(formatMrn('KL', 123)).toBe('KL-000123');
    expect(formatMrn('JB', 1)).toBe('JB-000001');
  });

  it('produces an MRN the shared schema accepts', () => {
    expect(mrnSchema.safeParse(formatMrn('PG', 999999)).success).toBe(true);
  });

  it('rejects a sequence that will not fit in six digits', () => {
    expect(() => formatMrn('KL', 1_000_000)).toThrow(ValidationError);
  });

  it('rejects a non-positive or fractional sequence', () => {
    expect(() => formatMrn('KL', 0)).toThrow(ValidationError);
    expect(() => formatMrn('KL', 1.5)).toThrow(ValidationError);
  });
});

describe('generateMrnCandidate', () => {
  it('uses the injected sequence source so tests are deterministic', () => {
    expect(generateMrnCandidate('PG', () => 42)).toBe('PG-000042');
  });

  it('produces a schema-valid MRN from the default random source', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(mrnSchema.safeParse(generateMrnCandidate('KL')).success).toBe(true);
    }
  });
});

describe('assertValidDateOfBirth', () => {
  const today = new Date('2026-08-07T00:00:00.000Z');

  it('accepts a date in the past and today', () => {
    expect(() => assertValidDateOfBirth('1985-03-14', today)).not.toThrow();
    expect(() => assertValidDateOfBirth('2026-08-07', today)).not.toThrow();
  });

  it('rejects a date of birth in the future', () => {
    expect(() => assertValidDateOfBirth('2026-08-08', today)).toThrow(ValidationError);
  });

  it('rejects an implausible date before 1900', () => {
    expect(() => assertValidDateOfBirth('1899-12-31', today)).toThrow(ValidationError);
  });

  it('rejects a string that is not a calendar date', () => {
    expect(() => assertValidDateOfBirth('not-a-date', today)).toThrow(ValidationError);
  });
});
