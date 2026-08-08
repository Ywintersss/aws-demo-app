import { describe, expect, it } from 'vitest';
import { createMemoryPatientRepository } from '../../../src/adapters/persistence/memory/patientRepository.js';
import { ConflictError } from '../../../src/domain/errors.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

const newPatient = (overrides: Partial<Parameters<ReturnType<typeof createMemoryPatientRepository>['create']>[0]> = {}) => ({
  id: crypto.randomUUID(),
  mrn: 'KL-000001',
  name: 'Tan Wei Ming',
  dob: '1990-01-01',
  sex: 'male' as const,
  phone: '+60129876543',
  branchId: BRANCH_IDS.KL,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides,
});

describe('createMemoryPatientRepository', () => {
  it('creates and finds a patient by id and by mrn', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient());
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.findByMrn(created.mrn)).toEqual(created);
  });

  it('rejects a duplicate MRN with ConflictError', async () => {
    const repo = createMemoryPatientRepository();
    await repo.create(newPatient({ mrn: 'KL-000002' }));
    await expect(repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000002' }))).rejects.toThrow(
      ConflictError,
    );
  });

  it('excludes a soft-deleted patient from findById and search', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient({ mrn: 'KL-000003' }));
    await repo.softDelete(created.id, '2026-08-08T00:00:00.000Z');
    expect(await repo.findById(created.id)).toBeNull();
    const page = await repo.search({ page: 1, pageSize: 20 });
    expect(page.items.find((p) => p.id === created.id)).toBeUndefined();
  });

  it('searches by name (case-insensitive substring) and by exact mrn', async () => {
    const repo = createMemoryPatientRepository();
    await repo.create(newPatient({ mrn: 'KL-000004', name: 'Nurul Aisyah' }));
    await repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000005', name: 'Tan Wei Ming' }));
    const byName = await repo.search({ search: 'aisyah', page: 1, pageSize: 20 });
    expect(byName.items).toHaveLength(1);
    const byMrn = await repo.search({ search: 'KL-000005', page: 1, pageSize: 20 });
    expect(byMrn.items).toHaveLength(1);
  });

  it('paginates results and reports the unpaged total', async () => {
    const repo = createMemoryPatientRepository();
    for (let i = 0; i < 5; i += 1) {
      await repo.create(newPatient({ id: crypto.randomUUID(), mrn: `KL-00001${i}`, name: `Patient ${i}` }));
    }
    const page = await repo.search({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('updates mutable fields and stamps updatedAt', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient({ mrn: 'KL-000020' }));
    const updated = await repo.update(created.id, { phone: '+60111111111', updatedAt: '2026-08-09T00:00:00.000Z' });
    expect(updated?.phone).toBe('+60111111111');
    expect(updated?.updatedAt).toBe('2026-08-09T00:00:00.000Z');
  });

  it('returns null when updating or soft-deleting an unknown id', async () => {
    const repo = createMemoryPatientRepository();
    expect(await repo.update('missing', { name: 'X', updatedAt: '2026-08-09T00:00:00.000Z' })).toBeNull();
    expect(await repo.softDelete('missing', '2026-08-09T00:00:00.000Z')).toBe(false);
  });
});
