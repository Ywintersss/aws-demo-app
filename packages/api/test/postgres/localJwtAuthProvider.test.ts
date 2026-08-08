import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createLocalJwtAuthProvider } from '../../src/adapters/auth/localJwt/localJwtAuthProvider.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';
const JWT_SECRET = 'test-only-secret-not-for-prod';

const insertUser = async (overrides: Record<string, unknown> = {}) => {
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, branch_id, display_name) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, 'doctor.kl@aethelgard.demo', passwordHash, 'doctor', KL, 'Dr Lim (Kuala Lumpur)'],
  );
  return id;
};

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterEach(async () => {
  await db.query('TRUNCATE users CASCADE');
});

afterAll(async () => {
  await db.close();
});

describe('createLocalJwtAuthProvider', () => {
  it('logs in with correct credentials and returns a verifiable token', async () => {
    const userId = await insertUser();
    const provider = createLocalJwtAuthProvider(db, JWT_SECRET);
    const result = await provider.login('doctor.kl@aethelgard.demo', 'demo1234');
    expect(result?.principal.userId).toBe(userId);
    expect(result?.principal.role).toBe('doctor');
    expect(result?.principal.branchId).toBe(KL);
    const verified = await provider.verify(result!.token);
    expect(verified).toEqual(result?.principal);
  });

  it('returns null for a wrong password or an unknown email', async () => {
    await insertUser();
    const provider = createLocalJwtAuthProvider(db, JWT_SECRET);
    expect(await provider.login('doctor.kl@aethelgard.demo', 'wrong-password')).toBeNull();
    expect(await provider.login('nobody@aethelgard.demo', 'demo1234')).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    await insertUser();
    const provider = createLocalJwtAuthProvider(db, JWT_SECRET);
    const otherProvider = createLocalJwtAuthProvider(db, 'a-different-secret');
    const result = await provider.login('doctor.kl@aethelgard.demo', 'demo1234');
    expect(await otherProvider.verify(result!.token)).toBeNull();
  });

  it('rejects a garbage token without throwing', async () => {
    const provider = createLocalJwtAuthProvider(db, JWT_SECRET);
    expect(await provider.verify('not-a-jwt')).toBeNull();
  });

  it('lists demo users with branch code and no password', async () => {
    await insertUser();
    const provider = createLocalJwtAuthProvider(db, JWT_SECRET);
    const demoUsers = await provider.listDemoUsers();
    expect(demoUsers).toEqual([
      { email: 'doctor.kl@aethelgard.demo', role: 'doctor', branchCode: 'KL', displayName: 'Dr Lim (Kuala Lumpur)' },
    ]);
  });
});
