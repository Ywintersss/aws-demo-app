import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresBranchRepository } from '../../src/adapters/persistence/postgres/branchRepository.js';

let db: Db;

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresBranchRepository', () => {
  it('lists all seeded branches ordered by code', async () => {
    const repo = createPostgresBranchRepository(db);
    expect((await repo.listAll()).map((b) => b.code)).toEqual(['JB', 'KL', 'PG']);
  });

  it('finds by id and by code', async () => {
    const repo = createPostgresBranchRepository(db);
    expect((await repo.findByCode('KL'))?.name).toBe('Aethelgard Kuala Lumpur');
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
