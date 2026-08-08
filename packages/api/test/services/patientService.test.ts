import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import { NotFoundError } from '../../src/domain/errors.js';
import { createPatientService } from '../../src/services/patientService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';

const FIXED_NOW = '2026-08-07T00:00:00.000Z';

const buildService = () =>
  createPatientService({
    patients: createMemoryPatientRepository(),
    branches: createMemoryBranchRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `patient-${(n += 1)}`;
    })(),
  });

describe('patientService.create', () => {
  it('generates a branch-prefixed MRN and stamps timestamps', async () => {
    const service = buildService();
    const patient = await service.create(
      { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
      BRANCH_IDS.KL,
    );
    expect(patient.mrn).toMatch(/^KL-\d{6}$/);
    expect(patient.createdAt).toBe(FIXED_NOW);
    expect(patient.branchId).toBe(BRANCH_IDS.KL);
  });

  it('rejects an unknown branch', async () => {
    const service = buildService();
    await expect(
      service.create(
        { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
        'not-a-branch',
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a future date of birth', async () => {
    const service = buildService();
    await expect(
      service.create(
        { name: 'X', dob: '2099-01-01', sex: 'male', phone: '+60100000000' },
        BRANCH_IDS.KL,
      ),
    ).rejects.toThrow(/future/);
  });
});

describe('patientService.get', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const service = buildService();
    await expect(service.get('missing')).rejects.toThrow(NotFoundError);
  });

  it('returns a created patient', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    expect(await service.get(created.id)).toEqual(created);
  });
});

describe('patientService.update and remove', () => {
  it('updates mutable fields', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    const updated = await service.update(created.id, { phone: '+60111111111' });
    expect(updated.phone).toBe('+60111111111');
  });

  it('soft-deletes a patient so a subsequent get throws NotFoundError', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    await service.remove(created.id);
    await expect(service.get(created.id)).rejects.toThrow(NotFoundError);
  });
});
