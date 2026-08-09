# Patch: Infrastructure Ownership Handoff

**Date:** 2026-08-08
**Applies to:** `2026-08-08-simplified-fullstack-scaffold.md`
**Effect:** Removes Tasks 19–21 from this plan's scope. Amends Task 22. Everything else in the scaffold plan (Tasks 1–18, the application side) stands unchanged.

---

## 1. What changes

`infra/terraform/` is no longer built by whoever executes this plan. It is owned and delivered separately, by a different working session that has already made three decisions this scaffold's Tasks 19–21 either missed or got backwards.

**Do not implement Tasks 19, 20, or 21.** Skip directly from Task 18 (Docker Compose) to the amended Task 22 below.

**Reason, stated plainly rather than left implicit:** Tasks 19–21 are good work and mostly correct, but they diverge from confirmed decisions in three places, and infra is being centralized in one place so it doesn't drift again.

---

## 2. Where Tasks 19–21 diverge from the confirmed plan

Recorded here so the reasoning survives, not as a critique to action.

| # | Scaffold plan (Tasks 19–21) | Confirmed decision | Why it matters |
|---|---|---|---|
| 1 | Network module comment states "No CloudFront/WAF in this profile (Learner Lab does not support either)" | WAF is on Learner Lab's permitted service list. Only CloudFront is absent. A `REGIONAL`-scope web ACL attaches directly to the ALB | Conflating the two throws away a requirement (R19) that Section C actually claims is satisfied. The two services have independent availability |
| 2 | 2 public subnets, 0 private. ALB, ECS tasks, and the DB subnet group all draw from the same public subnet list | 3 private subnets for the database tier, 3 public for ALB/ECS, across 3 AZs | The database currently sits reachable from public address space with no NAT/private isolation. Free to fix, and it's a legitimate criticism a marker would raise unprompted |
| 3 | `count = 2` AZs throughout | 3 AZs, matching the three-zone claim in the report's B.6 and B.11 | With only 2 AZs, the infrastructure cannot honestly back the T1 "three zones, synchronous replication" claim regardless of which database engine is chosen |
| 4 | Task 22's runbook opens with "Set a budget alarm first... AWS Budgets → Create budget" | AWS Budgets is not on the Learner Lab permitted service list | The step as written cannot be performed and would block someone following the runbook literally |

None of these require touching `packages/shared`, `packages/api`, or `packages/web`. They are confined to `infra/terraform/` and `docs/RUNBOOK.md`.

---

## 3. What does NOT change

Everything Tasks 19–21 got right stays exactly as designed, and the corrected infra will preserve these interfaces so no application code needs to change:

- `config/env.ts` continues to compose `DB_URL` from `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`, exactly as Task 1 specifies.
- The ECS task definition's environment/secrets split — `DB_PASSWORD` and `JWT_SECRET` via the `secrets` block, everything else via `environment` — is preserved as designed.
- The `use_aurora` toggle producing identical `db_host` / `db_port` / `db_name` / `db_username` / `db_secret_arn` output shape regardless of engine is preserved. This is the property that makes the RDS-to-Aurora swap free at the application layer, and it was implemented correctly in Task 20 — it's being kept, not rebuilt.
- `manage_master_user_password = true` on both database branches, keeping the credential in Secrets Manager and out of Terraform state, is preserved.
- `LabRole` lookup via `data "aws_iam_role" "lab"`, zero `aws_iam_role` resources, is preserved.
- `monitoring_interval = 0` is preserved.
- Target type `ip`, health check path `/health`, is preserved.
- Container port, image tag variable, and the ALB DNS name output contract Task 22's runbook depends on are all preserved — the corrected infra emits the same output names.

**Concretely: nothing in Tasks 1–18 needs to anticipate a different infra shape than what Tasks 19–21 already assumed.** The fix is confined to subnet topology, AZ count, and two documentation-level corrections (WAF availability, budget alarm mechanism).

---

## 4. Amended Task 22: Deployment Runbook

Keep Task 22's Step 3 (`build-and-push.sh`) and Step 4 (`git commit`) exactly as written — no change needed there.

**Replace Step 1** ("Set a budget alarm first") with:

```markdown
## 1. Record the starting credit balance

AWS Budgets is not available on Learner Lab (see servicerestrictions.md).
Before the first `terraform apply`, note the current credit balance shown
on the Learner Lab landing page. The delta after `terraform destroy` is
the real per-cycle cost figure — record both numbers in the session log.
```

**Everything else in Task 22 — Steps 2, 5, 6, 7, and the "Extension points" section — stands unchanged.** It references outputs (`ecr_repository_url`, `alb_dns_name`, `db_secret_arn`) that the corrected infra will continue to emit under the same names.

---

## 5. Interface contract for whoever picks up `infra/terraform/`

This is the reverse handoff — what the infra side commits to delivering so Tasks 1–18's application code needs zero changes.

| Output name | Type | Consumed by |
|---|---|---|
| `db_host` | string | `.env` / ECS task definition `DB_HOST` |
| `db_port` | number | `.env` / ECS task definition `DB_PORT` |
| `db_name` | string | `.env` / ECS task definition `DB_NAME` |
| `db_username` | string | `.env` / ECS task definition `DB_USER` |
| `db_secret_arn` | string | ECS task definition `secrets` block, `:password::` key |
| `ecr_repository_url` | string | `build-and-push.sh` argument |
| `alb_dns_name` | string | Runbook Step 5/6/7, smoke test target |
| `ecs_cluster_name` | string | Runbook, console verification |
| `ecs_service_name` | string | Runbook, console verification |

Any change to this table needs to flow back into this document before either side proceeds, since Task 21's container definition and Task 22's runbook both hardcode these names.
