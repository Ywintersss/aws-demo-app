import { describe, expect, it } from 'vitest';
import { createMemoryBranchRepository } from '../../../src/adapters/persistence/memory/branchRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

describe('createMemoryBranchRepository', () => {
  it('lists the three seeded branches ordered by code', async () => {
    const repo = createMemoryBranchRepository();
    const branches = await repo.listAll();
    expect(branches.map((b) => b.code)).toEqual(['JB', 'KL', 'PG']);
  });

  it('finds a branch by id and by code', async () => {
    const repo = createMemoryBranchRepository();
    expect((await repo.findById(BRANCH_IDS.KL))?.code).toBe('KL');
    expect((await repo.findByCode('PG'))?.id).toBe(BRANCH_IDS.PG);
  });

  it('returns null for an unknown id', async () => {
    const repo = createMemoryBranchRepository();
    expect(await repo.findById('does-not-exist')).toBeNull();
  });
});
