import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { DemoUser, Principal } from '@aethelgard/shared';
import type { AuthProvider, LoginResult } from '../../../ports/index.js';
import type { Db } from '../../persistence/postgres/pool.js';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: Principal['role'];
  branch_id: string;
};

type JwtPayload = { sub: string; email: string; role: Principal['role']; branchId: string };

const TOKEN_TTL = '12h';

const toPrincipal = (row: UserRow): Principal => ({
  userId: row.id,
  email: row.email,
  role: row.role,
  branchId: row.branch_id,
});

export const createLocalJwtAuthProvider = (db: Db, jwtSecret: string): AuthProvider => ({
  login: async (email: string, password: string): Promise<LoginResult | null> => {
    const result = await db.query<UserRow>(
      'SELECT id, email, password_hash, role, branch_id FROM users WHERE email = $1',
      [email],
    );
    const row = result.rows[0];
    if (row === undefined) return null;

    const matches = await bcrypt.compare(password, row.password_hash);
    if (!matches) return null;

    const principal = toPrincipal(row);
    const payload: JwtPayload = {
      sub: principal.userId,
      email: principal.email,
      role: principal.role,
      branchId: principal.branchId,
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: TOKEN_TTL });
    return { principal, token };
  },

  verify: async (token: string): Promise<Principal | null> => {
    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      return { userId: payload.sub, email: payload.email, role: payload.role, branchId: payload.branchId };
    } catch {
      return null;
    }
  },

  listDemoUsers: async (): Promise<DemoUser[]> => {
    const result = await db.query<{ email: string; role: Principal['role']; branch_code: string; display_name: string }>(
      `SELECT u.email, u.role, b.code AS branch_code, u.display_name
       FROM users u JOIN branches b ON u.branch_id = b.id
       ORDER BY u.email ASC`,
    );
    return result.rows.map((row) => ({
      email: row.email,
      role: row.role,
      branchCode: row.branch_code as DemoUser['branchCode'],
      displayName: row.display_name,
    }));
  },
});
