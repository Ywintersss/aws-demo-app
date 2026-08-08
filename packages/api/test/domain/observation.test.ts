import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/errors.js';
import { resolveObservationValue } from '../../src/domain/observation.js';

describe('resolveObservationValue', () => {
  it('passes a numeric value with unit through unchanged', () => {
    expect(resolveObservationValue({ code: 'heart_rate', valueNum: 72, unit: 'bpm' })).toEqual({
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
    });
  });

  it('passes a textual value through unchanged', () => {
    expect(resolveObservationValue({ code: 'blood_pressure', valueText: '120/80' })).toEqual({
      valueNum: null,
      valueText: '120/80',
      unit: null,
    });
  });

  it('rejects a heart_rate outside the plausible clinical range', () => {
    expect(() => resolveObservationValue({ code: 'heart_rate', valueNum: 400 })).toThrow(
      ValidationError,
    );
  });

  it('rejects an spo2 above 100', () => {
    expect(() => resolveObservationValue({ code: 'spo2', valueNum: 101 })).toThrow(ValidationError);
  });

  it('accepts a boundary value', () => {
    expect(() => resolveObservationValue({ code: 'spo2', valueNum: 100 })).not.toThrow();
  });
});
