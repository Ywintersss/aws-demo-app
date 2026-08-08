import type { CreateObservationInput, ObservationCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

export type ObservationValue = { valueNum: number | null; valueText: string | null; unit: string | null };

const NUMERIC_RANGES: Partial<Record<ObservationCode, { min: number; max: number }>> = {
  heart_rate: { min: 20, max: 300 },
  temperature: { min: 25, max: 45 },
  spo2: { min: 0, max: 100 },
  weight: { min: 0, max: 500 },
};

export const resolveObservationValue = (input: CreateObservationInput): ObservationValue => {
  const range = NUMERIC_RANGES[input.code];
  if (input.valueNum !== undefined && range !== undefined) {
    if (input.valueNum < range.min || input.valueNum > range.max) {
      throw new ValidationError(`${input.code} must be between ${range.min} and ${range.max}`, {
        field: 'valueNum',
        received: input.valueNum,
      });
    }
  }
  return {
    valueNum: input.valueNum ?? null,
    valueText: input.valueText ?? null,
    unit: input.unit ?? null,
  };
};
