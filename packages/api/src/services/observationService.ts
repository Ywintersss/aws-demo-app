import type { CreateObservationInput, Observation } from '@aethelgard/shared';
import { resolveObservationValue } from '../domain/observation.js';
import type { ObservationRepository } from '../ports/index.js';

export type ObservationServiceDeps = {
  observations: ObservationRepository;
  now: () => string;
  newId: () => string;
};

export const createObservationService = (deps: ObservationServiceDeps) => ({
  create: async (
    encounterId: string,
    input: CreateObservationInput,
    recordedBy: string,
  ): Promise<Observation> => {
    const value = resolveObservationValue(input);
    return deps.observations.create({
      id: deps.newId(),
      encounterId,
      code: input.code,
      valueNum: value.valueNum,
      valueText: value.valueText,
      unit: value.unit,
      recordedAt: input.recordedAt ?? deps.now(),
      recordedBy,
    });
  },

  listByEncounter: async (encounterId: string): Promise<Observation[]> =>
    deps.observations.listByEncounter(encounterId),
});

export type ObservationService = ReturnType<typeof createObservationService>;
