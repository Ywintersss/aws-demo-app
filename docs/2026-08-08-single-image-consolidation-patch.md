# Patch: Single-Image Consolidation for AWS Deployment

**Date:** 2026-08-08
**Applies to:** `2026-08-08-simplified-fullstack-scaffold.md`, specifically `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/nginx/nginx.conf`, and the `SERVE_STATIC` wiring already specified around Task 17.
**Decision:** confirmed. AWS deployment uses one image (the API's `prod` stage, serving both the API and the built SPA). `web.Dockerfile` and `nginx.conf` remain Compose-only artifacts, unused on AWS.

---

## 1. Why this patch exists

The infra side (Terraform) was built against a single-image assumption from the start: one ECR repository, one task definition, one container, `SERVE_STATIC=true` injected as an environment variable so that container serves both API routes and the static SPA. This is documented in the Learner Lab configuration plan §5, under "A design win worth naming in the report": *no `API_BASE_URL` to inject, no rebuild after apply, frontend and API share one origin.*

The scaffold plan built a second, different topology: `web.Dockerfile`'s `prod` stage is `nginx:1.27-alpine`, and `nginx.conf` reverse-proxies `/api/` to an upstream named `api1`/`api2`. This is correct and sensible for `docker-compose.prod.yml`, where Compose's internal DNS gives every service a stable, resolvable hostname. It does not carry over to ECS Fargate: **Fargate tasks have no stable hostname.** Every task gets a fresh ENI and IP on every deploy, restart, or scale event, so `server api1:3000; server api2:3000;` in `nginx.conf` has nothing to resolve outside Compose.

Rather than redesign the compute module around two ECS services (extra Terraform, extra failure surface, a second thing that can break live during the demo), the confirmed decision is to consolidate onto the single-image path the infra was already built for. The good news: **most of the plumbing for this already exists in the plan.** `SERVE_STATIC`, `staticRoot`, and the `@fastify/static` wiring around Task 17 were already designed for exactly this case. This patch closes the remaining gap rather than building the feature from scratch.

---

## 2. What to verify or fix

### 2.1 Confirm `@fastify/static` is actually registered, and confirm the resolved path

Task 17's plan text (around line 6016 of the scaffold) specifies modifying `packages/api/src/http/server.ts` to register `@fastify/static` with an SPA fallback when `deps.serveStatic` is true. **Confirm this landed in the actual codebase, not just the plan text.** If it's missing, implement it as specified there.

`packages/api/src/composition.ts` resolves the static root as:

```ts
staticRoot: config.serveStatic ? new URL('../../web/dist', import.meta.url).pathname : undefined,
```

This resolves relative to the **compiled** `composition.js`'s own location at runtime, not the source file. **Confirm where `composition.js` actually lands in the build output** (`packages/api/dist/composition.js` directly, versus something nested like `packages/api/dist/src/composition.js`, which depends on `tsconfig.json`'s `rootDir`). If it lands at `packages/api/dist/composition.js`, the `../../web/dist` math resolves correctly against `api.Dockerfile`'s COPY layout (`/app/packages/api/dist` and `/app/packages/web/dist` as siblings under `/app/packages/`) and needs no change. If the build output nests differently, adjust the relative path or resolve it from an environment variable instead, since a silently wrong static root fails at request time, not at build time, and would surface as 404s on every frontend route during the demo rather than a clean startup error.

### 2.2 Confirm the SPA fallback handles client-side routing

The static handler needs a fallback to `index.html` for any route that isn't a static asset or an `/api/*` path, mirroring what `nginx.conf` did with `try_files $uri /index.html;`. Confirm `@fastify/static`'s registration includes this (typically a `notFoundHandler` or a wildcard route serving `index.html`), not just serving literal file paths. Without it, a browser refresh on any non-root frontend route (e.g. `/patients/123`) will 404 instead of loading the SPA shell.

### 2.3 `api.Dockerfile` needs no structural change

The `prod` stage already copies both `packages/api/dist` and `packages/web/dist` into the image (lines 30 and 33 of the current `api.Dockerfile`). No new COPY instructions are needed. Confirm `@fastify/static` is present in `packages/api/package.json`'s dependencies (not devDependencies) so `npm ci --omit=dev` in the prod stage actually installs it — it's already listed in the scaffold plan's dependency block, just confirm it made it into the real `package.json`.

### 2.4 `web.Dockerfile` and `nginx.conf` are Compose-only from here forward

No deletion needed. They remain correct and in use for `docker-compose.prod.yml`'s three-service, two-API-replica local topology, which is a legitimate and separate demonstration (useful evidence for T1/availability discussion in the report, independent of the AWS path). Just don't build or push `web.Dockerfile`'s image to ECR — only the API image goes to AWS.

### 2.5 `docker-compose.yml` and `docker-compose.prod.yml` need no change

Both already work as designed for local development and local production-parity testing respectively. `SERVE_STATIC=false` in the Compose environment is correct and stays as-is, since `web`'s nginx (Compose-only) continues to own SPA serving in that context, per the existing rationale in the scaffold plan (line 6313: *"in this local production-parity stack, `web`'s nginx serves the SPA... Only the AWS deployment sets `SERVE_STATIC=true`, because there nothing else is serving the SPA."*). This was already correctly designed for a single-image AWS path; the only actual gap was confirming it, not redesigning it.

---

## 3. What does NOT change

- Task definition, ECR repo, ALB target group, health check path — all already built for exactly this shape. Zero Terraform changes.
- `SERVE_STATIC=true` is already wired as an environment variable in the ECS task definition (`modules/compute/main.tf`).
- `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`/`JWT_SECRET`/`S3_BUCKET` injection, the ECS `environment`/`secrets` split, all unchanged.
- `docker-compose.yml` (dev) and `docker-compose.prod.yml` (local prod-parity, two API replicas behind nginx) remain exactly as built. They are legitimate, useful artifacts for the report and for local testing, independent of what ships to AWS.

---

## 4. Build and push, once confirmed

Only the API image ships to ECR:

```bash
docker build -f docker/api.Dockerfile --target prod -t aethelgard-demo:latest .
docker tag aethelgard-demo:latest <ecr_repository_url>:latest
docker push <ecr_repository_url>:latest
```

`<ecr_repository_url>` is the Terraform output of the same name, already provisioned: `761298193478.dkr.ecr.us-east-1.amazonaws.com/aethelgard-demo`.

Once pushed, no further AWS-side action is needed. ECS's scheduler retries failed task placements automatically and will pick up the new image on its next attempt.
