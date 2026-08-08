import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';
import { createPostgresObservationRepository } from '../../src/adapters/persistence/postgres/observationRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, branch_id, display_name)
     VALUES ('77777777-7777-4777-8777-777777777777', 'seed@aethelgard.demo', 'x', 'doctor', $1, 'Seed User')
     ON CONFLICT (id) DO NOTHING`,
    [KL],
  );
});

afterEach(async () => {
  await db.query('TRUNCATE observations, encounters, patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresObservationRepository', () => {
  it('creates and lists observations for an encounter, oldest first', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000020', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const encounter = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'outpatient',
      department: 'General', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    const observations = createPostgresObservationRepository(db);
    const first = await observations.create({
      id: crypto.randomUUID(), encounterId: encounter.id, code: 'heart_rate', valueNum: 72,
      valueText: null, unit: 'bpm', recordedAt: '2026-08-07T00:00:00.000Z',
      recordedBy: '77777777-7777-4777-8777-777777777777',
    });
    expect(await observations.listByEncounter(encounter.id)).toEqual([first]);
  });
});
