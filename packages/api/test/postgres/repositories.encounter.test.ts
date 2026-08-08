import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterEach(async () => {
  await db.query('TRUNCATE encounters, patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresEncounterRepository', () => {
  it('creates an encounter for a patient and lists it back', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000010', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const created = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'outpatient',
      department: 'General', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    expect(await encounters.findById(created.id)).toEqual(created);
    expect(await encounters.listByPatient(patient.id)).toEqual([created]);
  });

  it('patches status and dischargedAt', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000011', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const created = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'inpatient',
      department: 'Cardiology', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    const updated = await encounters.update(created.id, { status: 'discharged', dischargedAt: '2026-08-08T00:00:00.000Z' });
    expect(updated?.status).toBe('discharged');
    expect(updated?.dischargedAt).toBe('2026-08-08T00:00:00.000Z');
  });
});
