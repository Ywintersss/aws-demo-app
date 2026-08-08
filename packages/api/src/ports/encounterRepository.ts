import type { Encounter, EncounterStatus, EncounterType } from '@aethelgard/shared';

export type NewEncounter = {
  id: string;
  patientId: string;
  branchId: string;
  type: EncounterType;
  department: string;
  admittedAt: string;
  status: EncounterStatus;
};

export type EncounterPatch = {
  department?: string;
  status?: EncounterStatus;
  dischargedAt?: string | null;
};

export type EncounterRepository = {
  create(input: NewEncounter): Promise<Encounter>;
  findById(id: string): Promise<Encounter | null>;
  listByPatient(patientId: string): Promise<Encounter[]>;
  update(id: string, patch: EncounterPatch): Promise<Encounter | null>;
};
