# Aethelgard EHR Demo — Design Specification

**Date:** 2026-08-06
**Status:** Approved for planning
**Context:** Cloud Architecture assignment — demo application supporting the Aethelgard National Hospital cloud migration proposal.

## 1. Purpose and Scope

### 1.1 What this is

A deliberately small Electronic Health Record application, deployed on AWS, that makes the proposed migration architecture tangible. It exists to demonstrate three things that a written report cannot:

1. Core clinical CRUD running against managed AWS data services.
2. Load balancing across multiple compute instances, observable in real time.
3. Auto scaling and health-check failover under generated load.

### 1.2 What this is not

Not a production EHR. No pharmacy, billing, lab ordering, scheduling, HL7/FHIR interoperability, or imaging viewer. No real patient data of any kind. Seed data is synthetic.

### 1.3 Organisational context

Aethelgard National Hospital is the hypothetical organisation from the assignment: a Malaysian tertiary hospital with three campuses — Kuala Lumpur (primary hub), Penang, and Johor Bahru. The demo models all three as branches so that branch-scoped access control can be demonstrated.

### 1.4 Success criteria

The design succeeds when all of the following can be shown:

- A clinician can register a patient, open an encounter, record observations, and attach a document, from the browser.
- Consecutive API responses report different serving instance IDs, evidencing ALB distribution.
- A generated load causes the Auto Scaling Group to add instances, then remove them when load subsides, visible in CloudWatch.
- Marking one instance unhealthy causes the ALB to drain it, with no user-visible request failures.
- Every behaviour above is reproducible locally via Docker Compose with no AWS account.
- Backing services can be substituted through configuration alone, with no change to domain or service code.

## 2. Architectural Principles

**Ports and adapters.** Domain logic depends on interfaces, never on AWS SDK types. Concrete adapters are selected at process start by a single composition root.

**Configuration over code for service substitution.** Because the final AWS service selection is undecided, switching Postgres to Aurora, local JWT to Cognito, or EC2 to Fargate must be an environment-variable or IaC change, not a refactor.

**Idempotent deploys.** Every infrastructure operation and every database migration is safe to run repeatedly. Re-applying the CDK stacks to an up-to-date environment is a no-op.

**Environment parity.** Local development, local production-parity, and AWS run the same container images and the same code paths. Local uses MinIO rather than a separate filesystem adapter specifically so the S3 code path is never bypassed.

**Explicit failure.** No caught-and-ignored errors. Every failure either propagates as a typed error or is logged with full context.

## 3. Repository Structure

TypeScript monorepo using npm workspaces.

```
demo-app/
  packages/
    shared/            Types and Zod schemas shared by api and web
    api/               Node + Fastify backend (the load-balanced service)
    web/               React + Vite SPA (static assets)
  infra/               AWS CDK (TypeScript)
  docker/              Dockerfiles for api and web
  scripts/             Seed data, load generator
  docs/superpowers/    Specs and plans
  docker-compose.yml
  docker-compose.prod.yml
```

### 3.1 Backend internal structure

```
packages/api/src/
  domain/          Entities and invariants. Zero external dependencies.
  ports/           Interfaces only.
  services/        Use cases. Depend only on ports.
  adapters/
    persistence/postgres/
    persistence/memory/
    storage/s3/
    auth/localJwt/
    auth/cognito/
    identity/{imds,ecs,local}/
  http/            Routes, middleware, error translation.
  config/          Zod-validated environment schema producing typed config.
  composition.ts   The only file that binds concrete adapters to ports.
```

The dependency rule is one-directional: `http` → `services` → `ports` ← `adapters`. Nothing in `domain` or `services` imports from `adapters`.

### 3.2 Ports

| Port | Responsibility | Implementations |
|---|---|---|
| `PatientRepository` | Patient persistence and search | postgres, memory |
| `EncounterRepository` | Encounter persistence | postgres, memory |
| `ObservationRepository` | Observation persistence | postgres, memory |
| `AttachmentRepository` | Attachment metadata persistence | postgres, memory |
| `AuditLog` | Append-only mutation record | postgres, memory |
| `ObjectStore` | Presigned upload/download URL issuance | s3 (endpoint-configurable) |
| `AuthProvider` | Credential verification, token issue/verify | localJwt, cognito |
| `InstanceIdentity` | Reports instance/task ID and availability zone | imds, ecs, local |

### 3.3 Configuration surface

| Variable | Values | Effect |
|---|---|---|
| `DB_URL` | Postgres connection string | Local Postgres, RDS, or Aurora |
| `AUTH_DRIVER` | `localJwt` \| `cognito` | Authentication implementation |
| `IDENTITY_DRIVER` | `local` \| `imds` \| `ecs` | Instance identity source |
| `S3_ENDPOINT` | URL or unset | Set to MinIO locally, unset in AWS |
| `S3_BUCKET` | bucket name | Object store target |
| `JWT_SECRET` | secret | Local JWT signing (Secrets Manager in AWS) |
| `PORT` | number | HTTP listen port |
| `LOG_LEVEL` | pino level | Log verbosity |

Configuration is parsed and validated by a Zod schema at startup. Invalid or missing configuration causes an immediate, descriptive process exit rather than a runtime failure later.

## 4. Data Model

PostgreSQL. Schema managed by ordered SQL migration files applied by a small idempotent migrator that records applied versions in a `schema_migrations` table. No ORM — SQL is written explicitly so it can be reproduced in the report.

| Table | Key columns | Notes |
|---|---|---|
| `branches` | `id`, `code`, `name` | Seeded with KL, PG, JB |
| `users` | `id`, `email` (unique), `password_hash`, `role`, `branch_id` | `role` ∈ doctor, nurse, records_clerk, admin |
| `patients` | `id`, `mrn` (unique), `name`, `dob`, `sex`, `phone`, `branch_id`, `created_at`, `updated_at`, `deleted_at` | Soft delete only |
| `encounters` | `id`, `patient_id`, `branch_id`, `type`, `department`, `admitted_at`, `discharged_at`, `status` | `type` ∈ outpatient, inpatient, emergency |
| `observations` | `id`, `encounter_id`, `code`, `value_num`, `value_text`, `unit`, `recorded_at`, `recorded_by` | `code` ∈ heart_rate, blood_pressure, temperature, spo2, weight |
| `attachments` | `id`, `encounter_id`, `filename`, `content_type`, `size_bytes`, `storage_key`, `status`, `uploaded_by`, `uploaded_at` | `status` ∈ pending, confirmed |
| `audit_events` | `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `occurred_at` | Append-only |
| `schema_migrations` | `version`, `applied_at` | Migrator bookkeeping |

Indexes: `patients(mrn)`, `patients(branch_id)`, `patients(name)` for search, `encounters(patient_id)`, `observations(encounter_id)`, `attachments(encounter_id)`, `audit_events(entity_type, entity_id)`.

Patients are never hard-deleted; `DELETE` sets `deleted_at` and all queries filter it out. This reflects clinical record-retention obligations.

## 5. API Surface

REST under `/api`. All request bodies and responses validated against shared Zod schemas. All mutating endpoints write an audit event.

```
POST   /api/auth/login                    email + password → JWT
GET    /api/auth/demo-users               seeded accounts for the role dropdown
GET    /api/auth/me                       current principal

GET    /api/patients                      search by name or MRN, paginated
POST   /api/patients
GET    /api/patients/:id                  includes encounter summaries
PATCH  /api/patients/:id
DELETE /api/patients/:id                  soft delete

GET    /api/patients/:id/encounters
POST   /api/patients/:id/encounters
GET    /api/encounters/:id
PATCH  /api/encounters/:id                discharge, status change

GET    /api/encounters/:id/observations
POST   /api/encounters/:id/observations

POST   /api/encounters/:id/attachments    → presigned PUT URL + pending row
POST   /api/attachments/:id/confirm       → status pending → confirmed
GET    /api/attachments/:id               → short-TTL presigned GET

GET    /health                            ALB target-group health check
GET    /api/meta                          instance ID, AZ, version, active adapters
POST   /api/admin/health/fail             admin only
POST   /api/admin/health/recover          admin only
POST   /api/admin/load/burn               admin only, CPU burn for load testing
```

`GET /api/auth/demo-users` returns only non-secret identifiers for seeded demo accounts. The role dropdown in the UI calls the normal `/api/auth/login` endpoint with those credentials, so it is a convenience shortcut, not an authentication bypass. There is exactly one code path into an authenticated session.

## 6. Authentication and Access Control

### 6.1 Authentication

`AuthProvider` port with two implementations. `localJwt` verifies a bcrypt password hash and issues an HS256 JWT carrying subject, role, and branch. `cognito` delegates to a Cognito User Pool and verifies pool-issued JWTs. Both produce the same internal `Principal` shape, so nothing downstream changes when the driver is switched.

### 6.2 Authorisation

Two orthogonal mechanisms, both enforced in middleware rather than in handlers:

**Role permissions**

| Role | Permissions |
|---|---|
| admin | All operations, all branches, plus infra controls |
| doctor | Own branch: full read/write on patients, encounters, observations, attachments |
| nurse | Own branch: read patients and encounters; write observations only |
| records_clerk | Own branch: CRUD patients; no clinical writes |

**Branch scoping.** Every repository method receives a branch predicate derived from the authenticated principal. Non-admin users cannot read or write records outside their own branch even by supplying a known identifier — the constraint lives in the query, not in a handler check. This is the demonstrable analogue of the row-level security described in Section B of the report.

Denial returns 403 with no information about whether the resource exists.

## 7. Attachments

Uploads never transit the API. Flow:

1. Client `POST`s filename and content type to `/api/encounters/:id/attachments`.
2. API authorises, writes a `pending` attachment row, and returns a short-TTL presigned PUT URL from `ObjectStore`.
3. Client uploads the bytes directly to S3 (or MinIO locally).
4. Client `POST`s to `/api/attachments/:id/confirm`; API marks the row `confirmed` and records size.

Downloads mirror this with a short-TTL presigned GET.

This keeps the load-balanced instances stateless and free of large request bodies, which matters directly for the scaling demonstration.

Bucket configuration: versioning enabled, server-side encryption enabled, all public access blocked, and a lifecycle rule transitioning objects to Glacier Instant Retrieval after 90 days — mirroring Rule 2 of the report's lifecycle policy design.

Orphaned `pending` rows (upload started, never confirmed) are expected and harmless; they are excluded from listings. No cleanup job is in scope.

## 8. Demo Instrumentation

Built into the application, not added for screenshots.

- **`GET /health`** — verifies database connectivity. Returns 503 when the failure toggle is set. This is the ALB target-group health check path.
- **`X-Served-By` and `X-AZ` response headers** on every response, sourced from `InstanceIdentity`. In AWS this is the EC2 instance ID via IMDSv2; locally it is the container hostname.
- **`GET /api/meta`** — instance ID, availability zone, application version, uptime, and the names of the currently active adapters. This last field is what makes the pluggable wiring visible.
- **`POST /api/admin/health/fail` and `/recover`** — flip an in-memory flag so a specific instance can be forced out of the target group on demand.
- **`POST /api/admin/load/burn`** — bounded CPU burn used by the load generator to drive the Auto Scaling Group past its scaling threshold.

`scripts/load-test.ts` authenticates as the admin demo user, then issues sustained concurrent requests against the burn endpoint, reporting the distribution of `X-Served-By` values over time. Its output is the evidence artefact for Section E.

## 9. Frontend

React 19 + Vite + TypeScript. Arrow function components throughout. TanStack Query for server state. No business logic; the SPA renders what the API returns.

| Route | Contents |
|---|---|
| `/login` | Email/password form plus a demo-role dropdown |
| `/patients` | Searchable, paginated patient list; create patient |
| `/patients/:id` | Demographics, edit, encounter timeline, open encounter |
| `/encounters/:id` | Observations table with entry form; attachment list and upload |
| `/infra` | Live instance distribution, `/api/meta` output, health toggle (admin only) |

A persistent footer badge displays the `X-Served-By` value of the most recent API response, so instance rotation is visible from every page.

The `/infra` page polls `/api/meta`, tallies which instances served the last N requests, and renders that distribution. It is the primary screenshot for the report's implementation section.

Built output is static assets only, uploaded to S3 and served via CloudFront. In local production parity the same assets are served by nginx.

## 10. Containers and Local Environments

### 10.1 Dockerfiles

`docker/api.Dockerfile`, multi-stage:

- `deps` — workspace dependency installation
- `dev` — `tsx watch`, source bind-mounted, debug port exposed
- `build` — TypeScript compilation
- `prod` — `node:22-alpine`, non-root user, production dependencies and `dist` only, `HEALTHCHECK` against `/health`

`docker/web.Dockerfile`, multi-stage:

- `dev` — Vite dev server with HMR
- `build` — static asset build
- `prod` — nginx serving built assets (local parity; in AWS the same artefacts go to S3)

### 10.2 Compose stacks

**`docker-compose.yml` (development)** — Postgres, MinIO plus a bucket-creation init job, API at the `dev` target with hot reload, web on Vite. `AUTH_DRIVER=localJwt`, `IDENTITY_DRIVER=local`, `S3_ENDPOINT` pointed at MinIO.

**`docker-compose.prod.yml` (production parity)** — the same images built at `prod` target, Postgres, MinIO, **two API replicas behind nginx** configured for round-robin distribution with a health check on `/health`.

The production-parity stack is a first-class deliverable, not a convenience. It makes instance-identity rotation, health-check draining, and behaviour under concurrent load reproducible with no AWS account and no cost. AWS then confirms the behaviour rather than being the only place it exists.

## 11. AWS Architecture

Region defaults to `ap-southeast-5` (Malaysia) per Section B, with `ap-southeast-1` (Singapore) as a context-configurable fallback if instance types or free-tier eligibility do not permit it.

### 11.1 Request paths

```
Browser → CloudFront → S3                        (React bundle, cached)
Browser → ALB → EC2 ASG (2–4 instances, 2 AZs)   (API)
                      → RDS PostgreSQL
                      → S3                        (presigned upload/download)
```

### 11.2 CDK stacks

Six independently deployable stacks, all written in TypeScript.

| Stack | Contents |
|---|---|
| `NetworkStack` | VPC across two AZs, public and private subnets, security groups, NAT gateway behind a flag |
| `DataStack` | RDS PostgreSQL `t4g.micro`, credentials in Secrets Manager, S3 bucket with versioning, encryption, public-access block, and lifecycle rules |
| `ComputeStack` | ECR repository, launch template (Amazon Linux 2023 + Docker), Auto Scaling Group across both AZs with capacity set by `costMode` (see 11.3), Application Load Balancer, target group health-checking `/health`, target-tracking scaling policy at 50% CPU |
| `EdgeStack` | S3 static website bucket and CloudFront distribution for the SPA |
| `AuthStack` | Cognito User Pool and app client — feature-flagged off initially |
| `ObservabilityStack` | Log groups, CloudWatch dashboard, alarms on unhealthy host count and CPU utilisation |

### 11.3 Cost and resilience modes

A single `cdk.json` context value, `costMode`, takes `minimal` or `resilient`:

| Setting | `minimal` | `resilient` |
|---|---|---|
| NAT gateway | absent — instances in public subnets, security groups admit only ALB traffic | present, instances in private subnets |
| RDS Multi-AZ | disabled | enabled |
| ASG capacity | min 2, max 4 | min 2, max 6 |
| CloudFront price class | lowest | all edge locations |

The same codebase therefore deploys either as a near-free demonstration or as the resilient architecture the report proposes. The security-versus-cost tradeoff embodied in the NAT gateway flag is itself intended discussion material for the report.

**Cost caveat.** An ALB plus two continuously running instances plus RDS will exceed AWS free-tier allowances if left running — two instances alone consume 1,500 instance-hours per month against a 750-hour allowance. The intended workflow is to deploy for a demonstration window, capture evidence, and run `cdk destroy`.

### 11.4 Instance bootstrap

The launch template's user data installs Docker, authenticates to ECR, pulls the tagged API image, and runs it with environment variables sourced from Secrets Manager and SSM Parameter Store. Instances are cattle: no state, no SSH-based configuration, replaceable at any time.

### 11.5 Future service substitution

The design anticipates, without implementing, these swaps:

- **RDS → Aurora PostgreSQL** — connection string change; the Postgres adapter is unchanged.
- **EC2 ASG → ECS Fargate** — `ComputeStack` construct swap plus `IDENTITY_DRIVER=ecs`; no application code changes.
- **localJwt → Cognito** — enable `AuthStack`, set `AUTH_DRIVER=cognito`.

These are documented as configuration paths, not built in this iteration.

## 12. Error Handling and Observability

A typed error hierarchy — `NotFoundError`, `ValidationError`, `ForbiddenError`, `ConflictError`, `UpstreamError` — is translated by a single middleware into a consistent JSON error body carrying a machine-readable code, a human-readable message, and the request ID. Internal details are never leaked to clients; they go to the logs.

Zod validates every request boundary; validation failures produce 400 with field-level detail.

Structured JSON logging via pino, every line tagged with request ID, user ID where authenticated, and instance ID. In AWS these ship to CloudWatch Logs, where the instance ID tag makes it possible to correlate a request with the instance that served it.

No error is caught and discarded. Where an error is handled locally, it is logged with its context before the fallback path runs.

## 13. Testing Strategy

Test-driven throughout, per the project's standing rules. Vitest as the runner.

| Layer | Approach |
|---|---|
| Domain | Pure unit tests on entities and invariants |
| Services | Tested against in-memory adapters — fast, no Docker, no network |
| Repository adapters | **Contract tests**: one shared suite executed against both the in-memory and Postgres implementations |
| HTTP | Integration tests over the real routes, including RBAC and branch-scoping denial cases |
| Frontend | Component and route tests with Testing Library |
| Infrastructure | CDK assertion tests |

The contract test suite is what guarantees the adapters remain genuinely interchangeable; without it, "pluggable" is an untested claim.

CDK assertions cover at minimum: target group health check path is `/health`, the ASG spans two availability zones, the S3 bucket blocks public access and has encryption enabled, and RDS is not publicly accessible.

Coverage must include the error and denial paths named above, not only success paths.

## 14. Implementation Phases

1. Monorepo scaffold, shared schemas, domain entities, ports, in-memory adapters.
2. Postgres adapter, migrations, migrator, contract test suite, development Compose stack.
3. HTTP layer: routing, authentication, RBAC and branch-scoping middleware, audit middleware, error translation.
4. Object store adapter and the full attachment flow against MinIO.
5. React SPA including the Infra page.
6. Dockerfiles and the production-parity Compose stack with nginx and two replicas.
7. CDK stacks, first AWS deployment, load-test script, evidence capture.

Each phase ends with its tests passing before the next begins.

## 15. Explicit Non-Goals

- Real patient data, or any handling of it.
- HL7 or FHIR interoperability.
- Pharmacy, billing, laboratory ordering, or scheduling modules.
- Medical imaging rendering (attachments are stored and retrieved, not viewed).
- Multi-region deployment or cross-region disaster recovery — described in the report, not built here.
- Kinesis, Timestream, or HealthLake integrations from Section B.
- CI/CD pipeline automation.
- Attachment cleanup jobs for unconfirmed uploads.
