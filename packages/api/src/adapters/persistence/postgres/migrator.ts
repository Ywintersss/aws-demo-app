import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** src/adapters/persistence/postgres → packages/api/migrations */
export const DEFAULT_MIGRATIONS_DIR = path.resolve(HERE, '../../../../migrations');

const ADVISORY_LOCK_KEY = 4_815_162_342;

const ensureBookkeepingTable = async (db: Db): Promise<void> => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
};

const appliedVersions = async (db: Db): Promise<Set<string>> => {
  const result = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(result.rows.map((row) => row.version));
};

const pendingFiles = async (directory: string, applied: Set<string>): Promise<string[]> => {
  const entries = await readdir(directory);
  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .filter((entry) => !applied.has(path.basename(entry, '.sql')));
};

/**
 * Applies every migration file not yet recorded, each in its own
 * transaction, under an advisory lock so concurrent instance boots cannot
 * race. Safe to run on every ECS task start: on an up-to-date database it
 * does nothing and returns [].
 */
export const runMigrations = async (
  db: Db,
  options: { directory?: string; log?: (message: string) => void } = {},
): Promise<string[]> => {
  const directory = options.directory ?? DEFAULT_MIGRATIONS_DIR;
  const log = options.log ?? (() => undefined);

  const client = await db.pool.connect();
  const appliedNow: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await ensureBookkeepingTable(db);

    for (const file of await pendingFiles(directory, await appliedVersions(db))) {
      const version = path.basename(file, '.sql');
      const sql = await readFile(path.join(directory, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${version} failed`, { cause: error });
      }
      appliedNow.push(version);
      log(`[migrator] applied ${version}`);
    }
    if (appliedNow.length === 0) {
      log('[migrator] database is up to date');
    }
    return appliedNow;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
};
