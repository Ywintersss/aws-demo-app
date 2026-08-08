import type { Branch, BranchCode } from '@aethelgard/shared';

export type BranchRepository = {
  listAll(): Promise<Branch[]>;
  findById(id: string): Promise<Branch | null>;
  findByCode(code: BranchCode): Promise<Branch | null>;
};
