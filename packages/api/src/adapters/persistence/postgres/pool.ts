import pg from 'pg';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { ConflictError } from '../../../domain/errors.js';
import './types.js';

const { Pool: PgPool } = pg;
const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;

export type Db = {
  query<R extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
  close(): Promise<void>;
  pool: Pool;
};

const UNENCRYPTED_HOSTS = new Set(['localhost', 'postgres']);

/**
 * RDS enforces `rds.force_ssl` and rejects unencrypted connections outright
 * — there is no `pg_hba.conf` entry to relax, so the client must offer TLS.
 * `rejectUnauthorized: false` accepts RDS's AWS-managed certificate without
 * requiring the RDS CA bundle to be vendored into the image; it still
 * encrypts the connection, it just doesn't verify the chain.
 *
 * Local Postgres (direct `localhost`, or the `postgres` Compose service
 * hostname) never speaks TLS, so `ssl` must stay `undefined` there or the
 * client hangs on a TLS handshake the server never sends.
 *
 * `databaseUrl` (not a separate host field) is the only thing `createDb`
 * ever receives — `config/env.ts` collapses `DATABASE_URL` and the split
 * `DB_HOST`/... vars into one connection string before this module ever
 * sees it — so the host is read back out of that string here.
 */
export const resolveSsl = (databaseUrl: string): { rejectUnauthorized: false } | undefined => {
  let hostname: string;
  try {
    ({ hostname } = new URL(databaseUrl));
  } catch {
    // Malformed connection string: fail toward requiring encryption rather
    // than silently connecting in the clear.
    return { rejectUnauthorized: false };
  }
  return UNENCRYPTED_HOSTS.has(hostname) ? undefined : { rejectUnauthorized: false };
};

/**
 * The only place a database error is interpreted. Everything here is
 * standard `pg` wire-protocol behaviour — nothing checks which managed
 * service produced the connection.
 */
export const createDb = (databaseUrl: string, options: { max?: number } = {}): Db => {
  const pool = new PgPool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
    ssl: resolveSsl(databaseUrl),
  });

  pool.on('error', (error) => {
    console.error('[postgres] idle client error', error);
  });

  return {
    pool,
    query: async <R extends QueryResultRow>(text: string, values: readonly unknown[] = []) => {
      try {
        return await pool.query<R>(text, [...values]);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('A record with the same unique key already exists', {
            constraint: (error as { constraint?: string }).constraint ?? null,
          });
        }
        throw error;
      }
    },
    close: async () => {
      await pool.end();
    },
  };
};
