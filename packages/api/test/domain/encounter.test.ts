import { describe, expect, it } from 'vitest';
import type { Encounter } from '@aethelgard/shared';
import { ValidationError } from '../../src/domain/errors.js';
import { resolveEncounterTransition } from '../../src/domain/encounter.js';

const NOW = '2026-08-07T12:00:00.000Z';
const openEncounter: Encounter = {
  id: '11111111-1111-4111-8111-111111111111',
  patientId: '22222222-2222-4222-8222-222222222222',
  branchId: '33333333-3333-4333-8333-333333333333',
  type: 'inpatient',
  department: 'Cardiology',
  admittedAt: '2026-08-05T08:00:00.000Z',
  dischargedAt: null,
  status: 'open',
};

describe('resolveEncounterTransition', () => {
  it('passes a department change through unchanged', () => {
    expect(resolveEncounterTransition(openEncounter, { department: 'Neurology' }, NOW)).toEqual({
      department: 'Neurology',
    });
  });

  it('stamps discharge with the current time when none is supplied', () => {
    expect(resolveEncounterTransition(openEncounter, { status: 'discharged' }, NOW)).toEqual({
      status: 'discharged',
      dischargedAt: NOW,
    });
  });

  it('honours an explicit discharge timestamp', () => {
    const dischargedAt = '2026-08-06T10:00:00.000Z';
    expect(
      resolveEncounterTransition(openEncounter, { status: 'discharged', dischargedAt }, NOW),
    ).toEqual({ status: 'discharged', dischargedAt });
  });

  it('rejects a discharge earlier than the admission', () => {
    expect(() =>
      resolveEncounterTransition(
        openEncounter,
        { status: 'discharged', dischargedAt: '2026-08-04T08:00:00.000Z' },
        NOW,
      ),
    ).toThrow(ValidationError);
  });

  it('rejects re-discharging an already-discharged encounter', () => {
    const discharged: Encounter = { ...openEncounter, status: 'discharged', dischargedAt: NOW };
    expect(() => resolveEncounterTransition(discharged, { department: 'ICU' }, NOW)).toThrow(
      ValidationError,
    );
  });
});
