import type { Encounter } from '@aethelgard/shared';
import type { EncounterPatch, EncounterRepository, NewEncounter } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryEncounterRepository = (): EncounterRepository => {
  const rows = createMap<Encounter>();

  return {
    create: async (input: NewEncounter) => {
      const encounter: Encounter = { ...input, dischargedAt: null };
      rows.set(encounter.id, encounter);
      return encounter;
    },
    findById: async (id) => rows.get(id) ?? null,
    listByPatient: async (patientId) =>
      [...rows.values()]
        .filter((e) => e.patientId === patientId)
        .sort((a, b) => a.admittedAt.localeCompare(b.admittedAt)),
    update: async (id, patch: EncounterPatch) => {
      const found = rows.get(id);
      if (found === undefined) return null;
      const updated: Encounter = {
        ...found,
        department: patch.department ?? found.department,
        status: patch.status ?? found.status,
        dischargedAt: patch.dischargedAt !== undefined ? patch.dischargedAt : found.dischargedAt,
      };
      rows.set(id, updated);
      return updated;
    },
  };
};
