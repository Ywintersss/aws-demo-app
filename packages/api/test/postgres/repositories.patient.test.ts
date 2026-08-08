import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterEach(async () => {
  await db.query('TRUNCATE patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

const newPatient = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  mrn: 'KL-000001',
  name: 'Tan Wei Ming',
  dob: '1990-01-01',
  sex: 'male' as const,
  phone: '+60129876543',
  branchId: KL,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides,
});

describe('createPostgresPatientRepository', () => {
  it('creates and reads back a patient with DATE round-tripping exactly', async () => {
    const repo = createPostgresPatientRepository(db);
    const created = await repo.create(newPatient());
    expect(created.dob).toBe('1990-01-01');
    expect(await repo.findById(created.id)).toEqual(created);
  });

  it('rejects a duplicate MRN with ConflictError', async () => {
    const repo = createPostgresPatientRepository(db);
    await repo.create(newPatient({ mrn: 'KL-000002' }));
    await expect(repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000002' }))).rejects.toThrow(
      'A record with the same unique key already exists',
    );
  });

  it('excludes a soft-deleted patient from findById and search', async () => {
    const repo = createPostgresPatientRepository(db);
    const created = await repo.create(newPatient({ mrn: 'KL-000003' }));
    await repo.softDelete(created.id, '2026-08-08T00:00:00.000Z');
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('searches by trigram name match and paginates', async () => {
    const repo = createPostgresPatientRepository(db);
    await repo.create(newPatient({ mrn: 'KL-000004', name: 'Nurul Aisyah' }));
    await repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000005', name: 'Tan Wei Ming' }));
    const result = await repo.search({ search: 'aisyah', page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
