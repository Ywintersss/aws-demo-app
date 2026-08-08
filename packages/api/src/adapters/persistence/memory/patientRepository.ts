import type { Patient } from '@aethelgard/shared';
import { ConflictError } from '../../../domain/errors.js';
import type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryPatientRepository = (): PatientRepository => {
  const rows = createMap<Patient>();

  const isLive = (p: Patient): boolean => p.deletedAt === null;

  return {
    create: async (input: NewPatient) => {
      if ([...rows.values()].some((p) => p.mrn === input.mrn && isLive(p))) {
        throw new ConflictError('A patient with this MRN already exists', { mrn: input.mrn });
      }
      const patient: Patient = { ...input, deletedAt: null };
      rows.set(patient.id, patient);
      return patient;
    },

    findById: async (id) => {
      const found = rows.get(id);
      return found !== undefined && isLive(found) ? found : null;
    },

    findByMrn: async (mrn) => {
      const found = [...rows.values()].find((p) => p.mrn === mrn && isLive(p));
      return found ?? null;
    },

    search: async (query: PatientSearchQuery) => {
      const term = query.search?.trim().toLowerCase();
      const matches = [...rows.values()]
        .filter(isLive)
        .filter((p) => {
          if (term === undefined || term === '') return true;
          return p.name.toLowerCase().includes(term) || p.mrn.toLowerCase() === term;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const start = (query.page - 1) * query.pageSize;
      return {
        items: matches.slice(start, start + query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        total: matches.length,
      };
    },

    update: async (id, patch: PatientPatch) => {
      const found = rows.get(id);
      if (found === undefined || !isLive(found)) return null;
      const updated: Patient = {
        ...found,
        name: patch.name ?? found.name,
        dob: patch.dob ?? found.dob,
        sex: patch.sex ?? found.sex,
        phone: patch.phone ?? found.phone,
        updatedAt: patch.updatedAt,
      };
      rows.set(id, updated);
      return updated;
    },

    softDelete: async (id, deletedAt) => {
      const found = rows.get(id);
      if (found === undefined || !isLive(found)) return false;
      rows.set(id, { ...found, deletedAt, updatedAt: deletedAt });
      return true;
    },
  };
};
