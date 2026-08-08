import type { Encounter, EncounterStatus, PatchEncounterInput } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

export type EncounterTransition = {
  department?: string;
  status?: EncounterStatus;
  dischargedAt?: string | null;
};

export const resolveEncounterTransition = (
  encounter: Encounter,
  patch: PatchEncounterInput,
  now: string,
): EncounterTransition => {
  if (encounter.status === 'discharged' || encounter.status === 'cancelled') {
    throw new ValidationError(`Cannot modify a ${encounter.status} encounter`, {
      field: 'status',
      current: encounter.status,
    });
  }

  const transition: EncounterTransition = {};
  if (patch.department !== undefined) {
    transition.department = patch.department;
  }
  if (patch.status !== undefined) {
    transition.status = patch.status;
    if (patch.status === 'discharged') {
      const dischargedAt = patch.dischargedAt ?? now;
      if (Date.parse(dischargedAt) < Date.parse(encounter.admittedAt)) {
        throw new ValidationError('Discharge cannot precede admission', {
          field: 'dischargedAt',
          admittedAt: encounter.admittedAt,
          received: dischargedAt,
        });
      }
      transition.dischargedAt = dischargedAt;
    }
  }
  return transition;
};
