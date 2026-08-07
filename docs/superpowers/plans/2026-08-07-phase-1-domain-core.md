# Phase 1 — Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Aethelgard EHR monorepo skeleton, the shared Zod contract, the domain layer, all ports, and in-memory adapters plus the reusable repository contract test suite, so that patient/encounter/observation use cases run and are fully tested with no database and no Docker.

**Architecture:** Ports and adapters. `packages/shared` holds Zod schemas and inferred types consumed by both `api` and (later) `web`. `packages/api/src/domain` holds pure entities, invariants, typed errors and the role-permission matrix with zero external dependencies. `packages/api/src/ports` holds interfaces only. `packages/api/src/services` holds use cases depending only on ports. `packages/api/src/adapters/persistence/memory` holds Map-backed adapters. The repository **contract test suite** written in this phase is the deliverable that Phase 2's Postgres adapters must satisfy unchanged.

**Tech Stack:** TypeScript 5.7+ (ESM, strict), npm workspaces, Zod 4, Vitest 3, tsx. No runtime dependencies in `domain`, `ports`, or `services` beyond `@aethelgard/shared` and `zod`.

## Global Constraints

Exact values from the spec. Every task's requirements implicitly include this section.

- **TypeScript only, never plain JavaScript.** No `.js` source files anywhere except generated output.
- **ESM only.** Every `package.json` sets `"type": "module"`.
- **camelCase for variables and TypeScript properties.** Database columns are `snake_case`; adapters do the mapping.
- **Modular functions/methods.** No file does two unrelated jobs.
- **Explicit failure (spec §2, §12).** No error is caught and discarded. Every failure either propagates as a typed error or is logged with full context before a fallback runs.
- **The dependency rule (spec §3.1) is one-directional:** `http` → `services` → `ports` ← `adapters`. Nothing in `domain/` or `services/` may import from `adapters/`. Nothing in `domain/` or `ports/` may import an AWS SDK type.
- **Node version floor:** `>=22`. Local dev may run newer; the production image is `node:22-alpine` (spec §10.1).
- **Branch codes are exactly `KL`, `PG`, `JB`** (Kuala Lumpur, Penang, Johor Bahru — spec §1.3).
- **Roles are exactly `doctor`, `nurse`, `records_clerk`, `admin`** (spec §4).
- **Observation codes are exactly `heart_rate`, `blood_pressure`, `temperature`, `spo2`, `weight`** (spec §4).
- **Encounter types are exactly `outpatient`, `inpatient`, `emergency`** (spec §4).
- **Attachment statuses are exactly `pending`, `confirmed`** (spec §4).
- **Patients are never hard-deleted** (spec §4). `softDelete` sets `deletedAt`; every read filters it out.
- **Branch scoping lives in the query, not in a handler check** (spec §6.2). Every scoped repository method takes a `BranchScope` and applies it inside the query itself.
- **TDD is mandatory** (spec §13, project rules). RED → GREEN → REFACTOR. Code written before its test gets deleted and redone test-first.
- **Package names:** `@aethelgard/shared`, `@aethelgard/api`.
- **Commit after every task.** Conventional Commits (`feat:`, `test:`, `chore:`).

## Documented Deviations From The Spec

Three, all deliberate. Carry them into the report's implementation section.

1. **A ninth port, `BranchRepository`, is added** beyond the eight in spec §3.2. `patients.branch_id` is a foreign key to `branches`, and MRN generation needs the branch *code* for the prefix while `Principal` carries the branch *id*. Without a branch lookup the code→id mapping would have to be hard-coded in the service layer, which breaks the "configuration over code" principle. Interface is read-only (`listAll`, `findById`, `findByCode`) — branches are reference data seeded by migration.
2. **`Principal` carries `branchId` only**, per spec §6.1 ("subject, role, and branch"). Branch code is resolved through `BranchRepository`, never stuffed into the token.
3. **Services do not enforce role permissions; they enforce branch scope.** Spec §6.2 states role permissions are enforced "in middleware rather than in handlers", which lands them in Phase 3. This phase ships the pure `can(role, permission)` matrix that Phase 3's middleware will call, and services enforce only the branch constraint (which cannot live in middleware because it is a query predicate).

Two additions to the configuration surface of spec §3.3, both required and both flagged in Task 14: `S3_REGION` (the AWS SDK cannot presign without a region) and `APP_VERSION` (spec §8 requires `/api/meta` to report an application version).

## File Structure

```
demo-app/
  package.json                                 npm workspaces root, shared scripts
  tsconfig.base.json                           strict compiler options, inherited by all packages
  .gitignore
  .nvmrc
  packages/
    shared/
      package.json
      tsconfig.json
      vitest.config.ts
      src/
        index.ts                               barrel — the entire public surface
        enums.ts                               branch codes, roles, sexes, encounter/observation/attachment enums
        pagination.ts                          PaginationQuery schema + Page<T> type
        branch.ts                              Branch schema
        patient.ts                             Patient + create/update input schemas, MRN schema
        encounter.ts                           Encounter + create/patch input schemas
        observation.ts                         Observation + create input schema
        attachment.ts                          Attachment + create/confirm input schemas
        auth.ts                                Principal, LoginInput, DemoUser schemas
      test/
        enums.test.ts
        schemas.test.ts
    api/
      package.json
      tsconfig.json
      vitest.config.ts
      src/
        domain/
          errors.ts                            typed error hierarchy (spec §12)
          patient.ts                           patient invariants + MRN generation
          encounter.ts                         encounter invariants (discharge rules)
          observation.ts                       observation value invariants per code
          permissions.ts                       role → permission matrix (spec §6.2)
          scope.ts                             BranchScope + derivation from a Principal
        ports/
          index.ts                             barrel
          branchRepository.ts
          patientRepository.ts
          encounterRepository.ts
          observationRepository.ts
          attachmentRepository.ts
          auditLog.ts
          objectStore.ts
          authProvider.ts
          instanceIdentity.ts
        services/
          patientService.ts
          encounterService.ts
          observationService.ts
        adapters/persistence/memory/
          store.ts                             shared Map-backed store + factory
          branchRepository.ts
          patientRepository.ts
          encounterRepository.ts
          observationRepository.ts
          attachmentRepository.ts
          auditLog.ts
        config/
          env.ts                               Zod-validated environment schema (spec §3.3)
      test/
        fixtures/ids.ts                        fixed UUIDs shared by memory and (Phase 2) Postgres harnesses
        fixtures/principals.ts                 Principal builders per role
        contracts/harness.ts                   RepositoryHarness / HarnessContext types
        contracts/branchRepository.contract.ts
        contracts/patientRepository.contract.ts
        contracts/encounterRepository.contract.ts
        contracts/observationRepository.contract.ts
        contracts/attachmentRepository.contract.ts
        contracts/auditLog.contract.ts
        memory/memoryHarness.ts                the memory implementation of RepositoryHarness
        memory/contracts.test.ts               runs every contract suite against memory
        domain/*.test.ts
        services/*.test.ts
        config/env.test.ts
```

`packages/web` and everything under `packages/api/src/http`, `src/adapters/storage`, `src/adapters/auth`, `src/adapters/identity` and `src/composition.ts` are **out of scope for this phase** — they arrive in Phases 3–5. Do not create them.

---

### Task 1: Monorepo scaffold and shared enums

Scaffolding is folded into this task because the enum schemas are the first thing that needs a test runner.

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/enums.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/test/enums.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `branchCodeSchema`/`BranchCode`, `roleSchema`/`Role`, `sexSchema`/`Sex`, `encounterTypeSchema`/`EncounterType`, `encounterStatusSchema`/`EncounterStatus`, `observationCodeSchema`/`ObservationCode`, `attachmentStatusSchema`/`AttachmentStatus`, and the `BRANCH_CODES`, `ROLES`, `SEXES`, `ENCOUNTER_TYPES`, `ENCOUNTER_STATUSES`, `OBSERVATION_CODES`, `ATTACHMENT_STATUSES` const tuples — all from `@aethelgard/shared`.

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
    "typecheck": "npm run typecheck --workspaces --if-present"
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

`verbatimModuleSyntax` is on, so **every type-only import must be written `import type { ... }`**. A plain `import { SomeType }` will fail the build. This applies to every code block in this plan.

`.gitignore`:

```
node_modules/
dist/
coverage/
.env
.env.local
*.log
```

`.nvmrc`:

```
22
```

- [ ] **Step 2: Create the shared package**

`packages/shared/package.json`:

```json
{
  "name": "@aethelgard/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: succeeds, creates `node_modules/` and `package-lock.json`, symlinks `packages/shared` into `node_modules/@aethelgard/shared`.

- [ ] **Step 4: Write the failing test**

`packages/shared/test/enums.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_STATUSES,
  BRANCH_CODES,
  ENCOUNTER_STATUSES,
  ENCOUNTER_TYPES,
  OBSERVATION_CODES,
  ROLES,
  attachmentStatusSchema,
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

  it('pins the two attachment statuses', () => {
    expect(ATTACHMENT_STATUSES).toEqual(['pending', 'confirmed']);
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

  it('rejects an attachment status outside the two-step upload flow', () => {
    expect(attachmentStatusSchema.parse('pending')).toBe('pending');
    expect(attachmentStatusSchema.safeParse('deleted').success).toBe(false);
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

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -w @aethelgard/shared`
Expected: FAIL — `Failed to resolve import "../src/index.js"` (the file does not exist yet).

- [ ] **Step 6: Write the minimal implementation**

`packages/shared/src/enums.ts`:

```ts
import { z } from 'zod';

/** Aethelgard's three campuses (spec §1.3). Order is stable — the UI renders it. */
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

export const ATTACHMENT_STATUSES = ['pending', 'confirmed'] as const;
export const attachmentStatusSchema = z.enum(ATTACHMENT_STATUSES);
export type AttachmentStatus = z.infer<typeof attachmentStatusSchema>;
```

`packages/shared/src/index.ts`:

```ts
export * from './enums.js';
```

Import specifiers carry the `.js` extension even though the files are `.ts` — this is what keeps the same source valid under both `moduleResolution: bundler` and a future Node ESM resolution.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -w @aethelgard/shared`
Expected: PASS — 13 tests.

- [ ] **Step 8: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/shared`
Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore .nvmrc packages/shared
git commit -m "feat(shared): scaffold monorepo and pin clinical enum vocabulary"
```

---

### Task 2: Shared entity schemas

**Files:**
- Create: `packages/shared/src/pagination.ts`, `packages/shared/src/branch.ts`, `packages/shared/src/patient.ts`, `packages/shared/src/encounter.ts`, `packages/shared/src/observation.ts`, `packages/shared/src/attachment.ts`, `packages/shared/src/auth.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/schemas.test.ts`

**Interfaces:**
- Consumes: every enum schema from Task 1.
- Produces, all exported from `@aethelgard/shared`:
  - `paginationQuerySchema`, `PaginationQuery` = `{ page: number; pageSize: number }`, `Page<T>` = `{ items: T[]; page: number; pageSize: number; total: number }`
  - `branchSchema`, `Branch` = `{ id: string; code: BranchCode; name: string }`
  - `mrnSchema`, `patientSchema`, `Patient`, `createPatientSchema`, `CreatePatientInput`, `updatePatientSchema`, `UpdatePatientInput`
  - `encounterSchema`, `Encounter`, `createEncounterSchema`, `CreateEncounterInput`, `patchEncounterSchema`, `PatchEncounterInput`
  - `observationSchema`, `Observation`, `createObservationSchema`, `CreateObservationInput`
  - `attachmentSchema`, `Attachment`, `createAttachmentSchema`, `CreateAttachmentInput`, `confirmAttachmentSchema`, `ConfirmAttachmentInput`
  - `principalSchema`, `Principal` = `{ userId: string; email: string; role: Role; branchId: string }`, `loginSchema`, `LoginInput`, `demoUserSchema`, `DemoUser`

- [ ] **Step 1: Write the failing test**

`packages/shared/test/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  attachmentSchema,
  createAttachmentSchema,
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

  it('rejects a zero or negative page', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
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

  it('accepts a soft-deleted patient', () => {
    expect(patientSchema.parse({ ...valid, deletedAt: NOW }).deletedAt).toBe(NOW);
  });

  it('rejects a date of birth that is not a calendar date', () => {
    expect(patientSchema.safeParse({ ...valid, dob: NOW }).success).toBe(false);
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

  it('allows an admin to name the target branch', () => {
    const parsed = createPatientSchema.parse({
      name: 'Tan Wei Ming',
      dob: '1990-01-01',
      sex: 'male',
      phone: '+60129876543',
      branchId: UUID_B,
    });
    expect(parsed.branchId).toBe(UUID_B);
  });

  it('rejects a missing phone number', () => {
    expect(
      createPatientSchema.safeParse({
        name: 'Tan Wei Ming',
        dob: '1990-01-01',
        sex: 'male',
      }).success,
    ).toBe(false);
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

  it('rejects an attempt to patch the branch', () => {
    const parsed = updatePatientSchema.parse({ name: 'X', branchId: UUID_A });
    expect(parsed).not.toHaveProperty('branchId');
  });
});

describe('encounterSchema', () => {
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

  it('accepts an open encounter with no discharge timestamp', () => {
    expect(encounterSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown department of empty string', () => {
    expect(encounterSchema.safeParse({ ...valid, department: '' }).success).toBe(false);
  });
});

describe('createEncounterSchema', () => {
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

describe('attachment schemas', () => {
  it('accepts a pending attachment with an unknown size', () => {
    const pending = {
      id: UUID_A,
      encounterId: UUID_B,
      filename: 'discharge-summary.pdf',
      contentType: 'application/pdf',
      sizeBytes: null,
      storageKey: 'encounters/22222222/att-11111111.pdf',
      status: 'pending',
      uploadedBy: UUID_B,
      uploadedAt: NOW,
    };
    expect(attachmentSchema.parse(pending)).toEqual(pending);
  });

  it('requires a filename and content type to request an upload URL', () => {
    expect(
      createAttachmentSchema.parse({
        filename: 'scan.png',
        contentType: 'image/png',
      }),
    ).toEqual({ filename: 'scan.png', contentType: 'image/png' });
    expect(createAttachmentSchema.safeParse({ filename: 'scan.png' }).success).toBe(false);
  });
});

describe('auth schemas', () => {
  it('accepts a principal carrying branch identity but not branch code', () => {
    const principal = { userId: UUID_A, email: 'doc.kl@aethelgard.demo', role: 'doctor', branchId: UUID_B };
    expect(principalSchema.parse(principal)).toEqual(principal);
  });

  it('rejects a malformed login email', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'demo1234' }).success).toBe(
      false,
    );
  });

  it('rejects a password shorter than eight characters', () => {
    expect(loginSchema.safeParse({ email: 'a@b.dev', password: 'short' }).success).toBe(false);
  });

  it('exposes no secret on a demo user entry', () => {
    const demoUser = {
      email: 'doc.kl@aethelgard.demo',
      role: 'doctor',
      branchCode: 'KL',
      displayName: 'Dr Lim (Kuala Lumpur)',
    };
    expect(demoUserSchema.parse(demoUser)).toEqual(demoUser);
    expect(
      demoUserSchema.parse({ ...demoUser, password: 'leaked' }),
    ).not.toHaveProperty('password');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @aethelgard/shared`
Expected: FAIL — `paginationQuerySchema` and the other new exports are not exported from `../src/index.js`.

- [ ] **Step 3: Write the schema modules**

`packages/shared/src/pagination.ts`:

```ts
import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** A single page of results. `total` is the unpaged count matching the query. */
export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
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

/** Two uppercase branch letters, a hyphen, six digits — e.g. KL-000123. */
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

/**
 * MRN is never client-supplied — the server derives it from the branch.
 * `branchId` is admin-only; the service rejects it for every other role.
 */
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

`.strip()` is Zod's default object behaviour; it is written explicitly here because the tests assert that `mrn` and `branchId` are dropped rather than rejected, and an accidental `.passthrough()` would silently break branch scoping.

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

/**
 * Shape-level check only: exactly one of valueNum / valueText must be present.
 * Clinical range checking lives in the API's domain layer, not in the wire schema,
 * because it is a rule about the observation code and belongs with the entity.
 */
export const createObservationSchema = z
  .object({
    code: observationCodeSchema,
    valueNum: z.number().optional(),
    valueText: z.string().min(1).max(200).optional(),
    unit: z.string().max(20).optional(),
    recordedAt: z.iso.datetime().optional(),
  })
  .strip()
  .refine(
    (input) => input.valueNum !== undefined || input.valueText !== undefined,
    { message: 'An observation must carry either valueNum or valueText' },
  );
export type CreateObservationInput = z.infer<typeof createObservationSchema>;
```

`packages/shared/src/attachment.ts`:

```ts
import { z } from 'zod';
import { attachmentStatusSchema } from './enums.js';

export const attachmentSchema = z.object({
  id: z.uuid(),
  encounterId: z.uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().nonnegative().nullable(),
  storageKey: z.string().min(1).max(512),
  status: attachmentStatusSchema,
  uploadedBy: z.uuid(),
  uploadedAt: z.iso.datetime(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const createAttachmentSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1).max(120),
  })
  .strip();
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;

export const confirmAttachmentSchema = z
  .object({
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .strip();
export type ConfirmAttachmentInput = z.infer<typeof confirmAttachmentSchema>;
```

`packages/shared/src/auth.ts`:

```ts
import { z } from 'zod';
import { branchCodeSchema, roleSchema } from './enums.js';

/** The internal identity both AuthProvider implementations produce (spec §6.1). */
export const principalSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  role: roleSchema,
  branchId: z.uuid(),
});
export type Principal = z.infer<typeof principalSchema>;

export const loginSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8).max(200),
  })
  .strip();
export type LoginInput = z.infer<typeof loginSchema>;

/** Non-secret identifiers only — this is what GET /api/auth/demo-users returns (spec §5). */
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
export * from './attachment.js';
export * from './auth.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @aethelgard/shared`
Expected: PASS — all enum tests plus the new schema tests.

- [ ] **Step 5: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/shared`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add entity, pagination and auth Zod schemas"
```

---

### Task 3: Domain typed error hierarchy

**Files:**
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/vitest.config.ts`
- Create: `packages/api/src/domain/errors.ts`
- Test: `packages/api/test/domain/errors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `src/domain/errors.ts`: abstract `DomainError` with `readonly code: string`, `readonly httpStatus: number`, `readonly details: Record<string, unknown>`; concrete `NotFoundError(entityType: string, id: string)`, `ValidationError(message: string, details?: Record<string, unknown>)`, `ForbiddenError(message?: string)`, `ConflictError(message: string, details?: Record<string, unknown>)`, `UpstreamError(message: string, cause: unknown)`; and the type guard `isDomainError(value: unknown): value is DomainError`.

- [ ] **Step 1: Create the api package**

`packages/api/package.json`:

```json
{
  "name": "@aethelgard/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@aethelgard/shared": "*",
    "zod": "^4.0.0"
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
    "paths": {
      "@aethelgard/shared": ["../shared/src/index.ts"]
    }
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/api/vitest.config.ts`:

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
    include: ['test/**/*.test.ts'],
  },
});
```

The tsconfig `paths` entry and the Vitest `resolve.alias` entry must stay in step — the compiler uses the first, the runner uses the second. Phase 6 replaces both with a real build; until then no build step is needed to run the API's tests.

- [ ] **Step 2: Install so the workspace link exists**

Run: `npm install`
Expected: succeeds, `node_modules/@aethelgard/api` symlink created.

- [ ] **Step 3: Write the failing test**

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
  });

  it('names the entity and id in both the message and the details', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error.message).toBe('patient abc was not found');
    expect(error.details).toEqual({ entityType: 'patient', id: 'abc' });
  });

  it('is a real Error subclass so stack traces and instanceof both work', () => {
    const error = new NotFoundError('patient', 'abc');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('NotFoundError');
    expect(error.stack).toContain('NotFoundError');
  });
});

describe('ValidationError', () => {
  it('carries a 400 status and field-level detail', () => {
    const error = new ValidationError('heart_rate must be between 20 and 300 bpm', {
      field: 'valueNum',
      received: 900,
    });
    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual({ field: 'valueNum', received: 900 });
  });

  it('defaults details to an empty object rather than undefined', () => {
    expect(new ValidationError('bad').details).toEqual({});
  });
});

describe('ForbiddenError', () => {
  it('carries a 403 status', () => {
    expect(new ForbiddenError().httpStatus).toBe(403);
    expect(new ForbiddenError().code).toBe('FORBIDDEN');
  });

  it('uses a message that does not disclose whether the resource exists', () => {
    expect(new ForbiddenError().message).toBe('Access denied');
  });

  it('never carries details, so a caller cannot leak identifiers through it', () => {
    expect(new ForbiddenError('custom reason').details).toEqual({});
  });
});

describe('ConflictError', () => {
  it('carries a 409 status', () => {
    const error = new ConflictError('MRN already assigned', { mrn: 'KL-000123' });
    expect(error.httpStatus).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.details).toEqual({ mrn: 'KL-000123' });
  });
});

describe('UpstreamError', () => {
  it('carries a 502 status and preserves the underlying cause', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new UpstreamError('object store unreachable', cause);
    expect(error.httpStatus).toBe(502);
    expect(error.code).toBe('UPSTREAM_FAILED');
    expect(error.cause).toBe(cause);
  });
});

describe('isDomainError', () => {
  it('recognises every concrete domain error', () => {
    expect(isDomainError(new NotFoundError('patient', 'a'))).toBe(true);
    expect(isDomainError(new ForbiddenError())).toBe(true);
  });

  it('rejects a plain Error and a non-error value', () => {
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(isDomainError('boom')).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -w @aethelgard/api`
Expected: FAIL — cannot resolve `../../src/domain/errors.js`.

- [ ] **Step 5: Write the implementation**

`packages/api/src/domain/errors.ts`:

```ts
/**
 * The typed error hierarchy of spec §12. A single HTTP middleware (Phase 3)
 * translates these into the wire error body; nothing else inspects them by name.
 * `details` is safe to send to a client. Anything unsafe belongs in the log line.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  protected constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    // Keeps the constructor frame out of the trace so the throw site is line one.
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

/**
 * Denial carries no details by construction: spec §6.2 requires a 403 to say
 * nothing about whether the resource exists.
 */
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

/** A dependency outside this process failed. The cause is logged, never returned. */
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

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -w @aethelgard/api`
Expected: PASS — 12 tests.

- [ ] **Step 7: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add packages/api package.json package-lock.json
git commit -m "feat(api): add typed domain error hierarchy"
```

---

### Task 4: Domain invariants

The clinical rules that hold regardless of transport or storage. Pure functions, no I/O, no dependencies beyond `@aethelgard/shared` types and the error hierarchy.

**Files:**
- Create: `packages/api/src/domain/patient.ts`, `packages/api/src/domain/encounter.ts`, `packages/api/src/domain/observation.ts`
- Test: `packages/api/test/domain/patient.test.ts`, `packages/api/test/domain/encounter.test.ts`, `packages/api/test/domain/observation.test.ts`

**Interfaces:**
- Consumes: `BranchCode`, `Encounter`, `PatchEncounterInput`, `CreateObservationInput`, `EncounterStatus`, `ObservationCode` from `@aethelgard/shared`; `ConflictError`, `ValidationError` from `../domain/errors.js`.
- Produces:
  - `src/domain/patient.ts` — `formatMrn(branchCode: BranchCode, sequence: number): string`, `generateMrnCandidate(branchCode: BranchCode, randomSequence?: () => number): string`, `assertValidDateOfBirth(dob: string, today: Date): void`
  - `src/domain/encounter.ts` — `type EncounterTransition = { department?: string; status?: EncounterStatus; dischargedAt?: string | null }`, `resolveEncounterTransition(encounter: Encounter, patch: PatchEncounterInput, now: string): EncounterTransition`
  - `src/domain/observation.ts` — `type ObservationValue = { valueNum: number | null; valueText: string | null; unit: string | null }`, `resolveObservationValue(input: CreateObservationInput): ObservationValue`

- [ ] **Step 1: Write the failing patient invariant test**

`packages/api/test/domain/patient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mrnSchema } from '@aethelgard/shared';
import { ValidationError } from '../../src/domain/errors.js';
import {
  assertValidDateOfBirth,
  formatMrn,
  generateMrnCandidate,
} from '../../src/domain/patient.js';

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
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(mrnSchema.safeParse(generateMrnCandidate('KL')).success).toBe(true);
    }
  });
});

describe('assertValidDateOfBirth', () => {
  const today = new Date('2026-08-07T00:00:00.000Z');

  it('accepts a date in the past', () => {
    expect(() => assertValidDateOfBirth('1985-03-14', today)).not.toThrow();
  });

  it('accepts today', () => {
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

  it('names the offending field in the error details', () => {
    try {
      assertValidDateOfBirth('2030-01-01', today);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toMatchObject({ field: 'dob' });
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/domain/patient.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/patient.js`.

- [ ] **Step 3: Implement the patient invariants**

`packages/api/src/domain/patient.ts`:

```ts
import type { BranchCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

const MRN_DIGITS = 6;
const MRN_MAX_SEQUENCE = 10 ** MRN_DIGITS - 1;
const EARLIEST_PLAUSIBLE_DOB = '1900-01-01';

/** `KL` + `-` + six zero-padded digits. The branch prefix is what makes an MRN readable on a ward. */
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

/**
 * Candidate only. The unique constraint on `patients.mrn` is the authority;
 * PatientService retries on ConflictError. The source is injectable so the
 * collision path can be tested without stubbing Math.random.
 */
export const generateMrnCandidate = (
  branchCode: BranchCode,
  sequenceSource: () => number = randomSequence,
): string => formatMrn(branchCode, sequenceSource());

/** ISO calendar date, not in the future, not absurdly old. */
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
    throw new ValidationError('Date of birth cannot be in the future', {
      field: 'dob',
      received: dob,
    });
  }
  if (parsed < Date.parse(`${EARLIEST_PLAUSIBLE_DOB}T00:00:00.000Z`)) {
    throw new ValidationError(`Date of birth cannot be earlier than ${EARLIEST_PLAUSIBLE_DOB}`, {
      field: 'dob',
      received: dob,
    });
  }
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/domain/patient.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Write the failing encounter invariant test**

`packages/api/test/domain/encounter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Encounter } from '@aethelgard/shared';
import { ConflictError, ValidationError } from '../../src/domain/errors.js';
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

  it('rejects a discharge timestamp on an encounter that is not being discharged', () => {
    expect(() =>
      resolveEncounterTransition(openEncounter, { dischargedAt: NOW }, NOW),
    ).toThrow(ValidationError);
  });

  it('clears the discharge timestamp when an encounter is cancelled', () => {
    expect(resolveEncounterTransition(openEncounter, { status: 'cancelled' }, NOW)).toEqual({
      status: 'cancelled',
      dischargedAt: null,
    });
  });

  it('refuses to modify an already discharged encounter', () => {
    const discharged: Encounter = {
      ...openEncounter,
      status: 'discharged',
      dischargedAt: '2026-08-06T10:00:00.000Z',
    };
    expect(() => resolveEncounterTransition(discharged, { department: 'ICU' }, NOW)).toThrow(
      ConflictError,
    );
  });

  it('refuses to modify a cancelled encounter', () => {
    const cancelled: Encounter = { ...openEncounter, status: 'cancelled' };
    expect(() => resolveEncounterTransition(cancelled, { status: 'discharged' }, NOW)).toThrow(
      ConflictError,
    );
  });

  it('refuses to reopen by restating the open status', () => {
    expect(() => resolveEncounterTransition(openEncounter, { status: 'open' }, NOW)).toThrow(
      ConflictError,
    );
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/domain/encounter.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/encounter.js`.

- [ ] **Step 7: Implement the encounter invariants**

`packages/api/src/domain/encounter.ts`:

```ts
import type { Encounter, EncounterStatus, PatchEncounterInput } from '@aethelgard/shared';
import { ConflictError, ValidationError } from './errors.js';

/** The normalised change set a repository should apply. Never partially valid. */
export type EncounterTransition = {
  department?: string;
  status?: EncounterStatus;
  dischargedAt?: string | null;
};

const TERMINAL_STATUSES: readonly EncounterStatus[] = ['discharged', 'cancelled'];

/**
 * Validates a PATCH against the encounter's current state and returns the
 * change set to persist. Throws rather than returning a partial result, so a
 * caller can never write half a transition.
 */
export const resolveEncounterTransition = (
  encounter: Encounter,
  patch: PatchEncounterInput,
  now: string,
): EncounterTransition => {
  if (TERMINAL_STATUSES.includes(encounter.status)) {
    throw new ConflictError(`Encounter is ${encounter.status} and can no longer be modified`, {
      encounterId: encounter.id,
      status: encounter.status,
    });
  }

  const transition: EncounterTransition = {};

  if (patch.department !== undefined) {
    transition.department = patch.department;
  }

  if (patch.status === 'open') {
    throw new ConflictError('An encounter cannot be reopened', { encounterId: encounter.id });
  }

  if (patch.status === 'discharged') {
    const dischargedAt = patch.dischargedAt ?? now;
    if (Date.parse(dischargedAt) < Date.parse(encounter.admittedAt)) {
      throw new ValidationError('Discharge cannot precede admission', {
        field: 'dischargedAt',
        admittedAt: encounter.admittedAt,
        received: dischargedAt,
      });
    }
    transition.status = 'discharged';
    transition.dischargedAt = dischargedAt;
  } else if (patch.status === 'cancelled') {
    transition.status = 'cancelled';
    transition.dischargedAt = null;
  } else if (patch.dischargedAt !== undefined) {
    throw new ValidationError('dischargedAt may only be set when discharging an encounter', {
      field: 'dischargedAt',
    });
  }

  return transition;
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/domain/encounter.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 9: Write the failing observation invariant test**

`packages/api/test/domain/observation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/errors.js';
import { resolveObservationValue } from '../../src/domain/observation.js';

describe('resolveObservationValue — numeric codes', () => {
  it('accepts a plausible heart rate and defaults its unit', () => {
    expect(resolveObservationValue({ code: 'heart_rate', valueNum: 72 })).toEqual({
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
    });
  });

  it('keeps a caller-supplied unit', () => {
    expect(resolveObservationValue({ code: 'weight', valueNum: 68.4, unit: 'kg' })).toEqual({
      valueNum: 68.4,
      valueText: null,
      unit: 'kg',
    });
  });

  it.each([
    ['heart_rate', 19],
    ['heart_rate', 301],
    ['temperature', 24.9],
    ['temperature', 45.1],
    ['spo2', -1],
    ['spo2', 101],
    ['weight', 0.4],
    ['weight', 501],
  ] as const)('rejects %s outside its clinical range (%s)', (code, valueNum) => {
    expect(() => resolveObservationValue({ code, valueNum })).toThrow(ValidationError);
  });

  it.each(['heart_rate', 'temperature', 'spo2', 'weight'] as const)(
    'rejects a textual value for the numeric code %s',
    (code) => {
      expect(() => resolveObservationValue({ code, valueText: '72' })).toThrow(ValidationError);
    },
  );
});

describe('resolveObservationValue — blood pressure', () => {
  it('accepts a systolic/diastolic reading and defaults its unit', () => {
    expect(resolveObservationValue({ code: 'blood_pressure', valueText: '120/80' })).toEqual({
      valueNum: null,
      valueText: '120/80',
      unit: 'mmHg',
    });
  });

  it('rejects a numeric blood pressure', () => {
    expect(() => resolveObservationValue({ code: 'blood_pressure', valueNum: 120 })).toThrow(
      ValidationError,
    );
  });

  it.each(['120', '120-80', '12/8', '1200/80', 'high'])(
    'rejects the malformed reading %s',
    (valueText) => {
      expect(() => resolveObservationValue({ code: 'blood_pressure', valueText })).toThrow(
        ValidationError,
      );
    },
  );

  it('rejects a diastolic value at or above the systolic value', () => {
    expect(() => resolveObservationValue({ code: 'blood_pressure', valueText: '80/120' })).toThrow(
      ValidationError,
    );
    expect(() => resolveObservationValue({ code: 'blood_pressure', valueText: '90/90' })).toThrow(
      ValidationError,
    );
  });
});

describe('resolveObservationValue — error detail', () => {
  it('names the offending field and the observation code', () => {
    try {
      resolveObservationValue({ code: 'spo2', valueNum: 250 });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toMatchObject({
        field: 'valueNum',
        code: 'spo2',
      });
    }
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/domain/observation.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/observation.js`.

- [ ] **Step 11: Implement the observation invariants**

`packages/api/src/domain/observation.ts`:

```ts
import type { CreateObservationInput, ObservationCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

/** What a repository stores: exactly one of valueNum / valueText is non-null. */
export type ObservationValue = {
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
};

type NumericRule = { kind: 'numeric'; min: number; max: number; unit: string };
type TextRule = { kind: 'text'; unit: string };

/** Clinical plausibility bounds for the five demo vital signs (spec §4). */
const RULES: Record<ObservationCode, NumericRule | TextRule> = {
  heart_rate: { kind: 'numeric', min: 20, max: 300, unit: 'bpm' },
  temperature: { kind: 'numeric', min: 25, max: 45, unit: '°C' },
  spo2: { kind: 'numeric', min: 0, max: 100, unit: '%' },
  weight: { kind: 'numeric', min: 0.5, max: 500, unit: 'kg' },
  blood_pressure: { kind: 'text', unit: 'mmHg' },
};

const BLOOD_PRESSURE_PATTERN = /^(\d{2,3})\/(\d{2,3})$/;

const resolveNumeric = (
  code: ObservationCode,
  rule: NumericRule,
  input: CreateObservationInput,
): ObservationValue => {
  if (input.valueText !== undefined) {
    throw new ValidationError(`${code} is a numeric observation and cannot carry valueText`, {
      field: 'valueText',
      code,
    });
  }
  const valueNum = input.valueNum;
  if (valueNum === undefined || !Number.isFinite(valueNum)) {
    throw new ValidationError(`${code} requires a finite valueNum`, { field: 'valueNum', code });
  }
  if (valueNum < rule.min || valueNum > rule.max) {
    throw new ValidationError(
      `${code} must be between ${rule.min} and ${rule.max} ${rule.unit}`,
      { field: 'valueNum', code, received: valueNum },
    );
  }
  return { valueNum, valueText: null, unit: input.unit ?? rule.unit };
};

const resolveBloodPressure = (
  rule: TextRule,
  input: CreateObservationInput,
): ObservationValue => {
  if (input.valueNum !== undefined) {
    throw new ValidationError('blood_pressure is recorded as systolic/diastolic text', {
      field: 'valueNum',
      code: 'blood_pressure',
    });
  }
  const match = input.valueText === undefined ? null : BLOOD_PRESSURE_PATTERN.exec(input.valueText);
  if (match === null) {
    throw new ValidationError('blood_pressure must be formatted as systolic/diastolic, e.g. 120/80', {
      field: 'valueText',
      code: 'blood_pressure',
      received: input.valueText ?? null,
    });
  }
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (diastolic >= systolic) {
    throw new ValidationError('Diastolic pressure must be lower than systolic pressure', {
      field: 'valueText',
      code: 'blood_pressure',
      received: input.valueText,
    });
  }
  return { valueNum: null, valueText: `${systolic}/${diastolic}`, unit: input.unit ?? rule.unit };
};

/**
 * Normalises a create request into storable columns, applying the per-code rules.
 * The shared Zod schema has already guaranteed at least one value is present;
 * this decides which one is *correct* for the code.
 */
export const resolveObservationValue = (input: CreateObservationInput): ObservationValue => {
  const rule = RULES[input.code];
  return rule.kind === 'numeric'
    ? resolveNumeric(input.code, rule, input)
    : resolveBloodPressure(rule, input);
};
```

- [ ] **Step 12: Run the whole suite to verify it passes**

Run: `npm test -w @aethelgard/api`
Expected: PASS — errors, patient, encounter and observation suites all green.

- [ ] **Step 13: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 14: Commit**

```bash
git add packages/api
git commit -m "feat(api): add patient, encounter and observation domain invariants"
```

---

### Task 5: Role permissions and branch scope

The two authorisation mechanisms of spec §6.2, expressed as pure functions. Phase 3's middleware calls `can`; this phase's services call `branchScopeFor`.

**Files:**
- Create: `packages/api/src/domain/permissions.ts`, `packages/api/src/domain/scope.ts`
- Test: `packages/api/test/domain/permissions.test.ts`, `packages/api/test/domain/scope.test.ts`

**Interfaces:**
- Consumes: `Role`, `Principal` from `@aethelgard/shared`; `ForbiddenError` from `./errors.js`.
- Produces:
  - `src/domain/permissions.ts` — `type Permission` (the union below), `PERMISSIONS: readonly Permission[]`, `can(role: Role, permission: Permission): boolean`, `requirePermission(role: Role, permission: Permission): void` (throws `ForbiddenError`)
  - `src/domain/scope.ts` — `type BranchScope = { kind: 'all' } | { kind: 'branch'; branchId: string }`, `branchScopeFor(principal: Principal): BranchScope`, `assertBranchWritable(principal: Principal, branchId: string): void`

The `Permission` union is exactly:

```
'patient:read' | 'patient:write' |
'encounter:read' | 'encounter:write' |
'observation:read' | 'observation:write' |
'attachment:read' | 'attachment:write' |
'infra:admin'
```

- [ ] **Step 1: Write the failing permissions test**

`packages/api/test/domain/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ROLES } from '@aethelgard/shared';
import { ForbiddenError } from '../../src/domain/errors.js';
import { PERMISSIONS, can, requirePermission } from '../../src/domain/permissions.js';

describe('admin', () => {
  it('holds every permission including the infra controls', () => {
    for (const permission of PERMISSIONS) {
      expect(can('admin', permission)).toBe(true);
    }
  });
});

describe('doctor', () => {
  it('holds full clinical read/write', () => {
    for (const permission of PERMISSIONS.filter((p) => p !== 'infra:admin')) {
      expect(can('doctor', permission)).toBe(true);
    }
  });

  it('does not hold the infra controls', () => {
    expect(can('doctor', 'infra:admin')).toBe(false);
  });
});

describe('nurse', () => {
  it('reads patients and encounters', () => {
    expect(can('nurse', 'patient:read')).toBe(true);
    expect(can('nurse', 'encounter:read')).toBe(true);
  });

  it('writes observations and nothing else', () => {
    expect(can('nurse', 'observation:write')).toBe(true);
    expect(can('nurse', 'patient:write')).toBe(false);
    expect(can('nurse', 'encounter:write')).toBe(false);
    expect(can('nurse', 'attachment:write')).toBe(false);
  });

  it('does not hold the infra controls', () => {
    expect(can('nurse', 'infra:admin')).toBe(false);
  });
});

describe('records_clerk', () => {
  it('performs full patient CRUD', () => {
    expect(can('records_clerk', 'patient:read')).toBe(true);
    expect(can('records_clerk', 'patient:write')).toBe(true);
  });

  it('reads clinical records but never writes them', () => {
    expect(can('records_clerk', 'encounter:read')).toBe(true);
    expect(can('records_clerk', 'observation:read')).toBe(true);
    expect(can('records_clerk', 'attachment:read')).toBe(true);
    expect(can('records_clerk', 'encounter:write')).toBe(false);
    expect(can('records_clerk', 'observation:write')).toBe(false);
    expect(can('records_clerk', 'attachment:write')).toBe(false);
  });

  it('does not hold the infra controls', () => {
    expect(can('records_clerk', 'infra:admin')).toBe(false);
  });
});

describe('matrix completeness', () => {
  it('answers for every role and permission pair without throwing', () => {
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        expect(typeof can(role, permission)).toBe('boolean');
      }
    }
  });
});

describe('requirePermission', () => {
  it('returns silently when the role holds the permission', () => {
    expect(() => requirePermission('doctor', 'observation:write')).not.toThrow();
  });

  it('throws ForbiddenError when it does not', () => {
    expect(() => requirePermission('nurse', 'patient:write')).toThrow(ForbiddenError);
  });

  it('discloses nothing beyond the generic denial message', () => {
    try {
      requirePermission('nurse', 'patient:write');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ForbiddenError).message).toBe('Access denied');
      expect((error as ForbiddenError).details).toEqual({});
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/domain/permissions.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/permissions.js`.

- [ ] **Step 3: Implement the permission matrix**

`packages/api/src/domain/permissions.ts`:

```ts
import type { Role } from '@aethelgard/shared';
import { ForbiddenError } from './errors.js';

export const PERMISSIONS = [
  'patient:read',
  'patient:write',
  'encounter:read',
  'encounter:write',
  'observation:read',
  'observation:write',
  'attachment:read',
  'attachment:write',
  'infra:admin',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CLINICAL: readonly Permission[] = PERMISSIONS.filter(
  (permission) => permission !== 'infra:admin',
);

/**
 * Spec §6.2. records_clerk gets clinical *reads* because the patient page it
 * maintains renders encounters; it gets no clinical writes.
 */
const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set(PERMISSIONS),
  doctor: new Set(CLINICAL),
  nurse: new Set<Permission>([
    'patient:read',
    'encounter:read',
    'observation:read',
    'observation:write',
    'attachment:read',
  ]),
  records_clerk: new Set<Permission>([
    'patient:read',
    'patient:write',
    'encounter:read',
    'observation:read',
    'attachment:read',
  ]),
};

export const can = (role: Role, permission: Permission): boolean =>
  MATRIX[role].has(permission);

export const requirePermission = (role: Role, permission: Permission): void => {
  if (!can(role, permission)) {
    throw new ForbiddenError();
  }
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/domain/permissions.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Write the failing scope test**

`packages/api/test/domain/scope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Principal, Role } from '@aethelgard/shared';
import { ForbiddenError } from '../../src/domain/errors.js';
import { assertBranchWritable, branchScopeFor } from '../../src/domain/scope.js';

const KL = '11111111-1111-4111-8111-111111111111';
const PG = '22222222-2222-4222-8222-222222222222';

const principal = (role: Role, branchId: string): Principal => ({
  userId: '99999999-9999-4999-8999-999999999999',
  email: `${role}@aethelgard.demo`,
  role,
  branchId,
});

describe('branchScopeFor', () => {
  it('gives an admin an unrestricted scope', () => {
    expect(branchScopeFor(principal('admin', KL))).toEqual({ kind: 'all' });
  });

  it.each(['doctor', 'nurse', 'records_clerk'] as const)(
    'pins a %s to their own branch',
    (role) => {
      expect(branchScopeFor(principal(role, PG))).toEqual({ kind: 'branch', branchId: PG });
    },
  );
});

describe('assertBranchWritable', () => {
  it('lets an admin write into any branch', () => {
    expect(() => assertBranchWritable(principal('admin', KL), PG)).not.toThrow();
  });

  it('lets a doctor write into their own branch', () => {
    expect(() => assertBranchWritable(principal('doctor', KL), KL)).not.toThrow();
  });

  it('stops a doctor writing into another branch even with a valid branch id', () => {
    expect(() => assertBranchWritable(principal('doctor', KL), PG)).toThrow(ForbiddenError);
  });

  it('discloses nothing about the target branch in the denial', () => {
    try {
      assertBranchWritable(principal('records_clerk', KL), PG);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ForbiddenError).details).toEqual({});
    }
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/domain/scope.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/scope.js`.

- [ ] **Step 7: Implement branch scoping**

`packages/api/src/domain/scope.ts`:

```ts
import type { Principal } from '@aethelgard/shared';
import { ForbiddenError } from './errors.js';

/**
 * Passed into every scoped repository method. Spec §6.2: the constraint lives
 * in the query, so a caller cannot reach another branch's row by supplying a
 * known identifier.
 */
export type BranchScope = { kind: 'all' } | { kind: 'branch'; branchId: string };

export const branchScopeFor = (principal: Principal): BranchScope =>
  principal.role === 'admin' ? { kind: 'all' } : { kind: 'branch', branchId: principal.branchId };

/**
 * Creation cannot be constrained by a query predicate — there is no existing
 * row to filter — so the branch of a *new* record is checked here instead.
 */
export const assertBranchWritable = (principal: Principal, branchId: string): void => {
  if (principal.role !== 'admin' && principal.branchId !== branchId) {
    throw new ForbiddenError();
  }
};
```

- [ ] **Step 8: Run the whole suite to verify it passes**

Run: `npm test -w @aethelgard/api`
Expected: PASS — all domain suites green.

- [ ] **Step 9: Commit**

```bash
git add packages/api
git commit -m "feat(api): add role permission matrix and branch scoping"
```

---

### Task 6: Ports

Interfaces only — no runtime behaviour, so there is nothing to assert at runtime and **no test file is written for this task**. Its verification step is `tsc --noEmit`. Do not fabricate a test that asserts an interface exists; that is a tautology, not a test. The contract suites in Tasks 7–10 are the real tests of these shapes.

**Files:**
- Create: `packages/api/src/ports/branchRepository.ts`, `patientRepository.ts`, `encounterRepository.ts`, `observationRepository.ts`, `attachmentRepository.ts`, `auditLog.ts`, `objectStore.ts`, `authProvider.ts`, `instanceIdentity.ts`, `index.ts` (all under `packages/api/src/ports/`)

**Interfaces:**
- Consumes: entity types from `@aethelgard/shared`; `BranchScope` from `../domain/scope.js`.
- Produces: every type below, re-exported from `src/ports/index.ts`. Tasks 7–14 and all of Phase 2 import from `../ports/index.js`.

- [ ] **Step 1: Write the repository ports**

`packages/api/src/ports/branchRepository.ts`:

```ts
import type { Branch, BranchCode } from '@aethelgard/shared';

/**
 * Read-only. Branches are reference data seeded by migration (spec §4), and the
 * service layer needs the code→id mapping for MRN prefixes and branch pickers.
 */
export interface BranchRepository {
  listAll(): Promise<Branch[]>;
  findById(id: string): Promise<Branch | null>;
  findByCode(code: BranchCode): Promise<Branch | null>;
}
```

`packages/api/src/ports/patientRepository.ts`:

```ts
import type { Page, Patient, Sex } from '@aethelgard/shared';
import type { BranchScope } from '../domain/scope.js';

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

/** `search` matches a case-insensitive substring of name, or an exact MRN. */
export type PatientSearchQuery = {
  search?: string;
  page: number;
  pageSize: number;
};

/**
 * Every method except `create` takes a BranchScope and MUST apply it inside the
 * query. Soft-deleted patients are invisible to every read.
 */
export interface PatientRepository {
  /** Throws ConflictError when the MRN is already assigned. */
  create(patient: NewPatient): Promise<Patient>;
  findById(id: string, scope: BranchScope): Promise<Patient | null>;
  findByMrn(mrn: string, scope: BranchScope): Promise<Patient | null>;
  search(query: PatientSearchQuery, scope: BranchScope): Promise<Page<Patient>>;
  /** Returns null when no in-scope, non-deleted patient has that id. */
  update(id: string, patch: PatientPatch, scope: BranchScope): Promise<Patient | null>;
  /** Sets deletedAt. Returns false when no in-scope, non-deleted patient has that id. */
  softDelete(id: string, deletedAt: string, scope: BranchScope): Promise<boolean>;
}
```

`packages/api/src/ports/encounterRepository.ts`:

```ts
import type { Encounter, EncounterStatus, EncounterType } from '@aethelgard/shared';
import type { BranchScope } from '../domain/scope.js';

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

export interface EncounterRepository {
  create(encounter: NewEncounter): Promise<Encounter>;
  findById(id: string, scope: BranchScope): Promise<Encounter | null>;
  /** Newest admission first. */
  listForPatient(patientId: string, scope: BranchScope): Promise<Encounter[]>;
  update(id: string, patch: EncounterPatch, scope: BranchScope): Promise<Encounter | null>;
}
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

/**
 * Unscoped by design: observations carry no branch column. ObservationService
 * loads the parent encounter in scope first, so an out-of-branch encounter id
 * never reaches this port.
 */
export interface ObservationRepository {
  create(observation: NewObservation): Promise<Observation>;
  /** Newest recording first. */
  listForEncounter(encounterId: string): Promise<Observation[]>;
}
```

`packages/api/src/ports/attachmentRepository.ts`:

```ts
import type { Attachment } from '@aethelgard/shared';

export type NewAttachment = {
  id: string;
  encounterId: string;
  filename: string;
  contentType: string;
  storageKey: string;
  uploadedBy: string;
  uploadedAt: string;
};

/** Unscoped for the same reason as ObservationRepository — the encounter gates access. */
export interface AttachmentRepository {
  /** Inserts with status 'pending' and sizeBytes null. */
  createPending(attachment: NewAttachment): Promise<Attachment>;
  /** pending → confirmed. Returns null when no pending attachment has that id. */
  confirm(id: string, sizeBytes: number): Promise<Attachment | null>;
  findById(id: string): Promise<Attachment | null>;
  /** Confirmed only — orphaned pending rows are excluded from listings (spec §7). */
  listConfirmedForEncounter(encounterId: string): Promise<Attachment[]>;
}
```

`packages/api/src/ports/auditLog.ts`:

```ts
export const AUDIT_ACTIONS = [
  'patient.create',
  'patient.update',
  'patient.delete',
  'encounter.create',
  'encounter.update',
  'observation.create',
  'attachment.create',
  'attachment.confirm',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = ['patient', 'encounter', 'observation', 'attachment'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type NewAuditEvent = {
  id: string;
  actorUserId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  occurredAt: string;
};

export type AuditEvent = NewAuditEvent;

/** Append-only (spec §4). There is deliberately no update or delete method. */
export interface AuditLog {
  record(event: NewAuditEvent): Promise<void>;
  /** Newest first. */
  listForEntity(entityType: AuditEntityType, entityId: string): Promise<AuditEvent[]>;
}
```

- [ ] **Step 2: Write the infrastructure ports**

`packages/api/src/ports/objectStore.ts`:

```ts
export type PresignedUpload = {
  url: string;
  storageKey: string;
  expiresInSeconds: number;
};

export type ObjectMetadata = {
  sizeBytes: number;
  contentType: string;
};

/**
 * Presigned URL issuance only — bytes never transit the API (spec §7).
 * Implemented once, against S3, with the endpoint configurable so MinIO can
 * stand in locally without a second adapter (spec §2, environment parity).
 */
export interface ObjectStore {
  readonly name: string;
  createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;
  createDownloadUrl(input: { storageKey: string; expiresInSeconds: number }): Promise<string>;
  /** Null when the object does not exist — used to record the confirmed size. */
  head(storageKey: string): Promise<ObjectMetadata | null>;
}
```

`packages/api/src/ports/authProvider.ts`:

```ts
import type { Credentials, DemoUser, Principal } from '@aethelgard/shared';

export type IssuedToken = {
  token: string;
  expiresAt: string;
};

/**
 * localJwt and cognito both produce the same Principal, so nothing downstream
 * changes when AUTH_DRIVER flips (spec §6.1).
 */
export interface AuthProvider {
  readonly name: 'localJwt' | 'cognito';
  /** Throws ForbiddenError on bad credentials — never reveals which field was wrong. */
  authenticate(credentials: Credentials): Promise<Principal>;
  issueToken(principal: Principal): Promise<IssuedToken>;
  /** Throws ForbiddenError on an invalid, expired or unverifiable token. */
  verifyToken(token: string): Promise<Principal>;
  /** Non-secret identifiers for the login-page role dropdown (spec §5). */
  listDemoUsers(): Promise<DemoUser[]>;
}
```

`Credentials` is not yet exported from `@aethelgard/shared` — it is `LoginInput`. Add the alias in this step by appending one line to `packages/shared/src/auth.ts`:

```ts
export type Credentials = LoginInput;
```

`packages/api/src/ports/instanceIdentity.ts`:

```ts
export type InstanceInfo = {
  instanceId: string;
  availabilityZone: string;
  source: 'local' | 'imds' | 'ecs';
};

/** Feeds the X-Served-By / X-AZ headers and GET /api/meta (spec §8). */
export interface InstanceIdentity {
  get(): Promise<InstanceInfo>;
}
```

- [ ] **Step 3: Write the barrel**

`packages/api/src/ports/index.ts`:

```ts
export type { BranchRepository } from './branchRepository.js';
export type {
  NewPatient,
  PatientPatch,
  PatientRepository,
  PatientSearchQuery,
} from './patientRepository.js';
export type {
  EncounterPatch,
  EncounterRepository,
  NewEncounter,
} from './encounterRepository.js';
export type { NewObservation, ObservationRepository } from './observationRepository.js';
export type { AttachmentRepository, NewAttachment } from './attachmentRepository.js';
export { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from './auditLog.js';
export type { AuditAction, AuditEntityType, AuditEvent, AuditLog, NewAuditEvent } from './auditLog.js';
export type { ObjectMetadata, ObjectStore, PresignedUpload } from './objectStore.js';
export type { AuthProvider, IssuedToken } from './authProvider.js';
export type { InstanceInfo, InstanceIdentity } from './instanceIdentity.js';
```

- [ ] **Step 4: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0. This is the verification for this task — there is no test to run.

- [ ] **Step 5: Verify nothing regressed**

Run: `npm test`
Expected: PASS — both workspaces, all existing suites.

- [ ] **Step 6: Commit**

```bash
git add packages/api packages/shared
git commit -m "feat(api): define the nine ports the adapters must satisfy"
```

---

### Task 7: Contract harness and PatientRepository contract

This task ships three things at once because they are meaningless apart: the harness type Phase 2 will re-implement, the first contract suite, and the memory adapter that must satisfy it.

**Files:**
- Create: `packages/api/test/fixtures/ids.ts`, `packages/api/test/fixtures/principals.ts`
- Create: `packages/api/test/contracts/harness.ts`, `packages/api/test/contracts/patientRepository.contract.ts`
- Create: `packages/api/src/adapters/persistence/memory/store.ts`, `packages/api/src/adapters/persistence/memory/patientRepository.ts`
- Create: `packages/api/test/memory/memoryHarness.ts`, `packages/api/test/memory/contracts.test.ts`

**Interfaces:**
- Consumes: `PatientRepository`, `NewPatient`, `PatientPatch`, `PatientSearchQuery`, `BranchRepository` from `../ports/index.js`; `BranchScope` from `../domain/scope.js`; `ConflictError` from `../domain/errors.js`.
- Produces:
  - `test/fixtures/ids.ts` — `BRANCH_IDS: { KL: string; PG: string; JB: string }`, `USER_IDS: { adminKl: string; doctorKl: string; nurseKl: string; clerkKl: string; doctorPg: string }`
  - `test/fixtures/principals.ts` — `principalFor(role: Role, branchId?: string): Principal`
  - `test/contracts/harness.ts` — `type HarnessContext`, `type RepositoryHarness`
  - `test/contracts/patientRepository.contract.ts` — `describePatientRepositoryContract(harness: RepositoryHarness): void`
  - `src/adapters/persistence/memory/store.ts` — `type MemoryStore`, `createMemoryStore(): MemoryStore`
  - `src/adapters/persistence/memory/patientRepository.ts` — `createMemoryPatientRepository(store: MemoryStore): PatientRepository`
  - `test/memory/memoryHarness.ts` — `createMemoryHarness(): RepositoryHarness`

- [ ] **Step 1: Write the fixtures and the harness type**

These carry no behaviour of their own; they are written first because every later step imports them.

`packages/api/test/fixtures/ids.ts`:

```ts
/**
 * Fixed, readable UUIDs shared by the in-memory harness and (Phase 2) the
 * Postgres harness, so one contract suite runs unchanged against both.
 * Branch ids match the values seeded by migration 002.
 */
export const BRANCH_IDS = {
  KL: '11111111-1111-4111-8111-111111111111',
  PG: '22222222-2222-4222-8222-222222222222',
  JB: '33333333-3333-4333-8333-333333333333',
} as const;

export const USER_IDS = {
  adminKl: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  doctorKl: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  nurseKl: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  clerkKl: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  doctorPg: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
} as const;
```

`packages/api/test/fixtures/principals.ts`:

```ts
import type { Principal, Role } from '@aethelgard/shared';
import { BRANCH_IDS, USER_IDS } from './ids.js';

const DEFAULTS: Record<Role, { userId: string; branchId: string }> = {
  admin: { userId: USER_IDS.adminKl, branchId: BRANCH_IDS.KL },
  doctor: { userId: USER_IDS.doctorKl, branchId: BRANCH_IDS.KL },
  nurse: { userId: USER_IDS.nurseKl, branchId: BRANCH_IDS.KL },
  records_clerk: { userId: USER_IDS.clerkKl, branchId: BRANCH_IDS.KL },
};

export const principalFor = (role: Role, branchId?: string): Principal => ({
  userId: DEFAULTS[role].userId,
  email: `${role}@aethelgard.demo`,
  role,
  branchId: branchId ?? DEFAULTS[role].branchId,
});
```

`packages/api/test/contracts/harness.ts`:

```ts
import type {
  AttachmentRepository,
  AuditLog,
  BranchRepository,
  EncounterRepository,
  ObservationRepository,
  PatientRepository,
} from '../../src/ports/index.js';

/** One fully-wired, empty persistence layer with branches and users already seeded. */
export type HarnessContext = {
  branches: BranchRepository;
  patients: PatientRepository;
  encounters: EncounterRepository;
  observations: ObservationRepository;
  attachments: AttachmentRepository;
  audit: AuditLog;
};

/**
 * Implemented once per persistence technology. `setup` must return a context
 * whose clinical tables are empty and whose branches and demo users exist.
 */
export type RepositoryHarness = {
  name: string;
  setup: () => Promise<HarnessContext>;
  teardown: (context: HarnessContext) => Promise<void>;
};
```

- [ ] **Step 2: Write the failing PatientRepository contract**

`packages/api/test/contracts/patientRepository.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewPatient } from '../../src/ports/index.js';
import type { BranchScope } from '../../src/domain/scope.js';
import { ConflictError } from '../../src/domain/errors.js';
import { BRANCH_IDS } from '../fixtures/ids.js';
import type { HarnessContext, RepositoryHarness } from './harness.js';

const ALL: BranchScope = { kind: 'all' };
const KL_ONLY: BranchScope = { kind: 'branch', branchId: BRANCH_IDS.KL };
const PG_ONLY: BranchScope = { kind: 'branch', branchId: BRANCH_IDS.PG };

const T0 = '2026-08-07T10:00:00.000Z';
const T1 = '2026-08-07T11:00:00.000Z';

let sequence = 0;
const newPatient = (overrides: Partial<NewPatient> = {}): NewPatient => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    mrn: `KL-${String(sequence).padStart(6, '0')}`,
    name: `Patient ${sequence}`,
    dob: '1990-01-01',
    sex: 'female',
    phone: '+60123456789',
    branchId: BRANCH_IDS.KL,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
};

export const describePatientRepositoryContract = (harness: RepositoryHarness): void => {
  describe(`PatientRepository contract [${harness.name}]`, () => {
    let context: HarnessContext;

    beforeEach(async () => {
      sequence = 0;
      context = await harness.setup();
    });

    afterEach(async () => {
      await harness.teardown(context);
    });

    describe('create', () => {
      it('returns the stored patient with deletedAt null', async () => {
        const input = newPatient({ name: 'Nurul Aisyah' });
        const created = await context.patients.create(input);
        expect(created).toEqual({
          id: input.id,
          mrn: input.mrn,
          name: 'Nurul Aisyah',
          dob: '1990-01-01',
          sex: 'female',
          phone: '+60123456789',
          branchId: BRANCH_IDS.KL,
          createdAt: T0,
          updatedAt: T0,
          deletedAt: null,
        });
      });

      it('rejects a duplicate MRN with ConflictError', async () => {
        await context.patients.create(newPatient({ mrn: 'KL-000777' }));
        await expect(
          context.patients.create(newPatient({ mrn: 'KL-000777' })),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });

    describe('findById', () => {
      it('finds an in-scope patient', async () => {
        const created = await context.patients.create(newPatient());
        expect(await context.patients.findById(created.id, KL_ONLY)).toEqual(created);
      });

      it('returns null for a patient in another branch even given the right id', async () => {
        const created = await context.patients.create(newPatient());
        expect(await context.patients.findById(created.id, PG_ONLY)).toBeNull();
      });

      it('finds a patient in any branch under an unrestricted scope', async () => {
        const created = await context.patients.create(
          newPatient({ branchId: BRANCH_IDS.JB, mrn: 'JB-000001' }),
        );
        expect(await context.patients.findById(created.id, ALL)).toEqual(created);
      });

      it('returns null for an unknown id', async () => {
        expect(
          await context.patients.findById('99999999-9999-4999-8999-999999999999', ALL),
        ).toBeNull();
      });
    });

    describe('findByMrn', () => {
      it('finds an in-scope patient by exact MRN', async () => {
        const created = await context.patients.create(newPatient({ mrn: 'KL-000042' }));
        expect(await context.patients.findByMrn('KL-000042', KL_ONLY)).toEqual(created);
      });

      it('returns null when the MRN belongs to another branch', async () => {
        await context.patients.create(newPatient({ mrn: 'KL-000042' }));
        expect(await context.patients.findByMrn('KL-000042', PG_ONLY)).toBeNull();
      });
    });

    describe('search', () => {
      beforeEach(async () => {
        await context.patients.create(newPatient({ name: 'Ahmad Faizal', mrn: 'KL-000001' }));
        await context.patients.create(newPatient({ name: 'Siti Aminah', mrn: 'KL-000002' }));
        await context.patients.create(
          newPatient({ name: 'Ahmad Zaki', mrn: 'PG-000001', branchId: BRANCH_IDS.PG }),
        );
      });

      it('returns every in-scope patient when no search term is given', async () => {
        const page = await context.patients.search({ page: 1, pageSize: 20 }, KL_ONLY);
        expect(page.total).toBe(2);
        expect(page.items.map((patient) => patient.name).sort()).toEqual([
          'Ahmad Faizal',
          'Siti Aminah',
        ]);
      });

      it('matches a case-insensitive substring of the name', async () => {
        const page = await context.patients.search(
          { search: 'ahmad', page: 1, pageSize: 20 },
          ALL,
        );
        expect(page.total).toBe(2);
      });

      it('matches an exact MRN', async () => {
        const page = await context.patients.search(
          { search: 'KL-000002', page: 1, pageSize: 20 },
          KL_ONLY,
        );
        expect(page.total).toBe(1);
        expect(page.items[0]?.name).toBe('Siti Aminah');
      });

      it('never leaks another branch into the results', async () => {
        const page = await context.patients.search({ search: 'Ahmad', page: 1, pageSize: 20 }, KL_ONLY);
        expect(page.items.map((patient) => patient.name)).toEqual(['Ahmad Faizal']);
      });

      it('paginates and reports the unpaged total', async () => {
        const page = await context.patients.search({ page: 2, pageSize: 1 }, KL_ONLY);
        expect(page).toMatchObject({ page: 2, pageSize: 1, total: 2 });
        expect(page.items).toHaveLength(1);
      });

      it('returns an empty page past the end rather than failing', async () => {
        const page = await context.patients.search({ page: 99, pageSize: 20 }, KL_ONLY);
        expect(page.items).toEqual([]);
        expect(page.total).toBe(2);
      });

      it('orders results by name so pagination is stable', async () => {
        const first = await context.patients.search({ page: 1, pageSize: 1 }, KL_ONLY);
        const second = await context.patients.search({ page: 2, pageSize: 1 }, KL_ONLY);
        expect(first.items[0]?.name).toBe('Ahmad Faizal');
        expect(second.items[0]?.name).toBe('Siti Aminah');
      });
    });

    describe('update', () => {
      it('applies the patch and advances updatedAt', async () => {
        const created = await context.patients.create(newPatient());
        const updated = await context.patients.update(
          created.id,
          { phone: '+60111111111', updatedAt: T1 },
          KL_ONLY,
        );
        expect(updated).toMatchObject({ phone: '+60111111111', updatedAt: T1, createdAt: T0 });
      });

      it('leaves unpatched fields untouched', async () => {
        const created = await context.patients.create(newPatient({ name: 'Original Name' }));
        const updated = await context.patients.update(
          created.id,
          { phone: '+60111111111', updatedAt: T1 },
          KL_ONLY,
        );
        expect(updated?.name).toBe('Original Name');
      });

      it('returns null when the patient is outside the scope', async () => {
        const created = await context.patients.create(newPatient());
        expect(
          await context.patients.update(created.id, { name: 'Hacked', updatedAt: T1 }, PG_ONLY),
        ).toBeNull();
      });

      it('does not write when the scope denies the update', async () => {
        const created = await context.patients.create(newPatient({ name: 'Original Name' }));
        await context.patients.update(created.id, { name: 'Hacked', updatedAt: T1 }, PG_ONLY);
        expect((await context.patients.findById(created.id, ALL))?.name).toBe('Original Name');
      });

      it('returns null for an unknown id', async () => {
        expect(
          await context.patients.update(
            '99999999-9999-4999-8999-999999999999',
            { name: 'X', updatedAt: T1 },
            ALL,
          ),
        ).toBeNull();
      });
    });

    describe('softDelete', () => {
      it('reports success and hides the patient from findById', async () => {
        const created = await context.patients.create(newPatient());
        expect(await context.patients.softDelete(created.id, T1, KL_ONLY)).toBe(true);
        expect(await context.patients.findById(created.id, ALL)).toBeNull();
      });

      it('hides the patient from search and from the total', async () => {
        const created = await context.patients.create(newPatient({ name: 'Gone Soon' }));
        await context.patients.softDelete(created.id, T1, KL_ONLY);
        const page = await context.patients.search({ page: 1, pageSize: 20 }, ALL);
        expect(page.total).toBe(0);
        expect(page.items).toEqual([]);
      });

      it('hides the patient from findByMrn', async () => {
        const created = await context.patients.create(newPatient({ mrn: 'KL-000900' }));
        await context.patients.softDelete(created.id, T1, KL_ONLY);
        expect(await context.patients.findByMrn('KL-000900', ALL)).toBeNull();
      });

      it('returns false when the patient is outside the scope, and does not delete', async () => {
        const created = await context.patients.create(newPatient());
        expect(await context.patients.softDelete(created.id, T1, PG_ONLY)).toBe(false);
        expect(await context.patients.findById(created.id, ALL)).not.toBeNull();
      });

      it('is not repeatable — a second delete reports false', async () => {
        const created = await context.patients.create(newPatient());
        expect(await context.patients.softDelete(created.id, T1, KL_ONLY)).toBe(true);
        expect(await context.patients.softDelete(created.id, T1, KL_ONLY)).toBe(false);
      });

      it('leaves the MRN taken, because the record is retained not erased', async () => {
        const created = await context.patients.create(newPatient({ mrn: 'KL-000901' }));
        await context.patients.softDelete(created.id, T1, KL_ONLY);
        await expect(
          context.patients.create(newPatient({ mrn: 'KL-000901' })),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });
  });
};
```

- [ ] **Step 3: Write the memory harness runner**

`packages/api/test/memory/contracts.test.ts`:

```ts
import { describePatientRepositoryContract } from '../contracts/patientRepository.contract.js';
import { createMemoryHarness } from './memoryHarness.js';

const harness = createMemoryHarness();

describePatientRepositoryContract(harness);
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/memory/contracts.test.ts`
Expected: FAIL — cannot resolve `./memoryHarness.js`.

- [ ] **Step 5: Implement the memory store and PatientRepository**

`packages/api/src/adapters/persistence/memory/store.ts`:

```ts
import type { Attachment, Branch, Encounter, Observation, Patient } from '@aethelgard/shared';
import type { AuditEvent } from '../../../ports/index.js';

/**
 * Map-backed tables shared by the in-memory adapters, so a single store
 * behaves like one database. Rows are stored already in wire shape; adapters
 * clone on read so a caller cannot mutate the "database" by holding a reference.
 */
export type MemoryStore = {
  branches: Map<string, Branch>;
  patients: Map<string, Patient>;
  encounters: Map<string, Encounter>;
  observations: Map<string, Observation>;
  attachments: Map<string, Attachment>;
  auditEvents: AuditEvent[];
};

/** Mirrors the reference data seeded by Phase 2's migration 002. */
const SEED_BRANCHES: readonly Branch[] = [
  { id: '11111111-1111-4111-8111-111111111111', code: 'KL', name: 'Kuala Lumpur' },
  { id: '22222222-2222-4222-8222-222222222222', code: 'PG', name: 'Penang' },
  { id: '33333333-3333-4333-8333-333333333333', code: 'JB', name: 'Johor Bahru' },
];

export const createMemoryStore = (): MemoryStore => ({
  branches: new Map(SEED_BRANCHES.map((branch) => [branch.id, { ...branch }])),
  patients: new Map(),
  encounters: new Map(),
  observations: new Map(),
  attachments: new Map(),
  auditEvents: [],
});
```

`packages/api/src/adapters/persistence/memory/patientRepository.ts`:

```ts
import type { Page, Patient } from '@aethelgard/shared';
import { ConflictError } from '../../../domain/errors.js';
import type { BranchScope } from '../../../domain/scope.js';
import type {
  NewPatient,
  PatientPatch,
  PatientRepository,
  PatientSearchQuery,
} from '../../../ports/index.js';
import type { MemoryStore } from './store.js';

const inScope = (patient: Patient, scope: BranchScope): boolean =>
  scope.kind === 'all' || patient.branchId === scope.branchId;

/** Live rows only. Soft-deleted patients are invisible to every read (spec §4). */
const visible = (patient: Patient, scope: BranchScope): boolean =>
  patient.deletedAt === null && inScope(patient, scope);

const matches = (patient: Patient, search: string | undefined): boolean => {
  if (search === undefined || search.trim() === '') {
    return true;
  }
  const term = search.trim().toLowerCase();
  return patient.name.toLowerCase().includes(term) || patient.mrn.toLowerCase() === term;
};

export const createMemoryPatientRepository = (store: MemoryStore): PatientRepository => ({
  create: async (input: NewPatient): Promise<Patient> => {
    for (const existing of store.patients.values()) {
      if (existing.mrn === input.mrn) {
        throw new ConflictError('MRN is already assigned', { mrn: input.mrn });
      }
    }
    const patient: Patient = { ...input, deletedAt: null };
    store.patients.set(patient.id, patient);
    return { ...patient };
  },

  findById: async (id: string, scope: BranchScope): Promise<Patient | null> => {
    const patient = store.patients.get(id);
    return patient !== undefined && visible(patient, scope) ? { ...patient } : null;
  },

  findByMrn: async (mrn: string, scope: BranchScope): Promise<Patient | null> => {
    for (const patient of store.patients.values()) {
      if (patient.mrn === mrn && visible(patient, scope)) {
        return { ...patient };
      }
    }
    return null;
  },

  search: async (query: PatientSearchQuery, scope: BranchScope): Promise<Page<Patient>> => {
    const all = [...store.patients.values()]
      .filter((patient) => visible(patient, scope) && matches(patient, query.search))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    const offset = (query.page - 1) * query.pageSize;
    return {
      items: all.slice(offset, offset + query.pageSize).map((patient) => ({ ...patient })),
      page: query.page,
      pageSize: query.pageSize,
      total: all.length,
    };
  },

  update: async (id: string, patch: PatientPatch, scope: BranchScope): Promise<Patient | null> => {
    const patient = store.patients.get(id);
    if (patient === undefined || !visible(patient, scope)) {
      return null;
    }
    const updated: Patient = {
      ...patient,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.dob !== undefined ? { dob: patch.dob } : {}),
      ...(patch.sex !== undefined ? { sex: patch.sex } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      updatedAt: patch.updatedAt,
    };
    store.patients.set(id, updated);
    return { ...updated };
  },

  softDelete: async (id: string, deletedAt: string, scope: BranchScope): Promise<boolean> => {
    const patient = store.patients.get(id);
    if (patient === undefined || !visible(patient, scope)) {
      return false;
    }
    store.patients.set(id, { ...patient, deletedAt, updatedAt: deletedAt });
    return true;
  },
});
```

- [ ] **Step 6: Implement the memory harness**

At this point only the patient repository exists, so the harness casts the not-yet-written repositories. **Do not leave the casts in** — Tasks 8–10 replace each one, and Task 10's final step asserts none remain.

`packages/api/test/memory/memoryHarness.ts`:

```ts
import { createMemoryStore } from '../../src/adapters/persistence/memory/store.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import type { HarnessContext, RepositoryHarness } from '../contracts/harness.js';

const notYetImplemented = <T>(name: string): T =>
  new Proxy({} as object, {
    get: () => {
      throw new Error(`${name} is not implemented yet — see the task that adds it`);
    },
  }) as T;

export const createMemoryHarness = (): RepositoryHarness => ({
  name: 'memory',
  setup: async (): Promise<HarnessContext> => {
    const store = createMemoryStore();
    return {
      branches: notYetImplemented('MemoryBranchRepository'),
      patients: createMemoryPatientRepository(store),
      encounters: notYetImplemented('MemoryEncounterRepository'),
      observations: notYetImplemented('MemoryObservationRepository'),
      attachments: notYetImplemented('MemoryAttachmentRepository'),
      audit: notYetImplemented('MemoryAuditLog'),
    };
  },
  teardown: async (): Promise<void> => {
    // The store is discarded with the context; nothing to release.
  },
});
```

- [ ] **Step 7: Run the contract to verify it passes**

Run: `npm test -w @aethelgard/api -- test/memory/contracts.test.ts`
Expected: PASS — 24 tests under `PatientRepository contract [memory]`.

- [ ] **Step 8: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add packages/api
git commit -m "test(api): add repository contract harness and PatientRepository contract"
```

---

### Task 8: EncounterRepository contract and memory adapter

**Files:**
- Create: `packages/api/test/contracts/encounterRepository.contract.ts`
- Create: `packages/api/src/adapters/persistence/memory/encounterRepository.ts`
- Modify: `packages/api/test/memory/memoryHarness.ts` (replace the `encounters` placeholder)
- Modify: `packages/api/test/memory/contracts.test.ts` (add the suite)

**Interfaces:**
- Consumes: `EncounterRepository`, `NewEncounter`, `EncounterPatch` from `../ports/index.js`; `MemoryStore` from `./store.js`.
- Produces: `describeEncounterRepositoryContract(harness: RepositoryHarness): void`; `createMemoryEncounterRepository(store: MemoryStore): EncounterRepository`.

Encounters carry their own `branchId`, denormalised from the patient. That is what lets `findById` apply a branch predicate without a join, which matters for the Postgres adapter in Phase 2.

- [ ] **Step 1: Write the failing contract**

`packages/api/test/contracts/encounterRepository.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Patient } from '@aethelgard/shared';
import type { NewEncounter, NewPatient } from '../../src/ports/index.js';
import type { BranchScope } from '../../src/domain/scope.js';
import { BRANCH_IDS } from '../fixtures/ids.js';
import type { HarnessContext, RepositoryHarness } from './harness.js';

const ALL: BranchScope = { kind: 'all' };
const KL_ONLY: BranchScope = { kind: 'branch', branchId: BRANCH_IDS.KL };
const PG_ONLY: BranchScope = { kind: 'branch', branchId: BRANCH_IDS.PG };

const T0 = '2026-08-01T08:00:00.000Z';
const T1 = '2026-08-03T08:00:00.000Z';
const T2 = '2026-08-05T08:00:00.000Z';

let sequence = 0;
const nextId = (): string => {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
};

const patientInput = (branchId: string, mrn: string): NewPatient => ({
  id: nextId(),
  mrn,
  name: `Patient ${mrn}`,
  dob: '1990-01-01',
  sex: 'male',
  phone: '+60123456789',
  branchId,
  createdAt: T0,
  updatedAt: T0,
});

const encounterInput = (patient: Patient, overrides: Partial<NewEncounter> = {}): NewEncounter => ({
  id: nextId(),
  patientId: patient.id,
  branchId: patient.branchId,
  type: 'outpatient',
  department: 'General Medicine',
  admittedAt: T1,
  status: 'open',
  ...overrides,
});

export const describeEncounterRepositoryContract = (harness: RepositoryHarness): void => {
  describe(`EncounterRepository contract [${harness.name}]`, () => {
    let context: HarnessContext;
    let klPatient: Patient;
    let pgPatient: Patient;

    beforeEach(async () => {
      sequence = 0;
      context = await harness.setup();
      klPatient = await context.patients.create(patientInput(BRANCH_IDS.KL, 'KL-000001'));
      pgPatient = await context.patients.create(patientInput(BRANCH_IDS.PG, 'PG-000001'));
    });

    afterEach(async () => {
      await harness.teardown(context);
    });

    describe('create', () => {
      it('returns the stored encounter with no discharge timestamp', async () => {
        const input = encounterInput(klPatient, { type: 'inpatient', department: 'Cardiology' });
        expect(await context.encounters.create(input)).toEqual({
          id: input.id,
          patientId: klPatient.id,
          branchId: BRANCH_IDS.KL,
          type: 'inpatient',
          department: 'Cardiology',
          admittedAt: T1,
          dischargedAt: null,
          status: 'open',
        });
      });
    });

    describe('findById', () => {
      it('finds an in-scope encounter', async () => {
        const created = await context.encounters.create(encounterInput(klPatient));
        expect(await context.encounters.findById(created.id, KL_ONLY)).toEqual(created);
      });

      it('returns null for an encounter in another branch', async () => {
        const created = await context.encounters.create(encounterInput(klPatient));
        expect(await context.encounters.findById(created.id, PG_ONLY)).toBeNull();
      });

      it('returns null for an unknown id', async () => {
        expect(
          await context.encounters.findById('99999999-9999-4999-8999-999999999999', ALL),
        ).toBeNull();
      });
    });

    describe('listForPatient', () => {
      it('returns the patient’s encounters newest admission first', async () => {
        await context.encounters.create(encounterInput(klPatient, { admittedAt: T1 }));
        await context.encounters.create(encounterInput(klPatient, { admittedAt: T2 }));
        const listed = await context.encounters.listForPatient(klPatient.id, KL_ONLY);
        expect(listed.map((encounter) => encounter.admittedAt)).toEqual([T2, T1]);
      });

      it('excludes encounters belonging to other patients', async () => {
        await context.encounters.create(encounterInput(klPatient));
        await context.encounters.create(encounterInput(pgPatient));
        expect(await context.encounters.listForPatient(klPatient.id, ALL)).toHaveLength(1);
      });

      it('returns an empty list when the patient is out of scope', async () => {
        await context.encounters.create(encounterInput(klPatient));
        expect(await context.encounters.listForPatient(klPatient.id, PG_ONLY)).toEqual([]);
      });

      it('returns an empty list for a patient with no encounters', async () => {
        expect(await context.encounters.listForPatient(pgPatient.id, ALL)).toEqual([]);
      });
    });

    describe('update', () => {
      it('applies a department change', async () => {
        const created = await context.encounters.create(encounterInput(klPatient));
        const updated = await context.encounters.update(
          created.id,
          { department: 'Neurology' },
          KL_ONLY,
        );
        expect(updated?.department).toBe('Neurology');
      });

      it('records a discharge with its timestamp', async () => {
        const created = await context.encounters.create(encounterInput(klPatient));
        const updated = await context.encounters.update(
          created.id,
          { status: 'discharged', dischargedAt: T2 },
          KL_ONLY,
        );
        expect(updated).toMatchObject({ status: 'discharged', dischargedAt: T2 });
      });

      it('can clear the discharge timestamp back to null', async () => {
        const created = await context.encounters.create(encounterInput(klPatient));
        const updated = await context.encounters.update(
          created.id,
          { status: 'cancelled', dischargedAt: null },
          KL_ONLY,
        );
        expect(updated).toMatchObject({ status: 'cancelled', dischargedAt: null });
      });

      it('leaves unpatched fields untouched', async () => {
        const created = await context.encounters.create(
          encounterInput(klPatient, { department: 'Cardiology' }),
        );
        const updated = await context.encounters.update(created.id, { status: 'cancelled' }, KL_ONLY);
        expect(updated?.department).toBe('Cardiology');
      });

      it('returns null and writes nothing when the scope denies it', async () => {
        const created = await context.encounters.create(
          encounterInput(klPatient, { department: 'Cardiology' }),
        );
        expect(
          await context.encounters.update(created.id, { department: 'Hacked' }, PG_ONLY),
        ).toBeNull();
        expect((await context.encounters.findById(created.id, ALL))?.department).toBe('Cardiology');
      });

      it('returns null for an unknown id', async () => {
        expect(
          await context.encounters.update(
            '99999999-9999-4999-8999-999999999999',
            { department: 'X' },
            ALL,
          ),
        ).toBeNull();
      });
    });
  });
};
```

- [ ] **Step 2: Register the suite**

Replace `packages/api/test/memory/contracts.test.ts` with:

```ts
import { describeEncounterRepositoryContract } from '../contracts/encounterRepository.contract.js';
import { describePatientRepositoryContract } from '../contracts/patientRepository.contract.js';
import { createMemoryHarness } from './memoryHarness.js';

const harness = createMemoryHarness();

describePatientRepositoryContract(harness);
describeEncounterRepositoryContract(harness);
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/memory/contracts.test.ts`
Expected: FAIL — every encounter test throws `MemoryEncounterRepository is not implemented yet`.

- [ ] **Step 4: Implement the memory adapter**

`packages/api/src/adapters/persistence/memory/encounterRepository.ts`:

```ts
import type { Encounter } from '@aethelgard/shared';
import type { BranchScope } from '../../../domain/scope.js';
import type {
  EncounterPatch,
  EncounterRepository,
  NewEncounter,
} from '../../../ports/index.js';
import type { MemoryStore } from './store.js';

const inScope = (encounter: Encounter, scope: BranchScope): boolean =>
  scope.kind === 'all' || encounter.branchId === scope.branchId;

export const createMemoryEncounterRepository = (store: MemoryStore): EncounterRepository => ({
  create: async (input: NewEncounter): Promise<Encounter> => {
    const encounter: Encounter = { ...input, dischargedAt: null };
    store.encounters.set(encounter.id, encounter);
    return { ...encounter };
  },

  findById: async (id: string, scope: BranchScope): Promise<Encounter | null> => {
    const encounter = store.encounters.get(id);
    return encounter !== undefined && inScope(encounter, scope) ? { ...encounter } : null;
  },

  listForPatient: async (patientId: string, scope: BranchScope): Promise<Encounter[]> =>
    [...store.encounters.values()]
      .filter((encounter) => encounter.patientId === patientId && inScope(encounter, scope))
      .sort(
        (left, right) =>
          Date.parse(right.admittedAt) - Date.parse(left.admittedAt) ||
          right.id.localeCompare(left.id),
      )
      .map((encounter) => ({ ...encounter })),

  update: async (
    id: string,
    patch: EncounterPatch,
    scope: BranchScope,
  ): Promise<Encounter | null> => {
    const encounter = store.encounters.get(id);
    if (encounter === undefined || !inScope(encounter, scope)) {
      return null;
    }
    const updated: Encounter = {
      ...encounter,
      ...(patch.department !== undefined ? { department: patch.department } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.dischargedAt !== undefined ? { dischargedAt: patch.dischargedAt } : {}),
    };
    store.encounters.set(id, updated);
    return { ...updated };
  },
});
```

- [ ] **Step 5: Wire it into the harness**

In `packages/api/test/memory/memoryHarness.ts`, add the import and replace the `encounters` line:

```ts
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
```

```ts
      encounters: createMemoryEncounterRepository(store),
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/memory/contracts.test.ts`
Expected: PASS — patient and encounter contracts both green.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "test(api): add EncounterRepository contract and memory adapter"
```

---

### Task 9: Observation and Attachment contracts and memory adapters

**Files:**
- Create: `packages/api/test/contracts/observationRepository.contract.ts`, `packages/api/test/contracts/attachmentRepository.contract.ts`
- Create: `packages/api/src/adapters/persistence/memory/observationRepository.ts`, `packages/api/src/adapters/persistence/memory/attachmentRepository.ts`
- Modify: `packages/api/test/memory/memoryHarness.ts`, `packages/api/test/memory/contracts.test.ts`

**Interfaces:**
- Consumes: `ObservationRepository`, `NewObservation`, `AttachmentRepository`, `NewAttachment` from `../ports/index.js`.
- Produces: `describeObservationRepositoryContract(harness)`, `describeAttachmentRepositoryContract(harness)`, `createMemoryObservationRepository(store)`, `createMemoryAttachmentRepository(store)`.

- [ ] **Step 1: Write the failing observation contract**

`packages/api/test/contracts/observationRepository.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Encounter } from '@aethelgard/shared';
import type { NewObservation } from '../../src/ports/index.js';
import { BRANCH_IDS, USER_IDS } from '../fixtures/ids.js';
import type { HarnessContext, RepositoryHarness } from './harness.js';

const T0 = '2026-08-01T08:00:00.000Z';
const T1 = '2026-08-01T09:00:00.000Z';
const T2 = '2026-08-01T10:00:00.000Z';

let sequence = 0;
const nextId = (): string => {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
};

const observationInput = (
  encounter: Encounter,
  overrides: Partial<NewObservation> = {},
): NewObservation => ({
  id: nextId(),
  encounterId: encounter.id,
  code: 'heart_rate',
  valueNum: 72,
  valueText: null,
  unit: 'bpm',
  recordedAt: T1,
  recordedBy: USER_IDS.doctorKl,
  ...overrides,
});

export const describeObservationRepositoryContract = (harness: RepositoryHarness): void => {
  describe(`ObservationRepository contract [${harness.name}]`, () => {
    let context: HarnessContext;
    let encounter: Encounter;
    let otherEncounter: Encounter;

    beforeEach(async () => {
      sequence = 0;
      context = await harness.setup();
      const patient = await context.patients.create({
        id: nextId(),
        mrn: 'KL-000001',
        name: 'Observation Subject',
        dob: '1990-01-01',
        sex: 'female',
        phone: '+60123456789',
        branchId: BRANCH_IDS.KL,
        createdAt: T0,
        updatedAt: T0,
      });
      encounter = await context.encounters.create({
        id: nextId(),
        patientId: patient.id,
        branchId: BRANCH_IDS.KL,
        type: 'inpatient',
        department: 'Cardiology',
        admittedAt: T0,
        status: 'open',
      });
      otherEncounter = await context.encounters.create({
        id: nextId(),
        patientId: patient.id,
        branchId: BRANCH_IDS.KL,
        type: 'outpatient',
        department: 'General Medicine',
        admittedAt: T0,
        status: 'open',
      });
    });

    afterEach(async () => {
      await harness.teardown(context);
    });

    it('stores a numeric observation exactly as given', async () => {
      const input = observationInput(encounter);
      expect(await context.observations.create(input)).toEqual({
        id: input.id,
        encounterId: encounter.id,
        code: 'heart_rate',
        valueNum: 72,
        valueText: null,
        unit: 'bpm',
        recordedAt: T1,
        recordedBy: USER_IDS.doctorKl,
      });
    });

    it('stores a textual observation with a null numeric value', async () => {
      const created = await context.observations.create(
        observationInput(encounter, {
          code: 'blood_pressure',
          valueNum: null,
          valueText: '120/80',
          unit: 'mmHg',
        }),
      );
      expect(created).toMatchObject({ valueNum: null, valueText: '120/80' });
    });

    it('preserves a fractional numeric value', async () => {
      const created = await context.observations.create(
        observationInput(encounter, { code: 'temperature', valueNum: 37.4, unit: '°C' }),
      );
      expect(created.valueNum).toBeCloseTo(37.4, 5);
    });

    it('stores a null unit', async () => {
      const created = await context.observations.create(
        observationInput(encounter, { unit: null }),
      );
      expect(created.unit).toBeNull();
    });

    it('lists an encounter’s observations newest recording first', async () => {
      await context.observations.create(observationInput(encounter, { recordedAt: T1 }));
      await context.observations.create(observationInput(encounter, { recordedAt: T2 }));
      const listed = await context.observations.listForEncounter(encounter.id);
      expect(listed.map((observation) => observation.recordedAt)).toEqual([T2, T1]);
    });

    it('excludes observations recorded against another encounter', async () => {
      await context.observations.create(observationInput(encounter));
      await context.observations.create(observationInput(otherEncounter));
      expect(await context.observations.listForEncounter(encounter.id)).toHaveLength(1);
    });

    it('returns an empty list for an encounter with no observations', async () => {
      expect(await context.observations.listForEncounter(otherEncounter.id)).toEqual([]);
    });
  });
};
```

- [ ] **Step 2: Write the failing attachment contract**

`packages/api/test/contracts/attachmentRepository.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Encounter } from '@aethelgard/shared';
import type { NewAttachment } from '../../src/ports/index.js';
import { BRANCH_IDS, USER_IDS } from '../fixtures/ids.js';
import type { HarnessContext, RepositoryHarness } from './harness.js';

const T0 = '2026-08-01T08:00:00.000Z';
const T1 = '2026-08-01T09:00:00.000Z';

let sequence = 0;
const nextId = (): string => {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
};

const attachmentInput = (
  encounter: Encounter,
  overrides: Partial<NewAttachment> = {},
): NewAttachment => {
  const id = overrides.id ?? nextId();
  return {
    id,
    encounterId: encounter.id,
    filename: 'discharge-summary.pdf',
    contentType: 'application/pdf',
    storageKey: `encounters/${encounter.id}/${id}`,
    uploadedBy: USER_IDS.doctorKl,
    uploadedAt: T1,
    ...overrides,
    id,
  };
};

export const describeAttachmentRepositoryContract = (harness: RepositoryHarness): void => {
  describe(`AttachmentRepository contract [${harness.name}]`, () => {
    let context: HarnessContext;
    let encounter: Encounter;
    let otherEncounter: Encounter;

    beforeEach(async () => {
      sequence = 0;
      context = await harness.setup();
      const patient = await context.patients.create({
        id: nextId(),
        mrn: 'KL-000001',
        name: 'Attachment Subject',
        dob: '1990-01-01',
        sex: 'male',
        phone: '+60123456789',
        branchId: BRANCH_IDS.KL,
        createdAt: T0,
        updatedAt: T0,
      });
      encounter = await context.encounters.create({
        id: nextId(),
        patientId: patient.id,
        branchId: BRANCH_IDS.KL,
        type: 'inpatient',
        department: 'Cardiology',
        admittedAt: T0,
        status: 'open',
      });
      otherEncounter = await context.encounters.create({
        id: nextId(),
        patientId: patient.id,
        branchId: BRANCH_IDS.KL,
        type: 'outpatient',
        department: 'General Medicine',
        admittedAt: T0,
        status: 'open',
      });
    });

    afterEach(async () => {
      await harness.teardown(context);
    });

    it('creates a pending row with an unknown size', async () => {
      const input = attachmentInput(encounter);
      expect(await context.attachments.createPending(input)).toEqual({
        id: input.id,
        encounterId: encounter.id,
        filename: 'discharge-summary.pdf',
        contentType: 'application/pdf',
        sizeBytes: null,
        storageKey: input.storageKey,
        status: 'pending',
        uploadedBy: USER_IDS.doctorKl,
        uploadedAt: T1,
      });
    });

    it('finds a pending row by id', async () => {
      const created = await context.attachments.createPending(attachmentInput(encounter));
      expect(await context.attachments.findById(created.id)).toEqual(created);
    });

    it('returns null for an unknown id', async () => {
      expect(
        await context.attachments.findById('99999999-9999-4999-8999-999999999999'),
      ).toBeNull();
    });

    it('confirms a pending row and records its size', async () => {
      const created = await context.attachments.createPending(attachmentInput(encounter));
      const confirmed = await context.attachments.confirm(created.id, 20_480);
      expect(confirmed).toMatchObject({ status: 'confirmed', sizeBytes: 20_480 });
    });

    it('returns null when confirming an unknown id', async () => {
      expect(await context.attachments.confirm('99999999-9999-4999-8999-999999999999', 1)).toBeNull();
    });

    it('returns null when confirming a row that is already confirmed', async () => {
      const created = await context.attachments.createPending(attachmentInput(encounter));
      await context.attachments.confirm(created.id, 20_480);
      expect(await context.attachments.confirm(created.id, 30_000)).toBeNull();
    });

    it('does not overwrite the recorded size on a repeat confirm', async () => {
      const created = await context.attachments.createPending(attachmentInput(encounter));
      await context.attachments.confirm(created.id, 20_480);
      await context.attachments.confirm(created.id, 30_000);
      expect((await context.attachments.findById(created.id))?.sizeBytes).toBe(20_480);
    });

    it('excludes orphaned pending rows from the listing', async () => {
      const pending = await context.attachments.createPending(attachmentInput(encounter));
      const confirmedInput = attachmentInput(encounter, { filename: 'scan.png' });
      await context.attachments.createPending(confirmedInput);
      await context.attachments.confirm(confirmedInput.id, 1_024);

      const listed = await context.attachments.listConfirmedForEncounter(encounter.id);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.filename).toBe('scan.png');
      expect(listed.map((attachment) => attachment.id)).not.toContain(pending.id);
    });

    it('excludes attachments belonging to another encounter', async () => {
      const other = attachmentInput(otherEncounter);
      await context.attachments.createPending(other);
      await context.attachments.confirm(other.id, 512);
      expect(await context.attachments.listConfirmedForEncounter(encounter.id)).toEqual([]);
    });

    it('lists newest upload first', async () => {
      const first = attachmentInput(encounter, { filename: 'first.pdf', uploadedAt: T0 });
      const second = attachmentInput(encounter, { filename: 'second.pdf', uploadedAt: T1 });
      await context.attachments.createPending(first);
      await context.attachments.createPending(second);
      await context.attachments.confirm(first.id, 1);
      await context.attachments.confirm(second.id, 2);
      const listed = await context.attachments.listConfirmedForEncounter(encounter.id);
      expect(listed.map((attachment) => attachment.filename)).toEqual(['second.pdf', 'first.pdf']);
    });
  });
};
```

- [ ] **Step 3: Register both suites and run to verify they fail**

Replace `packages/api/test/memory/contracts.test.ts` with:

```ts
import { describeAttachmentRepositoryContract } from '../contracts/attachmentRepository.contract.js';
import { describeEncounterRepositoryContract } from '../contracts/encounterRepository.contract.js';
import { describeObservationRepositoryContract } from '../contracts/observationRepository.contract.js';
import { describePatientRepositoryContract } from '../contracts/patientRepository.contract.js';
import { createMemoryHarness } from './memoryHarness.js';

const harness = createMemoryHarness();

describePatientRepositoryContract(harness);
describeEncounterRepositoryContract(harness);
describeObservationRepositoryContract(harness);
describeAttachmentRepositoryContract(harness);
```

Run: `npm test -w @aethelgard/api -- test/memory/contracts.test.ts`
Expected: FAIL — `MemoryObservationRepository is not implemented yet` and `MemoryAttachmentRepository is not implemented yet`.

- [ ] **Step 4: Implement both memory adapters**

`packages/api/src/adapters/persistence/memory/observationRepository.ts`:

```ts
import type { Observation } from '@aethelgard/shared';
import type { NewObservation, ObservationRepository } from '../../../ports/index.js';
import type { MemoryStore } from './store.js';

export const createMemoryObservationRepository = (store: MemoryStore): ObservationRepository => ({
  create: async (input: NewObservation): Promise<Observation> => {
    const observation: Observation = { ...input };
    store.observations.set(observation.id, observation);
    return { ...observation };
  },

  listForEncounter: async (encounterId: string): Promise<Observation[]> =>
    [...store.observations.values()]
      .filter((observation) => observation.encounterId === encounterId)
      .sort(
        (left, right) =>
          Date.parse(right.recordedAt) - Date.parse(left.recordedAt) ||
          right.id.localeCompare(left.id),
      )
      .map((observation) => ({ ...observation })),
});
```

`packages/api/src/adapters/persistence/memory/attachmentRepository.ts`:

```ts
import type { Attachment } from '@aethelgard/shared';
import type { AttachmentRepository, NewAttachment } from '../../../ports/index.js';
import type { MemoryStore } from './store.js';

export const createMemoryAttachmentRepository = (store: MemoryStore): AttachmentRepository => ({
  createPending: async (input: NewAttachment): Promise<Attachment> => {
    const attachment: Attachment = { ...input, sizeBytes: null, status: 'pending' };
    store.attachments.set(attachment.id, attachment);
    return { ...attachment };
  },

  /** Only a pending row may be confirmed, so a replayed confirm is a no-op returning null. */
  confirm: async (id: string, sizeBytes: number): Promise<Attachment | null> => {
    const attachment = store.attachments.get(id);
    if (attachment === undefined || attachment.status !== 'pending') {
      return null;
    }
    const confirmed: Attachment = { ...attachment, status: 'confirmed', sizeBytes };
    store.attachments.set(id, confirmed);
    return { ...confirmed };
  },

  findById: async (id: string): Promise<Attachment | null> => {
    const attachment = store.attachments.get(id);
    return attachment === undefined ? null : { ...attachment };
  },

  listConfirmedForEncounter: async (encounterId: string): Promise<Attachment[]> =>
    [...store.attachments.values()]
      .filter(
        (attachment) =>
          attachment.encounterId === encounterId && attachment.status === 'confirmed',
      )
      .sort(
        (left, right) =>
          Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt) ||
          right.id.localeCompare(left.id),
      )
      .map((attachment) => ({ ...attachment })),
});
```

- [ ] **Step 5: Wire both into the harness**

In `packages/api/test/memory/memoryHarness.ts`, add the imports and replace the two placeholder lines:

```ts
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { createMemoryAttachmentRepository } from '../../src/adapters/persistence/memory/attachmentRepository.js';
```

```ts
      observations: createMemoryObservationRepository(store),
      attachments: createMemoryAttachmentRepository(store),
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/memory/contracts.test.ts`
Expected: PASS — four contract suites; only `branches` and `audit` remain unimplemented.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "test(api): add observation and attachment contracts with memory adapters"
```

---

### Task 10: Branch and AuditLog contracts and memory adapters

Completes the persistence layer. The final step removes the `notYetImplemented` scaffold from Task 7.

**Files:**
- Create: `packages/api/test/contracts/branchRepository.contract.ts`, `packages/api/test/contracts/auditLog.contract.ts`
- Create: `packages/api/src/adapters/persistence/memory/branchRepository.ts`, `packages/api/src/adapters/persistence/memory/auditLog.ts`
- Modify: `packages/api/test/memory/memoryHarness.ts`, `packages/api/test/memory/contracts.test.ts`

**Interfaces:**
- Consumes: `BranchRepository`, `AuditLog`, `NewAuditEvent` from `../ports/index.js`.
- Produces: `describeBranchRepositoryContract(harness)`, `describeAuditLogContract(harness)`, `createMemoryBranchRepository(store)`, `createMemoryAuditLog(store)`.

- [ ] **Step 1: Write the failing branch contract**

`packages/api/test/contracts/branchRepository.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRANCH_IDS } from '../fixtures/ids.js';
import type { HarnessContext, RepositoryHarness } from './harness.js';

export const describeBranchRepositoryContract = (harness: RepositoryHarness): void => {
  describe(`BranchRepository contract [${harness.name}]`, () => {
    let context: HarnessContext;

    beforeEach(async () => {
      context = await harness.setup();
    });

    afterEach(async () => {
      await harness.teardown(context);
    });

    it('lists Aethelgard’s three campuses', async () => {
      const branches = await context.branches.listAll();
      expect(branches.map((branch) => branch.code).sort()).toEqual(['JB', 'KL', 'PG']);
    });

    it('gives every branch a human-readable name', async () => {
      const branches = await context.branches.listAll();
      for (const branch of branches) {
        expect(branch.name.length).toBeGreaterThan(0);
      }
    });

    it('resolves a branch by its seeded id', async () => {
      expect(await context.branches.findById(BRANCH_IDS.PG)).toMatchObject({
        id: BRANCH_IDS.PG,
        code: 'PG',
      });
    });

    it('resolves a branch by code, which is what MRN prefixing needs', async () => {
      expect(await context.branches.findByCode('JB')).toMatchObject({
        id: BRANCH_IDS.JB,
        code: 'JB',
      });
    });

    it('returns null for an unknown id', async () => {
      expect(await context.branches.findById('99999999-9999-4999-8999-999999999999')).toBeNull();
    });
  });
};
```

- [ ] **Step 2: Write the failing audit contract**

`packages/api/test/contracts/auditLog.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewAuditEvent } from '../../src/ports/index.js';
import { USER_IDS } from '../fixtures/ids.js';
import type { HarnessContext, RepositoryHarness } from './harness.js';

const PATIENT_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_PATIENT_ID = '00000000-0000-4000-8000-0000000000a2';
const ENCOUNTER_ID = '00000000-0000-4000-8000-0000000000b1';

let sequence = 0;
const event = (overrides: Partial<NewAuditEvent> = {}): NewAuditEvent => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    actorUserId: USER_IDS.doctorKl,
    action: 'patient.create',
    entityType: 'patient',
    entityId: PATIENT_ID,
    occurredAt: `2026-08-07T10:0${sequence}:00.000Z`,
    ...overrides,
  };
};

export const describeAuditLogContract = (harness: RepositoryHarness): void => {
  describe(`AuditLog contract [${harness.name}]`, () => {
    let context: HarnessContext;

    beforeEach(async () => {
      sequence = 0;
      context = await harness.setup();
    });

    afterEach(async () => {
      await harness.teardown(context);
    });

    it('records an event and returns it for its entity', async () => {
      const recorded = event();
      await context.audit.record(recorded);
      expect(await context.audit.listForEntity('patient', PATIENT_ID)).toEqual([recorded]);
    });

    it('appends rather than replaces, so a full history survives', async () => {
      await context.audit.record(event({ action: 'patient.create' }));
      await context.audit.record(event({ action: 'patient.update' }));
      await context.audit.record(event({ action: 'patient.delete' }));
      const history = await context.audit.listForEntity('patient', PATIENT_ID);
      expect(history).toHaveLength(3);
    });

    it('returns the newest event first', async () => {
      await context.audit.record(event({ action: 'patient.create' }));
      await context.audit.record(event({ action: 'patient.update' }));
      const history = await context.audit.listForEntity('patient', PATIENT_ID);
      expect(history.map((entry) => entry.action)).toEqual(['patient.update', 'patient.create']);
    });

    it('scopes the history to one entity id', async () => {
      await context.audit.record(event({ entityId: PATIENT_ID }));
      await context.audit.record(event({ entityId: OTHER_PATIENT_ID }));
      expect(await context.audit.listForEntity('patient', PATIENT_ID)).toHaveLength(1);
    });

    it('scopes the history to one entity type', async () => {
      await context.audit.record(event({ entityType: 'patient', entityId: PATIENT_ID }));
      await context.audit.record(
        event({ entityType: 'encounter', entityId: ENCOUNTER_ID, action: 'encounter.create' }),
      );
      expect(await context.audit.listForEntity('encounter', ENCOUNTER_ID)).toHaveLength(1);
    });

    it('returns an empty history for an entity that was never touched', async () => {
      expect(await context.audit.listForEntity('attachment', PATIENT_ID)).toEqual([]);
    });
  });
};
```

- [ ] **Step 3: Register both suites and run to verify they fail**

Replace `packages/api/test/memory/contracts.test.ts` with the final version:

```ts
import { describeAttachmentRepositoryContract } from '../contracts/attachmentRepository.contract.js';
import { describeAuditLogContract } from '../contracts/auditLog.contract.js';
import { describeBranchRepositoryContract } from '../contracts/branchRepository.contract.js';
import { describeEncounterRepositoryContract } from '../contracts/encounterRepository.contract.js';
import { describeObservationRepositoryContract } from '../contracts/observationRepository.contract.js';
import { describePatientRepositoryContract } from '../contracts/patientRepository.contract.js';
import { createMemoryHarness } from './memoryHarness.js';

const harness = createMemoryHarness();

describeBranchRepositoryContract(harness);
describePatientRepositoryContract(harness);
describeEncounterRepositoryContract(harness);
describeObservationRepositoryContract(harness);
describeAttachmentRepositoryContract(harness);
describeAuditLogContract(harness);
```

Run: `npm test -w @aethelgard/api -- test/memory/contracts.test.ts`
Expected: FAIL — `MemoryBranchRepository is not implemented yet` and `MemoryAuditLog is not implemented yet`.

- [ ] **Step 4: Implement both memory adapters**

`packages/api/src/adapters/persistence/memory/branchRepository.ts`:

```ts
import type { Branch, BranchCode } from '@aethelgard/shared';
import type { BranchRepository } from '../../../ports/index.js';
import type { MemoryStore } from './store.js';

export const createMemoryBranchRepository = (store: MemoryStore): BranchRepository => ({
  listAll: async (): Promise<Branch[]> =>
    [...store.branches.values()]
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((branch) => ({ ...branch })),

  findById: async (id: string): Promise<Branch | null> => {
    const branch = store.branches.get(id);
    return branch === undefined ? null : { ...branch };
  },

  findByCode: async (code: BranchCode): Promise<Branch | null> => {
    for (const branch of store.branches.values()) {
      if (branch.code === code) {
        return { ...branch };
      }
    }
    return null;
  },
});
```

`packages/api/src/adapters/persistence/memory/auditLog.ts`:

```ts
import type { AuditEntityType, AuditEvent, AuditLog, NewAuditEvent } from '../../../ports/index.js';
import type { MemoryStore } from './store.js';

export const createMemoryAuditLog = (store: MemoryStore): AuditLog => ({
  record: async (event: NewAuditEvent): Promise<void> => {
    store.auditEvents.push({ ...event });
  },

  listForEntity: async (
    entityType: AuditEntityType,
    entityId: string,
  ): Promise<AuditEvent[]> =>
    store.auditEvents
      .filter((event) => event.entityType === entityType && event.entityId === entityId)
      .sort(
        (left, right) =>
          Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
          right.id.localeCompare(left.id),
      )
      .map((event) => ({ ...event })),
});
```

- [ ] **Step 5: Replace the harness with its final form**

Rewrite `packages/api/test/memory/memoryHarness.ts` in full. The `notYetImplemented` proxy is deleted.

```ts
import { createMemoryStore } from '../../src/adapters/persistence/memory/store.js';
import { createMemoryAttachmentRepository } from '../../src/adapters/persistence/memory/attachmentRepository.js';
import { createMemoryAuditLog } from '../../src/adapters/persistence/memory/auditLog.js';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import type { HarnessContext, RepositoryHarness } from '../contracts/harness.js';

export const createMemoryHarness = (): RepositoryHarness => ({
  name: 'memory',
  setup: async (): Promise<HarnessContext> => {
    const store = createMemoryStore();
    return {
      branches: createMemoryBranchRepository(store),
      patients: createMemoryPatientRepository(store),
      encounters: createMemoryEncounterRepository(store),
      observations: createMemoryObservationRepository(store),
      attachments: createMemoryAttachmentRepository(store),
      audit: createMemoryAuditLog(store),
    };
  },
  teardown: async (): Promise<void> => {
    // The store is discarded with the context; nothing to release.
  },
});
```

- [ ] **Step 6: Run the full suite to verify it passes**

Run: `npm test -w @aethelgard/api`
Expected: PASS — six contract suites plus every domain suite.

- [ ] **Step 7: Confirm no scaffold remains**

Run: `git grep -n "notYetImplemented" -- packages` (PowerShell: `git grep -n notYetImplemented -- packages`)
Expected: no matches. If any appear, a repository was left unimplemented — go back and finish it.

- [ ] **Step 8: Commit**

```bash
git add packages/api
git commit -m "test(api): complete the memory persistence layer against all six contracts"
```

---

### Task 11: PatientService

The first use case. Establishes the pattern every later service follows: derive scope, validate through the domain, call ports, write an audit event.

**Files:**
- Create: `packages/api/src/services/patientService.ts`
- Test: `packages/api/test/services/patientService.test.ts`

**Interfaces:**
- Consumes: `PatientRepository`, `BranchRepository`, `AuditLog` from `../ports/index.js`; `branchScopeFor`, `assertBranchWritable` from `../domain/scope.js`; `assertValidDateOfBirth`, `generateMrnCandidate` from `../domain/patient.js`; `ConflictError`, `NotFoundError` from `../domain/errors.js`.
- Produces:
  - `type PatientServiceDeps = { patients: PatientRepository; branches: BranchRepository; audit: AuditLog; now: () => Date; newId: () => string; mrnSequence?: () => number }`
  - `type PatientService = { create(principal, input: CreatePatientInput): Promise<Patient>; getById(principal, id: string): Promise<Patient>; search(principal, query: PaginationQuery & { search?: string }): Promise<Page<Patient>>; update(principal, id: string, patch: UpdatePatientInput): Promise<Patient>; softDelete(principal, id: string): Promise<void> }`
  - `createPatientService(deps: PatientServiceDeps): PatientService`
  - `MRN_MAX_ATTEMPTS = 5`

- [ ] **Step 1: Write the failing test**

`packages/api/test/services/patientService.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createMemoryStore } from '../../src/adapters/persistence/memory/store.js';
import { createMemoryAuditLog } from '../../src/adapters/persistence/memory/auditLog.js';
import { createMemoryBranchRepository } from '../../src/adapters/persistence/memory/branchRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import {
  MRN_MAX_ATTEMPTS,
  createPatientService,
  type PatientService,
  type PatientServiceDeps,
} from '../../src/services/patientService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';
import { principalFor } from '../fixtures/principals.js';

const NOW = new Date('2026-08-07T10:00:00.000Z');

const validInput = {
  name: 'Nurul Aisyah binti Rahman',
  dob: '1985-03-14',
  sex: 'female',
  phone: '+60123456789',
} as const;

let deps: PatientServiceDeps;
let service: PatientService;
let idCounter: number;

const build = (overrides: Partial<PatientServiceDeps> = {}): void => {
  const store = createMemoryStore();
  idCounter = 0;
  deps = {
    patients: createMemoryPatientRepository(store),
    branches: createMemoryBranchRepository(store),
    audit: createMemoryAuditLog(store),
    now: () => NOW,
    newId: () => {
      idCounter += 1;
      return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
    },
    ...overrides,
  };
  service = createPatientService(deps);
};

beforeEach(() => {
  build();
});

describe('create', () => {
  it('assigns an MRN prefixed with the actor’s branch', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    expect(created.mrn).toMatch(/^KL-\d{6}$/);
  });

  it('files the patient in the actor’s branch and stamps the timestamps', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    expect(created).toMatchObject({
      branchId: BRANCH_IDS.KL,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      deletedAt: null,
    });
  });

  it('lets an admin file a patient in another branch', async () => {
    const created = await service.create(principalFor('admin'), {
      ...validInput,
      branchId: BRANCH_IDS.JB,
    });
    expect(created.branchId).toBe(BRANCH_IDS.JB);
    expect(created.mrn).toMatch(/^JB-\d{6}$/);
  });

  it('refuses a non-admin naming another branch', async () => {
    await expect(
      service.create(principalFor('doctor'), { ...validInput, branchId: BRANCH_IDS.PG }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an unknown branch id with NotFoundError', async () => {
    await expect(
      service.create(principalFor('admin'), {
        ...validInput,
        branchId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a future date of birth', async () => {
    await expect(
      service.create(principalFor('doctor'), { ...validInput, dob: '2030-01-01' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('retries past an MRN collision', async () => {
    const sequences = [7, 7, 8];
    let call = 0;
    build({
      mrnSequence: () => {
        const value = sequences[call] ?? 99;
        call += 1;
        return value;
      },
    });
    const first = await service.create(principalFor('doctor'), validInput);
    const second = await service.create(principalFor('doctor'), validInput);
    expect(first.mrn).toBe('KL-000007');
    expect(second.mrn).toBe('KL-000008');
  });

  it('gives up with ConflictError after the retry budget is spent', async () => {
    build({ mrnSequence: () => 7 });
    await service.create(principalFor('doctor'), validInput);
    await expect(service.create(principalFor('doctor'), validInput)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('spends no more than MRN_MAX_ATTEMPTS candidates', async () => {
    let calls = 0;
    build({
      mrnSequence: () => {
        calls += 1;
        return 7;
      },
    });
    await service.create(principalFor('doctor'), validInput);
    calls = 0;
    await service.create(principalFor('doctor'), validInput).catch(() => undefined);
    expect(calls).toBe(MRN_MAX_ATTEMPTS);
  });

  it('writes a patient.create audit event naming the actor', async () => {
    const principal = principalFor('doctor');
    const created = await service.create(principal, validInput);
    const history = await deps.audit.listForEntity('patient', created.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      action: 'patient.create',
      actorUserId: principal.userId,
      entityType: 'patient',
      entityId: created.id,
      occurredAt: NOW.toISOString(),
    });
  });
});

describe('getById', () => {
  it('returns an in-branch patient', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    expect(await service.getById(principalFor('nurse'), created.id)).toEqual(created);
  });

  it('throws NotFoundError — not ForbiddenError — for another branch’s patient', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    await expect(
      service.getById(principalFor('doctor', BRANCH_IDS.PG), created.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(
      service.getById(principalFor('admin'), '99999999-9999-4999-8999-999999999999'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('search', () => {
  it('returns only the actor’s branch', async () => {
    await service.create(principalFor('doctor'), { ...validInput, name: 'KL Patient' });
    await service.create(principalFor('admin'), {
      ...validInput,
      name: 'PG Patient',
      branchId: BRANCH_IDS.PG,
    });
    const page = await service.search(principalFor('doctor'), { page: 1, pageSize: 20 });
    expect(page.items.map((patient) => patient.name)).toEqual(['KL Patient']);
    expect(page.total).toBe(1);
  });

  it('returns every branch for an admin', async () => {
    await service.create(principalFor('doctor'), { ...validInput, name: 'KL Patient' });
    await service.create(principalFor('admin'), {
      ...validInput,
      name: 'PG Patient',
      branchId: BRANCH_IDS.PG,
    });
    const page = await service.search(principalFor('admin'), { page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
  });

  it('passes the search term through', async () => {
    await service.create(principalFor('doctor'), { ...validInput, name: 'Ahmad Faizal' });
    await service.create(principalFor('doctor'), { ...validInput, name: 'Siti Aminah' });
    const page = await service.search(principalFor('doctor'), {
      search: 'ahmad',
      page: 1,
      pageSize: 20,
    });
    expect(page.total).toBe(1);
  });
});

describe('update', () => {
  it('applies the patch and advances updatedAt without touching createdAt', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    const later = new Date('2026-08-08T10:00:00.000Z');
    deps.now = () => later;
    const updated = await service.update(principalFor('doctor'), created.id, {
      phone: '+60111111111',
    });
    expect(updated).toMatchObject({
      phone: '+60111111111',
      updatedAt: later.toISOString(),
      createdAt: NOW.toISOString(),
    });
  });

  it('rejects a future date of birth in a patch', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    await expect(
      service.update(principalFor('doctor'), created.id, { dob: '2030-01-01' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for another branch’s patient', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    await expect(
      service.update(principalFor('doctor', BRANCH_IDS.PG), created.id, { phone: '+60111111111' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes a patient.update audit event', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    await service.update(principalFor('doctor'), created.id, { phone: '+60111111111' });
    const history = await deps.audit.listForEntity('patient', created.id);
    expect(history.map((entry) => entry.action)).toContain('patient.update');
  });
});

describe('softDelete', () => {
  it('hides the patient from subsequent reads', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    await service.softDelete(principalFor('records_clerk'), created.id);
    await expect(service.getById(principalFor('admin'), created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError for another branch’s patient', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    await expect(
      service.softDelete(principalFor('doctor', BRANCH_IDS.PG), created.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes a patient.delete audit event that survives the deletion', async () => {
    const created = await service.create(principalFor('doctor'), validInput);
    await service.softDelete(principalFor('doctor'), created.id);
    const history = await deps.audit.listForEntity('patient', created.id);
    expect(history.map((entry) => entry.action)).toContain('patient.delete');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/services/patientService.test.ts`
Expected: FAIL — cannot resolve `../../src/services/patientService.js`.

- [ ] **Step 3: Implement the service**

`packages/api/src/services/patientService.ts`:

```ts
import type {
  CreatePatientInput,
  Page,
  PaginationQuery,
  Patient,
  Principal,
  UpdatePatientInput,
} from '@aethelgard/shared';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import { assertValidDateOfBirth, generateMrnCandidate } from '../domain/patient.js';
import { assertBranchWritable, branchScopeFor } from '../domain/scope.js';
import type { AuditLog, BranchRepository, PatientRepository } from '../ports/index.js';

/** Candidate MRNs are random, so a collision is rare; five attempts is generous. */
export const MRN_MAX_ATTEMPTS = 5;

export type PatientServiceDeps = {
  patients: PatientRepository;
  branches: BranchRepository;
  audit: AuditLog;
  now: () => Date;
  newId: () => string;
  /** Injectable so the collision path is testable. Defaults to the domain's random source. */
  mrnSequence?: () => number;
};

export type PatientSearchInput = PaginationQuery & { search?: string };

export type PatientService = {
  create(principal: Principal, input: CreatePatientInput): Promise<Patient>;
  getById(principal: Principal, id: string): Promise<Patient>;
  search(principal: Principal, query: PatientSearchInput): Promise<Page<Patient>>;
  update(principal: Principal, id: string, patch: UpdatePatientInput): Promise<Patient>;
  softDelete(principal: Principal, id: string): Promise<void>;
};

export const createPatientService = (deps: PatientServiceDeps): PatientService => {
  const resolveBranch = async (principal: Principal, requested: string | undefined) => {
    const branchId = requested ?? principal.branchId;
    assertBranchWritable(principal, branchId);
    const branch = await deps.branches.findById(branchId);
    if (branch === null) {
      throw new NotFoundError('branch', branchId);
    }
    return branch;
  };

  return {
    create: async (principal, input) => {
      const branch = await resolveBranch(principal, input.branchId);
      assertValidDateOfBirth(input.dob, deps.now());
      const timestamp = deps.now().toISOString();

      let lastConflict: ConflictError | null = null;
      for (let attempt = 0; attempt < MRN_MAX_ATTEMPTS; attempt += 1) {
        const id = deps.newId();
        try {
          const patient = await deps.patients.create({
            id,
            mrn: generateMrnCandidate(branch.code, deps.mrnSequence),
            name: input.name,
            dob: input.dob,
            sex: input.sex,
            phone: input.phone,
            branchId: branch.id,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          await deps.audit.record({
            id: deps.newId(),
            actorUserId: principal.userId,
            action: 'patient.create',
            entityType: 'patient',
            entityId: patient.id,
            occurredAt: timestamp,
          });
          return patient;
        } catch (error) {
          if (!(error instanceof ConflictError)) {
            throw error;
          }
          // A collision on the random MRN is expected and recoverable; retry.
          lastConflict = error;
        }
      }
      throw new ConflictError(
        `Could not allocate a free MRN for branch ${branch.code} after ${MRN_MAX_ATTEMPTS} attempts`,
        { branchCode: branch.code, cause: lastConflict?.details ?? {} },
      );
    },

    getById: async (principal, id) => {
      const patient = await deps.patients.findById(id, branchScopeFor(principal));
      if (patient === null) {
        // Out-of-branch reads are indistinguishable from missing records by design (spec §6.2).
        throw new NotFoundError('patient', id);
      }
      return patient;
    },

    search: async (principal, query) =>
      deps.patients.search(
        { search: query.search, page: query.page, pageSize: query.pageSize },
        branchScopeFor(principal),
      ),

    update: async (principal, id, patch) => {
      if (patch.dob !== undefined) {
        assertValidDateOfBirth(patch.dob, deps.now());
      }
      const timestamp = deps.now().toISOString();
      const updated = await deps.patients.update(
        id,
        { ...patch, updatedAt: timestamp },
        branchScopeFor(principal),
      );
      if (updated === null) {
        throw new NotFoundError('patient', id);
      }
      await deps.audit.record({
        id: deps.newId(),
        actorUserId: principal.userId,
        action: 'patient.update',
        entityType: 'patient',
        entityId: id,
        occurredAt: timestamp,
      });
      return updated;
    },

    softDelete: async (principal, id) => {
      const timestamp = deps.now().toISOString();
      const deleted = await deps.patients.softDelete(id, timestamp, branchScopeFor(principal));
      if (!deleted) {
        throw new NotFoundError('patient', id);
      }
      await deps.audit.record({
        id: deps.newId(),
        actorUserId: principal.userId,
        action: 'patient.delete',
        entityType: 'patient',
        entityId: id,
        occurredAt: timestamp,
      });
    },
  };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/services/patientService.test.ts`
Expected: PASS — 22 tests.

- [ ] **Step 5: Verify the typecheck passes**

Run: `npm run typecheck -w @aethelgard/api`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): add PatientService with MRN allocation and audit"
```

---

### Task 12: EncounterService

**Files:**
- Create: `packages/api/src/services/encounterService.ts`
- Test: `packages/api/test/services/encounterService.test.ts`

**Interfaces:**
- Consumes: `EncounterRepository`, `PatientRepository`, `AuditLog` from `../ports/index.js`; `resolveEncounterTransition` from `../domain/encounter.js`; `branchScopeFor` from `../domain/scope.js`; `NotFoundError` from `../domain/errors.js`.
- Produces:
  - `type EncounterServiceDeps = { encounters: EncounterRepository; patients: PatientRepository; audit: AuditLog; now: () => Date; newId: () => string }`
  - `type EncounterService = { create(principal, patientId: string, input: CreateEncounterInput): Promise<Encounter>; listForPatient(principal, patientId: string): Promise<Encounter[]>; getById(principal, id: string): Promise<Encounter>; patch(principal, id: string, patch: PatchEncounterInput): Promise<Encounter> }`
  - `createEncounterService(deps: EncounterServiceDeps): EncounterService`

An encounter inherits its branch from its patient — a client never supplies one. That is what keeps the denormalised `encounters.branch_id` consistent with `patients.branch_id`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/services/encounterService.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Patient } from '@aethelgard/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createMemoryStore } from '../../src/adapters/persistence/memory/store.js';
import { createMemoryAuditLog } from '../../src/adapters/persistence/memory/auditLog.js';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { createMemoryPatientRepository } from '../../src/adapters/persistence/memory/patientRepository.js';
import {
  createEncounterService,
  type EncounterService,
  type EncounterServiceDeps,
} from '../../src/services/encounterService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';
import { principalFor } from '../fixtures/principals.js';

const NOW = new Date('2026-08-07T10:00:00.000Z');

let deps: EncounterServiceDeps;
let service: EncounterService;
let klPatient: Patient;
let pgPatient: Patient;
let idCounter = 0;

const nextId = (): string => {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
};

beforeEach(async () => {
  const store = createMemoryStore();
  idCounter = 0;
  deps = {
    encounters: createMemoryEncounterRepository(store),
    patients: createMemoryPatientRepository(store),
    audit: createMemoryAuditLog(store),
    now: () => NOW,
    newId: nextId,
  };
  service = createEncounterService(deps);

  klPatient = await deps.patients.create({
    id: nextId(),
    mrn: 'KL-000001',
    name: 'KL Patient',
    dob: '1990-01-01',
    sex: 'female',
    phone: '+60123456789',
    branchId: BRANCH_IDS.KL,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
  pgPatient = await deps.patients.create({
    id: nextId(),
    mrn: 'PG-000001',
    name: 'PG Patient',
    dob: '1990-01-01',
    sex: 'male',
    phone: '+60123456789',
    branchId: BRANCH_IDS.PG,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
});

describe('create', () => {
  const input = { type: 'inpatient', department: 'Cardiology', status: 'open' } as const;

  it('inherits the patient’s branch rather than trusting the caller', async () => {
    const created = await service.create(principalFor('admin'), pgPatient.id, input);
    expect(created.branchId).toBe(BRANCH_IDS.PG);
  });

  it('defaults admittedAt to now and opens the encounter', async () => {
    const created = await service.create(principalFor('doctor'), klPatient.id, input);
    expect(created).toMatchObject({
      admittedAt: NOW.toISOString(),
      status: 'open',
      dischargedAt: null,
    });
  });

  it('honours an explicit admission time', async () => {
    const admittedAt = '2026-08-01T08:00:00.000Z';
    const created = await service.create(principalFor('doctor'), klPatient.id, {
      ...input,
      admittedAt,
    });
    expect(created.admittedAt).toBe(admittedAt);
  });

  it('throws NotFoundError when the patient is in another branch', async () => {
    await expect(
      service.create(principalFor('doctor'), pgPatient.id, input),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an unknown patient', async () => {
    await expect(
      service.create(principalFor('admin'), '99999999-9999-4999-8999-999999999999', input),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes an encounter.create audit event', async () => {
    const principal = principalFor('doctor');
    const created = await service.create(principal, klPatient.id, input);
    const history = await deps.audit.listForEntity('encounter', created.id);
    expect(history[0]).toMatchObject({
      action: 'encounter.create',
      actorUserId: principal.userId,
      entityId: created.id,
    });
  });
});

describe('listForPatient', () => {
  it('returns the patient’s encounters', async () => {
    await service.create(principalFor('doctor'), klPatient.id, {
      type: 'outpatient',
      department: 'General Medicine',
      status: 'open',
    });
    expect(await service.listForPatient(principalFor('nurse'), klPatient.id)).toHaveLength(1);
  });

  it('throws NotFoundError rather than an empty list for another branch’s patient', async () => {
    await expect(
      service.listForPatient(principalFor('doctor'), pgPatient.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getById', () => {
  it('returns an in-branch encounter', async () => {
    const created = await service.create(principalFor('doctor'), klPatient.id, {
      type: 'emergency',
      department: 'A&E',
      status: 'open',
    });
    expect(await service.getById(principalFor('nurse'), created.id)).toEqual(created);
  });

  it('throws NotFoundError for another branch’s encounter', async () => {
    const created = await service.create(principalFor('admin'), pgPatient.id, {
      type: 'emergency',
      department: 'A&E',
      status: 'open',
    });
    await expect(service.getById(principalFor('doctor'), created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('patch', () => {
  const openInput = { type: 'inpatient', department: 'Cardiology', status: 'open' } as const;

  it('discharges an open encounter and stamps the time', async () => {
    const created = await service.create(principalFor('doctor'), klPatient.id, openInput);
    const discharged = await service.patch(principalFor('doctor'), created.id, {
      status: 'discharged',
    });
    expect(discharged).toMatchObject({ status: 'discharged', dischargedAt: NOW.toISOString() });
  });

  it('moves an encounter to another department', async () => {
    const created = await service.create(principalFor('doctor'), klPatient.id, openInput);
    const moved = await service.patch(principalFor('doctor'), created.id, {
      department: 'Neurology',
    });
    expect(moved.department).toBe('Neurology');
  });

  it('refuses to modify an already discharged encounter', async () => {
    const created = await service.create(principalFor('doctor'), klPatient.id, openInput);
    await service.patch(principalFor('doctor'), created.id, { status: 'discharged' });
    await expect(
      service.patch(principalFor('doctor'), created.id, { department: 'ICU' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a discharge earlier than the admission', async () => {
    const created = await service.create(principalFor('doctor'), klPatient.id, {
      ...openInput,
      admittedAt: '2026-08-06T08:00:00.000Z',
    });
    await expect(
      service.patch(principalFor('doctor'), created.id, {
        status: 'discharged',
        dischargedAt: '2026-08-05T08:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for another branch’s encounter', async () => {
    const created = await service.create(principalFor('admin'), pgPatient.id, openInput);
    await expect(
      service.patch(principalFor('doctor'), created.id, { department: 'ICU' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes an encounter.update audit event', async () => {
    const created = await service.create(principalFor('doctor'), klPatient.id, openInput);
    await service.patch(principalFor('doctor'), created.id, { status: 'discharged' });
    const history = await deps.audit.listForEntity('encounter', created.id);
    expect(history.map((entry) => entry.action)).toContain('encounter.update');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/services/encounterService.test.ts`
Expected: FAIL — cannot resolve `../../src/services/encounterService.js`.

- [ ] **Step 3: Implement the service**

`packages/api/src/services/encounterService.ts`:

```ts
import type {
  CreateEncounterInput,
  Encounter,
  PatchEncounterInput,
  Principal,
} from '@aethelgard/shared';
import { NotFoundError } from '../domain/errors.js';
import { resolveEncounterTransition } from '../domain/encounter.js';
import { branchScopeFor } from '../domain/scope.js';
import type { AuditLog, EncounterRepository, PatientRepository } from '../ports/index.js';

export type EncounterServiceDeps = {
  encounters: EncounterRepository;
  patients: PatientRepository;
  audit: AuditLog;
  now: () => Date;
  newId: () => string;
};

export type EncounterService = {
  create(
    principal: Principal,
    patientId: string,
    input: CreateEncounterInput,
  ): Promise<Encounter>;
  listForPatient(principal: Principal, patientId: string): Promise<Encounter[]>;
  getById(principal: Principal, id: string): Promise<Encounter>;
  patch(principal: Principal, id: string, patch: PatchEncounterInput): Promise<Encounter>;
};

export const createEncounterService = (deps: EncounterServiceDeps): EncounterService => {
  /** Resolving the patient in scope is what gates every encounter operation. */
  const requirePatient = async (principal: Principal, patientId: string) => {
    const patient = await deps.patients.findById(patientId, branchScopeFor(principal));
    if (patient === null) {
      throw new NotFoundError('patient', patientId);
    }
    return patient;
  };

  const requireEncounter = async (principal: Principal, id: string): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id, branchScopeFor(principal));
    if (encounter === null) {
      throw new NotFoundError('encounter', id);
    }
    return encounter;
  };

  return {
    create: async (principal, patientId, input) => {
      const patient = await requirePatient(principal, patientId);
      const timestamp = deps.now().toISOString();
      const encounter = await deps.encounters.create({
        id: deps.newId(),
        patientId: patient.id,
        // Never from the caller: the encounter's branch is the patient's branch.
        branchId: patient.branchId,
        type: input.type,
        department: input.department,
        admittedAt: input.admittedAt ?? timestamp,
        status: input.status,
      });
      await deps.audit.record({
        id: deps.newId(),
        actorUserId: principal.userId,
        action: 'encounter.create',
        entityType: 'encounter',
        entityId: encounter.id,
        occurredAt: timestamp,
      });
      return encounter;
    },

    listForPatient: async (principal, patientId) => {
      await requirePatient(principal, patientId);
      return deps.encounters.listForPatient(patientId, branchScopeFor(principal));
    },

    getById: async (principal, id) => requireEncounter(principal, id),

    patch: async (principal, id, patch) => {
      const encounter = await requireEncounter(principal, id);
      const timestamp = deps.now().toISOString();
      const transition = resolveEncounterTransition(encounter, patch, timestamp);
      const updated = await deps.encounters.update(id, transition, branchScopeFor(principal));
      if (updated === null) {
        // The row was visible a moment ago; losing it here means a concurrent change.
        throw new NotFoundError('encounter', id);
      }
      await deps.audit.record({
        id: deps.newId(),
        actorUserId: principal.userId,
        action: 'encounter.update',
        entityType: 'encounter',
        entityId: id,
        occurredAt: timestamp,
      });
      return updated;
    },
  };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/services/encounterService.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add EncounterService with branch inheritance and discharge rules"
```

---

### Task 13: ObservationService

**Files:**
- Create: `packages/api/src/services/observationService.ts`
- Test: `packages/api/test/services/observationService.test.ts`

**Interfaces:**
- Consumes: `ObservationRepository`, `EncounterRepository`, `AuditLog` from `../ports/index.js`; `resolveObservationValue` from `../domain/observation.js`; `branchScopeFor` from `../domain/scope.js`; `NotFoundError` from `../domain/errors.js`.
- Produces:
  - `type ObservationServiceDeps = { observations: ObservationRepository; encounters: EncounterRepository; audit: AuditLog; now: () => Date; newId: () => string }`
  - `type ObservationService = { create(principal, encounterId: string, input: CreateObservationInput): Promise<Observation>; listForEncounter(principal, encounterId: string): Promise<Observation[]> }`
  - `createObservationService(deps: ObservationServiceDeps): ObservationService`

`ObservationRepository` is unscoped, so this service is the only thing standing between a caller and another branch's vitals. Resolving the parent encounter in scope first is not optional.

- [ ] **Step 1: Write the failing test**

`packages/api/test/services/observationService.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Encounter } from '@aethelgard/shared';
import { NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createMemoryStore } from '../../src/adapters/persistence/memory/store.js';
import { createMemoryAuditLog } from '../../src/adapters/persistence/memory/auditLog.js';
import { createMemoryEncounterRepository } from '../../src/adapters/persistence/memory/encounterRepository.js';
import { createMemoryObservationRepository } from '../../src/adapters/persistence/memory/observationRepository.js';
import {
  createObservationService,
  type ObservationService,
  type ObservationServiceDeps,
} from '../../src/services/observationService.js';
import { BRANCH_IDS } from '../fixtures/ids.js';
import { principalFor } from '../fixtures/principals.js';

const NOW = new Date('2026-08-07T10:00:00.000Z');

let deps: ObservationServiceDeps;
let service: ObservationService;
let klEncounter: Encounter;
let pgEncounter: Encounter;
let idCounter = 0;

const nextId = (): string => {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
};

beforeEach(async () => {
  const store = createMemoryStore();
  idCounter = 0;
  deps = {
    observations: createMemoryObservationRepository(store),
    encounters: createMemoryEncounterRepository(store),
    audit: createMemoryAuditLog(store),
    now: () => NOW,
    newId: nextId,
  };
  service = createObservationService(deps);

  klEncounter = await deps.encounters.create({
    id: nextId(),
    patientId: nextId(),
    branchId: BRANCH_IDS.KL,
    type: 'inpatient',
    department: 'Cardiology',
    admittedAt: NOW.toISOString(),
    status: 'open',
  });
  pgEncounter = await deps.encounters.create({
    id: nextId(),
    patientId: nextId(),
    branchId: BRANCH_IDS.PG,
    type: 'inpatient',
    department: 'Cardiology',
    admittedAt: NOW.toISOString(),
    status: 'open',
  });
});

describe('create', () => {
  it('normalises a numeric observation and defaults its unit', async () => {
    const created = await service.create(principalFor('nurse'), klEncounter.id, {
      code: 'heart_rate',
      valueNum: 72,
    });
    expect(created).toMatchObject({
      code: 'heart_rate',
      valueNum: 72,
      valueText: null,
      unit: 'bpm',
    });
  });

  it('normalises a blood pressure reading', async () => {
    const created = await service.create(principalFor('nurse'), klEncounter.id, {
      code: 'blood_pressure',
      valueText: '120/80',
    });
    expect(created).toMatchObject({ valueNum: null, valueText: '120/80', unit: 'mmHg' });
  });

  it('attributes the recording to the actor and stamps the time', async () => {
    const principal = principalFor('nurse');
    const created = await service.create(principal, klEncounter.id, {
      code: 'spo2',
      valueNum: 98,
    });
    expect(created).toMatchObject({
      recordedBy: principal.userId,
      recordedAt: NOW.toISOString(),
      encounterId: klEncounter.id,
    });
  });

  it('honours an explicit recording time', async () => {
    const recordedAt = '2026-08-07T09:30:00.000Z';
    const created = await service.create(principalFor('nurse'), klEncounter.id, {
      code: 'weight',
      valueNum: 68.4,
      recordedAt,
    });
    expect(created.recordedAt).toBe(recordedAt);
  });

  it('rejects a clinically implausible value', async () => {
    await expect(
      service.create(principalFor('nurse'), klEncounter.id, { code: 'spo2', valueNum: 250 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for an encounter in another branch', async () => {
    await expect(
      service.create(principalFor('nurse'), pgEncounter.id, { code: 'heart_rate', valueNum: 72 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes nothing when the encounter is out of scope', async () => {
    await service
      .create(principalFor('nurse'), pgEncounter.id, { code: 'heart_rate', valueNum: 72 })
      .catch(() => undefined);
    expect(await deps.observations.listForEncounter(pgEncounter.id)).toEqual([]);
  });

  it('throws NotFoundError for an unknown encounter', async () => {
    await expect(
      service.create(principalFor('admin'), '99999999-9999-4999-8999-999999999999', {
        code: 'heart_rate',
        valueNum: 72,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes an observation.create audit event', async () => {
    const created = await service.create(principalFor('nurse'), klEncounter.id, {
      code: 'heart_rate',
      valueNum: 72,
    });
    const history = await deps.audit.listForEntity('observation', created.id);
    expect(history[0]).toMatchObject({ action: 'observation.create', entityId: created.id });
  });
});

describe('listForEncounter', () => {
  it('returns the encounter’s observations', async () => {
    await service.create(principalFor('nurse'), klEncounter.id, {
      code: 'heart_rate',
      valueNum: 72,
    });
    expect(await service.listForEncounter(principalFor('doctor'), klEncounter.id)).toHaveLength(1);
  });

  it('throws NotFoundError for an encounter in another branch', async () => {
    await expect(
      service.listForEncounter(principalFor('doctor'), pgEncounter.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns an empty list for an encounter with no observations', async () => {
    expect(await service.listForEncounter(principalFor('doctor'), klEncounter.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/services/observationService.test.ts`
Expected: FAIL — cannot resolve `../../src/services/observationService.js`.

- [ ] **Step 3: Implement the service**

`packages/api/src/services/observationService.ts`:

```ts
import type { CreateObservationInput, Encounter, Observation, Principal } from '@aethelgard/shared';
import { NotFoundError } from '../domain/errors.js';
import { resolveObservationValue } from '../domain/observation.js';
import { branchScopeFor } from '../domain/scope.js';
import type { AuditLog, EncounterRepository, ObservationRepository } from '../ports/index.js';

export type ObservationServiceDeps = {
  observations: ObservationRepository;
  encounters: EncounterRepository;
  audit: AuditLog;
  now: () => Date;
  newId: () => string;
};

export type ObservationService = {
  create(
    principal: Principal,
    encounterId: string,
    input: CreateObservationInput,
  ): Promise<Observation>;
  listForEncounter(principal: Principal, encounterId: string): Promise<Observation[]>;
};

export const createObservationService = (deps: ObservationServiceDeps): ObservationService => {
  /**
   * ObservationRepository has no branch predicate of its own, so this lookup is
   * the branch constraint for every observation operation. Resolve first, always.
   */
  const requireEncounter = async (principal: Principal, id: string): Promise<Encounter> => {
    const encounter = await deps.encounters.findById(id, branchScopeFor(principal));
    if (encounter === null) {
      throw new NotFoundError('encounter', id);
    }
    return encounter;
  };

  return {
    create: async (principal, encounterId, input) => {
      const encounter = await requireEncounter(principal, encounterId);
      const value = resolveObservationValue(input);
      const timestamp = deps.now().toISOString();
      const observation = await deps.observations.create({
        id: deps.newId(),
        encounterId: encounter.id,
        code: input.code,
        valueNum: value.valueNum,
        valueText: value.valueText,
        unit: value.unit,
        recordedAt: input.recordedAt ?? timestamp,
        recordedBy: principal.userId,
      });
      await deps.audit.record({
        id: deps.newId(),
        actorUserId: principal.userId,
        action: 'observation.create',
        entityType: 'observation',
        entityId: observation.id,
        occurredAt: timestamp,
      });
      return observation;
    },

    listForEncounter: async (principal, encounterId) => {
      const encounter = await requireEncounter(principal, encounterId);
      return deps.observations.listForEncounter(encounter.id);
    },
  };
};
```

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `npm test -w @aethelgard/api`
Expected: PASS — domain, contract and service suites all green.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add ObservationService gated on encounter branch scope"
```

---

### Task 14: Configuration schema

The last piece of Phase 1, and the first thing Phase 2's migrator needs. Spec §3.3: invalid or missing configuration causes an immediate, descriptive exit rather than a runtime failure later.

**Files:**
- Create: `packages/api/src/config/env.ts`
- Test: `packages/api/test/config/env.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `envSchema`, `type AppConfig = z.infer<typeof envSchema>`, `loadConfig(source?: Record<string, string | undefined>): AppConfig`, `formatConfigError(error: z.ZodError): string`.

`loadConfig` **throws** on invalid input; it does not call `process.exit`. Phase 3's entrypoint catches, prints `formatConfigError`, and exits 1 — that keeps this module testable.

Two variables beyond spec §3.3, both unavoidable and both flagged in the deviations section: `S3_REGION` (the S3 presigner requires a region) and `APP_VERSION` (spec §8 requires `/api/meta` to report one).

- [ ] **Step 1: Write the failing test**

`packages/api/test/config/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const minimal = {
  DB_URL: 'postgres://demo:demo@localhost:5432/aethelgard',
  S3_BUCKET: 'aethelgard-demo-attachments',
  JWT_SECRET: 'a-local-development-secret',
} as const;

describe('loadConfig — defaults', () => {
  it('accepts the minimal set and fills in every default', () => {
    expect(loadConfig({ ...minimal })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_URL: minimal.DB_URL,
      AUTH_DRIVER: 'localJwt',
      IDENTITY_DRIVER: 'local',
      S3_ENDPOINT: undefined,
      S3_BUCKET: minimal.S3_BUCKET,
      S3_REGION: 'ap-southeast-5',
      JWT_SECRET: minimal.JWT_SECRET,
      APP_VERSION: '0.0.0-dev',
      COGNITO_USER_POOL_ID: undefined,
      COGNITO_CLIENT_ID: undefined,
    });
  });

  it('coerces PORT from the string the environment always supplies', () => {
    expect(loadConfig({ ...minimal, PORT: '8080' }).PORT).toBe(8080);
  });

  it('defaults the region to Malaysia per spec §11', () => {
    expect(loadConfig({ ...minimal }).S3_REGION).toBe('ap-southeast-5');
  });
});

describe('loadConfig — required values', () => {
  it.each(['DB_URL', 'S3_BUCKET', 'JWT_SECRET'] as const)('rejects a missing %s', (key) => {
    const source: Record<string, string | undefined> = { ...minimal };
    delete source[key];
    expect(() => loadConfig(source)).toThrow();
  });

  it('names every missing variable in one message rather than failing one at a time', () => {
    try {
      loadConfig({});
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DB_URL');
      expect(message).toContain('S3_BUCKET');
      expect(message).toContain('JWT_SECRET');
    }
  });

  it('rejects a JWT secret short enough to brute force', () => {
    expect(() => loadConfig({ ...minimal, JWT_SECRET: 'short' })).toThrow();
  });
});

describe('loadConfig — driver selection', () => {
  it.each(['localJwt', 'cognito'] as const)('accepts AUTH_DRIVER=%s', (driver) => {
    const source =
      driver === 'cognito'
        ? {
            ...minimal,
            AUTH_DRIVER: driver,
            COGNITO_USER_POOL_ID: 'ap-southeast-5_abc123',
            COGNITO_CLIENT_ID: 'client-abc123',
          }
        : { ...minimal, AUTH_DRIVER: driver };
    expect(loadConfig(source).AUTH_DRIVER).toBe(driver);
  });

  it('rejects an unknown AUTH_DRIVER', () => {
    expect(() => loadConfig({ ...minimal, AUTH_DRIVER: 'oauth' })).toThrow();
  });

  it.each(['local', 'imds', 'ecs'] as const)('accepts IDENTITY_DRIVER=%s', (driver) => {
    expect(loadConfig({ ...minimal, IDENTITY_DRIVER: driver }).IDENTITY_DRIVER).toBe(driver);
  });

  it('requires the Cognito pool details when AUTH_DRIVER is cognito', () => {
    expect(() => loadConfig({ ...minimal, AUTH_DRIVER: 'cognito' })).toThrow(
      /COGNITO_USER_POOL_ID/,
    );
  });

  it('does not require the Cognito pool details for localJwt', () => {
    expect(() => loadConfig({ ...minimal, AUTH_DRIVER: 'localJwt' })).not.toThrow();
  });
});

describe('loadConfig — S3 endpoint', () => {
  it('accepts a MinIO endpoint for local parity', () => {
    expect(loadConfig({ ...minimal, S3_ENDPOINT: 'http://minio:9000' }).S3_ENDPOINT).toBe(
      'http://minio:9000',
    );
  });

  it('rejects an S3_ENDPOINT that is not a URL', () => {
    expect(() => loadConfig({ ...minimal, S3_ENDPOINT: 'minio' })).toThrow();
  });

  it('leaves S3_ENDPOINT undefined in AWS, where the SDK resolves it', () => {
    expect(loadConfig({ ...minimal }).S3_ENDPOINT).toBeUndefined();
  });
});

describe('loadConfig — error message quality', () => {
  it('reports the variable name and the reason, one line per problem', () => {
    try {
      loadConfig({ ...minimal, PORT: 'not-a-number', LOG_LEVEL: 'chatty' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const lines = (error as Error).message.split('\n').filter((line) => line.includes(':'));
      expect(lines.some((line) => line.startsWith('PORT:'))).toBe(true);
      expect(lines.some((line) => line.startsWith('LOG_LEVEL:'))).toBe(true);
    }
  });

  it('never echoes a secret value back into the message', () => {
    try {
      loadConfig({ ...minimal, JWT_SECRET: 'tiny' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('tiny');
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @aethelgard/api -- test/config/env.test.ts`
Expected: FAIL — cannot resolve `../../src/config/env.js`.

- [ ] **Step 3: Implement the config loader**

`packages/api/src/config/env.ts`:

```ts
import { z } from 'zod';

/**
 * The configuration surface of spec §3.3. Everything the process needs is here,
 * validated once at startup, so a bad deployment fails immediately and loudly
 * instead of throwing on the first request that happens to touch the bad value.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DB_URL: z.string().min(1),

    AUTH_DRIVER: z.enum(['localJwt', 'cognito']).default('localJwt'),
    IDENTITY_DRIVER: z.enum(['local', 'imds', 'ecs']).default('local'),

    /** Set to the MinIO URL locally; left unset in AWS so the SDK resolves it. */
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().min(1).default('ap-southeast-5'),

    JWT_SECRET: z.string().min(16),
    APP_VERSION: z.string().min(1).default('0.0.0-dev'),

    COGNITO_USER_POOL_ID: z.string().min(1).optional(),
    COGNITO_CLIENT_ID: z.string().min(1).optional(),
  })
  .superRefine((config, ctx) => {
    if (config.AUTH_DRIVER !== 'cognito') {
      return;
    }
    for (const key of ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'] as const) {
      if (config[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when AUTH_DRIVER is cognito`,
        });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/** One line per problem, naming the variable. Values are never echoed — they may be secrets. */
export const formatConfigError = (error: z.ZodError): string => {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)';
    return `${name}: ${issue.message}`;
  });
  return ['Invalid configuration:', ...lines].join('\n');
};

/**
 * Throws on invalid configuration rather than exiting, so it stays testable.
 * The process entrypoint is responsible for printing and exiting 1.
 */
export const loadConfig = (
  source: Record<string, string | undefined> = process.env,
): AppConfig => {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(formatConfigError(result.error));
  }
  return result.data;
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @aethelgard/api -- test/config/env.test.ts`
Expected: PASS — 18 tests.

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: PASS across both workspaces.

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): add Zod-validated configuration schema"
```

---

## Phase 1 Exit Criteria

All of these must hold before Phase 2 starts:

- [ ] `npm test` passes in both workspaces with no skipped suites.
- [ ] `npm run typecheck` passes in both workspaces.
- [ ] `git grep -n "notYetImplemented" -- packages` returns nothing.
- [ ] `git grep -rn "from '.*adapters" -- packages/api/src/domain packages/api/src/services packages/api/src/ports` returns nothing — the dependency rule holds.
- [ ] Six contract suites run green against the memory harness: branch, patient, encounter, observation, attachment, audit.
- [ ] No file under `packages/api/src/http`, `src/adapters/storage`, `src/adapters/auth`, `src/adapters/identity`, or `src/composition.ts` exists yet.

## What Phase 2 Inherits

Phase 2 implements Postgres adapters against the **unchanged** contract suites from Tasks 7–10. It does not modify a single contract file. If a contract has to change to accommodate Postgres, that is a signal the port was wrong — stop and revise the port, then re-run the memory harness to prove both implementations still agree.






