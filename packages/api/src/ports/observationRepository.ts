import type { Observation, ObservationCode } from '@aethelgard/shared';

export type NewObservation = {
  id: string;
  encounterId: string;
  code: ObservationCode;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  recordedAt: string;
  recordedBy: string;
};

export type ObservationRepository = {
  create(input: NewObservation): Promise<Observation>;
  listByEncounter(encounterId: string): Promise<Observation[]>;
};
