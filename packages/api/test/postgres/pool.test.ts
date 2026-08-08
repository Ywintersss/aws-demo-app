import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ConflictError } from '../../src/domain/errors.js';
import { createDb, isUniqueViolation, type Db } from '../../src/adapters/persistence/postgres/pool.js';

let db: Db;

beforeAll(() => {
  db = createDb(inject('dbUrl'));
});

afterAll(async () => {
  await db.close();
});

describe('createDb', () => {
  it('connects and executes a parameterised query', async () => {
    const result = await db.query<{ answer: number }>('SELECT $1::int AS answer', [42]);
    expect(result.rows[0]?.answer).toBe(42);
  });

  it('returns DATE as a YYYY-MM-DD string regardless of local timezone', async () => {
    const result = await db.query<{ dob: string }>('SELECT $1::date AS dob', ['1985-03-14']);
    expect(result.rows[0]?.dob).toBe('1985-03-14');
  });

  it('returns TIMESTAMPTZ as a Date that round-trips to the same ISO string', async () => {
    const iso = '2026-08-07T10:00:00.000Z';
    const result = await db.query<{ at: Date }>('SELECT $1::timestamptz AS at', [iso]);
    expect(result.rows[0]?.at.toISOString()).toBe(iso);
  });

  it('returns a bigint count as a number', async () => {
    const result = await db.query<{ total: number }>(
      'SELECT count(*)::bigint AS total FROM (SELECT 1) AS one',
    );
    expect(result.rows[0]?.total).toBe(1);
    expect(typeof result.rows[0]?.total).toBe('number');
  });
});

describe('error translation', () => {
  beforeAll(async () => {
    await db.query('CREATE TABLE IF NOT EXISTS pool_test_unique (id INT PRIMARY KEY)');
  });

  afterAll(async () => {
    await db.query('DROP TABLE IF EXISTS pool_test_unique');
  });

  it('translates a unique violation into ConflictError', async () => {
    await db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [1]);
    await expect(db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [1])).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('lets every other database error through unchanged', async () => {
    await expect(
      db.query('SELECT * FROM a_table_that_does_not_exist'),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('recognises a unique violation by SQLSTATE', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
