import { describe, expect, it } from 'vitest';
import { createMemoryEncounterRepository } from '../../../src/adapters/persistence/memory/encounterRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

describe('createMemoryEncounterRepository', () => {
  it('creates an encounter and lists it by patient', async () => {
    const repo = createMemoryEncounterRepository();
    const patientId = crypto.randomUUID();
    const created = await repo.create({
      id: crypto.randomUUID(),
      patientId,
      branchId: BRANCH_IDS.KL,
      type: 'outpatient',
      department: 'General',
      admittedAt: '2026-08-07T00:00:00.000Z',
      status: 'open',
    });
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.listByPatient(patientId)).toEqual([created]);
  });

  it('applies a patch and returns null for an unknown id', async () => {
    const repo = createMemoryEncounterRepository();
    const created = await repo.create({
      id: crypto.randomUUID(),
      patientId: crypto.randomUUID(),
      branchId: BRANCH_IDS.KL,
      type: 'inpatient',
      department: 'Cardiology',
      admittedAt: '2026-08-07T00:00:00.000Z',
      status: 'open',
    });
    const patched = await repo.update(created.id, { status: 'discharged', dischargedAt: '2026-08-08T00:00:00.000Z' });
    expect(patched?.status).toBe('discharged');
    expect(await repo.update('missing', { department: 'X' })).toBeNull();
  });
});
