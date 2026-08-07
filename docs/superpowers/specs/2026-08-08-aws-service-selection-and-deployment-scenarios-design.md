# AWS Service Selection and Deployment Scenarios — Design Specification

**Date:** 2026-08-08
**Status:** Approved for planning
**Relationship to prior spec:** Amends `2026-08-06-ehr-demo-aws-design.md`. Sections 1–9 and 12 of that spec stand unchanged. Sections 10.1, 10.2, 11, 13 and 14 are superseded here; §15 is extended. Where the two disagree, this document wins.

**Context:** Two deliverables, one decision set. (a) The W1 transactional slice of Section C of `CloudReport.docx`, handed to a teammate who writes the remaining components around it. (b) The demo application, which must deploy that slice for real.

---

## 1. Scope and Division of Work

### 1.1 What this specification decides

The report's Section B produces twenty numbered architecture components (B.10), twenty-seven requirements (R1–R27), four compliance constraints (C1–C4) and four availability tiers (T0–T3). Section C must name an AWS service for each component and justify it against that register.

The EHR demo represents workload pattern W1 (transactional clinical). This specification decides **ten components**: those W1 traverses, the cross-cutting components W1 depends on, and the managed edge.

| # | Component | Why ours |
|---|---|---|
| 1 | Managed edge and web application firewall | R6, R19. Strictly a W6 box (B.2: "five patterns are internal only"), but the demo builds CloudFront for TLS and SPA hosting regardless, and the teammate defers to this configuration. Two people naming the same box differently is the worse outcome. |
| 4 | Load balancer | R1 — W1's request distribution |
| 5 | Application compute | R21 — W1's elastic tier |
| 7 | Managed relational store | R22 — W1's system of record |
| 8 | Read replica | R4 — separates W4 from W1's path |
| 9 | Tiered object store | R3, R9 — W1 writes attachments to it |
| 12 | Backup vault | R10 — W1's data must sit inside the managed scope |
| 17 | Identity and federation | R15, R16 — W1's authentication and authorisation |
| 18 | Key management | R17 — W1's data at rest |
| 19 | Audit and monitoring | R18 — W1's mutations are audited |

### 1.2 What this specification does not decide

Components 2, 3, 6, 10, 11, 13, 14, 15, 16 and 20 belong to other workload patterns and are the teammate's to name.

---

## 2. Section C Handoff — Service Selection for the W1 Path

| # | Component (B.10) | AWS service | Satisfies | Justification |
|---|---|---|---|---|
| 1 | Managed edge + WAF | **Amazon CloudFront** + **AWS WAF** | R6, R19 | A single distribution is the only public ingress; the ALB security group admits only CloudFront's managed prefix list, which is what makes "W6 is the only internet-facing surface" enforceable rather than asserted. WAF managed rule groups filter at the edge before traffic reaches the VPC. |
| 4 | Load balancer | **Application Load Balancer** | R1, T1 | HTTP health checks against `/health` plus deregistration delay are precisely B.10's "health-based distribution, connection draining". An NLB cannot express HTTP health semantics; API Gateway adds cost and a second failure mode for no gain at 260 req/s. |
| 5 | Application compute | **Amazon ECS on AWS Fargate** | R21, P6 | R21's operative clause is "elastic instances **without OS maintenance**". Fargate has no host to patch, no AMI to rotate and no SSM agent to manage, which is the specific engineering capacity P6 exists to reclaim. Target-tracking on CPU with a scheduled action at 07:30 MYT implements B.6's "scheduled pre-scaling primary, reactive scaling backstop" directly. |
| 7 | Managed relational store | **Amazon Aurora PostgreSQL (Provisioned)** | R22, T1 | T1 requires "three zones, synchronous replication, automated failover". Aurora replicates storage six ways across three Availability Zones within a single construct. RDS Multi-AZ *instance* deployment is synchronous but spans only two zones and therefore does not satisfy T1 as worded. |
| 8 | Read replica | **Aurora reader endpoint** | R4, R22 | The reader is a member of the same cluster, so W4's analytical separation costs no additional service to operate and no replication pipeline to monitor. |
| 9 | Tiered object store | **Amazon S3**, lifecycle to **S3 Glacier Instant Retrieval** at 90 days | R3, R7, R8, R9 | B.2 sets "first image under 8 s from archive". Glacier Flexible Retrieval restores in minutes to hours and would breach it; Instant Retrieval preserves millisecond first-byte latency at archival pricing, which is the correct fit for "92% unread after 90 days" where the 8% remains clinically live. Versioning, SSE-KMS, Block Public Access and Object Lock implement Table B3.2. |
| 12 | Backup vault with retention lock | **AWS Backup** with **Vault Lock** | R10, C3 | R10 requires "all clinical data inside **one** managed backup scope". Aurora automated backups plus S3 versioning constitute two scopes, not one, and would leave R10 unanswered — the same class of gap P3 describes, where departmental storage outside the backup regime became a permanent data-protection failure. Vault Lock in compliance mode provides C3's retention lock. |
| 17 | Identity provider and federation | **Amazon Cognito User Pools** | R15, R16 (partial) | SAML or OIDC federation to the hospital's existing identity provider satisfies R15's "federated identity, multi-factor for privileged and remote". Custom attributes carry `branch_id` and `role` as token claims, supplying the attribute predicate of R16. |
| 18 | Key management, campus separated | **AWS KMS customer-managed keys**, one per campus | R17, C1 | A distinct CMK per campus with a scoped key policy makes "keys separated by campus" enforceable at the API boundary rather than merely declared. S3 and Aurora encrypt with the campus CMK; TLS 1.2 or above covers transit. |
| 19 | Audit and monitoring | **AWS CloudTrail** + **Amazon CloudWatch Logs** + **Amazon GuardDuty** | R18, C2 | CloudTrail with log-file validation, delivered to an Object-Locked S3 bucket, is the tamper-evident append-only property R18 requires. GuardDuty supplies the detection capability that makes C2's "awareness" a measurable property — B.5 notes that on the current estate it is not one. |

### 2.1 Mandatory caveat for the report

R16 requires "role plus attribute **and relationship** predicates in the query". Cognito can carry role and branch as token claims. It **cannot** express the paediatric guardianship relationship described in A.3 and B.5, which is a predicate evaluated per record between patient and guardian. That predicate lives in the data layer, enforced inside the query alongside branch scoping.

Section C must state this. A service table that lists Cognito against R16 without qualification claims something untrue, and B.5 has already argued at length that a role model expresses neither the paediatric nor the obstetric case.

### 2.2 Region

`ap-southeast-5` (Asia Pacific, Malaysia) satisfies AS18 and C1. It launched with **three Availability Zones**, which is what makes the three-zone design in B.6 and B.11 achievable as written. Amazon Cognito became available in the region in March 2025; ECS on Fargate and Aurora are both supported there.

The demo deploys to this region.

---

## 3. Environment and Tooling

### 3.1 Environment: personal AWS account

The demo deploys to a personal AWS account in `ap-southeast-5`, not to the AWS Academy Learner Lab account.

Learner Lab is available but constrains the design in ways that cost real fidelity: no CloudFront, no Cognito, `us-east-1` only, and — most consequentially — IAM restrictions that forbid role creation, which breaks `cdk bootstrap` and would force a synthesise-then-CloudFormation deployment path. That is accidental complexity buying nothing architecturally.

A personal account removes all of it for roughly **six to nine US dollars across the whole project** (§4.3). Learner Lab is retained as a documented contingency in Appendix A, and the Terraform configuration supports it.

### 3.2 Tooling: Terraform (plain HCL)

Infrastructure is Terraform HCL, replacing the AWS CDK named in `2026-08-06` spec §3 and §11.

The deciding property is that **one configuration targets both environments**. Terraform calls AWS APIs directly with session credentials — there is no bootstrap stack, no publishing roles and no asset machinery, so the IAM restriction that breaks CDK on Learner Lab does not arise. Retargeting is a `.tfvars` change, not a different deployment mechanism.

| | CDK | Terraform |
|---|---|---|
| Personal account | `cdk deploy` | `terraform apply` |
| Learner Lab | bootstrap fails → `cdk synth` + CloudFormation | `terraform apply` |
| Same code in both | No | Yes |

Two secondary arguments. `terraform plan` output is better evidence material for the report than a CloudFormation changeset. And a provider-agnostic tool aligns with B.8's future-substitution narrative (RDS→Aurora, EC2→Fargate) more naturally than an AWS-native one.

**Accepted cost:** the repository stops being TypeScript end-to-end. The user's standing rule prohibits plain JavaScript in favour of TypeScript; HCL is neither, so there is no conflict, but the consistency loss is real and acknowledged. CDKTF was considered and rejected — it adds an immature abstraction layer, emits noisy Terraform, and puts a synth step between the author and the artefact that actually runs.

### 3.3 Precise statement of the Learner Lab / CloudFormation position

For Appendix A and for the report, the accurate framing is:

> AWS CloudFormation is permitted in Learner Lab. The limitation is that **the AWS CDK requires bootstrap-created IAM roles**, and Learner Lab's IAM policy forbids role creation. CDK users are therefore forced onto a `cdk synth` plus `aws cloudformation deploy` path. Terraform avoids the constraint entirely by calling AWS APIs directly with the lab session credentials.

Stating this as "CloudFormation is limited on Learner Lab" would be wrong.

---

## 4. Deployment Profiles

Two AWS profiles plus a local floor. The same application code and the same ports-and-adapters seam serve all three; only infrastructure and available evidence differ. Profile is a single Terraform variable, `profile`, taking `full` or `lean`.

### 4.1 Profile `full` — matches Section C

For evidence capture. Every service named in §2 that is buildable.

- **CloudFront** distribution with two origins: S3 (SPA, via Origin Access Control) and the ALB (`/api/*`). Default `*.cloudfront.net` certificate provides HTTPS with no domain purchase.
- **AWS WAF** web ACL, `CLOUDFRONT` scope, AWS Managed Rules common rule set.
- **ALB** in public subnets, security group admitting only the `com.amazonaws.global.cloudfront.origin-facing` managed prefix list.
- **ECS Fargate** service, 0.25 vCPU / 0.5 GB tasks, min 3, max 9, spread across three Availability Zones. Target tracking on `ECSServiceAverageCPUUtilization` at 50%, plus a scheduled action at 07:30 MYT.
- **Aurora PostgreSQL** provisioned, `db.t4g.medium` writer plus one reader, three AZs, `manage_master_user_password = true`.
- **S3** bucket: versioning, Block Public Access, SSE-KMS with the customer-managed key, lifecycle transition to Glacier Instant Retrieval at 90 days.
- **KMS** customer-managed key with rotation enabled.
- **Cognito** user pool and app client. `AUTH_DRIVER=cognito`.
- **CloudWatch** log group for tasks; metrics drive the scaling evidence.

`IDENTITY_DRIVER=ecs`, reading `ECS_CONTAINER_METADATA_URI_V4` for task ID and Availability Zone.

**Approximate cost, three-hour cycle: USD 0.90.**

### 4.2 Profile `lean` — day-to-day iteration

For development, where full-fidelity screenshots are not needed.

- No CloudFront, no WAF. The ALB is directly internet-facing over HTTP.
- No Cognito. `AUTH_DRIVER=localJwt`.
- **RDS PostgreSQL** `db.t4g.micro`, single-AZ, gp2 20 GB, in place of Aurora.
- S3 with SSE-S3 in place of SSE-KMS; no customer-managed key.
- Fargate min 2, max 4.

Everything else is identical. Swapping Aurora for RDS changes `DB_URL` and nothing else in the application — which is itself the configuration-over-code demonstration the demo exists to make.

**Approximate cost, three-hour cycle: USD 0.30.**

### 4.3 Cost control

| Item | Note |
|---|---|
| Budget alarm | An AWS Budgets alert at USD 10 is configured **before the first `terraform apply`**, not after. |
| Aurora if forgotten | Approximately USD 130 per month. Teardown is a mandatory runbook step. |
| KMS keys | Minimum 7-day pending-deletion window — keys cannot be destroyed immediately. Create the CMK **once** and reuse it across cycles via `terraform import` or a long-lived key, rather than creating and destroying per deploy. |
| CloudFront | First 1 TB per month is free tier. Effectively zero at demo scale. |
| Cognito | First 10,000 monthly active users is free tier. Effectively zero. |
| Expected total | USD 6–9 across the project at roughly ten cycles. |

### 4.4 Local floor — `docker-compose.prod.yml`

Unchanged from `2026-08-06` spec §10.2, which already designates it a first-class deliverable: nginx round-robins across two API replicas, with Postgres and MinIO behind. `IDENTITY_DRIVER=local` reports the container hostname.

It cannot evidence auto scaling, because replica count is fixed. It evidences every other success criterion at zero cost with no session clock.

### 4.5 Evidence coverage

| Success criterion (`2026-08-06` §1.4) | `full` | `lean` | Compose |
|---|---|---|---|
| Clinical CRUD against managed data services | Yes | Yes | Yes (Postgres + MinIO) |
| Consecutive responses report different instance IDs | Yes | Yes | Yes |
| Load drives scale-out, then scale-in | Yes | Yes | **No** — fixed replicas |
| Unhealthy instance drains, no user-visible failures | Yes | Yes | Yes |
| Reproducible locally with no AWS account | Yes | Yes | Yes |

### 4.6 Execution order

Compose evidence is captured **first**, before any AWS deployment. It costs nothing and yields four of the five criteria. AWS then confirms behaviour rather than being the only place it exists — the argument `2026-08-06` spec §10.2 already makes.

---

## 5. Terraform Structure and Conventions

### 5.1 Layout

```
infra/terraform/
  versions.tf              required_version, provider version constraints
  providers.tf             default provider (ap-southeast-5) + us-east-1 alias
  variables.tf             profile, region, image_tag, app_version, branch codes
  locals.tf                profile-derived booleans
  main.tf                  module composition
  outputs.tf               ALB DNS, CloudFront domain, DB endpoint, bucket name
  modules/
    network/               VPC, three public subnets, IGW, security groups
    data/                  Aurora or RDS, S3 bucket, KMS key
    compute/               ECR, ECS cluster, task definition, service, ALB, autoscaling
    edge/                  CloudFront, WAF                     (profile = full only)
    identity/              Cognito user pool and client         (profile = full only)
  environments/
    personal.tfvars        profile = full,  region = ap-southeast-5
    dev.tfvars             profile = lean,  region = ap-southeast-5
    learnerlab.tfvars      profile = lean,  region = us-east-1, use_lab_role = true
  tests/
    network.tftest.hcl
    data.tftest.hcl
    compute.tftest.hcl
    edge.tftest.hcl
```

This replaces the six-CDK-stack layout in `2026-08-06` spec §11.2. `EdgeStack` becomes the `edge` module, `AuthStack` becomes `identity`, and `ObservabilityStack` is absorbed into `compute` (a CloudWatch log group is three lines and does not warrant a module).

### 5.2 Binding conventions

1. **No secret reaches the state file.** Aurora and RDS both set `manage_master_user_password = true`, which places the credential in Secrets Manager and keeps it out of Terraform state entirely. `.gitignore` carries `*.tfstate`, `*.tfstate.*` and `.terraform/`.
2. **Local backend.** State is a local file. A remote S3 backend is the production answer but introduces a chicken-and-egg bootstrap that a demo does not need.
3. **The WAF web ACL for CloudFront must be created in `us-east-1`.** This is an AWS constraint, not a choice. `providers.tf` declares an aliased provider for the purpose, and the `edge` module receives it explicitly.
4. **Terraform does not build images.** A script performs `docker build` and `docker push` to ECR, then `terraform apply` receives the resulting tag via `-var image_tag=...`. No `null_resource` with `local-exec` — it is fragile and hides a build step inside a plan.
5. **Role references are parameterised.** `use_lab_role = true` switches every role reference to a `data "aws_iam_role" "lab"` lookup of the pre-existing `LabRole` instead of creating roles. This is the single switch that makes Appendix A work.
6. **Every resource carries tags** — `Project = "aethelgard-demo"`, `Profile`, `ManagedBy = "terraform"` — so a forgotten resource is findable in Cost Explorer.

---

## 6. Amendments to the 2026-08-06 Specification

### 6.1 Infrastructure tooling

`2026-08-06` spec §3 lists `infra/` as "AWS CDK (TypeScript)". It becomes Terraform HCL, laid out per §5.1. Spec §11.2's six stacks become the five modules above.

`costMode` (`minimal` | `resilient`) is replaced by `profile` (`full` | `lean`), which carries the same intent with clearer names and an explicit cost figure attached to each.

### 6.2 The Cognito adapter must actually be implemented

**This is a scope increase over `2026-08-06` spec §6.1, which treated `cognito` as an unimplemented seam.**

Profile `full` builds a Cognito user pool. Building a pool the application cannot use would demonstrate nothing, so R15 requires the adapter to exist: the SPA authenticates against the pool, and the API verifies pool-issued JWTs against the pool's JWKS endpoint.

Scope is modest — the `AuthProvider` port already exists, and verification is a thin wrapper over the `aws-jwt-verify` library. It adds one adapter and its contract tests, not a redesign. `AUTH_DRIVER=localJwt` remains the local and `lean` path, and both drivers produce the same `Principal`, so nothing downstream changes.

If this is cut, profile `full` drops Cognito and R15 returns to being design-only.

### 6.3 The SPA is served by CloudFront from S3

`2026-08-06` spec §9 already specifies this: built assets to S3, served via CloudFront, with nginx serving the same assets in local production parity. That stands unchanged.

In profile `lean`, where there is no CloudFront, the API container serves the built SPA with a fallback to `index.html`. This keeps `lean` to a single origin and avoids a second hosting path.

This amends `2026-08-06` spec §10.1: the `prod` stage of `docker/api.Dockerfile` additionally copies `packages/web/dist`, and Fastify serves it with a SPA fallback when `SERVE_STATIC=true`. That variable is set **only** in profile `lean` — in `full` CloudFront serves the assets from S3, and in local production parity nginx serves them, so in both cases the API stays API-only. `docker/web.Dockerfile` keeps all three stages unchanged.

`SERVE_STATIC` is a new entry in the configuration surface of `2026-08-06` spec §3.3: boolean, default `false`.

### 6.4 Limitations to record in the report

Two, both requiring a sentence in Section E rather than silence:

1. **Exposure.** The demo's W1 endpoint is reachable from the internet. In the real architecture W1 is internal only (B.2) and arrives over component 2, private connectivity. No AWS account of any kind gives us Direct Connect, so this cannot be closed.
2. **Per-campus key separation.** The demo provisions one customer-managed key, not three. R17's "keys separated by campus" would require one bucket and one key per branch, plus a branch-to-bucket map in the `ObjectStore` adapter. That is real application work for a property that is enforced by key policy rather than observable in a screenshot, so it is satisfied by the design and named in Section C, not demonstrated.

Both are materially smaller than the four limitations a Learner Lab deployment would have carried.

### 6.5 Implementation phases

`2026-08-06` spec §14 phases 1–5 are unaffected. Phases 6 and 7 are amended:

| Phase | Content |
|---|---|
| 6 | Dockerfiles and the local production-parity Compose stack. **Compose evidence captured and stored here**, before any AWS work. |
| 7 | Terraform modules, `terraform test` suite, budget alarm, image build-and-push script, `lean` deployment, then `full` deployment. Load test, evidence capture, teardown. |

Phase 7 additionally includes the Cognito adapter from §6.2, unless cut.

---

## 7. Evidence Capture

A single run, five to ten minutes, sized to provably cross the scaling threshold. A short run produces a cleaner CloudWatch graph for the report than a long soak, and keeps per-cycle cost down.

| Artefact | Source |
|---|---|
| Clinical CRUD walkthrough | Browser, `full` profile over HTTPS |
| `X-Served-By` rotation | `scripts/load-test.ts` output, distribution over time |
| Scale-out and scale-in | CloudWatch: ECS running task count against CPU utilisation |
| Health-check draining | Admin toggle, then ALB target group health, with zero failed requests in the load-test output |
| Active adapters | `GET /api/meta` in both `full` and `lean`, showing the driver names differ while behaviour does not |
| `terraform plan` | Captured for the report as declarative evidence of the architecture |

Teardown — `terraform destroy` — closes every capture session, verified against the console.

---

## 8. Testing Amendments

`2026-08-06` spec §13 stands except for the infrastructure row, which changes tool:

- **Infrastructure: `terraform test` with mocked providers** (Terraform 1.7 or later), replacing CDK assertion tests. Mocked providers run plan-time assertions without AWS credentials and without creating resources, which is the same property CDK assertions had.

Minimum assertions, revised for the Terraform modules:

- The ALB target group health check path is `/health`.
- The ECS service spans three subnets in three distinct Availability Zones.
- Autoscaling minimum and maximum match the profile (3/9 for `full`, 2/4 for `lean`).
- The S3 bucket blocks all public access and carries the 90-day Glacier Instant Retrieval lifecycle rule.
- The database is not publicly accessible and sets `manage_master_user_password = true`.
- In profile `full`, the ALB security group ingress references the CloudFront origin-facing managed prefix list and not `0.0.0.0/0`.
- With `use_lab_role = true`, the plan creates no `aws_iam_role` resources.

The last assertion is what keeps Appendix A honest without deploying to Learner Lab to find out.

---

## 9. Explicit Non-Goals

Extends `2026-08-06` spec §15. Additionally out of scope:

- Naming AWS services for components 2, 3, 6, 10, 11, 13, 14, 15, 16 and 20.
- AWS CDK, CloudFormation authoring, and CDKTF.
- A remote Terraform state backend.
- A registered custom domain and an ACM certificate. HTTPS comes from CloudFront's default certificate.
- Per-campus S3 buckets and per-campus KMS keys (§6.4, limitation 2).
- Direct Connect, and therefore any demonstration of W1 as an internal-only workload.
- Deploying to Learner Lab, unless Appendix A is invoked.

---

## Appendix A — Learner Lab Contingency

Invoked only if the personal account becomes unavailable. The Terraform configuration supports it through `environments/learnerlab.tfvars`; no code changes are required.

### A.1 Settings

```hcl
profile      = "lean"
region       = "us-east-1"
use_lab_role = true
```

### A.2 Constraints, from `servicerestrictions.md`

| Area | Constraint | Effect |
|---|---|---|
| IAM | "You cannot create roles, except that you can create service-linked roles." | `use_lab_role = true` substitutes the pre-existing `LabRole`. This is also why CDK is unusable there — see §3.3. |
| CloudFront | Absent from the permitted list. | Profile `lean` builds no CloudFront, so this is already handled. No HTTPS. |
| Cognito | Absent from the permitted list. | Profile `lean` uses `localJwt`, so this is already handled. |
| Region | AMIs pinned to `us-east-1` / `us-west-2`; `vockey` exists only in `us-east-1`. | `us-east-1`. Contradicts C1; must be stated in the report if this path is used. |
| Route 53 | Cannot register a domain. | No custom domain, no ACM certificate. |
| RDS | Burstable classes only (nano, micro, small, medium); gp2 only, ≤ 100 GB; **enhanced monitoring unsupported and must be disabled**. | `db.t4g.micro`, `monitoring_interval = 0`. |
| ECS | Task role and execution role must both be `LabRole`. | Covered by `use_lab_role`. |
| ECR | `LabRole` has read-only; the console user has write. | The build-and-push script runs as the console user; Fargate pulls with `LabRole`. This split is exactly what is needed. |
| EC2 | Max 9 concurrent instances. **20 or more causes immediate account deactivation and deletion of all resources.** | Irrelevant to Fargate, but never raise any ASG maximum above 4 if an EC2 fallback is ever built. |
| S3 Glacier | "You cannot create a vault lock." | Lifecycle transition to Glacier Instant Retrieval still works. Vault Lock and Object Lock are not attempted. |
| CloudTrail | Trail creation permitted; CloudWatch logging for the trail is not. | Not built. |
| Lambda | Max 10 concurrent executions. | Not used. |

### A.3 Operational hazards

> "When a lab session ends, the lab environment **may not stop** an RDS instance or cluster that you leave running. Also, even if you do stop an RDS instance, if you leave it stopped for seven days, AWS will start it again automatically."

`terraform destroy` becomes mandatory rather than merely good practice. Sessions also expire, so deploy, seed, load-test, capture and destroy must fit inside one session — which the five-to-ten-minute load test in §7 already accommodates.

### A.4 Residual risk

`servicerestrictions.md` states that restrictions "are subject to change" and does not document resource-level behaviour or service-linked role availability for ECS and Application Auto Scaling. If this appendix is ever invoked, run a throwaway `terraform apply` of the `compute` module alone before depending on it — the ECS service on Fargate is the highest-risk resource, and the Application Auto Scaling scalable target is second.
