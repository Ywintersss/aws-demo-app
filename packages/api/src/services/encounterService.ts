import type { CreateEncounterInput, Encounter, PatchEncounterInput } from '@aethelgard/shared';
import { NotFoundError } from '../domain/errors.js';
import { resolveEncounterTransition } from '../domain/encounter.js';
import type { EncounterRepository } from '../ports/index.js';

export type EncounterServiceDeps = {
  encounters: EncounterRepository;
  now: () => string;
  newId: () => string;
};

export const createEncounterService = (deps: EncounterServiceDeps) => ({
  create: async (patientId: string, input: CreateEncounterInput, branchId: string): Promise<Encounter> =>
    deps.encounters.create({
      id: deps.newId(),
      patientId,
      branchId,
      type: input.type,
      department: input.department,
      admittedAt: input.admittedAt ?? deps.now(),
      status: input.status,
    }),

  get: async (id: string): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id);
    if (encounter === null) throw new NotFoundError('encounter', id);
    return encounter;
  },

  listByPatient: async (patientId: string): Promise<Encounter[]> => deps.encounters.listByPatient(patientId),

  update: async (id: string, patch: PatchEncounterInput): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id);
    if (encounter === null) throw new NotFoundError('encounter', id);
    const transition = resolveEncounterTransition(encounter, patch, deps.now());
    const updated = await deps.encounters.update(id, transition);
    if (updated === null) throw new NotFoundError('encounter', id);
    return updated;
  },
});

export type EncounterService = ReturnType<typeof createEncounterService>;
