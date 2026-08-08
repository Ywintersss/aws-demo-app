import bcrypt from 'bcryptjs';
import { loadConfig } from '../config/env.js';
import { createDb } from '../adapters/persistence/postgres/pool.js';
import { runMigrations } from '../adapters/persistence/postgres/migrator.js';

const BRANCH_IDS = {
  KL: '11111111-1111-4111-8111-111111111111',
  PG: '22222222-2222-4222-8222-222222222222',
  JB: '33333333-3333-4333-8333-333333333333',
} as const;

const DEMO_USERS = [
  { email: 'admin@aethelgard.demo', role: 'admin', branch: 'KL', displayName: 'Admin (Kuala Lumpur)' },
  { email: 'doctor.kl@aethelgard.demo', role: 'doctor', branch: 'KL', displayName: 'Dr Lim (Kuala Lumpur)' },
  { email: 'nurse.kl@aethelgard.demo', role: 'nurse', branch: 'KL', displayName: 'Nurse Chong (Kuala Lumpur)' },
  { email: 'clerk.pg@aethelgard.demo', role: 'records_clerk', branch: 'PG', displayName: 'Clerk Wong (Penang)' },
  { email: 'doctor.jb@aethelgard.demo', role: 'doctor', branch: 'JB', displayName: 'Dr Raj (Johor Bahru)' },
] as const;

const DEMO_PASSWORD = 'demo1234';

const seed = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb(config.databaseUrl);
  await runMigrations(db, { log: (message) => console.log(message) });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const user of DEMO_USERS) {
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, branch_id, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [crypto.randomUUID(), user.email, passwordHash, user.role, BRANCH_IDS[user.branch], user.displayName],
    );
  }
  console.log(`Seeded ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD} for all).`);

  await db.close();
};

seed().catch((error: unknown) => {
  console.error('seed failed', error);
  process.exit(1);
});
