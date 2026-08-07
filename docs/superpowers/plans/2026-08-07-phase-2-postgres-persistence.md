# Phase 2 — Postgres Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Phase 1 (`docs/superpowers/plans/2026-08-07-phase-1-domain-core.md`) complete and its exit criteria met.

**Goal:** Implement the PostgreSQL adapter for all six repository ports, backed by ordered SQL migrations applied by an idempotent migrator, and prove interchangeability by running Phase 1's contract suites unchanged against Postgres. Ship the development Compose stack and a seed script so the demo has data.

**Architecture:** No ORM — explicit SQL (spec §4) so every query can be reproduced in the report. A single `pg.Pool` is created by a small factory that installs type parsers making `DATE` come back as `YYYY-MM-DD` strings and `bigint` counts as numbers. Row mappers translate `snake_case` columns to the camelCase wire shapes from `@aethelgard/shared`. The migrator records applied versions in `schema_migrations` under a Postgres advisory lock, so concurrent instance boots are safe and re-running is a no-op.

**Tech Stack:** `pg` 8, `@testcontainers/postgresql` (test only), `bcryptjs` (seed only), PostgreSQL 17, Docker Compose, MinIO.

## Global Constraints

Everything in Phase 1's Global Constraints section still applies, plus:

- **No ORM and no query builder.** Parameterised SQL strings only. Never interpolate a value into SQL — every value is a `$n` placeholder.
- **The contract suites from Phase 1 are frozen.** Tasks 5–9 must not edit any file under `packages/api/test/contracts/`. If Postgres cannot satisfy a contract, the *port* was wrong: stop, revise the port, re-run the memory harness, and only then continue.
- **Migrations are append-only and idempotent.** Never edit an applied migration file; add a new one. Every statement uses `IF NOT EXISTS` or `ON CONFLICT DO NOTHING` where the object may already exist.
- **Branch scoping stays in the query.** Every scoped statement carries `AND ($n::uuid IS NULL OR branch_id = $n)`. There is no post-filtering in TypeScript.
- **Soft delete stays in the query.** Every patient read carries `AND deleted_at IS NULL`.
- **Docker must be running** for `npm run test:db`. Testcontainers starts `postgres:17-alpine` once per run.
- **Timestamps are `TIMESTAMPTZ`; the wire format is ISO-8601 with milliseconds.** Mappers call `.toISOString()`; nothing constructs a timestamp string by hand.
- **Postgres error code `23505` (unique violation) becomes `ConflictError`.** Every other database error propagates unchanged — never swallowed, never rewritten into a generic message.

## Documented Deviations From The Spec

1. **`users.display_name` is added** to the `users` table beyond the columns listed in spec §4. `GET /api/auth/demo-users` (spec §5) must return a human-readable label for the login dropdown, and deriving one from an email address in the UI would put presentation logic in the SPA, which spec §9 forbids.
2. **The seed script lives at `packages/api/src/scripts/seed.ts`, not root `scripts/`.** Spec §3 puts seed data under root `scripts/`, but seeding imports the API's config loader, pool factory and migrator. Root `scripts/` is reserved for the load generator (Phase 7), which needs only HTTP and therefore genuinely belongs outside the API package.
3. **`docker-compose.yml` in this phase contains backing services only** — Postgres, MinIO, and the MinIO bucket-creation job. Spec §10.2 describes the development stack as also running the `api` and `web` services, but the HTTP server does not exist until Phase 3 and the SPA until Phase 5. Those two services are appended to this same file in Phase 6. The stack shipped here is complete and useful on its own: it is what `npm run test:db` and `npm run seed` run against.
4. **`observations` carries a check constraint that exactly one of `value_num` / `value_text` is non-null.** Not stated in spec §4, but it is the database-level expression of the domain rule from Phase 1 and it is what makes the two implementations genuinely equivalent.

## File Structure

```
demo-app/
  docker-compose.yml                           postgres + minio + minio-init
  .env.example                                 every variable from spec §3.3 with local values
  packages/api/
    package.json                               + pg, @testcontainers/postgresql, bcryptjs, tsx
    vitest.config.ts                           unit tests only — excludes test/postgres
    vitest.db.config.ts                        database tests — testcontainers globalSetup
    migrations/
      001_init.sql                             every table and index from spec §4
      002_reference_data.sql                   the three branches
    src/
      adapters/persistence/postgres/
        types.ts                               pg type parsers, installed once
        pool.ts                                Pool factory + query helpers + error translation
        rowMappers.ts                          snake_case row → camelCase entity
        migrator.ts                            idempotent, advisory-locked migration runner
        branchRepository.ts
        patientRepository.ts
        encounterRepository.ts
        observationRepository.ts
        attachmentRepository.ts
        auditLog.ts
      scripts/
        seed.ts                                demo users + synthetic patients
    test/
      postgres/
        postgresHarness.ts                     RepositoryHarness backed by a real database
        contracts.test.ts                      the same six suites, against Postgres
        migrator.test.ts
      setup/
        postgres.globalSetup.ts                starts one container per run, provides dbUrl
```

---

### Task 1: Database connection and the database test rig

Scaffolding for every later task: the pool factory, the type parsers that make round-tripping exact, the central error translation, and the Testcontainers rig that gives database tests a real Postgres.

**Files:**
- Modify: `packages/api/package.json` (dependencies and scripts)
- Modify: `packages/api/vitest.config.ts` (exclude the database tests)
- Create: `packages/api/vitest.db.config.ts`
- Create: `packages/api/test/setup/postgres.globalSetup.ts`
- Create: `packages/api/src/adapters/persistence/postgres/types.ts`, `packages/api/src/adapters/persistence/postgres/pool.ts`
- Test: `packages/api/test/postgres/pool.test.ts`

**Interfaces:**
- Consumes: `ConflictError` from `../../../domain/errors.js`.
- Produces:
  - `src/adapters/persistence/postgres/pool.ts` — `type Db = { query<R extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>; close(): Promise<void>; pool: Pool }`, `createDb(databaseUrl: string, options?: { max?: number }): Db`, `isUniqueViolation(error: unknown): boolean`
  - `test/setup/postgres.globalSetup.ts` — provides `dbUrl` to every database test via Vitest's `inject('dbUrl')`

- [ ] **Step 1: Add the dependencies**

Run:

```bash
npm install -w @aethelgard/api pg
npm install -w @aethelgard/api -D @types/pg @testcontainers/postgresql tsx
```

Expected: `packages/api/package.json` gains `pg` under `dependencies` and the three others under `devDependencies`.

Then replace the `scripts` block of `packages/api/package.json` with:

```json
  "scripts": {
    "test": "vitest run && vitest run --config vitest.db.config.ts",
    "test:unit": "vitest run",
    "test:db": "vitest run --config vitest.db.config.ts",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 2: Split the two test configurations**

Database tests are slow and need Docker; unit tests must stay instant. Replace `packages/api/vitest.config.ts` with:

```ts
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@aethelgard/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Database tests live in their own config so the unit loop needs no Docker.
    exclude: [...configDefaults.exclude, 'test/postgres/**'],
  },
});
```

Create `packages/api/vitest.db.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@aethelgard/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/postgres/**/*.test.ts'],
    globalSetup: ['./test/setup/postgres.globalSetup.ts'],
    // One shared database: parallel files would truncate each other's rows mid-test.
    fileParallelism: false,
    testTimeout: 30_000,
    // Pulling and starting the container on a cold machine can take a while.
    hookTimeout: 180_000,
  },
});
```

- [ ] **Step 3: Write the container global setup**

`packages/api/test/setup/postgres.globalSetup.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

/**
 * Starts one Postgres for the whole database test run. Set DB_TEST_URL to point
 * at the Compose stack instead and no container is started at all.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const existing = process.env.DB_TEST_URL;
  if (existing !== undefined && existing !== '') {
    project.provide('dbUrl', existing);
    return async () => {
      // Nothing to tear down — the database is not ours.
    };
  }

  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  } catch (error) {
    throw new Error(
      'Could not start the Postgres test container. Is Docker running? ' +
        'Alternatively set DB_TEST_URL to an existing database.',
      { cause: error },
    );
  }

  project.provide('dbUrl', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
```

- [ ] **Step 4: Write the failing test**

`packages/api/test/postgres/pool.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ConflictError } from '../../src/domain/errors.js';
import { createDb, isUniqueViolation, type Db } from '../../src/adapters/persistence/postgres/pool.js';

let db: Db;

beforeAll(() => {
  db = createDb(inject('dbUrl'));
});

afterAll(async () => {
  await db.close();
});

describe('createDb', () => {
  it('connects and executes a parameterised query', async () => {
    const result = await db.query<{ answer: number }>('SELECT $1::int AS answer', [42]);
    expect(result.rows[0]?.answer).toBe(42);
  });

  it('returns DATE as a YYYY-MM-DD string, not a Date shifted by the local timezone', async () => {
    const result = await db.query<{ dob: string }>('SELECT $1::date AS dob', ['1985-03-14']);
    expect(result.rows[0]?.dob).toBe('1985-03-14');
  });

  it('returns TIMESTAMPTZ as a Date that round-trips to the same ISO string', async () => {
    const iso = '2026-08-07T10:00:00.000Z';
    const result = await db.query<{ at: Date }>('SELECT $1::timestamptz AS at', [iso]);
    expect(result.rows[0]?.at.toISOString()).toBe(iso);
  });

  it('returns a bigint count as a number, so callers need no parseInt', async () => {
    const result = await db.query<{ total: number }>('SELECT count(*)::bigint AS total FROM (SELECT 1) AS one');
    expect(result.rows[0]?.total).toBe(1);
    expect(typeof result.rows[0]?.total).toBe('number');
  });

  it('returns DOUBLE PRECISION as a number, so observation values need no coercion', async () => {
    const result = await db.query<{ value: number }>('SELECT $1::double precision AS value', [37.4]);
    expect(result.rows[0]?.value).toBeCloseTo(37.4, 5);
  });
});

describe('error translation', () => {
  beforeAll(async () => {
    await db.query('CREATE TABLE IF NOT EXISTS pool_test_unique (id INT PRIMARY KEY)');
  });

  afterAll(async () => {
    await db.query('DROP TABLE IF EXISTS pool_test_unique');
  });

  it('translates a unique violation into ConflictError', async () => {
    await db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [1]);
    await expect(
      db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [1]),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('names the violated constraint in the error details', async () => {
    await db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [2]).catch(() => undefined);
    try {
      await db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [2]);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ConflictError).details.constraint).toBe('pool_test_unique_pkey');
    }
  });

  it('lets every other database error through unchanged', async () => {
    await expect(db.query('SELECT * FROM a_table_that_does_not_exist')).rejects.not.toBeInstanceOf(
      ConflictError,
    );
  });

  it('recognises a unique violation by its SQLSTATE', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/adapters/persistence/postgres/pool.js`. (The container should still start; if it does not, Docker is not running.)

- [ ] **Step 6: Implement the type parsers and the pool**

`packages/api/src/adapters/persistence/postgres/types.ts`:

```ts
import pg from 'pg';

const { types } = pg;

const OID_DATE = 1082;
const OID_INT8 = 20;

/**
 * Installed once, at import time, before any pool is created.
 *
 * DATE: node-postgres would otherwise build a JS Date at local midnight, which
 * shifts a date of birth by a day west of UTC. We want the literal YYYY-MM-DD.
 *
 * INT8: returned as a string by default to protect precision. Our only bigints
 * are COUNT results, which are far below Number.MAX_SAFE_INTEGER.
 */
types.setTypeParser(OID_DATE, (value: string) => value);
types.setTypeParser(OID_INT8, (value: string) => Number(value));
```

`packages/api/src/adapters/persistence/postgres/pool.ts`:

```ts
import pg from 'pg';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { ConflictError } from '../../../domain/errors.js';
// Side-effect import: the parsers must be installed before the first query.
import './types.js';

const { Pool: PgPool } = pg;

const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION;

export type Db = {
  query<R extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
  close(): Promise<void>;
  pool: Pool;
};

/**
 * The single place a database error is interpreted. A unique violation is a
 * domain-meaningful conflict; everything else is a genuine fault and propagates
 * untouched so it reaches the logs with its original SQLSTATE.
 */
export const createDb = (databaseUrl: string, options: { max?: number } = {}): Db => {
  const pool = new PgPool({ connectionString: databaseUrl, max: options.max ?? 10 });

  // Without this an idle-client error takes the process down with no context.
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
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — 9 tests.

- [ ] **Step 8: Verify the unit loop still needs no Docker**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS, and no container starts.

- [ ] **Step 9: Commit**

```bash
git add packages/api package.json package-lock.json
git commit -m "feat(api): add Postgres pool with type parsers and error translation"
```

---

### Task 2: Migrations and the migrator

**Files:**
- Create: `packages/api/migrations/001_init.sql`, `packages/api/migrations/002_reference_data.sql`
- Create: `packages/api/src/adapters/persistence/postgres/migrator.ts`
- Test: `packages/api/test/postgres/migrator.test.ts`

**Interfaces:**
- Consumes: `Db` from `./pool.js`.
- Produces: `runMigrations(db: Db, options?: { directory?: string; log?: (message: string) => void }): Promise<string[]>` — returns the versions applied by *this* call, in order. `DEFAULT_MIGRATIONS_DIR: string`.

- [ ] **Step 1: Write the schema migration**

`packages/api/migrations/001_init.sql`:

```sql
-- Trigram index support for the patient name search in spec §4.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS branches (
  id   UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('KL', 'PG', 'JB')),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('doctor', 'nurse', 'records_clerk', 'admin')),
  branch_id     UUID NOT NULL REFERENCES branches (id),
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id         UUID PRIMARY KEY,
  mrn        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  dob        DATE NOT NULL,
  sex        TEXT NOT NULL CHECK (sex IN ('male', 'female', 'other', 'unknown')),
  phone      TEXT NOT NULL,
  branch_id  UUID NOT NULL REFERENCES branches (id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  -- Clinical records are retained, never erased (spec §4).
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS patients_branch_id_idx ON patients (branch_id);
CREATE INDEX IF NOT EXISTS patients_name_trgm_idx ON patients USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS encounters (
  id            UUID PRIMARY KEY,
  patient_id    UUID NOT NULL REFERENCES patients (id),
  -- Denormalised from the patient so branch scoping needs no join.
  branch_id     UUID NOT NULL REFERENCES branches (id),
  type          TEXT NOT NULL CHECK (type IN ('outpatient', 'inpatient', 'emergency')),
  department    TEXT NOT NULL,
  admitted_at   TIMESTAMPTZ NOT NULL,
  discharged_at TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('open', 'discharged', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS encounters_patient_id_idx ON encounters (patient_id);
CREATE INDEX IF NOT EXISTS encounters_branch_id_idx ON encounters (branch_id);

CREATE TABLE IF NOT EXISTS observations (
  id           UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES encounters (id),
  code         TEXT NOT NULL CHECK (
    code IN ('heart_rate', 'blood_pressure', 'temperature', 'spo2', 'weight')
  ),
  value_num    DOUBLE PRECISION,
  value_text   TEXT,
  unit         TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL,
  recorded_by  UUID NOT NULL REFERENCES users (id),
  -- The database expression of the domain rule: exactly one value, never both.
  CONSTRAINT observations_one_value CHECK ((value_num IS NULL) <> (value_text IS NULL))
);

CREATE INDEX IF NOT EXISTS observations_encounter_id_idx ON observations (encounter_id);

CREATE TABLE IF NOT EXISTS attachments (
  id           UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES encounters (id),
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   BIGINT,
  storage_key  TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
  uploaded_by  UUID NOT NULL REFERENCES users (id),
  uploaded_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS attachments_encounter_id_idx ON attachments (encounter_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id            UUID PRIMARY KEY,
  actor_user_id UUID NOT NULL REFERENCES users (id),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (
    entity_type IN ('patient', 'encounter', 'observation', 'attachment')
  ),
  entity_id     UUID NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id);
```

- [ ] **Step 2: Write the reference-data migration**

Branch ids are fixed so tests, seeds and the memory adapter all agree.

`packages/api/migrations/002_reference_data.sql`:

```sql
INSERT INTO branches (id, code, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'KL', 'Aethelgard Kuala Lumpur'),
  ('22222222-2222-4222-8222-222222222222', 'PG', 'Aethelgard Penang'),
  ('33333333-3333-4333-8333-333333333333', 'JB', 'Aethelgard Johor Bahru')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 3: Write the failing migrator test**

`packages/api/test/postgres/migrator.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';

let db: Db;

const dropEverything = async (): Promise<void> => {
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
};

const tableNames = async (): Promise<string[]> => {
  const result = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
};

beforeEach(async () => {
  db = createDb(inject('dbUrl'));
  await dropEverything();
});

afterEach(async () => {
  await db.close();
});

describe('runMigrations', () => {
  it('creates every table in the data model', async () => {
    await runMigrations(db);
    expect(await tableNames()).toEqual([
      'attachments',
      'audit_events',
      'branches',
      'encounters',
      'observations',
      'patients',
      'schema_migrations',
      'users',
    ]);
  });

  it('reports the versions it applied, in order', async () => {
    expect(await runMigrations(db)).toEqual(['001_init', '002_reference_data']);
  });

  it('records each applied version with a timestamp', async () => {
    await runMigrations(db);
    const result = await db.query<{ version: string; applied_at: Date }>(
      'SELECT version, applied_at FROM schema_migrations ORDER BY version',
    );
    expect(result.rows.map((row) => row.version)).toEqual(['001_init', '002_reference_data']);
    expect(result.rows[0]?.applied_at).toBeInstanceOf(Date);
  });

  it('is a no-op the second time — the defining property of an idempotent deploy', async () => {
    await runMigrations(db);
    expect(await runMigrations(db)).toEqual([]);
  });

  it('does not duplicate reference data on a re-run', async () => {
    await runMigrations(db);
    await runMigrations(db);
    const result = await db.query<{ total: number }>('SELECT count(*)::bigint AS total FROM branches');
    expect(result.rows[0]?.total).toBe(3);
  });

  it('seeds the three campuses with their fixed identifiers', async () => {
    await runMigrations(db);
    const result = await db.query<{ id: string; code: string }>(
      'SELECT id, code FROM branches ORDER BY code',
    );
    expect(result.rows).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', code: 'JB' },
      { id: '11111111-1111-4111-8111-111111111111', code: 'KL' },
      { id: '22222222-2222-4222-8222-222222222222', code: 'PG' },
    ]);
  });

  it('creates the indexes the report cites', async () => {
    await runMigrations(db);
    const result = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    );
    const names = result.rows.map((row) => row.indexname);
    expect(names).toContain('patients_branch_id_idx');
    expect(names).toContain('patients_name_trgm_idx');
    expect(names).toContain('encounters_patient_id_idx');
    expect(names).toContain('observations_encounter_id_idx');
    expect(names).toContain('attachments_encounter_id_idx');
    expect(names).toContain('audit_events_entity_idx');
  });

  it('enforces the one-value rule on observations at the database level', async () => {
    await runMigrations(db);
    await expect(
      db.query(
        `INSERT INTO observations (id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by)
         VALUES ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555',
                 'heart_rate', 72, '72', 'bpm', now(), '66666666-6666-4666-8666-666666666666')`,
      ),
    ).rejects.toThrow();
  });

  it('applies only the versions that are missing', async () => {
    await runMigrations(db);
    await db.query(`DELETE FROM schema_migrations WHERE version = '002_reference_data'`);
    // Re-applying 002 must succeed: every insert is ON CONFLICT DO NOTHING.
    expect(await runMigrations(db)).toEqual(['002_reference_data']);
  });

  it('reports each applied version through the injected logger', async () => {
    const lines: string[] = [];
    await runMigrations(db, { log: (message) => lines.push(message) });
    expect(lines.join('\n')).toContain('001_init');
    expect(lines.join('\n')).toContain('002_reference_data');
  });
});
```

`beforeEach` drops and recreates the `public` schema, so every test starts from an empty database and the `pg_trgm` extension is re-created by 001 each time.

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/migrator.test.ts`
Expected: FAIL — cannot resolve `../../src/adapters/persistence/postgres/migrator.js`.

- [ ] **Step 5: Implement the migrator**

`packages/api/src/adapters/persistence/postgres/migrator.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** src/adapters/persistence/postgres → packages/api/migrations */
export const DEFAULT_MIGRATIONS_DIR = path.resolve(HERE, '../../../../migrations');

/**
 * A fixed key so every instance booting at once serialises on the same lock.
 * Session-level, released explicitly in the finally block.
 */
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
 * Applies every migration file not yet recorded, each in its own transaction,
 * under an advisory lock so concurrent instance boots cannot race. Safe to run
 * on every startup: on an up-to-date database it does nothing and returns [].
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
        // Re-thrown with the version attached: a failed migration must stop the boot.
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
```

The single `.catch(() => undefined)` is on the advisory unlock in the `finally` block. It is deliberate and is the one place a swallowed error is correct: if the connection is already broken, the lock dies with the session anyway, and rethrowing here would mask the real migration failure.

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/migrator.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): add SQL migrations and an idempotent advisory-locked migrator"
```

---

### Task 3: Row mappers, the Postgres harness, and BranchRepository

The first contract suite runs against a real database at the end of this task.

**Files:**
- Create: `packages/api/src/adapters/persistence/postgres/rowMappers.ts`, `packages/api/src/adapters/persistence/postgres/branchRepository.ts`
- Create: `packages/api/test/postgres/postgresHarness.ts`, `packages/api/test/postgres/contracts.test.ts`

**Interfaces:**
- Consumes: `Db` from `./pool.js`; entity types from `@aethelgard/shared`; `AuditEvent` from `../../../ports/index.js`; `RepositoryHarness`, `HarnessContext` from `../contracts/harness.js`; `BRANCH_IDS`, `USER_IDS` from `../fixtures/ids.js`.
- Produces:
  - `rowMappers.ts` — `BranchRow`/`toBranch`, `PatientRow`/`toPatient`, `EncounterRow`/`toEncounter`, `ObservationRow`/`toObservation`, `AttachmentRow`/`toAttachment`, `AuditEventRow`/`toAuditEvent`
  - `branchRepository.ts` — `createPostgresBranchRepository(db: Db): BranchRepository`
  - `test/postgres/postgresHarness.ts` — `createPostgresHarness(db: Db): RepositoryHarness`

`rowMappers.ts` is written complete in this task rather than grown across five. It is one cohesive translation module with no branching logic, and every mapper is exercised by a contract suite before Task 7 ends — so nothing in it ships unverified.

- [ ] **Step 1: Write the row mappers**

`packages/api/src/adapters/persistence/postgres/rowMappers.ts`:

```ts
import type {
  Attachment,
  AttachmentStatus,
  Branch,
  BranchCode,
  Encounter,
  EncounterStatus,
  EncounterType,
  Observation,
  ObservationCode,
  Patient,
  Sex,
} from '@aethelgard/shared';
import type { AuditAction, AuditEntityType, AuditEvent } from '../../../ports/index.js';

/**
 * snake_case rows → camelCase wire shapes. TIMESTAMPTZ arrives as a Date and
 * leaves as an ISO string; DATE arrives as a string already (see types.ts).
 */

export type BranchRow = { id: string; code: BranchCode; name: string };

export const toBranch = (row: BranchRow): Branch => ({
  id: row.id,
  code: row.code,
  name: row.name,
});

export type PatientRow = {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: Sex;
  phone: string;
  branch_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export const toPatient = (row: PatientRow): Patient => ({
  id: row.id,
  mrn: row.mrn,
  name: row.name,
  dob: row.dob,
  sex: row.sex,
  phone: row.phone,
  branchId: row.branch_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  deletedAt: row.deleted_at === null ? null : row.deleted_at.toISOString(),
});

export type EncounterRow = {
  id: string;
  patient_id: string;
  branch_id: string;
  type: EncounterType;
  department: string;
  admitted_at: Date;
  discharged_at: Date | null;
  status: EncounterStatus;
};

export const toEncounter = (row: EncounterRow): Encounter => ({
  id: row.id,
  patientId: row.patient_id,
  branchId: row.branch_id,
  type: row.type,
  department: row.department,
  admittedAt: row.admitted_at.toISOString(),
  dischargedAt: row.discharged_at === null ? null : row.discharged_at.toISOString(),
  status: row.status,
});

export type ObservationRow = {
  id: string;
  encounter_id: string;
  code: ObservationCode;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  recorded_at: Date;
  recorded_by: string;
};

export const toObservation = (row: ObservationRow): Observation => ({
  id: row.id,
  encounterId: row.encounter_id,
  code: row.code,
  valueNum: row.value_num,
  valueText: row.value_text,
  unit: row.unit,
  recordedAt: row.recorded_at.toISOString(),
  recordedBy: row.recorded_by,
});

export type AttachmentRow = {
  id: string;
  encounter_id: string;
  filename: string;
  content_type: string;
  size_bytes: number | null;
  storage_key: string;
  status: AttachmentStatus;
  uploaded_by: string;
  uploaded_at: Date;
};

export const toAttachment = (row: AttachmentRow): Attachment => ({
  id: row.id,
  encounterId: row.encounter_id,
  filename: row.filename,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  storageKey: row.storage_key,
  status: row.status,
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at.toISOString(),
});

export type AuditEventRow = {
  id: string;
  actor_user_id: string;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  occurred_at: Date;
};

export const toAuditEvent = (row: AuditEventRow): AuditEvent => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  occurredAt: row.occurred_at.toISOString(),
});
```

- [ ] **Step 2: Write the failing Postgres contract runner**

`packages/api/test/postgres/contracts.test.ts` — this file grows in each of Tasks 3–7. Its first version:

```ts
import { afterAll, beforeAll, inject } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { describeBranchRepositoryContract } from '../contracts/branchRepository.contract.js';
import { createPostgresHarness } from './postgresHarness.js';

const db: Db = createDb(inject('dbUrl'));

beforeAll(async () => {
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
});

describeBranchRepositoryContract(createPostgresHarness(db));
```

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: FAIL — cannot resolve `./postgresHarness.js`.

- [ ] **Step 3: Implement the harness**

Uses the same `notYetImplemented` scaffold as Phase 1 Task 7. Task 7 of this phase deletes it.

`packages/api/test/postgres/postgresHarness.ts`:

```ts
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';
import { createPostgresBranchRepository } from '../../src/adapters/persistence/postgres/branchRepository.js';
import type { HarnessContext, RepositoryHarness } from '../contracts/harness.js';
import { BRANCH_IDS, USER_IDS } from '../fixtures/ids.js';

const notYetImplemented = <T>(name: string): T =>
  new Proxy({} as object, {
    get: () => {
      throw new Error(`${name} is not implemented yet — see the task that adds it`);
    },
  }) as T;

/**
 * Users are reference data for the contract suites: observations, attachments
 * and audit events all carry a foreign key to users.id.
 */
const HARNESS_USERS = [
  { id: USER_IDS.adminKl, email: 'admin.kl@aethelgard.demo', role: 'admin', branchId: BRANCH_IDS.KL, displayName: 'Admin (Kuala Lumpur)' },
  { id: USER_IDS.doctorKl, email: 'doctor.kl@aethelgard.demo', role: 'doctor', branchId: BRANCH_IDS.KL, displayName: 'Doctor (Kuala Lumpur)' },
  { id: USER_IDS.nurseKl, email: 'nurse.kl@aethelgard.demo', role: 'nurse', branchId: BRANCH_IDS.KL, displayName: 'Nurse (Kuala Lumpur)' },
  { id: USER_IDS.clerkKl, email: 'clerk.kl@aethelgard.demo', role: 'records_clerk', branchId: BRANCH_IDS.KL, displayName: 'Records Clerk (Kuala Lumpur)' },
  { id: USER_IDS.doctorPg, email: 'doctor.pg@aethelgard.demo', role: 'doctor', branchId: BRANCH_IDS.PG, displayName: 'Doctor (Penang)' },
] as const;

const resetClinicalTables = async (db: Db): Promise<void> => {
  await db.query('TRUNCATE audit_events, attachments, observations, encounters, patients CASCADE');
};

const seedHarnessUsers = async (db: Db): Promise<void> => {
  for (const user of HARNESS_USERS) {
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, branch_id, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.email, 'not-a-real-hash', user.role, user.branchId, user.displayName],
    );
  }
};

export const createPostgresHarness = (db: Db): RepositoryHarness => ({
  name: 'postgres',
  setup: async (): Promise<HarnessContext> => {
    await resetClinicalTables(db);
    await seedHarnessUsers(db);
    return {
      branches: createPostgresBranchRepository(db),
      patients: notYetImplemented('PostgresPatientRepository'),
      encounters: notYetImplemented('PostgresEncounterRepository'),
      observations: notYetImplemented('PostgresObservationRepository'),
      attachments: notYetImplemented('PostgresAttachmentRepository'),
      audit: notYetImplemented('PostgresAuditLog'),
    };
  },
  teardown: async (): Promise<void> => {
    // The pool is shared across suites and closed once in afterAll.
  },
});
```

- [ ] **Step 4: Implement PostgresBranchRepository**

`packages/api/src/adapters/persistence/postgres/branchRepository.ts`:

```ts
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
    const result = await db.query<BranchRow>(
      `SELECT ${COLUMNS} FROM branches WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : toBranch(row);
  },

  findByCode: async (code: BranchCode): Promise<Branch | null> => {
    const result = await db.query<BranchRow>(
      `SELECT ${COLUMNS} FROM branches WHERE code = $1`,
      [code],
    );
    const row = result.rows[0];
    return row === undefined ? null : toBranch(row);
  },
});
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: PASS — 5 tests under `BranchRepository contract [postgres]`.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): add Postgres row mappers, test harness and BranchRepository"
```

---

### Task 4: PostgresPatientRepository

The hardest adapter: soft delete, branch scoping, search and pagination all in SQL.

**Files:**
- Create: `packages/api/src/adapters/persistence/postgres/patientRepository.ts`
- Modify: `packages/api/test/postgres/postgresHarness.ts`, `packages/api/test/postgres/contracts.test.ts`

**Interfaces:**
- Consumes: `PatientRepository`, `NewPatient`, `PatientPatch`, `PatientSearchQuery` from `../../../ports/index.js`; `BranchScope` from `../../../domain/scope.js`; `Db`; `toPatient`, `PatientRow`.
- Produces: `createPostgresPatientRepository(db: Db): PatientRepository`.

- [ ] **Step 1: Register the contract and run it to verify it fails**

Add to `packages/api/test/postgres/contracts.test.ts`:

```ts
import { describePatientRepositoryContract } from '../contracts/patientRepository.contract.js';
```

```ts
describePatientRepositoryContract(createPostgresHarness(db));
```

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: FAIL — `PostgresPatientRepository is not implemented yet`.

- [ ] **Step 2: Implement the adapter**

`packages/api/src/adapters/persistence/postgres/patientRepository.ts`:

```ts
import type { Page, Patient } from '@aethelgard/shared';
import type { BranchScope } from '../../../domain/scope.js';
import type {
  NewPatient,
  PatientPatch,
  PatientRepository,
  PatientSearchQuery,
} from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toPatient, type PatientRow } from './rowMappers.js';

const COLUMNS =
  'id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at, deleted_at';

/** null means "no branch restriction" — the SQL reads `($n::uuid IS NULL OR ...)`. */
const scopeParam = (scope: BranchScope): string | null =>
  scope.kind === 'all' ? null : scope.branchId;

/** Empty or whitespace-only search behaves as no search at all. */
const searchParam = (search: string | undefined): string | null => {
  const trimmed = search?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/**
 * Shared by search and its count. Branch scope and soft delete are both inside
 * the predicate (spec §6.2, §4) — nothing is filtered in TypeScript afterwards.
 */
const SEARCH_PREDICATE = `
  deleted_at IS NULL
  AND ($1::uuid IS NULL OR branch_id = $1::uuid)
  AND (
    $2::text IS NULL
    OR name ILIKE '%' || $2::text || '%'
    OR mrn = upper($2::text)
  )`;

export const createPostgresPatientRepository = (db: Db): PatientRepository => ({
  create: async (input: NewPatient): Promise<Patient> => {
    const result = await db.query<PatientRow>(
      `INSERT INTO patients (id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.mrn,
        input.name,
        input.dob,
        input.sex,
        input.phone,
        input.branchId,
        input.createdAt,
        input.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT ... RETURNING produced no row for patients');
    }
    return toPatient(row);
  },

  findById: async (id: string, scope: BranchScope): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients
        WHERE id = $1
          AND deleted_at IS NULL
          AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
      [id, scopeParam(scope)],
    );
    const row = result.rows[0];
    return row === undefined ? null : toPatient(row);
  },

  findByMrn: async (mrn: string, scope: BranchScope): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients
        WHERE mrn = $1
          AND deleted_at IS NULL
          AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
      [mrn, scopeParam(scope)],
    );
    const row = result.rows[0];
    return row === undefined ? null : toPatient(row);
  },

  search: async (query: PatientSearchQuery, scope: BranchScope): Promise<Page<Patient>> => {
    const branch = scopeParam(scope);
    const search = searchParam(query.search);
    const offset = (query.page - 1) * query.pageSize;

    const [rows, counted] = await Promise.all([
      db.query<PatientRow>(
        `SELECT ${COLUMNS} FROM patients
          WHERE ${SEARCH_PREDICATE}
          ORDER BY name ASC, id ASC
          LIMIT $3 OFFSET $4`,
        [branch, search, query.pageSize, offset],
      ),
      db.query<{ total: number }>(
        `SELECT count(*)::bigint AS total FROM patients WHERE ${SEARCH_PREDICATE}`,
        [branch, search],
      ),
    ]);

    return {
      items: rows.rows.map(toPatient),
      page: query.page,
      pageSize: query.pageSize,
      total: counted.rows[0]?.total ?? 0,
    };
  },

  update: async (
    id: string,
    patch: PatientPatch,
    scope: BranchScope,
  ): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `UPDATE patients SET
         name       = COALESCE($2::text, name),
         dob        = COALESCE($3::date, dob),
         sex        = COALESCE($4::text, sex),
         phone      = COALESCE($5::text, phone),
         updated_at = $6
        WHERE id = $1
          AND deleted_at IS NULL
          AND ($7::uuid IS NULL OR branch_id = $7::uuid)
        RETURNING ${COLUMNS}`,
      [
        id,
        patch.name ?? null,
        patch.dob ?? null,
        patch.sex ?? null,
        patch.phone ?? null,
        patch.updatedAt,
        scopeParam(scope),
      ],
    );
    const row = result.rows[0];
    return row === undefined ? null : toPatient(row);
  },

  softDelete: async (id: string, deletedAt: string, scope: BranchScope): Promise<boolean> => {
    const result = await db.query(
      `UPDATE patients SET deleted_at = $2, updated_at = $2
        WHERE id = $1
          AND deleted_at IS NULL
          AND ($3::uuid IS NULL OR branch_id = $3::uuid)`,
      [id, deletedAt, scopeParam(scope)],
    );
    return (result.rowCount ?? 0) > 0;
  },
});
```

- [ ] **Step 3: Wire it into the harness**

In `packages/api/test/postgres/postgresHarness.ts`, add the import and replace the `patients` line:

```ts
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
```

```ts
      patients: createPostgresPatientRepository(db),
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: PASS — the same 24 patient tests that pass against memory, now against Postgres.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add PostgresPatientRepository with in-query branch scoping"
```

---

### Task 5: PostgresEncounterRepository

**Files:**
- Create: `packages/api/src/adapters/persistence/postgres/encounterRepository.ts`
- Modify: `packages/api/test/postgres/postgresHarness.ts`, `packages/api/test/postgres/contracts.test.ts`

**Interfaces:**
- Consumes: `EncounterRepository`, `NewEncounter`, `EncounterPatch` from `../../../ports/index.js`; `toEncounter`, `EncounterRow`.
- Produces: `createPostgresEncounterRepository(db: Db): EncounterRepository`.

- [ ] **Step 1: Register the contract and run it to verify it fails**

Add to `packages/api/test/postgres/contracts.test.ts`:

```ts
import { describeEncounterRepositoryContract } from '../contracts/encounterRepository.contract.js';
```

```ts
describeEncounterRepositoryContract(createPostgresHarness(db));
```

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: FAIL — `PostgresEncounterRepository is not implemented yet`.

- [ ] **Step 2: Implement the adapter**

`packages/api/src/adapters/persistence/postgres/encounterRepository.ts`:

```ts
import type { Encounter } from '@aethelgard/shared';
import type { BranchScope } from '../../../domain/scope.js';
import type {
  EncounterPatch,
  EncounterRepository,
  NewEncounter,
} from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toEncounter, type EncounterRow } from './rowMappers.js';

const COLUMNS =
  'id, patient_id, branch_id, type, department, admitted_at, discharged_at, status';

const scopeParam = (scope: BranchScope): string | null =>
  scope.kind === 'all' ? null : scope.branchId;

export const createPostgresEncounterRepository = (db: Db): EncounterRepository => ({
  create: async (input: NewEncounter): Promise<Encounter> => {
    const result = await db.query<EncounterRow>(
      `INSERT INTO encounters
         (id, patient_id, branch_id, type, department, admitted_at, discharged_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.patientId,
        input.branchId,
        input.type,
        input.department,
        input.admittedAt,
        input.status,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT ... RETURNING produced no row for encounters');
    }
    return toEncounter(row);
  },

  findById: async (id: string, scope: BranchScope): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(
      `SELECT ${COLUMNS} FROM encounters
        WHERE id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
      [id, scopeParam(scope)],
    );
    const row = result.rows[0];
    return row === undefined ? null : toEncounter(row);
  },

  listForPatient: async (patientId: string, scope: BranchScope): Promise<Encounter[]> => {
    const result = await db.query<EncounterRow>(
      `SELECT ${COLUMNS} FROM encounters
        WHERE patient_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)
        ORDER BY admitted_at DESC, id DESC`,
      [patientId, scopeParam(scope)],
    );
    return result.rows.map(toEncounter);
  },

  /**
   * `dischargedAt` is tri-state: absent (leave alone), a timestamp, or an
   * explicit null (cancellation clears it). A COALESCE cannot express that, so
   * a boolean "was it supplied" flag drives a CASE instead.
   */
  update: async (
    id: string,
    patch: EncounterPatch,
    scope: BranchScope,
  ): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(
      `UPDATE encounters SET
         department    = COALESCE($2::text, department),
         status        = COALESCE($3::text, status),
         discharged_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE discharged_at END
        WHERE id = $1 AND ($6::uuid IS NULL OR branch_id = $6::uuid)
        RETURNING ${COLUMNS}`,
      [
        id,
        patch.department ?? null,
        patch.status ?? null,
        patch.dischargedAt !== undefined,
        patch.dischargedAt ?? null,
        scopeParam(scope),
      ],
    );
    const row = result.rows[0];
    return row === undefined ? null : toEncounter(row);
  },
});
```

- [ ] **Step 3: Wire it into the harness**

In `packages/api/test/postgres/postgresHarness.ts`:

```ts
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';
```

```ts
      encounters: createPostgresEncounterRepository(db),
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: PASS — branch, patient and encounter contracts green against Postgres.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add PostgresEncounterRepository"
```

---

### Task 6: PostgresObservationRepository and PostgresAttachmentRepository

**Files:**
- Create: `packages/api/src/adapters/persistence/postgres/observationRepository.ts`, `packages/api/src/adapters/persistence/postgres/attachmentRepository.ts`
- Modify: `packages/api/test/postgres/postgresHarness.ts`, `packages/api/test/postgres/contracts.test.ts`

**Interfaces:**
- Consumes: `ObservationRepository`, `NewObservation`, `AttachmentRepository`, `NewAttachment` from `../../../ports/index.js`; `toObservation`, `toAttachment` and their row types.
- Produces: `createPostgresObservationRepository(db: Db): ObservationRepository`, `createPostgresAttachmentRepository(db: Db): AttachmentRepository`.

- [ ] **Step 1: Register both contracts and run to verify they fail**

Add to `packages/api/test/postgres/contracts.test.ts`:

```ts
import { describeObservationRepositoryContract } from '../contracts/observationRepository.contract.js';
import { describeAttachmentRepositoryContract } from '../contracts/attachmentRepository.contract.js';
```

```ts
describeObservationRepositoryContract(createPostgresHarness(db));
describeAttachmentRepositoryContract(createPostgresHarness(db));
```

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: FAIL — `PostgresObservationRepository is not implemented yet` and `PostgresAttachmentRepository is not implemented yet`.

- [ ] **Step 2: Implement the observation adapter**

`packages/api/src/adapters/persistence/postgres/observationRepository.ts`:

```ts
import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toObservation, type ObservationRow } from './rowMappers.js';

const COLUMNS =
  'id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by';

/**
 * No branch predicate: observations carry no branch column. ObservationService
 * resolves the parent encounter in scope before anything reaches this adapter.
 */
export const createPostgresObservationRepository = (db: Db): ObservationRepository => ({
  create: async (input: NewObservation): Promise<Observation> => {
    const result = await db.query<ObservationRow>(
      `INSERT INTO observations
         (id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by)
       VALUES ($1, $2, $3, $4::double precision, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.encounterId,
        input.code,
        input.valueNum,
        input.valueText,
        input.unit,
        input.recordedAt,
        input.recordedBy,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT ... RETURNING produced no row for observations');
    }
    return toObservation(row);
  },

  listForEncounter: async (encounterId: string): Promise<Observation[]> => {
    const result = await db.query<ObservationRow>(
      `SELECT ${COLUMNS} FROM observations
        WHERE encounter_id = $1
        ORDER BY recorded_at DESC, id DESC`,
      [encounterId],
    );
    return result.rows.map(toObservation);
  },
});
```

- [ ] **Step 3: Implement the attachment adapter**

`packages/api/src/adapters/persistence/postgres/attachmentRepository.ts`:

```ts
import type { Attachment } from '@aethelgard/shared';
import type { AttachmentRepository, NewAttachment } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toAttachment, type AttachmentRow } from './rowMappers.js';

const COLUMNS =
  'id, encounter_id, filename, content_type, size_bytes, storage_key, status, uploaded_by, uploaded_at';

export const createPostgresAttachmentRepository = (db: Db): AttachmentRepository => ({
  createPending: async (input: NewAttachment): Promise<Attachment> => {
    const result = await db.query<AttachmentRow>(
      `INSERT INTO attachments
         (id, encounter_id, filename, content_type, size_bytes, storage_key,
          status, uploaded_by, uploaded_at)
       VALUES ($1, $2, $3, $4, NULL, $5, 'pending', $6, $7)
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.encounterId,
        input.filename,
        input.contentType,
        input.storageKey,
        input.uploadedBy,
        input.uploadedAt,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT ... RETURNING produced no row for attachments');
    }
    return toAttachment(row);
  },

  /**
   * `AND status = 'pending'` makes a replayed confirm a no-op returning null,
   * so a retried client cannot overwrite the recorded size.
   */
  confirm: async (id: string, sizeBytes: number): Promise<Attachment | null> => {
    const result = await db.query<AttachmentRow>(
      `UPDATE attachments SET status = 'confirmed', size_bytes = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING ${COLUMNS}`,
      [id, sizeBytes],
    );
    const row = result.rows[0];
    return row === undefined ? null : toAttachment(row);
  },

  findById: async (id: string): Promise<Attachment | null> => {
    const result = await db.query<AttachmentRow>(
      `SELECT ${COLUMNS} FROM attachments WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : toAttachment(row);
  },

  /** Orphaned pending rows are excluded from listings (spec §7). */
  listConfirmedForEncounter: async (encounterId: string): Promise<Attachment[]> => {
    const result = await db.query<AttachmentRow>(
      `SELECT ${COLUMNS} FROM attachments
        WHERE encounter_id = $1 AND status = 'confirmed'
        ORDER BY uploaded_at DESC, id DESC`,
      [encounterId],
    );
    return result.rows.map(toAttachment);
  },
});
```

- [ ] **Step 4: Wire both into the harness**

In `packages/api/test/postgres/postgresHarness.ts`:

```ts
import { createPostgresObservationRepository } from '../../src/adapters/persistence/postgres/observationRepository.js';
import { createPostgresAttachmentRepository } from '../../src/adapters/persistence/postgres/attachmentRepository.js';
```

```ts
      observations: createPostgresObservationRepository(db),
      attachments: createPostgresAttachmentRepository(db),
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: PASS — five contracts green; only the audit log remains.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): add Postgres observation and attachment repositories"
```

---

### Task 7: PostgresAuditLog and full contract parity

Completes the persistence layer and removes the harness scaffold.

**Files:**
- Create: `packages/api/src/adapters/persistence/postgres/auditLog.ts`
- Modify: `packages/api/test/postgres/postgresHarness.ts`, `packages/api/test/postgres/contracts.test.ts`

**Interfaces:**
- Consumes: `AuditLog`, `NewAuditEvent`, `AuditEntityType`, `AuditEvent` from `../../../ports/index.js`; `toAuditEvent`, `AuditEventRow`.
- Produces: `createPostgresAuditLog(db: Db): AuditLog`.

- [ ] **Step 1: Register the contract and run it to verify it fails**

Add to `packages/api/test/postgres/contracts.test.ts`:

```ts
import { describeAuditLogContract } from '../contracts/auditLog.contract.js';
```

```ts
describeAuditLogContract(createPostgresHarness(db));
```

Run: `npm run test:db -w @aethelgard/api -- test/postgres/contracts.test.ts`
Expected: FAIL — `PostgresAuditLog is not implemented yet`.

- [ ] **Step 2: Implement the adapter**

`packages/api/src/adapters/persistence/postgres/auditLog.ts`:

```ts
import type {
  AuditEntityType,
  AuditEvent,
  AuditLog,
  NewAuditEvent,
} from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toAuditEvent, type AuditEventRow } from './rowMappers.js';

const COLUMNS = 'id, actor_user_id, action, entity_type, entity_id, occurred_at';

/** Append-only (spec §4): there is deliberately no UPDATE or DELETE here. */
export const createPostgresAuditLog = (db: Db): AuditLog => ({
  record: async (event: NewAuditEvent): Promise<void> => {
    await db.query(
      `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.id,
        event.actorUserId,
        event.action,
        event.entityType,
        event.entityId,
        event.occurredAt,
      ],
    );
  },

  listForEntity: async (
    entityType: AuditEntityType,
    entityId: string,
  ): Promise<AuditEvent[]> => {
    const result = await db.query<AuditEventRow>(
      `SELECT ${COLUMNS} FROM audit_events
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY occurred_at DESC, id DESC`,
      [entityType, entityId],
    );
    return result.rows.map(toAuditEvent);
  },
});
```

- [ ] **Step 3: Replace the harness with its final form**

Rewrite `packages/api/test/postgres/postgresHarness.ts` in full; the `notYetImplemented` proxy is deleted.

```ts
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';
import { createPostgresAttachmentRepository } from '../../src/adapters/persistence/postgres/attachmentRepository.js';
import { createPostgresAuditLog } from '../../src/adapters/persistence/postgres/auditLog.js';
import { createPostgresBranchRepository } from '../../src/adapters/persistence/postgres/branchRepository.js';
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';
import { createPostgresObservationRepository } from '../../src/adapters/persistence/postgres/observationRepository.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
import type { HarnessContext, RepositoryHarness } from '../contracts/harness.js';
import { BRANCH_IDS, USER_IDS } from '../fixtures/ids.js';

/**
 * Users are reference data for the contract suites: observations, attachments
 * and audit events all carry a foreign key to users.id.
 */
const HARNESS_USERS = [
  { id: USER_IDS.adminKl, email: 'admin.kl@aethelgard.demo', role: 'admin', branchId: BRANCH_IDS.KL, displayName: 'Admin (Kuala Lumpur)' },
  { id: USER_IDS.doctorKl, email: 'doctor.kl@aethelgard.demo', role: 'doctor', branchId: BRANCH_IDS.KL, displayName: 'Doctor (Kuala Lumpur)' },
  { id: USER_IDS.nurseKl, email: 'nurse.kl@aethelgard.demo', role: 'nurse', branchId: BRANCH_IDS.KL, displayName: 'Nurse (Kuala Lumpur)' },
  { id: USER_IDS.clerkKl, email: 'clerk.kl@aethelgard.demo', role: 'records_clerk', branchId: BRANCH_IDS.KL, displayName: 'Records Clerk (Kuala Lumpur)' },
  { id: USER_IDS.doctorPg, email: 'doctor.pg@aethelgard.demo', role: 'doctor', branchId: BRANCH_IDS.PG, displayName: 'Doctor (Penang)' },
] as const;

const resetClinicalTables = async (db: Db): Promise<void> => {
  await db.query('TRUNCATE audit_events, attachments, observations, encounters, patients CASCADE');
};

const seedHarnessUsers = async (db: Db): Promise<void> => {
  for (const user of HARNESS_USERS) {
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, branch_id, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.email, 'not-a-real-hash', user.role, user.branchId, user.displayName],
    );
  }
};

export const createPostgresHarness = (db: Db): RepositoryHarness => ({
  name: 'postgres',
  setup: async (): Promise<HarnessContext> => {
    await resetClinicalTables(db);
    await seedHarnessUsers(db);
    return {
      branches: createPostgresBranchRepository(db),
      patients: createPostgresPatientRepository(db),
      encounters: createPostgresEncounterRepository(db),
      observations: createPostgresObservationRepository(db),
      attachments: createPostgresAttachmentRepository(db),
      audit: createPostgresAuditLog(db),
    };
  },
  teardown: async (): Promise<void> => {
    // The pool is shared across suites and closed once in afterAll.
  },
});
```

- [ ] **Step 4: Run the whole database suite**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — all six contract suites plus the pool and migrator suites.

- [ ] **Step 5: Confirm no scaffold and no contract edits**

Run: `git grep -n "notYetImplemented" -- packages`
Expected: no matches.

Run: `git diff --stat main -- packages/api/test/contracts`
Expected: no changes to any file under `test/contracts/` since Phase 1. If there are, a port was bent to fit Postgres — revert and revise the port instead.

- [ ] **Step 6: Run everything**

Run: `npm test`
Expected: PASS — unit and database suites across both workspaces.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): add PostgresAuditLog and achieve full contract parity"
```

---

### Task 8: Seed data and the migrate/seed CLIs

Synthetic data only (spec §1.2) — no real patient information of any kind. Seeding is idempotent (spec §2), so running it against a populated database is a no-op.

**Files:**
- Create: `packages/api/src/scripts/seedData.ts`, `packages/api/src/scripts/seed.ts`, `packages/api/src/scripts/migrate.ts`
- Modify: `packages/api/package.json` (add `bcryptjs`, add `migrate` and `seed` scripts)
- Test: `packages/api/test/postgres/seed.test.ts`

**Interfaces:**
- Consumes: `Db` from `../adapters/persistence/postgres/pool.js`; `loadConfig` from `../config/env.js`; `runMigrations` from `../adapters/persistence/postgres/migrator.js`.
- Produces:
  - `seedData.ts` — `DEMO_PASSWORD: string`, `DEMO_USERS: readonly DemoUserSeed[]`, `type SeedSummary = { users: number; patients: number; encounters: number; observations: number }`, `seedDemoData(db: Db, log?: (message: string) => void): Promise<SeedSummary>`
  - `seed.ts`, `migrate.ts` — CLI entrypoints, no exports

- [ ] **Step 1: Add bcryptjs and the CLI scripts**

Run: `npm install -w @aethelgard/api bcryptjs`

`bcryptjs` is pure JavaScript — no native toolchain, which matters on Windows. Add to the `scripts` block of `packages/api/package.json`:

```json
    "migrate": "tsx --env-file=../../.env src/scripts/migrate.ts",
    "seed": "tsx --env-file=../../.env src/scripts/seed.ts",
```

- [ ] **Step 2: Write the failing test**

`packages/api/test/postgres/seed.test.ts`:

```ts
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { DEMO_PASSWORD, DEMO_USERS, seedDemoData } from '../../src/scripts/seedData.js';

let db: Db;

const countOf = async (table: string): Promise<number> => {
  const result = await db.query<{ total: number }>(`SELECT count(*)::bigint AS total FROM ${table}`);
  return result.rows[0]?.total ?? 0;
};

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.query('TRUNCATE audit_events, attachments, observations, encounters, patients CASCADE');
  await db.query('DELETE FROM users');
});

describe('seedDemoData', () => {
  it('creates one demo account per entry in DEMO_USERS', async () => {
    const summary = await seedDemoData(db);
    expect(summary.users).toBe(DEMO_USERS.length);
    expect(await countOf('users')).toBe(DEMO_USERS.length);
  });

  it('covers all four roles so the login dropdown can demonstrate RBAC', async () => {
    await seedDemoData(db);
    const result = await db.query<{ role: string }>('SELECT DISTINCT role FROM users');
    expect(result.rows.map((row) => row.role).sort()).toEqual([
      'admin',
      'doctor',
      'nurse',
      'records_clerk',
    ]);
  });

  it('covers all three branches so branch scoping can be demonstrated', async () => {
    await seedDemoData(db);
    const result = await db.query<{ total: number }>(
      'SELECT count(DISTINCT branch_id)::bigint AS total FROM users',
    );
    expect(result.rows[0]?.total).toBe(3);
  });

  it('stores a bcrypt hash that verifies against the demo password', async () => {
    await seedDemoData(db);
    const result = await db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users LIMIT 1',
    );
    const hash = result.rows[0]?.password_hash ?? '';
    expect(hash).not.toBe(DEMO_PASSWORD);
    expect(bcrypt.compareSync(DEMO_PASSWORD, hash)).toBe(true);
  });

  it('creates patients in every branch', async () => {
    await seedDemoData(db);
    const result = await db.query<{ total: number }>(
      'SELECT count(DISTINCT branch_id)::bigint AS total FROM patients',
    );
    expect(result.rows[0]?.total).toBe(3);
  });

  it('gives every seeded patient a branch-prefixed MRN', async () => {
    await seedDemoData(db);
    const result = await db.query<{ mrn: string; code: string }>(
      `SELECT p.mrn, b.code FROM patients p JOIN branches b ON b.id = p.branch_id`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.mrn.startsWith(`${row.code}-`)).toBe(true);
    }
  });

  it('creates encounters with observations attached', async () => {
    const summary = await seedDemoData(db);
    expect(summary.encounters).toBeGreaterThan(0);
    expect(summary.observations).toBeGreaterThan(0);
    const orphans = await db.query<{ total: number }>(
      `SELECT count(*)::bigint AS total FROM observations o
        LEFT JOIN encounters e ON e.id = o.encounter_id
        WHERE e.id IS NULL`,
    );
    expect(orphans.rows[0]?.total).toBe(0);
  });

  it('is idempotent — a second run inserts nothing', async () => {
    await seedDemoData(db);
    const before = await countOf('patients');
    const summary = await seedDemoData(db);
    expect(summary).toEqual({ users: 0, patients: 0, encounters: 0, observations: 0 });
    expect(await countOf('patients')).toBe(before);
  });

  it('leaves no patient soft-deleted, so the demo starts clean', async () => {
    await seedDemoData(db);
    const result = await db.query<{ total: number }>(
      'SELECT count(*)::bigint AS total FROM patients WHERE deleted_at IS NOT NULL',
    );
    expect(result.rows[0]?.total).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/seed.test.ts`
Expected: FAIL — cannot resolve `../../src/scripts/seedData.js`.

- [ ] **Step 4: Implement the seed data module**

`packages/api/src/scripts/seedData.ts`:

```ts
import bcrypt from 'bcryptjs';
import type { Db } from '../adapters/persistence/postgres/pool.js';

/**
 * Synthetic data only (spec §1.2). Fixed UUIDs keep the seed idempotent and let
 * screenshots in the report reference stable identifiers. The five user ids
 * below intentionally match `test/fixtures/ids.ts`.
 */

const BRANCH_IDS = {
  KL: '11111111-1111-4111-8111-111111111111',
  PG: '22222222-2222-4222-8222-222222222222',
  JB: '33333333-3333-4333-8333-333333333333',
} as const;

/** Published in the login dropdown. This is a demo with no real data. */
export const DEMO_PASSWORD = 'demo1234';

export type DemoUserSeed = {
  id: string;
  email: string;
  role: 'doctor' | 'nurse' | 'records_clerk' | 'admin';
  branchId: string;
  displayName: string;
};

export const DEMO_USERS: readonly DemoUserSeed[] = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin.kl@aethelgard.demo', role: 'admin', branchId: BRANCH_IDS.KL, displayName: 'Admin (Kuala Lumpur)' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'doctor.kl@aethelgard.demo', role: 'doctor', branchId: BRANCH_IDS.KL, displayName: 'Dr Lim (Kuala Lumpur)' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'nurse.kl@aethelgard.demo', role: 'nurse', branchId: BRANCH_IDS.KL, displayName: 'Nurse Devi (Kuala Lumpur)' },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'clerk.kl@aethelgard.demo', role: 'records_clerk', branchId: BRANCH_IDS.KL, displayName: 'Records Clerk (Kuala Lumpur)' },
  { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', email: 'doctor.pg@aethelgard.demo', role: 'doctor', branchId: BRANCH_IDS.PG, displayName: 'Dr Chandran (Penang)' },
  { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', email: 'nurse.pg@aethelgard.demo', role: 'nurse', branchId: BRANCH_IDS.PG, displayName: 'Nurse Hafiz (Penang)' },
  { id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', email: 'doctor.jb@aethelgard.demo', role: 'doctor', branchId: BRANCH_IDS.JB, displayName: 'Dr Wong (Johor Bahru)' },
];

type PatientSeed = {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: 'male' | 'female' | 'other' | 'unknown';
  phone: string;
  branchId: string;
};

const PATIENTS: readonly PatientSeed[] = [
  { id: '0a000001-0000-4000-8000-000000000001', mrn: 'KL-000101', name: 'Nurul Aisyah binti Rahman', dob: '1985-03-14', sex: 'female', phone: '+60123456701', branchId: BRANCH_IDS.KL },
  { id: '0a000002-0000-4000-8000-000000000002', mrn: 'KL-000102', name: 'Tan Wei Ming', dob: '1972-11-02', sex: 'male', phone: '+60123456702', branchId: BRANCH_IDS.KL },
  { id: '0a000003-0000-4000-8000-000000000003', mrn: 'KL-000103', name: 'Ravi Subramaniam', dob: '1994-07-21', sex: 'male', phone: '+60123456703', branchId: BRANCH_IDS.KL },
  { id: '0a000004-0000-4000-8000-000000000004', mrn: 'PG-000201', name: 'Siti Aminah binti Yusof', dob: '1963-01-09', sex: 'female', phone: '+60123456704', branchId: BRANCH_IDS.PG },
  { id: '0a000005-0000-4000-8000-000000000005', mrn: 'PG-000202', name: 'Lim Chee Keong', dob: '2001-05-30', sex: 'male', phone: '+60123456705', branchId: BRANCH_IDS.PG },
  { id: '0a000006-0000-4000-8000-000000000006', mrn: 'JB-000301', name: 'Farah Nadia binti Ismail', dob: '1990-09-17', sex: 'female', phone: '+60123456706', branchId: BRANCH_IDS.JB },
  { id: '0a000007-0000-4000-8000-000000000007', mrn: 'JB-000302', name: 'Kumar Selvarajah', dob: '1978-12-05', sex: 'male', phone: '+60123456707', branchId: BRANCH_IDS.JB },
];
```

Continue the same file:

```ts
type EncounterSeed = {
  id: string;
  patientId: string;
  branchId: string;
  type: 'outpatient' | 'inpatient' | 'emergency';
  department: string;
  admittedAt: string;
  dischargedAt: string | null;
  status: 'open' | 'discharged' | 'cancelled';
};

const ENCOUNTERS: readonly EncounterSeed[] = [
  { id: '0b000001-0000-4000-8000-000000000001', patientId: '0a000001-0000-4000-8000-000000000001', branchId: BRANCH_IDS.KL, type: 'inpatient', department: 'Cardiology', admittedAt: '2026-07-28T02:15:00.000Z', dischargedAt: null, status: 'open' },
  { id: '0b000002-0000-4000-8000-000000000002', patientId: '0a000001-0000-4000-8000-000000000001', branchId: BRANCH_IDS.KL, type: 'outpatient', department: 'General Medicine', admittedAt: '2026-05-02T01:00:00.000Z', dischargedAt: '2026-05-02T03:30:00.000Z', status: 'discharged' },
  { id: '0b000003-0000-4000-8000-000000000003', patientId: '0a000002-0000-4000-8000-000000000002', branchId: BRANCH_IDS.KL, type: 'emergency', department: 'Accident & Emergency', admittedAt: '2026-08-01T16:40:00.000Z', dischargedAt: null, status: 'open' },
  { id: '0b000004-0000-4000-8000-000000000004', patientId: '0a000004-0000-4000-8000-000000000004', branchId: BRANCH_IDS.PG, type: 'inpatient', department: 'Orthopaedics', admittedAt: '2026-07-30T07:05:00.000Z', dischargedAt: null, status: 'open' },
  { id: '0b000005-0000-4000-8000-000000000005', patientId: '0a000006-0000-4000-8000-000000000006', branchId: BRANCH_IDS.JB, type: 'outpatient', department: 'Obstetrics', admittedAt: '2026-08-03T04:20:00.000Z', dischargedAt: null, status: 'open' },
];

type ObservationSeed = {
  id: string;
  encounterId: string;
  code: 'heart_rate' | 'blood_pressure' | 'temperature' | 'spo2' | 'weight';
  valueNum: number | null;
  valueText: string | null;
  unit: string;
  recordedAt: string;
  recordedBy: string;
};

const DOCTOR_KL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NURSE_KL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCTOR_PG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DOCTOR_JB = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';

const OBSERVATIONS: readonly ObservationSeed[] = [
  { id: '0c000001-0000-4000-8000-000000000001', encounterId: '0b000001-0000-4000-8000-000000000001', code: 'heart_rate', valueNum: 88, valueText: null, unit: 'bpm', recordedAt: '2026-07-28T02:30:00.000Z', recordedBy: NURSE_KL },
  { id: '0c000002-0000-4000-8000-000000000002', encounterId: '0b000001-0000-4000-8000-000000000001', code: 'blood_pressure', valueNum: null, valueText: '142/91', unit: 'mmHg', recordedAt: '2026-07-28T02:31:00.000Z', recordedBy: NURSE_KL },
  { id: '0c000003-0000-4000-8000-000000000003', encounterId: '0b000001-0000-4000-8000-000000000001', code: 'spo2', valueNum: 96, valueText: null, unit: '%', recordedAt: '2026-07-28T02:32:00.000Z', recordedBy: NURSE_KL },
  { id: '0c000004-0000-4000-8000-000000000004', encounterId: '0b000003-0000-4000-8000-000000000003', code: 'temperature', valueNum: 38.6, valueText: null, unit: '°C', recordedAt: '2026-08-01T16:55:00.000Z', recordedBy: DOCTOR_KL },
  { id: '0c000005-0000-4000-8000-000000000005', encounterId: '0b000004-0000-4000-8000-000000000004', code: 'weight', valueNum: 71.2, valueText: null, unit: 'kg', recordedAt: '2026-07-30T07:20:00.000Z', recordedBy: DOCTOR_PG },
  { id: '0c000006-0000-4000-8000-000000000006', encounterId: '0b000005-0000-4000-8000-000000000005', code: 'heart_rate', valueNum: 74, valueText: null, unit: 'bpm', recordedAt: '2026-08-03T04:35:00.000Z', recordedBy: DOCTOR_JB },
];

export type SeedSummary = {
  users: number;
  patients: number;
  encounters: number;
  observations: number;
};

const CREATED_AT = '2026-07-01T00:00:00.000Z';

/**
 * Idempotent by construction: every insert is ON CONFLICT (id) DO NOTHING, and
 * the summary counts only the rows this run actually inserted.
 */
export const seedDemoData = async (
  db: Db,
  log: (message: string) => void = () => undefined,
): Promise<SeedSummary> => {
  const summary: SeedSummary = { users: 0, patients: 0, encounters: 0, observations: 0 };

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  for (const user of DEMO_USERS) {
    const result = await db.query(
      `INSERT INTO users (id, email, password_hash, role, branch_id, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.email, passwordHash, user.role, user.branchId, user.displayName],
    );
    summary.users += result.rowCount ?? 0;
  }

  for (const patient of PATIENTS) {
    const result = await db.query(
      `INSERT INTO patients (id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        patient.id,
        patient.mrn,
        patient.name,
        patient.dob,
        patient.sex,
        patient.phone,
        patient.branchId,
        CREATED_AT,
      ],
    );
    summary.patients += result.rowCount ?? 0;
  }

  for (const encounter of ENCOUNTERS) {
    const result = await db.query(
      `INSERT INTO encounters
         (id, patient_id, branch_id, type, department, admitted_at, discharged_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        encounter.id,
        encounter.patientId,
        encounter.branchId,
        encounter.type,
        encounter.department,
        encounter.admittedAt,
        encounter.dischargedAt,
        encounter.status,
      ],
    );
    summary.encounters += result.rowCount ?? 0;
  }

  for (const observation of OBSERVATIONS) {
    const result = await db.query(
      `INSERT INTO observations
         (id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by)
       VALUES ($1, $2, $3, $4::double precision, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        observation.id,
        observation.encounterId,
        observation.code,
        observation.valueNum,
        observation.valueText,
        observation.unit,
        observation.recordedAt,
        observation.recordedBy,
      ],
    );
    summary.observations += result.rowCount ?? 0;
  }

  log(
    `[seed] inserted ${summary.users} users, ${summary.patients} patients, ` +
      `${summary.encounters} encounters, ${summary.observations} observations`,
  );
  return summary;
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/seed.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Write the two CLI entrypoints**

`packages/api/src/scripts/migrate.ts`:

```ts
import { loadConfig } from '../config/env.js';
import { createDb } from '../adapters/persistence/postgres/pool.js';
import { runMigrations } from '../adapters/persistence/postgres/migrator.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb(config.DB_URL, { max: 1 });
  try {
    const applied = await runMigrations(db, { log: (message) => console.log(message) });
    console.log(`[migrate] ${applied.length} migration(s) applied`);
  } finally {
    await db.close();
  }
};

main().catch((error: unknown) => {
  // Configuration and migration failures must stop a deploy, loudly.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

`packages/api/src/scripts/seed.ts`:

```ts
import { loadConfig } from '../config/env.js';
import { createDb } from '../adapters/persistence/postgres/pool.js';
import { runMigrations } from '../adapters/persistence/postgres/migrator.js';
import { DEMO_PASSWORD, DEMO_USERS, seedDemoData } from './seedData.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const db = createDb(config.DB_URL, { max: 1 });
  try {
    await runMigrations(db, { log: (message) => console.log(message) });
    await seedDemoData(db, (message) => console.log(message));
    console.log(`[seed] demo password for every account: ${DEMO_PASSWORD}`);
    for (const user of DEMO_USERS) {
      console.log(`[seed]   ${user.email}  (${user.role})`);
    }
  } finally {
    await db.close();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0. (The CLIs are exercised end-to-end in Task 9.)

- [ ] **Step 8: Commit**

```bash
git add packages/api package.json package-lock.json
git commit -m "feat(api): add idempotent demo seed data and migrate/seed CLIs"
```

---

### Task 9: Development Compose stack

Backing services only, for the reasons in the deviations section. This is what makes `npm run seed` and a `DB_TEST_URL`-driven test run possible without Testcontainers.

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Modify: `package.json` (root scripts), `.gitignore` (already ignores `.env`)

**Interfaces:**
- Consumes: `packages/api` `migrate` and `seed` scripts from Task 8.
- Produces: services `postgres` (5432), `minio` (9000 API, 9001 console), `minio-init` (one-shot bucket creation); root scripts `db:up`, `db:down`, `db:reset`, `migrate`, `seed`.

- [ ] **Step 1: Write the Compose file**

`docker-compose.yml`:

```yaml
name: aethelgard-demo

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: aethelgard
      POSTGRES_PASSWORD: aethelgard
      POSTGRES_DB: aethelgard
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aethelgard -d aethelgard"]
      interval: 5s
      timeout: 5s
      retries: 12

  # MinIO stands in for S3 locally so the S3 code path is never bypassed (spec §2).
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: aethelgard
      MINIO_ROOT_PASSWORD: aethelgard-secret
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 12

  # One-shot: creates the attachments bucket, then exits 0.
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint:
      - /bin/sh
      - -c
      - >
        mc alias set local http://minio:9000 aethelgard aethelgard-secret &&
        mc mb --ignore-existing local/aethelgard-attachments &&
        mc anonymous set none local/aethelgard-attachments
    restart: "no"

volumes:
  postgres-data:
  minio-data:
```

Both images are pulled at `:latest`. Pin them to the digests you actually run before capturing evidence for the report, so the screenshots and the compose file agree.

- [ ] **Step 2: Write the environment template**

`.env.example`:

```dotenv
# Copy to .env before running npm run migrate / npm run seed.
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

DB_URL=postgres://aethelgard:aethelgard@localhost:5432/aethelgard

AUTH_DRIVER=localJwt
IDENTITY_DRIVER=local

# Point at MinIO locally; leave unset in AWS so the SDK resolves the endpoint.
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=aethelgard-attachments
S3_REGION=ap-southeast-5

JWT_SECRET=local-development-secret-change-me
APP_VERSION=0.1.0-local

# MinIO root credentials, read by the AWS SDK in Phase 4.
AWS_ACCESS_KEY_ID=aethelgard
AWS_SECRET_ACCESS_KEY=aethelgard-secret
```

`.env` is already in `.gitignore` from Phase 1. Never commit a real `.env`.

- [ ] **Step 3: Add the root scripts**

Replace the `scripts` block of the root `package.json` with:

```json
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "test:unit": "npm run test:unit --workspaces --if-present",
    "test:db": "npm run test:db --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "db:up": "docker compose up -d postgres minio minio-init",
    "db:down": "docker compose down",
    "db:reset": "docker compose down -v && docker compose up -d postgres minio minio-init",
    "migrate": "npm run migrate -w @aethelgard/api",
    "seed": "npm run seed -w @aethelgard/api"
  },
```

- [ ] **Step 4: Bring the stack up and verify it is healthy**

Run:

```bash
cp .env.example .env
npm run db:up
docker compose ps
```

Expected: `postgres` and `minio` report `healthy`; `minio-init` has exited with code 0.

- [ ] **Step 5: Migrate and seed against the real stack**

Run:

```bash
npm run migrate
npm run seed
```

Expected: `migrate` prints `applied 001_init` and `applied 002_reference_data` on a fresh volume, then `2 migration(s) applied`. `seed` prints the insert counts and lists the seven demo accounts with the demo password.

- [ ] **Step 6: Verify idempotency against the real stack**

Run:

```bash
npm run migrate
npm run seed
```

Expected: `migrate` prints `database is up to date` and `0 migration(s) applied`; `seed` prints `inserted 0 users, 0 patients, 0 encounters, 0 observations`.

- [ ] **Step 7: Verify the data landed**

Run:

```bash
docker compose exec -T postgres psql -U aethelgard -d aethelgard -c "SELECT b.code, count(p.id) FROM branches b LEFT JOIN patients p ON p.branch_id = b.id GROUP BY b.code ORDER BY b.code;"
```

Expected: `JB | 2`, `KL | 3`, `PG | 2`.

- [ ] **Step 8: Verify the test suite runs against the Compose database too**

Run:

```bash
DB_TEST_URL=postgres://aethelgard:aethelgard@localhost:5432/aethelgard npm run test:db -w @aethelgard/api
```

(PowerShell: `$env:DB_TEST_URL="postgres://aethelgard:aethelgard@localhost:5432/aethelgard"; npm run test:db -w @aethelgard/api`)

Expected: PASS, and no Testcontainers container starts. This proves the global setup's `DB_TEST_URL` escape hatch works.

Afterwards run `npm run db:reset && npm run migrate && npm run seed` to restore clean demo data — the contract suites truncate the clinical tables.

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml .env.example package.json
git commit -m "feat: add development Compose stack with Postgres and MinIO"
```

---

## Phase 2 Exit Criteria

- [ ] `npm test` passes — unit suites and database suites, both workspaces.
- [ ] `npm run typecheck` passes in both workspaces.
- [ ] The same six contract suites pass against **both** the memory and the Postgres harness.
- [ ] `git diff --stat main -- packages/api/test/contracts` shows no change since Phase 1.
- [ ] `git grep -n "notYetImplemented" -- packages` returns nothing.
- [ ] `npm run migrate` twice in a row applies two migrations then zero.
- [ ] `npm run seed` twice in a row inserts seven users then zero.
- [ ] `docker compose ps` shows `postgres` and `minio` healthy and `minio-init` exited 0.
- [ ] No file under `packages/api/src/http`, `src/adapters/storage`, `src/adapters/auth`, `src/adapters/identity`, or `src/composition.ts` exists yet — those are Phase 3 and 4.

## What Phase 3 Inherits

- Six working repository implementations behind ports, interchangeable by construction.
- `loadConfig` producing a typed `AppConfig`, ready for `composition.ts` to read.
- A migrator safe to call on every instance boot — which is what the EC2 user data in Phase 7 will do.
- Seeded demo accounts with bcrypt hashes, which the `localJwt` `AuthProvider` implementation will verify in Phase 3.
- A Compose stack whose `api` and `web` services get appended in Phase 6.




