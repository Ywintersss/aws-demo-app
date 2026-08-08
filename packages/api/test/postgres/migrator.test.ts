import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';

let db: Db;

const dropEverything = async (): Promise<void> => {
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
};

beforeEach(async () => {
  db = createDb(inject('dbUrl'));
  await dropEverything();
});

afterEach(async () => {
  await db.close();
});

describe('runMigrations', () => {
  it('creates every table in the data model', async () => {
    await runMigrations(db);
    const result = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(result.rows.map((r) => r.table_name)).toEqual([
      'branches',
      'encounters',
      'observations',
      'patients',
      'schema_migrations',
      'users',
    ]);
  });

  it('reports the versions it applied, in order', async () => {
    expect(await runMigrations(db)).toEqual(['001_init', '002_reference_data']);
  });

  it('is a no-op the second time', async () => {
    await runMigrations(db);
    expect(await runMigrations(db)).toEqual([]);
  });

  it('does not duplicate reference data on a re-run', async () => {
    await runMigrations(db);
    await runMigrations(db);
    const result = await db.query<{ total: number }>('SELECT count(*)::bigint AS total FROM branches');
    expect(result.rows[0]?.total).toBe(3);
  });

  it('seeds the three campuses with their fixed identifiers', async () => {
    await runMigrations(db);
    const result = await db.query<{ id: string; code: string }>('SELECT id, code FROM branches ORDER BY code');
    expect(result.rows).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', code: 'JB' },
      { id: '11111111-1111-4111-8111-111111111111', code: 'KL' },
      { id: '22222222-2222-4222-8222-222222222222', code: 'PG' },
    ]);
  });

  it('enforces the one-value rule on observations at the database level', async () => {
    await runMigrations(db);
    await expect(
      db.query(
        `INSERT INTO observations (id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by)
         VALUES ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555',
                 'heart_rate', 72, '72', 'bpm', now(), '66666666-6666-4666-8666-666666666666')`,
      ),
    ).rejects.toThrow();
  });
});
