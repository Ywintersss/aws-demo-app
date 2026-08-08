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

### 3a. CI/CD: manual build-and-push pipeline (optional)

`.github/workflows/deploy-ecr.yml` does the same build-and-push as the
script above, as a one-click GitHub Actions run instead of a local
`docker build`/`docker push`. This is a Cloud Adoption Framework
maintenance/improvement practice for the report, not a replacement for the
manual path — use whichever is convenient. It only builds and pushes the
API's `prod` image (which also serves the built SPA); it never touches
`web.Dockerfile`, never runs `terraform apply`, and never forces an ECS
redeployment — ECS's own scheduler picks up a newly pushed `:latest` tag
on its next task placement.

Because AWS Academy Learner Lab issues temporary session credentials
(access key, secret key, session token) rather than a persistent IAM
user/role, there is no OIDC federation available for GitHub to assume a
role. The workflow instead reads the session credentials from three
repository secrets and only ever runs on a manual click, since an
automatic push/PR trigger would just fail whenever the lab session isn't
currently open.

**Get fresh session credentials:** in the Learner Lab classroom, click
**AWS Details** (top left, next to the lab's "Start Lab" button), then
**Show** under *AWS CLI*. Copy the three values shown there —
`aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`.

**Paste them into repository secrets:** on GitHub, go to **Settings →
Secrets and variables → Actions → repository secrets**, and set (create or
update, using exactly these names):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`

**Re-paste before every run.** Learner Lab tokens expire when the lab
session ends (typically 3-4 hours), and secret values aren't visible again
once saved — there's no way to check whether they're stale before running.
If they have expired, the workflow's first step fails immediately with a
clear message (e.g. `AWS_SESSION_TOKEN secret is empty — has the Learner
Lab session credential been refreshed for today?`) rather than failing
later with a confusing `docker login` auth error.

**Trigger it:** GitHub → **Actions** tab → **Build and Push API Image to
ECR** (left sidebar) → **Run workflow** button → **Run workflow** again to
confirm. The run's summary page lists the pushed image URI and both tags
(`latest` and the short commit SHA) once it finishes.

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
