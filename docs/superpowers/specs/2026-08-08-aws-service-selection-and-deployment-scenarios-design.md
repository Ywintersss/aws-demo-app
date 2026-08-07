# AWS Service Selection and Deployment Scenarios — Design Specification

**Date:** 2026-08-08
**Status:** Approved for planning
**Relationship to prior spec:** Amends `2026-08-06-ehr-demo-aws-design.md`. Sections 1–9 and 12–13 of that spec stand unchanged. Sections 10.1, 10.2, 11 and 14 are superseded here; §15 is extended. Where the two disagree, this document wins.

**Context:** Two deliverables, one decision set. (a) The W1 transactional slice of Section C of `CloudReport.docx`, handed to a teammate who writes the remaining components around it. (b) The demo application, which must run inside an AWS Academy Learner Lab account whose restrictions are materially narrower than a normal AWS account.

---

## 1. Scope and Division of Work

### 1.1 What this specification decides

The report's Section B produces twenty numbered architecture components (B.10), twenty-seven requirements (R1–R27), four compliance constraints (C1–C4) and four availability tiers (T0–T3). Section C must name an AWS service for each component and justify it against that register.

The EHR demo represents workload pattern W1 (transactional clinical). This specification therefore decides **nine components**: those W1 traverses, plus the cross-cutting components W1 depends on.

| Ours | Rationale |
|---|---|
| 4 Load balancer | R1 — W1's request distribution |
| 5 Application compute | R21 — W1's elastic tier |
| 7 Managed relational store | R22 — W1's system of record |
| 8 Read replica | R4 — separates W4 from W1's path |
| 9 Tiered object store | R3, R9 — W1 writes attachments to it |
| 12 Backup vault | R10 — W1's data must sit inside the managed scope |
| 17 Identity and federation | R15, R16 — W1's authentication and authorisation |
| 18 Key management | R17 — W1's data at rest |
| 19 Audit and monitoring | R18 — W1's mutations are audited |

### 1.2 What this specification does not decide

Components 1, 2, 3, 6, 10, 11, 13, 14, 15, 16 and 20 belong to other workload patterns and are the teammate's to name.

**Component 1 (managed edge and WAF) is explicitly excluded.** It answers R6 and R19, both of which belong to W6 — the patient portal. B.2 states that five of six patterns are internal only and that W6 is the single internet-facing surface. W1 is internal-facing and reaches the platform over component 2 (private connectivity), never over the public internet. Naming component 1 here would duplicate the teammate's work on a box that is not ours.

This has a consequence for the demo recorded in §6.3.

---

## 2. Section C Handoff — Service Selection for the W1 Path

This is the production recommendation. It is independent of Learner Lab, which constrains only what the demo builds (§4).

| # | Component (B.10) | AWS service | Satisfies | Justification |
|---|---|---|---|---|
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

The demo does not deploy to this region. See §4.4.

---

## 3. Environment Decision

The demo targets **AWS Academy Learner Lab**, not a personal account.

The deciding argument is asymmetry, not cost: a design that satisfies Learner Lab's constraints deploys unchanged to a personal account, whereas a design that assumes `cdk deploy`, CloudFront, Cognito and `ap-southeast-5` deploys only to a personal account. The Learner-Lab-compatible design is strictly the more portable artefact for the same effort.

The supporting argument is that nothing Learner Lab blocks is required by any of the demo's five success criteria (`2026-08-06` spec §1.4). CRUD against managed services, instance-ID rotation, scale-out under load, health-check draining and local Compose parity are all achievable within the restrictions.

**Reconsider only if** the marking rubric explicitly requires demonstrating data residency or federated identity. In that case a personal account in `ap-southeast-5` costs roughly USD 1–2 per deploy-capture-destroy cycle, and a billing alarm must be configured before the first deployment.

---

## 4. Learner Lab Constraints and Their Consequences

Derived from `servicerestrictions.md`. That file states that restrictions "are subject to change" and does not document CloudFormation resource-level behaviour, which is why §7 exists.

### 4.1 IAM — the constraint that reshapes delivery

> "Extremely limited access. You cannot create users or groups. You cannot create roles, except that you can create service-linked roles."

`cdk bootstrap` creates five IAM roles (`deploy`, `file-publishing`, `image-publishing`, `lookup`, `cfn-exec`). It will fail. CDK L2 constructs additionally create roles implicitly for many resources.

**Resolution: author in CDK, synthesise, deploy the template with CloudFormation.**

```
cdk synth  →  cdk.out/<Stack>.template.json  →  aws cloudformation deploy --template-file ...
```

CloudFormation is explicitly permitted and can assume `LabRole`. This preserves TypeScript infrastructure authoring and the CDK assertion tests required by `2026-08-06` spec §13. It sacrifices only `cdk deploy` and CDK asset bundling.

Three authoring rules follow, and they are binding:

1. **Every role reference is the pre-existing `LabRole`**, imported with `iam.Role.fromRoleArn(scope, id, arn, { mutable: false })`. `mutable: false` prevents CDK from attempting to attach policies to it. The ECS task definition sets both `taskRole` and `executionRole` to it explicitly.
2. **No construct that creates a Lambda-backed custom resource.** This bans `autoDeleteObjects: true` on S3 buckets, `logRetention` on any construct, and `BucketDeployment`. Each of these provisions a Lambda function, which needs an execution role, which cannot be created.
3. **No CDK assets.** Container images are pushed to ECR by hand (§4.5) and referenced by URI string. Stacks must synthesise to templates with no asset parameters.

### 4.2 Services absent from the permitted list

| Service | Consequence |
|---|---|
| **Amazon CloudFront** | No CDN, no edge caching, no single-distribution ingress. `EdgeStack` is deleted. The SPA is served by the API container (§6.2). |
| **Amazon Cognito** | `AuthStack` is deleted, not feature-flagged. `AUTH_DRIVER=localJwt` becomes the only implemented driver. The `AuthProvider` port and the `cognito` adapter seam remain, unimplemented, as the documented substitution path. |

Route 53 is permitted but cannot register a domain. Without a domain there is no ACM certificate for the ALB, so **the demo serves HTTP on the ALB's generated DNS name**. This is a demo limitation, recorded in §6.3.

### 4.3 Services permitted with limits that bind us

| Service | Limit | Effect on design |
|---|---|---|
| Amazon RDS | Engines include Aurora (Provisioned) and PostgreSQL. Burstable classes only: nano, micro, small, medium. gp2 only, ≤ 100 GB. **Enhanced monitoring unsupported — must be explicitly disabled.** | `db.t4g.micro`, gp2, 20 GB, `monitoringInterval: 0`. |
| Amazon ECS | Task role and execution role must both be `LabRole`. | Set explicitly on the task definition. |
| AWS Fargate | Can assume `LabRole`. | Permitted as the Tier A compute. |
| Amazon ECR | `LabRole` has **read-only**; the console user has write. | You push images from your workstation; Fargate pulls with `LabRole`. This split is exactly what is needed. |
| Amazon EC2 | nano–large. Max 9 concurrent instances. **20 or more concurrent instances causes immediate account deactivation and deletion of all resources.** | Tier B caps the ASG at 4. Never raise it. |
| Elastic Load Balancing | Can assume `LabRole`. | Permitted. |
| Application Auto Scaling | Can assume `LabRole`. | Required for ECS service scaling; relies on a service-linked role, which IAM permits. |
| S3 Glacier | "You cannot create a vault lock." | Lifecycle transition to Glacier Instant Retrieval remains available; Vault Lock and S3 Object Lock are not attempted. |
| AWS CloudTrail | Trail creation permitted, but CloudWatch logging for the trail is not. | Not built in the demo. |
| AWS Lambda | Max 10 concurrent executions. | Reinforces rule 2 in §4.1. |

### 4.4 Region

The restrictions file pins AMIs to `us-east-1` or `us-west-2` and notes the `vockey` key pair exists only in `us-east-1`. **The demo deploys to `us-east-1`.**

This contradicts C1, which requires identifiable data and all replicas to remain in region. The contradiction is real and must be written into the report rather than left for a marker to find. The mitigating argument is legitimate and is itself evidence for the design's central claim: region is a CDK context value and a CloudFormation parameter, not a code change. The same synthesised templates deploy to `ap-southeast-5` unaltered.

### 4.5 Operational hazards

Two warnings in the restrictions file are load-bearing for how the demo is run.

> "When a lab session ends, the lab environment **may not stop** an RDS instance or cluster that you leave running. Also, even if you do stop an RDS instance, if you leave it stopped for seven days, AWS will start it again automatically."

Teardown is a mandatory runbook step, not hygiene. Every evidence-capture session ends with stack deletion, verified.

Sessions also expire. **Deploy, seed, load-test, capture and destroy must fit inside one session.** This constrains the load generator to a run of five to ten minutes that provably crosses the scaling threshold, rather than a long soak.

---

## 5. Deployment Scenarios

Three tiers. The same application code and the same ports-and-adapters seam serve all three; only the infrastructure and the available evidence differ.

### 5.1 Tier A — Target

**ECS Fargate + ALB + RDS PostgreSQL + S3, deployed via CloudFormation to `us-east-1`.**

- Fargate service, 0.25 vCPU / 0.5 GB tasks, desired 2, min 2, max 6, spread across three Availability Zones.
- Target-tracking scaling policy on `ECSServiceAverageCPUUtilization` at 50%.
- ALB with a target group health-checking `/health`, deregistration delay 30 s.
- `db.t4g.micro`, single-AZ, gp2 20 GB, enhanced monitoring disabled.
- S3 bucket with versioning, Block Public Access, SSE-S3, and a lifecycle rule transitioning to Glacier Instant Retrieval at 90 days.
- `IDENTITY_DRIVER=ecs`, reading `ECS_CONTAINER_METADATA_URI_V4` for task ID and Availability Zone.

Task count is 2–6 rather than the report's production 3–9. The reason is stated in §4.3: EC2 concurrency limits are severe and the consequences of breaching them are catastrophic. Fargate tasks are not EC2-console-visible and should not count against that cap, but the demo does not need nine tasks to evidence scale-out, and there is no reason to probe the boundary.

**Satisfies R21 fully:** no host OS, no patching, no AMI rotation.

### 5.2 Tier B — Fallback

**EC2 Auto Scaling Group + ALB + RDS PostgreSQL + S3.**

Triggered if Tier A fails on the ECS service-linked role, the Application Auto Scaling service-linked role, or any CloudFormation resource-level restriction not documented in `servicerestrictions.md`.

- Launch template on Amazon Linux 2023, `t3.micro`, `LabInstanceProfile` attached.
- ASG min 2, max 4, across all three subnets. **Never above 4.**
- User data installs Docker, authenticates to ECR, runs the tagged image.
- Target-tracking scaling policy at 50% CPU.
- `IDENTITY_DRIVER=imds`, reading the instance ID and AZ via IMDSv2.

EC2 Auto Scaling is explicitly permitted and `LabRole`-capable. This is the design the `2026-08-06` spec originally specified, so the work is not wasted — it is held in reserve.

**Does not satisfy R21**, because instances carry an OS that must be patched. If Tier B is used, the report records this as a lab limitation, not as an architecture choice. The recommendation in §2 stands regardless of which tier produced the screenshots.

Switching A→B is a configuration change (`IDENTITY_DRIVER`, and which Compute stack is deployed), not an application change.

### 5.3 Tier C — Floor

**`docker-compose.prod.yml`: nginx + two API replicas + Postgres + MinIO.**

No AWS account, no cost, no session clock. Already specified as a first-class deliverable in `2026-08-06` spec §10.2, on the reasoning that instance-identity rotation, health-check draining and behaviour under concurrent load should be reproducible without AWS.

- nginx round-robins across two API replicas with a health check on `/health`.
- `IDENTITY_DRIVER=local`, reporting the container hostname.
- The admin health toggle removes a replica from nginx's rotation.
- The load generator runs against nginx and reports the `X-Served-By` distribution.

Tier C cannot evidence auto scaling, because replica count is fixed. It evidences every other success criterion.

### 5.4 Evidence coverage by tier

| Success criterion (`2026-08-06` §1.4) | Tier A | Tier B | Tier C |
|---|---|---|---|
| Clinical CRUD against managed data services | Yes | Yes | Yes (Postgres + MinIO) |
| Consecutive responses report different instance IDs | Yes | Yes | Yes |
| Load drives scale-out, then scale-in | Yes | Yes | **No** — fixed replicas |
| Unhealthy instance drains, no user-visible failures | Yes | Yes | Yes |
| Reproducible locally with no AWS account | Yes | Yes | Yes |

### 5.5 Execution order

**Tier C evidence is captured first**, before any AWS deployment. It costs nothing, has no session limit, and yields four of the five criteria. AWS then confirms behaviour rather than being the only place it exists — which is the argument `2026-08-06` spec §10.2 already makes.

---

## 6. Amendments to the 2026-08-06 Specification

### 6.1 Infrastructure stacks: six become three

| Stack | Disposition |
|---|---|
| `NetworkStack` | **Retained.** VPC across **three** Availability Zones, public subnets only, internet gateway, no NAT gateway. Three rather than two because `us-east-1` has them, they cost nothing, and it keeps the demo's zone count faithful to R21 and T1. Security groups admit ALB traffic to compute and compute traffic to RDS. |
| `DataStack` | **Retained, amended.** RDS PostgreSQL `db.t4g.micro` single-AZ replaces the Aurora recommendation for build purposes; S3 bucket without Object Lock. |
| `ComputeStack` | **Retained, rewritten.** ECR repository, ECS cluster, Fargate task definition and service, ALB, target group, Application Auto Scaling policies. Tier B variant swaps the Fargate service for a launch template and ASG. |
| `EdgeStack` | **Deleted.** CloudFront is unavailable. |
| `AuthStack` | **Deleted.** Cognito is unavailable. |
| `ObservabilityStack` | **Deleted.** CloudWatch log groups are declared inline in `ComputeStack`; GuardDuty and Security Hub are named in the report, not built. |

`costMode` is replaced by two CDK context values:

- `deployTier`: `fargate` | `ec2` — selects the Tier A or Tier B compute stack.
- `region`: defaults to `us-east-1`; set to `ap-southeast-5` for a personal-account deployment.

### 6.2 The SPA is served by the API container

Without CloudFront there is no S3 static-website-plus-CDN path. The React build output is copied into the API production image and served by Fastify with a SPA fallback to `index.html`.

Consequences:

- `docker/web.Dockerfile` loses its `prod` stage. Its `dev` stage (Vite with HMR) and `build` stage are retained.
- `docker/api.Dockerfile`'s `prod` stage additionally copies `packages/web/dist`.
- CORS disappears entirely — same origin for SPA and API.
- In Tier C, nginx becomes purely a load balancer rather than also a static file server, which makes it a closer analogue of the ALB.

This applies to all three tiers, so the production image is identical everywhere.

### 6.3 Limitations to record in the report

Four, all requiring one or two sentences in Section E rather than silence:

1. **Region.** The demo runs in `us-east-1`; the architecture specifies `ap-southeast-5`. Region is a deployment parameter, not a code change. C1 is satisfied by the design, not by the demo.
2. **Transport.** The demo serves HTTP on the ALB DNS name, because Route 53 cannot register a domain in Learner Lab and ACM therefore has nothing to certify. R17's transit encryption is satisfied by the design, not by the demo.
3. **Exposure.** The demo's W1 endpoint is internet-facing. In the real architecture W1 is internal only (B.2) and arrives over component 2, private connectivity. The demo has no Direct Connect and no alternative.
4. **Database high availability.** The demo runs single-AZ RDS. R22 and T1 are satisfied by the Aurora recommendation in §2, evidenced by AWS documentation rather than by the demo. The demo evidences P1 and R21 — elasticity and load distribution — which is what it was built for.

Limitation 4 is worth framing rather than apologising for. Swapping `DB_URL` from an RDS endpoint to an Aurora cluster endpoint, with no change to the persistence adapter, is a direct demonstration of the configuration-over-code principle in §2 of the prior spec.

### 6.4 Implementation phases

Phases 1–5 of `2026-08-06` spec §14 are unaffected. Phases 6 and 7 are amended:

| Phase | Content |
|---|---|
| 6 | Dockerfiles and the Tier C production-parity Compose stack. API image now serves the SPA. **Tier C evidence captured and stored here**, before any AWS work. |
| 7 | Lab capability probe (§7). Then CDK stacks authored, `cdk synth`, CloudFormation deployment of Tier A. Fall back to Tier B on probe failure. Load test, evidence capture, teardown. |

---

## 7. Lab Capability Probe

The restrictions file is not exhaustive. The probe converts unknowns into knowns in one session, before any real work depends on them.

### 7.1 Definition

A single throwaway CloudFormation stack, deployed and deleted in one sitting, creating one of each resource type the demo needs:

| Resource | Proves |
|---|---|
| `AWS::EC2::VPC`, subnet, internet gateway, security group | Network primitives are creatable |
| `AWS::ECR::Repository` | Registry creation, and that `docker push` succeeds from the workstation |
| `AWS::ECS::Cluster` | Cluster creation and ECS service-linked role availability |
| `AWS::ECS::TaskDefinition` with `LabRole` as both roles | The role substitution in §4.1 actually works |
| `AWS::ECS::Service` on Fargate, desired count 1 | **The single highest-risk item.** Fargate task launch with `awsvpc` networking |
| `AWS::ElasticLoadBalancingV2::LoadBalancer` + target group | ALB creation and target registration |
| `AWS::ApplicationAutoScaling::ScalableTarget` + policy | Auto Scaling service-linked role availability |
| `AWS::RDS::DBInstance`, `db.t4g.micro`, `MonitoringInterval: 0` | RDS creation under the burstable-class restriction |
| `AWS::S3::Bucket` with versioning and a lifecycle rule | Bucket creation and lifecycle configuration |

### 7.2 Outcomes

- **All succeed** → proceed with Tier A.
- **ECS service, task definition, or Application Auto Scaling fails** → Tier B. Network, Data and S3 work is unaffected.
- **RDS fails** → reduce to `db.t3.micro`; if that also fails, Tier C only, with Postgres in Compose.
- **CloudFormation itself fails on role assumption** → Tier C only. Record it; it is a finding about the environment, not a project failure.

### 7.3 Stack ordering

`NetworkStack` → `DataStack` → `ComputeStack`, each independently deployable. If `ComputeStack` fails, the first two remain standing and the Tier A→B pivot does not require redeploying them.

---

## 8. Testing Strategy Amendments

`2026-08-06` spec §13 stands. Two changes to the infrastructure row:

- CDK assertion tests run against `cdk synth` output, which is the same artefact CloudFormation deploys. Previously the tested artefact and the deployed artefact were the same by construction; now that equivalence must be asserted, so the test suite additionally verifies the synthesised template contains **no asset parameters** and **no `AWS::IAM::Role` resources**. Either would fail at deploy time in Learner Lab.
- Minimum CDK assertions, revised for the amended stacks: target group health check path is `/health`; the ECS task definition names `LabRole` for both task and execution roles; the RDS instance sets `MonitoringInterval: 0` and is not publicly accessible; the S3 bucket blocks public access and carries the 90-day Glacier Instant Retrieval lifecycle rule; the ASG in the Tier B variant has `MaxSize` no greater than 4.

---

## 9. Explicit Non-Goals

Extends `2026-08-06` spec §15. Additionally out of scope:

- Building CloudFront, WAF, Cognito, KMS customer-managed keys, AWS Backup, Vault Lock, S3 Object Lock, GuardDuty, Security Hub or CloudTrail. All are named in Section C; none are built.
- `cdk bootstrap` and `cdk deploy`. Deployment is CloudFormation only.
- TLS termination and custom domains.
- Deploying to `ap-southeast-5`, unless the environment decision in §3 is revisited.
- Naming AWS services for components 1, 2, 3, 6, 10, 11, 13, 14, 15, 16 and 20.
