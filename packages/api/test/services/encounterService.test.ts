import { describe, expect, it } from 'vitest';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createEncounterService } from '../../src/services/encounterService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';

const FIXED_NOW = '2026-08-07T12:00:00.000Z';

const buildService = () =>
  createEncounterService({
    encounters: createMemoryEncounterRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `encounter-${(n += 1)}`;
    })(),
  });

describe('encounterService', () => {
  it('creates an encounter defaulting admittedAt to now', async () => {
    const service = buildService();
    const encounter = await service.create(
      'patient-1',
      { type: 'outpatient', department: 'General', status: 'open' },
      BRANCH_IDS.KL,
    );
    expect(encounter.admittedAt).toBe(FIXED_NOW);
    expect(encounter.patientId).toBe('patient-1');
  });

  it('lists encounters for a patient', async () => {
    const service = buildService();
    await service.create('patient-1', { type: 'outpatient', department: 'General', status: 'open' }, BRANCH_IDS.KL);
    const list = await service.listByPatient('patient-1');
    expect(list).toHaveLength(1);
  });

  it('discharges an open encounter and rejects re-discharging it', async () => {
    const service = buildService();
    const encounter = await service.create(
      'patient-1',
      { type: 'inpatient', department: 'Cardiology', status: 'open' },
      BRANCH_IDS.KL,
    );
    const discharged = await service.update(encounter.id, { status: 'discharged' });
    expect(discharged.status).toBe('discharged');
    await expect(service.update(encounter.id, { department: 'ICU' })).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError updating an unknown encounter', async () => {
    const service = buildService();
    await expect(service.update('missing', { department: 'X' })).rejects.toThrow(NotFoundError);
  });
});
