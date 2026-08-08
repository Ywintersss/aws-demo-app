import type { Branch, BranchCode } from '@aethelgard/shared';
import type { BranchRepository } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toBranch, type BranchRow } from './rowMappers.js';

const COLUMNS = 'id, code, name';

export const createPostgresBranchRepository = (db: Db): BranchRepository => ({
  listAll: async (): Promise<Branch[]> => {
    const result = await db.query<BranchRow>(`SELECT ${COLUMNS} FROM branches ORDER BY code ASC`);
    return result.rows.map(toBranch);
  },
  findById: async (id: string): Promise<Branch | null> => {
    const result = await db.query<BranchRow>(`SELECT ${COLUMNS} FROM branches WHERE id = $1`, [id]);
    return result.rows[0] === undefined ? null : toBranch(result.rows[0]);
  },
  findByCode: async (code: BranchCode): Promise<Branch | null> => {
    const result = await db.query<BranchRow>(`SELECT ${COLUMNS} FROM branches WHERE code = $1`, [code]);
    return result.rows[0] === undefined ? null : toBranch(result.rows[0]);
  },
});
