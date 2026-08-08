import type {
  Branch, BranchCode, Encounter, EncounterStatus, EncounterType,
  Observation, ObservationCode, Patient, Sex,
} from '@aethelgard/shared';

export type BranchRow = { id: string; code: BranchCode; name: string };
export const toBranch = (row: BranchRow): Branch => ({ id: row.id, code: row.code, name: row.name });

export type PatientRow = {
  id: string; mrn: string; name: string; dob: string; sex: Sex; phone: string;
  branch_id: string; created_at: Date; updated_at: Date; deleted_at: Date | null;
};
export const toPatient = (row: PatientRow): Patient => ({
  id: row.id,
  mrn: row.mrn,
  name: row.name,
  dob: row.dob,
  sex: row.sex,
  phone: row.phone,
  branchId: row.branch_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  deletedAt: row.deleted_at === null ? null : row.deleted_at.toISOString(),
});

export type EncounterRow = {
  id: string; patient_id: string; branch_id: string; type: EncounterType; department: string;
  admitted_at: Date; discharged_at: Date | null; status: EncounterStatus;
};
export const toEncounter = (row: EncounterRow): Encounter => ({
  id: row.id,
  patientId: row.patient_id,
  branchId: row.branch_id,
  type: row.type,
  department: row.department,
  admittedAt: row.admitted_at.toISOString(),
  dischargedAt: row.discharged_at === null ? null : row.discharged_at.toISOString(),
  status: row.status,
});

export type ObservationRow = {
  id: string; encounter_id: string; code: ObservationCode; value_num: number | null;
  value_text: string | null; unit: string | null; recorded_at: Date; recorded_by: string;
};
export const toObservation = (row: ObservationRow): Observation => ({
  id: row.id,
  encounterId: row.encounter_id,
  code: row.code,
  valueNum: row.value_num,
  valueText: row.value_text,
  unit: row.unit,
  recordedAt: row.recorded_at.toISOString(),
  recordedBy: row.recorded_by,
});
