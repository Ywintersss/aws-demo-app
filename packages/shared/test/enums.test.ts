import { describe, expect, it } from 'vitest';
import {
  BRANCH_CODES,
  ENCOUNTER_STATUSES,
  ENCOUNTER_TYPES,
  OBSERVATION_CODES,
  ROLES,
  branchCodeSchema,
  encounterStatusSchema,
  encounterTypeSchema,
  observationCodeSchema,
  roleSchema,
  sexSchema,
} from '../src/index.js';

describe('enum tuples', () => {
  it('pins the three Aethelgard branch codes in order', () => {
    expect(BRANCH_CODES).toEqual(['KL', 'PG', 'JB']);
  });

  it('pins the four clinical roles', () => {
    expect(ROLES).toEqual(['doctor', 'nurse', 'records_clerk', 'admin']);
  });

  it('pins the three encounter types', () => {
    expect(ENCOUNTER_TYPES).toEqual(['outpatient', 'inpatient', 'emergency']);
  });

  it('pins the encounter lifecycle statuses', () => {
    expect(ENCOUNTER_STATUSES).toEqual(['open', 'discharged', 'cancelled']);
  });

  it('pins the five observation codes', () => {
    expect(OBSERVATION_CODES).toEqual([
      'heart_rate',
      'blood_pressure',
      'temperature',
      'spo2',
      'weight',
    ]);
  });
});

describe('enum schemas', () => {
  it('accepts a known branch code and rejects an unknown one', () => {
    expect(branchCodeSchema.parse('PG')).toBe('PG');
    expect(branchCodeSchema.safeParse('SG').success).toBe(false);
  });

  it('rejects a role that is not in the matrix', () => {
    expect(roleSchema.parse('records_clerk')).toBe('records_clerk');
    expect(roleSchema.safeParse('pharmacist').success).toBe(false);
  });

  it('treats unknown sex as a valid recorded value', () => {
    expect(sexSchema.parse('unknown')).toBe('unknown');
    expect(sexSchema.safeParse('').success).toBe(false);
  });

  it('rejects an observation code outside the demo vocabulary', () => {
    expect(observationCodeSchema.parse('spo2')).toBe('spo2');
    expect(observationCodeSchema.safeParse('glucose').success).toBe(false);
  });

  it('rejects an encounter type outside the three admission routes', () => {
    expect(encounterTypeSchema.parse('emergency')).toBe('emergency');
    expect(encounterTypeSchema.safeParse('daycare').success).toBe(false);
  });

  it('rejects an encounter status outside the lifecycle', () => {
    expect(encounterStatusSchema.parse('discharged')).toBe('discharged');
    expect(encounterStatusSchema.safeParse('archived').success).toBe(false);
  });
});
