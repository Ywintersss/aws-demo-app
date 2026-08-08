import type { CreatePatientInput, Page, Patient, UpdatePatientInput } from '@aethelgard/shared';
import { assertValidDateOfBirth, generateMrnCandidate } from '../domain/patient.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import type { BranchRepository, PatientRepository, PatientSearchQuery } from '../ports/index.js';

export type PatientServiceDeps = {
  patients: PatientRepository;
  branches: BranchRepository;
  now: () => string;
  newId: () => string;
};

const MAX_MRN_ATTEMPTS = 5;

export const createPatientService = (deps: PatientServiceDeps) => ({
  create: async (input: CreatePatientInput, resolvedBranchId: string): Promise<Patient> => {
    const branch = await deps.branches.findById(input.branchId ?? resolvedBranchId);
    if (branch === null) {
      throw new NotFoundError('branch', input.branchId ?? resolvedBranchId);
    }
    assertValidDateOfBirth(input.dob, new Date(deps.now()));
    const timestamp = deps.now();

    for (let attempt = 0; attempt < MAX_MRN_ATTEMPTS; attempt += 1) {
      try {
        return await deps.patients.create({
          id: deps.newId(),
          mrn: generateMrnCandidate(branch.code),
          name: input.name,
          dob: input.dob,
          sex: input.sex,
          phone: input.phone,
          branchId: branch.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === MAX_MRN_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
    throw new ConflictError('Could not generate a unique MRN after several attempts');
  },

  get: async (id: string): Promise<Patient> => {
    const patient = await deps.patients.findById(id);
    if (patient === null) {
      throw new NotFoundError('patient', id);
    }
    return patient;
  },

  search: async (query: PatientSearchQuery): Promise<Page<Patient>> => deps.patients.search(query),

  update: async (id: string, patch: UpdatePatientInput): Promise<Patient> => {
    if (patch.dob !== undefined) {
      assertValidDateOfBirth(patch.dob, new Date(deps.now()));
    }
    const updated = await deps.patients.update(id, { ...patch, updatedAt: deps.now() });
    if (updated === null) {
      throw new NotFoundError('patient', id);
    }
    return updated;
  },

  remove: async (id: string): Promise<void> => {
    const deleted = await deps.patients.softDelete(id, deps.now());
    if (!deleted) {
      throw new NotFoundError('patient', id);
    }
  },
});

export type PatientService = ReturnType<typeof createPatientService>;
