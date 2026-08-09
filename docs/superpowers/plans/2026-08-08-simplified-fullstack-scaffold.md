# Simplified Aethelgard Fullstack Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Relationship to prior plans:** Supersedes `docs/superpowers/plans/2026-08-07-phase-1-domain-core.md` and `2026-08-07-phase-2-postgres-persistence.md`. Those plans built RBAC enforcement, branch-scoping, an audit log, and a dual-adapter contract-test harness — all correctly speced, but cut from this build per the 2026-08-08 chat decision to prioritize speed. Nothing in those plans has been implemented (no `packages/` directory exists yet), so there is no migration path to write — this plan starts clean. The domain (patients/encounters/observations/branches) is preserved; only the enforcement/rigor layers are cut.

**Amendment (2026-08-08, `docs/2026-08-08-infra-terraform-handoff-patch.md`):** Tasks 19–21 (Terraform network/data/compute modules) are removed from this plan's scope. `infra/terraform/`'s module code is now owned and delivered by a separate working session — see the "Infrastructure ownership note" between Task 18 and Task 22 below for what that session commits to preserving. Tasks 1–18 and 22 are unaffected except for one correction inside Task 22's runbook (the budget-alarm step). Execute Tasks 1–18, then skip to the amended Task 22.

**Goal:** Scaffold and fully implement the application side of a simplified Aethelgard EHR demo — shared schemas, Fastify backend, React frontend, and Docker images — such that swapping the database between Aurora PostgreSQL and RDS PostgreSQL (single- or multi-AZ) is a `.tfvars` change with zero application code changes. (Terraform infrastructure itself is delivered by a separate session per the amendment above; this plan produces the deployment glue — tfvars, build script, runbook — that consumes its outputs.)

**Architecture:** Ports and adapters (unchanged principle from the original spec). `packages/shared` holds Zod schemas. `packages/api` holds domain/ports/services/adapters/http, wired by a single `composition.ts`. `packages/web` is a plain React + Vite SPA served either by Vite (dev), nginx (local prod-parity), or the API's own static-file plugin (AWS — no CloudFront/S3 in this simplified build). `infra/terraform` (VPC, an Aurora-or-RDS-switchable data tier, an ECS Fargate + ALB compute tier, all scoped to Learner Lab's `LabRole`) is provisioned by the separately-owned Terraform build described in the amendment above, not by this plan.

**Tech Stack:** TypeScript 5.7+ (ESM, strict), npm workspaces, Zod 4, Vitest 3, Fastify 5, `pg` 8, `jsonwebtoken` 9, `bcryptjs` 2, React 19 + Vite 6 + React Router 7, Terraform ≥1.7 (HCL, `hashicorp/aws` ~>5.0, `hashicorp/random` ~>3.6), Docker.

## Global Constraints

Exact values from the spec and the 2026-08-08 chat decisions. Every task's requirements implicitly include this section.

- **TypeScript only, never plain JavaScript.** No `.js` source files anywhere except generated output and Terraform/shell scripts.
- **ESM only.** Every `package.json` sets `"type": "module"`. Import specifiers carry the `.js` extension even for `.ts` files (required by `verbatimModuleSyntax` + `moduleResolution: bundler`, and matches the Node ESM resolution the production build uses).
- **camelCase for variables and TypeScript properties.** Database columns are `snake_case`; row mappers do the translation.
- **Node version floor:** `>=22`. Production image is `node:22-alpine`.
- **No ORM, no query builder.** Parameterised SQL strings only, `$n` placeholders, never string-interpolated values.
- **Migrations are append-only and idempotent.** Every statement uses `IF NOT EXISTS` or `ON CONFLICT DO NOTHING`. Re-running `runMigrations` against an up-to-date database is a documented no-op.
- **Database-agnostic application layer (the core requirement of this plan).** The Postgres adapter, migrations, and every repository speak only standard PostgreSQL wire protocol and standard SQL (the one extension used, `pg_trgm`, ships with both RDS PostgreSQL and Aurora PostgreSQL). Nothing in `packages/api/src` ever branches on which managed service produced the connection string. `config/env.ts` is the single place a database's connection details are resolved into one `databaseUrl` string — every file downstream of it (`pool.ts`, `migrator.ts`, every repository) sees only that string. Swapping RDS single-AZ → RDS Multi-AZ → Aurora PostgreSQL Provisioned is therefore a Terraform/`.tfvars` change and an environment-variable change, never an application code change. Task 1 proves this with tests before any other code exists.
- **Branch codes are exactly `KL`, `PG`, `JB`** (Kuala Lumpur, Penang, Johor Bahru).
- **Roles are exactly `doctor`, `nurse`, `records_clerk`, `admin`.** The field is carried through the domain and JWT for future extensibility but **is not enforced anywhere in this build** — any authenticated principal may call any endpoint. This is the one deliberate simplification from the original spec's §6.2; the `role` column, the JWT claim, and the `Principal` type all still exist so RBAC middleware can be added later without a schema or token-shape change.
- **Branch scoping is data, not access control.** `patients.branch_id` exists and is populated; no repository or route filters by it. Same rationale as roles above — this is the seam RBAC/branch-scoping middleware would attach to later.
- **No audit log, no attachments, no Cognito adapter, no CloudFront/WAF/KMS in this build.** Cut per the 2026-08-08 chat decision. The `ObjectStore` and `AuditLog` ports from the original spec are not created — adding them later is additive (a new port, a new adapter, one new composition-root wire-up), not a refactor.
- **Explicit failure.** No error is caught and silently discarded. Every failure either propagates as a typed error or is logged with full context before a fallback runs.
- **The dependency rule is one-directional:** `http` → `services` → `ports` ← `adapters`. Nothing in `domain/` or `services/` imports from `adapters/`. Nothing in `domain/` or `ports/` imports an AWS SDK type or the `pg` package.
- **TDD for `packages/shared` and `packages/api`.** RED → GREEN → REFACTOR for domain, ports/memory-adapters, services, and the Postgres adapter. `packages/web`, Docker, and Terraform use a lighter write-then-verify cycle (typecheck/build/`terraform validate` + a manual smoke-test instruction) — consistent with how the original spec's own testing strategy treats infrastructure and frontend differently from domain/services.
- **Commit after every task.** Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`).
- **Learner Lab constraints (from `servicerestrictions.md`), binding on every Terraform task:** region `us-east-1`; no IAM role creation — every role reference is `data "aws_iam_role" "lab"` looking up the pre-existing `LabRole`; RDS burstable instance classes only (nano/micro/small/medium) if not using Aurora; RDS enhanced monitoring must be disabled (`monitoring_interval = 0`); ECS task role and execution role both `LabRole`; ECR pushed as the console user, pulled by `LabRole` (read-only).
- **Secrets never reach a plaintext file or a Terraform variable's literal value where avoidable.** RDS/Aurora master credentials use `manage_master_user_password = true` (AWS-managed, in Secrets Manager, never in Terraform state). The JWT signing secret is the one deliberate exception — generated via `random_password` and stored in Secrets Manager, but its value does land in Terraform state, which is accepted given the "no security hardening" scope of this build. (This constraint governs the separately-owned `infra/terraform/` compute module — see the "Infrastructure ownership note" — but is recorded here since it is a project-wide constraint, not an infra-side implementation detail.)

## File Structure

```
aws-demo-app/
  package.json                         npm workspaces root
  tsconfig.base.json                   strict compiler options
  .gitignore
  .nvmrc
  .env.example                         every env var this app reads, placeholder values
  docker-compose.yml                   dev: postgres + api(dev) + web(dev)
  docker-compose.prod.yml              prod-parity: postgres + api1 + api2 + web(nginx, round-robin)
  docker/
    api.Dockerfile                     deps / dev / build / prod stages
    web.Dockerfile                     dev / build / prod (nginx) stages
    nginx/nginx.conf
  packages/
    shared/
      package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts
      src/{index,enums,pagination,branch,patient,encounter,observation,auth}.ts
      test/{enums,schemas}.test.ts
    api/
      package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, vitest.db.config.ts
      migrations/{001_init.sql,002_reference_data.sql}
      src/
        domain/{errors,patient,encounter,observation}.ts
        ports/{index,branchRepository,patientRepository,encounterRepository,observationRepository,authProvider,instanceIdentity}.ts
        services/{patientService,encounterService,observationService,authService}.ts
        adapters/
          persistence/memory/{store,branchRepository,patientRepository,encounterRepository,observationRepository}.ts
          persistence/postgres/{types,pool,migrator,rowMappers,branchRepository,patientRepository,encounterRepository,observationRepository}.ts
          auth/localJwt/localJwtAuthProvider.ts
          identity/{ecsIdentity,localIdentity}.ts
        http/{server,errorMiddleware,authMiddleware,healthState,validate}.ts
        http/routes/{health,meta,auth,patients,encounters,observations,admin}.ts
        config/env.ts
        composition.ts
        index.ts
        scripts/seed.ts
      test/ (mirrors src/, one *.test.ts per implementation file; test/setup/postgres.globalSetup.ts; test/fixtures/ids.ts)
    web/
      package.json, tsconfig.json, vite.config.ts, index.html
      src/
        main.tsx, App.tsx
        api/client.ts
        auth/AuthContext.tsx
        pages/{LoginPage,PatientsPage,PatientDetailPage,EncounterPage,InfraPage}.tsx
        components/ServedByBadge.tsx
  infra/terraform/                     owned by a separate session (see amendment note above) —
    versions.tf, ...                   this plan does not create versions.tf/providers.tf/modules/**;
                                        it only creates the two files below, which consume that
                                        session's outputs
    environments/learnerlab.tfvars
    scripts/build-and-push.sh
  docs/RUNBOOK.md
```

---

### Task 1: Monorepo scaffold and the database-agnostic environment schema

This task exists first, before any domain code, because it is where the "no service lock-in" requirement gets proven with a test.

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, `.env.example`
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/tsconfig.build.json`, `packages/api/vitest.config.ts`
- Create: `packages/api/src/config/env.ts`
- Test: `packages/api/test/config/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AppConfig` type, `loadConfig(env?: NodeJS.ProcessEnv): AppConfig` — every later task that needs configuration imports this.

- [ ] **Step 1: Create the workspace root files**

`package.json`:

```json
{
  "name": "aethelgard-demo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "test:unit": "npm run test:unit --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "build": "npm run build -w @aethelgard/shared && npm run build -w @aethelgard/api && npm run build -w @aethelgard/web",
    "seed": "npm run seed -w @aethelgard/api"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.2",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
coverage/
.env
.env.local
*.log
.terraform/
*.tfstate
*.tfstate.*
.terraform.lock.hcl
```

`.nvmrc`:

```
22
```

`.env.example` — every variable the application reads, real placeholder shape, with the DB-agnostic contract spelled out:

```
# ---- Application ----
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
APP_VERSION=0.1.0
SERVE_STATIC=false

# ---- Database ----
# Give EITHER a single DATABASE_URL (used by docker-compose locally) OR the
# five split DB_* vars (used by the ECS task definition in AWS, where
# DB_HOST/DB_PORT/DB_NAME/DB_USER come from Terraform outputs and DB_PASSWORD
# is injected from AWS Secrets Manager). config/env.ts assembles the same
# connection string either way, so pointing this at RDS single-AZ, RDS
# Multi-AZ, or an Aurora PostgreSQL cluster is a config change only.
DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard
# DB_HOST=<REPLACE_WITH_TERRAFORM_OUTPUT db_host>
# DB_PORT=5432
# DB_NAME=aethelgard
# DB_USER=aethelgard_app
# DB_PASSWORD=<REPLACE_WITH_SECRETS_MANAGER_VALUE>

# ---- Auth ----
AUTH_DRIVER=localJwt
JWT_SECRET=dev-only-secret-change-me-min-8-chars

# ---- Instance identity ----
# local = container hostname (docker-compose). ecs = ECS task metadata (Fargate).
IDENTITY_DRIVER=local

# ---- AWS (placeholders — filled in from `terraform output` after apply) ----
AWS_REGION=<REPLACE_WITH_TERRAFORM_OUTPUT region>
ECR_REPOSITORY_URL=<REPLACE_WITH_TERRAFORM_OUTPUT ecr_repository_url>
ALB_DNS_NAME=<REPLACE_WITH_TERRAFORM_OUTPUT alb_dns_name>
```

- [ ] **Step 2: Create the api package**

`packages/api/package.json`:

```json
{
  "name": "@aethelgard/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run && vitest run --config vitest.db.config.ts",
    "test:unit": "vitest run",
    "test:db": "vitest run --config vitest.db.config.ts",
    "typecheck": "tsc --noEmit",
    "seed": "tsx src/scripts/seed.ts"
  },
  "dependencies": {
    "@aethelgard/shared": "*",
    "@fastify/static": "^8.0.0",
    "bcryptjs": "^2.4.3",
    "fastify": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.13.1",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/pg": "^8.11.10",
    "@testcontainers/postgresql": "^10.16.0",
    "tsx": "^4.19.2"
  }
}
```

`packages/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@aethelgard/shared": ["../shared/src/index.ts"] }
  },
  "include": ["src", "test", "vitest.config.ts", "vitest.db.config.ts"]
}
```

`packages/api/tsconfig.build.json` — the production build target, separate from the dev/test config above so `noEmit` doesn't have to be fought over:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "paths": {}
  },
  "exclude": ["test", "**/*.test.ts"]
}
```

`packages/api/vitest.config.ts`:

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
    exclude: [...configDefaults.exclude, 'test/postgres/**'],
  },
});
```

- [ ] **Step 3: Write the failing config test**

`packages/api/test/config/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const BASE_ENV = {
  JWT_SECRET: 'dev-only-secret-change-me',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig(BASE_ENV);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.authDriver).toBe('localJwt');
    expect(config.identityDriver).toBe('local');
    expect(config.serveStatic).toBe(false);
  });

  it('uses DATABASE_URL verbatim when provided', () => {
    const config = loadConfig(BASE_ENV);
    expect(config.databaseUrl).toBe('postgresql://u:p@localhost:5432/db');
  });

  it('assembles the same shape of connection string from split DB_* vars, regardless of host format', () => {
    const rdsShape = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'aethelgard.abc123xyz.us-east-1.rds.amazonaws.com',
      DB_NAME: 'aethelgard',
      DB_USER: 'aethelgard_app',
      DB_PASSWORD: 'swap-me',
    });
    const auroraShape = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'aethelgard.cluster-abc123xyz.us-east-1.rds.amazonaws.com',
      DB_NAME: 'aethelgard',
      DB_USER: 'aethelgard_app',
      DB_PASSWORD: 'swap-me',
    });
    expect(rdsShape.databaseUrl).toBe(
      'postgresql://aethelgard_app:swap-me@aethelgard.abc123xyz.us-east-1.rds.amazonaws.com:5432/aethelgard',
    );
    expect(auroraShape.databaseUrl).toBe(
      'postgresql://aethelgard_app:swap-me@aethelgard.cluster-abc123xyz.us-east-1.rds.amazonaws.com:5432/aethelgard',
    );
    // Same construction logic produced both — the only difference is the hostname
    // Terraform handed it. No branch in this code ever asks "is this Aurora?".
  });

  it('URI-encodes special characters in a split-var password', () => {
    const config = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'localhost',
      DB_NAME: 'db',
      DB_USER: 'u',
      DB_PASSWORD: 'p@ss/word?',
    });
    expect(config.databaseUrl).toBe('postgresql://u:p%40ss%2Fword%3F@localhost:5432/db');
  });

  it('respects a custom DB_PORT', () => {
    const config = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_NAME: 'db',
      DB_USER: 'u',
      DB_PASSWORD: 'p',
    });
    expect(config.databaseUrl).toContain(':5433/db');
  });

  it('throws a descriptive error when neither DATABASE_URL nor the full split set is given', () => {
    expect(() => loadConfig({ JWT_SECRET: 'dev-only-secret-change-me' })).toThrow(
      /DATABASE_URL.*DB_HOST/s,
    );
  });

  it('throws when JWT_SECRET is missing or too short', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d' })).toThrow();
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d', JWT_SECRET: 'short' }),
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm install && npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/config/env.js` (package installs first; this also creates `package-lock.json`).

- [ ] **Step 5: Implement `config/env.ts`**

```ts
import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().min(1).default('0.0.0'),
  SERVE_STATIC: z.coerce.boolean().default(false),

  DATABASE_URL: z.string().min(1).optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).optional(),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().min(1).optional(),

  AUTH_DRIVER: z.enum(['localJwt']).default('localJwt'),
  JWT_SECRET: z.string().min(8),

  IDENTITY_DRIVER: z.enum(['local', 'ecs']).default('local'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  logLevel: string;
  appVersion: string;
  serveStatic: boolean;
  databaseUrl: string;
  authDriver: 'localJwt';
  jwtSecret: string;
  identityDriver: 'local' | 'ecs';
};

/**
 * The single place a database's connection details are resolved into one
 * connection string. Everything downstream (pool.ts, migrator.ts, every
 * repository) sees only the returned string — never a host, never a flag
 * saying "this is Aurora". That is what makes swapping RDS single-AZ, RDS
 * Multi-AZ, or Aurora PostgreSQL a deploy-time config change instead of an
 * application code change.
 */
const resolveDatabaseUrl = (env: z.infer<typeof rawEnvSchema>): string => {
  if (env.DATABASE_URL !== undefined) {
    return env.DATABASE_URL;
  }
  if (
    env.DB_HOST !== undefined &&
    env.DB_NAME !== undefined &&
    env.DB_USER !== undefined &&
    env.DB_PASSWORD !== undefined
  ) {
    const user = encodeURIComponent(env.DB_USER);
    const password = encodeURIComponent(env.DB_PASSWORD);
    return `postgresql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
  }
  throw new Error(
    'Set DATABASE_URL, or all of DB_HOST/DB_NAME/DB_USER/DB_PASSWORD (DB_PORT optional, defaults to 5432).',
  );
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = rawEnvSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    appVersion: parsed.APP_VERSION,
    serveStatic: parsed.SERVE_STATIC,
    databaseUrl: resolveDatabaseUrl(parsed),
    authDriver: parsed.AUTH_DRIVER,
    jwtSecret: parsed.JWT_SECRET,
    identityDriver: parsed.IDENTITY_DRIVER,
  };
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 8 tests.

- [ ] **Step 7: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore .nvmrc .env.example packages/api
git commit -m "feat(api): scaffold monorepo and add database-agnostic env config"
```

---

### Task 2: Shared package — enums and entity schemas

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/tsconfig.build.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/{index,enums,pagination,branch,patient,encounter,observation,auth}.ts`
- Test: `packages/shared/test/{enums,schemas}.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `@aethelgard/shared`): `BRANCH_CODES`/`branchCodeSchema`/`BranchCode`, `ROLES`/`roleSchema`/`Role`, `SEXES`/`sexSchema`/`Sex`, `ENCOUNTER_TYPES`/`encounterTypeSchema`/`EncounterType`, `ENCOUNTER_STATUSES`/`encounterStatusSchema`/`EncounterStatus`, `OBSERVATION_CODES`/`observationCodeSchema`/`ObservationCode`, `paginationQuerySchema`/`PaginationQuery`/`Page<T>`, `branchSchema`/`Branch`, `mrnSchema`/`patientSchema`/`Patient`/`createPatientSchema`/`CreatePatientInput`/`updatePatientSchema`/`UpdatePatientInput`, `encounterSchema`/`Encounter`/`createEncounterSchema`/`CreateEncounterInput`/`patchEncounterSchema`/`PatchEncounterInput`, `observationSchema`/`Observation`/`createObservationSchema`/`CreateObservationInput`, `principalSchema`/`Principal`/`loginSchema`/`LoginInput`/`demoUserSchema`/`DemoUser`.

- [ ] **Step 1: Create the package files**

`packages/shared/package.json`:

```json
{
  "name": "@aethelgard/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^4.0.0" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/shared/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "exclude": ["test", "**/*.test.ts"]
}
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 2: Write the failing enum test**

`packages/shared/test/enums.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BRANCH_CODES,
  ENCOUNTER_STATUSES,
  ENCOUNTER_TYPES,
  OBSERVATION_CODES,
  ROLES,
  branchCodeSchema,
  encounterStatusSchema,
  encounterTypeSchema,
  observationCodeSchema,
  roleSchema,
  sexSchema,
} from '../src/index.js';

describe('enum tuples', () => {
  it('pins the three Aethelgard branch codes in order', () => {
    expect(BRANCH_CODES).toEqual(['KL', 'PG', 'JB']);
  });

  it('pins the four clinical roles', () => {
    expect(ROLES).toEqual(['doctor', 'nurse', 'records_clerk', 'admin']);
  });

  it('pins the three encounter types', () => {
    expect(ENCOUNTER_TYPES).toEqual(['outpatient', 'inpatient', 'emergency']);
  });

  it('pins the encounter lifecycle statuses', () => {
    expect(ENCOUNTER_STATUSES).toEqual(['open', 'discharged', 'cancelled']);
  });

  it('pins the five observation codes', () => {
    expect(OBSERVATION_CODES).toEqual([
      'heart_rate',
      'blood_pressure',
      'temperature',
      'spo2',
      'weight',
    ]);
  });
});

describe('enum schemas', () => {
  it('accepts a known branch code and rejects an unknown one', () => {
    expect(branchCodeSchema.parse('PG')).toBe('PG');
    expect(branchCodeSchema.safeParse('SG').success).toBe(false);
  });

  it('rejects a role that is not in the matrix', () => {
    expect(roleSchema.parse('records_clerk')).toBe('records_clerk');
    expect(roleSchema.safeParse('pharmacist').success).toBe(false);
  });

  it('treats unknown sex as a valid recorded value', () => {
    expect(sexSchema.parse('unknown')).toBe('unknown');
    expect(sexSchema.safeParse('').success).toBe(false);
  });

  it('rejects an observation code outside the demo vocabulary', () => {
    expect(observationCodeSchema.parse('spo2')).toBe('spo2');
    expect(observationCodeSchema.safeParse('glucose').success).toBe(false);
  });

  it('rejects an encounter type outside the three admission routes', () => {
    expect(encounterTypeSchema.parse('emergency')).toBe('emergency');
    expect(encounterTypeSchema.safeParse('daycare').success).toBe(false);
  });

  it('rejects an encounter status outside the lifecycle', () => {
    expect(encounterStatusSchema.parse('discharged')).toBe('discharged');
    expect(encounterStatusSchema.safeParse('archived').success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm install && npm run test:unit -w @aethelgard/shared`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement `enums.ts` and `index.ts`**

`packages/shared/src/enums.ts`:

```ts
import { z } from 'zod';

export const BRANCH_CODES = ['KL', 'PG', 'JB'] as const;
export const branchCodeSchema = z.enum(BRANCH_CODES);
export type BranchCode = z.infer<typeof branchCodeSchema>;

export const ROLES = ['doctor', 'nurse', 'records_clerk', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const SEXES = ['male', 'female', 'other', 'unknown'] as const;
export const sexSchema = z.enum(SEXES);
export type Sex = z.infer<typeof sexSchema>;

export const ENCOUNTER_TYPES = ['outpatient', 'inpatient', 'emergency'] as const;
export const encounterTypeSchema = z.enum(ENCOUNTER_TYPES);
export type EncounterType = z.infer<typeof encounterTypeSchema>;

export const ENCOUNTER_STATUSES = ['open', 'discharged', 'cancelled'] as const;
export const encounterStatusSchema = z.enum(ENCOUNTER_STATUSES);
export type EncounterStatus = z.infer<typeof encounterStatusSchema>;

export const OBSERVATION_CODES = [
  'heart_rate',
  'blood_pressure',
  'temperature',
  'spo2',
  'weight',
] as const;
export const observationCodeSchema = z.enum(OBSERVATION_CODES);
export type ObservationCode = z.infer<typeof observationCodeSchema>;
```

`packages/shared/src/index.ts` (grown further in Step 6 below — write the enums-only line now):

```ts
export * from './enums.js';
```

- [ ] **Step 5: Run it to verify the enum tests pass**

Run: `npm run test:unit -w @aethelgard/shared`
Expected: PASS — 11 tests.

- [ ] **Step 6: Write the failing entity-schema test**

`packages/shared/test/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createEncounterSchema,
  createObservationSchema,
  createPatientSchema,
  demoUserSchema,
  encounterSchema,
  loginSchema,
  mrnSchema,
  observationSchema,
  paginationQuerySchema,
  patientSchema,
  principalSchema,
  updatePatientSchema,
} from '../src/index.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-08-07T09:00:00.000Z';

describe('paginationQuerySchema', () => {
  it('defaults to the first page of twenty', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces numeric strings so it can parse a query string directly', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('caps pageSize so a client cannot request an unbounded scan', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});

describe('mrnSchema', () => {
  it('accepts a branch-prefixed medical record number', () => {
    expect(mrnSchema.parse('KL-000123')).toBe('KL-000123');
  });

  it.each(['kl-000123', 'KL-12345', 'KL000123', 'ZZ-000123'])(
    'rejects the malformed MRN %s',
    (candidate) => {
      expect(mrnSchema.safeParse(candidate).success).toBe(false);
    },
  );
});

describe('patientSchema', () => {
  const valid = {
    id: UUID_A,
    mrn: 'KL-000123',
    name: 'Nurul Aisyah binti Rahman',
    dob: '1985-03-14',
    sex: 'female',
    phone: '+60123456789',
    branchId: UUID_B,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };

  it('accepts a complete patient record', () => {
    expect(patientSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an empty name', () => {
    expect(patientSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });
});

describe('createPatientSchema', () => {
  it('does not accept an MRN — the server assigns it', () => {
    const parsed = createPatientSchema.parse({
      mrn: 'KL-000123',
      name: 'Tan Wei Ming',
      dob: '1990-01-01',
      sex: 'male',
      phone: '+60129876543',
    });
    expect(parsed).not.toHaveProperty('mrn');
  });

  it('allows a caller to name the target branch', () => {
    const parsed = createPatientSchema.parse({
      name: 'Tan Wei Ming',
      dob: '1990-01-01',
      sex: 'male',
      phone: '+60129876543',
      branchId: UUID_B,
    });
    expect(parsed.branchId).toBe(UUID_B);
  });
});

describe('updatePatientSchema', () => {
  it('accepts a single-field patch', () => {
    expect(updatePatientSchema.parse({ phone: '+60111111111' })).toEqual({
      phone: '+60111111111',
    });
  });

  it('rejects an empty patch so a no-op write never reaches the database', () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
  });
});

describe('encounterSchema and createEncounterSchema', () => {
  it('accepts an open encounter with no discharge timestamp', () => {
    const valid = {
      id: UUID_A,
      patientId: UUID_B,
      branchId: UUID_B,
      type: 'inpatient',
      department: 'Cardiology',
      admittedAt: NOW,
      dischargedAt: null,
      status: 'open',
    };
    expect(encounterSchema.parse(valid)).toEqual(valid);
  });

  it('defaults status to open and leaves admittedAt optional', () => {
    const parsed = createEncounterSchema.parse({ type: 'outpatient', department: 'General' });
    expect(parsed).toEqual({ type: 'outpatient', department: 'General', status: 'open' });
  });
});

describe('createObservationSchema', () => {
  it('accepts a numeric observation with a unit', () => {
    expect(
      createObservationSchema.parse({ code: 'heart_rate', valueNum: 72, unit: 'bpm' }),
    ).toEqual({ code: 'heart_rate', valueNum: 72, unit: 'bpm' });
  });

  it('accepts a textual observation', () => {
    expect(
      createObservationSchema.parse({ code: 'blood_pressure', valueText: '120/80' }),
    ).toEqual({ code: 'blood_pressure', valueText: '120/80' });
  });

  it('rejects an observation carrying neither a numeric nor a textual value', () => {
    expect(createObservationSchema.safeParse({ code: 'weight' }).success).toBe(false);
  });
});

describe('observationSchema', () => {
  it('accepts a stored observation with explicit nulls', () => {
    const stored = {
      id: UUID_A,
      encounterId: UUID_B,
      code: 'spo2',
      valueNum: 98,
      valueText: null,
      unit: '%',
      recordedAt: NOW,
      recordedBy: UUID_B,
    };
    expect(observationSchema.parse(stored)).toEqual(stored);
  });
});

describe('auth schemas', () => {
  it('accepts a principal carrying branch identity', () => {
    const principal = {
      userId: UUID_A,
      email: 'doc.kl@aethelgard.demo',
      role: 'doctor',
      branchId: UUID_B,
    };
    expect(principalSchema.parse(principal)).toEqual(principal);
  });

  it('rejects a malformed login email', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'demo1234' }).success).toBe(
      false,
    );
  });

  it('exposes no secret on a demo user entry', () => {
    const demoUser = {
      email: 'doc.kl@aethelgard.demo',
      role: 'doctor',
      branchCode: 'KL',
      displayName: 'Dr Lim (Kuala Lumpur)',
    };
    expect(demoUserSchema.parse(demoUser)).toEqual(demoUser);
    expect(demoUserSchema.parse({ ...demoUser, password: 'leaked' })).not.toHaveProperty(
      'password',
    );
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/shared`
Expected: FAIL — the new imports don't exist yet.

- [ ] **Step 8: Implement the remaining schema modules**

`packages/shared/src/pagination.ts`:

```ts
import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
```

`packages/shared/src/branch.ts`:

```ts
import { z } from 'zod';
import { branchCodeSchema } from './enums.js';

export const branchSchema = z.object({
  id: z.uuid(),
  code: branchCodeSchema,
  name: z.string().min(1).max(120),
});
export type Branch = z.infer<typeof branchSchema>;
```

`packages/shared/src/patient.ts`:

```ts
import { z } from 'zod';
import { sexSchema } from './enums.js';

export const mrnSchema = z
  .string()
  .regex(/^(?:KL|PG|JB)-\d{6}$/, 'MRN must be a branch code, a hyphen, and six digits');

export const patientSchema = z.object({
  id: z.uuid(),
  mrn: mrnSchema,
  name: z.string().min(1).max(200),
  dob: z.iso.date(),
  sex: sexSchema,
  phone: z.string().min(6).max(30),
  branchId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export type Patient = z.infer<typeof patientSchema>;

export const createPatientSchema = z
  .object({
    name: z.string().min(1).max(200),
    dob: z.iso.date(),
    sex: sexSchema,
    phone: z.string().min(6).max(30),
    branchId: z.uuid().optional(),
  })
  .strip();
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    dob: z.iso.date().optional(),
    sex: sexSchema.optional(),
    phone: z.string().min(6).max(30).optional(),
  })
  .strip()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be supplied',
  });
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
```

`packages/shared/src/encounter.ts`:

```ts
import { z } from 'zod';
import { encounterStatusSchema, encounterTypeSchema } from './enums.js';

export const encounterSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  branchId: z.uuid(),
  type: encounterTypeSchema,
  department: z.string().min(1).max(120),
  admittedAt: z.iso.datetime(),
  dischargedAt: z.iso.datetime().nullable(),
  status: encounterStatusSchema,
});
export type Encounter = z.infer<typeof encounterSchema>;

export const createEncounterSchema = z
  .object({
    type: encounterTypeSchema,
    department: z.string().min(1).max(120),
    admittedAt: z.iso.datetime().optional(),
    status: encounterStatusSchema.default('open'),
  })
  .strip();
export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;

export const patchEncounterSchema = z
  .object({
    department: z.string().min(1).max(120).optional(),
    status: encounterStatusSchema.optional(),
    dischargedAt: z.iso.datetime().optional(),
  })
  .strip()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be supplied',
  });
export type PatchEncounterInput = z.infer<typeof patchEncounterSchema>;
```

`packages/shared/src/observation.ts`:

```ts
import { z } from 'zod';
import { observationCodeSchema } from './enums.js';

export const observationSchema = z.object({
  id: z.uuid(),
  encounterId: z.uuid(),
  code: observationCodeSchema,
  valueNum: z.number().nullable(),
  valueText: z.string().nullable(),
  unit: z.string().max(20).nullable(),
  recordedAt: z.iso.datetime(),
  recordedBy: z.uuid(),
});
export type Observation = z.infer<typeof observationSchema>;

export const createObservationSchema = z
  .object({
    code: observationCodeSchema,
    valueNum: z.number().optional(),
    valueText: z.string().min(1).max(200).optional(),
    unit: z.string().max(20).optional(),
    recordedAt: z.iso.datetime().optional(),
  })
  .strip()
  .refine((input) => input.valueNum !== undefined || input.valueText !== undefined, {
    message: 'An observation must carry either valueNum or valueText',
  });
export type CreateObservationInput = z.infer<typeof createObservationSchema>;
```

`packages/shared/src/auth.ts`:

```ts
import { z } from 'zod';
import { branchCodeSchema, roleSchema } from './enums.js';

export const principalSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  role: roleSchema,
  branchId: z.uuid(),
});
export type Principal = z.infer<typeof principalSchema>;

export const loginSchema = z
  .object({ email: z.email(), password: z.string().min(8).max(200) })
  .strip();
export type LoginInput = z.infer<typeof loginSchema>;

export const demoUserSchema = z
  .object({
    email: z.email(),
    role: roleSchema,
    branchCode: branchCodeSchema,
    displayName: z.string().min(1).max(120),
  })
  .strip();
export type DemoUser = z.infer<typeof demoUserSchema>;
```

`packages/shared/src/index.ts` (replace the whole file):

```ts
export * from './enums.js';
export * from './pagination.js';
export * from './branch.js';
export * from './patient.js';
export * from './encounter.js';
export * from './observation.js';
export * from './auth.js';
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/shared`
Expected: PASS — all enum tests plus 19 schema tests.

- [ ] **Step 10: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/shared`
Expected: no output, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add entity, pagination and auth Zod schemas"
```

---

### Task 3: Typed error hierarchy and domain invariants

**Files:**
- Create: `packages/api/src/domain/{errors,patient,encounter,observation}.ts`
- Test: `packages/api/test/domain/{errors,patient,encounter,observation}.test.ts`

**Interfaces:**
- Consumes: `BranchCode`, `Encounter`, `PatchEncounterInput`, `EncounterStatus`, `CreateObservationInput` from `@aethelgard/shared`.
- Produces: abstract `DomainError` (`code: string`, `httpStatus: number`, `details: Record<string, unknown>`); `NotFoundError(entityType, id)`, `ValidationError(message, details?)`, `ForbiddenError(message?)`, `ConflictError(message, details?)`, `UpstreamError(message, cause)`; `isDomainError(value): value is DomainError`. `formatMrn(branchCode, sequence): string`, `generateMrnCandidate(branchCode, sequenceSource?): string`, `assertValidDateOfBirth(dob, today): void`. `type EncounterTransition = { department?: string; status?: EncounterStatus; dischargedAt?: string | null }`, `resolveEncounterTransition(encounter, patch, now): EncounterTransition`. `type ObservationValue = { valueNum: number | null; valueText: string | null; unit: string | null }`, `resolveObservationValue(input): ObservationValue`.

- [ ] **Step 1: Write the failing error-hierarchy test**

`packages/api/test/domain/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  ValidationError,
  isDomainError,
} from '../../src/domain/errors.js';

describe('NotFoundError', () => {
  it('carries a 404 status and a machine-readable code', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error.httpStatus).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('patient abc was not found');
    expect(error.details).toEqual({ entityType: 'patient', id: 'abc' });
  });

  it('is a real Error subclass so instanceof and stack traces both work', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('NotFoundError');
  });
});

describe('ValidationError', () => {
  it('carries a 400 status and field-level detail', () => {
    const error = new ValidationError('bad dob', { field: 'dob' });
    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual({ field: 'dob' });
  });
});

describe('ForbiddenError', () => {
  it('carries a 403 status and never leaks details', () => {
    expect(new ForbiddenError().httpStatus).toBe(403);
    expect(new ForbiddenError().message).toBe('Access denied');
    expect(new ForbiddenError('custom').details).toEqual({});
  });
});

describe('ConflictError', () => {
  it('carries a 409 status', () => {
    const error = new ConflictError('MRN already assigned', { mrn: 'KL-000123' });
    expect(error.httpStatus).toBe(409);
    expect(error.details).toEqual({ mrn: 'KL-000123' });
  });
});

describe('UpstreamError', () => {
  it('carries a 502 status and preserves the cause', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new UpstreamError('db unreachable', cause);
    expect(error.httpStatus).toBe(502);
    expect(error.cause).toBe(cause);
  });
});

describe('isDomainError', () => {
  it('recognises domain errors and rejects everything else', () => {
    expect(isDomainError(new NotFoundError('patient', 'a'))).toBe(true);
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/domain/errors.js`.

- [ ] **Step 3: Implement `domain/errors.ts`**

```ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  protected constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
  constructor(entityType: string, id: string) {
    super(`${entityType} ${id} was not found`, { entityType, id });
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

/** Never carries details by construction — a 403 must not reveal whether the resource exists. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
  constructor(message = 'Access denied') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

export class UpstreamError extends DomainError {
  readonly code = 'UPSTREAM_FAILED';
  readonly httpStatus = 502;
  constructor(message: string, cause: unknown) {
    super(message);
    this.cause = cause;
  }
}

export const isDomainError = (value: unknown): value is DomainError =>
  value instanceof DomainError;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 9 tests.

- [ ] **Step 5: Write the failing patient/encounter/observation invariant tests**

`packages/api/test/domain/patient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mrnSchema } from '@aethelgard/shared';
import { ValidationError } from '../../src/domain/errors.js';
import { assertValidDateOfBirth, formatMrn, generateMrnCandidate } from '../../src/domain/patient.js';

describe('formatMrn', () => {
  it('zero-pads the sequence to six digits behind the branch code', () => {
    expect(formatMrn('KL', 123)).toBe('KL-000123');
    expect(formatMrn('JB', 1)).toBe('JB-000001');
  });

  it('produces an MRN the shared schema accepts', () => {
    expect(mrnSchema.safeParse(formatMrn('PG', 999999)).success).toBe(true);
  });

  it('rejects a sequence that will not fit in six digits', () => {
    expect(() => formatMrn('KL', 1_000_000)).toThrow(ValidationError);
  });

  it('rejects a non-positive or fractional sequence', () => {
    expect(() => formatMrn('KL', 0)).toThrow(ValidationError);
    expect(() => formatMrn('KL', 1.5)).toThrow(ValidationError);
  });
});

describe('generateMrnCandidate', () => {
  it('uses the injected sequence source so tests are deterministic', () => {
    expect(generateMrnCandidate('PG', () => 42)).toBe('PG-000042');
  });

  it('produces a schema-valid MRN from the default random source', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(mrnSchema.safeParse(generateMrnCandidate('KL')).success).toBe(true);
    }
  });
});

describe('assertValidDateOfBirth', () => {
  const today = new Date('2026-08-07T00:00:00.000Z');

  it('accepts a date in the past and today', () => {
    expect(() => assertValidDateOfBirth('1985-03-14', today)).not.toThrow();
    expect(() => assertValidDateOfBirth('2026-08-07', today)).not.toThrow();
  });

  it('rejects a date of birth in the future', () => {
    expect(() => assertValidDateOfBirth('2026-08-08', today)).toThrow(ValidationError);
  });

  it('rejects an implausible date before 1900', () => {
    expect(() => assertValidDateOfBirth('1899-12-31', today)).toThrow(ValidationError);
  });

  it('rejects a string that is not a calendar date', () => {
    expect(() => assertValidDateOfBirth('not-a-date', today)).toThrow(ValidationError);
  });
});
```

`packages/api/test/domain/encounter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Encounter } from '@aethelgard/shared';
import { ValidationError } from '../../src/domain/errors.js';
import { resolveEncounterTransition } from '../../src/domain/encounter.js';

const NOW = '2026-08-07T12:00:00.000Z';
const openEncounter: Encounter = {
  id: '11111111-1111-4111-8111-111111111111',
  patientId: '22222222-2222-4222-8222-222222222222',
  branchId: '33333333-3333-4333-8333-333333333333',
  type: 'inpatient',
  department: 'Cardiology',
  admittedAt: '2026-08-05T08:00:00.000Z',
  dischargedAt: null,
  status: 'open',
};

describe('resolveEncounterTransition', () => {
  it('passes a department change through unchanged', () => {
    expect(resolveEncounterTransition(openEncounter, { department: 'Neurology' }, NOW)).toEqual({
      department: 'Neurology',
    });
  });

  it('stamps discharge with the current time when none is supplied', () => {
    expect(resolveEncounterTransition(openEncounter, { status: 'discharged' }, NOW)).toEqual({
      status: 'discharged',
      dischargedAt: NOW,
    });
  });

  it('honours an explicit discharge timestamp', () => {
    const dischargedAt = '2026-08-06T10:00:00.000Z';
    expect(
      resolveEncounterTransition(openEncounter, { status: 'discharged', dischargedAt }, NOW),
    ).toEqual({ status: 'discharged', dischargedAt });
  });

  it('rejects a discharge earlier than the admission', () => {
    expect(() =>
      resolveEncounterTransition(
        openEncounter,
        { status: 'discharged', dischargedAt: '2026-08-04T08:00:00.000Z' },
        NOW,
      ),
    ).toThrow(ValidationError);
  });

  it('rejects re-discharging an already-discharged encounter', () => {
    const discharged: Encounter = { ...openEncounter, status: 'discharged', dischargedAt: NOW };
    expect(() => resolveEncounterTransition(discharged, { department: 'ICU' }, NOW)).toThrow(
      ValidationError,
    );
  });
});
```

`packages/api/test/domain/observation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/errors.js';
import { resolveObservationValue } from '../../src/domain/observation.js';

describe('resolveObservationValue', () => {
  it('passes a numeric value with unit through unchanged', () => {
    expect(resolveObservationValue({ code: 'heart_rate', valueNum: 72, unit: 'bpm' })).toEqual({
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
    });
  });

  it('passes a textual value through unchanged', () => {
    expect(resolveObservationValue({ code: 'blood_pressure', valueText: '120/80' })).toEqual({
      valueNum: null,
      valueText: '120/80',
      unit: null,
    });
  });

  it('rejects a heart_rate outside the plausible clinical range', () => {
    expect(() => resolveObservationValue({ code: 'heart_rate', valueNum: 400 })).toThrow(
      ValidationError,
    );
  });

  it('rejects an spo2 above 100', () => {
    expect(() => resolveObservationValue({ code: 'spo2', valueNum: 101 })).toThrow(ValidationError);
  });

  it('accepts a boundary value', () => {
    expect(() => resolveObservationValue({ code: 'spo2', valueNum: 100 })).not.toThrow();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — `domain/patient.js`, `domain/encounter.js`, `domain/observation.js` don't exist.

- [ ] **Step 7: Implement the three invariant modules**

`packages/api/src/domain/patient.ts`:

```ts
import type { BranchCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

const MRN_DIGITS = 6;
const MRN_MAX_SEQUENCE = 10 ** MRN_DIGITS - 1;
const EARLIEST_PLAUSIBLE_DOB = '1900-01-01';

export const formatMrn = (branchCode: BranchCode, sequence: number): string => {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MRN_MAX_SEQUENCE) {
    throw new ValidationError(
      `MRN sequence must be an integer between 1 and ${MRN_MAX_SEQUENCE}`,
      { field: 'sequence', received: sequence },
    );
  }
  return `${branchCode}-${String(sequence).padStart(MRN_DIGITS, '0')}`;
};

const randomSequence = (): number => 1 + Math.floor(Math.random() * MRN_MAX_SEQUENCE);

/** Candidate only — the unique constraint on `patients.mrn` is the authority; the service retries on ConflictError. */
export const generateMrnCandidate = (
  branchCode: BranchCode,
  sequenceSource: () => number = randomSequence,
): string => formatMrn(branchCode, sequenceSource());

export const assertValidDateOfBirth = (dob: string, today: Date): void => {
  const parsed = Date.parse(`${dob}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(parsed)) {
    throw new ValidationError('Date of birth must be an ISO calendar date (YYYY-MM-DD)', {
      field: 'dob',
      received: dob,
    });
  }
  const todayUtcMidnight = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (parsed > todayUtcMidnight) {
    throw new ValidationError('Date of birth cannot be in the future', { field: 'dob', received: dob });
  }
  if (parsed < Date.parse(`${EARLIEST_PLAUSIBLE_DOB}T00:00:00.000Z`)) {
    throw new ValidationError(`Date of birth cannot be earlier than ${EARLIEST_PLAUSIBLE_DOB}`, {
      field: 'dob',
      received: dob,
    });
  }
};
```

`packages/api/src/domain/encounter.ts`:

```ts
import type { Encounter, EncounterStatus, PatchEncounterInput } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

export type EncounterTransition = {
  department?: string;
  status?: EncounterStatus;
  dischargedAt?: string | null;
};

export const resolveEncounterTransition = (
  encounter: Encounter,
  patch: PatchEncounterInput,
  now: string,
): EncounterTransition => {
  if (encounter.status === 'discharged' || encounter.status === 'cancelled') {
    throw new ValidationError(`Cannot modify a ${encounter.status} encounter`, {
      field: 'status',
      current: encounter.status,
    });
  }

  const transition: EncounterTransition = {};
  if (patch.department !== undefined) {
    transition.department = patch.department;
  }
  if (patch.status !== undefined) {
    transition.status = patch.status;
    if (patch.status === 'discharged') {
      const dischargedAt = patch.dischargedAt ?? now;
      if (Date.parse(dischargedAt) < Date.parse(encounter.admittedAt)) {
        throw new ValidationError('Discharge cannot precede admission', {
          field: 'dischargedAt',
          admittedAt: encounter.admittedAt,
          received: dischargedAt,
        });
      }
      transition.dischargedAt = dischargedAt;
    }
  }
  return transition;
};
```

`packages/api/src/domain/observation.ts`:

```ts
import type { CreateObservationInput, ObservationCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

export type ObservationValue = { valueNum: number | null; valueText: string | null; unit: string | null };

const NUMERIC_RANGES: Partial<Record<ObservationCode, { min: number; max: number }>> = {
  heart_rate: { min: 20, max: 300 },
  temperature: { min: 25, max: 45 },
  spo2: { min: 0, max: 100 },
  weight: { min: 0, max: 500 },
};

export const resolveObservationValue = (input: CreateObservationInput): ObservationValue => {
  const range = NUMERIC_RANGES[input.code];
  if (input.valueNum !== undefined && range !== undefined) {
    if (input.valueNum < range.min || input.valueNum > range.max) {
      throw new ValidationError(`${input.code} must be between ${range.min} and ${range.max}`, {
        field: 'valueNum',
        received: input.valueNum,
      });
    }
  }
  return {
    valueNum: input.valueNum ?? null,
    valueText: input.valueText ?? null,
    unit: input.unit ?? null,
  };
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — errors (9) + patient (9) + encounter (5) + observation (5) = 28 tests.

- [ ] **Step 9: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/domain packages/api/test/domain
git commit -m "feat(api): add typed error hierarchy and domain invariants"
```

---

### Task 4: Ports and in-memory adapters

**Files:**
- Create: `packages/api/src/ports/{index,branchRepository,patientRepository,encounterRepository,observationRepository,authProvider,instanceIdentity}.ts`
- Create: `packages/api/src/adapters/persistence/memory/{store,branchRepository,patientRepository,encounterRepository,observationRepository}.ts`
- Test: `packages/api/test/adapters/memory/{branchRepository,patientRepository,encounterRepository,observationRepository}.test.ts`
- Test: `packages/api/test/fixtures/ids.ts`

**Interfaces:**
- Consumes: entity types from `@aethelgard/shared`.
- Produces every port type and every `createMemory*Repository` factory listed below — Task 5 (services) and Task 7 (Postgres adapters) both implement/consume these exact shapes.

- [ ] **Step 1: Write the ports (no test — these are types and interfaces only, verified by the adapters that implement them)**

`packages/api/src/ports/branchRepository.ts`:

```ts
import type { Branch, BranchCode } from '@aethelgard/shared';

export type BranchRepository = {
  listAll(): Promise<Branch[]>;
  findById(id: string): Promise<Branch | null>;
  findByCode(code: BranchCode): Promise<Branch | null>;
};
```

`packages/api/src/ports/patientRepository.ts`:

```ts
import type { Page, Patient, Sex } from '@aethelgard/shared';

export type NewPatient = {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: Sex;
  phone: string;
  branchId: string;
  createdAt: string;
  updatedAt: string;
};

export type PatientPatch = {
  name?: string;
  dob?: string;
  sex?: Sex;
  phone?: string;
  updatedAt: string;
};

export type PatientSearchQuery = { search?: string; page: number; pageSize: number };

export type PatientRepository = {
  create(input: NewPatient): Promise<Patient>;
  findById(id: string): Promise<Patient | null>;
  findByMrn(mrn: string): Promise<Patient | null>;
  search(query: PatientSearchQuery): Promise<Page<Patient>>;
  update(id: string, patch: PatientPatch): Promise<Patient | null>;
  softDelete(id: string, deletedAt: string): Promise<boolean>;
};
```

`packages/api/src/ports/encounterRepository.ts`:

```ts
import type { Encounter, EncounterStatus, EncounterType } from '@aethelgard/shared';

export type NewEncounter = {
  id: string;
  patientId: string;
  branchId: string;
  type: EncounterType;
  department: string;
  admittedAt: string;
  status: EncounterStatus;
};

export type EncounterPatch = {
  department?: string;
  status?: EncounterStatus;
  dischargedAt?: string | null;
};

export type EncounterRepository = {
  create(input: NewEncounter): Promise<Encounter>;
  findById(id: string): Promise<Encounter | null>;
  listByPatient(patientId: string): Promise<Encounter[]>;
  update(id: string, patch: EncounterPatch): Promise<Encounter | null>;
};
```

`packages/api/src/ports/observationRepository.ts`:

```ts
import type { Observation, ObservationCode } from '@aethelgard/shared';

export type NewObservation = {
  id: string;
  encounterId: string;
  code: ObservationCode;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  recordedAt: string;
  recordedBy: string;
};

export type ObservationRepository = {
  create(input: NewObservation): Promise<Observation>;
  listByEncounter(encounterId: string): Promise<Observation[]>;
};
```

`packages/api/src/ports/authProvider.ts`:

```ts
import type { DemoUser, Principal } from '@aethelgard/shared';

export type LoginResult = { principal: Principal; token: string };

export type AuthProvider = {
  login(email: string, password: string): Promise<LoginResult | null>;
  verify(token: string): Promise<Principal | null>;
  listDemoUsers(): Promise<DemoUser[]>;
};
```

`packages/api/src/ports/instanceIdentity.ts`:

```ts
export type InstanceIdentity = {
  instanceId(): Promise<string>;
  availabilityZone(): Promise<string>;
};
```

`packages/api/src/ports/index.ts`:

```ts
export type { BranchRepository } from './branchRepository.js';
export type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from './patientRepository.js';
export type { EncounterPatch, EncounterRepository, NewEncounter } from './encounterRepository.js';
export type { NewObservation, ObservationRepository } from './observationRepository.js';
export type { AuthProvider, LoginResult } from './authProvider.js';
export type { InstanceIdentity } from './instanceIdentity.js';
```

- [ ] **Step 2: Write the fixed test fixtures**

`packages/api/test/fixtures/ids.ts`:

```ts
export const BRANCH_IDS = {
  KL: '11111111-1111-4111-8111-111111111111',
  PG: '22222222-2222-4222-8222-222222222222',
  JB: '33333333-3333-4333-8333-333333333333',
} as const;

export const USER_IDS = {
  adminKl: '44444444-4444-4444-8444-444444444444',
  doctorKl: '55555555-5555-4555-8555-555555555555',
} as const;
```

- [ ] **Step 3: Write the failing memory-adapter tests**

`packages/api/test/adapters/memory/branchRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryBranchRepository } from '../../../src/adapters/persistence/memory/branchRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

describe('createMemoryBranchRepository', () => {
  it('lists the three seeded branches ordered by code', async () => {
    const repo = createMemoryBranchRepository();
    const branches = await repo.listAll();
    expect(branches.map((b) => b.code)).toEqual(['JB', 'KL', 'PG']);
  });

  it('finds a branch by id and by code', async () => {
    const repo = createMemoryBranchRepository();
    expect((await repo.findById(BRANCH_IDS.KL))?.code).toBe('KL');
    expect((await repo.findByCode('PG'))?.id).toBe(BRANCH_IDS.PG);
  });

  it('returns null for an unknown id', async () => {
    const repo = createMemoryBranchRepository();
    expect(await repo.findById('does-not-exist')).toBeNull();
  });
});
```

`packages/api/test/adapters/memory/patientRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryPatientRepository } from '../../../src/adapters/persistence/memory/patientRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

const newPatient = (overrides: Partial<Parameters<ReturnType<typeof createMemoryPatientRepository>['create']>[0]> = {}) => ({
  id: crypto.randomUUID(),
  mrn: 'KL-000001',
  name: 'Tan Wei Ming',
  dob: '1990-01-01',
  sex: 'male' as const,
  phone: '+60129876543',
  branchId: BRANCH_IDS.KL,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides,
});

describe('createMemoryPatientRepository', () => {
  it('creates and finds a patient by id and by mrn', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient());
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.findByMrn(created.mrn)).toEqual(created);
  });

  it('rejects a duplicate MRN with ConflictError', async () => {
    const repo = createMemoryPatientRepository();
    await repo.create(newPatient({ mrn: 'KL-000002' }));
    await expect(repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000002' }))).rejects.toThrow(
      'ConflictError',
    );
  });

  it('excludes a soft-deleted patient from findById and search', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient({ mrn: 'KL-000003' }));
    await repo.softDelete(created.id, '2026-08-08T00:00:00.000Z');
    expect(await repo.findById(created.id)).toBeNull();
    const page = await repo.search({ page: 1, pageSize: 20 });
    expect(page.items.find((p) => p.id === created.id)).toBeUndefined();
  });

  it('searches by name (case-insensitive substring) and by exact mrn', async () => {
    const repo = createMemoryPatientRepository();
    await repo.create(newPatient({ mrn: 'KL-000004', name: 'Nurul Aisyah' }));
    await repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000005', name: 'Tan Wei Ming' }));
    const byName = await repo.search({ search: 'aisyah', page: 1, pageSize: 20 });
    expect(byName.items).toHaveLength(1);
    const byMrn = await repo.search({ search: 'KL-000005', page: 1, pageSize: 20 });
    expect(byMrn.items).toHaveLength(1);
  });

  it('paginates results and reports the unpaged total', async () => {
    const repo = createMemoryPatientRepository();
    for (let i = 0; i < 5; i += 1) {
      await repo.create(newPatient({ id: crypto.randomUUID(), mrn: `KL-00001${i}`, name: `Patient ${i}` }));
    }
    const page = await repo.search({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('updates mutable fields and stamps updatedAt', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient({ mrn: 'KL-000020' }));
    const updated = await repo.update(created.id, { phone: '+60111111111', updatedAt: '2026-08-09T00:00:00.000Z' });
    expect(updated?.phone).toBe('+60111111111');
    expect(updated?.updatedAt).toBe('2026-08-09T00:00:00.000Z');
  });

  it('returns null when updating or soft-deleting an unknown id', async () => {
    const repo = createMemoryPatientRepository();
    expect(await repo.update('missing', { name: 'X', updatedAt: '2026-08-09T00:00:00.000Z' })).toBeNull();
    expect(await repo.softDelete('missing', '2026-08-09T00:00:00.000Z')).toBe(false);
  });
});
```

`packages/api/test/adapters/memory/encounterRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryEncounterRepository } from '../../../src/adapters/persistence/memory/encounterRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

describe('createMemoryEncounterRepository', () => {
  it('creates an encounter and lists it by patient', async () => {
    const repo = createMemoryEncounterRepository();
    const patientId = crypto.randomUUID();
    const created = await repo.create({
      id: crypto.randomUUID(),
      patientId,
      branchId: BRANCH_IDS.KL,
      type: 'outpatient',
      department: 'General',
      admittedAt: '2026-08-07T00:00:00.000Z',
      status: 'open',
    });
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.listByPatient(patientId)).toEqual([created]);
  });

  it('applies a patch and returns null for an unknown id', async () => {
    const repo = createMemoryEncounterRepository();
    const created = await repo.create({
      id: crypto.randomUUID(),
      patientId: crypto.randomUUID(),
      branchId: BRANCH_IDS.KL,
      type: 'inpatient',
      department: 'Cardiology',
      admittedAt: '2026-08-07T00:00:00.000Z',
      status: 'open',
    });
    const patched = await repo.update(created.id, { status: 'discharged', dischargedAt: '2026-08-08T00:00:00.000Z' });
    expect(patched?.status).toBe('discharged');
    expect(await repo.update('missing', { department: 'X' })).toBeNull();
  });
});
```

`packages/api/test/adapters/memory/observationRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryObservationRepository } from '../../../src/adapters/persistence/memory/observationRepository.js';

describe('createMemoryObservationRepository', () => {
  it('creates an observation and lists it by encounter, oldest first', async () => {
    const repo = createMemoryObservationRepository();
    const encounterId = crypto.randomUUID();
    const first = await repo.create({
      id: crypto.randomUUID(),
      encounterId,
      code: 'heart_rate',
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
      recordedAt: '2026-08-07T00:00:00.000Z',
      recordedBy: crypto.randomUUID(),
    });
    const second = await repo.create({
      id: crypto.randomUUID(),
      encounterId,
      code: 'spo2',
      valueNum: 98,
      valueText: null,
      unit: '%',
      recordedAt: '2026-08-07T01:00:00.000Z',
      recordedBy: crypto.randomUUID(),
    });
    expect(await repo.listByEncounter(encounterId)).toEqual([first, second]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — none of the memory adapter files exist yet.

- [ ] **Step 5: Implement the shared in-memory store and the four adapters**

`packages/api/src/adapters/persistence/memory/store.ts`:

```ts
export const createMap = <T>(): Map<string, T> => new Map<string, T>();
```

`packages/api/src/adapters/persistence/memory/branchRepository.ts`:

```ts
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
```

`packages/api/src/adapters/persistence/memory/patientRepository.ts`:

```ts
import type { Patient } from '@aethelgard/shared';
import { ConflictError } from '../../../domain/errors.js';
import type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryPatientRepository = (): PatientRepository => {
  const rows = createMap<Patient>();

  const isLive = (p: Patient): boolean => p.deletedAt === null;

  return {
    create: async (input: NewPatient) => {
      if ([...rows.values()].some((p) => p.mrn === input.mrn && isLive(p))) {
        throw new ConflictError('A patient with this MRN already exists', { mrn: input.mrn });
      }
      const patient: Patient = { ...input, deletedAt: null };
      rows.set(patient.id, patient);
      return patient;
    },

    findById: async (id) => {
      const found = rows.get(id);
      return found !== undefined && isLive(found) ? found : null;
    },

    findByMrn: async (mrn) => {
      const found = [...rows.values()].find((p) => p.mrn === mrn && isLive(p));
      return found ?? null;
    },

    search: async (query: PatientSearchQuery) => {
      const term = query.search?.trim().toLowerCase();
      const matches = [...rows.values()]
        .filter(isLive)
        .filter((p) => {
          if (term === undefined || term === '') return true;
          return p.name.toLowerCase().includes(term) || p.mrn.toLowerCase() === term;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const start = (query.page - 1) * query.pageSize;
      return {
        items: matches.slice(start, start + query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        total: matches.length,
      };
    },

    update: async (id, patch: PatientPatch) => {
      const found = rows.get(id);
      if (found === undefined || !isLive(found)) return null;
      const updated: Patient = {
        ...found,
        name: patch.name ?? found.name,
        dob: patch.dob ?? found.dob,
        sex: patch.sex ?? found.sex,
        phone: patch.phone ?? found.phone,
        updatedAt: patch.updatedAt,
      };
      rows.set(id, updated);
      return updated;
    },

    softDelete: async (id, deletedAt) => {
      const found = rows.get(id);
      if (found === undefined || !isLive(found)) return false;
      rows.set(id, { ...found, deletedAt, updatedAt: deletedAt });
      return true;
    },
  };
};
```

`packages/api/src/adapters/persistence/memory/encounterRepository.ts`:

```ts
import type { Encounter } from '@aethelgard/shared';
import type { EncounterPatch, EncounterRepository, NewEncounter } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryEncounterRepository = (): EncounterRepository => {
  const rows = createMap<Encounter>();

  return {
    create: async (input: NewEncounter) => {
      const encounter: Encounter = { ...input, dischargedAt: null };
      rows.set(encounter.id, encounter);
      return encounter;
    },
    findById: async (id) => rows.get(id) ?? null,
    listByPatient: async (patientId) =>
      [...rows.values()]
        .filter((e) => e.patientId === patientId)
        .sort((a, b) => a.admittedAt.localeCompare(b.admittedAt)),
    update: async (id, patch: EncounterPatch) => {
      const found = rows.get(id);
      if (found === undefined) return null;
      const updated: Encounter = {
        ...found,
        department: patch.department ?? found.department,
        status: patch.status ?? found.status,
        dischargedAt: patch.dischargedAt !== undefined ? patch.dischargedAt : found.dischargedAt,
      };
      rows.set(id, updated);
      return updated;
    },
  };
};
```

`packages/api/src/adapters/persistence/memory/observationRepository.ts`:

```ts
import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryObservationRepository = (): ObservationRepository => {
  const rows = createMap<Observation>();

  return {
    create: async (input: NewObservation) => {
      const observation: Observation = { ...input };
      rows.set(observation.id, observation);
      return observation;
    },
    listByEncounter: async (encounterId) =>
      [...rows.values()]
        .filter((o) => o.encounterId === encounterId)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
  };
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 3 (branch) + 7 (patient) + 2 (encounter) + 1 (observation) = 13 new tests, 41 total.

- [ ] **Step 7: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/ports packages/api/src/adapters/persistence/memory packages/api/test/adapters/memory packages/api/test/fixtures
git commit -m "feat(api): add repository ports and in-memory adapters"
```

---

### Task 5: Service layer, tested against the in-memory adapters

**Files:**
- Create: `packages/api/src/services/{patientService,encounterService,observationService,authService}.ts`
- Test: `packages/api/test/services/{patientService,encounterService,observationService,authService}.test.ts`

**Interfaces:**
- Consumes: every port and memory adapter from Task 4; `formatMrn`/`generateMrnCandidate`/`assertValidDateOfBirth` from `domain/patient.js`; `resolveEncounterTransition` from `domain/encounter.js`; `resolveObservationValue` from `domain/observation.js`; `NotFoundError`/`ConflictError`/`ForbiddenError` from `domain/errors.js`.
- Produces: `createPatientService(deps)`, `createEncounterService(deps)`, `createObservationService(deps)`, `createAuthService(deps)` — each returns a plain object of async methods. The HTTP layer (Task 11) calls these methods only; it never touches a repository or port directly.

- [ ] **Step 1: Write the failing patient service test**

`packages/api/test/services/patientService.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import { NotFoundError } from '../../src/domain/errors.js';
import { createPatientService } from '../../src/services/patientService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';

const FIXED_NOW = '2026-08-07T00:00:00.000Z';

const buildService = () =>
  createPatientService({
    patients: createMemoryPatientRepository(),
    branches: createMemoryBranchRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `patient-${(n += 1)}`;
    })(),
  });

describe('patientService.create', () => {
  it('generates a branch-prefixed MRN and stamps timestamps', async () => {
    const service = buildService();
    const patient = await service.create(
      { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
      BRANCH_IDS.KL,
    );
    expect(patient.mrn).toMatch(/^KL-\d{6}$/);
    expect(patient.createdAt).toBe(FIXED_NOW);
    expect(patient.branchId).toBe(BRANCH_IDS.KL);
  });

  it('rejects an unknown branch', async () => {
    const service = buildService();
    await expect(
      service.create(
        { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
        'not-a-branch',
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a future date of birth', async () => {
    const service = buildService();
    await expect(
      service.create(
        { name: 'X', dob: '2099-01-01', sex: 'male', phone: '+60100000000' },
        BRANCH_IDS.KL,
      ),
    ).rejects.toThrow(/future/);
  });
});

describe('patientService.get', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const service = buildService();
    await expect(service.get('missing')).rejects.toThrow(NotFoundError);
  });

  it('returns a created patient', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    expect(await service.get(created.id)).toEqual(created);
  });
});

describe('patientService.update and remove', () => {
  it('updates mutable fields', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    const updated = await service.update(created.id, { phone: '+60111111111' });
    expect(updated.phone).toBe('+60111111111');
  });

  it('soft-deletes a patient so a subsequent get throws NotFoundError', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    await service.remove(created.id);
    await expect(service.get(created.id)).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/services/patientService.js`.

- [ ] **Step 3: Implement `services/patientService.ts`**

```ts
import type { CreatePatientInput, Page, Patient, UpdatePatientInput } from '@aethelgard/shared';
import { assertValidDateOfBirth, generateMrnCandidate } from '../domain/patient.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import type { BranchRepository, PatientRepository, PatientSearchQuery } from '../ports/index.js';

export type PatientServiceDeps = {
  patients: PatientRepository;
  branches: BranchRepository;
  now: () => string;
  newId: () => string;
};

const MAX_MRN_ATTEMPTS = 5;

export const createPatientService = (deps: PatientServiceDeps) => ({
  create: async (input: CreatePatientInput, resolvedBranchId: string): Promise<Patient> => {
    const branch = await deps.branches.findById(input.branchId ?? resolvedBranchId);
    if (branch === null) {
      throw new NotFoundError('branch', input.branchId ?? resolvedBranchId);
    }
    assertValidDateOfBirth(input.dob, new Date(deps.now()));
    const timestamp = deps.now();

    for (let attempt = 0; attempt < MAX_MRN_ATTEMPTS; attempt += 1) {
      try {
        return await deps.patients.create({
          id: deps.newId(),
          mrn: generateMrnCandidate(branch.code),
          name: input.name,
          dob: input.dob,
          sex: input.sex,
          phone: input.phone,
          branchId: branch.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === MAX_MRN_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
    throw new ConflictError('Could not generate a unique MRN after several attempts');
  },

  get: async (id: string): Promise<Patient> => {
    const patient = await deps.patients.findById(id);
    if (patient === null) {
      throw new NotFoundError('patient', id);
    }
    return patient;
  },

  search: async (query: PatientSearchQuery): Promise<Page<Patient>> => deps.patients.search(query),

  update: async (id: string, patch: UpdatePatientInput): Promise<Patient> => {
    if (patch.dob !== undefined) {
      assertValidDateOfBirth(patch.dob, new Date(deps.now()));
    }
    const updated = await deps.patients.update(id, { ...patch, updatedAt: deps.now() });
    if (updated === null) {
      throw new NotFoundError('patient', id);
    }
    return updated;
  },

  remove: async (id: string): Promise<void> => {
    const deleted = await deps.patients.softDelete(id, deps.now());
    if (!deleted) {
      throw new NotFoundError('patient', id);
    }
  },
});

export type PatientService = ReturnType<typeof createPatientService>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 7 new tests.

- [ ] **Step 5: Write the failing encounter and observation service tests**

`packages/api/test/services/encounterService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createEncounterService } from '../../src/services/encounterService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';

const FIXED_NOW = '2026-08-07T12:00:00.000Z';

const buildService = () =>
  createEncounterService({
    encounters: createMemoryEncounterRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `encounter-${(n += 1)}`;
    })(),
  });

describe('encounterService', () => {
  it('creates an encounter defaulting admittedAt to now', async () => {
    const service = buildService();
    const encounter = await service.create(
      'patient-1',
      { type: 'outpatient', department: 'General', status: 'open' },
      BRANCH_IDS.KL,
    );
    expect(encounter.admittedAt).toBe(FIXED_NOW);
    expect(encounter.patientId).toBe('patient-1');
  });

  it('lists encounters for a patient', async () => {
    const service = buildService();
    await service.create('patient-1', { type: 'outpatient', department: 'General', status: 'open' }, BRANCH_IDS.KL);
    const list = await service.listByPatient('patient-1');
    expect(list).toHaveLength(1);
  });

  it('discharges an open encounter and rejects re-discharging it', async () => {
    const service = buildService();
    const encounter = await service.create(
      'patient-1',
      { type: 'inpatient', department: 'Cardiology', status: 'open' },
      BRANCH_IDS.KL,
    );
    const discharged = await service.update(encounter.id, { status: 'discharged' });
    expect(discharged.status).toBe('discharged');
    await expect(service.update(encounter.id, { department: 'ICU' })).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError updating an unknown encounter', async () => {
    const service = buildService();
    await expect(service.update('missing', { department: 'X' })).rejects.toThrow(NotFoundError);
  });
});
```

`packages/api/test/services/observationService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { ValidationError } from '../../src/domain/errors.js';
import { createObservationService } from '../../src/services/observationService.js';

const FIXED_NOW = '2026-08-07T12:00:00.000Z';

const buildService = () =>
  createObservationService({
    observations: createMemoryObservationRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `observation-${(n += 1)}`;
    })(),
  });

describe('observationService', () => {
  it('records a numeric observation stamped with the recorder and current time', async () => {
    const service = buildService();
    const observation = await service.create(
      'encounter-1',
      { code: 'heart_rate', valueNum: 72, unit: 'bpm' },
      'user-1',
    );
    expect(observation.recordedAt).toBe(FIXED_NOW);
    expect(observation.recordedBy).toBe('user-1');
    expect(observation.valueNum).toBe(72);
  });

  it('rejects an out-of-range value before it reaches the repository', async () => {
    const service = buildService();
    await expect(
      service.create('encounter-1', { code: 'spo2', valueNum: 150 }, 'user-1'),
    ).rejects.toThrow(ValidationError);
  });

  it('lists observations for an encounter', async () => {
    const service = buildService();
    await service.create('encounter-1', { code: 'heart_rate', valueNum: 72 }, 'user-1');
    expect(await service.listByEncounter('encounter-1')).toHaveLength(1);
  });
});
```

`packages/api/test/services/authService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AuthProvider } from '../../src/ports/index.js';
import { ForbiddenError } from '../../src/domain/errors.js';
import { createAuthService } from '../../src/services/authService.js';

const PRINCIPAL = {
  userId: 'user-1',
  email: 'doctor.kl@aethelgard.demo',
  role: 'doctor' as const,
  branchId: 'branch-1',
};

const fakeAuthProvider = (overrides: Partial<AuthProvider> = {}): AuthProvider => ({
  login: async (email) =>
    email === PRINCIPAL.email ? { principal: PRINCIPAL, token: 'valid-token' } : null,
  verify: async (token) => (token === 'valid-token' ? PRINCIPAL : null),
  listDemoUsers: async () => [
    { email: PRINCIPAL.email, role: 'doctor', branchCode: 'KL', displayName: 'Dr Lim' },
  ],
  ...overrides,
});

describe('authService', () => {
  it('logs in a known user', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    const result = await service.login({ email: PRINCIPAL.email, password: 'demo1234' });
    expect(result.token).toBe('valid-token');
  });

  it('throws ForbiddenError for unknown credentials, without saying which field was wrong', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    await expect(
      service.login({ email: 'nobody@aethelgard.demo', password: 'wrong1234' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('resolves the principal for a valid token and rejects an invalid one', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    expect(await service.me('valid-token')).toEqual(PRINCIPAL);
    await expect(service.me('garbage')).rejects.toThrow(ForbiddenError);
  });

  it('lists demo users', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    expect(await service.demoUsers()).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — `services/encounterService.js`, `services/observationService.js`, `services/authService.js` don't exist.

- [ ] **Step 7: Implement the three remaining services**

`packages/api/src/services/encounterService.ts`:

```ts
import type { CreateEncounterInput, Encounter, PatchEncounterInput } from '@aethelgard/shared';
import { NotFoundError } from '../domain/errors.js';
import { resolveEncounterTransition } from '../domain/encounter.js';
import type { EncounterRepository } from '../ports/index.js';

export type EncounterServiceDeps = {
  encounters: EncounterRepository;
  now: () => string;
  newId: () => string;
};

export const createEncounterService = (deps: EncounterServiceDeps) => ({
  create: async (patientId: string, input: CreateEncounterInput, branchId: string): Promise<Encounter> =>
    deps.encounters.create({
      id: deps.newId(),
      patientId,
      branchId,
      type: input.type,
      department: input.department,
      admittedAt: input.admittedAt ?? deps.now(),
      status: input.status,
    }),

  get: async (id: string): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id);
    if (encounter === null) throw new NotFoundError('encounter', id);
    return encounter;
  },

  listByPatient: async (patientId: string): Promise<Encounter[]> => deps.encounters.listByPatient(patientId),

  update: async (id: string, patch: PatchEncounterInput): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id);
    if (encounter === null) throw new NotFoundError('encounter', id);
    const transition = resolveEncounterTransition(encounter, patch, deps.now());
    const updated = await deps.encounters.update(id, transition);
    if (updated === null) throw new NotFoundError('encounter', id);
    return updated;
  },
});

export type EncounterService = ReturnType<typeof createEncounterService>;
```

`packages/api/src/services/observationService.ts`:

```ts
import type { CreateObservationInput, Observation } from '@aethelgard/shared';
import { resolveObservationValue } from '../domain/observation.js';
import type { ObservationRepository } from '../ports/index.js';

export type ObservationServiceDeps = {
  observations: ObservationRepository;
  now: () => string;
  newId: () => string;
};

export const createObservationService = (deps: ObservationServiceDeps) => ({
  create: async (
    encounterId: string,
    input: CreateObservationInput,
    recordedBy: string,
  ): Promise<Observation> => {
    const value = resolveObservationValue(input);
    return deps.observations.create({
      id: deps.newId(),
      encounterId,
      code: input.code,
      valueNum: value.valueNum,
      valueText: value.valueText,
      unit: value.unit,
      recordedAt: input.recordedAt ?? deps.now(),
      recordedBy,
    });
  },

  listByEncounter: async (encounterId: string): Promise<Observation[]> =>
    deps.observations.listByEncounter(encounterId),
});

export type ObservationService = ReturnType<typeof createObservationService>;
```

`packages/api/src/services/authService.ts`:

```ts
import type { DemoUser, LoginInput, Principal } from '@aethelgard/shared';
import { ForbiddenError } from '../domain/errors.js';
import type { AuthProvider, LoginResult } from '../ports/index.js';

export type AuthServiceDeps = { authProvider: AuthProvider };

export const createAuthService = (deps: AuthServiceDeps) => ({
  login: async (input: LoginInput): Promise<LoginResult> => {
    const result = await deps.authProvider.login(input.email.toLowerCase(), input.password);
    if (result === null) {
      throw new ForbiddenError('Invalid email or password');
    }
    return result;
  },

  me: async (token: string): Promise<Principal> => {
    const principal = await deps.authProvider.verify(token);
    if (principal === null) {
      throw new ForbiddenError('Invalid or expired token');
    }
    return principal;
  },

  demoUsers: async (): Promise<DemoUser[]> => deps.authProvider.listDemoUsers(),
});

export type AuthService = ReturnType<typeof createAuthService>;
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 4 (encounter) + 3 (observation) + 4 (auth) = 11 new tests, 59 total.

- [ ] **Step 9: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/services packages/api/test/services
git commit -m "feat(api): add patient, encounter, observation and auth services"
```

---

### Task 6: Postgres pool, type parsers, and idempotent migrator

Identical rationale to the original spec's Phase 2 Task 1–2: this proves the connection layer against a real Postgres before any repository is written, and the migrator's idempotency is what makes `terraform apply` → container boot → container boot again safe to repeat.

**Files:**
- Create: `packages/api/test/setup/postgres.globalSetup.ts`, `packages/api/vitest.db.config.ts`
- Create: `packages/api/src/adapters/persistence/postgres/{types,pool,migrator}.ts`
- Test: `packages/api/test/postgres/{pool,migrator}.test.ts`

**Interfaces:**
- Consumes: `ConflictError` from `domain/errors.js`.
- Produces: `type Db = { query<R>(text, values?): Promise<QueryResult<R>>; close(): Promise<void>; pool: Pool }`, `createDb(databaseUrl, options?): Db`, `isUniqueViolation(error): boolean`, `runMigrations(db, options?): Promise<string[]>`, `DEFAULT_MIGRATIONS_DIR: string`.

- [ ] **Step 1: Add dependencies and split the test configs**

Run:

```bash
npm run typecheck -w @aethelgard/api
```

(confirms Task 5 is clean before adding new dependencies — `pg`, `bcryptjs`, `jsonwebtoken`, `@testcontainers/postgresql` were already declared in Task 1's `package.json`; this step is just `npm install` picking them up if it hasn't already.)

`packages/api/vitest.config.ts` — add the exclusion for database tests (replace the file from Task 1):

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
    exclude: [...configDefaults.exclude, 'test/postgres/**'],
  },
});
```

`packages/api/vitest.db.config.ts`:

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
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
```

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
 * Starts one Postgres for the whole database test run. Set DB_TEST_URL to
 * point at an already-running Postgres (e.g. the docker-compose stack)
 * instead, and no container is started — this is how you'd point the same
 * test suite at an Aurora or RDS instance to sanity-check compatibility.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const existing = process.env.DB_TEST_URL;
  if (existing !== undefined && existing !== '') {
    project.provide('dbUrl', existing);
    return async () => undefined;
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

- [ ] **Step 2: Write the failing pool test**

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

  it('returns DATE as a YYYY-MM-DD string regardless of local timezone', async () => {
    const result = await db.query<{ dob: string }>('SELECT $1::date AS dob', ['1985-03-14']);
    expect(result.rows[0]?.dob).toBe('1985-03-14');
  });

  it('returns TIMESTAMPTZ as a Date that round-trips to the same ISO string', async () => {
    const iso = '2026-08-07T10:00:00.000Z';
    const result = await db.query<{ at: Date }>('SELECT $1::timestamptz AS at', [iso]);
    expect(result.rows[0]?.at.toISOString()).toBe(iso);
  });

  it('returns a bigint count as a number', async () => {
    const result = await db.query<{ total: number }>(
      'SELECT count(*)::bigint AS total FROM (SELECT 1) AS one',
    );
    expect(result.rows[0]?.total).toBe(1);
    expect(typeof result.rows[0]?.total).toBe('number');
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
    await expect(db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [1])).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('lets every other database error through unchanged', async () => {
    await expect(
      db.query('SELECT * FROM a_table_that_does_not_exist'),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('recognises a unique violation by SQLSTATE', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api`
Expected: FAIL — cannot resolve `pool.js` (the container starts regardless; if it does not, Docker is not running).

- [ ] **Step 4: Implement `types.ts` and `pool.ts`**

`packages/api/src/adapters/persistence/postgres/types.ts`:

```ts
import pg from 'pg';

const { types } = pg;
const OID_DATE = 1082;
const OID_INT8 = 20;

/**
 * DATE would otherwise arrive as a JS Date built at local midnight, shifting
 * a date of birth by a day west of UTC — we want the literal YYYY-MM-DD.
 * INT8 (our only bigints are COUNT results) is returned as a plain number.
 */
types.setTypeParser(OID_DATE, (value: string) => value);
types.setTypeParser(OID_INT8, (value: string) => Number(value));
```

`packages/api/src/adapters/persistence/postgres/pool.ts`:

```ts
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
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — 7 tests.

- [ ] **Step 6: Write the failing migrator test**

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
    const result = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(result.rows.map((r) => r.table_name)).toEqual([
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

  it('is a no-op the second time', async () => {
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
    const result = await db.query<{ id: string; code: string }>('SELECT id, code FROM branches ORDER BY code');
    expect(result.rows).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', code: 'JB' },
      { id: '11111111-1111-4111-8111-111111111111', code: 'KL' },
      { id: '22222222-2222-4222-8222-222222222222', code: 'PG' },
    ]);
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
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/migrator.test.ts`
Expected: FAIL — cannot resolve `migrator.js` (and the migration files don't exist yet — Task 7 adds them; this task's migrator implementation reads whatever `.sql` files it finds, so the test above will fail on a missing-directory error until Task 7 runs. That is expected and documented in Task 7's first step).

- [ ] **Step 8: Implement `migrator.ts`**

```ts
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
```

- [ ] **Step 9: Leave the migrator test failing and proceed to Task 7**

This is the one deliberate exception to "run tests to green before moving on" in this plan: the migrator has nothing to migrate until Task 7 writes the `.sql` files. Do not commit Task 6 as green — commit it as scaffolding, then let Task 7's first step turn it green.

```bash
git add packages/api/vitest.config.ts packages/api/vitest.db.config.ts packages/api/test/setup packages/api/src/adapters/persistence/postgres/types.ts packages/api/src/adapters/persistence/postgres/pool.ts packages/api/src/adapters/persistence/postgres/migrator.ts packages/api/test/postgres
git commit -m "feat(api): add Postgres pool, type parsers and idempotent migrator"
```

---

### Task 7: SQL migrations, row mappers, and the four Postgres repositories

The database-agnosticism claim is proven at the SQL level here: no Aurora-specific or RDS-specific syntax anywhere in these files, only `pg_trgm` (ships with both) and standard PostgreSQL DDL/DML.

**Files:**
- Create: `packages/api/migrations/{001_init.sql,002_reference_data.sql}`
- Create: `packages/api/src/adapters/persistence/postgres/{rowMappers,branchRepository,patientRepository,encounterRepository,observationRepository}.ts`
- Test: `packages/api/test/postgres/{repositories.branch,repositories.patient,repositories.encounter,repositories.observation}.test.ts`

**Interfaces:**
- Consumes: `Db` from `pool.js`; ports from Task 4; entity types from `@aethelgard/shared`.
- Produces: `createPostgresBranchRepository(db): BranchRepository`, `createPostgresPatientRepository(db): PatientRepository`, `createPostgresEncounterRepository(db): EncounterRepository`, `createPostgresObservationRepository(db): ObservationRepository` — Task 12's composition root wires these into the services from Task 5 with no code change to the services themselves.

- [ ] **Step 1: Write the migrations**

`packages/api/migrations/001_init.sql`:

```sql
-- Ships with both RDS PostgreSQL and Aurora PostgreSQL — this is the only
-- non-core-SQL feature this schema uses, and it is not engine-specific.
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
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS patients_branch_id_idx ON patients (branch_id);
CREATE INDEX IF NOT EXISTS patients_name_trgm_idx ON patients USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS encounters (
  id            UUID PRIMARY KEY,
  patient_id    UUID NOT NULL REFERENCES patients (id),
  branch_id     UUID NOT NULL REFERENCES branches (id),
  type          TEXT NOT NULL CHECK (type IN ('outpatient', 'inpatient', 'emergency')),
  department    TEXT NOT NULL,
  admitted_at   TIMESTAMPTZ NOT NULL,
  discharged_at TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('open', 'discharged', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS encounters_patient_id_idx ON encounters (patient_id);

CREATE TABLE IF NOT EXISTS observations (
  id           UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES encounters (id),
  code         TEXT NOT NULL CHECK (code IN ('heart_rate', 'blood_pressure', 'temperature', 'spo2', 'weight')),
  value_num    DOUBLE PRECISION,
  value_text   TEXT,
  unit         TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL,
  recorded_by  UUID NOT NULL REFERENCES users (id),
  CONSTRAINT observations_one_value CHECK ((value_num IS NULL) <> (value_text IS NULL))
);

CREATE INDEX IF NOT EXISTS observations_encounter_id_idx ON observations (encounter_id);
```

`packages/api/migrations/002_reference_data.sql`:

```sql
INSERT INTO branches (id, code, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'KL', 'Aethelgard Kuala Lumpur'),
  ('22222222-2222-4222-8222-222222222222', 'PG', 'Aethelgard Penang'),
  ('33333333-3333-4333-8333-333333333333', 'JB', 'Aethelgard Johor Bahru')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Run Task 6's migrator test to verify it now passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/migrator.test.ts`
Expected: PASS — 6 tests. (This is the deferred green from Task 6, Step 9.)

- [ ] **Step 3: Implement row mappers**

`packages/api/src/adapters/persistence/postgres/rowMappers.ts`:

```ts
import type {
  Branch, BranchCode, Encounter, EncounterStatus, EncounterType,
  Observation, ObservationCode, Patient, Sex,
} from '@aethelgard/shared';

export type BranchRow = { id: string; code: BranchCode; name: string };
export const toBranch = (row: BranchRow): Branch => ({ id: row.id, code: row.code, name: row.name });

export type PatientRow = {
  id: string; mrn: string; name: string; dob: string; sex: Sex; phone: string;
  branch_id: string; created_at: Date; updated_at: Date; deleted_at: Date | null;
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
  id: string; patient_id: string; branch_id: string; type: EncounterType; department: string;
  admitted_at: Date; discharged_at: Date | null; status: EncounterStatus;
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
  id: string; encounter_id: string; code: ObservationCode; value_num: number | null;
  value_text: string | null; unit: string | null; recorded_at: Date; recorded_by: string;
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
```

- [ ] **Step 4: Write the failing branch and patient repository tests**

`packages/api/test/postgres/repositories.branch.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresBranchRepository } from '../../src/adapters/persistence/postgres/branchRepository.js';

let db: Db;

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresBranchRepository', () => {
  it('lists all seeded branches ordered by code', async () => {
    const repo = createPostgresBranchRepository(db);
    expect((await repo.listAll()).map((b) => b.code)).toEqual(['JB', 'KL', 'PG']);
  });

  it('finds by id and by code', async () => {
    const repo = createPostgresBranchRepository(db);
    expect((await repo.findByCode('KL'))?.name).toBe('Aethelgard Kuala Lumpur');
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
```

`packages/api/test/postgres/repositories.patient.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterEach(async () => {
  await db.query('TRUNCATE patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

const newPatient = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  mrn: 'KL-000001',
  name: 'Tan Wei Ming',
  dob: '1990-01-01',
  sex: 'male' as const,
  phone: '+60129876543',
  branchId: KL,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides,
});

describe('createPostgresPatientRepository', () => {
  it('creates and reads back a patient with DATE round-tripping exactly', async () => {
    const repo = createPostgresPatientRepository(db);
    const created = await repo.create(newPatient());
    expect(created.dob).toBe('1990-01-01');
    expect(await repo.findById(created.id)).toEqual(created);
  });

  it('rejects a duplicate MRN with ConflictError', async () => {
    const repo = createPostgresPatientRepository(db);
    await repo.create(newPatient({ mrn: 'KL-000002' }));
    await expect(repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000002' }))).rejects.toThrow(
      'A record with the same unique key already exists',
    );
  });

  it('excludes a soft-deleted patient from findById and search', async () => {
    const repo = createPostgresPatientRepository(db);
    const created = await repo.create(newPatient({ mrn: 'KL-000003' }));
    await repo.softDelete(created.id, '2026-08-08T00:00:00.000Z');
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('searches by trigram name match and paginates', async () => {
    const repo = createPostgresPatientRepository(db);
    await repo.create(newPatient({ mrn: 'KL-000004', name: 'Nurul Aisyah' }));
    await repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000005', name: 'Tan Wei Ming' }));
    const result = await repo.search({ search: 'aisyah', page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api`
Expected: FAIL — `branchRepository.js` and `patientRepository.js` don't exist under `adapters/persistence/postgres`.

- [ ] **Step 6: Implement `branchRepository.ts` and `patientRepository.ts`**

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
    const result = await db.query<BranchRow>(`SELECT ${COLUMNS} FROM branches WHERE id = $1`, [id]);
    return result.rows[0] === undefined ? null : toBranch(result.rows[0]);
  },
  findByCode: async (code: BranchCode): Promise<Branch | null> => {
    const result = await db.query<BranchRow>(`SELECT ${COLUMNS} FROM branches WHERE code = $1`, [code]);
    return result.rows[0] === undefined ? null : toBranch(result.rows[0]);
  },
});
```

`packages/api/src/adapters/persistence/postgres/patientRepository.ts`:

```ts
import type { Page, Patient } from '@aethelgard/shared';
import type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toPatient, type PatientRow } from './rowMappers.js';

const COLUMNS = 'id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at, deleted_at';

const searchParam = (search: string | undefined): string | null => {
  const trimmed = search?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const SEARCH_PREDICATE = `
  deleted_at IS NULL
  AND ($1::text IS NULL OR name ILIKE '%' || $1::text || '%' OR mrn = upper($1::text))`;

export const createPostgresPatientRepository = (db: Db): PatientRepository => ({
  create: async (input: NewPatient): Promise<Patient> => {
    const result = await db.query<PatientRow>(
      `INSERT INTO patients (id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [input.id, input.mrn, input.name, input.dob, input.sex, input.phone, input.branchId, input.createdAt, input.updatedAt],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for patients');
    return toPatient(row);
  },

  findById: async (id: string): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  findByMrn: async (mrn: string): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients WHERE mrn = $1 AND deleted_at IS NULL`,
      [mrn],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  search: async (query: PatientSearchQuery): Promise<Page<Patient>> => {
    const search = searchParam(query.search);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, counted] = await Promise.all([
      db.query<PatientRow>(
        `SELECT ${COLUMNS} FROM patients WHERE ${SEARCH_PREDICATE} ORDER BY name ASC, id ASC LIMIT $2 OFFSET $3`,
        [search, query.pageSize, offset],
      ),
      db.query<{ total: number }>(`SELECT count(*)::bigint AS total FROM patients WHERE ${SEARCH_PREDICATE}`, [search]),
    ]);
    return {
      items: rows.rows.map(toPatient),
      page: query.page,
      pageSize: query.pageSize,
      total: counted.rows[0]?.total ?? 0,
    };
  },

  update: async (id: string, patch: PatientPatch): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `UPDATE patients SET
         name = COALESCE($2::text, name), dob = COALESCE($3::date, dob),
         sex = COALESCE($4::text, sex), phone = COALESCE($5::text, phone), updated_at = $6
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${COLUMNS}`,
      [id, patch.name ?? null, patch.dob ?? null, patch.sex ?? null, patch.phone ?? null, patch.updatedAt],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  softDelete: async (id: string, deletedAt: string): Promise<boolean> => {
    const result = await db.query(
      `UPDATE patients SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, deletedAt],
    );
    return (result.rowCount ?? 0) > 0;
  },
});
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — 2 (branch) + 4 (patient) = 6 new tests.

- [ ] **Step 8: Write the failing encounter and observation repository tests**

`packages/api/test/postgres/repositories.encounter.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterEach(async () => {
  await db.query('TRUNCATE encounters, patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresEncounterRepository', () => {
  it('creates an encounter for a patient and lists it back', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000010', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const created = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'outpatient',
      department: 'General', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    expect(await encounters.findById(created.id)).toEqual(created);
    expect(await encounters.listByPatient(patient.id)).toEqual([created]);
  });

  it('patches status and dischargedAt', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000011', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const created = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'inpatient',
      department: 'Cardiology', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    const updated = await encounters.update(created.id, { status: 'discharged', dischargedAt: '2026-08-08T00:00:00.000Z' });
    expect(updated?.status).toBe('discharged');
    expect(updated?.dischargedAt).toBe('2026-08-08T00:00:00.000Z');
  });
});
```

`packages/api/test/postgres/repositories.observation.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';
import { createPostgresObservationRepository } from '../../src/adapters/persistence/postgres/observationRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, branch_id, display_name)
     VALUES ('77777777-7777-4777-8777-777777777777', 'seed@aethelgard.demo', 'x', 'doctor', $1, 'Seed User')
     ON CONFLICT (id) DO NOTHING`,
    [KL],
  );
});

afterEach(async () => {
  await db.query('TRUNCATE observations, encounters, patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresObservationRepository', () => {
  it('creates and lists observations for an encounter, oldest first', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000020', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const encounter = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'outpatient',
      department: 'General', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    const observations = createPostgresObservationRepository(db);
    const first = await observations.create({
      id: crypto.randomUUID(), encounterId: encounter.id, code: 'heart_rate', valueNum: 72,
      valueText: null, unit: 'bpm', recordedAt: '2026-08-07T00:00:00.000Z',
      recordedBy: '77777777-7777-4777-8777-777777777777',
    });
    expect(await observations.listByEncounter(encounter.id)).toEqual([first]);
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api`
Expected: FAIL — `encounterRepository.js` and `observationRepository.js` don't exist under `adapters/persistence/postgres`.

- [ ] **Step 10: Implement `encounterRepository.ts` and `observationRepository.ts`**

`packages/api/src/adapters/persistence/postgres/encounterRepository.ts`:

```ts
import type { Encounter } from '@aethelgard/shared';
import type { EncounterPatch, EncounterRepository, NewEncounter } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toEncounter, type EncounterRow } from './rowMappers.js';

const COLUMNS = 'id, patient_id, branch_id, type, department, admitted_at, discharged_at, status';

export const createPostgresEncounterRepository = (db: Db): EncounterRepository => ({
  create: async (input: NewEncounter): Promise<Encounter> => {
    const result = await db.query<EncounterRow>(
      `INSERT INTO encounters (id, patient_id, branch_id, type, department, admitted_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
      [input.id, input.patientId, input.branchId, input.type, input.department, input.admittedAt, input.status],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for encounters');
    return toEncounter(row);
  },

  findById: async (id: string): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(`SELECT ${COLUMNS} FROM encounters WHERE id = $1`, [id]);
    return result.rows[0] === undefined ? null : toEncounter(result.rows[0]);
  },

  listByPatient: async (patientId: string): Promise<Encounter[]> => {
    const result = await db.query<EncounterRow>(
      `SELECT ${COLUMNS} FROM encounters WHERE patient_id = $1 ORDER BY admitted_at ASC`,
      [patientId],
    );
    return result.rows.map(toEncounter);
  },

  update: async (id: string, patch: EncounterPatch): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(
      `UPDATE encounters SET
         department = COALESCE($2::text, department),
         status = COALESCE($3::text, status),
         discharged_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE discharged_at END
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, patch.department ?? null, patch.status ?? null, patch.dischargedAt !== undefined, patch.dischargedAt ?? null],
    );
    return result.rows[0] === undefined ? null : toEncounter(result.rows[0]);
  },
});
```

`packages/api/src/adapters/persistence/postgres/observationRepository.ts`:

```ts
import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toObservation, type ObservationRow } from './rowMappers.js';

const COLUMNS = 'id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by';

export const createPostgresObservationRepository = (db: Db): ObservationRepository => ({
  create: async (input: NewObservation): Promise<Observation> => {
    const result = await db.query<ObservationRow>(
      `INSERT INTO observations (id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
      [input.id, input.encounterId, input.code, input.valueNum, input.valueText, input.unit, input.recordedAt, input.recordedBy],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for observations');
    return toObservation(row);
  },

  listByEncounter: async (encounterId: string): Promise<Observation[]> => {
    const result = await db.query<ObservationRow>(
      `SELECT ${COLUMNS} FROM observations WHERE encounter_id = $1 ORDER BY recorded_at ASC`,
      [encounterId],
    );
    return result.rows.map(toObservation);
  },
});
```

- [ ] **Step 11: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — 2 (encounter) + 1 (observation) = 3 new tests, all Postgres tests green.

- [ ] **Step 12: Verify the unit loop still needs no Docker**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS, no container starts.

- [ ] **Step 13: Commit**

```bash
git add packages/api/migrations packages/api/src/adapters/persistence/postgres packages/api/test/postgres
git commit -m "feat(api): add SQL migrations, row mappers and Postgres repositories"
```

---

### Task 8: `localJwt` auth adapter

**Files:**
- Create: `packages/api/src/adapters/auth/localJwt/localJwtAuthProvider.ts`
- Test: `packages/api/test/postgres/localJwtAuthProvider.test.ts`

**Interfaces:**
- Consumes: `Db` from `pool.js`; `AuthProvider`, `LoginResult` from `ports/index.js`; `Principal`, `DemoUser` from `@aethelgard/shared`.
- Produces: `createLocalJwtAuthProvider(db: Db, jwtSecret: string): AuthProvider` — Task 12's composition root wires this in when `config.authDriver === 'localJwt'` (the only driver this build supports; the port shape is what lets a future Cognito adapter be added without touching `AuthService` or any route).

- [ ] **Step 1: Write the failing test**

`packages/api/test/postgres/localJwtAuthProvider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/localJwtAuthProvider.test.ts`
Expected: FAIL — cannot resolve `localJwtAuthProvider.js`.

- [ ] **Step 3: Implement `localJwtAuthProvider.ts`**

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/localJwtAuthProvider.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/adapters/auth packages/api/test/postgres/localJwtAuthProvider.test.ts
git commit -m "feat(api): add localJwt auth adapter"
```

---

### Task 9: Instance identity adapters

**Files:**
- Create: `packages/api/src/adapters/identity/{ecsIdentity,localIdentity}.ts`
- Test: `packages/api/test/adapters/identity/{ecsIdentity,localIdentity}.test.ts`

**Interfaces:**
- Consumes: `InstanceIdentity` port from Task 4.
- Produces: `createLocalIdentity(): InstanceIdentity`, `createEcsIdentity(fetchImpl?: typeof fetch): InstanceIdentity` — Task 12's composition root picks one based on `config.identityDriver` and resolves both methods **once at boot** (not per-request — see Task 10).

- [ ] **Step 1: Write the failing tests**

`packages/api/test/adapters/identity/localIdentity.test.ts`:

```ts
import { hostname } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createLocalIdentity } from '../../../src/adapters/identity/localIdentity.js';

describe('createLocalIdentity', () => {
  it('reports the container/host hostname as the instance id', async () => {
    const identity = createLocalIdentity();
    expect(await identity.instanceId()).toBe(hostname());
  });

  it('reports a fixed local availability zone label', async () => {
    const identity = createLocalIdentity();
    expect(await identity.availabilityZone()).toBe('local');
  });
});
```

`packages/api/test/adapters/identity/ecsIdentity.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../../../src/domain/errors.js';
import { createEcsIdentity } from '../../../src/adapters/identity/ecsIdentity.js';

const ORIGINAL_ENV = process.env.ECS_CONTAINER_METADATA_URI_V4;

describe('createEcsIdentity', () => {
  afterEach(() => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = ORIGINAL_ENV;
  });

  it('parses the task ARN and availability zone from the ECS metadata endpoint', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://169.254.170.2/v4/abc123';
    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          TaskARN: 'arn:aws:ecs:us-east-1:111111111111:task/aethelgard-demo/abc123',
          AvailabilityZone: 'us-east-1a',
        }),
        { status: 200 },
      ),
    );
    const identity = createEcsIdentity(fakeFetch as unknown as typeof fetch);
    expect(await identity.instanceId()).toBe('abc123');
    expect(await identity.availabilityZone()).toBe('us-east-1a');
    expect(fakeFetch).toHaveBeenCalledWith('http://169.254.170.2/v4/abc123/task');
  });

  it('throws UpstreamError when the metadata endpoint is unset', async () => {
    delete process.env.ECS_CONTAINER_METADATA_URI_V4;
    const identity = createEcsIdentity();
    await expect(identity.instanceId()).rejects.toThrow(UpstreamError);
  });

  it('throws UpstreamError when the metadata endpoint responds with an error', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://169.254.170.2/v4/abc123';
    const fakeFetch = vi.fn(async () => new Response('', { status: 500 }));
    const identity = createEcsIdentity(fakeFetch as unknown as typeof fetch);
    await expect(identity.instanceId()).rejects.toThrow(UpstreamError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — `localIdentity.js` and `ecsIdentity.js` don't exist.

- [ ] **Step 3: Implement both adapters**

`packages/api/src/adapters/identity/localIdentity.ts`:

```ts
import { hostname } from 'node:os';
import type { InstanceIdentity } from '../../ports/index.js';

/** Docker Compose sets the container hostname explicitly (see Task 18) — this is what makes X-Served-By rotate locally without AWS. */
export const createLocalIdentity = (): InstanceIdentity => ({
  instanceId: async () => hostname(),
  availabilityZone: async () => 'local',
});
```

`packages/api/src/adapters/identity/ecsIdentity.ts`:

```ts
import { UpstreamError } from '../../domain/errors.js';
import type { InstanceIdentity } from '../../ports/index.js';

type EcsTaskMetadata = { TaskARN: string; AvailabilityZone: string };

const parseTaskId = (taskArn: string): string => taskArn.split('/').at(-1) ?? taskArn;

const fetchTaskMetadata = async (fetchImpl: typeof fetch): Promise<EcsTaskMetadata> => {
  const base = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (base === undefined || base === '') {
    throw new UpstreamError(
      'ECS_CONTAINER_METADATA_URI_V4 is not set — IDENTITY_DRIVER=ecs requires the ECS task metadata endpoint',
      null,
    );
  }
  let response: Response;
  try {
    response = await fetchImpl(`${base}/task`);
  } catch (error) {
    throw new UpstreamError('Could not reach the ECS task metadata endpoint', error);
  }
  if (!response.ok) {
    throw new UpstreamError(`ECS task metadata endpoint returned HTTP ${response.status}`, null);
  }
  return (await response.json()) as EcsTaskMetadata;
};

/**
 * Reads ECS_CONTAINER_METADATA_URI_V4 (present on every Fargate and EC2-launch-type
 * ECS task — this adapter does not care which). `fetchImpl` is injectable for tests.
 */
export const createEcsIdentity = (fetchImpl: typeof fetch = fetch): InstanceIdentity => ({
  instanceId: async () => parseTaskId((await fetchTaskMetadata(fetchImpl)).TaskARN),
  availabilityZone: async () => (await fetchTaskMetadata(fetchImpl)).AvailabilityZone,
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 2 (local) + 3 (ecs) = 5 new tests.

- [ ] **Step 5: Verify the typecheck passes and commit**

```bash
npm run typecheck -w @aethelgard/api
git add packages/api/src/adapters/identity packages/api/test/adapters/identity
git commit -m "feat(api): add ecs and local instance identity adapters"
```

---

### Task 10: HTTP server core — bootstrap, error/auth middleware, health and meta routes

**Files:**
- Create: `packages/api/src/http/{server,errorMiddleware,authMiddleware,healthState,validate}.ts`
- Create: `packages/api/src/http/routes/{health,meta}.ts`
- Test: `packages/api/test/http/{server,health,meta}.test.ts`

**Interfaces:**
- Consumes: `Db` from `pool.js`; `AuthProvider` from `ports/index.js`; `isDomainError` from `domain/errors.js`.
- Produces: `type ServerDeps = { db: Db; authProvider: AuthProvider; instanceId: string; availabilityZone: string; appVersion: string; authDriverName: string; identityDriverName: string; serveStatic: boolean; staticRoot?: string }`, `buildServer(deps: ServerDeps): FastifyInstance`. Task 11 extends both `ServerDeps` and the routes `buildServer` registers; Task 12 is the only caller of `buildServer`.

- [ ] **Step 1: Write the failing test for the error middleware, auth middleware, and health/meta routes together**

`packages/api/test/http/server.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildServer, type ServerDeps } from '../../src/http/server.js';
import { setForcedUnhealthy } from '../../src/http/healthState.js';
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';
import type { AuthProvider } from '../../src/ports/index.js';

const PRINCIPAL = { userId: 'user-1', email: 'doc@aethelgard.demo', role: 'doctor' as const, branchId: 'branch-1' };

const buildDeps = (overrides: Partial<ServerDeps> = {}): ServerDeps => ({
  db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), close: vi.fn(), pool: {} } as unknown as Db,
  authProvider: {
    login: vi.fn(),
    verify: vi.fn(async (token: string) => (token === 'valid-token' ? PRINCIPAL : null)),
    listDemoUsers: vi.fn(),
  } as unknown as AuthProvider,
  instanceId: 'test-instance-1',
  availabilityZone: 'test-az-1',
  appVersion: '0.1.0-test',
  authDriverName: 'localJwt',
  identityDriverName: 'local',
  serveStatic: false,
  ...overrides,
});

describe('GET /health', () => {
  it('returns 200 when the database is reachable', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('returns 503 when the database query throws', async () => {
    const app = buildServer(
      buildDeps({ db: { query: vi.fn(async () => { throw new Error('down'); }), close: vi.fn(), pool: {} } as unknown as Db }),
    );
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
  });

  it('returns 503 when forced unhealthy, and recovers when un-forced', async () => {
    const app = buildServer(buildDeps());
    setForcedUnhealthy(true);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
    setForcedUnhealthy(false);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});

describe('every response', () => {
  it('carries X-Served-By and X-AZ headers from the resolved instance identity', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-served-by']).toBe('test-instance-1');
    expect(response.headers['x-az']).toBe('test-az-1');
  });
});

describe('GET /api/meta', () => {
  it('requires authentication', async () => {
    const app = buildServer(buildDeps());
    expect((await app.inject({ method: 'GET', url: '/api/meta' })).statusCode).toBe(401);
  });

  it('reports instance identity, version and active adapters when authenticated', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({
      method: 'GET',
      url: '/api/meta',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      instanceId: 'test-instance-1',
      availabilityZone: 'test-az-1',
      version: '0.1.0-test',
      adapters: { db: 'postgres', auth: 'localJwt', identity: 'local' },
    });
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});

describe('error translation', () => {
  it('returns 404 with a machine-readable code for an unknown route', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/http/server.js`.

- [ ] **Step 3: Implement the middleware, health state, and validation helper**

`packages/api/src/http/healthState.ts`:

```ts
let forcedUnhealthy = false;

export const isForcedUnhealthy = (): boolean => forcedUnhealthy;
export const setForcedUnhealthy = (value: boolean): void => {
  forcedUnhealthy = value;
};
```

`packages/api/src/http/errorMiddleware.ts`:

```ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { isDomainError } from '../domain/errors.js';

export const errorHandler = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void => {
  if (isDomainError(error)) {
    reply.code(error.httpStatus).send({
      code: error.code,
      message: error.message,
      details: error.details,
      requestId: request.id,
    });
    return;
  }
  request.log.error({ err: error }, 'unhandled error');
  reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: request.id });
};
```

`packages/api/src/http/validate.ts`:

```ts
import type { ZodType } from 'zod';
import { ValidationError } from '../domain/errors.js';

export const parseWith = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Request failed validation', {
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
};
```

`packages/api/src/http/authMiddleware.ts`:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Principal } from '@aethelgard/shared';
import type { AuthProvider } from '../ports/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export const createRequireAuth =
  (authProvider: AuthProvider) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (token === undefined) {
      await reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Missing bearer token' });
      return;
    }
    const principal = await authProvider.verify(token);
    if (principal === null) {
      await reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Invalid or expired token' });
      return;
    }
    request.principal = principal;
  };
```

- [ ] **Step 4: Implement the health and meta routes**

`packages/api/src/http/routes/health.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../adapters/persistence/postgres/pool.js';
import { isForcedUnhealthy } from '../healthState.js';

export const registerHealthRoute = (fastify: FastifyInstance, db: Db): void => {
  fastify.get('/health', async (request, reply) => {
    if (isForcedUnhealthy()) {
      reply.code(503).send({ status: 'unhealthy', reason: 'forced' });
      return;
    }
    try {
      await db.query('SELECT 1');
      reply.code(200).send({ status: 'ok' });
    } catch (error) {
      request.log.error({ err: error }, 'health check database query failed');
      reply.code(503).send({ status: 'unhealthy', reason: 'database' });
    }
  });
};
```

`packages/api/src/http/routes/meta.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../server.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerMetaRoute = (
  fastify: FastifyInstance,
  deps: Pick<ServerDeps, 'instanceId' | 'availabilityZone' | 'appVersion' | 'authDriverName' | 'identityDriverName'>,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/meta', { preHandler: requireAuth }, async (_request, reply) => {
    reply.send({
      instanceId: deps.instanceId,
      availabilityZone: deps.availabilityZone,
      version: deps.appVersion,
      uptimeSeconds: process.uptime(),
      adapters: { db: 'postgres', auth: deps.authDriverName, identity: deps.identityDriverName },
    });
  });
};
```

- [ ] **Step 5: Implement `server.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthProvider } from '../ports/index.js';
import type { Db } from '../adapters/persistence/postgres/pool.js';
import { errorHandler } from './errorMiddleware.js';
import { createRequireAuth } from './authMiddleware.js';
import { registerHealthRoute } from './routes/health.js';
import { registerMetaRoute } from './routes/meta.js';

export type ServerDeps = {
  db: Db;
  authProvider: AuthProvider;
  instanceId: string;
  availabilityZone: string;
  appVersion: string;
  authDriverName: string;
  identityDriverName: string;
  serveStatic: boolean;
  staticRoot?: string;
};

export const buildServer = (deps: ServerDeps): FastifyInstance => {
  const fastify = Fastify({ logger: true, disableRequestLogging: true });

  fastify.decorateRequest('principal', undefined);
  fastify.setErrorHandler(errorHandler);

  // X-Served-By / X-AZ on every response — instance identity resolved once at
  // boot (Task 12), so this is a synchronous header set, never an await per request.
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Served-By', deps.instanceId);
    reply.header('X-AZ', deps.availabilityZone);
    return payload;
  });

  const requireAuth = createRequireAuth(deps.authProvider);

  registerHealthRoute(fastify, deps.db);
  registerMetaRoute(fastify, deps, requireAuth);

  return fastify;
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 8 new tests.

- [ ] **Step 7: Verify the typecheck passes and commit**

```bash
npm run typecheck -w @aethelgard/api
git add packages/api/src/http packages/api/test/http
git commit -m "feat(api): add Fastify server core, error/auth middleware, health and meta routes"
```

---

### Task 11: Auth, patients, encounters, observations, and admin routes

**Files:**
- Create: `packages/api/src/http/routes/{auth,patients,encounters,observations,admin}.ts`
- Modify: `packages/api/src/http/server.ts` — extend `ServerDeps` and register the five new route modules
- Create: `packages/api/test/http/testServer.ts` (test helper, not a `*.test.ts` file)
- Test: `packages/api/test/http/routes.{auth,patients,encounters,admin}.test.ts`

**Interfaces:**
- Consumes: `PatientService`, `EncounterService`, `ObservationService`, `AuthService` from Task 5; `ServerDeps`, `buildServer` from Task 10; `parseWith` from `validate.js`; `paginationQuerySchema`, `createPatientSchema`, `updatePatientSchema`, `createEncounterSchema`, `patchEncounterSchema`, `createObservationSchema`, `loginSchema` from `@aethelgard/shared`.
- Produces: the full REST surface. Extended `ServerDeps` (adds `patients: PatientService; encounters: EncounterService; observations: ObservationService; auth: AuthService`) — Task 12's composition root is the only place that builds a value of this type.

- [ ] **Step 1: Write the test helper**

`packages/api/test/http/testServer.ts`:

```ts
import { vi } from 'vitest';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { createPatientService } from '../../src/services/patientService.js';
import { createEncounterService } from '../../src/services/encounterService.js';
import { createObservationService } from '../../src/services/observationService.js';
import { createAuthService } from '../../src/services/authService.js';
import { buildServer, type ServerDeps } from '../../src/http/server.js';
import type { AuthProvider } from '../../src/ports/index.js';
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';

export const TEST_PRINCIPAL = {
  userId: 'user-1',
  email: 'doctor.kl@aethelgard.demo',
  role: 'doctor' as const,
  branchId: '11111111-1111-4111-8111-111111111111',
};

export const AUTH_HEADER = { authorization: 'Bearer valid-token' };

/** Real services over in-memory adapters, so route tests exercise real validation and business rules — only the AuthProvider and Db are faked. */
export const buildTestServer = () => {
  let sequence = 0;
  const newId = () => `id-${(sequence += 1)}`;
  const now = () => '2026-08-07T12:00:00.000Z';

  const authProvider: AuthProvider = {
    login: vi.fn(async (email: string) =>
      email === TEST_PRINCIPAL.email ? { principal: TEST_PRINCIPAL, token: 'valid-token' } : null,
    ),
    verify: vi.fn(async (token: string) => (token === 'valid-token' ? TEST_PRINCIPAL : null)),
    listDemoUsers: vi.fn(async () => [
      { email: TEST_PRINCIPAL.email, role: 'doctor', branchCode: 'KL' as const, displayName: 'Dr Lim' },
    ]),
  };

  const deps: ServerDeps = {
    db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), close: vi.fn(), pool: {} } as unknown as Db,
    authProvider,
    instanceId: 'test-instance-1',
    availabilityZone: 'test-az-1',
    appVersion: '0.1.0-test',
    authDriverName: 'localJwt',
    identityDriverName: 'local',
    serveStatic: false,
    patients: createPatientService({ patients: createMemoryPatientRepository(), branches: createMemoryBranchRepository(), now, newId }),
    encounters: createEncounterService({ encounters: createMemoryEncounterRepository(), now, newId }),
    observations: createObservationService({ observations: createMemoryObservationRepository(), now, newId }),
    auth: createAuthService({ authProvider }),
  };

  return { app: buildServer(deps), deps };
};
```

- [ ] **Step 2: Write the failing route tests**

`packages/api/test/http/routes.auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, TEST_PRINCIPAL, AUTH_HEADER } from './testServer.js';

describe('POST /api/auth/login', () => {
  it('returns a token and principal for a known demo user', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_PRINCIPAL.email, password: 'demo1234' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: 'valid-token', principal: { email: TEST_PRINCIPAL.email } });
  });

  it('returns 403 for unknown credentials', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@aethelgard.demo', password: 'wrongwrong' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns 400 for a malformed body', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'not-an-email' } });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/auth/demo-users', () => {
  it('lists demo users with no secret', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/api/auth/demo-users' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { email: TEST_PRINCIPAL.email, role: 'doctor', branchCode: 'KL', displayName: 'Dr Lim' },
    ]);
  });
});

describe('GET /api/auth/me', () => {
  it('requires authentication and returns the principal when authenticated', async () => {
    const { app } = buildTestServer();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: AUTH_HEADER });
    expect(response.json()).toEqual(TEST_PRINCIPAL);
  });
});
```

`packages/api/test/http/routes.patients.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';

const createPatient = async (app: ReturnType<typeof buildTestServer>['app']) =>
  app
    .inject({
      method: 'POST',
      url: '/api/patients',
      headers: AUTH_HEADER,
      payload: { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
    })
    .then((r) => r.json());

describe('patients routes', () => {
  it('POST /api/patients requires authentication', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('POST /api/patients creates a patient defaulting to the caller\'s branch', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    expect(patient.mrn).toMatch(/^KL-\d{6}$/);
  });

  it('GET /api/patients/:id returns the created patient; unknown id returns 404', async () => {
    const { app } = buildTestServer();
    const created = await createPatient(app);
    const found = await app.inject({ method: 'GET', url: `/api/patients/${created.id}`, headers: AUTH_HEADER });
    expect(found.json()).toEqual(created);
    const missing = await app.inject({ method: 'GET', url: '/api/patients/does-not-exist', headers: AUTH_HEADER });
    expect(missing.statusCode).toBe(404);
  });

  it('GET /api/patients searches and paginates', async () => {
    const { app } = buildTestServer();
    await createPatient(app);
    const response = await app.inject({ method: 'GET', url: '/api/patients?search=Tan&page=1&pageSize=10', headers: AUTH_HEADER });
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('PATCH /api/patients/:id updates a field', async () => {
    const { app } = buildTestServer();
    const created = await createPatient(app);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/patients/${created.id}`,
      headers: AUTH_HEADER,
      payload: { phone: '+60111111111' },
    });
    expect(response.json().phone).toBe('+60111111111');
  });

  it('DELETE /api/patients/:id soft-deletes; a subsequent GET is 404', async () => {
    const { app } = buildTestServer();
    const created = await createPatient(app);
    expect((await app.inject({ method: 'DELETE', url: `/api/patients/${created.id}`, headers: AUTH_HEADER })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/patients/${created.id}`, headers: AUTH_HEADER })).statusCode).toBe(404);
  });
});
```

`packages/api/test/http/routes.encounters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';

const createPatient = async (app: ReturnType<typeof buildTestServer>['app']) =>
  app
    .inject({
      method: 'POST', url: '/api/patients', headers: AUTH_HEADER,
      payload: { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
    })
    .then((r) => r.json());

describe('encounter and observation routes', () => {
  it('POST /api/patients/:id/encounters creates an encounter for that patient', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const response = await app.inject({
      method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER,
      payload: { type: 'outpatient', department: 'General' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().patientId).toBe(patient.id);
  });

  it('GET /api/patients/:id/encounters lists them', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    await app.inject({
      method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER,
      payload: { type: 'outpatient', department: 'General' },
    });
    const response = await app.inject({ method: 'GET', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER });
    expect(response.json()).toHaveLength(1);
  });

  it('PATCH /api/encounters/:id discharges an encounter', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'inpatient', department: 'Cardiology' } })
      .then((r) => r.json());
    const response = await app.inject({
      method: 'PATCH', url: `/api/encounters/${encounter.id}`, headers: AUTH_HEADER, payload: { status: 'discharged' },
    });
    expect(response.json().status).toBe('discharged');
  });

  it('POST /api/encounters/:id/observations records an observation stamped with the caller', async () => {
    const { app, deps } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'outpatient', department: 'General' } })
      .then((r) => r.json());
    const response = await app.inject({
      method: 'POST', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER,
      payload: { code: 'heart_rate', valueNum: 72, unit: 'bpm' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.recordedBy).toBe((await deps.authProvider.verify('valid-token'))?.userId);
  });

  it('GET /api/encounters/:id/observations lists them oldest first', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'outpatient', department: 'General' } })
      .then((r) => r.json());
    await app.inject({ method: 'POST', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER, payload: { code: 'heart_rate', valueNum: 72 } });
    const response = await app.inject({ method: 'GET', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER });
    expect(response.json()).toHaveLength(1);
  });
});
```

`packages/api/test/http/routes.admin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';
import { setForcedUnhealthy } from '../../src/http/healthState.js';

describe('admin routes', () => {
  it('POST /api/admin/health/fail then /recover flips the /health status', async () => {
    const { app } = buildTestServer();
    setForcedUnhealthy(false);
    await app.inject({ method: 'POST', url: '/api/admin/health/fail', headers: AUTH_HEADER });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
    await app.inject({ method: 'POST', url: '/api/admin/health/recover', headers: AUTH_HEADER });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it('POST /api/admin/load/burn requires auth and returns quickly with a duration', async () => {
    const { app } = buildTestServer();
    expect((await app.inject({ method: 'POST', url: '/api/admin/load/burn' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'POST', url: '/api/admin/load/burn', headers: AUTH_HEADER });
    expect(response.statusCode).toBe(200);
    expect(response.json().burnedMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — route files don't exist and `ServerDeps` doesn't yet carry `patients`/`encounters`/`observations`/`auth`.

- [ ] **Step 4: Implement the five route modules**

`packages/api/src/http/routes/auth.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@aethelgard/shared';
import type { AuthService } from '../../services/authService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerAuthRoutes = (
  fastify: FastifyInstance,
  auth: AuthService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.post('/api/auth/login', async (request, reply) => {
    const input = parseWith(loginSchema, request.body);
    const result = await auth.login(input);
    reply.code(200).send(result);
  });

  fastify.get('/api/auth/demo-users', async (_request, reply) => {
    reply.send(await auth.demoUsers());
  });

  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    reply.send(request.principal);
  });
};
```

`packages/api/src/http/routes/patients.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createPatientSchema, paginationQuerySchema, updatePatientSchema } from '@aethelgard/shared';
import type { PatientService } from '../../services/patientService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerPatientRoutes = (
  fastify: FastifyInstance,
  patients: PatientService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/patients', { preHandler: requireAuth }, async (request, reply) => {
    const query = parseWith(paginationQuerySchema, request.query);
    const search = (request.query as { search?: string }).search;
    reply.send(await patients.search({ ...query, search }));
  });

  fastify.post('/api/patients', { preHandler: requireAuth }, async (request, reply) => {
    const input = parseWith(createPatientSchema, request.body);
    const patient = await patients.create(input, request.principal!.branchId);
    reply.code(201).send(patient);
  });

  fastify.get('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await patients.get(id));
  });

  fastify.patch('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = parseWith(updatePatientSchema, request.body);
    reply.send(await patients.update(id, patch));
  });

  fastify.delete('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await patients.remove(id);
    reply.code(204).send();
  });
};
```

`packages/api/src/http/routes/encounters.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createEncounterSchema, patchEncounterSchema } from '@aethelgard/shared';
import type { EncounterService } from '../../services/encounterService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerEncounterRoutes = (
  fastify: FastifyInstance,
  encounters: EncounterService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/patients/:patientId/encounters', { preHandler: requireAuth }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    reply.send(await encounters.listByPatient(patientId));
  });

  fastify.post('/api/patients/:patientId/encounters', { preHandler: requireAuth }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    const input = parseWith(createEncounterSchema, request.body);
    const encounter = await encounters.create(patientId, input, request.principal!.branchId);
    reply.code(201).send(encounter);
  });

  fastify.get('/api/encounters/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await encounters.get(id));
  });

  fastify.patch('/api/encounters/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = parseWith(patchEncounterSchema, request.body);
    reply.send(await encounters.update(id, patch));
  });
};
```

`packages/api/src/http/routes/observations.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createObservationSchema } from '@aethelgard/shared';
import type { ObservationService } from '../../services/observationService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerObservationRoutes = (
  fastify: FastifyInstance,
  observations: ObservationService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/encounters/:encounterId/observations', { preHandler: requireAuth }, async (request, reply) => {
    const { encounterId } = request.params as { encounterId: string };
    reply.send(await observations.listByEncounter(encounterId));
  });

  fastify.post('/api/encounters/:encounterId/observations', { preHandler: requireAuth }, async (request, reply) => {
    const { encounterId } = request.params as { encounterId: string };
    const input = parseWith(createObservationSchema, request.body);
    const observation = await observations.create(encounterId, input, request.principal!.userId);
    reply.code(201).send(observation);
  });
};
```

`packages/api/src/http/routes/admin.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { setForcedUnhealthy } from '../healthState.js';
import type { createRequireAuth } from '../authMiddleware.js';

const BURN_DURATION_MS = 2000;

export const registerAdminRoutes = (
  fastify: FastifyInstance,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.post('/api/admin/health/fail', { preHandler: requireAuth }, async (_request, reply) => {
    setForcedUnhealthy(true);
    reply.code(200).send({ forcedUnhealthy: true });
  });

  fastify.post('/api/admin/health/recover', { preHandler: requireAuth }, async (_request, reply) => {
    setForcedUnhealthy(false);
    reply.code(200).send({ forcedUnhealthy: false });
  });

  fastify.post('/api/admin/load/burn', { preHandler: requireAuth }, async (_request, reply) => {
    const end = Date.now() + BURN_DURATION_MS;
    while (Date.now() < end) {
      Math.sqrt(Math.random());
    }
    reply.code(200).send({ burnedMs: BURN_DURATION_MS });
  });
};
```

- [ ] **Step 5: Modify `server.ts`** — extend `ServerDeps` and register the new routes

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthProvider } from '../ports/index.js';
import type { Db } from '../adapters/persistence/postgres/pool.js';
import type { PatientService } from '../services/patientService.js';
import type { EncounterService } from '../services/encounterService.js';
import type { ObservationService } from '../services/observationService.js';
import type { AuthService } from '../services/authService.js';
import { errorHandler } from './errorMiddleware.js';
import { createRequireAuth } from './authMiddleware.js';
import { registerHealthRoute } from './routes/health.js';
import { registerMetaRoute } from './routes/meta.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPatientRoutes } from './routes/patients.js';
import { registerEncounterRoutes } from './routes/encounters.js';
import { registerObservationRoutes } from './routes/observations.js';
import { registerAdminRoutes } from './routes/admin.js';

export type ServerDeps = {
  db: Db;
  authProvider: AuthProvider;
  patients: PatientService;
  encounters: EncounterService;
  observations: ObservationService;
  auth: AuthService;
  instanceId: string;
  availabilityZone: string;
  appVersion: string;
  authDriverName: string;
  identityDriverName: string;
  serveStatic: boolean;
  staticRoot?: string;
};

export const buildServer = (deps: ServerDeps): FastifyInstance => {
  const fastify = Fastify({ logger: true, disableRequestLogging: true });

  fastify.decorateRequest('principal', undefined);
  fastify.setErrorHandler(errorHandler);

  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Served-By', deps.instanceId);
    reply.header('X-AZ', deps.availabilityZone);
    return payload;
  });

  const requireAuth = createRequireAuth(deps.authProvider);

  registerHealthRoute(fastify, deps.db);
  registerMetaRoute(fastify, deps, requireAuth);
  registerAuthRoutes(fastify, deps.auth, requireAuth);
  registerPatientRoutes(fastify, deps.patients, requireAuth);
  registerEncounterRoutes(fastify, deps.encounters, requireAuth);
  registerObservationRoutes(fastify, deps.observations, requireAuth);
  registerAdminRoutes(fastify, requireAuth);

  return fastify;
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 4 (auth) + 6 (patients) + 5 (encounters/observations) + 2 (admin) = 17 new tests.

- [ ] **Step 7: Verify the typecheck passes and commit**

```bash
npm run typecheck -w @aethelgard/api
git add packages/api/src/http packages/api/test/http
git commit -m "feat(api): add auth, patient, encounter, observation and admin routes"
```

---

### Task 12: Composition root, entrypoint, and seed script

**Files:**
- Create: `packages/api/src/composition.ts`, `packages/api/src/index.ts`, `packages/api/src/scripts/seed.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 1); `createDb`, `runMigrations` (Task 6); every Postgres repository (Task 7); `createLocalJwtAuthProvider` (Task 8); `createLocalIdentity`, `createEcsIdentity` (Task 9); `buildServer` (Task 10/11); every service factory (Task 5).
- Produces: `buildApplication(config: AppConfig): Promise<{ server: FastifyInstance; db: Db }>` — the only function `index.ts` and `scripts/seed.ts` call to get a fully wired system. This is the single file that ever imports both a `ports` type and a concrete `adapters` implementation together — everywhere else respects the one-directional dependency rule.

- [ ] **Step 1: Implement `composition.ts`**

No test file for this task — it is pure wiring with no business logic of its own; its correctness is exercised end-to-end by `docker compose up` in Task 18 and by every test in Tasks 1–11 exercising the pieces it wires.

```ts
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { createDb, type Db } from './adapters/persistence/postgres/pool.js';
import { runMigrations } from './adapters/persistence/postgres/migrator.js';
import { createPostgresBranchRepository } from './adapters/persistence/postgres/branchRepository.js';
import { createPostgresPatientRepository } from './adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from './adapters/persistence/postgres/encounterRepository.js';
import { createPostgresObservationRepository } from './adapters/persistence/postgres/observationRepository.js';
import { createLocalJwtAuthProvider } from './adapters/auth/localJwt/localJwtAuthProvider.js';
import { createLocalIdentity } from './adapters/identity/localIdentity.js';
import { createEcsIdentity } from './adapters/identity/ecsIdentity.js';
import { createPatientService } from './services/patientService.js';
import { createEncounterService } from './services/encounterService.js';
import { createObservationService } from './services/observationService.js';
import { createAuthService } from './services/authService.js';
import { buildServer } from './http/server.js';

const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

/**
 * The one place a `ports` type and a concrete `adapters` implementation are
 * imported together. Everything this function builds is created here and
 * nowhere else — swapping `AUTH_DRIVER` or `IDENTITY_DRIVER`, or pointing
 * `DATABASE_URL`/`DB_HOST` at Aurora instead of RDS, changes nothing below;
 * `config/env.ts` (Task 1) already resolved those decisions into plain values.
 */
export const buildApplication = async (
  config: AppConfig,
): Promise<{ server: FastifyInstance; db: Db }> => {
  const db = createDb(config.databaseUrl);
  await runMigrations(db, { log: (message) => console.log(message) });

  const branches = createPostgresBranchRepository(db);
  const patientsRepo = createPostgresPatientRepository(db);
  const encountersRepo = createPostgresEncounterRepository(db);
  const observationsRepo = createPostgresObservationRepository(db);

  const authProvider = createLocalJwtAuthProvider(db, config.jwtSecret);
  const identity = config.identityDriver === 'ecs' ? createEcsIdentity() : createLocalIdentity();

  // Resolved once at boot, not per-request — see Task 10's server.ts rationale.
  const [instanceId, availabilityZone] = await Promise.all([
    identity.instanceId(),
    identity.availabilityZone(),
  ]);

  const server = buildServer({
    db,
    authProvider,
    patients: createPatientService({ patients: patientsRepo, branches, now, newId }),
    encounters: createEncounterService({ encounters: encountersRepo, now, newId }),
    observations: createObservationService({ observations: observationsRepo, now, newId }),
    auth: createAuthService({ authProvider }),
    instanceId,
    availabilityZone,
    appVersion: config.appVersion,
    authDriverName: config.authDriver,
    identityDriverName: config.identityDriver,
    serveStatic: config.serveStatic,
    staticRoot: config.serveStatic ? new URL('../../web/dist', import.meta.url).pathname : undefined,
  });

  return { server, db };
};
```

- [ ] **Step 2: Implement `index.ts`**

```ts
import { loadConfig } from './config/env.js';
import { buildApplication } from './composition.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const { server, db } = await buildApplication(config);

  await server.listen({ port: config.port, host: '0.0.0.0' });
  server.log.info(`aethelgard-demo api listening on :${config.port}`);

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info(`received ${signal}, shutting down`);
    await server.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error: unknown) => {
  console.error('fatal startup error', error);
  process.exit(1);
});
```

- [ ] **Step 3: Implement `scripts/seed.ts`**

```ts
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
```

- [ ] **Step 4: Run the full unit suite one more time**

Run: `npm run test:unit -w @aethelgard/api && npm run typecheck -w @aethelgard/api`
Expected: PASS, no output from typecheck.

- [ ] **Step 5: Smoke-test against a real Postgres**

Run:

```bash
docker run --rm -d --name aethelgard-smoke -e POSTGRES_PASSWORD=aethelgard -e POSTGRES_USER=aethelgard -e POSTGRES_DB=aethelgard -p 5432:5432 postgres:17-alpine
sleep 3
DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard JWT_SECRET=dev-only-secret-change-me npm run seed -w @aethelgard/api
DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard JWT_SECRET=dev-only-secret-change-me npm run dev -w @aethelgard/api &
sleep 2
curl -s -X POST http://localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"email":"doctor.kl@aethelgard.demo","password":"demo1234"}'
kill %1
docker stop aethelgard-smoke
```

Expected: the `curl` prints a JSON body containing `"token"` and a `principal` with `"role":"doctor"`.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/composition.ts packages/api/src/index.ts packages/api/src/scripts
git commit -m "feat(api): add composition root, entrypoint and seed script"
```

---

### Task 13: React + Vite scaffold, API client, and login

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`
- Create: `packages/web/src/{main,App}.tsx`
- Create: `packages/web/src/api/client.ts`
- Create: `packages/web/src/auth/AuthContext.tsx`
- Create: `packages/web/src/pages/LoginPage.tsx`
- Create: `packages/web/src/components/ServedByBadge.tsx`

**Interfaces:**
- Consumes: the JSON shapes of `/api/auth/login`, `/api/auth/demo-users` from Task 11 (no shared TypeScript import across the package boundary — the web package declares its own lightweight types matching the wire shape, since `@aethelgard/shared`'s Zod schemas are for validating requests server-side, not for the browser bundle).
- Produces: `apiFetch<T>(path, init?): Promise<T>`, `getLastResponseMeta(): { servedBy: string | null; az: string | null }`, `useAuth()` hook exposing `{ principal, token, login, logout }`, `<ServedByBadge />`.

- [ ] **Step 1: Create the package files**

`packages/web/package.json`:

```json
{
  "name": "@aethelgard/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.0"
  }
}
```

`packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`packages/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
      '/health': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
```

`packages/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aethelgard EHR Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement the API client**

`packages/web/src/api/client.ts`:

```ts
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let lastServedBy: string | null = null;
let lastAz: string | null = null;

export const getLastResponseMeta = (): { servedBy: string | null; az: string | null } => ({
  servedBy: lastServedBy,
  az: lastAz,
});

const TOKEN_KEY = 'aethelgard.token';

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string | null): void => {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
};

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getStoredToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  lastServedBy = response.headers.get('x-served-by');
  lastAz = response.headers.get('x-az');

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as
    | (T & { code?: string; message?: string })
    | null;

  if (!response.ok) {
    throw new ApiError(response.status, body?.code ?? 'UNKNOWN', body?.message ?? response.statusText);
  }
  return body as T;
};
```

- [ ] **Step 3: Implement the auth context**

`packages/web/src/auth/AuthContext.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../api/client.js';

export type Principal = { userId: string; email: string; role: string; branchId: string };
type LoginResult = { principal: Principal; token: string };

type AuthContextValue = {
  principal: Principal | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [principal, setPrincipal] = useState<Principal | null>(null);

  const login = async (email: string, password: string): Promise<void> => {
    const result = await apiFetch<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(result.token);
    setToken(result.token);
    setPrincipal(result.principal);
  };

  const logout = (): void => {
    setStoredToken(null);
    setToken(null);
    setPrincipal(null);
  };

  return (
    <AuthContext.Provider value={{ principal, token, login, logout }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

- [ ] **Step 4: Implement the served-by badge and the login page**

`packages/web/src/components/ServedByBadge.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getLastResponseMeta } from '../api/client.js';

/** Polled rather than event-driven — the simplest thing that keeps the footer honest after every fetch, without threading a global event bus through apiFetch. */
export const ServedByBadge = (): JSX.Element => {
  const [meta, setMeta] = useState(getLastResponseMeta());

  useEffect(() => {
    const interval = setInterval(() => setMeta(getLastResponseMeta()), 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderTop: '1px solid #ddd' }}>
      Served by <strong>{meta.servedBy ?? '—'}</strong> in <strong>{meta.az ?? '—'}</strong>
    </footer>
  );
};
```

`packages/web/src/pages/LoginPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

type DemoUser = { email: string; role: string; branchCode: string; displayName: string };

export const LoginPage = (): JSX.Element => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DemoUser[]>('/api/auth/demo-users').then(setDemoUsers).catch(() => undefined);
  }, []);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/patients');
    } catch {
      setError('Invalid email or password.');
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '4rem auto' }}>
      <h1>Aethelgard EHR — Demo Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Demo account
          <select
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setPassword('demo1234');
            }}
          >
            <option value="">— choose a demo account —</option>
            {demoUsers.map((user) => (
              <option key={user.email} value={user.email}>
                {user.displayName} ({user.role}, {user.branchCode})
              </option>
            ))}
          </select>
        </label>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit">Log in</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 5: Implement `App.tsx` and `main.tsx`**

`packages/web/src/App.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { ServedByBadge } from './components/ServedByBadge.js';

const RequireAuth = ({ children }: { children: JSX.Element }): JSX.Element => {
  const { token } = useAuth();
  return token === null ? <Navigate to="/login" replace /> : children;
};

export const App = (): JSX.Element => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <main style={{ flex: 1 }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        {/* /patients, /patients/:id, /encounters/:id, /infra are added in Tasks 14–16 */}
      </Routes>
    </main>
    <ServedByBadge />
  </div>
);
```

`packages/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import { App } from './App.js';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 6: Verify — install, typecheck, build**

Run:

```bash
npm install
npm run typecheck -w @aethelgard/web
npm run build -w @aethelgard/web
```

Expected: all three succeed; `packages/web/dist/index.html` exists.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev -w @aethelgard/api` (in one terminal) and `npm run dev -w @aethelgard/web` (in another). Open `http://localhost:5173/login`. Expected: the demo-account dropdown populates from `GET /api/auth/demo-users`; selecting one and submitting redirects to `/patients` (a blank page until Task 14 — a 404-free navigation is the pass condition here).

- [ ] **Step 8: Commit**

```bash
git add packages/web
git commit -m "feat(web): scaffold React app with auth context and login page"
```

---

### Task 14: Patients list and detail pages

**Files:**
- Create: `packages/web/src/pages/{PatientsPage,PatientDetailPage}.tsx`
- Modify: `packages/web/src/App.tsx` — add the two routes

**Interfaces:**
- Consumes: `apiFetch` from `api/client.js`; `useAuth` from `auth/AuthContext.js`.
- Produces: `<PatientsPage />`, `<PatientDetailPage />`.

- [ ] **Step 1: Implement `PatientsPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Patient = { id: string; mrn: string; name: string; dob: string; phone: string };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export const PatientsPage = (): JSX.Element => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<Page<Patient> | null>(null);
  const [form, setForm] = useState({ name: '', dob: '', sex: 'unknown', phone: '' });

  const reload = async (): Promise<void> => {
    const query = new URLSearchParams({ search, page: '1', pageSize: '20' });
    setPage(await apiFetch<Page<Patient>>(`/api/patients?${query.toString()}`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [search]);

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await apiFetch('/api/patients', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', dob: '', sex: 'unknown', phone: '' });
    await reload();
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Patients</h1>
      <input placeholder="Search by name or MRN" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {page?.items.map((patient) => (
          <li key={patient.id}>
            <Link to={`/patients/${patient.id}`}>
              {patient.name} — {patient.mrn}
            </Link>
          </li>
        ))}
      </ul>
      {page !== null && <p>{page.total} total</p>}

      <h2>New patient</h2>
      <form onSubmit={handleCreate}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required />
        <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
          <option value="unknown">Unknown</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        <button type="submit">Create</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 2: Implement `PatientDetailPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Patient = { id: string; mrn: string; name: string; dob: string; sex: string; phone: string };
type Encounter = { id: string; type: string; department: string; status: string; admittedAt: string };

export const PatientDetailPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [newEncounter, setNewEncounter] = useState({ type: 'outpatient', department: '' });

  const reload = async (): Promise<void> => {
    if (id === undefined) return;
    setPatient(await apiFetch<Patient>(`/api/patients/${id}`));
    setEncounters(await apiFetch<Encounter[]>(`/api/patients/${id}/encounters`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [id]);

  const handleCreateEncounter = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await apiFetch(`/api/patients/${id}/encounters`, { method: 'POST', body: JSON.stringify(newEncounter) });
    setNewEncounter({ type: 'outpatient', department: '' });
    await reload();
  };

  const handleDelete = async (): Promise<void> => {
    await apiFetch(`/api/patients/${id}`, { method: 'DELETE' });
    navigate('/patients');
  };

  if (patient === null) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <p>
        <Link to="/patients">&larr; back to patients</Link>
      </p>
      <h1>
        {patient.name} — {patient.mrn}
      </h1>
      <p>
        DOB {patient.dob} · {patient.sex} · {patient.phone}
      </p>
      <button onClick={handleDelete}>Delete patient</button>

      <h2>Encounters</h2>
      <ul>
        {encounters.map((encounter) => (
          <li key={encounter.id}>
            <Link to={`/encounters/${encounter.id}`}>
              {encounter.type} — {encounter.department} ({encounter.status})
            </Link>
          </li>
        ))}
      </ul>

      <h3>New encounter</h3>
      <form onSubmit={handleCreateEncounter}>
        <select value={newEncounter.type} onChange={(e) => setNewEncounter({ ...newEncounter, type: e.target.value })}>
          <option value="outpatient">Outpatient</option>
          <option value="inpatient">Inpatient</option>
          <option value="emergency">Emergency</option>
        </select>
        <input
          placeholder="Department"
          value={newEncounter.department}
          onChange={(e) => setNewEncounter({ ...newEncounter, department: e.target.value })}
          required
        />
        <button type="submit">Open encounter</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 3: Wire the routes into `App.tsx`**

Replace the `<Routes>` block in `packages/web/src/App.tsx`:

```tsx
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        <Route path="/patients" element={<RequireAuth><PatientsPage /></RequireAuth>} />
        <Route path="/patients/:id" element={<RequireAuth><PatientDetailPage /></RequireAuth>} />
        {/* /encounters/:id and /infra are added in Tasks 15–16 */}
      </Routes>
```

Add the two imports at the top of the file:

```tsx
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck -w @aethelgard/web && npm run build -w @aethelgard/web`
Expected: both succeed.

- [ ] **Step 5: Manual smoke test**

With both dev servers running (Task 13, Step 7): log in, create a patient, confirm it appears in the list and the search box filters it, open its detail page, create an encounter, confirm it appears in the encounter list.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): add patients list and detail pages"
```

---

### Task 15: Encounter detail page with observations

**Files:**
- Create: `packages/web/src/pages/EncounterPage.tsx`
- Modify: `packages/web/src/App.tsx` — add the `/encounters/:id` route

**Interfaces:**
- Consumes: `apiFetch` from `api/client.js`.
- Produces: `<EncounterPage />`.

- [ ] **Step 1: Implement `EncounterPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Encounter = { id: string; patientId: string; type: string; department: string; status: string; admittedAt: string; dischargedAt: string | null };
type Observation = { id: string; code: string; valueNum: number | null; valueText: string | null; unit: string | null; recordedAt: string };

const OBSERVATION_CODES = ['heart_rate', 'blood_pressure', 'temperature', 'spo2', 'weight'] as const;

export const EncounterPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [form, setForm] = useState<{ code: string; value: string; unit: string }>({
    code: 'heart_rate',
    value: '',
    unit: '',
  });

  const reload = async (): Promise<void> => {
    if (id === undefined) return;
    setEncounter(await apiFetch<Encounter>(`/api/encounters/${id}`));
    setObservations(await apiFetch<Observation[]>(`/api/encounters/${id}/observations`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [id]);

  const handleAddObservation = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const numeric = Number(form.value);
    const payload = Number.isNaN(numeric)
      ? { code: form.code, valueText: form.value }
      : { code: form.code, valueNum: numeric, unit: form.unit || undefined };
    await apiFetch(`/api/encounters/${id}/observations`, { method: 'POST', body: JSON.stringify(payload) });
    setForm({ code: 'heart_rate', value: '', unit: '' });
    await reload();
  };

  const handleDischarge = async (): Promise<void> => {
    await apiFetch(`/api/encounters/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'discharged' }) });
    await reload();
  };

  if (encounter === null) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>
        {encounter.type} — {encounter.department}
      </h1>
      <p>
        Status: <strong>{encounter.status}</strong>
        {encounter.status === 'open' && <button onClick={handleDischarge}>Discharge</button>}
      </p>

      <h2>Observations</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((observation) => (
            <tr key={observation.id}>
              <td>{observation.code}</td>
              <td>{observation.valueNum ?? observation.valueText}</td>
              <td>{observation.unit ?? '—'}</td>
              <td>{observation.recordedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Record observation</h3>
      <form onSubmit={handleAddObservation}>
        <select value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}>
          {OBSERVATION_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <input placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        <input placeholder="Unit (optional)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <button type="submit">Record</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 2: Wire the route into `App.tsx`**

Add the import:

```tsx
import { EncounterPage } from './pages/EncounterPage.js';
```

Add the route inside `<Routes>`, replacing the "Tasks 15–16" comment:

```tsx
        <Route path="/encounters/:id" element={<RequireAuth><EncounterPage /></RequireAuth>} />
        {/* /infra is added in Task 16 */}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck -w @aethelgard/web && npm run build -w @aethelgard/web`
Expected: both succeed.

- [ ] **Step 4: Manual smoke test**

Open an encounter from Task 14's flow, record a `heart_rate` observation with a numeric value, confirm it appears in the table; click Discharge, confirm status updates and the button disappears.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): add encounter detail page with observations"
```

---

### Task 16: Infra page — instance distribution, health toggle, load burn

**Files:**
- Create: `packages/web/src/pages/InfraPage.tsx`
- Modify: `packages/web/src/App.tsx` — add the `/infra` route and a nav link

**Interfaces:**
- Consumes: `apiFetch`, `getLastResponseMeta` from `api/client.js`.
- Produces: `<InfraPage />`. This is the primary screenshot surface for the "load balancing observable in real time" success criterion.

- [ ] **Step 1: Implement `InfraPage.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client.js';

type Meta = {
  instanceId: string;
  availabilityZone: string;
  version: string;
  uptimeSeconds: number;
  adapters: { db: string; auth: string; identity: string };
};

const HISTORY_LIMIT = 50;
const POLL_INTERVAL_MS = 1500;

export const InfraPage = (): JSX.Element => {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const historyRef = useRef<string[]>([]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      try {
        const result = await apiFetch<Meta>('/api/meta');
        setMeta(result);
        setError(null);
        historyRef.current = [...historyRef.current, result.instanceId].slice(-HISTORY_LIMIT);
        setHistory(historyRef.current);
      } catch {
        setError('Could not reach /api/meta');
      }
    };
    poll().catch(() => undefined);
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const distribution = history.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  const handleFail = async (): Promise<void> => {
    await apiFetch('/api/admin/health/fail', { method: 'POST' });
  };
  const handleRecover = async (): Promise<void> => {
    await apiFetch('/api/admin/health/recover', { method: 'POST' });
  };
  const handleBurn = async (): Promise<void> => {
    setBurning(true);
    await apiFetch('/api/admin/load/burn', { method: 'POST' });
    setBurning(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Infra</h1>
      {error !== null && <p role="alert">{error}</p>}
      {meta !== null && (
        <>
          <p>
            Version {meta.version} · uptime {Math.round(meta.uptimeSeconds)}s
          </p>
          <p>
            Adapters: db={meta.adapters.db}, auth={meta.adapters.auth}, identity={meta.adapters.identity}
          </p>
        </>
      )}

      <h2>Instance distribution (last {history.length} of {HISTORY_LIMIT} requests)</h2>
      <ul>
        {Object.entries(distribution).map(([instanceId, count]) => (
          <li key={instanceId}>
            {instanceId}: {'█'.repeat(count)} ({count})
          </li>
        ))}
      </ul>

      <h2>Health toggle</h2>
      <button onClick={handleFail}>Force unhealthy</button>
      <button onClick={handleRecover}>Recover</button>

      <h2>Load</h2>
      <button onClick={handleBurn} disabled={burning}>
        {burning ? 'Burning…' : 'Burn CPU (2s)'}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Wire the route and a nav bar into `App.tsx`**

Replace the whole file:

```tsx
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { EncounterPage } from './pages/EncounterPage.js';
import { InfraPage } from './pages/InfraPage.js';
import { ServedByBadge } from './components/ServedByBadge.js';

const RequireAuth = ({ children }: { children: JSX.Element }): JSX.Element => {
  const { token } = useAuth();
  return token === null ? <Navigate to="/login" replace /> : children;
};

const NavBar = (): JSX.Element => {
  const { principal, logout } = useAuth();
  if (principal === null) return <></>;
  return (
    <nav style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #ddd', display: 'flex', gap: '1rem' }}>
      <Link to="/patients">Patients</Link>
      <Link to="/infra">Infra</Link>
      <span style={{ marginLeft: 'auto' }}>
        {principal.email} ({principal.role})
      </span>
      <button onClick={logout}>Log out</button>
    </nav>
  );
};

export const App = (): JSX.Element => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <NavBar />
    <main style={{ flex: 1 }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        <Route path="/patients" element={<RequireAuth><PatientsPage /></RequireAuth>} />
        <Route path="/patients/:id" element={<RequireAuth><PatientDetailPage /></RequireAuth>} />
        <Route path="/encounters/:id" element={<RequireAuth><EncounterPage /></RequireAuth>} />
        <Route path="/infra" element={<RequireAuth><InfraPage /></RequireAuth>} />
      </Routes>
    </main>
    <ServedByBadge />
  </div>
);
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck -w @aethelgard/web && npm run build -w @aethelgard/web`
Expected: both succeed.

- [ ] **Step 4: Manual smoke test**

Navigate to `/infra`. Confirm the instance-distribution list grows as it polls, "Force unhealthy" flips `/health` to 503 (check with `curl -i http://localhost:3000/health`), "Recover" flips it back, and "Burn CPU" briefly disables its own button and returns.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): add infra page with instance distribution, health toggle and load burn"
```

---

### Task 17: Dockerfiles

**Files:**
- Create: `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/nginx/nginx.conf`
- Create: `packages/shared/vitest.config.ts` build target additions — none needed; reuse Task 1/2 `tsconfig.build.json` files
- Modify: `packages/api/package.json`, `packages/shared/package.json` — already have `build` scripts from Tasks 1–2; this task only adds the api's `SERVE_STATIC` static-file wiring dependency

**Interfaces:**
- Consumes: `tsconfig.build.json` (Tasks 1–2), `npm run build` at the root (Task 1), `packages/web/dist` (Task 13+).
- Produces: `docker/api.Dockerfile` with `deps`/`dev`/`build`/`prod` stages; `docker/web.Dockerfile` with `dev`/`build`/`prod` (nginx) stages.

- [ ] **Step 1: Add the static-file plugin registration the prod image needs**

`packages/api/src/composition.ts` already computes `staticRoot` (Task 12). Modify `packages/api/src/http/server.ts` to register `@fastify/static` with an SPA fallback when `deps.serveStatic` is true — add this block right after the `onSend` hook, before route registration:

```ts
import fastifyStatic from '@fastify/static';
```

```ts
  if (deps.serveStatic && deps.staticRoot !== undefined) {
    await fastify.register(fastifyStatic, { root: deps.staticRoot });
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url === '/health') {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Route not found' });
        return;
      }
      reply.sendFile('index.html');
    });
  }
```

`buildServer` becomes `async` because `fastify.register` is awaited. This ripples through every caller — make each of these exact changes:

1. `packages/api/src/http/server.ts`: change the signature to `export const buildServer = async (deps: ServerDeps): Promise<FastifyInstance> => {`.
2. `packages/api/src/composition.ts`: change `const server = buildServer({` to `const server = await buildServer({`.
3. `packages/api/test/http/server.test.ts`: every `buildServer(buildDeps())` call becomes `await buildServer(buildDeps())`, and since these calls sit inside `it(async () => {...})` callbacks that are already `async`, no other change is needed in that file.
4. `packages/api/test/http/testServer.ts`: `buildTestServer` itself must become `async` because it wraps `buildServer`. Change:

   ```ts
   export const buildTestServer = () => {
   ```

   to

   ```ts
   export const buildTestServer = async () => {
   ```

   and change the return statement from `return { app: buildServer(deps), deps };` to `return { app: await buildServer(deps), deps };`.

5. Every caller of `buildTestServer()` across `packages/api/test/http/routes.auth.test.ts`, `routes.patients.test.ts`, `routes.encounters.test.ts`, and `routes.admin.test.ts` changes `const { app } = buildTestServer();` to `const { app } = await buildTestServer();` (and, in `routes.encounters.test.ts`, `const { app, deps } = buildTestServer();` to `const { app, deps } = await buildTestServer();`). Every one of these call sites is already inside an `async` `it(...)` callback, so no other signature changes are needed.

- [ ] **Step 2: Run the full unit suite to confirm the `await` change didn't break anything**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS, same counts as Task 11 Step 6.

- [ ] **Step 3: Write `docker/api.Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 3000 9229
CMD ["npm", "run", "dev", "-w", "@aethelgard/api"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @aethelgard/shared \
 && npm run build -w @aethelgard/api \
 && npm run build -w @aethelgard/web

FROM node:22-alpine AS prod
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev --workspace=@aethelgard/shared --workspace=@aethelgard/api
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/packages/api/migrations packages/api/migrations
COPY --from=build /app/packages/web/dist packages/web/dist
USER app
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "packages/api/dist/index.js"]
```

- [ ] **Step 4: Write `docker/web.Dockerfile` and its nginx config**

`docker/web.Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@aethelgard/web", "--", "--host"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @aethelgard/web

FROM nginx:1.27-alpine AS prod
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

`docker/nginx/nginx.conf` — round-robins across two fixed API service hostnames (`api1`, `api2`, defined in Task 18's `docker-compose.prod.yml`), which is what makes `X-Served-By` rotate locally without any AWS resource:

```
events {}

http {
  upstream api_backend {
    server api1:3000;
    server api2:3000;
  }

  server {
    listen 80;

    location /api/ {
      proxy_pass http://api_backend;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
    }

    location /health {
      proxy_pass http://api_backend/health;
    }

    location / {
      root /usr/share/nginx/html;
      try_files $uri /index.html;
    }
  }
}
```

- [ ] **Step 5: Build both prod images locally**

Run:

```bash
docker build -f docker/api.Dockerfile --target prod -t aethelgard-api:local .
docker build -f docker/web.Dockerfile --target prod -t aethelgard-web:local .
```

Expected: both builds succeed with no errors.

- [ ] **Step 6: Commit**

```bash
git add docker packages/api/src/http/server.ts packages/api/src/composition.ts packages/api/test
git commit -m "feat: add api and web Dockerfiles with prod-stage SPA serving"
```

---

### Task 18: Docker Compose — development and local production-parity

**Files:**
- Create: `docker-compose.yml`, `docker-compose.prod.yml`

**Interfaces:**
- Consumes: `docker/api.Dockerfile`, `docker/web.Dockerfile` (Task 17); `.env.example` shape (Task 1).
- Produces: two runnable stacks. `docker-compose.yml` is the every-day dev loop; `docker-compose.prod.yml` is the zero-AWS-cost proof of the load-balancing/health-draining success criteria from the original spec (§1.4), captured **before** any Terraform apply — same rationale as the original spec's §10.2/§4.6.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: aethelgard
      POSTGRES_USER: aethelgard
      POSTGRES_PASSWORD: aethelgard
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U aethelgard']
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - aethelgard-postgres-data:/var/lib/postgresql/data

  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
      target: dev
    environment:
      DATABASE_URL: postgresql://aethelgard:aethelgard@postgres:5432/aethelgard
      JWT_SECRET: dev-only-secret-change-me
      IDENTITY_DRIVER: local
      PORT: '3000'
      LOG_LEVEL: info
    ports:
      - '3000:3000'
      - '9229:9229'
    volumes:
      - .:/app
      - aethelgard-api-node-modules:/app/node_modules
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
      target: dev
    environment:
      VITE_API_PROXY_TARGET: http://api:3000
    ports:
      - '5173:5173'
    volumes:
      - .:/app
      - aethelgard-web-node-modules:/app/node_modules
    depends_on:
      - api

volumes:
  aethelgard-postgres-data:
  aethelgard-api-node-modules:
  aethelgard-web-node-modules:
```

- [ ] **Step 2: Write `docker-compose.prod.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: aethelgard
      POSTGRES_USER: aethelgard
      POSTGRES_PASSWORD: aethelgard
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U aethelgard']
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - aethelgard-postgres-prod-data:/var/lib/postgresql/data

  api1: &api-prod-service
    build:
      context: .
      dockerfile: docker/api.Dockerfile
      target: prod
    hostname: api-1
    environment: &api-prod-environment
      NODE_ENV: production
      DATABASE_URL: postgresql://aethelgard:aethelgard@postgres:5432/aethelgard
      JWT_SECRET: dev-only-secret-change-me
      IDENTITY_DRIVER: local
      PORT: '3000'
      SERVE_STATIC: 'false'
    depends_on:
      postgres:
        condition: service_healthy

  api2:
    <<: *api-prod-service
    hostname: api-2
    environment:
      <<: *api-prod-environment

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
      target: prod
    ports:
      - '8080:80'
    depends_on:
      - api1
      - api2

volumes:
  aethelgard-postgres-prod-data:
```

`SERVE_STATIC: 'false'` here is deliberate — in this local production-parity stack, `web`'s nginx (Task 17) serves the SPA and proxies `/api` to `api1`/`api2`, exactly matching the AWS `full`/`lean` split from the amended spec where the API stays API-only whenever something else owns the SPA. Only the AWS deployment (the ECS task definition in the separately-owned `infra/terraform/` compute module) sets `SERVE_STATIC=true`, because there nothing else is serving the SPA.

- [ ] **Step 3: Run the migrator once and start the stack**

Run:

```bash
docker compose -f docker-compose.prod.yml up --build -d
sleep 5
docker compose -f docker-compose.prod.yml exec api1 sh -c "cd /app && node packages/api/dist/scripts/seed.js" 2>/dev/null || \
  DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard JWT_SECRET=dev-only-secret-change-me npm run seed -w @aethelgard/api
```

(The migrator runs automatically on every API boot — Task 6/12 — so this step's only job is seeding demo users; either the in-container path or the host path works, whichever has a reachable `localhost:5432`.)

- [ ] **Step 4: Prove instance rotation and health draining — the evidence artefact for the report**

Run:

```bash
for i in 1 2 3 4; do curl -s -o /dev/null -D - http://localhost:8080/health | grep -i x-served-by; done
```

Expected: the four `X-Served-By` values alternate between `api-1` and `api-2` (nginx's default round-robin).

Run:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login -H 'content-type: application/json' -d '{"email":"admin@aethelgard.demo","password":"demo1234"}' | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
docker compose -f docker-compose.prod.yml exec api1 wget -qO- --post-data='{}' --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" http://localhost:3000/api/admin/health/fail
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/health
```

Expected: forcing `api1` unhealthy directly (bypassing nginx, since nginx itself does no active health-checking in this minimal config — that behaviour belongs to the ALB target group built by the separately-owned `infra/terraform/` compute module) does not change what `curl` through nginx reports, because nginx has no target-group concept; this is the one success-criterion row the original spec's own evidence table (§4.5) already marks **"No — fixed replicas"** for Compose. Re-run Step 4's rotation loop to confirm the stack is otherwise healthy, then move on — the real health-draining proof happens against the ALB once the AWS deployment is live.

- [ ] **Step 5: Tear down**

Run: `docker compose -f docker-compose.prod.yml down -v`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker-compose.prod.yml
git commit -m "feat: add development and local production-parity Compose stacks"
```

---

### Infrastructure ownership note (2026-08-08 patch)

**Do not implement Terraform network/data/compute modules as part of this plan.** `infra/terraform/`'s `versions.tf`, `providers.tf`, `variables.tf`, `locals.tf`, `main.tf`, `outputs.tf`, and every file under `modules/{network,data,compute}/` are built and delivered by a separate working session, not by whoever executes this plan. Full rationale: `docs/2026-08-08-infra-terraform-handoff-patch.md`.

That session corrects three things this plan's earlier draft (formerly Tasks 19–21) got wrong or missed:

1. Learner Lab's permitted-service list includes WAF (a `REGIONAL`-scope web ACL attached directly to the ALB) — only CloudFront is absent. The earlier draft conflated the two and dropped a requirement that should be satisfied.
2. The database tier needs 3 private subnets (no public IP, no route to the internet gateway) separate from the 3 public subnets ALB/ECS use — not all three tiers sharing 2 public subnets.
3. Everything spans 3 AZs, matching the "three zones, synchronous replication" claim made elsewhere in the report — not 2.
4. AWS Budgets is not on the Learner Lab permitted-service list, so a runbook step that opens with "set a budget alarm" cannot be performed as written (fixed in the amended Task 22 below).

None of these require touching `packages/shared`, `packages/api`, or `packages/web` — they're confined to `infra/terraform/` and the runbook. The corrected infra build preserves every interface Tasks 1–18 (and the amended Task 22) depend on, so nothing already scaffolded needs to anticipate a different shape:

- `config/env.ts` (Task 1) still composes `databaseUrl` from `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` (or `DATABASE_URL` directly) — the database-agnosticism proof in Task 1 holds regardless of which session built the infra.
- The `use_aurora` toggle still produces an identical `db_host`/`db_port`/`db_name`/`db_username`/`db_secret_arn` output shape whether the resource is `aws_rds_cluster` or `aws_db_instance`.
- The ECS task definition's environment/secrets split (`DB_PASSWORD` and `JWT_SECRET` via `secrets`, everything else via `environment`) is preserved.
- `manage_master_user_password = true`, `LabRole` lookup via `data "aws_iam_role" "lab"` with zero `aws_iam_role` resources, and `monitoring_interval = 0` are all preserved.
- Target type `ip`, health check path `/health`, container port, and the image-tag variable are preserved.
- Output names `ecr_repository_url`, `alb_dns_name`, `ecs_cluster_name`, `ecs_service_name`, `db_host`, `db_port`, `db_name`, `db_username`, `db_secret_arn` are preserved — the amended Task 22 below and `build-and-push.sh` reference these names directly.

Proceed directly from Task 18 to the amended Task 22.

---
### Task 22: Deployment runbook

**Files:**
- Create: `infra/terraform/environments/learnerlab.tfvars`
- Create: `infra/terraform/scripts/build-and-push.sh`
- Create: `docs/RUNBOOK.md`

**Interfaces:**
- Consumes: the Terraform outputs (`ecr_repository_url`, `alb_dns_name`, `ecs_cluster_name`, `ecs_service_name`, `db_host`, `db_port`, `db_name`, `db_username`, `db_secret_arn`) produced by the separately-owned `infra/terraform/` build described in the "Infrastructure ownership note" above and in `docs/2026-08-08-infra-terraform-handoff-patch.md` §5; `.env.example` from Task 1.
- Produces: the operational document the user follows to go from this scaffold to a live Learner Lab deployment — nothing in code depends on this task; it is the handoff artifact between "application side, fully handled" and "AWS side, user-handled" from the chat decision.

- [ ] **Step 1: Write the Learner Lab tfvars**

`infra/terraform/environments/learnerlab.tfvars`:

```hcl
region            = "us-east-1"
use_lab_role      = true
use_aurora        = true   # Try Aurora first. If Learner Lab rejects any Aurora
                            # resource, set this to false and re-apply — every
                            # other value below stays the same, and no
                            # application code changes either way (see
                            # infra/terraform/modules/data/main.tf).
db_multi_az       = false
db_instance_class = "db.t4g.medium"
desired_count     = 2
min_capacity      = 2
max_capacity      = 4
```

- [ ] **Step 2: Write the build-and-push script**

`infra/terraform/scripts/build-and-push.sh` — Terraform never builds images itself (no `null_resource` with `local-exec`, per the original spec's §5.2 convention #4); this script is the explicit build step that hands `terraform apply` a tag to deploy:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/build-and-push.sh <ecr_repository_url> <image_tag>
# Get <ecr_repository_url> from: terraform output -raw ecr_repository_url

REPO_URL="${1:?Usage: build-and-push.sh <ecr_repository_url> <image_tag>}"
TAG="${2:?Usage: build-and-push.sh <ecr_repository_url> <image_tag>}"
REGION="${AWS_REGION:-us-east-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO_URL%%/*}"

docker build -f docker/api.Dockerfile --target prod -t "${REPO_URL}:${TAG}" .
docker push "${REPO_URL}:${TAG}"

echo "Pushed ${REPO_URL}:${TAG}"
echo "Next: terraform apply -var-file=environments/learnerlab.tfvars -var=\"image_tag=${TAG}\""
```

- [ ] **Step 3: Write the runbook**

`docs/RUNBOOK.md`:

```markdown
# Deployment Runbook — AWS Academy Learner Lab

Prerequisites: an active Learner Lab session, AWS CLI configured with the
lab's temporary credentials, Docker, and Terraform ≥1.7.

## 1. Record the starting credit balance

AWS Budgets is not available on Learner Lab (see servicerestrictions.md).
Before the first `terraform apply`, note the current credit balance shown
on the Learner Lab landing page. The delta after `terraform destroy` is
the real per-cycle cost figure — record both numbers in the session log.

## 2. Deploy the network and data tier

    cd infra/terraform
    terraform init
    terraform apply -var-file=environments/learnerlab.tfvars \
      -target=module.network -target=module.data

Note the master credential lives in Secrets Manager
(`terraform output db_secret_arn`) — it is never in `.tfstate` as plaintext
because both the Aurora and RDS resources use `manage_master_user_password`.

If any Aurora resource fails on Learner Lab (residual risk noted in the
2026-08-08 spec's Appendix A.4 — Learner Lab's own restrictions document
does not promise Aurora resource-level behaviour), edit
`environments/learnerlab.tfvars`, set `use_aurora = false`, and re-run the
command above. Nothing else changes.

## 3. Build and push the image

    terraform output -raw ecr_repository_url
    ./scripts/build-and-push.sh "$(terraform output -raw ecr_repository_url)" v1

## 4. Deploy compute

    terraform apply -var-file=environments/learnerlab.tfvars -var="image_tag=v1"

## 5. Fill in `.env` from the outputs

    terraform output

Copy `AWS_REGION`, `ECR_REPOSITORY_URL`, `ALB_DNS_NAME` into your local
`.env` if you want to point local tooling at the live deployment. The
running ECS tasks already have their own environment injected by the task
definition (built by the separately-owned `infra/terraform/` compute
module) — this step is for your convenience only, not required for the
deployment to work.

## 6. Seed and verify

    curl -X POST "http://$(terraform output -raw alb_dns_name)/api/auth/login" \
      -H 'content-type: application/json' \
      -d '{"email":"doctor.kl@aethelgard.demo","password":"demo1234"}'

The demo users are seeded automatically the first time `runMigrations` and
the app boot — if `/api/auth/demo-users` returns `[]`, run the seed script
once against the live database (see `packages/api/src/scripts/seed.ts`;
point `DATABASE_URL` at the ALB-adjacent database via a bastion or a
temporary local port-forward, since the database itself is not
publicly accessible).

## 7. Capture evidence

    for i in 1 2 3 4 5 6; do
      curl -s -o /dev/null -D - "http://$(terraform output -raw alb_dns_name)/health" | grep -i x-served-by
    done

Then, from the `/infra` page in the browser, use "Burn CPU" repeatedly (or
a small loop of the load endpoint) while watching the ECS service's running
task count in the console — this is Section E's scale-out/scale-in evidence.

## 8. Tear down

    terraform destroy -var-file=environments/learnerlab.tfvars

Mandatory, not optional — Learner Lab may not stop RDS/Aurora when a
session ends, and a stopped RDS instance left seven days restarts itself
automatically (Appendix A.3 of the 2026-08-08 spec). Deploy, seed, capture,
destroy, all inside one session.

## Extension points (out of scope for this plan, additive when needed)

- **Personal AWS account / CDK path:** the separately-owned `infra/terraform/`
  build's `use_lab_role` variable has a hard `validation` block requiring
  `true`. Removing it and adding an `aws_iam_role` branch is the extension
  point described in the 2026-08-08 spec §3.1 — not built because the
  current scope is Learner Lab only.
- **Cognito:** `AuthProvider` is a port (Task 4/8) with one implementation.
  A `cognito` adapter plus `AUTH_DRIVER=cognito` is additive.
- **S3 attachments:** `ObjectStore` was deliberately not created in this
  scaffold (2026-08-08 chat decision). Adding it is a new port, a new `s3`
  adapter, one new field on `ServerDeps`, and a new Terraform resource in
  the `data` module — no existing file needs to change shape.
- **RBAC / branch scoping / audit log:** the `role` and `branchId` fields
  already exist on every `Principal` and every `patients`/`encounters` row.
  Enforcement is new middleware (branch predicate in each repository query,
  a permission matrix consulted in `authMiddleware.ts`) — additive, not a
  refactor.
```

- [ ] **Step 4: Commit**

```bash
git add infra/terraform/environments infra/terraform/scripts docs/RUNBOOK.md
git commit -m "docs: add Learner Lab deployment runbook and build-and-push script"
```

---
# Simplified Aethelgard Fullstack Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Relationship to prior plans:** Supersedes `docs/superpowers/plans/2026-08-07-phase-1-domain-core.md` and `2026-08-07-phase-2-postgres-persistence.md`. Those plans built RBAC enforcement, branch-scoping, an audit log, and a dual-adapter contract-test harness — all correctly speced, but cut from this build per the 2026-08-08 chat decision to prioritize speed. Nothing in those plans has been implemented (no `packages/` directory exists yet), so there is no migration path to write — this plan starts clean. The domain (patients/encounters/observations/branches) is preserved; only the enforcement/rigor layers are cut.

**Goal:** Scaffold and fully implement the application side of a simplified Aethelgard EHR demo — shared schemas, Fastify backend, React frontend, Docker images, and Terraform infrastructure for AWS Academy Learner Lab — such that swapping the database between Aurora PostgreSQL and RDS PostgreSQL (single- or multi-AZ) is a `.tfvars` change with zero application code changes.

**Architecture:** Ports and adapters (unchanged principle from the original spec). `packages/shared` holds Zod schemas. `packages/api` holds domain/ports/services/adapters/http, wired by a single `composition.ts`. `packages/web` is a plain React + Vite SPA served either by Vite (dev), nginx (local prod-parity), or the API's own static-file plugin (AWS — no CloudFront/S3 in this simplified build). `infra/terraform` provisions VPC, an Aurora-or-RDS-switchable data tier, and an ECS Fargate + ALB compute tier, all scoped to Learner Lab's `LabRole`.

**Tech Stack:** TypeScript 5.7+ (ESM, strict), npm workspaces, Zod 4, Vitest 3, Fastify 5, `pg` 8, `jsonwebtoken` 9, `bcryptjs` 2, React 19 + Vite 6 + React Router 7, Terraform ≥1.7 (HCL, `hashicorp/aws` ~>5.0, `hashicorp/random` ~>3.6), Docker.

## Global Constraints

Exact values from the spec and the 2026-08-08 chat decisions. Every task's requirements implicitly include this section.

- **TypeScript only, never plain JavaScript.** No `.js` source files anywhere except generated output and Terraform/shell scripts.
- **ESM only.** Every `package.json` sets `"type": "module"`. Import specifiers carry the `.js` extension even for `.ts` files (required by `verbatimModuleSyntax` + `moduleResolution: bundler`, and matches the Node ESM resolution the production build uses).
- **camelCase for variables and TypeScript properties.** Database columns are `snake_case`; row mappers do the translation.
- **Node version floor:** `>=22`. Production image is `node:22-alpine`.
- **No ORM, no query builder.** Parameterised SQL strings only, `$n` placeholders, never string-interpolated values.
- **Migrations are append-only and idempotent.** Every statement uses `IF NOT EXISTS` or `ON CONFLICT DO NOTHING`. Re-running `runMigrations` against an up-to-date database is a documented no-op.
- **Database-agnostic application layer (the core requirement of this plan).** The Postgres adapter, migrations, and every repository speak only standard PostgreSQL wire protocol and standard SQL (the one extension used, `pg_trgm`, ships with both RDS PostgreSQL and Aurora PostgreSQL). Nothing in `packages/api/src` ever branches on which managed service produced the connection string. `config/env.ts` is the single place a database's connection details are resolved into one `databaseUrl` string — every file downstream of it (`pool.ts`, `migrator.ts`, every repository) sees only that string. Swapping RDS single-AZ → RDS Multi-AZ → Aurora PostgreSQL Provisioned is therefore a Terraform/`.tfvars` change and an environment-variable change, never an application code change. Task 1 proves this with tests before any other code exists.
- **Branch codes are exactly `KL`, `PG`, `JB`** (Kuala Lumpur, Penang, Johor Bahru).
- **Roles are exactly `doctor`, `nurse`, `records_clerk`, `admin`.** The field is carried through the domain and JWT for future extensibility but **is not enforced anywhere in this build** — any authenticated principal may call any endpoint. This is the one deliberate simplification from the original spec's §6.2; the `role` column, the JWT claim, and the `Principal` type all still exist so RBAC middleware can be added later without a schema or token-shape change.
- **Branch scoping is data, not access control.** `patients.branch_id` exists and is populated; no repository or route filters by it. Same rationale as roles above — this is the seam RBAC/branch-scoping middleware would attach to later.
- **No audit log, no attachments, no Cognito adapter, no CloudFront/WAF/KMS in this build.** Cut per the 2026-08-08 chat decision. The `ObjectStore` and `AuditLog` ports from the original spec are not created — adding them later is additive (a new port, a new adapter, one new composition-root wire-up), not a refactor.
- **Explicit failure.** No error is caught and silently discarded. Every failure either propagates as a typed error or is logged with full context before a fallback runs.
- **The dependency rule is one-directional:** `http` → `services` → `ports` ← `adapters`. Nothing in `domain/` or `services/` imports from `adapters/`. Nothing in `domain/` or `ports/` imports an AWS SDK type or the `pg` package.
- **TDD for `packages/shared` and `packages/api`.** RED → GREEN → REFACTOR for domain, ports/memory-adapters, services, and the Postgres adapter. `packages/web`, Docker, and Terraform use a lighter write-then-verify cycle (typecheck/build/`terraform validate` + a manual smoke-test instruction) — consistent with how the original spec's own testing strategy treats infrastructure and frontend differently from domain/services.
- **Commit after every task.** Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`).
- **Learner Lab constraints (from `servicerestrictions.md`), binding on every Terraform task:** region `us-east-1`; no IAM role creation — every role reference is `data "aws_iam_role" "lab"` looking up the pre-existing `LabRole`; RDS burstable instance classes only (nano/micro/small/medium) if not using Aurora; RDS enhanced monitoring must be disabled (`monitoring_interval = 0`); ECS task role and execution role both `LabRole`; ECR pushed as the console user, pulled by `LabRole` (read-only).
- **Secrets never reach a plaintext file or a Terraform variable's literal value where avoidable.** RDS/Aurora master credentials use `manage_master_user_password = true` (AWS-managed, in Secrets Manager, never in Terraform state). The JWT signing secret is the one deliberate exception — generated via `random_password` and stored in Secrets Manager, but its value does land in Terraform state, which is accepted and documented in Task 21 given the "no security hardening" scope of this build.

## File Structure

```
aws-demo-app/
  package.json                         npm workspaces root
  tsconfig.base.json                   strict compiler options
  .gitignore
  .nvmrc
  .env.example                         every env var this app reads, placeholder values
  docker-compose.yml                   dev: postgres + api(dev) + web(dev)
  docker-compose.prod.yml              prod-parity: postgres + api1 + api2 + web(nginx, round-robin)
  docker/
    api.Dockerfile                     deps / dev / build / prod stages
    web.Dockerfile                     dev / build / prod (nginx) stages
    nginx/nginx.conf
  packages/
    shared/
      package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts
      src/{index,enums,pagination,branch,patient,encounter,observation,auth}.ts
      test/{enums,schemas}.test.ts
    api/
      package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, vitest.db.config.ts
      migrations/{001_init.sql,002_reference_data.sql}
      src/
        domain/{errors,patient,encounter,observation}.ts
        ports/{index,branchRepository,patientRepository,encounterRepository,observationRepository,authProvider,instanceIdentity}.ts
        services/{patientService,encounterService,observationService,authService}.ts
        adapters/
          persistence/memory/{store,branchRepository,patientRepository,encounterRepository,observationRepository}.ts
          persistence/postgres/{types,pool,migrator,rowMappers,branchRepository,patientRepository,encounterRepository,observationRepository}.ts
          auth/localJwt/localJwtAuthProvider.ts
          identity/{ecsIdentity,localIdentity}.ts
        http/{server,errorMiddleware,authMiddleware,healthState,validate}.ts
        http/routes/{health,meta,auth,patients,encounters,observations,admin}.ts
        config/env.ts
        composition.ts
        index.ts
        scripts/seed.ts
      test/ (mirrors src/, one *.test.ts per implementation file; test/setup/postgres.globalSetup.ts; test/fixtures/ids.ts)
    web/
      package.json, tsconfig.json, vite.config.ts, index.html
      src/
        main.tsx, App.tsx
        api/client.ts
        auth/AuthContext.tsx
        pages/{LoginPage,PatientsPage,PatientDetailPage,EncounterPage,InfraPage}.tsx
        components/ServedByBadge.tsx
  infra/terraform/
    versions.tf, providers.tf, variables.tf, locals.tf, main.tf, outputs.tf
    modules/
      network/{main,variables,outputs}.tf
      data/{main,variables,outputs}.tf
      compute/{main,variables,outputs}.tf
    environments/learnerlab.tfvars
    scripts/build-and-push.sh
  docs/RUNBOOK.md
```

---

### Task 1: Monorepo scaffold and the database-agnostic environment schema

This task exists first, before any domain code, because it is where the "no service lock-in" requirement gets proven with a test.

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, `.env.example`
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/tsconfig.build.json`, `packages/api/vitest.config.ts`
- Create: `packages/api/src/config/env.ts`
- Test: `packages/api/test/config/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AppConfig` type, `loadConfig(env?: NodeJS.ProcessEnv): AppConfig` — every later task that needs configuration imports this.

- [ ] **Step 1: Create the workspace root files**

`package.json`:

```json
{
  "name": "aethelgard-demo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "test:unit": "npm run test:unit --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "build": "npm run build -w @aethelgard/shared && npm run build -w @aethelgard/api && npm run build -w @aethelgard/web",
    "seed": "npm run seed -w @aethelgard/api"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.2",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
coverage/
.env
.env.local
*.log
.terraform/
*.tfstate
*.tfstate.*
.terraform.lock.hcl
```

`.nvmrc`:

```
22
```

`.env.example` — every variable the application reads, real placeholder shape, with the DB-agnostic contract spelled out:

```
# ---- Application ----
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
APP_VERSION=0.1.0
SERVE_STATIC=false

# ---- Database ----
# Give EITHER a single DATABASE_URL (used by docker-compose locally) OR the
# five split DB_* vars (used by the ECS task definition in AWS, where
# DB_HOST/DB_PORT/DB_NAME/DB_USER come from Terraform outputs and DB_PASSWORD
# is injected from AWS Secrets Manager). config/env.ts assembles the same
# connection string either way, so pointing this at RDS single-AZ, RDS
# Multi-AZ, or an Aurora PostgreSQL cluster is a config change only.
DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard
# DB_HOST=<REPLACE_WITH_TERRAFORM_OUTPUT db_host>
# DB_PORT=5432
# DB_NAME=aethelgard
# DB_USER=aethelgard_app
# DB_PASSWORD=<REPLACE_WITH_SECRETS_MANAGER_VALUE>

# ---- Auth ----
AUTH_DRIVER=localJwt
JWT_SECRET=dev-only-secret-change-me-min-8-chars

# ---- Instance identity ----
# local = container hostname (docker-compose). ecs = ECS task metadata (Fargate).
IDENTITY_DRIVER=local

# ---- AWS (placeholders — filled in from `terraform output` after apply) ----
AWS_REGION=<REPLACE_WITH_TERRAFORM_OUTPUT region>
ECR_REPOSITORY_URL=<REPLACE_WITH_TERRAFORM_OUTPUT ecr_repository_url>
ALB_DNS_NAME=<REPLACE_WITH_TERRAFORM_OUTPUT alb_dns_name>
```

- [ ] **Step 2: Create the api package**

`packages/api/package.json`:

```json
{
  "name": "@aethelgard/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run && vitest run --config vitest.db.config.ts",
    "test:unit": "vitest run",
    "test:db": "vitest run --config vitest.db.config.ts",
    "typecheck": "tsc --noEmit",
    "seed": "tsx src/scripts/seed.ts"
  },
  "dependencies": {
    "@aethelgard/shared": "*",
    "@fastify/static": "^8.0.0",
    "bcryptjs": "^2.4.3",
    "fastify": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.13.1",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/pg": "^8.11.10",
    "@testcontainers/postgresql": "^10.16.0",
    "tsx": "^4.19.2"
  }
}
```

`packages/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@aethelgard/shared": ["../shared/src/index.ts"] }
  },
  "include": ["src", "test", "vitest.config.ts", "vitest.db.config.ts"]
}
```

`packages/api/tsconfig.build.json` — the production build target, separate from the dev/test config above so `noEmit` doesn't have to be fought over:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "paths": {}
  },
  "exclude": ["test", "**/*.test.ts"]
}
```

`packages/api/vitest.config.ts`:

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
    exclude: [...configDefaults.exclude, 'test/postgres/**'],
  },
});
```

- [ ] **Step 3: Write the failing config test**

`packages/api/test/config/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const BASE_ENV = {
  JWT_SECRET: 'dev-only-secret-change-me',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig(BASE_ENV);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.authDriver).toBe('localJwt');
    expect(config.identityDriver).toBe('local');
    expect(config.serveStatic).toBe(false);
  });

  it('uses DATABASE_URL verbatim when provided', () => {
    const config = loadConfig(BASE_ENV);
    expect(config.databaseUrl).toBe('postgresql://u:p@localhost:5432/db');
  });

  it('assembles the same shape of connection string from split DB_* vars, regardless of host format', () => {
    const rdsShape = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'aethelgard.abc123xyz.us-east-1.rds.amazonaws.com',
      DB_NAME: 'aethelgard',
      DB_USER: 'aethelgard_app',
      DB_PASSWORD: 'swap-me',
    });
    const auroraShape = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'aethelgard.cluster-abc123xyz.us-east-1.rds.amazonaws.com',
      DB_NAME: 'aethelgard',
      DB_USER: 'aethelgard_app',
      DB_PASSWORD: 'swap-me',
    });
    expect(rdsShape.databaseUrl).toBe(
      'postgresql://aethelgard_app:swap-me@aethelgard.abc123xyz.us-east-1.rds.amazonaws.com:5432/aethelgard',
    );
    expect(auroraShape.databaseUrl).toBe(
      'postgresql://aethelgard_app:swap-me@aethelgard.cluster-abc123xyz.us-east-1.rds.amazonaws.com:5432/aethelgard',
    );
    // Same construction logic produced both — the only difference is the hostname
    // Terraform handed it. No branch in this code ever asks "is this Aurora?".
  });

  it('URI-encodes special characters in a split-var password', () => {
    const config = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'localhost',
      DB_NAME: 'db',
      DB_USER: 'u',
      DB_PASSWORD: 'p@ss/word?',
    });
    expect(config.databaseUrl).toBe('postgresql://u:p%40ss%2Fword%3F@localhost:5432/db');
  });

  it('respects a custom DB_PORT', () => {
    const config = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_NAME: 'db',
      DB_USER: 'u',
      DB_PASSWORD: 'p',
    });
    expect(config.databaseUrl).toContain(':5433/db');
  });

  it('throws a descriptive error when neither DATABASE_URL nor the full split set is given', () => {
    expect(() => loadConfig({ JWT_SECRET: 'dev-only-secret-change-me' })).toThrow(
      /DATABASE_URL.*DB_HOST/s,
    );
  });

  it('throws when JWT_SECRET is missing or too short', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d' })).toThrow();
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d', JWT_SECRET: 'short' }),
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm install && npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/config/env.js` (package installs first; this also creates `package-lock.json`).

- [ ] **Step 5: Implement `config/env.ts`**

```ts
import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().min(1).default('0.0.0'),
  SERVE_STATIC: z.coerce.boolean().default(false),

  DATABASE_URL: z.string().min(1).optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).optional(),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().min(1).optional(),

  AUTH_DRIVER: z.enum(['localJwt']).default('localJwt'),
  JWT_SECRET: z.string().min(8),

  IDENTITY_DRIVER: z.enum(['local', 'ecs']).default('local'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  logLevel: string;
  appVersion: string;
  serveStatic: boolean;
  databaseUrl: string;
  authDriver: 'localJwt';
  jwtSecret: string;
  identityDriver: 'local' | 'ecs';
};

/**
 * The single place a database's connection details are resolved into one
 * connection string. Everything downstream (pool.ts, migrator.ts, every
 * repository) sees only the returned string — never a host, never a flag
 * saying "this is Aurora". That is what makes swapping RDS single-AZ, RDS
 * Multi-AZ, or Aurora PostgreSQL a deploy-time config change instead of an
 * application code change.
 */
const resolveDatabaseUrl = (env: z.infer<typeof rawEnvSchema>): string => {
  if (env.DATABASE_URL !== undefined) {
    return env.DATABASE_URL;
  }
  if (
    env.DB_HOST !== undefined &&
    env.DB_NAME !== undefined &&
    env.DB_USER !== undefined &&
    env.DB_PASSWORD !== undefined
  ) {
    const user = encodeURIComponent(env.DB_USER);
    const password = encodeURIComponent(env.DB_PASSWORD);
    return `postgresql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
  }
  throw new Error(
    'Set DATABASE_URL, or all of DB_HOST/DB_NAME/DB_USER/DB_PASSWORD (DB_PORT optional, defaults to 5432).',
  );
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = rawEnvSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    appVersion: parsed.APP_VERSION,
    serveStatic: parsed.SERVE_STATIC,
    databaseUrl: resolveDatabaseUrl(parsed),
    authDriver: parsed.AUTH_DRIVER,
    jwtSecret: parsed.JWT_SECRET,
    identityDriver: parsed.IDENTITY_DRIVER,
  };
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 8 tests.

- [ ] **Step 7: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore .nvmrc .env.example packages/api
git commit -m "feat(api): scaffold monorepo and add database-agnostic env config"
```

---

### Task 2: Shared package — enums and entity schemas

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/tsconfig.build.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/{index,enums,pagination,branch,patient,encounter,observation,auth}.ts`
- Test: `packages/shared/test/{enums,schemas}.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `@aethelgard/shared`): `BRANCH_CODES`/`branchCodeSchema`/`BranchCode`, `ROLES`/`roleSchema`/`Role`, `SEXES`/`sexSchema`/`Sex`, `ENCOUNTER_TYPES`/`encounterTypeSchema`/`EncounterType`, `ENCOUNTER_STATUSES`/`encounterStatusSchema`/`EncounterStatus`, `OBSERVATION_CODES`/`observationCodeSchema`/`ObservationCode`, `paginationQuerySchema`/`PaginationQuery`/`Page<T>`, `branchSchema`/`Branch`, `mrnSchema`/`patientSchema`/`Patient`/`createPatientSchema`/`CreatePatientInput`/`updatePatientSchema`/`UpdatePatientInput`, `encounterSchema`/`Encounter`/`createEncounterSchema`/`CreateEncounterInput`/`patchEncounterSchema`/`PatchEncounterInput`, `observationSchema`/`Observation`/`createObservationSchema`/`CreateObservationInput`, `principalSchema`/`Principal`/`loginSchema`/`LoginInput`/`demoUserSchema`/`DemoUser`.

- [ ] **Step 1: Create the package files**

`packages/shared/package.json`:

```json
{
  "name": "@aethelgard/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^4.0.0" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/shared/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "exclude": ["test", "**/*.test.ts"]
}
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 2: Write the failing enum test**

`packages/shared/test/enums.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BRANCH_CODES,
  ENCOUNTER_STATUSES,
  ENCOUNTER_TYPES,
  OBSERVATION_CODES,
  ROLES,
  branchCodeSchema,
  encounterStatusSchema,
  encounterTypeSchema,
  observationCodeSchema,
  roleSchema,
  sexSchema,
} from '../src/index.js';

describe('enum tuples', () => {
  it('pins the three Aethelgard branch codes in order', () => {
    expect(BRANCH_CODES).toEqual(['KL', 'PG', 'JB']);
  });

  it('pins the four clinical roles', () => {
    expect(ROLES).toEqual(['doctor', 'nurse', 'records_clerk', 'admin']);
  });

  it('pins the three encounter types', () => {
    expect(ENCOUNTER_TYPES).toEqual(['outpatient', 'inpatient', 'emergency']);
  });

  it('pins the encounter lifecycle statuses', () => {
    expect(ENCOUNTER_STATUSES).toEqual(['open', 'discharged', 'cancelled']);
  });

  it('pins the five observation codes', () => {
    expect(OBSERVATION_CODES).toEqual([
      'heart_rate',
      'blood_pressure',
      'temperature',
      'spo2',
      'weight',
    ]);
  });
});

describe('enum schemas', () => {
  it('accepts a known branch code and rejects an unknown one', () => {
    expect(branchCodeSchema.parse('PG')).toBe('PG');
    expect(branchCodeSchema.safeParse('SG').success).toBe(false);
  });

  it('rejects a role that is not in the matrix', () => {
    expect(roleSchema.parse('records_clerk')).toBe('records_clerk');
    expect(roleSchema.safeParse('pharmacist').success).toBe(false);
  });

  it('treats unknown sex as a valid recorded value', () => {
    expect(sexSchema.parse('unknown')).toBe('unknown');
    expect(sexSchema.safeParse('').success).toBe(false);
  });

  it('rejects an observation code outside the demo vocabulary', () => {
    expect(observationCodeSchema.parse('spo2')).toBe('spo2');
    expect(observationCodeSchema.safeParse('glucose').success).toBe(false);
  });

  it('rejects an encounter type outside the three admission routes', () => {
    expect(encounterTypeSchema.parse('emergency')).toBe('emergency');
    expect(encounterTypeSchema.safeParse('daycare').success).toBe(false);
  });

  it('rejects an encounter status outside the lifecycle', () => {
    expect(encounterStatusSchema.parse('discharged')).toBe('discharged');
    expect(encounterStatusSchema.safeParse('archived').success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm install && npm run test:unit -w @aethelgard/shared`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement `enums.ts` and `index.ts`**

`packages/shared/src/enums.ts`:

```ts
import { z } from 'zod';

export const BRANCH_CODES = ['KL', 'PG', 'JB'] as const;
export const branchCodeSchema = z.enum(BRANCH_CODES);
export type BranchCode = z.infer<typeof branchCodeSchema>;

export const ROLES = ['doctor', 'nurse', 'records_clerk', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const SEXES = ['male', 'female', 'other', 'unknown'] as const;
export const sexSchema = z.enum(SEXES);
export type Sex = z.infer<typeof sexSchema>;

export const ENCOUNTER_TYPES = ['outpatient', 'inpatient', 'emergency'] as const;
export const encounterTypeSchema = z.enum(ENCOUNTER_TYPES);
export type EncounterType = z.infer<typeof encounterTypeSchema>;

export const ENCOUNTER_STATUSES = ['open', 'discharged', 'cancelled'] as const;
export const encounterStatusSchema = z.enum(ENCOUNTER_STATUSES);
export type EncounterStatus = z.infer<typeof encounterStatusSchema>;

export const OBSERVATION_CODES = [
  'heart_rate',
  'blood_pressure',
  'temperature',
  'spo2',
  'weight',
] as const;
export const observationCodeSchema = z.enum(OBSERVATION_CODES);
export type ObservationCode = z.infer<typeof observationCodeSchema>;
```

`packages/shared/src/index.ts` (grown further in Step 6 below — write the enums-only line now):

```ts
export * from './enums.js';
```

- [ ] **Step 5: Run it to verify the enum tests pass**

Run: `npm run test:unit -w @aethelgard/shared`
Expected: PASS — 11 tests.

- [ ] **Step 6: Write the failing entity-schema test**

`packages/shared/test/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createEncounterSchema,
  createObservationSchema,
  createPatientSchema,
  demoUserSchema,
  encounterSchema,
  loginSchema,
  mrnSchema,
  observationSchema,
  paginationQuerySchema,
  patientSchema,
  principalSchema,
  updatePatientSchema,
} from '../src/index.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-08-07T09:00:00.000Z';

describe('paginationQuerySchema', () => {
  it('defaults to the first page of twenty', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces numeric strings so it can parse a query string directly', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('caps pageSize so a client cannot request an unbounded scan', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});

describe('mrnSchema', () => {
  it('accepts a branch-prefixed medical record number', () => {
    expect(mrnSchema.parse('KL-000123')).toBe('KL-000123');
  });

  it.each(['kl-000123', 'KL-12345', 'KL000123', 'ZZ-000123'])(
    'rejects the malformed MRN %s',
    (candidate) => {
      expect(mrnSchema.safeParse(candidate).success).toBe(false);
    },
  );
});

describe('patientSchema', () => {
  const valid = {
    id: UUID_A,
    mrn: 'KL-000123',
    name: 'Nurul Aisyah binti Rahman',
    dob: '1985-03-14',
    sex: 'female',
    phone: '+60123456789',
    branchId: UUID_B,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };

  it('accepts a complete patient record', () => {
    expect(patientSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an empty name', () => {
    expect(patientSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });
});

describe('createPatientSchema', () => {
  it('does not accept an MRN — the server assigns it', () => {
    const parsed = createPatientSchema.parse({
      mrn: 'KL-000123',
      name: 'Tan Wei Ming',
      dob: '1990-01-01',
      sex: 'male',
      phone: '+60129876543',
    });
    expect(parsed).not.toHaveProperty('mrn');
  });

  it('allows a caller to name the target branch', () => {
    const parsed = createPatientSchema.parse({
      name: 'Tan Wei Ming',
      dob: '1990-01-01',
      sex: 'male',
      phone: '+60129876543',
      branchId: UUID_B,
    });
    expect(parsed.branchId).toBe(UUID_B);
  });
});

describe('updatePatientSchema', () => {
  it('accepts a single-field patch', () => {
    expect(updatePatientSchema.parse({ phone: '+60111111111' })).toEqual({
      phone: '+60111111111',
    });
  });

  it('rejects an empty patch so a no-op write never reaches the database', () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
  });
});

describe('encounterSchema and createEncounterSchema', () => {
  it('accepts an open encounter with no discharge timestamp', () => {
    const valid = {
      id: UUID_A,
      patientId: UUID_B,
      branchId: UUID_B,
      type: 'inpatient',
      department: 'Cardiology',
      admittedAt: NOW,
      dischargedAt: null,
      status: 'open',
    };
    expect(encounterSchema.parse(valid)).toEqual(valid);
  });

  it('defaults status to open and leaves admittedAt optional', () => {
    const parsed = createEncounterSchema.parse({ type: 'outpatient', department: 'General' });
    expect(parsed).toEqual({ type: 'outpatient', department: 'General', status: 'open' });
  });
});

describe('createObservationSchema', () => {
  it('accepts a numeric observation with a unit', () => {
    expect(
      createObservationSchema.parse({ code: 'heart_rate', valueNum: 72, unit: 'bpm' }),
    ).toEqual({ code: 'heart_rate', valueNum: 72, unit: 'bpm' });
  });

  it('accepts a textual observation', () => {
    expect(
      createObservationSchema.parse({ code: 'blood_pressure', valueText: '120/80' }),
    ).toEqual({ code: 'blood_pressure', valueText: '120/80' });
  });

  it('rejects an observation carrying neither a numeric nor a textual value', () => {
    expect(createObservationSchema.safeParse({ code: 'weight' }).success).toBe(false);
  });
});

describe('observationSchema', () => {
  it('accepts a stored observation with explicit nulls', () => {
    const stored = {
      id: UUID_A,
      encounterId: UUID_B,
      code: 'spo2',
      valueNum: 98,
      valueText: null,
      unit: '%',
      recordedAt: NOW,
      recordedBy: UUID_B,
    };
    expect(observationSchema.parse(stored)).toEqual(stored);
  });
});

describe('auth schemas', () => {
  it('accepts a principal carrying branch identity', () => {
    const principal = {
      userId: UUID_A,
      email: 'doc.kl@aethelgard.demo',
      role: 'doctor',
      branchId: UUID_B,
    };
    expect(principalSchema.parse(principal)).toEqual(principal);
  });

  it('rejects a malformed login email', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'demo1234' }).success).toBe(
      false,
    );
  });

  it('exposes no secret on a demo user entry', () => {
    const demoUser = {
      email: 'doc.kl@aethelgard.demo',
      role: 'doctor',
      branchCode: 'KL',
      displayName: 'Dr Lim (Kuala Lumpur)',
    };
    expect(demoUserSchema.parse(demoUser)).toEqual(demoUser);
    expect(demoUserSchema.parse({ ...demoUser, password: 'leaked' })).not.toHaveProperty(
      'password',
    );
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/shared`
Expected: FAIL — the new imports don't exist yet.

- [ ] **Step 8: Implement the remaining schema modules**

`packages/shared/src/pagination.ts`:

```ts
import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
```

`packages/shared/src/branch.ts`:

```ts
import { z } from 'zod';
import { branchCodeSchema } from './enums.js';

export const branchSchema = z.object({
  id: z.uuid(),
  code: branchCodeSchema,
  name: z.string().min(1).max(120),
});
export type Branch = z.infer<typeof branchSchema>;
```

`packages/shared/src/patient.ts`:

```ts
import { z } from 'zod';
import { sexSchema } from './enums.js';

export const mrnSchema = z
  .string()
  .regex(/^(?:KL|PG|JB)-\d{6}$/, 'MRN must be a branch code, a hyphen, and six digits');

export const patientSchema = z.object({
  id: z.uuid(),
  mrn: mrnSchema,
  name: z.string().min(1).max(200),
  dob: z.iso.date(),
  sex: sexSchema,
  phone: z.string().min(6).max(30),
  branchId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export type Patient = z.infer<typeof patientSchema>;

export const createPatientSchema = z
  .object({
    name: z.string().min(1).max(200),
    dob: z.iso.date(),
    sex: sexSchema,
    phone: z.string().min(6).max(30),
    branchId: z.uuid().optional(),
  })
  .strip();
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    dob: z.iso.date().optional(),
    sex: sexSchema.optional(),
    phone: z.string().min(6).max(30).optional(),
  })
  .strip()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be supplied',
  });
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
```

`packages/shared/src/encounter.ts`:

```ts
import { z } from 'zod';
import { encounterStatusSchema, encounterTypeSchema } from './enums.js';

export const encounterSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  branchId: z.uuid(),
  type: encounterTypeSchema,
  department: z.string().min(1).max(120),
  admittedAt: z.iso.datetime(),
  dischargedAt: z.iso.datetime().nullable(),
  status: encounterStatusSchema,
});
export type Encounter = z.infer<typeof encounterSchema>;

export const createEncounterSchema = z
  .object({
    type: encounterTypeSchema,
    department: z.string().min(1).max(120),
    admittedAt: z.iso.datetime().optional(),
    status: encounterStatusSchema.default('open'),
  })
  .strip();
export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;

export const patchEncounterSchema = z
  .object({
    department: z.string().min(1).max(120).optional(),
    status: encounterStatusSchema.optional(),
    dischargedAt: z.iso.datetime().optional(),
  })
  .strip()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be supplied',
  });
export type PatchEncounterInput = z.infer<typeof patchEncounterSchema>;
```

`packages/shared/src/observation.ts`:

```ts
import { z } from 'zod';
import { observationCodeSchema } from './enums.js';

export const observationSchema = z.object({
  id: z.uuid(),
  encounterId: z.uuid(),
  code: observationCodeSchema,
  valueNum: z.number().nullable(),
  valueText: z.string().nullable(),
  unit: z.string().max(20).nullable(),
  recordedAt: z.iso.datetime(),
  recordedBy: z.uuid(),
});
export type Observation = z.infer<typeof observationSchema>;

export const createObservationSchema = z
  .object({
    code: observationCodeSchema,
    valueNum: z.number().optional(),
    valueText: z.string().min(1).max(200).optional(),
    unit: z.string().max(20).optional(),
    recordedAt: z.iso.datetime().optional(),
  })
  .strip()
  .refine((input) => input.valueNum !== undefined || input.valueText !== undefined, {
    message: 'An observation must carry either valueNum or valueText',
  });
export type CreateObservationInput = z.infer<typeof createObservationSchema>;
```

`packages/shared/src/auth.ts`:

```ts
import { z } from 'zod';
import { branchCodeSchema, roleSchema } from './enums.js';

export const principalSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  role: roleSchema,
  branchId: z.uuid(),
});
export type Principal = z.infer<typeof principalSchema>;

export const loginSchema = z
  .object({ email: z.email(), password: z.string().min(8).max(200) })
  .strip();
export type LoginInput = z.infer<typeof loginSchema>;

export const demoUserSchema = z
  .object({
    email: z.email(),
    role: roleSchema,
    branchCode: branchCodeSchema,
    displayName: z.string().min(1).max(120),
  })
  .strip();
export type DemoUser = z.infer<typeof demoUserSchema>;
```

`packages/shared/src/index.ts` (replace the whole file):

```ts
export * from './enums.js';
export * from './pagination.js';
export * from './branch.js';
export * from './patient.js';
export * from './encounter.js';
export * from './observation.js';
export * from './auth.js';
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/shared`
Expected: PASS — all enum tests plus 19 schema tests.

- [ ] **Step 10: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/shared`
Expected: no output, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add entity, pagination and auth Zod schemas"
```

---

### Task 3: Typed error hierarchy and domain invariants

**Files:**
- Create: `packages/api/src/domain/{errors,patient,encounter,observation}.ts`
- Test: `packages/api/test/domain/{errors,patient,encounter,observation}.test.ts`

**Interfaces:**
- Consumes: `BranchCode`, `Encounter`, `PatchEncounterInput`, `EncounterStatus`, `CreateObservationInput` from `@aethelgard/shared`.
- Produces: abstract `DomainError` (`code: string`, `httpStatus: number`, `details: Record<string, unknown>`); `NotFoundError(entityType, id)`, `ValidationError(message, details?)`, `ForbiddenError(message?)`, `ConflictError(message, details?)`, `UpstreamError(message, cause)`; `isDomainError(value): value is DomainError`. `formatMrn(branchCode, sequence): string`, `generateMrnCandidate(branchCode, sequenceSource?): string`, `assertValidDateOfBirth(dob, today): void`. `type EncounterTransition = { department?: string; status?: EncounterStatus; dischargedAt?: string | null }`, `resolveEncounterTransition(encounter, patch, now): EncounterTransition`. `type ObservationValue = { valueNum: number | null; valueText: string | null; unit: string | null }`, `resolveObservationValue(input): ObservationValue`.

- [ ] **Step 1: Write the failing error-hierarchy test**

`packages/api/test/domain/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  ValidationError,
  isDomainError,
} from '../../src/domain/errors.js';

describe('NotFoundError', () => {
  it('carries a 404 status and a machine-readable code', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error.httpStatus).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('patient abc was not found');
    expect(error.details).toEqual({ entityType: 'patient', id: 'abc' });
  });

  it('is a real Error subclass so instanceof and stack traces both work', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('NotFoundError');
  });
});

describe('ValidationError', () => {
  it('carries a 400 status and field-level detail', () => {
    const error = new ValidationError('bad dob', { field: 'dob' });
    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual({ field: 'dob' });
  });
});

describe('ForbiddenError', () => {
  it('carries a 403 status and never leaks details', () => {
    expect(new ForbiddenError().httpStatus).toBe(403);
    expect(new ForbiddenError().message).toBe('Access denied');
    expect(new ForbiddenError('custom').details).toEqual({});
  });
});

describe('ConflictError', () => {
  it('carries a 409 status', () => {
    const error = new ConflictError('MRN already assigned', { mrn: 'KL-000123' });
    expect(error.httpStatus).toBe(409);
    expect(error.details).toEqual({ mrn: 'KL-000123' });
  });
});

describe('UpstreamError', () => {
  it('carries a 502 status and preserves the cause', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new UpstreamError('db unreachable', cause);
    expect(error.httpStatus).toBe(502);
    expect(error.cause).toBe(cause);
  });
});

describe('isDomainError', () => {
  it('recognises domain errors and rejects everything else', () => {
    expect(isDomainError(new NotFoundError('patient', 'a'))).toBe(true);
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/domain/errors.js`.

- [ ] **Step 3: Implement `domain/errors.ts`**

```ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  protected constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
  constructor(entityType: string, id: string) {
    super(`${entityType} ${id} was not found`, { entityType, id });
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

/** Never carries details by construction — a 403 must not reveal whether the resource exists. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
  constructor(message = 'Access denied') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

export class UpstreamError extends DomainError {
  readonly code = 'UPSTREAM_FAILED';
  readonly httpStatus = 502;
  constructor(message: string, cause: unknown) {
    super(message);
    this.cause = cause;
  }
}

export const isDomainError = (value: unknown): value is DomainError =>
  value instanceof DomainError;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 9 tests.

- [ ] **Step 5: Write the failing patient/encounter/observation invariant tests**

`packages/api/test/domain/patient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mrnSchema } from '@aethelgard/shared';
import { ValidationError } from '../../src/domain/errors.js';
import { assertValidDateOfBirth, formatMrn, generateMrnCandidate } from '../../src/domain/patient.js';

describe('formatMrn', () => {
  it('zero-pads the sequence to six digits behind the branch code', () => {
    expect(formatMrn('KL', 123)).toBe('KL-000123');
    expect(formatMrn('JB', 1)).toBe('JB-000001');
  });

  it('produces an MRN the shared schema accepts', () => {
    expect(mrnSchema.safeParse(formatMrn('PG', 999999)).success).toBe(true);
  });

  it('rejects a sequence that will not fit in six digits', () => {
    expect(() => formatMrn('KL', 1_000_000)).toThrow(ValidationError);
  });

  it('rejects a non-positive or fractional sequence', () => {
    expect(() => formatMrn('KL', 0)).toThrow(ValidationError);
    expect(() => formatMrn('KL', 1.5)).toThrow(ValidationError);
  });
});

describe('generateMrnCandidate', () => {
  it('uses the injected sequence source so tests are deterministic', () => {
    expect(generateMrnCandidate('PG', () => 42)).toBe('PG-000042');
  });

  it('produces a schema-valid MRN from the default random source', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(mrnSchema.safeParse(generateMrnCandidate('KL')).success).toBe(true);
    }
  });
});

describe('assertValidDateOfBirth', () => {
  const today = new Date('2026-08-07T00:00:00.000Z');

  it('accepts a date in the past and today', () => {
    expect(() => assertValidDateOfBirth('1985-03-14', today)).not.toThrow();
    expect(() => assertValidDateOfBirth('2026-08-07', today)).not.toThrow();
  });

  it('rejects a date of birth in the future', () => {
    expect(() => assertValidDateOfBirth('2026-08-08', today)).toThrow(ValidationError);
  });

  it('rejects an implausible date before 1900', () => {
    expect(() => assertValidDateOfBirth('1899-12-31', today)).toThrow(ValidationError);
  });

  it('rejects a string that is not a calendar date', () => {
    expect(() => assertValidDateOfBirth('not-a-date', today)).toThrow(ValidationError);
  });
});
```

`packages/api/test/domain/encounter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Encounter } from '@aethelgard/shared';
import { ValidationError } from '../../src/domain/errors.js';
import { resolveEncounterTransition } from '../../src/domain/encounter.js';

const NOW = '2026-08-07T12:00:00.000Z';
const openEncounter: Encounter = {
  id: '11111111-1111-4111-8111-111111111111',
  patientId: '22222222-2222-4222-8222-222222222222',
  branchId: '33333333-3333-4333-8333-333333333333',
  type: 'inpatient',
  department: 'Cardiology',
  admittedAt: '2026-08-05T08:00:00.000Z',
  dischargedAt: null,
  status: 'open',
};

describe('resolveEncounterTransition', () => {
  it('passes a department change through unchanged', () => {
    expect(resolveEncounterTransition(openEncounter, { department: 'Neurology' }, NOW)).toEqual({
      department: 'Neurology',
    });
  });

  it('stamps discharge with the current time when none is supplied', () => {
    expect(resolveEncounterTransition(openEncounter, { status: 'discharged' }, NOW)).toEqual({
      status: 'discharged',
      dischargedAt: NOW,
    });
  });

  it('honours an explicit discharge timestamp', () => {
    const dischargedAt = '2026-08-06T10:00:00.000Z';
    expect(
      resolveEncounterTransition(openEncounter, { status: 'discharged', dischargedAt }, NOW),
    ).toEqual({ status: 'discharged', dischargedAt });
  });

  it('rejects a discharge earlier than the admission', () => {
    expect(() =>
      resolveEncounterTransition(
        openEncounter,
        { status: 'discharged', dischargedAt: '2026-08-04T08:00:00.000Z' },
        NOW,
      ),
    ).toThrow(ValidationError);
  });

  it('rejects re-discharging an already-discharged encounter', () => {
    const discharged: Encounter = { ...openEncounter, status: 'discharged', dischargedAt: NOW };
    expect(() => resolveEncounterTransition(discharged, { department: 'ICU' }, NOW)).toThrow(
      ValidationError,
    );
  });
});
```

`packages/api/test/domain/observation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/errors.js';
import { resolveObservationValue } from '../../src/domain/observation.js';

describe('resolveObservationValue', () => {
  it('passes a numeric value with unit through unchanged', () => {
    expect(resolveObservationValue({ code: 'heart_rate', valueNum: 72, unit: 'bpm' })).toEqual({
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
    });
  });

  it('passes a textual value through unchanged', () => {
    expect(resolveObservationValue({ code: 'blood_pressure', valueText: '120/80' })).toEqual({
      valueNum: null,
      valueText: '120/80',
      unit: null,
    });
  });

  it('rejects a heart_rate outside the plausible clinical range', () => {
    expect(() => resolveObservationValue({ code: 'heart_rate', valueNum: 400 })).toThrow(
      ValidationError,
    );
  });

  it('rejects an spo2 above 100', () => {
    expect(() => resolveObservationValue({ code: 'spo2', valueNum: 101 })).toThrow(ValidationError);
  });

  it('accepts a boundary value', () => {
    expect(() => resolveObservationValue({ code: 'spo2', valueNum: 100 })).not.toThrow();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — `domain/patient.js`, `domain/encounter.js`, `domain/observation.js` don't exist.

- [ ] **Step 7: Implement the three invariant modules**

`packages/api/src/domain/patient.ts`:

```ts
import type { BranchCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

const MRN_DIGITS = 6;
const MRN_MAX_SEQUENCE = 10 ** MRN_DIGITS - 1;
const EARLIEST_PLAUSIBLE_DOB = '1900-01-01';

export const formatMrn = (branchCode: BranchCode, sequence: number): string => {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MRN_MAX_SEQUENCE) {
    throw new ValidationError(
      `MRN sequence must be an integer between 1 and ${MRN_MAX_SEQUENCE}`,
      { field: 'sequence', received: sequence },
    );
  }
  return `${branchCode}-${String(sequence).padStart(MRN_DIGITS, '0')}`;
};

const randomSequence = (): number => 1 + Math.floor(Math.random() * MRN_MAX_SEQUENCE);

/** Candidate only — the unique constraint on `patients.mrn` is the authority; the service retries on ConflictError. */
export const generateMrnCandidate = (
  branchCode: BranchCode,
  sequenceSource: () => number = randomSequence,
): string => formatMrn(branchCode, sequenceSource());

export const assertValidDateOfBirth = (dob: string, today: Date): void => {
  const parsed = Date.parse(`${dob}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(parsed)) {
    throw new ValidationError('Date of birth must be an ISO calendar date (YYYY-MM-DD)', {
      field: 'dob',
      received: dob,
    });
  }
  const todayUtcMidnight = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (parsed > todayUtcMidnight) {
    throw new ValidationError('Date of birth cannot be in the future', { field: 'dob', received: dob });
  }
  if (parsed < Date.parse(`${EARLIEST_PLAUSIBLE_DOB}T00:00:00.000Z`)) {
    throw new ValidationError(`Date of birth cannot be earlier than ${EARLIEST_PLAUSIBLE_DOB}`, {
      field: 'dob',
      received: dob,
    });
  }
};
```

`packages/api/src/domain/encounter.ts`:

```ts
import type { Encounter, EncounterStatus, PatchEncounterInput } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

export type EncounterTransition = {
  department?: string;
  status?: EncounterStatus;
  dischargedAt?: string | null;
};

export const resolveEncounterTransition = (
  encounter: Encounter,
  patch: PatchEncounterInput,
  now: string,
): EncounterTransition => {
  if (encounter.status === 'discharged' || encounter.status === 'cancelled') {
    throw new ValidationError(`Cannot modify a ${encounter.status} encounter`, {
      field: 'status',
      current: encounter.status,
    });
  }

  const transition: EncounterTransition = {};
  if (patch.department !== undefined) {
    transition.department = patch.department;
  }
  if (patch.status !== undefined) {
    transition.status = patch.status;
    if (patch.status === 'discharged') {
      const dischargedAt = patch.dischargedAt ?? now;
      if (Date.parse(dischargedAt) < Date.parse(encounter.admittedAt)) {
        throw new ValidationError('Discharge cannot precede admission', {
          field: 'dischargedAt',
          admittedAt: encounter.admittedAt,
          received: dischargedAt,
        });
      }
      transition.dischargedAt = dischargedAt;
    }
  }
  return transition;
};
```

`packages/api/src/domain/observation.ts`:

```ts
import type { CreateObservationInput, ObservationCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

export type ObservationValue = { valueNum: number | null; valueText: string | null; unit: string | null };

const NUMERIC_RANGES: Partial<Record<ObservationCode, { min: number; max: number }>> = {
  heart_rate: { min: 20, max: 300 },
  temperature: { min: 25, max: 45 },
  spo2: { min: 0, max: 100 },
  weight: { min: 0, max: 500 },
};

export const resolveObservationValue = (input: CreateObservationInput): ObservationValue => {
  const range = NUMERIC_RANGES[input.code];
  if (input.valueNum !== undefined && range !== undefined) {
    if (input.valueNum < range.min || input.valueNum > range.max) {
      throw new ValidationError(`${input.code} must be between ${range.min} and ${range.max}`, {
        field: 'valueNum',
        received: input.valueNum,
      });
    }
  }
  return {
    valueNum: input.valueNum ?? null,
    valueText: input.valueText ?? null,
    unit: input.unit ?? null,
  };
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — errors (9) + patient (9) + encounter (5) + observation (5) = 28 tests.

- [ ] **Step 9: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/domain packages/api/test/domain
git commit -m "feat(api): add typed error hierarchy and domain invariants"
```

---

### Task 4: Ports and in-memory adapters

**Files:**
- Create: `packages/api/src/ports/{index,branchRepository,patientRepository,encounterRepository,observationRepository,authProvider,instanceIdentity}.ts`
- Create: `packages/api/src/adapters/persistence/memory/{store,branchRepository,patientRepository,encounterRepository,observationRepository}.ts`
- Test: `packages/api/test/adapters/memory/{branchRepository,patientRepository,encounterRepository,observationRepository}.test.ts`
- Test: `packages/api/test/fixtures/ids.ts`

**Interfaces:**
- Consumes: entity types from `@aethelgard/shared`.
- Produces every port type and every `createMemory*Repository` factory listed below — Task 5 (services) and Task 7 (Postgres adapters) both implement/consume these exact shapes.

- [ ] **Step 1: Write the ports (no test — these are types and interfaces only, verified by the adapters that implement them)**

`packages/api/src/ports/branchRepository.ts`:

```ts
import type { Branch, BranchCode } from '@aethelgard/shared';

export type BranchRepository = {
  listAll(): Promise<Branch[]>;
  findById(id: string): Promise<Branch | null>;
  findByCode(code: BranchCode): Promise<Branch | null>;
};
```

`packages/api/src/ports/patientRepository.ts`:

```ts
import type { Page, Patient, Sex } from '@aethelgard/shared';

export type NewPatient = {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: Sex;
  phone: string;
  branchId: string;
  createdAt: string;
  updatedAt: string;
};

export type PatientPatch = {
  name?: string;
  dob?: string;
  sex?: Sex;
  phone?: string;
  updatedAt: string;
};

export type PatientSearchQuery = { search?: string; page: number; pageSize: number };

export type PatientRepository = {
  create(input: NewPatient): Promise<Patient>;
  findById(id: string): Promise<Patient | null>;
  findByMrn(mrn: string): Promise<Patient | null>;
  search(query: PatientSearchQuery): Promise<Page<Patient>>;
  update(id: string, patch: PatientPatch): Promise<Patient | null>;
  softDelete(id: string, deletedAt: string): Promise<boolean>;
};
```

`packages/api/src/ports/encounterRepository.ts`:

```ts
import type { Encounter, EncounterStatus, EncounterType } from '@aethelgard/shared';

export type NewEncounter = {
  id: string;
  patientId: string;
  branchId: string;
  type: EncounterType;
  department: string;
  admittedAt: string;
  status: EncounterStatus;
};

export type EncounterPatch = {
  department?: string;
  status?: EncounterStatus;
  dischargedAt?: string | null;
};

export type EncounterRepository = {
  create(input: NewEncounter): Promise<Encounter>;
  findById(id: string): Promise<Encounter | null>;
  listByPatient(patientId: string): Promise<Encounter[]>;
  update(id: string, patch: EncounterPatch): Promise<Encounter | null>;
};
```

`packages/api/src/ports/observationRepository.ts`:

```ts
import type { Observation, ObservationCode } from '@aethelgard/shared';

export type NewObservation = {
  id: string;
  encounterId: string;
  code: ObservationCode;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  recordedAt: string;
  recordedBy: string;
};

export type ObservationRepository = {
  create(input: NewObservation): Promise<Observation>;
  listByEncounter(encounterId: string): Promise<Observation[]>;
};
```

`packages/api/src/ports/authProvider.ts`:

```ts
import type { DemoUser, Principal } from '@aethelgard/shared';

export type LoginResult = { principal: Principal; token: string };

export type AuthProvider = {
  login(email: string, password: string): Promise<LoginResult | null>;
  verify(token: string): Promise<Principal | null>;
  listDemoUsers(): Promise<DemoUser[]>;
};
```

`packages/api/src/ports/instanceIdentity.ts`:

```ts
export type InstanceIdentity = {
  instanceId(): Promise<string>;
  availabilityZone(): Promise<string>;
};
```

`packages/api/src/ports/index.ts`:

```ts
export type { BranchRepository } from './branchRepository.js';
export type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from './patientRepository.js';
export type { EncounterPatch, EncounterRepository, NewEncounter } from './encounterRepository.js';
export type { NewObservation, ObservationRepository } from './observationRepository.js';
export type { AuthProvider, LoginResult } from './authProvider.js';
export type { InstanceIdentity } from './instanceIdentity.js';
```

- [ ] **Step 2: Write the fixed test fixtures**

`packages/api/test/fixtures/ids.ts`:

```ts
export const BRANCH_IDS = {
  KL: '11111111-1111-4111-8111-111111111111',
  PG: '22222222-2222-4222-8222-222222222222',
  JB: '33333333-3333-4333-8333-333333333333',
} as const;

export const USER_IDS = {
  adminKl: '44444444-4444-4444-8444-444444444444',
  doctorKl: '55555555-5555-4555-8555-555555555555',
} as const;
```

- [ ] **Step 3: Write the failing memory-adapter tests**

`packages/api/test/adapters/memory/branchRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryBranchRepository } from '../../../src/adapters/persistence/memory/branchRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

describe('createMemoryBranchRepository', () => {
  it('lists the three seeded branches ordered by code', async () => {
    const repo = createMemoryBranchRepository();
    const branches = await repo.listAll();
    expect(branches.map((b) => b.code)).toEqual(['JB', 'KL', 'PG']);
  });

  it('finds a branch by id and by code', async () => {
    const repo = createMemoryBranchRepository();
    expect((await repo.findById(BRANCH_IDS.KL))?.code).toBe('KL');
    expect((await repo.findByCode('PG'))?.id).toBe(BRANCH_IDS.PG);
  });

  it('returns null for an unknown id', async () => {
    const repo = createMemoryBranchRepository();
    expect(await repo.findById('does-not-exist')).toBeNull();
  });
});
```

`packages/api/test/adapters/memory/patientRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryPatientRepository } from '../../../src/adapters/persistence/memory/patientRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

const newPatient = (overrides: Partial<Parameters<ReturnType<typeof createMemoryPatientRepository>['create']>[0]> = {}) => ({
  id: crypto.randomUUID(),
  mrn: 'KL-000001',
  name: 'Tan Wei Ming',
  dob: '1990-01-01',
  sex: 'male' as const,
  phone: '+60129876543',
  branchId: BRANCH_IDS.KL,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides,
});

describe('createMemoryPatientRepository', () => {
  it('creates and finds a patient by id and by mrn', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient());
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.findByMrn(created.mrn)).toEqual(created);
  });

  it('rejects a duplicate MRN with ConflictError', async () => {
    const repo = createMemoryPatientRepository();
    await repo.create(newPatient({ mrn: 'KL-000002' }));
    await expect(repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000002' }))).rejects.toThrow(
      'ConflictError',
    );
  });

  it('excludes a soft-deleted patient from findById and search', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient({ mrn: 'KL-000003' }));
    await repo.softDelete(created.id, '2026-08-08T00:00:00.000Z');
    expect(await repo.findById(created.id)).toBeNull();
    const page = await repo.search({ page: 1, pageSize: 20 });
    expect(page.items.find((p) => p.id === created.id)).toBeUndefined();
  });

  it('searches by name (case-insensitive substring) and by exact mrn', async () => {
    const repo = createMemoryPatientRepository();
    await repo.create(newPatient({ mrn: 'KL-000004', name: 'Nurul Aisyah' }));
    await repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000005', name: 'Tan Wei Ming' }));
    const byName = await repo.search({ search: 'aisyah', page: 1, pageSize: 20 });
    expect(byName.items).toHaveLength(1);
    const byMrn = await repo.search({ search: 'KL-000005', page: 1, pageSize: 20 });
    expect(byMrn.items).toHaveLength(1);
  });

  it('paginates results and reports the unpaged total', async () => {
    const repo = createMemoryPatientRepository();
    for (let i = 0; i < 5; i += 1) {
      await repo.create(newPatient({ id: crypto.randomUUID(), mrn: `KL-00001${i}`, name: `Patient ${i}` }));
    }
    const page = await repo.search({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('updates mutable fields and stamps updatedAt', async () => {
    const repo = createMemoryPatientRepository();
    const created = await repo.create(newPatient({ mrn: 'KL-000020' }));
    const updated = await repo.update(created.id, { phone: '+60111111111', updatedAt: '2026-08-09T00:00:00.000Z' });
    expect(updated?.phone).toBe('+60111111111');
    expect(updated?.updatedAt).toBe('2026-08-09T00:00:00.000Z');
  });

  it('returns null when updating or soft-deleting an unknown id', async () => {
    const repo = createMemoryPatientRepository();
    expect(await repo.update('missing', { name: 'X', updatedAt: '2026-08-09T00:00:00.000Z' })).toBeNull();
    expect(await repo.softDelete('missing', '2026-08-09T00:00:00.000Z')).toBe(false);
  });
});
```

`packages/api/test/adapters/memory/encounterRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryEncounterRepository } from '../../../src/adapters/persistence/memory/encounterRepository.js';
import { BRANCH_IDS } from '../../fixtures/ids.js';

describe('createMemoryEncounterRepository', () => {
  it('creates an encounter and lists it by patient', async () => {
    const repo = createMemoryEncounterRepository();
    const patientId = crypto.randomUUID();
    const created = await repo.create({
      id: crypto.randomUUID(),
      patientId,
      branchId: BRANCH_IDS.KL,
      type: 'outpatient',
      department: 'General',
      admittedAt: '2026-08-07T00:00:00.000Z',
      status: 'open',
    });
    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.listByPatient(patientId)).toEqual([created]);
  });

  it('applies a patch and returns null for an unknown id', async () => {
    const repo = createMemoryEncounterRepository();
    const created = await repo.create({
      id: crypto.randomUUID(),
      patientId: crypto.randomUUID(),
      branchId: BRANCH_IDS.KL,
      type: 'inpatient',
      department: 'Cardiology',
      admittedAt: '2026-08-07T00:00:00.000Z',
      status: 'open',
    });
    const patched = await repo.update(created.id, { status: 'discharged', dischargedAt: '2026-08-08T00:00:00.000Z' });
    expect(patched?.status).toBe('discharged');
    expect(await repo.update('missing', { department: 'X' })).toBeNull();
  });
});
```

`packages/api/test/adapters/memory/observationRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryObservationRepository } from '../../../src/adapters/persistence/memory/observationRepository.js';

describe('createMemoryObservationRepository', () => {
  it('creates an observation and lists it by encounter, oldest first', async () => {
    const repo = createMemoryObservationRepository();
    const encounterId = crypto.randomUUID();
    const first = await repo.create({
      id: crypto.randomUUID(),
      encounterId,
      code: 'heart_rate',
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
      recordedAt: '2026-08-07T00:00:00.000Z',
      recordedBy: crypto.randomUUID(),
    });
    const second = await repo.create({
      id: crypto.randomUUID(),
      encounterId,
      code: 'spo2',
      valueNum: 98,
      valueText: null,
      unit: '%',
      recordedAt: '2026-08-07T01:00:00.000Z',
      recordedBy: crypto.randomUUID(),
    });
    expect(await repo.listByEncounter(encounterId)).toEqual([first, second]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — none of the memory adapter files exist yet.

- [ ] **Step 5: Implement the shared in-memory store and the four adapters**

`packages/api/src/adapters/persistence/memory/store.ts`:

```ts
export const createMap = <T>(): Map<string, T> => new Map<string, T>();
```

`packages/api/src/adapters/persistence/memory/branchRepository.ts`:

```ts
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
```

`packages/api/src/adapters/persistence/memory/patientRepository.ts`:

```ts
import type { Patient } from '@aethelgard/shared';
import { ConflictError } from '../../../domain/errors.js';
import type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryPatientRepository = (): PatientRepository => {
  const rows = createMap<Patient>();

  const isLive = (p: Patient): boolean => p.deletedAt === null;

  return {
    create: async (input: NewPatient) => {
      if ([...rows.values()].some((p) => p.mrn === input.mrn && isLive(p))) {
        throw new ConflictError('A patient with this MRN already exists', { mrn: input.mrn });
      }
      const patient: Patient = { ...input, deletedAt: null };
      rows.set(patient.id, patient);
      return patient;
    },

    findById: async (id) => {
      const found = rows.get(id);
      return found !== undefined && isLive(found) ? found : null;
    },

    findByMrn: async (mrn) => {
      const found = [...rows.values()].find((p) => p.mrn === mrn && isLive(p));
      return found ?? null;
    },

    search: async (query: PatientSearchQuery) => {
      const term = query.search?.trim().toLowerCase();
      const matches = [...rows.values()]
        .filter(isLive)
        .filter((p) => {
          if (term === undefined || term === '') return true;
          return p.name.toLowerCase().includes(term) || p.mrn.toLowerCase() === term;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const start = (query.page - 1) * query.pageSize;
      return {
        items: matches.slice(start, start + query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        total: matches.length,
      };
    },

    update: async (id, patch: PatientPatch) => {
      const found = rows.get(id);
      if (found === undefined || !isLive(found)) return null;
      const updated: Patient = {
        ...found,
        name: patch.name ?? found.name,
        dob: patch.dob ?? found.dob,
        sex: patch.sex ?? found.sex,
        phone: patch.phone ?? found.phone,
        updatedAt: patch.updatedAt,
      };
      rows.set(id, updated);
      return updated;
    },

    softDelete: async (id, deletedAt) => {
      const found = rows.get(id);
      if (found === undefined || !isLive(found)) return false;
      rows.set(id, { ...found, deletedAt, updatedAt: deletedAt });
      return true;
    },
  };
};
```

`packages/api/src/adapters/persistence/memory/encounterRepository.ts`:

```ts
import type { Encounter } from '@aethelgard/shared';
import type { EncounterPatch, EncounterRepository, NewEncounter } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryEncounterRepository = (): EncounterRepository => {
  const rows = createMap<Encounter>();

  return {
    create: async (input: NewEncounter) => {
      const encounter: Encounter = { ...input, dischargedAt: null };
      rows.set(encounter.id, encounter);
      return encounter;
    },
    findById: async (id) => rows.get(id) ?? null,
    listByPatient: async (patientId) =>
      [...rows.values()]
        .filter((e) => e.patientId === patientId)
        .sort((a, b) => a.admittedAt.localeCompare(b.admittedAt)),
    update: async (id, patch: EncounterPatch) => {
      const found = rows.get(id);
      if (found === undefined) return null;
      const updated: Encounter = {
        ...found,
        department: patch.department ?? found.department,
        status: patch.status ?? found.status,
        dischargedAt: patch.dischargedAt !== undefined ? patch.dischargedAt : found.dischargedAt,
      };
      rows.set(id, updated);
      return updated;
    },
  };
};
```

`packages/api/src/adapters/persistence/memory/observationRepository.ts`:

```ts
import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import { createMap } from './store.js';

export const createMemoryObservationRepository = (): ObservationRepository => {
  const rows = createMap<Observation>();

  return {
    create: async (input: NewObservation) => {
      const observation: Observation = { ...input };
      rows.set(observation.id, observation);
      return observation;
    },
    listByEncounter: async (encounterId) =>
      [...rows.values()]
        .filter((o) => o.encounterId === encounterId)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
  };
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 3 (branch) + 7 (patient) + 2 (encounter) + 1 (observation) = 13 new tests, 41 total.

- [ ] **Step 7: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/ports packages/api/src/adapters/persistence/memory packages/api/test/adapters/memory packages/api/test/fixtures
git commit -m "feat(api): add repository ports and in-memory adapters"
```

---

### Task 5: Service layer, tested against the in-memory adapters

**Files:**
- Create: `packages/api/src/services/{patientService,encounterService,observationService,authService}.ts`
- Test: `packages/api/test/services/{patientService,encounterService,observationService,authService}.test.ts`

**Interfaces:**
- Consumes: every port and memory adapter from Task 4; `formatMrn`/`generateMrnCandidate`/`assertValidDateOfBirth` from `domain/patient.js`; `resolveEncounterTransition` from `domain/encounter.js`; `resolveObservationValue` from `domain/observation.js`; `NotFoundError`/`ConflictError`/`ForbiddenError` from `domain/errors.js`.
- Produces: `createPatientService(deps)`, `createEncounterService(deps)`, `createObservationService(deps)`, `createAuthService(deps)` — each returns a plain object of async methods. The HTTP layer (Task 11) calls these methods only; it never touches a repository or port directly.

- [ ] **Step 1: Write the failing patient service test**

`packages/api/test/services/patientService.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import { NotFoundError } from '../../src/domain/errors.js';
import { createPatientService } from '../../src/services/patientService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';

const FIXED_NOW = '2026-08-07T00:00:00.000Z';

const buildService = () =>
  createPatientService({
    patients: createMemoryPatientRepository(),
    branches: createMemoryBranchRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `patient-${(n += 1)}`;
    })(),
  });

describe('patientService.create', () => {
  it('generates a branch-prefixed MRN and stamps timestamps', async () => {
    const service = buildService();
    const patient = await service.create(
      { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
      BRANCH_IDS.KL,
    );
    expect(patient.mrn).toMatch(/^KL-\d{6}$/);
    expect(patient.createdAt).toBe(FIXED_NOW);
    expect(patient.branchId).toBe(BRANCH_IDS.KL);
  });

  it('rejects an unknown branch', async () => {
    const service = buildService();
    await expect(
      service.create(
        { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
        'not-a-branch',
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a future date of birth', async () => {
    const service = buildService();
    await expect(
      service.create(
        { name: 'X', dob: '2099-01-01', sex: 'male', phone: '+60100000000' },
        BRANCH_IDS.KL,
      ),
    ).rejects.toThrow(/future/);
  });
});

describe('patientService.get', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const service = buildService();
    await expect(service.get('missing')).rejects.toThrow(NotFoundError);
  });

  it('returns a created patient', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    expect(await service.get(created.id)).toEqual(created);
  });
});

describe('patientService.update and remove', () => {
  it('updates mutable fields', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    const updated = await service.update(created.id, { phone: '+60111111111' });
    expect(updated.phone).toBe('+60111111111');
  });

  it('soft-deletes a patient so a subsequent get throws NotFoundError', async () => {
    const service = buildService();
    const created = await service.create(
      { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
      BRANCH_IDS.KL,
    );
    await service.remove(created.id);
    await expect(service.get(created.id)).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/services/patientService.js`.

- [ ] **Step 3: Implement `services/patientService.ts`**

```ts
import type { CreatePatientInput, Page, Patient, UpdatePatientInput } from '@aethelgard/shared';
import { assertValidDateOfBirth, generateMrnCandidate } from '../domain/patient.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import type { BranchRepository, PatientRepository, PatientSearchQuery } from '../ports/index.js';

export type PatientServiceDeps = {
  patients: PatientRepository;
  branches: BranchRepository;
  now: () => string;
  newId: () => string;
};

const MAX_MRN_ATTEMPTS = 5;

export const createPatientService = (deps: PatientServiceDeps) => ({
  create: async (input: CreatePatientInput, resolvedBranchId: string): Promise<Patient> => {
    const branch = await deps.branches.findById(input.branchId ?? resolvedBranchId);
    if (branch === null) {
      throw new NotFoundError('branch', input.branchId ?? resolvedBranchId);
    }
    assertValidDateOfBirth(input.dob, new Date(deps.now()));
    const timestamp = deps.now();

    for (let attempt = 0; attempt < MAX_MRN_ATTEMPTS; attempt += 1) {
      try {
        return await deps.patients.create({
          id: deps.newId(),
          mrn: generateMrnCandidate(branch.code),
          name: input.name,
          dob: input.dob,
          sex: input.sex,
          phone: input.phone,
          branchId: branch.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === MAX_MRN_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
    throw new ConflictError('Could not generate a unique MRN after several attempts');
  },

  get: async (id: string): Promise<Patient> => {
    const patient = await deps.patients.findById(id);
    if (patient === null) {
      throw new NotFoundError('patient', id);
    }
    return patient;
  },

  search: async (query: PatientSearchQuery): Promise<Page<Patient>> => deps.patients.search(query),

  update: async (id: string, patch: UpdatePatientInput): Promise<Patient> => {
    if (patch.dob !== undefined) {
      assertValidDateOfBirth(patch.dob, new Date(deps.now()));
    }
    const updated = await deps.patients.update(id, { ...patch, updatedAt: deps.now() });
    if (updated === null) {
      throw new NotFoundError('patient', id);
    }
    return updated;
  },

  remove: async (id: string): Promise<void> => {
    const deleted = await deps.patients.softDelete(id, deps.now());
    if (!deleted) {
      throw new NotFoundError('patient', id);
    }
  },
});

export type PatientService = ReturnType<typeof createPatientService>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 7 new tests.

- [ ] **Step 5: Write the failing encounter and observation service tests**

`packages/api/test/services/encounterService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createEncounterService } from '../../src/services/encounterService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';

const FIXED_NOW = '2026-08-07T12:00:00.000Z';

const buildService = () =>
  createEncounterService({
    encounters: createMemoryEncounterRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `encounter-${(n += 1)}`;
    })(),
  });

describe('encounterService', () => {
  it('creates an encounter defaulting admittedAt to now', async () => {
    const service = buildService();
    const encounter = await service.create(
      'patient-1',
      { type: 'outpatient', department: 'General', status: 'open' },
      BRANCH_IDS.KL,
    );
    expect(encounter.admittedAt).toBe(FIXED_NOW);
    expect(encounter.patientId).toBe('patient-1');
  });

  it('lists encounters for a patient', async () => {
    const service = buildService();
    await service.create('patient-1', { type: 'outpatient', department: 'General', status: 'open' }, BRANCH_IDS.KL);
    const list = await service.listByPatient('patient-1');
    expect(list).toHaveLength(1);
  });

  it('discharges an open encounter and rejects re-discharging it', async () => {
    const service = buildService();
    const encounter = await service.create(
      'patient-1',
      { type: 'inpatient', department: 'Cardiology', status: 'open' },
      BRANCH_IDS.KL,
    );
    const discharged = await service.update(encounter.id, { status: 'discharged' });
    expect(discharged.status).toBe('discharged');
    await expect(service.update(encounter.id, { department: 'ICU' })).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError updating an unknown encounter', async () => {
    const service = buildService();
    await expect(service.update('missing', { department: 'X' })).rejects.toThrow(NotFoundError);
  });
});
```

`packages/api/test/services/observationService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { ValidationError } from '../../src/domain/errors.js';
import { createObservationService } from '../../src/services/observationService.js';

const FIXED_NOW = '2026-08-07T12:00:00.000Z';

const buildService = () =>
  createObservationService({
    observations: createMemoryObservationRepository(),
    now: () => FIXED_NOW,
    newId: (() => {
      let n = 0;
      return () => `observation-${(n += 1)}`;
    })(),
  });

describe('observationService', () => {
  it('records a numeric observation stamped with the recorder and current time', async () => {
    const service = buildService();
    const observation = await service.create(
      'encounter-1',
      { code: 'heart_rate', valueNum: 72, unit: 'bpm' },
      'user-1',
    );
    expect(observation.recordedAt).toBe(FIXED_NOW);
    expect(observation.recordedBy).toBe('user-1');
    expect(observation.valueNum).toBe(72);
  });

  it('rejects an out-of-range value before it reaches the repository', async () => {
    const service = buildService();
    await expect(
      service.create('encounter-1', { code: 'spo2', valueNum: 150 }, 'user-1'),
    ).rejects.toThrow(ValidationError);
  });

  it('lists observations for an encounter', async () => {
    const service = buildService();
    await service.create('encounter-1', { code: 'heart_rate', valueNum: 72 }, 'user-1');
    expect(await service.listByEncounter('encounter-1')).toHaveLength(1);
  });
});
```

`packages/api/test/services/authService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AuthProvider } from '../../src/ports/index.js';
import { ForbiddenError } from '../../src/domain/errors.js';
import { createAuthService } from '../../src/services/authService.js';

const PRINCIPAL = {
  userId: 'user-1',
  email: 'doctor.kl@aethelgard.demo',
  role: 'doctor' as const,
  branchId: 'branch-1',
};

const fakeAuthProvider = (overrides: Partial<AuthProvider> = {}): AuthProvider => ({
  login: async (email) =>
    email === PRINCIPAL.email ? { principal: PRINCIPAL, token: 'valid-token' } : null,
  verify: async (token) => (token === 'valid-token' ? PRINCIPAL : null),
  listDemoUsers: async () => [
    { email: PRINCIPAL.email, role: 'doctor', branchCode: 'KL', displayName: 'Dr Lim' },
  ],
  ...overrides,
});

describe('authService', () => {
  it('logs in a known user', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    const result = await service.login({ email: PRINCIPAL.email, password: 'demo1234' });
    expect(result.token).toBe('valid-token');
  });

  it('throws ForbiddenError for unknown credentials, without saying which field was wrong', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    await expect(
      service.login({ email: 'nobody@aethelgard.demo', password: 'wrong1234' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('resolves the principal for a valid token and rejects an invalid one', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    expect(await service.me('valid-token')).toEqual(PRINCIPAL);
    await expect(service.me('garbage')).rejects.toThrow(ForbiddenError);
  });

  it('lists demo users', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    expect(await service.demoUsers()).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — `services/encounterService.js`, `services/observationService.js`, `services/authService.js` don't exist.

- [ ] **Step 7: Implement the three remaining services**

`packages/api/src/services/encounterService.ts`:

```ts
import type { CreateEncounterInput, Encounter, PatchEncounterInput } from '@aethelgard/shared';
import { NotFoundError } from '../domain/errors.js';
import { resolveEncounterTransition } from '../domain/encounter.js';
import type { EncounterRepository } from '../ports/index.js';

export type EncounterServiceDeps = {
  encounters: EncounterRepository;
  now: () => string;
  newId: () => string;
};

export const createEncounterService = (deps: EncounterServiceDeps) => ({
  create: async (patientId: string, input: CreateEncounterInput, branchId: string): Promise<Encounter> =>
    deps.encounters.create({
      id: deps.newId(),
      patientId,
      branchId,
      type: input.type,
      department: input.department,
      admittedAt: input.admittedAt ?? deps.now(),
      status: input.status,
    }),

  get: async (id: string): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id);
    if (encounter === null) throw new NotFoundError('encounter', id);
    return encounter;
  },

  listByPatient: async (patientId: string): Promise<Encounter[]> => deps.encounters.listByPatient(patientId),

  update: async (id: string, patch: PatchEncounterInput): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id);
    if (encounter === null) throw new NotFoundError('encounter', id);
    const transition = resolveEncounterTransition(encounter, patch, deps.now());
    const updated = await deps.encounters.update(id, transition);
    if (updated === null) throw new NotFoundError('encounter', id);
    return updated;
  },
});

export type EncounterService = ReturnType<typeof createEncounterService>;
```

`packages/api/src/services/observationService.ts`:

```ts
import type { CreateObservationInput, Observation } from '@aethelgard/shared';
import { resolveObservationValue } from '../domain/observation.js';
import type { ObservationRepository } from '../ports/index.js';

export type ObservationServiceDeps = {
  observations: ObservationRepository;
  now: () => string;
  newId: () => string;
};

export const createObservationService = (deps: ObservationServiceDeps) => ({
  create: async (
    encounterId: string,
    input: CreateObservationInput,
    recordedBy: string,
  ): Promise<Observation> => {
    const value = resolveObservationValue(input);
    return deps.observations.create({
      id: deps.newId(),
      encounterId,
      code: input.code,
      valueNum: value.valueNum,
      valueText: value.valueText,
      unit: value.unit,
      recordedAt: input.recordedAt ?? deps.now(),
      recordedBy,
    });
  },

  listByEncounter: async (encounterId: string): Promise<Observation[]> =>
    deps.observations.listByEncounter(encounterId),
});

export type ObservationService = ReturnType<typeof createObservationService>;
```

`packages/api/src/services/authService.ts`:

```ts
import type { DemoUser, LoginInput, Principal } from '@aethelgard/shared';
import { ForbiddenError } from '../domain/errors.js';
import type { AuthProvider, LoginResult } from '../ports/index.js';

export type AuthServiceDeps = { authProvider: AuthProvider };

export const createAuthService = (deps: AuthServiceDeps) => ({
  login: async (input: LoginInput): Promise<LoginResult> => {
    const result = await deps.authProvider.login(input.email.toLowerCase(), input.password);
    if (result === null) {
      throw new ForbiddenError('Invalid email or password');
    }
    return result;
  },

  me: async (token: string): Promise<Principal> => {
    const principal = await deps.authProvider.verify(token);
    if (principal === null) {
      throw new ForbiddenError('Invalid or expired token');
    }
    return principal;
  },

  demoUsers: async (): Promise<DemoUser[]> => deps.authProvider.listDemoUsers(),
});

export type AuthService = ReturnType<typeof createAuthService>;
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 4 (encounter) + 3 (observation) + 4 (auth) = 11 new tests, 59 total.

- [ ] **Step 9: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/services packages/api/test/services
git commit -m "feat(api): add patient, encounter, observation and auth services"
```

---

### Task 6: Postgres pool, type parsers, and idempotent migrator

Identical rationale to the original spec's Phase 2 Task 1–2: this proves the connection layer against a real Postgres before any repository is written, and the migrator's idempotency is what makes `terraform apply` → container boot → container boot again safe to repeat.

**Files:**
- Create: `packages/api/test/setup/postgres.globalSetup.ts`, `packages/api/vitest.db.config.ts`
- Create: `packages/api/src/adapters/persistence/postgres/{types,pool,migrator}.ts`
- Test: `packages/api/test/postgres/{pool,migrator}.test.ts`

**Interfaces:**
- Consumes: `ConflictError` from `domain/errors.js`.
- Produces: `type Db = { query<R>(text, values?): Promise<QueryResult<R>>; close(): Promise<void>; pool: Pool }`, `createDb(databaseUrl, options?): Db`, `isUniqueViolation(error): boolean`, `runMigrations(db, options?): Promise<string[]>`, `DEFAULT_MIGRATIONS_DIR: string`.

- [ ] **Step 1: Add dependencies and split the test configs**

Run:

```bash
npm run typecheck -w @aethelgard/api
```

(confirms Task 5 is clean before adding new dependencies — `pg`, `bcryptjs`, `jsonwebtoken`, `@testcontainers/postgresql` were already declared in Task 1's `package.json`; this step is just `npm install` picking them up if it hasn't already.)

`packages/api/vitest.config.ts` — add the exclusion for database tests (replace the file from Task 1):

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
    exclude: [...configDefaults.exclude, 'test/postgres/**'],
  },
});
```

`packages/api/vitest.db.config.ts`:

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
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
```

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
 * Starts one Postgres for the whole database test run. Set DB_TEST_URL to
 * point at an already-running Postgres (e.g. the docker-compose stack)
 * instead, and no container is started — this is how you'd point the same
 * test suite at an Aurora or RDS instance to sanity-check compatibility.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const existing = process.env.DB_TEST_URL;
  if (existing !== undefined && existing !== '') {
    project.provide('dbUrl', existing);
    return async () => undefined;
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

- [ ] **Step 2: Write the failing pool test**

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

  it('returns DATE as a YYYY-MM-DD string regardless of local timezone', async () => {
    const result = await db.query<{ dob: string }>('SELECT $1::date AS dob', ['1985-03-14']);
    expect(result.rows[0]?.dob).toBe('1985-03-14');
  });

  it('returns TIMESTAMPTZ as a Date that round-trips to the same ISO string', async () => {
    const iso = '2026-08-07T10:00:00.000Z';
    const result = await db.query<{ at: Date }>('SELECT $1::timestamptz AS at', [iso]);
    expect(result.rows[0]?.at.toISOString()).toBe(iso);
  });

  it('returns a bigint count as a number', async () => {
    const result = await db.query<{ total: number }>(
      'SELECT count(*)::bigint AS total FROM (SELECT 1) AS one',
    );
    expect(result.rows[0]?.total).toBe(1);
    expect(typeof result.rows[0]?.total).toBe('number');
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
    await expect(db.query('INSERT INTO pool_test_unique (id) VALUES ($1)', [1])).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('lets every other database error through unchanged', async () => {
    await expect(
      db.query('SELECT * FROM a_table_that_does_not_exist'),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('recognises a unique violation by SQLSTATE', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api`
Expected: FAIL — cannot resolve `pool.js` (the container starts regardless; if it does not, Docker is not running).

- [ ] **Step 4: Implement `types.ts` and `pool.ts`**

`packages/api/src/adapters/persistence/postgres/types.ts`:

```ts
import pg from 'pg';

const { types } = pg;
const OID_DATE = 1082;
const OID_INT8 = 20;

/**
 * DATE would otherwise arrive as a JS Date built at local midnight, shifting
 * a date of birth by a day west of UTC — we want the literal YYYY-MM-DD.
 * INT8 (our only bigints are COUNT results) is returned as a plain number.
 */
types.setTypeParser(OID_DATE, (value: string) => value);
types.setTypeParser(OID_INT8, (value: string) => Number(value));
```

`packages/api/src/adapters/persistence/postgres/pool.ts`:

```ts
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
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — 7 tests.

- [ ] **Step 6: Write the failing migrator test**

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
    const result = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(result.rows.map((r) => r.table_name)).toEqual([
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

  it('is a no-op the second time', async () => {
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
    const result = await db.query<{ id: string; code: string }>('SELECT id, code FROM branches ORDER BY code');
    expect(result.rows).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', code: 'JB' },
      { id: '11111111-1111-4111-8111-111111111111', code: 'KL' },
      { id: '22222222-2222-4222-8222-222222222222', code: 'PG' },
    ]);
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
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/migrator.test.ts`
Expected: FAIL — cannot resolve `migrator.js` (and the migration files don't exist yet — Task 7 adds them; this task's migrator implementation reads whatever `.sql` files it finds, so the test above will fail on a missing-directory error until Task 7 runs. That is expected and documented in Task 7's first step).

- [ ] **Step 8: Implement `migrator.ts`**

```ts
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
```

- [ ] **Step 9: Leave the migrator test failing and proceed to Task 7**

This is the one deliberate exception to "run tests to green before moving on" in this plan: the migrator has nothing to migrate until Task 7 writes the `.sql` files. Do not commit Task 6 as green — commit it as scaffolding, then let Task 7's first step turn it green.

```bash
git add packages/api/vitest.config.ts packages/api/vitest.db.config.ts packages/api/test/setup packages/api/src/adapters/persistence/postgres/types.ts packages/api/src/adapters/persistence/postgres/pool.ts packages/api/src/adapters/persistence/postgres/migrator.ts packages/api/test/postgres
git commit -m "feat(api): add Postgres pool, type parsers and idempotent migrator"
```

---

### Task 7: SQL migrations, row mappers, and the four Postgres repositories

The database-agnosticism claim is proven at the SQL level here: no Aurora-specific or RDS-specific syntax anywhere in these files, only `pg_trgm` (ships with both) and standard PostgreSQL DDL/DML.

**Files:**
- Create: `packages/api/migrations/{001_init.sql,002_reference_data.sql}`
- Create: `packages/api/src/adapters/persistence/postgres/{rowMappers,branchRepository,patientRepository,encounterRepository,observationRepository}.ts`
- Test: `packages/api/test/postgres/{repositories.branch,repositories.patient,repositories.encounter,repositories.observation}.test.ts`

**Interfaces:**
- Consumes: `Db` from `pool.js`; ports from Task 4; entity types from `@aethelgard/shared`.
- Produces: `createPostgresBranchRepository(db): BranchRepository`, `createPostgresPatientRepository(db): PatientRepository`, `createPostgresEncounterRepository(db): EncounterRepository`, `createPostgresObservationRepository(db): ObservationRepository` — Task 12's composition root wires these into the services from Task 5 with no code change to the services themselves.

- [ ] **Step 1: Write the migrations**

`packages/api/migrations/001_init.sql`:

```sql
-- Ships with both RDS PostgreSQL and Aurora PostgreSQL — this is the only
-- non-core-SQL feature this schema uses, and it is not engine-specific.
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
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS patients_branch_id_idx ON patients (branch_id);
CREATE INDEX IF NOT EXISTS patients_name_trgm_idx ON patients USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS encounters (
  id            UUID PRIMARY KEY,
  patient_id    UUID NOT NULL REFERENCES patients (id),
  branch_id     UUID NOT NULL REFERENCES branches (id),
  type          TEXT NOT NULL CHECK (type IN ('outpatient', 'inpatient', 'emergency')),
  department    TEXT NOT NULL,
  admitted_at   TIMESTAMPTZ NOT NULL,
  discharged_at TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('open', 'discharged', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS encounters_patient_id_idx ON encounters (patient_id);

CREATE TABLE IF NOT EXISTS observations (
  id           UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES encounters (id),
  code         TEXT NOT NULL CHECK (code IN ('heart_rate', 'blood_pressure', 'temperature', 'spo2', 'weight')),
  value_num    DOUBLE PRECISION,
  value_text   TEXT,
  unit         TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL,
  recorded_by  UUID NOT NULL REFERENCES users (id),
  CONSTRAINT observations_one_value CHECK ((value_num IS NULL) <> (value_text IS NULL))
);

CREATE INDEX IF NOT EXISTS observations_encounter_id_idx ON observations (encounter_id);
```

`packages/api/migrations/002_reference_data.sql`:

```sql
INSERT INTO branches (id, code, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'KL', 'Aethelgard Kuala Lumpur'),
  ('22222222-2222-4222-8222-222222222222', 'PG', 'Aethelgard Penang'),
  ('33333333-3333-4333-8333-333333333333', 'JB', 'Aethelgard Johor Bahru')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Run Task 6's migrator test to verify it now passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/migrator.test.ts`
Expected: PASS — 6 tests. (This is the deferred green from Task 6, Step 9.)

- [ ] **Step 3: Implement row mappers**

`packages/api/src/adapters/persistence/postgres/rowMappers.ts`:

```ts
import type {
  Branch, BranchCode, Encounter, EncounterStatus, EncounterType,
  Observation, ObservationCode, Patient, Sex,
} from '@aethelgard/shared';

export type BranchRow = { id: string; code: BranchCode; name: string };
export const toBranch = (row: BranchRow): Branch => ({ id: row.id, code: row.code, name: row.name });

export type PatientRow = {
  id: string; mrn: string; name: string; dob: string; sex: Sex; phone: string;
  branch_id: string; created_at: Date; updated_at: Date; deleted_at: Date | null;
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
  id: string; patient_id: string; branch_id: string; type: EncounterType; department: string;
  admitted_at: Date; discharged_at: Date | null; status: EncounterStatus;
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
  id: string; encounter_id: string; code: ObservationCode; value_num: number | null;
  value_text: string | null; unit: string | null; recorded_at: Date; recorded_by: string;
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
```

- [ ] **Step 4: Write the failing branch and patient repository tests**

`packages/api/test/postgres/repositories.branch.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresBranchRepository } from '../../src/adapters/persistence/postgres/branchRepository.js';

let db: Db;

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresBranchRepository', () => {
  it('lists all seeded branches ordered by code', async () => {
    const repo = createPostgresBranchRepository(db);
    expect((await repo.listAll()).map((b) => b.code)).toEqual(['JB', 'KL', 'PG']);
  });

  it('finds by id and by code', async () => {
    const repo = createPostgresBranchRepository(db);
    expect((await repo.findByCode('KL'))?.name).toBe('Aethelgard Kuala Lumpur');
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
```

`packages/api/test/postgres/repositories.patient.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterEach(async () => {
  await db.query('TRUNCATE patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

const newPatient = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  mrn: 'KL-000001',
  name: 'Tan Wei Ming',
  dob: '1990-01-01',
  sex: 'male' as const,
  phone: '+60129876543',
  branchId: KL,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides,
});

describe('createPostgresPatientRepository', () => {
  it('creates and reads back a patient with DATE round-tripping exactly', async () => {
    const repo = createPostgresPatientRepository(db);
    const created = await repo.create(newPatient());
    expect(created.dob).toBe('1990-01-01');
    expect(await repo.findById(created.id)).toEqual(created);
  });

  it('rejects a duplicate MRN with ConflictError', async () => {
    const repo = createPostgresPatientRepository(db);
    await repo.create(newPatient({ mrn: 'KL-000002' }));
    await expect(repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000002' }))).rejects.toThrow(
      'A record with the same unique key already exists',
    );
  });

  it('excludes a soft-deleted patient from findById and search', async () => {
    const repo = createPostgresPatientRepository(db);
    const created = await repo.create(newPatient({ mrn: 'KL-000003' }));
    await repo.softDelete(created.id, '2026-08-08T00:00:00.000Z');
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('searches by trigram name match and paginates', async () => {
    const repo = createPostgresPatientRepository(db);
    await repo.create(newPatient({ mrn: 'KL-000004', name: 'Nurul Aisyah' }));
    await repo.create(newPatient({ id: crypto.randomUUID(), mrn: 'KL-000005', name: 'Tan Wei Ming' }));
    const result = await repo.search({ search: 'aisyah', page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api`
Expected: FAIL — `branchRepository.js` and `patientRepository.js` don't exist under `adapters/persistence/postgres`.

- [ ] **Step 6: Implement `branchRepository.ts` and `patientRepository.ts`**

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
    const result = await db.query<BranchRow>(`SELECT ${COLUMNS} FROM branches WHERE id = $1`, [id]);
    return result.rows[0] === undefined ? null : toBranch(result.rows[0]);
  },
  findByCode: async (code: BranchCode): Promise<Branch | null> => {
    const result = await db.query<BranchRow>(`SELECT ${COLUMNS} FROM branches WHERE code = $1`, [code]);
    return result.rows[0] === undefined ? null : toBranch(result.rows[0]);
  },
});
```

`packages/api/src/adapters/persistence/postgres/patientRepository.ts`:

```ts
import type { Page, Patient } from '@aethelgard/shared';
import type { NewPatient, PatientPatch, PatientRepository, PatientSearchQuery } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toPatient, type PatientRow } from './rowMappers.js';

const COLUMNS = 'id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at, deleted_at';

const searchParam = (search: string | undefined): string | null => {
  const trimmed = search?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const SEARCH_PREDICATE = `
  deleted_at IS NULL
  AND ($1::text IS NULL OR name ILIKE '%' || $1::text || '%' OR mrn = upper($1::text))`;

export const createPostgresPatientRepository = (db: Db): PatientRepository => ({
  create: async (input: NewPatient): Promise<Patient> => {
    const result = await db.query<PatientRow>(
      `INSERT INTO patients (id, mrn, name, dob, sex, phone, branch_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [input.id, input.mrn, input.name, input.dob, input.sex, input.phone, input.branchId, input.createdAt, input.updatedAt],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for patients');
    return toPatient(row);
  },

  findById: async (id: string): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  findByMrn: async (mrn: string): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `SELECT ${COLUMNS} FROM patients WHERE mrn = $1 AND deleted_at IS NULL`,
      [mrn],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  search: async (query: PatientSearchQuery): Promise<Page<Patient>> => {
    const search = searchParam(query.search);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, counted] = await Promise.all([
      db.query<PatientRow>(
        `SELECT ${COLUMNS} FROM patients WHERE ${SEARCH_PREDICATE} ORDER BY name ASC, id ASC LIMIT $2 OFFSET $3`,
        [search, query.pageSize, offset],
      ),
      db.query<{ total: number }>(`SELECT count(*)::bigint AS total FROM patients WHERE ${SEARCH_PREDICATE}`, [search]),
    ]);
    return {
      items: rows.rows.map(toPatient),
      page: query.page,
      pageSize: query.pageSize,
      total: counted.rows[0]?.total ?? 0,
    };
  },

  update: async (id: string, patch: PatientPatch): Promise<Patient | null> => {
    const result = await db.query<PatientRow>(
      `UPDATE patients SET
         name = COALESCE($2::text, name), dob = COALESCE($3::date, dob),
         sex = COALESCE($4::text, sex), phone = COALESCE($5::text, phone), updated_at = $6
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${COLUMNS}`,
      [id, patch.name ?? null, patch.dob ?? null, patch.sex ?? null, patch.phone ?? null, patch.updatedAt],
    );
    return result.rows[0] === undefined ? null : toPatient(result.rows[0]);
  },

  softDelete: async (id: string, deletedAt: string): Promise<boolean> => {
    const result = await db.query(
      `UPDATE patients SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, deletedAt],
    );
    return (result.rowCount ?? 0) > 0;
  },
});
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — 2 (branch) + 4 (patient) = 6 new tests.

- [ ] **Step 8: Write the failing encounter and observation repository tests**

`packages/api/test/postgres/repositories.encounter.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
});

afterEach(async () => {
  await db.query('TRUNCATE encounters, patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresEncounterRepository', () => {
  it('creates an encounter for a patient and lists it back', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000010', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const created = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'outpatient',
      department: 'General', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    expect(await encounters.findById(created.id)).toEqual(created);
    expect(await encounters.listByPatient(patient.id)).toEqual([created]);
  });

  it('patches status and dischargedAt', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000011', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const created = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'inpatient',
      department: 'Cardiology', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    const updated = await encounters.update(created.id, { status: 'discharged', dischargedAt: '2026-08-08T00:00:00.000Z' });
    expect(updated?.status).toBe('discharged');
    expect(updated?.dischargedAt).toBe('2026-08-08T00:00:00.000Z');
  });
});
```

`packages/api/test/postgres/repositories.observation.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type Db } from '../../src/adapters/persistence/postgres/pool.js';
import { runMigrations } from '../../src/adapters/persistence/postgres/migrator.js';
import { createPostgresPatientRepository } from '../../src/adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from '../../src/adapters/persistence/postgres/encounterRepository.js';
import { createPostgresObservationRepository } from '../../src/adapters/persistence/postgres/observationRepository.js';

let db: Db;
const KL = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = createDb(inject('dbUrl'));
  await runMigrations(db);
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, branch_id, display_name)
     VALUES ('77777777-7777-4777-8777-777777777777', 'seed@aethelgard.demo', 'x', 'doctor', $1, 'Seed User')
     ON CONFLICT (id) DO NOTHING`,
    [KL],
  );
});

afterEach(async () => {
  await db.query('TRUNCATE observations, encounters, patients CASCADE');
});

afterAll(async () => {
  await db.close();
});

describe('createPostgresObservationRepository', () => {
  it('creates and lists observations for an encounter, oldest first', async () => {
    const patients = createPostgresPatientRepository(db);
    const patient = await patients.create({
      id: crypto.randomUUID(), mrn: 'KL-000020', name: 'X', dob: '1990-01-01', sex: 'male',
      phone: '+60100000000', branchId: KL, createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    });
    const encounters = createPostgresEncounterRepository(db);
    const encounter = await encounters.create({
      id: crypto.randomUUID(), patientId: patient.id, branchId: KL, type: 'outpatient',
      department: 'General', admittedAt: '2026-08-07T00:00:00.000Z', status: 'open',
    });
    const observations = createPostgresObservationRepository(db);
    const first = await observations.create({
      id: crypto.randomUUID(), encounterId: encounter.id, code: 'heart_rate', valueNum: 72,
      valueText: null, unit: 'bpm', recordedAt: '2026-08-07T00:00:00.000Z',
      recordedBy: '77777777-7777-4777-8777-777777777777',
    });
    expect(await observations.listByEncounter(encounter.id)).toEqual([first]);
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api`
Expected: FAIL — `encounterRepository.js` and `observationRepository.js` don't exist under `adapters/persistence/postgres`.

- [ ] **Step 10: Implement `encounterRepository.ts` and `observationRepository.ts`**

`packages/api/src/adapters/persistence/postgres/encounterRepository.ts`:

```ts
import type { Encounter } from '@aethelgard/shared';
import type { EncounterPatch, EncounterRepository, NewEncounter } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toEncounter, type EncounterRow } from './rowMappers.js';

const COLUMNS = 'id, patient_id, branch_id, type, department, admitted_at, discharged_at, status';

export const createPostgresEncounterRepository = (db: Db): EncounterRepository => ({
  create: async (input: NewEncounter): Promise<Encounter> => {
    const result = await db.query<EncounterRow>(
      `INSERT INTO encounters (id, patient_id, branch_id, type, department, admitted_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
      [input.id, input.patientId, input.branchId, input.type, input.department, input.admittedAt, input.status],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for encounters');
    return toEncounter(row);
  },

  findById: async (id: string): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(`SELECT ${COLUMNS} FROM encounters WHERE id = $1`, [id]);
    return result.rows[0] === undefined ? null : toEncounter(result.rows[0]);
  },

  listByPatient: async (patientId: string): Promise<Encounter[]> => {
    const result = await db.query<EncounterRow>(
      `SELECT ${COLUMNS} FROM encounters WHERE patient_id = $1 ORDER BY admitted_at ASC`,
      [patientId],
    );
    return result.rows.map(toEncounter);
  },

  update: async (id: string, patch: EncounterPatch): Promise<Encounter | null> => {
    const result = await db.query<EncounterRow>(
      `UPDATE encounters SET
         department = COALESCE($2::text, department),
         status = COALESCE($3::text, status),
         discharged_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE discharged_at END
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, patch.department ?? null, patch.status ?? null, patch.dischargedAt !== undefined, patch.dischargedAt ?? null],
    );
    return result.rows[0] === undefined ? null : toEncounter(result.rows[0]);
  },
});
```

`packages/api/src/adapters/persistence/postgres/observationRepository.ts`:

```ts
import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import type { Db } from './pool.js';
import { toObservation, type ObservationRow } from './rowMappers.js';

const COLUMNS = 'id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by';

export const createPostgresObservationRepository = (db: Db): ObservationRepository => ({
  create: async (input: NewObservation): Promise<Observation> => {
    const result = await db.query<ObservationRow>(
      `INSERT INTO observations (id, encounter_id, code, value_num, value_text, unit, recorded_at, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
      [input.id, input.encounterId, input.code, input.valueNum, input.valueText, input.unit, input.recordedAt, input.recordedBy],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row for observations');
    return toObservation(row);
  },

  listByEncounter: async (encounterId: string): Promise<Observation[]> => {
    const result = await db.query<ObservationRow>(
      `SELECT ${COLUMNS} FROM observations WHERE encounter_id = $1 ORDER BY recorded_at ASC`,
      [encounterId],
    );
    return result.rows.map(toObservation);
  },
});
```

- [ ] **Step 11: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api`
Expected: PASS — 2 (encounter) + 1 (observation) = 3 new tests, all Postgres tests green.

- [ ] **Step 12: Verify the unit loop still needs no Docker**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS, no container starts.

- [ ] **Step 13: Commit**

```bash
git add packages/api/migrations packages/api/src/adapters/persistence/postgres packages/api/test/postgres
git commit -m "feat(api): add SQL migrations, row mappers and Postgres repositories"
```

---

### Task 8: `localJwt` auth adapter

**Files:**
- Create: `packages/api/src/adapters/auth/localJwt/localJwtAuthProvider.ts`
- Test: `packages/api/test/postgres/localJwtAuthProvider.test.ts`

**Interfaces:**
- Consumes: `Db` from `pool.js`; `AuthProvider`, `LoginResult` from `ports/index.js`; `Principal`, `DemoUser` from `@aethelgard/shared`.
- Produces: `createLocalJwtAuthProvider(db: Db, jwtSecret: string): AuthProvider` — Task 12's composition root wires this in when `config.authDriver === 'localJwt'` (the only driver this build supports; the port shape is what lets a future Cognito adapter be added without touching `AuthService` or any route).

- [ ] **Step 1: Write the failing test**

`packages/api/test/postgres/localJwtAuthProvider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/localJwtAuthProvider.test.ts`
Expected: FAIL — cannot resolve `localJwtAuthProvider.js`.

- [ ] **Step 3: Implement `localJwtAuthProvider.ts`**

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -w @aethelgard/api -- test/postgres/localJwtAuthProvider.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/adapters/auth packages/api/test/postgres/localJwtAuthProvider.test.ts
git commit -m "feat(api): add localJwt auth adapter"
```

---

### Task 9: Instance identity adapters

**Files:**
- Create: `packages/api/src/adapters/identity/{ecsIdentity,localIdentity}.ts`
- Test: `packages/api/test/adapters/identity/{ecsIdentity,localIdentity}.test.ts`

**Interfaces:**
- Consumes: `InstanceIdentity` port from Task 4.
- Produces: `createLocalIdentity(): InstanceIdentity`, `createEcsIdentity(fetchImpl?: typeof fetch): InstanceIdentity` — Task 12's composition root picks one based on `config.identityDriver` and resolves both methods **once at boot** (not per-request — see Task 10).

- [ ] **Step 1: Write the failing tests**

`packages/api/test/adapters/identity/localIdentity.test.ts`:

```ts
import { hostname } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createLocalIdentity } from '../../../src/adapters/identity/localIdentity.js';

describe('createLocalIdentity', () => {
  it('reports the container/host hostname as the instance id', async () => {
    const identity = createLocalIdentity();
    expect(await identity.instanceId()).toBe(hostname());
  });

  it('reports a fixed local availability zone label', async () => {
    const identity = createLocalIdentity();
    expect(await identity.availabilityZone()).toBe('local');
  });
});
```

`packages/api/test/adapters/identity/ecsIdentity.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../../../src/domain/errors.js';
import { createEcsIdentity } from '../../../src/adapters/identity/ecsIdentity.js';

const ORIGINAL_ENV = process.env.ECS_CONTAINER_METADATA_URI_V4;

describe('createEcsIdentity', () => {
  afterEach(() => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = ORIGINAL_ENV;
  });

  it('parses the task ARN and availability zone from the ECS metadata endpoint', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://169.254.170.2/v4/abc123';
    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          TaskARN: 'arn:aws:ecs:us-east-1:111111111111:task/aethelgard-demo/abc123',
          AvailabilityZone: 'us-east-1a',
        }),
        { status: 200 },
      ),
    );
    const identity = createEcsIdentity(fakeFetch as unknown as typeof fetch);
    expect(await identity.instanceId()).toBe('abc123');
    expect(await identity.availabilityZone()).toBe('us-east-1a');
    expect(fakeFetch).toHaveBeenCalledWith('http://169.254.170.2/v4/abc123/task');
  });

  it('throws UpstreamError when the metadata endpoint is unset', async () => {
    delete process.env.ECS_CONTAINER_METADATA_URI_V4;
    const identity = createEcsIdentity();
    await expect(identity.instanceId()).rejects.toThrow(UpstreamError);
  });

  it('throws UpstreamError when the metadata endpoint responds with an error', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://169.254.170.2/v4/abc123';
    const fakeFetch = vi.fn(async () => new Response('', { status: 500 }));
    const identity = createEcsIdentity(fakeFetch as unknown as typeof fetch);
    await expect(identity.instanceId()).rejects.toThrow(UpstreamError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — `localIdentity.js` and `ecsIdentity.js` don't exist.

- [ ] **Step 3: Implement both adapters**

`packages/api/src/adapters/identity/localIdentity.ts`:

```ts
import { hostname } from 'node:os';
import type { InstanceIdentity } from '../../ports/index.js';

/** Docker Compose sets the container hostname explicitly (see Task 18) — this is what makes X-Served-By rotate locally without AWS. */
export const createLocalIdentity = (): InstanceIdentity => ({
  instanceId: async () => hostname(),
  availabilityZone: async () => 'local',
});
```

`packages/api/src/adapters/identity/ecsIdentity.ts`:

```ts
import { UpstreamError } from '../../domain/errors.js';
import type { InstanceIdentity } from '../../ports/index.js';

type EcsTaskMetadata = { TaskARN: string; AvailabilityZone: string };

const parseTaskId = (taskArn: string): string => taskArn.split('/').at(-1) ?? taskArn;

const fetchTaskMetadata = async (fetchImpl: typeof fetch): Promise<EcsTaskMetadata> => {
  const base = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (base === undefined || base === '') {
    throw new UpstreamError(
      'ECS_CONTAINER_METADATA_URI_V4 is not set — IDENTITY_DRIVER=ecs requires the ECS task metadata endpoint',
      null,
    );
  }
  let response: Response;
  try {
    response = await fetchImpl(`${base}/task`);
  } catch (error) {
    throw new UpstreamError('Could not reach the ECS task metadata endpoint', error);
  }
  if (!response.ok) {
    throw new UpstreamError(`ECS task metadata endpoint returned HTTP ${response.status}`, null);
  }
  return (await response.json()) as EcsTaskMetadata;
};

/**
 * Reads ECS_CONTAINER_METADATA_URI_V4 (present on every Fargate and EC2-launch-type
 * ECS task — this adapter does not care which). `fetchImpl` is injectable for tests.
 */
export const createEcsIdentity = (fetchImpl: typeof fetch = fetch): InstanceIdentity => ({
  instanceId: async () => parseTaskId((await fetchTaskMetadata(fetchImpl)).TaskARN),
  availabilityZone: async () => (await fetchTaskMetadata(fetchImpl)).AvailabilityZone,
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 2 (local) + 3 (ecs) = 5 new tests.

- [ ] **Step 5: Verify the typecheck passes and commit**

```bash
npm run typecheck -w @aethelgard/api
git add packages/api/src/adapters/identity packages/api/test/adapters/identity
git commit -m "feat(api): add ecs and local instance identity adapters"
```

---

### Task 10: HTTP server core — bootstrap, error/auth middleware, health and meta routes

**Files:**
- Create: `packages/api/src/http/{server,errorMiddleware,authMiddleware,healthState,validate}.ts`
- Create: `packages/api/src/http/routes/{health,meta}.ts`
- Test: `packages/api/test/http/{server,health,meta}.test.ts`

**Interfaces:**
- Consumes: `Db` from `pool.js`; `AuthProvider` from `ports/index.js`; `isDomainError` from `domain/errors.js`.
- Produces: `type ServerDeps = { db: Db; authProvider: AuthProvider; instanceId: string; availabilityZone: string; appVersion: string; authDriverName: string; identityDriverName: string; serveStatic: boolean; staticRoot?: string }`, `buildServer(deps: ServerDeps): FastifyInstance`. Task 11 extends both `ServerDeps` and the routes `buildServer` registers; Task 12 is the only caller of `buildServer`.

- [ ] **Step 1: Write the failing test for the error middleware, auth middleware, and health/meta routes together**

`packages/api/test/http/server.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildServer, type ServerDeps } from '../../src/http/server.js';
import { setForcedUnhealthy } from '../../src/http/healthState.js';
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';
import type { AuthProvider } from '../../src/ports/index.js';

const PRINCIPAL = { userId: 'user-1', email: 'doc@aethelgard.demo', role: 'doctor' as const, branchId: 'branch-1' };

const buildDeps = (overrides: Partial<ServerDeps> = {}): ServerDeps => ({
  db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), close: vi.fn(), pool: {} } as unknown as Db,
  authProvider: {
    login: vi.fn(),
    verify: vi.fn(async (token: string) => (token === 'valid-token' ? PRINCIPAL : null)),
    listDemoUsers: vi.fn(),
  } as unknown as AuthProvider,
  instanceId: 'test-instance-1',
  availabilityZone: 'test-az-1',
  appVersion: '0.1.0-test',
  authDriverName: 'localJwt',
  identityDriverName: 'local',
  serveStatic: false,
  ...overrides,
});

describe('GET /health', () => {
  it('returns 200 when the database is reachable', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('returns 503 when the database query throws', async () => {
    const app = buildServer(
      buildDeps({ db: { query: vi.fn(async () => { throw new Error('down'); }), close: vi.fn(), pool: {} } as unknown as Db }),
    );
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
  });

  it('returns 503 when forced unhealthy, and recovers when un-forced', async () => {
    const app = buildServer(buildDeps());
    setForcedUnhealthy(true);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
    setForcedUnhealthy(false);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});

describe('every response', () => {
  it('carries X-Served-By and X-AZ headers from the resolved instance identity', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-served-by']).toBe('test-instance-1');
    expect(response.headers['x-az']).toBe('test-az-1');
  });
});

describe('GET /api/meta', () => {
  it('requires authentication', async () => {
    const app = buildServer(buildDeps());
    expect((await app.inject({ method: 'GET', url: '/api/meta' })).statusCode).toBe(401);
  });

  it('reports instance identity, version and active adapters when authenticated', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({
      method: 'GET',
      url: '/api/meta',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      instanceId: 'test-instance-1',
      availabilityZone: 'test-az-1',
      version: '0.1.0-test',
      adapters: { db: 'postgres', auth: 'localJwt', identity: 'local' },
    });
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});

describe('error translation', () => {
  it('returns 404 with a machine-readable code for an unknown route', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/http/server.js`.

- [ ] **Step 3: Implement the middleware, health state, and validation helper**

`packages/api/src/http/healthState.ts`:

```ts
let forcedUnhealthy = false;

export const isForcedUnhealthy = (): boolean => forcedUnhealthy;
export const setForcedUnhealthy = (value: boolean): void => {
  forcedUnhealthy = value;
};
```

`packages/api/src/http/errorMiddleware.ts`:

```ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { isDomainError } from '../domain/errors.js';

export const errorHandler = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void => {
  if (isDomainError(error)) {
    reply.code(error.httpStatus).send({
      code: error.code,
      message: error.message,
      details: error.details,
      requestId: request.id,
    });
    return;
  }
  request.log.error({ err: error }, 'unhandled error');
  reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: request.id });
};
```

`packages/api/src/http/validate.ts`:

```ts
import type { ZodType } from 'zod';
import { ValidationError } from '../domain/errors.js';

export const parseWith = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Request failed validation', {
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
};
```

`packages/api/src/http/authMiddleware.ts`:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Principal } from '@aethelgard/shared';
import type { AuthProvider } from '../ports/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export const createRequireAuth =
  (authProvider: AuthProvider) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (token === undefined) {
      await reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Missing bearer token' });
      return;
    }
    const principal = await authProvider.verify(token);
    if (principal === null) {
      await reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Invalid or expired token' });
      return;
    }
    request.principal = principal;
  };
```

- [ ] **Step 4: Implement the health and meta routes**

`packages/api/src/http/routes/health.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../adapters/persistence/postgres/pool.js';
import { isForcedUnhealthy } from '../healthState.js';

export const registerHealthRoute = (fastify: FastifyInstance, db: Db): void => {
  fastify.get('/health', async (request, reply) => {
    if (isForcedUnhealthy()) {
      reply.code(503).send({ status: 'unhealthy', reason: 'forced' });
      return;
    }
    try {
      await db.query('SELECT 1');
      reply.code(200).send({ status: 'ok' });
    } catch (error) {
      request.log.error({ err: error }, 'health check database query failed');
      reply.code(503).send({ status: 'unhealthy', reason: 'database' });
    }
  });
};
```

`packages/api/src/http/routes/meta.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../server.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerMetaRoute = (
  fastify: FastifyInstance,
  deps: Pick<ServerDeps, 'instanceId' | 'availabilityZone' | 'appVersion' | 'authDriverName' | 'identityDriverName'>,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/meta', { preHandler: requireAuth }, async (_request, reply) => {
    reply.send({
      instanceId: deps.instanceId,
      availabilityZone: deps.availabilityZone,
      version: deps.appVersion,
      uptimeSeconds: process.uptime(),
      adapters: { db: 'postgres', auth: deps.authDriverName, identity: deps.identityDriverName },
    });
  });
};
```

- [ ] **Step 5: Implement `server.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthProvider } from '../ports/index.js';
import type { Db } from '../adapters/persistence/postgres/pool.js';
import { errorHandler } from './errorMiddleware.js';
import { createRequireAuth } from './authMiddleware.js';
import { registerHealthRoute } from './routes/health.js';
import { registerMetaRoute } from './routes/meta.js';

export type ServerDeps = {
  db: Db;
  authProvider: AuthProvider;
  instanceId: string;
  availabilityZone: string;
  appVersion: string;
  authDriverName: string;
  identityDriverName: string;
  serveStatic: boolean;
  staticRoot?: string;
};

export const buildServer = (deps: ServerDeps): FastifyInstance => {
  const fastify = Fastify({ logger: true, disableRequestLogging: true });

  fastify.decorateRequest('principal', undefined);
  fastify.setErrorHandler(errorHandler);

  // X-Served-By / X-AZ on every response — instance identity resolved once at
  // boot (Task 12), so this is a synchronous header set, never an await per request.
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Served-By', deps.instanceId);
    reply.header('X-AZ', deps.availabilityZone);
    return payload;
  });

  const requireAuth = createRequireAuth(deps.authProvider);

  registerHealthRoute(fastify, deps.db);
  registerMetaRoute(fastify, deps, requireAuth);

  return fastify;
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 8 new tests.

- [ ] **Step 7: Verify the typecheck passes and commit**

```bash
npm run typecheck -w @aethelgard/api
git add packages/api/src/http packages/api/test/http
git commit -m "feat(api): add Fastify server core, error/auth middleware, health and meta routes"
```

---

### Task 11: Auth, patients, encounters, observations, and admin routes

**Files:**
- Create: `packages/api/src/http/routes/{auth,patients,encounters,observations,admin}.ts`
- Modify: `packages/api/src/http/server.ts` — extend `ServerDeps` and register the five new route modules
- Create: `packages/api/test/http/testServer.ts` (test helper, not a `*.test.ts` file)
- Test: `packages/api/test/http/routes.{auth,patients,encounters,admin}.test.ts`

**Interfaces:**
- Consumes: `PatientService`, `EncounterService`, `ObservationService`, `AuthService` from Task 5; `ServerDeps`, `buildServer` from Task 10; `parseWith` from `validate.js`; `paginationQuerySchema`, `createPatientSchema`, `updatePatientSchema`, `createEncounterSchema`, `patchEncounterSchema`, `createObservationSchema`, `loginSchema` from `@aethelgard/shared`.
- Produces: the full REST surface. Extended `ServerDeps` (adds `patients: PatientService; encounters: EncounterService; observations: ObservationService; auth: AuthService`) — Task 12's composition root is the only place that builds a value of this type.

- [ ] **Step 1: Write the test helper**

`packages/api/test/http/testServer.ts`:

```ts
import { vi } from 'vitest';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { createPatientService } from '../../src/services/patientService.js';
import { createEncounterService } from '../../src/services/encounterService.js';
import { createObservationService } from '../../src/services/observationService.js';
import { createAuthService } from '../../src/services/authService.js';
import { buildServer, type ServerDeps } from '../../src/http/server.js';
import type { AuthProvider } from '../../src/ports/index.js';
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';

export const TEST_PRINCIPAL = {
  userId: 'user-1',
  email: 'doctor.kl@aethelgard.demo',
  role: 'doctor' as const,
  branchId: '11111111-1111-4111-8111-111111111111',
};

export const AUTH_HEADER = { authorization: 'Bearer valid-token' };

/** Real services over in-memory adapters, so route tests exercise real validation and business rules — only the AuthProvider and Db are faked. */
export const buildTestServer = () => {
  let sequence = 0;
  const newId = () => `id-${(sequence += 1)}`;
  const now = () => '2026-08-07T12:00:00.000Z';

  const authProvider: AuthProvider = {
    login: vi.fn(async (email: string) =>
      email === TEST_PRINCIPAL.email ? { principal: TEST_PRINCIPAL, token: 'valid-token' } : null,
    ),
    verify: vi.fn(async (token: string) => (token === 'valid-token' ? TEST_PRINCIPAL : null)),
    listDemoUsers: vi.fn(async () => [
      { email: TEST_PRINCIPAL.email, role: 'doctor', branchCode: 'KL' as const, displayName: 'Dr Lim' },
    ]),
  };

  const deps: ServerDeps = {
    db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), close: vi.fn(), pool: {} } as unknown as Db,
    authProvider,
    instanceId: 'test-instance-1',
    availabilityZone: 'test-az-1',
    appVersion: '0.1.0-test',
    authDriverName: 'localJwt',
    identityDriverName: 'local',
    serveStatic: false,
    patients: createPatientService({ patients: createMemoryPatientRepository(), branches: createMemoryBranchRepository(), now, newId }),
    encounters: createEncounterService({ encounters: createMemoryEncounterRepository(), now, newId }),
    observations: createObservationService({ observations: createMemoryObservationRepository(), now, newId }),
    auth: createAuthService({ authProvider }),
  };

  return { app: buildServer(deps), deps };
};
```

- [ ] **Step 2: Write the failing route tests**

`packages/api/test/http/routes.auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, TEST_PRINCIPAL, AUTH_HEADER } from './testServer.js';

describe('POST /api/auth/login', () => {
  it('returns a token and principal for a known demo user', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_PRINCIPAL.email, password: 'demo1234' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: 'valid-token', principal: { email: TEST_PRINCIPAL.email } });
  });

  it('returns 403 for unknown credentials', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@aethelgard.demo', password: 'wrongwrong' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns 400 for a malformed body', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'not-an-email' } });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/auth/demo-users', () => {
  it('lists demo users with no secret', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/api/auth/demo-users' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { email: TEST_PRINCIPAL.email, role: 'doctor', branchCode: 'KL', displayName: 'Dr Lim' },
    ]);
  });
});

describe('GET /api/auth/me', () => {
  it('requires authentication and returns the principal when authenticated', async () => {
    const { app } = buildTestServer();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: AUTH_HEADER });
    expect(response.json()).toEqual(TEST_PRINCIPAL);
  });
});
```

`packages/api/test/http/routes.patients.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';

const createPatient = async (app: ReturnType<typeof buildTestServer>['app']) =>
  app
    .inject({
      method: 'POST',
      url: '/api/patients',
      headers: AUTH_HEADER,
      payload: { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
    })
    .then((r) => r.json());

describe('patients routes', () => {
  it('POST /api/patients requires authentication', async () => {
    const { app } = buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('POST /api/patients creates a patient defaulting to the caller\'s branch', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    expect(patient.mrn).toMatch(/^KL-\d{6}$/);
  });

  it('GET /api/patients/:id returns the created patient; unknown id returns 404', async () => {
    const { app } = buildTestServer();
    const created = await createPatient(app);
    const found = await app.inject({ method: 'GET', url: `/api/patients/${created.id}`, headers: AUTH_HEADER });
    expect(found.json()).toEqual(created);
    const missing = await app.inject({ method: 'GET', url: '/api/patients/does-not-exist', headers: AUTH_HEADER });
    expect(missing.statusCode).toBe(404);
  });

  it('GET /api/patients searches and paginates', async () => {
    const { app } = buildTestServer();
    await createPatient(app);
    const response = await app.inject({ method: 'GET', url: '/api/patients?search=Tan&page=1&pageSize=10', headers: AUTH_HEADER });
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('PATCH /api/patients/:id updates a field', async () => {
    const { app } = buildTestServer();
    const created = await createPatient(app);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/patients/${created.id}`,
      headers: AUTH_HEADER,
      payload: { phone: '+60111111111' },
    });
    expect(response.json().phone).toBe('+60111111111');
  });

  it('DELETE /api/patients/:id soft-deletes; a subsequent GET is 404', async () => {
    const { app } = buildTestServer();
    const created = await createPatient(app);
    expect((await app.inject({ method: 'DELETE', url: `/api/patients/${created.id}`, headers: AUTH_HEADER })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/patients/${created.id}`, headers: AUTH_HEADER })).statusCode).toBe(404);
  });
});
```

`packages/api/test/http/routes.encounters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';

const createPatient = async (app: ReturnType<typeof buildTestServer>['app']) =>
  app
    .inject({
      method: 'POST', url: '/api/patients', headers: AUTH_HEADER,
      payload: { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
    })
    .then((r) => r.json());

describe('encounter and observation routes', () => {
  it('POST /api/patients/:id/encounters creates an encounter for that patient', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const response = await app.inject({
      method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER,
      payload: { type: 'outpatient', department: 'General' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().patientId).toBe(patient.id);
  });

  it('GET /api/patients/:id/encounters lists them', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    await app.inject({
      method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER,
      payload: { type: 'outpatient', department: 'General' },
    });
    const response = await app.inject({ method: 'GET', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER });
    expect(response.json()).toHaveLength(1);
  });

  it('PATCH /api/encounters/:id discharges an encounter', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'inpatient', department: 'Cardiology' } })
      .then((r) => r.json());
    const response = await app.inject({
      method: 'PATCH', url: `/api/encounters/${encounter.id}`, headers: AUTH_HEADER, payload: { status: 'discharged' },
    });
    expect(response.json().status).toBe('discharged');
  });

  it('POST /api/encounters/:id/observations records an observation stamped with the caller', async () => {
    const { app, deps } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'outpatient', department: 'General' } })
      .then((r) => r.json());
    const response = await app.inject({
      method: 'POST', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER,
      payload: { code: 'heart_rate', valueNum: 72, unit: 'bpm' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.recordedBy).toBe((await deps.authProvider.verify('valid-token'))?.userId);
  });

  it('GET /api/encounters/:id/observations lists them oldest first', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'outpatient', department: 'General' } })
      .then((r) => r.json());
    await app.inject({ method: 'POST', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER, payload: { code: 'heart_rate', valueNum: 72 } });
    const response = await app.inject({ method: 'GET', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER });
    expect(response.json()).toHaveLength(1);
  });
});
```

`packages/api/test/http/routes.admin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';
import { setForcedUnhealthy } from '../../src/http/healthState.js';

describe('admin routes', () => {
  it('POST /api/admin/health/fail then /recover flips the /health status', async () => {
    const { app } = buildTestServer();
    setForcedUnhealthy(false);
    await app.inject({ method: 'POST', url: '/api/admin/health/fail', headers: AUTH_HEADER });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
    await app.inject({ method: 'POST', url: '/api/admin/health/recover', headers: AUTH_HEADER });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it('POST /api/admin/load/burn requires auth and returns quickly with a duration', async () => {
    const { app } = buildTestServer();
    expect((await app.inject({ method: 'POST', url: '/api/admin/load/burn' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'POST', url: '/api/admin/load/burn', headers: AUTH_HEADER });
    expect(response.statusCode).toBe(200);
    expect(response.json().burnedMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:unit -w @aethelgard/api`
Expected: FAIL — route files don't exist and `ServerDeps` doesn't yet carry `patients`/`encounters`/`observations`/`auth`.

- [ ] **Step 4: Implement the five route modules**

`packages/api/src/http/routes/auth.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@aethelgard/shared';
import type { AuthService } from '../../services/authService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerAuthRoutes = (
  fastify: FastifyInstance,
  auth: AuthService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.post('/api/auth/login', async (request, reply) => {
    const input = parseWith(loginSchema, request.body);
    const result = await auth.login(input);
    reply.code(200).send(result);
  });

  fastify.get('/api/auth/demo-users', async (_request, reply) => {
    reply.send(await auth.demoUsers());
  });

  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    reply.send(request.principal);
  });
};
```

`packages/api/src/http/routes/patients.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createPatientSchema, paginationQuerySchema, updatePatientSchema } from '@aethelgard/shared';
import type { PatientService } from '../../services/patientService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerPatientRoutes = (
  fastify: FastifyInstance,
  patients: PatientService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/patients', { preHandler: requireAuth }, async (request, reply) => {
    const query = parseWith(paginationQuerySchema, request.query);
    const search = (request.query as { search?: string }).search;
    reply.send(await patients.search({ ...query, search }));
  });

  fastify.post('/api/patients', { preHandler: requireAuth }, async (request, reply) => {
    const input = parseWith(createPatientSchema, request.body);
    const patient = await patients.create(input, request.principal!.branchId);
    reply.code(201).send(patient);
  });

  fastify.get('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await patients.get(id));
  });

  fastify.patch('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = parseWith(updatePatientSchema, request.body);
    reply.send(await patients.update(id, patch));
  });

  fastify.delete('/api/patients/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await patients.remove(id);
    reply.code(204).send();
  });
};
```

`packages/api/src/http/routes/encounters.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createEncounterSchema, patchEncounterSchema } from '@aethelgard/shared';
import type { EncounterService } from '../../services/encounterService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerEncounterRoutes = (
  fastify: FastifyInstance,
  encounters: EncounterService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/patients/:patientId/encounters', { preHandler: requireAuth }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    reply.send(await encounters.listByPatient(patientId));
  });

  fastify.post('/api/patients/:patientId/encounters', { preHandler: requireAuth }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    const input = parseWith(createEncounterSchema, request.body);
    const encounter = await encounters.create(patientId, input, request.principal!.branchId);
    reply.code(201).send(encounter);
  });

  fastify.get('/api/encounters/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await encounters.get(id));
  });

  fastify.patch('/api/encounters/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = parseWith(patchEncounterSchema, request.body);
    reply.send(await encounters.update(id, patch));
  });
};
```

`packages/api/src/http/routes/observations.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createObservationSchema } from '@aethelgard/shared';
import type { ObservationService } from '../../services/observationService.js';
import { parseWith } from '../validate.js';
import type { createRequireAuth } from '../authMiddleware.js';

export const registerObservationRoutes = (
  fastify: FastifyInstance,
  observations: ObservationService,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.get('/api/encounters/:encounterId/observations', { preHandler: requireAuth }, async (request, reply) => {
    const { encounterId } = request.params as { encounterId: string };
    reply.send(await observations.listByEncounter(encounterId));
  });

  fastify.post('/api/encounters/:encounterId/observations', { preHandler: requireAuth }, async (request, reply) => {
    const { encounterId } = request.params as { encounterId: string };
    const input = parseWith(createObservationSchema, request.body);
    const observation = await observations.create(encounterId, input, request.principal!.userId);
    reply.code(201).send(observation);
  });
};
```

`packages/api/src/http/routes/admin.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { setForcedUnhealthy } from '../healthState.js';
import type { createRequireAuth } from '../authMiddleware.js';

const BURN_DURATION_MS = 2000;

export const registerAdminRoutes = (
  fastify: FastifyInstance,
  requireAuth: ReturnType<typeof createRequireAuth>,
): void => {
  fastify.post('/api/admin/health/fail', { preHandler: requireAuth }, async (_request, reply) => {
    setForcedUnhealthy(true);
    reply.code(200).send({ forcedUnhealthy: true });
  });

  fastify.post('/api/admin/health/recover', { preHandler: requireAuth }, async (_request, reply) => {
    setForcedUnhealthy(false);
    reply.code(200).send({ forcedUnhealthy: false });
  });

  fastify.post('/api/admin/load/burn', { preHandler: requireAuth }, async (_request, reply) => {
    const end = Date.now() + BURN_DURATION_MS;
    while (Date.now() < end) {
      Math.sqrt(Math.random());
    }
    reply.code(200).send({ burnedMs: BURN_DURATION_MS });
  });
};
```

- [ ] **Step 5: Modify `server.ts`** — extend `ServerDeps` and register the new routes

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthProvider } from '../ports/index.js';
import type { Db } from '../adapters/persistence/postgres/pool.js';
import type { PatientService } from '../services/patientService.js';
import type { EncounterService } from '../services/encounterService.js';
import type { ObservationService } from '../services/observationService.js';
import type { AuthService } from '../services/authService.js';
import { errorHandler } from './errorMiddleware.js';
import { createRequireAuth } from './authMiddleware.js';
import { registerHealthRoute } from './routes/health.js';
import { registerMetaRoute } from './routes/meta.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPatientRoutes } from './routes/patients.js';
import { registerEncounterRoutes } from './routes/encounters.js';
import { registerObservationRoutes } from './routes/observations.js';
import { registerAdminRoutes } from './routes/admin.js';

export type ServerDeps = {
  db: Db;
  authProvider: AuthProvider;
  patients: PatientService;
  encounters: EncounterService;
  observations: ObservationService;
  auth: AuthService;
  instanceId: string;
  availabilityZone: string;
  appVersion: string;
  authDriverName: string;
  identityDriverName: string;
  serveStatic: boolean;
  staticRoot?: string;
};

export const buildServer = (deps: ServerDeps): FastifyInstance => {
  const fastify = Fastify({ logger: true, disableRequestLogging: true });

  fastify.decorateRequest('principal', undefined);
  fastify.setErrorHandler(errorHandler);

  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Served-By', deps.instanceId);
    reply.header('X-AZ', deps.availabilityZone);
    return payload;
  });

  const requireAuth = createRequireAuth(deps.authProvider);

  registerHealthRoute(fastify, deps.db);
  registerMetaRoute(fastify, deps, requireAuth);
  registerAuthRoutes(fastify, deps.auth, requireAuth);
  registerPatientRoutes(fastify, deps.patients, requireAuth);
  registerEncounterRoutes(fastify, deps.encounters, requireAuth);
  registerObservationRoutes(fastify, deps.observations, requireAuth);
  registerAdminRoutes(fastify, requireAuth);

  return fastify;
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS — 4 (auth) + 6 (patients) + 5 (encounters/observations) + 2 (admin) = 17 new tests.

- [ ] **Step 7: Verify the typecheck passes and commit**

```bash
npm run typecheck -w @aethelgard/api
git add packages/api/src/http packages/api/test/http
git commit -m "feat(api): add auth, patient, encounter, observation and admin routes"
```

---

### Task 12: Composition root, entrypoint, and seed script

**Files:**
- Create: `packages/api/src/composition.ts`, `packages/api/src/index.ts`, `packages/api/src/scripts/seed.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 1); `createDb`, `runMigrations` (Task 6); every Postgres repository (Task 7); `createLocalJwtAuthProvider` (Task 8); `createLocalIdentity`, `createEcsIdentity` (Task 9); `buildServer` (Task 10/11); every service factory (Task 5).
- Produces: `buildApplication(config: AppConfig): Promise<{ server: FastifyInstance; db: Db }>` — the only function `index.ts` and `scripts/seed.ts` call to get a fully wired system. This is the single file that ever imports both a `ports` type and a concrete `adapters` implementation together — everywhere else respects the one-directional dependency rule.

- [ ] **Step 1: Implement `composition.ts`**

No test file for this task — it is pure wiring with no business logic of its own; its correctness is exercised end-to-end by `docker compose up` in Task 18 and by every test in Tasks 1–11 exercising the pieces it wires.

```ts
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { createDb, type Db } from './adapters/persistence/postgres/pool.js';
import { runMigrations } from './adapters/persistence/postgres/migrator.js';
import { createPostgresBranchRepository } from './adapters/persistence/postgres/branchRepository.js';
import { createPostgresPatientRepository } from './adapters/persistence/postgres/patientRepository.js';
import { createPostgresEncounterRepository } from './adapters/persistence/postgres/encounterRepository.js';
import { createPostgresObservationRepository } from './adapters/persistence/postgres/observationRepository.js';
import { createLocalJwtAuthProvider } from './adapters/auth/localJwt/localJwtAuthProvider.js';
import { createLocalIdentity } from './adapters/identity/localIdentity.js';
import { createEcsIdentity } from './adapters/identity/ecsIdentity.js';
import { createPatientService } from './services/patientService.js';
import { createEncounterService } from './services/encounterService.js';
import { createObservationService } from './services/observationService.js';
import { createAuthService } from './services/authService.js';
import { buildServer } from './http/server.js';

const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

/**
 * The one place a `ports` type and a concrete `adapters` implementation are
 * imported together. Everything this function builds is created here and
 * nowhere else — swapping `AUTH_DRIVER` or `IDENTITY_DRIVER`, or pointing
 * `DATABASE_URL`/`DB_HOST` at Aurora instead of RDS, changes nothing below;
 * `config/env.ts` (Task 1) already resolved those decisions into plain values.
 */
export const buildApplication = async (
  config: AppConfig,
): Promise<{ server: FastifyInstance; db: Db }> => {
  const db = createDb(config.databaseUrl);
  await runMigrations(db, { log: (message) => console.log(message) });

  const branches = createPostgresBranchRepository(db);
  const patientsRepo = createPostgresPatientRepository(db);
  const encountersRepo = createPostgresEncounterRepository(db);
  const observationsRepo = createPostgresObservationRepository(db);

  const authProvider = createLocalJwtAuthProvider(db, config.jwtSecret);
  const identity = config.identityDriver === 'ecs' ? createEcsIdentity() : createLocalIdentity();

  // Resolved once at boot, not per-request — see Task 10's server.ts rationale.
  const [instanceId, availabilityZone] = await Promise.all([
    identity.instanceId(),
    identity.availabilityZone(),
  ]);

  const server = buildServer({
    db,
    authProvider,
    patients: createPatientService({ patients: patientsRepo, branches, now, newId }),
    encounters: createEncounterService({ encounters: encountersRepo, now, newId }),
    observations: createObservationService({ observations: observationsRepo, now, newId }),
    auth: createAuthService({ authProvider }),
    instanceId,
    availabilityZone,
    appVersion: config.appVersion,
    authDriverName: config.authDriver,
    identityDriverName: config.identityDriver,
    serveStatic: config.serveStatic,
    staticRoot: config.serveStatic ? new URL('../../web/dist', import.meta.url).pathname : undefined,
  });

  return { server, db };
};
```

- [ ] **Step 2: Implement `index.ts`**

```ts
import { loadConfig } from './config/env.js';
import { buildApplication } from './composition.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const { server, db } = await buildApplication(config);

  await server.listen({ port: config.port, host: '0.0.0.0' });
  server.log.info(`aethelgard-demo api listening on :${config.port}`);

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info(`received ${signal}, shutting down`);
    await server.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error: unknown) => {
  console.error('fatal startup error', error);
  process.exit(1);
});
```

- [ ] **Step 3: Implement `scripts/seed.ts`**

```ts
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
```

- [ ] **Step 4: Run the full unit suite one more time**

Run: `npm run test:unit -w @aethelgard/api && npm run typecheck -w @aethelgard/api`
Expected: PASS, no output from typecheck.

- [ ] **Step 5: Smoke-test against a real Postgres**

Run:

```bash
docker run --rm -d --name aethelgard-smoke -e POSTGRES_PASSWORD=aethelgard -e POSTGRES_USER=aethelgard -e POSTGRES_DB=aethelgard -p 5432:5432 postgres:17-alpine
sleep 3
DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard JWT_SECRET=dev-only-secret-change-me npm run seed -w @aethelgard/api
DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard JWT_SECRET=dev-only-secret-change-me npm run dev -w @aethelgard/api &
sleep 2
curl -s -X POST http://localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"email":"doctor.kl@aethelgard.demo","password":"demo1234"}'
kill %1
docker stop aethelgard-smoke
```

Expected: the `curl` prints a JSON body containing `"token"` and a `principal` with `"role":"doctor"`.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/composition.ts packages/api/src/index.ts packages/api/src/scripts
git commit -m "feat(api): add composition root, entrypoint and seed script"
```

---

### Task 13: React + Vite scaffold, API client, and login

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`
- Create: `packages/web/src/{main,App}.tsx`
- Create: `packages/web/src/api/client.ts`
- Create: `packages/web/src/auth/AuthContext.tsx`
- Create: `packages/web/src/pages/LoginPage.tsx`
- Create: `packages/web/src/components/ServedByBadge.tsx`

**Interfaces:**
- Consumes: the JSON shapes of `/api/auth/login`, `/api/auth/demo-users` from Task 11 (no shared TypeScript import across the package boundary — the web package declares its own lightweight types matching the wire shape, since `@aethelgard/shared`'s Zod schemas are for validating requests server-side, not for the browser bundle).
- Produces: `apiFetch<T>(path, init?): Promise<T>`, `getLastResponseMeta(): { servedBy: string | null; az: string | null }`, `useAuth()` hook exposing `{ principal, token, login, logout }`, `<ServedByBadge />`.

- [ ] **Step 1: Create the package files**

`packages/web/package.json`:

```json
{
  "name": "@aethelgard/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.0"
  }
}
```

`packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`packages/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
      '/health': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
```

`packages/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aethelgard EHR Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement the API client**

`packages/web/src/api/client.ts`:

```ts
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let lastServedBy: string | null = null;
let lastAz: string | null = null;

export const getLastResponseMeta = (): { servedBy: string | null; az: string | null } => ({
  servedBy: lastServedBy,
  az: lastAz,
});

const TOKEN_KEY = 'aethelgard.token';

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string | null): void => {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
};

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getStoredToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  lastServedBy = response.headers.get('x-served-by');
  lastAz = response.headers.get('x-az');

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as
    | (T & { code?: string; message?: string })
    | null;

  if (!response.ok) {
    throw new ApiError(response.status, body?.code ?? 'UNKNOWN', body?.message ?? response.statusText);
  }
  return body as T;
};
```

- [ ] **Step 3: Implement the auth context**

`packages/web/src/auth/AuthContext.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../api/client.js';

export type Principal = { userId: string; email: string; role: string; branchId: string };
type LoginResult = { principal: Principal; token: string };

type AuthContextValue = {
  principal: Principal | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [principal, setPrincipal] = useState<Principal | null>(null);

  const login = async (email: string, password: string): Promise<void> => {
    const result = await apiFetch<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(result.token);
    setToken(result.token);
    setPrincipal(result.principal);
  };

  const logout = (): void => {
    setStoredToken(null);
    setToken(null);
    setPrincipal(null);
  };

  return (
    <AuthContext.Provider value={{ principal, token, login, logout }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

- [ ] **Step 4: Implement the served-by badge and the login page**

`packages/web/src/components/ServedByBadge.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getLastResponseMeta } from '../api/client.js';

/** Polled rather than event-driven — the simplest thing that keeps the footer honest after every fetch, without threading a global event bus through apiFetch. */
export const ServedByBadge = (): JSX.Element => {
  const [meta, setMeta] = useState(getLastResponseMeta());

  useEffect(() => {
    const interval = setInterval(() => setMeta(getLastResponseMeta()), 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderTop: '1px solid #ddd' }}>
      Served by <strong>{meta.servedBy ?? '—'}</strong> in <strong>{meta.az ?? '—'}</strong>
    </footer>
  );
};
```

`packages/web/src/pages/LoginPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

type DemoUser = { email: string; role: string; branchCode: string; displayName: string };

export const LoginPage = (): JSX.Element => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DemoUser[]>('/api/auth/demo-users').then(setDemoUsers).catch(() => undefined);
  }, []);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/patients');
    } catch {
      setError('Invalid email or password.');
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '4rem auto' }}>
      <h1>Aethelgard EHR — Demo Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Demo account
          <select
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setPassword('demo1234');
            }}
          >
            <option value="">— choose a demo account —</option>
            {demoUsers.map((user) => (
              <option key={user.email} value={user.email}>
                {user.displayName} ({user.role}, {user.branchCode})
              </option>
            ))}
          </select>
        </label>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit">Log in</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 5: Implement `App.tsx` and `main.tsx`**

`packages/web/src/App.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { ServedByBadge } from './components/ServedByBadge.js';

const RequireAuth = ({ children }: { children: JSX.Element }): JSX.Element => {
  const { token } = useAuth();
  return token === null ? <Navigate to="/login" replace /> : children;
};

export const App = (): JSX.Element => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <main style={{ flex: 1 }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        {/* /patients, /patients/:id, /encounters/:id, /infra are added in Tasks 14–16 */}
      </Routes>
    </main>
    <ServedByBadge />
  </div>
);
```

`packages/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import { App } from './App.js';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 6: Verify — install, typecheck, build**

Run:

```bash
npm install
npm run typecheck -w @aethelgard/web
npm run build -w @aethelgard/web
```

Expected: all three succeed; `packages/web/dist/index.html` exists.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev -w @aethelgard/api` (in one terminal) and `npm run dev -w @aethelgard/web` (in another). Open `http://localhost:5173/login`. Expected: the demo-account dropdown populates from `GET /api/auth/demo-users`; selecting one and submitting redirects to `/patients` (a blank page until Task 14 — a 404-free navigation is the pass condition here).

- [ ] **Step 8: Commit**

```bash
git add packages/web
git commit -m "feat(web): scaffold React app with auth context and login page"
```

---

### Task 14: Patients list and detail pages

**Files:**
- Create: `packages/web/src/pages/{PatientsPage,PatientDetailPage}.tsx`
- Modify: `packages/web/src/App.tsx` — add the two routes

**Interfaces:**
- Consumes: `apiFetch` from `api/client.js`; `useAuth` from `auth/AuthContext.js`.
- Produces: `<PatientsPage />`, `<PatientDetailPage />`.

- [ ] **Step 1: Implement `PatientsPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Patient = { id: string; mrn: string; name: string; dob: string; phone: string };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export const PatientsPage = (): JSX.Element => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<Page<Patient> | null>(null);
  const [form, setForm] = useState({ name: '', dob: '', sex: 'unknown', phone: '' });

  const reload = async (): Promise<void> => {
    const query = new URLSearchParams({ search, page: '1', pageSize: '20' });
    setPage(await apiFetch<Page<Patient>>(`/api/patients?${query.toString()}`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [search]);

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await apiFetch('/api/patients', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', dob: '', sex: 'unknown', phone: '' });
    await reload();
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Patients</h1>
      <input placeholder="Search by name or MRN" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {page?.items.map((patient) => (
          <li key={patient.id}>
            <Link to={`/patients/${patient.id}`}>
              {patient.name} — {patient.mrn}
            </Link>
          </li>
        ))}
      </ul>
      {page !== null && <p>{page.total} total</p>}

      <h2>New patient</h2>
      <form onSubmit={handleCreate}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required />
        <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
          <option value="unknown">Unknown</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        <button type="submit">Create</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 2: Implement `PatientDetailPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Patient = { id: string; mrn: string; name: string; dob: string; sex: string; phone: string };
type Encounter = { id: string; type: string; department: string; status: string; admittedAt: string };

export const PatientDetailPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [newEncounter, setNewEncounter] = useState({ type: 'outpatient', department: '' });

  const reload = async (): Promise<void> => {
    if (id === undefined) return;
    setPatient(await apiFetch<Patient>(`/api/patients/${id}`));
    setEncounters(await apiFetch<Encounter[]>(`/api/patients/${id}/encounters`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [id]);

  const handleCreateEncounter = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await apiFetch(`/api/patients/${id}/encounters`, { method: 'POST', body: JSON.stringify(newEncounter) });
    setNewEncounter({ type: 'outpatient', department: '' });
    await reload();
  };

  const handleDelete = async (): Promise<void> => {
    await apiFetch(`/api/patients/${id}`, { method: 'DELETE' });
    navigate('/patients');
  };

  if (patient === null) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <p>
        <Link to="/patients">&larr; back to patients</Link>
      </p>
      <h1>
        {patient.name} — {patient.mrn}
      </h1>
      <p>
        DOB {patient.dob} · {patient.sex} · {patient.phone}
      </p>
      <button onClick={handleDelete}>Delete patient</button>

      <h2>Encounters</h2>
      <ul>
        {encounters.map((encounter) => (
          <li key={encounter.id}>
            <Link to={`/encounters/${encounter.id}`}>
              {encounter.type} — {encounter.department} ({encounter.status})
            </Link>
          </li>
        ))}
      </ul>

      <h3>New encounter</h3>
      <form onSubmit={handleCreateEncounter}>
        <select value={newEncounter.type} onChange={(e) => setNewEncounter({ ...newEncounter, type: e.target.value })}>
          <option value="outpatient">Outpatient</option>
          <option value="inpatient">Inpatient</option>
          <option value="emergency">Emergency</option>
        </select>
        <input
          placeholder="Department"
          value={newEncounter.department}
          onChange={(e) => setNewEncounter({ ...newEncounter, department: e.target.value })}
          required
        />
        <button type="submit">Open encounter</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 3: Wire the routes into `App.tsx`**

Replace the `<Routes>` block in `packages/web/src/App.tsx`:

```tsx
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        <Route path="/patients" element={<RequireAuth><PatientsPage /></RequireAuth>} />
        <Route path="/patients/:id" element={<RequireAuth><PatientDetailPage /></RequireAuth>} />
        {/* /encounters/:id and /infra are added in Tasks 15–16 */}
      </Routes>
```

Add the two imports at the top of the file:

```tsx
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck -w @aethelgard/web && npm run build -w @aethelgard/web`
Expected: both succeed.

- [ ] **Step 5: Manual smoke test**

With both dev servers running (Task 13, Step 7): log in, create a patient, confirm it appears in the list and the search box filters it, open its detail page, create an encounter, confirm it appears in the encounter list.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): add patients list and detail pages"
```

---

### Task 15: Encounter detail page with observations

**Files:**
- Create: `packages/web/src/pages/EncounterPage.tsx`
- Modify: `packages/web/src/App.tsx` — add the `/encounters/:id` route

**Interfaces:**
- Consumes: `apiFetch` from `api/client.js`.
- Produces: `<EncounterPage />`.

- [ ] **Step 1: Implement `EncounterPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../api/client.js';

type Encounter = { id: string; patientId: string; type: string; department: string; status: string; admittedAt: string; dischargedAt: string | null };
type Observation = { id: string; code: string; valueNum: number | null; valueText: string | null; unit: string | null; recordedAt: string };

const OBSERVATION_CODES = ['heart_rate', 'blood_pressure', 'temperature', 'spo2', 'weight'] as const;

export const EncounterPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [form, setForm] = useState<{ code: string; value: string; unit: string }>({
    code: 'heart_rate',
    value: '',
    unit: '',
  });

  const reload = async (): Promise<void> => {
    if (id === undefined) return;
    setEncounter(await apiFetch<Encounter>(`/api/encounters/${id}`));
    setObservations(await apiFetch<Observation[]>(`/api/encounters/${id}/observations`));
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, [id]);

  const handleAddObservation = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const numeric = Number(form.value);
    const payload = Number.isNaN(numeric)
      ? { code: form.code, valueText: form.value }
      : { code: form.code, valueNum: numeric, unit: form.unit || undefined };
    await apiFetch(`/api/encounters/${id}/observations`, { method: 'POST', body: JSON.stringify(payload) });
    setForm({ code: 'heart_rate', value: '', unit: '' });
    await reload();
  };

  const handleDischarge = async (): Promise<void> => {
    await apiFetch(`/api/encounters/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'discharged' }) });
    await reload();
  };

  if (encounter === null) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>
        {encounter.type} — {encounter.department}
      </h1>
      <p>
        Status: <strong>{encounter.status}</strong>
        {encounter.status === 'open' && <button onClick={handleDischarge}>Discharge</button>}
      </p>

      <h2>Observations</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((observation) => (
            <tr key={observation.id}>
              <td>{observation.code}</td>
              <td>{observation.valueNum ?? observation.valueText}</td>
              <td>{observation.unit ?? '—'}</td>
              <td>{observation.recordedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Record observation</h3>
      <form onSubmit={handleAddObservation}>
        <select value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}>
          {OBSERVATION_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <input placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        <input placeholder="Unit (optional)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <button type="submit">Record</button>
      </form>
    </div>
  );
};
```

- [ ] **Step 2: Wire the route into `App.tsx`**

Add the import:

```tsx
import { EncounterPage } from './pages/EncounterPage.js';
```

Add the route inside `<Routes>`, replacing the "Tasks 15–16" comment:

```tsx
        <Route path="/encounters/:id" element={<RequireAuth><EncounterPage /></RequireAuth>} />
        {/* /infra is added in Task 16 */}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck -w @aethelgard/web && npm run build -w @aethelgard/web`
Expected: both succeed.

- [ ] **Step 4: Manual smoke test**

Open an encounter from Task 14's flow, record a `heart_rate` observation with a numeric value, confirm it appears in the table; click Discharge, confirm status updates and the button disappears.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): add encounter detail page with observations"
```

---

### Task 16: Infra page — instance distribution, health toggle, load burn

**Files:**
- Create: `packages/web/src/pages/InfraPage.tsx`
- Modify: `packages/web/src/App.tsx` — add the `/infra` route and a nav link

**Interfaces:**
- Consumes: `apiFetch`, `getLastResponseMeta` from `api/client.js`.
- Produces: `<InfraPage />`. This is the primary screenshot surface for the "load balancing observable in real time" success criterion.

- [ ] **Step 1: Implement `InfraPage.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client.js';

type Meta = {
  instanceId: string;
  availabilityZone: string;
  version: string;
  uptimeSeconds: number;
  adapters: { db: string; auth: string; identity: string };
};

const HISTORY_LIMIT = 50;
const POLL_INTERVAL_MS = 1500;

export const InfraPage = (): JSX.Element => {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const historyRef = useRef<string[]>([]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      try {
        const result = await apiFetch<Meta>('/api/meta');
        setMeta(result);
        setError(null);
        historyRef.current = [...historyRef.current, result.instanceId].slice(-HISTORY_LIMIT);
        setHistory(historyRef.current);
      } catch {
        setError('Could not reach /api/meta');
      }
    };
    poll().catch(() => undefined);
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const distribution = history.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  const handleFail = async (): Promise<void> => {
    await apiFetch('/api/admin/health/fail', { method: 'POST' });
  };
  const handleRecover = async (): Promise<void> => {
    await apiFetch('/api/admin/health/recover', { method: 'POST' });
  };
  const handleBurn = async (): Promise<void> => {
    setBurning(true);
    await apiFetch('/api/admin/load/burn', { method: 'POST' });
    setBurning(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Infra</h1>
      {error !== null && <p role="alert">{error}</p>}
      {meta !== null && (
        <>
          <p>
            Version {meta.version} · uptime {Math.round(meta.uptimeSeconds)}s
          </p>
          <p>
            Adapters: db={meta.adapters.db}, auth={meta.adapters.auth}, identity={meta.adapters.identity}
          </p>
        </>
      )}

      <h2>Instance distribution (last {history.length} of {HISTORY_LIMIT} requests)</h2>
      <ul>
        {Object.entries(distribution).map(([instanceId, count]) => (
          <li key={instanceId}>
            {instanceId}: {'█'.repeat(count)} ({count})
          </li>
        ))}
      </ul>

      <h2>Health toggle</h2>
      <button onClick={handleFail}>Force unhealthy</button>
      <button onClick={handleRecover}>Recover</button>

      <h2>Load</h2>
      <button onClick={handleBurn} disabled={burning}>
        {burning ? 'Burning…' : 'Burn CPU (2s)'}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Wire the route and a nav bar into `App.tsx`**

Replace the whole file:

```tsx
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { EncounterPage } from './pages/EncounterPage.js';
import { InfraPage } from './pages/InfraPage.js';
import { ServedByBadge } from './components/ServedByBadge.js';

const RequireAuth = ({ children }: { children: JSX.Element }): JSX.Element => {
  const { token } = useAuth();
  return token === null ? <Navigate to="/login" replace /> : children;
};

const NavBar = (): JSX.Element => {
  const { principal, logout } = useAuth();
  if (principal === null) return <></>;
  return (
    <nav style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #ddd', display: 'flex', gap: '1rem' }}>
      <Link to="/patients">Patients</Link>
      <Link to="/infra">Infra</Link>
      <span style={{ marginLeft: 'auto' }}>
        {principal.email} ({principal.role})
      </span>
      <button onClick={logout}>Log out</button>
    </nav>
  );
};

export const App = (): JSX.Element => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <NavBar />
    <main style={{ flex: 1 }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
        <Route path="/patients" element={<RequireAuth><PatientsPage /></RequireAuth>} />
        <Route path="/patients/:id" element={<RequireAuth><PatientDetailPage /></RequireAuth>} />
        <Route path="/encounters/:id" element={<RequireAuth><EncounterPage /></RequireAuth>} />
        <Route path="/infra" element={<RequireAuth><InfraPage /></RequireAuth>} />
      </Routes>
    </main>
    <ServedByBadge />
  </div>
);
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck -w @aethelgard/web && npm run build -w @aethelgard/web`
Expected: both succeed.

- [ ] **Step 4: Manual smoke test**

Navigate to `/infra`. Confirm the instance-distribution list grows as it polls, "Force unhealthy" flips `/health` to 503 (check with `curl -i http://localhost:3000/health`), "Recover" flips it back, and "Burn CPU" briefly disables its own button and returns.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): add infra page with instance distribution, health toggle and load burn"
```

---

### Task 17: Dockerfiles

**Files:**
- Create: `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/nginx/nginx.conf`
- Create: `packages/shared/vitest.config.ts` build target additions — none needed; reuse Task 1/2 `tsconfig.build.json` files
- Modify: `packages/api/package.json`, `packages/shared/package.json` — already have `build` scripts from Tasks 1–2; this task only adds the api's `SERVE_STATIC` static-file wiring dependency

**Interfaces:**
- Consumes: `tsconfig.build.json` (Tasks 1–2), `npm run build` at the root (Task 1), `packages/web/dist` (Task 13+).
- Produces: `docker/api.Dockerfile` with `deps`/`dev`/`build`/`prod` stages; `docker/web.Dockerfile` with `dev`/`build`/`prod` (nginx) stages.

- [ ] **Step 1: Add the static-file plugin registration the prod image needs**

`packages/api/src/composition.ts` already computes `staticRoot` (Task 12). Modify `packages/api/src/http/server.ts` to register `@fastify/static` with an SPA fallback when `deps.serveStatic` is true — add this block right after the `onSend` hook, before route registration:

```ts
import fastifyStatic from '@fastify/static';
```

```ts
  if (deps.serveStatic && deps.staticRoot !== undefined) {
    await fastify.register(fastifyStatic, { root: deps.staticRoot });
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url === '/health') {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Route not found' });
        return;
      }
      reply.sendFile('index.html');
    });
  }
```

`buildServer` becomes `async` because `fastify.register` is awaited. This ripples through every caller — make each of these exact changes:

1. `packages/api/src/http/server.ts`: change the signature to `export const buildServer = async (deps: ServerDeps): Promise<FastifyInstance> => {`.
2. `packages/api/src/composition.ts`: change `const server = buildServer({` to `const server = await buildServer({`.
3. `packages/api/test/http/server.test.ts`: every `buildServer(buildDeps())` call becomes `await buildServer(buildDeps())`, and since these calls sit inside `it(async () => {...})` callbacks that are already `async`, no other change is needed in that file.
4. `packages/api/test/http/testServer.ts`: `buildTestServer` itself must become `async` because it wraps `buildServer`. Change:

   ```ts
   export const buildTestServer = () => {
   ```

   to

   ```ts
   export const buildTestServer = async () => {
   ```

   and change the return statement from `return { app: buildServer(deps), deps };` to `return { app: await buildServer(deps), deps };`.

5. Every caller of `buildTestServer()` across `packages/api/test/http/routes.auth.test.ts`, `routes.patients.test.ts`, `routes.encounters.test.ts`, and `routes.admin.test.ts` changes `const { app } = buildTestServer();` to `const { app } = await buildTestServer();` (and, in `routes.encounters.test.ts`, `const { app, deps } = buildTestServer();` to `const { app, deps } = await buildTestServer();`). Every one of these call sites is already inside an `async` `it(...)` callback, so no other signature changes are needed.

- [ ] **Step 2: Run the full unit suite to confirm the `await` change didn't break anything**

Run: `npm run test:unit -w @aethelgard/api`
Expected: PASS, same counts as Task 11 Step 6.

- [ ] **Step 3: Write `docker/api.Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 3000 9229
CMD ["npm", "run", "dev", "-w", "@aethelgard/api"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @aethelgard/shared \
 && npm run build -w @aethelgard/api \
 && npm run build -w @aethelgard/web

FROM node:22-alpine AS prod
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev --workspace=@aethelgard/shared --workspace=@aethelgard/api
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/packages/api/migrations packages/api/migrations
COPY --from=build /app/packages/web/dist packages/web/dist
USER app
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "packages/api/dist/index.js"]
```

- [ ] **Step 4: Write `docker/web.Dockerfile` and its nginx config**

`docker/web.Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@aethelgard/web", "--", "--host"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @aethelgard/web

FROM nginx:1.27-alpine AS prod
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

`docker/nginx/nginx.conf` — round-robins across two fixed API service hostnames (`api1`, `api2`, defined in Task 18's `docker-compose.prod.yml`), which is what makes `X-Served-By` rotate locally without any AWS resource:

```
events {}

http {
  upstream api_backend {
    server api1:3000;
    server api2:3000;
  }

  server {
    listen 80;

    location /api/ {
      proxy_pass http://api_backend;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
    }

    location /health {
      proxy_pass http://api_backend/health;
    }

    location / {
      root /usr/share/nginx/html;
      try_files $uri /index.html;
    }
  }
}
```

- [ ] **Step 5: Build both prod images locally**

Run:

```bash
docker build -f docker/api.Dockerfile --target prod -t aethelgard-api:local .
docker build -f docker/web.Dockerfile --target prod -t aethelgard-web:local .
```

Expected: both builds succeed with no errors.

- [ ] **Step 6: Commit**

```bash
git add docker packages/api/src/http/server.ts packages/api/src/composition.ts packages/api/test
git commit -m "feat: add api and web Dockerfiles with prod-stage SPA serving"
```

---

### Task 18: Docker Compose — development and local production-parity

**Files:**
- Create: `docker-compose.yml`, `docker-compose.prod.yml`

**Interfaces:**
- Consumes: `docker/api.Dockerfile`, `docker/web.Dockerfile` (Task 17); `.env.example` shape (Task 1).
- Produces: two runnable stacks. `docker-compose.yml` is the every-day dev loop; `docker-compose.prod.yml` is the zero-AWS-cost proof of the load-balancing/health-draining success criteria from the original spec (§1.4), captured **before** any Terraform apply — same rationale as the original spec's §10.2/§4.6.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: aethelgard
      POSTGRES_USER: aethelgard
      POSTGRES_PASSWORD: aethelgard
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U aethelgard']
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - aethelgard-postgres-data:/var/lib/postgresql/data

  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
      target: dev
    environment:
      DATABASE_URL: postgresql://aethelgard:aethelgard@postgres:5432/aethelgard
      JWT_SECRET: dev-only-secret-change-me
      IDENTITY_DRIVER: local
      PORT: '3000'
      LOG_LEVEL: info
    ports:
      - '3000:3000'
      - '9229:9229'
    volumes:
      - .:/app
      - aethelgard-api-node-modules:/app/node_modules
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
      target: dev
    environment:
      VITE_API_PROXY_TARGET: http://api:3000
    ports:
      - '5173:5173'
    volumes:
      - .:/app
      - aethelgard-web-node-modules:/app/node_modules
    depends_on:
      - api

volumes:
  aethelgard-postgres-data:
  aethelgard-api-node-modules:
  aethelgard-web-node-modules:
```

- [ ] **Step 2: Write `docker-compose.prod.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: aethelgard
      POSTGRES_USER: aethelgard
      POSTGRES_PASSWORD: aethelgard
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U aethelgard']
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - aethelgard-postgres-prod-data:/var/lib/postgresql/data

  api1: &api-prod-service
    build:
      context: .
      dockerfile: docker/api.Dockerfile
      target: prod
    hostname: api-1
    environment: &api-prod-environment
      NODE_ENV: production
      DATABASE_URL: postgresql://aethelgard:aethelgard@postgres:5432/aethelgard
      JWT_SECRET: dev-only-secret-change-me
      IDENTITY_DRIVER: local
      PORT: '3000'
      SERVE_STATIC: 'false'
    depends_on:
      postgres:
        condition: service_healthy

  api2:
    <<: *api-prod-service
    hostname: api-2
    environment:
      <<: *api-prod-environment

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
      target: prod
    ports:
      - '8080:80'
    depends_on:
      - api1
      - api2

volumes:
  aethelgard-postgres-prod-data:
```

`SERVE_STATIC: 'false'` here is deliberate — in this local production-parity stack, `web`'s nginx (Task 17) serves the SPA and proxies `/api` to `api1`/`api2`, exactly matching the AWS `full`/`lean` split from the amended spec where the API stays API-only whenever something else owns the SPA. Only the AWS deployment (Task 21) sets `SERVE_STATIC=true`, because there nothing else is serving the SPA.

- [ ] **Step 3: Run the migrator once and start the stack**

Run:

```bash
docker compose -f docker-compose.prod.yml up --build -d
sleep 5
docker compose -f docker-compose.prod.yml exec api1 sh -c "cd /app && node packages/api/dist/scripts/seed.js" 2>/dev/null || \
  DATABASE_URL=postgresql://aethelgard:aethelgard@localhost:5432/aethelgard JWT_SECRET=dev-only-secret-change-me npm run seed -w @aethelgard/api
```

(The migrator runs automatically on every API boot — Task 6/12 — so this step's only job is seeding demo users; either the in-container path or the host path works, whichever has a reachable `localhost:5432`.)

- [ ] **Step 4: Prove instance rotation and health draining — the evidence artefact for the report**

Run:

```bash
for i in 1 2 3 4; do curl -s -o /dev/null -D - http://localhost:8080/health | grep -i x-served-by; done
```

Expected: the four `X-Served-By` values alternate between `api-1` and `api-2` (nginx's default round-robin).

Run:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login -H 'content-type: application/json' -d '{"email":"admin@aethelgard.demo","password":"demo1234"}' | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
docker compose -f docker-compose.prod.yml exec api1 wget -qO- --post-data='{}' --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" http://localhost:3000/api/admin/health/fail
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/health
```

Expected: forcing `api1` unhealthy directly (bypassing nginx, since nginx itself does no active health-checking in this minimal config — that behaviour belongs to the ALB target group in Task 21) does not change what `curl` through nginx reports, because nginx has no target-group concept; this is the one success-criterion row the original spec's own evidence table (§4.5) already marks **"No — fixed replicas"** for Compose. Re-run Step 4's rotation loop to confirm the stack is otherwise healthy, then move on — the real health-draining proof happens against the ALB in Task 21.

- [ ] **Step 5: Tear down**

Run: `docker compose -f docker-compose.prod.yml down -v`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker-compose.prod.yml
git commit -m "feat: add development and local production-parity Compose stacks"
```

---

### Task 19: Terraform root configuration and the network module

From here on, verification is `terraform validate` and `terraform plan` — there is no AWS account access in this plan (§ Global Constraints: application side only). The user applies these modules themselves against their Learner Lab account.

**Files:**
- Create: `infra/terraform/{versions,providers,variables,locals,main,outputs}.tf`
- Create: `infra/terraform/modules/network/{main,variables,outputs}.tf`

**Interfaces:**
- Consumes: nothing (first infra task).
- Produces module `network` outputs consumed by Tasks 20–21: `vpc_id`, `subnet_ids` (list, 2 entries, one per AZ), `alb_security_group_id`, `ecs_security_group_id`, `db_security_group_id`.

- [ ] **Step 1: Write the root configuration files**

`infra/terraform/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
```

`infra/terraform/providers.tf`:

```hcl
provider "aws" {
  region = var.region
}
```

`infra/terraform/variables.tf`:

```hcl
variable "region" {
  description = "AWS region. Learner Lab constrains this to us-east-1 (see Appendix A of the 2026-08-08 spec)."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "aethelgard-demo"
}

variable "use_lab_role" {
  description = "true = look up the pre-existing Learner Lab LabRole via a data source. This plan supports only true; a personal-account IAM path is out of scope here (see 2026-08-08 spec §3.1/§5.2)."
  type        = bool
  default     = true

  validation {
    condition     = var.use_lab_role == true
    error_message = "This scaffold only implements the Learner Lab (use_lab_role = true) path. See docs/RUNBOOK.md for the personal-account extension point."
  }
}

variable "use_aurora" {
  description = "true = Aurora PostgreSQL (Provisioned) cluster. false = a single RDS PostgreSQL instance. The application only ever reads DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD, so this is a pure infrastructure choice — flip it and re-apply with zero application code changes."
  type        = bool
  default     = true
}

variable "db_multi_az" {
  description = "Only meaningful when use_aurora = false — an Aurora cluster is multi-AZ-capable by construction."
  type        = bool
  default     = false
}

variable "db_instance_class" {
  description = "Learner Lab RDS restriction: burstable classes only (nano/micro/small/medium). db.t4g.medium fits both that limit and Aurora's provisioned writer requirement."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_name" {
  type    = string
  default = "aethelgard"
}

variable "db_username" {
  type    = string
  default = "aethelgard_app"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "app_version" {
  type    = string
  default = "0.1.0"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "min_capacity" {
  type    = number
  default = 2
}

variable "max_capacity" {
  type    = number
  default = 4
}
```

`infra/terraform/locals.tf`:

```hcl
locals {
  tags = {
    Project   = var.project_name
    ManagedBy = "terraform"
  }
}
```

- [ ] **Step 2: Write the network module**

`infra/terraform/modules/network/variables.tf`:

```hcl
variable "project_name" {
  type = string
}

variable "container_port" {
  type = number
}

variable "tags" {
  type = map(string)
}
```

`infra/terraform/modules/network/main.tf`:

```hcl
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(var.tags, { Name = "${var.project_name}-vpc" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = merge(var.tags, { Name = "${var.project_name}-igw" })
}

# Two public subnets, one per AZ. No NAT gateway and no private subnets —
# this is the "minimal/lean" cost mode from the 2026-08-08 spec §11.3/§4.2:
# ALB and ECS tasks sit in public subnets, security groups do the isolating.
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.42.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = merge(var.tags, { Name = "${var.project_name}-public-${count.index}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = merge(var.tags, { Name = "${var.project_name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description = "HTTP from anywhere — no CloudFront/WAF in this profile (Learner Lab does not support either)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(var.tags, { Name = "${var.project_name}-alb-sg" })
}

resource "aws_security_group" "ecs" {
  name_prefix = "${var.project_name}-ecs-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "Container port from the ALB only"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(var.tags, { Name = "${var.project_name}-ecs-sg" })
}

resource "aws_security_group" "db" {
  name_prefix = "${var.project_name}-db-"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "PostgreSQL from the ECS tasks only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(var.tags, { Name = "${var.project_name}-db-sg" })
}
```

`infra/terraform/modules/network/outputs.tf`:

```hcl
output "vpc_id" {
  value = aws_vpc.main.id
}

output "subnet_ids" {
  value = aws_subnet.public[*].id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "db_security_group_id" {
  value = aws_security_group.db.id
}
```

- [ ] **Step 3: Write the root `main.tf` with only the network module wired (Tasks 20–21 add the rest)**

`infra/terraform/main.tf`:

```hcl
module "network" {
  source         = "./modules/network"
  project_name   = var.project_name
  container_port = var.container_port
  tags           = local.tags
}
```

`infra/terraform/outputs.tf`:

```hcl
output "region" {
  value = var.region
}

output "vpc_id" {
  value = module.network.vpc_id
}
```

- [ ] **Step 4: Validate**

Run:

```bash
cd infra/terraform
terraform init
terraform validate
terraform plan -var-file=environments/learnerlab.tfvars
```

(`environments/learnerlab.tfvars` doesn't exist until Task 22 — for this task only, run `terraform plan` with no `-var-file`; defaults are Learner-Lab-safe already.)

Run: `terraform init && terraform validate && terraform plan`
Expected: `terraform validate` reports `Success!`; `terraform plan` shows 1 VPC, 1 IGW, 2 subnets, 1 route table, 2 associations, 3 security groups — 9 resources to add, 0 to change, 0 to destroy.

- [ ] **Step 5: Commit**

```bash
git add infra/terraform
git commit -m "feat(infra): add Terraform root config and the network module"
```

---

### Task 20: Data module — Aurora/RDS switch and Secrets Manager

**Files:**
- Create: `infra/terraform/modules/data/{main,variables,outputs}.tf`
- Modify: `infra/terraform/main.tf`, `infra/terraform/outputs.tf`

**Interfaces:**
- Consumes: `vpc_id`, `subnet_ids`, `db_security_group_id` from the `network` module (Task 19).
- Produces: `db_host`, `db_port`, `db_name`, `db_username`, `db_secret_arn` — Task 21's compute module injects these into the ECS task definition as `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER` env vars and a `DB_PASSWORD` secret, which is exactly the split-var shape `config/env.ts` (Task 1) already assembles into one connection string. **This is the module where "not locked to a service" is decided at the infrastructure layer** — `var.use_aurora` picks the resource block; both branches produce the same four outputs.

- [ ] **Step 1: Write the module**

`infra/terraform/modules/data/variables.tf`:

```hcl
variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "db_security_group_id" {
  type = string
}

variable "use_aurora" {
  type = bool
}

variable "db_multi_az" {
  type = bool
}

variable "db_instance_class" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "tags" {
  type = map(string)
}
```

`infra/terraform/modules/data/main.tf`:

```hcl
resource "aws_db_subnet_group" "this" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

# ---- Aurora PostgreSQL (Provisioned) — used when var.use_aurora = true ----
resource "aws_rds_cluster" "aurora" {
  count                       = var.use_aurora ? 1 : 0
  cluster_identifier          = "${var.project_name}-aurora"
  engine                      = "aurora-postgresql"
  engine_mode                 = "provisioned"
  database_name               = var.db_name
  master_username             = var.db_username
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [var.db_security_group_id]
  skip_final_snapshot         = true
  apply_immediately           = true
  tags                        = var.tags
}

resource "aws_rds_cluster_instance" "aurora_writer" {
  count              = var.use_aurora ? 1 : 0
  identifier         = "${var.project_name}-aurora-writer"
  cluster_identifier = aws_rds_cluster.aurora[0].id
  engine             = aws_rds_cluster.aurora[0].engine
  instance_class     = var.db_instance_class
  tags               = var.tags
}

# ---- Single RDS PostgreSQL instance — used when var.use_aurora = false ----
# Fallback path per the 2026-08-08 chat decision: try Aurora first, drop to
# this only if Learner Lab rejects the Aurora resources. No application code
# depends on which of these two blocks actually created the database.
resource "aws_db_instance" "postgres" {
  count                       = var.use_aurora ? 0 : 1
  identifier                  = "${var.project_name}-postgres"
  engine                      = "postgres"
  instance_class              = var.db_instance_class
  allocated_storage           = 20
  storage_type                = "gp2"
  db_name                     = var.db_name
  username                    = var.db_username
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [var.db_security_group_id]
  multi_az                    = var.db_multi_az
  publicly_accessible         = false
  skip_final_snapshot         = true
  apply_immediately           = true
  # Mandatory on Learner Lab (servicerestrictions.md: "Enhanced monitoring is not supported").
  monitoring_interval         = 0
  tags                        = var.tags
}
```

- [ ] **Step 2: Write the outputs — identical shape regardless of which branch ran**

`infra/terraform/modules/data/outputs.tf`:

```hcl
locals {
  db_host       = var.use_aurora ? aws_rds_cluster.aurora[0].endpoint : aws_db_instance.postgres[0].address
  db_port       = var.use_aurora ? aws_rds_cluster.aurora[0].port : aws_db_instance.postgres[0].port
  db_secret_arn = var.use_aurora ? aws_rds_cluster.aurora[0].master_user_secret[0].secret_arn : aws_db_instance.postgres[0].master_user_secret[0].secret_arn
}

output "db_host" {
  value = local.db_host
}

output "db_port" {
  value = local.db_port
}

output "db_name" {
  value = var.db_name
}

output "db_username" {
  value = var.db_username
}

output "db_secret_arn" {
  value = local.db_secret_arn
}
```

- [ ] **Step 3: Wire the module into `main.tf` and re-export its outputs at the root**

Add to `infra/terraform/main.tf`:

```hcl
module "data" {
  source                = "./modules/data"
  project_name          = var.project_name
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.subnet_ids
  db_security_group_id  = module.network.db_security_group_id
  use_aurora            = var.use_aurora
  db_multi_az           = var.db_multi_az
  db_instance_class     = var.db_instance_class
  db_name               = var.db_name
  db_username           = var.db_username
  tags                  = local.tags
}
```

Add to `infra/terraform/outputs.tf`:

```hcl
output "db_host" {
  value = module.data.db_host
}

output "db_secret_arn" {
  value = module.data.db_secret_arn
}
```

- [ ] **Step 4: Validate both branches of the switch**

Run:

```bash
cd infra/terraform
terraform validate
terraform plan -var="use_aurora=true"
terraform plan -var="use_aurora=false"
```

Expected: `terraform validate` reports `Success!`. The `use_aurora=true` plan shows an `aws_rds_cluster` and `aws_rds_cluster_instance`; the `use_aurora=false` plan shows an `aws_db_instance` instead, with no other resource in the plan differing because of this flag.

- [ ] **Step 5: Commit**

```bash
git add infra/terraform
git commit -m "feat(infra): add data module with Aurora/RDS switch and Secrets Manager credentials"
```

---

### Task 21: Compute module — ECR, ECS Fargate, ALB, autoscaling

**Files:**
- Create: `infra/terraform/modules/compute/{main,variables,outputs}.tf`
- Modify: `infra/terraform/main.tf`, `infra/terraform/outputs.tf`

**Interfaces:**
- Consumes: `vpc_id`, `subnet_ids`, `alb_security_group_id`, `ecs_security_group_id` from `network` (Task 19); `db_host`, `db_port`, `db_name`, `db_username`, `db_secret_arn` from `data` (Task 20).
- Produces: `ecr_repository_url`, `alb_dns_name`, `ecs_cluster_name`, `ecs_service_name`. `alb_dns_name` is what a browser hits; it is the last piece needed to fill in `.env`'s `ALB_DNS_NAME` placeholder from Task 1.

- [ ] **Step 1: Write the module's variables**

`infra/terraform/modules/compute/variables.tf`:

```hcl
variable "project_name" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "alb_security_group_id" { type = string }
variable "ecs_security_group_id" { type = string }
variable "container_port" { type = number }
variable "image_tag" { type = string }
variable "app_version" { type = string }
variable "desired_count" { type = number }
variable "min_capacity" { type = number }
variable "max_capacity" { type = number }
variable "db_host" { type = string }
variable "db_port" { type = number }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_secret_arn" { type = string }
variable "tags" { type = map(string) }
```

- [ ] **Step 2: Write the ECR, IAM lookup, and JWT secret resources**

`infra/terraform/modules/compute/main.tf` (part 1 of 3 — create the file with this content, more is appended in Steps 3–4):

```hcl
resource "aws_ecr_repository" "api" {
  name                 = "${var.project_name}-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  tags                 = var.tags
}

# LabRole is pre-created by AWS Academy — this scaffold never creates an IAM
# role (Learner Lab forbids it). Both the ECS task role and execution role
# point at this same lookup, per Appendix A of the 2026-08-08 spec.
data "aws_iam_role" "lab" {
  name = "LabRole"
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "jwt" {
  name_prefix             = "${var.project_name}-jwt-"
  recovery_window_in_days = 0
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = random_password.jwt_secret.result
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}-api"
  retention_in_days = 7
  tags              = var.tags
}

resource "aws_ecs_cluster" "this" {
  name = "${var.project_name}-cluster"
  tags = var.tags
}
```

- [ ] **Step 3: Append the task definition, ALB, and ECS service**

Append to `infra/terraform/modules/compute/main.tf`:

```hcl
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = data.aws_iam_role.lab.arn
  task_role_arn            = data.aws_iam_role.lab.arn
  tags                     = var.tags

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "APP_VERSION", value = var.app_version },
        { name = "SERVE_STATIC", value = "true" },
        { name = "AUTH_DRIVER", value = "localJwt" },
        { name = "IDENTITY_DRIVER", value = "ecs" },
        { name = "DB_HOST", value = var.db_host },
        { name = "DB_PORT", value = tostring(var.db_port) },
        { name = "DB_NAME", value = var.db_name },
        { name = "DB_USER", value = var.db_username },
      ]
      secrets = [
        { name = "DB_PASSWORD", valueFrom = "${var.db_secret_arn}:password::" },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

resource "aws_lb" "this" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.subnet_ids
  tags               = var.tags
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 15
    timeout             = 5
  }
  tags = var.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.http]
  tags       = var.tags
}
```

- [ ] **Step 4: Append the autoscaling resources**

Append to `infra/terraform/modules/compute/main.tf`:

```hcl
resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.api.name}"
  scalable_dimension  = "ecs:service:DesiredCount"
  min_capacity        = var.min_capacity
  max_capacity        = var.max_capacity
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.project_name}-cpu-target-tracking"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 50
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}
```

`infra/terraform/modules/compute/outputs.tf`:

```hcl
output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  value = aws_ecs_service.api.name
}
```

- [ ] **Step 5: Wire the module into `main.tf` and finalize `outputs.tf`**

Add to `infra/terraform/main.tf`:

```hcl
module "compute" {
  source                 = "./modules/compute"
  project_name           = var.project_name
  region                 = var.region
  vpc_id                 = module.network.vpc_id
  subnet_ids             = module.network.subnet_ids
  alb_security_group_id  = module.network.alb_security_group_id
  ecs_security_group_id  = module.network.ecs_security_group_id
  container_port         = var.container_port
  image_tag               = var.image_tag
  app_version             = var.app_version
  desired_count           = var.desired_count
  min_capacity            = var.min_capacity
  max_capacity            = var.max_capacity
  db_host                 = module.data.db_host
  db_port                 = module.data.db_port
  db_name                 = module.data.db_name
  db_username             = module.data.db_username
  db_secret_arn           = module.data.db_secret_arn
  tags                     = local.tags
}
```

Replace `infra/terraform/outputs.tf` in full:

```hcl
output "region" {
  value = var.region
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "db_host" {
  value = module.data.db_host
}

output "db_secret_arn" {
  value = module.data.db_secret_arn
}

output "ecr_repository_url" {
  value = module.compute.ecr_repository_url
}

output "alb_dns_name" {
  value = module.compute.alb_dns_name
}

output "ecs_cluster_name" {
  value = module.compute.ecs_cluster_name
}

output "ecs_service_name" {
  value = module.compute.ecs_service_name
}
```

- [ ] **Step 6: Validate**

Run:

```bash
cd infra/terraform
terraform validate
terraform plan -var="use_aurora=true"
```

Expected: `terraform validate` reports `Success!`. `terraform plan` succeeds and lists (among the network/data resources from Tasks 19–20) an `aws_ecr_repository`, `aws_ecs_cluster`, `aws_ecs_task_definition`, `aws_ecs_service`, `aws_lb`, `aws_lb_target_group`, `aws_lb_listener`, `aws_appautoscaling_target`, `aws_appautoscaling_policy`, `aws_cloudwatch_log_group`, `aws_secretsmanager_secret` (+ version), `random_password`, and two `data` lookups (`aws_iam_role.lab`, `aws_availability_zones.available`) — no `aws_iam_role` **resource** anywhere in the plan, which is the property that keeps this Learner-Lab-safe.

- [ ] **Step 7: Commit**

```bash
git add infra/terraform
git commit -m "feat(infra): add compute module — ECR, ECS Fargate, ALB, autoscaling"
```

---

### Task 22: Deployment runbook

**Files:**
- Create: `infra/terraform/environments/learnerlab.tfvars`
- Create: `infra/terraform/scripts/build-and-push.sh`
- Create: `docs/RUNBOOK.md`

**Interfaces:**
- Consumes: every Terraform output from Task 21; `.env.example` from Task 1.
- Produces: the operational document the user follows to go from this scaffold to a live Learner Lab deployment — nothing in code depends on this task; it is the handoff artifact between "application side, fully handled" and "AWS side, user-handled" from the chat decision.

- [ ] **Step 1: Write the Learner Lab tfvars**

`infra/terraform/environments/learnerlab.tfvars`:

```hcl
region            = "us-east-1"
use_lab_role      = true
use_aurora        = true   # Try Aurora first. If Learner Lab rejects any Aurora
                            # resource, set this to false and re-apply — every
                            # other value below stays the same, and no
                            # application code changes either way (see
                            # infra/terraform/modules/data/main.tf).
db_multi_az       = false
db_instance_class = "db.t4g.medium"
desired_count     = 2
min_capacity      = 2
max_capacity      = 4
```

- [ ] **Step 2: Write the build-and-push script**

`infra/terraform/scripts/build-and-push.sh` — Terraform never builds images itself (no `null_resource` with `local-exec`, per the original spec's §5.2 convention #4); this script is the explicit build step that hands `terraform apply` a tag to deploy:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/build-and-push.sh <ecr_repository_url> <image_tag>
# Get <ecr_repository_url> from: terraform output -raw ecr_repository_url

REPO_URL="${1:?Usage: build-and-push.sh <ecr_repository_url> <image_tag>}"
TAG="${2:?Usage: build-and-push.sh <ecr_repository_url> <image_tag>}"
REGION="${AWS_REGION:-us-east-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO_URL%%/*}"

docker build -f docker/api.Dockerfile --target prod -t "${REPO_URL}:${TAG}" .
docker push "${REPO_URL}:${TAG}"

echo "Pushed ${REPO_URL}:${TAG}"
echo "Next: terraform apply -var-file=environments/learnerlab.tfvars -var=\"image_tag=${TAG}\""
```

- [ ] **Step 3: Write the runbook**

`docs/RUNBOOK.md`:

```markdown
# Deployment Runbook — AWS Academy Learner Lab

Prerequisites: an active Learner Lab session, AWS CLI configured with the
lab's temporary credentials, Docker, and Terraform ≥1.7.

## 1. Set a budget alarm first

Before the first `terraform apply` — not after. In the Learner Lab console:
AWS Budgets → Create budget → Cost budget → USD 10 → alert at 80%.

## 2. Deploy the network and data tier

    cd infra/terraform
    terraform init
    terraform apply -var-file=environments/learnerlab.tfvars \
      -target=module.network -target=module.data

Note the master credential lives in Secrets Manager
(`terraform output db_secret_arn`) — it is never in `.tfstate` as plaintext
because both the Aurora and RDS resources use `manage_master_user_password`.

If any Aurora resource fails on Learner Lab (residual risk noted in the
2026-08-08 spec's Appendix A.4 — Learner Lab's own restrictions document
does not promise Aurora resource-level behaviour), edit
`environments/learnerlab.tfvars`, set `use_aurora = false`, and re-run the
command above. Nothing else changes.

## 3. Build and push the image

    terraform output -raw ecr_repository_url
    ./scripts/build-and-push.sh "$(terraform output -raw ecr_repository_url)" v1

## 4. Deploy compute

    terraform apply -var-file=environments/learnerlab.tfvars -var="image_tag=v1"

## 5. Fill in `.env` from the outputs

    terraform output

Copy `AWS_REGION`, `ECR_REPOSITORY_URL`, `ALB_DNS_NAME` into your local
`.env` if you want to point local tooling at the live deployment. The
running ECS tasks already have their own environment injected by the task
definition (Task 21) — this step is for your convenience only, not required
for the deployment to work.

## 6. Seed and verify

    curl -X POST "http://$(terraform output -raw alb_dns_name)/api/auth/login" \
      -H 'content-type: application/json' \
      -d '{"email":"doctor.kl@aethelgard.demo","password":"demo1234"}'

The demo users are seeded automatically the first time `runMigrations` and
the app boot — if `/api/auth/demo-users` returns `[]`, run the seed script
once against the live database (see `packages/api/src/scripts/seed.ts`;
point `DATABASE_URL` at the ALB-adjacent database via a bastion or a
temporary local port-forward, since the database itself is not
publicly accessible).

## 7. Capture evidence

    for i in 1 2 3 4 5 6; do
      curl -s -o /dev/null -D - "http://$(terraform output -raw alb_dns_name)/health" | grep -i x-served-by
    done

Then, from the `/infra` page in the browser, use "Burn CPU" repeatedly (or
a small loop of the load endpoint) while watching the ECS service's running
task count in the console — this is Section E's scale-out/scale-in evidence.

## 8. Tear down

    terraform destroy -var-file=environments/learnerlab.tfvars

Mandatory, not optional — Learner Lab may not stop RDS/Aurora when a
session ends, and a stopped RDS instance left seven days restarts itself
automatically (Appendix A.3 of the 2026-08-08 spec). Deploy, seed, capture,
destroy, all inside one session.

## Extension points (out of scope for this plan, additive when needed)

- **Personal AWS account / CDK path:** `use_lab_role` has a hard `validation`
  block requiring `true` in this scaffold. Removing it and adding an
  `aws_iam_role` branch is the extension point described in the
  2026-08-08 spec §3.1 — not built here because the current scope is
  Learner Lab only.
- **Cognito:** `AuthProvider` is a port (Task 4/8) with one implementation.
  A `cognito` adapter plus `AUTH_DRIVER=cognito` is additive.
- **S3 attachments:** `ObjectStore` was deliberately not created in this
  scaffold (2026-08-08 chat decision). Adding it is a new port, a new `s3`
  adapter, one new field on `ServerDeps`, and a new Terraform resource in
  the `data` module — no existing file needs to change shape.
- **RBAC / branch scoping / audit log:** the `role` and `branchId` fields
  already exist on every `Principal` and every `patients`/`encounters` row.
  Enforcement is new middleware (branch predicate in each repository query,
  a permission matrix consulted in `authMiddleware.ts`) — additive, not a
  refactor.
```

- [ ] **Step 4: Commit**

```bash
git add infra/terraform/environments infra/terraform/scripts docs/RUNBOOK.md
git commit -m "docs: add Learner Lab deployment runbook and build-and-push script"
```

---
