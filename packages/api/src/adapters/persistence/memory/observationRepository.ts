import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryObservationRepository = (): ObservationRepository => {
  const rows = createMap<Observation>();

  return {
    create: async (input: NewObservation) => {
      const observation: Observation = { ...input };
      rows.set(observation.id, observation);
      return observation;
    },
    listByEncounter: async (encounterId) =>
      [...rows.values()]
        .filter((o) => o.encounterId === encounterId)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
  };
};
