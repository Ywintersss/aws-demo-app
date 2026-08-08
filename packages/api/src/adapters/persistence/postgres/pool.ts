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

/**
 * The only place a database error is interpreted. Everything here is
 * standard `pg` wire-protocol behaviour — nothing checks which managed
 * service produced the connection.
 */
export const createDb = (databaseUrl: string, options: { max?: number } = {}): Db => {
  const pool = new PgPool({ connectionString: databaseUrl, max: options.max ?? 10 });

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
