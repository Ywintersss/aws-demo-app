import type { Branch } from '@aethelgard/shared';
import type { BranchRepository } from '../../../ports/index.js';

const SEED_BRANCHES: Branch[] = [
  { id: '11111111-1111-4111-8111-111111111111', code: 'KL', name: 'Aethelgard Kuala Lumpur' },
  { id: '22222222-2222-4222-8222-222222222222', code: 'PG', name: 'Aethelgard Penang' },
  { id: '33333333-3333-4333-8333-333333333333', code: 'JB', name: 'Aethelgard Johor Bahru' },
];

export const createMemoryBranchRepository = (): BranchRepository => ({
  listAll: async () => [...SEED_BRANCHES].sort((a, b) => a.code.localeCompare(b.code)),
  findById: async (id) => SEED_BRANCHES.find((b) => b.id === id) ?? null,
  findByCode: async (code) => SEED_BRANCHES.find((b) => b.code === code) ?? null,
});
