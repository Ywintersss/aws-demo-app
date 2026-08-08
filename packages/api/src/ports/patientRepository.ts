import type { Page, Patient, Sex } from '@aethelgard/shared';

export type NewPatient = {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: Sex;
  phone: string;
  branchId: string;
  createdAt: string;
  updatedAt: string;
};

export type PatientPatch = {
  name?: string;
  dob?: string;
  sex?: Sex;
  phone?: string;
  updatedAt: string;
};

export type PatientSearchQuery = { search?: string; page: number; pageSize: number };

export type PatientRepository = {
  create(input: NewPatient): Promise<Patient>;
  findById(id: string): Promise<Patient | null>;
  findByMrn(mrn: string): Promise<Patient | null>;
  search(query: PatientSearchQuery): Promise<Page<Patient>>;
  update(id: string, patch: PatientPatch): Promise<Patient | null>;
  softDelete(id: string, deletedAt: string): Promise<boolean>;
};
