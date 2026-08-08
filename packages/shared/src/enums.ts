import { z } from 'zod';

export const BRANCH_CODES = ['KL', 'PG', 'JB'] as const;
export const branchCodeSchema = z.enum(BRANCH_CODES);
export type BranchCode = z.infer<typeof branchCodeSchema>;

export const ROLES = ['doctor', 'nurse', 'records_clerk', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const SEXES = ['male', 'female', 'other', 'unknown'] as const;
export const sexSchema = z.enum(SEXES);
export type Sex = z.infer<typeof sexSchema>;

export const ENCOUNTER_TYPES = ['outpatient', 'inpatient', 'emergency'] as const;
export const encounterTypeSchema = z.enum(ENCOUNTER_TYPES);
export type EncounterType = z.infer<typeof encounterTypeSchema>;

export const ENCOUNTER_STATUSES = ['open', 'discharged', 'cancelled'] as const;
export const encounterStatusSchema = z.enum(ENCOUNTER_STATUSES);
export type EncounterStatus = z.infer<typeof encounterStatusSchema>;

export const OBSERVATION_CODES = [
  'heart_rate',
  'blood_pressure',
  'temperature',
  'spo2',
  'weight',
] as const;
export const observationCodeSchema = z.enum(OBSERVATION_CODES);
export type ObservationCode = z.infer<typeof observationCodeSchema>;
