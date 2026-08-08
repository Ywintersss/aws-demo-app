# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone who tries the demo — no single constrained audience. The app is evaluated by reviewers, peers, and the author alike; the confirmed requirement is that it must look good and be pleasing to all (from the author's 2026-08-08 interview, answer 1). The fictional in-app user is a clinician working at an EHR-powered clinic; that persona stands in for whoever is interacting with the demo.

## Product Purpose

Aethelgard is a demo electronic-health-records (EHR) application whose web frontend presents a realistic clinical working surface — patients, encounters, observations — backed by a clean-architecture TypeScript service (Fastify + PostgreSQL) fully deployed to AWS (ECS Fargate, ALB, RDS/Aurora) via Terraform. The purpose of the UI is to *be the product*: a polished, believable EHR interface that the underlying infrastructure happens to serve. Success means it reads as real clinical software when someone opens it.

## Positioning

A believable product surface over a genuinely deployable full-stack architecture. The app's distinguishing, honest claim: the UI is a real working EHR (login → patients → encounters → observations, CRUD and all), and the deployment story (which ServedByBadge and Infra expose) is real infrastructure, not a mock. A neighboring product could not truthfully copy "production-style EHR demo with live EC2 instance distribution and failover controls."

## Operating Context

- Runs as a Vite + React SPA served by the API (or standalone via `npm run dev`).
- Authenticated with JWT (`AUTH_DRIVER=localJwt`); the browser stores the token in localStorage (`aethelgard.token`).
- Demo accounts are seeded (e.g. `doctor.kl@aethelgard.demo`, password `demo1234`) and listed on the Login page.
- Every fetch records which ECS task and Availability Zone served it (`x-served-by`, `x-az`), surfaced in the persistent footer badge (ServedByBadge).
- Deployed target: AWS Learner Lab / ECS Fargate + ALB, per `infra/terraform` and `docs/RUNBOOK.md`.

## Capabilities and Constraints

- Pages: `/login`, `/patients` (list/search/create), `/patients/:id` (detail + encounters, delete), `/encounters/:id` (observations table, discharge), `/infra` (instance distribution, health toggles, CPU-burn load).
- Observations codes: `heart_rate`, `blood_pressure`, `temperature`, `spo2`, `weight`.
- Confirmed domain model is clinical: patients (name, DOB, sex, phone), encounters (type out/pat/in/emergency, department, status), observations (code, valueNum/valueText, unit, recordedAt).
- Styling today is all inline `style={{}}` — there is no CSS file, no design system, no theme tokens. Any redesign must retrofit a system without breaking existing behavior.
- React 19 + react-router-dom 7 + Vite 6 + TypeScript; the shared zod schemas in `@aethelgard/shared` drive the API contract.
- Undecided: visual identity, typography, color, tone of voice (interview answer 3: "open"). Note "pleasing to all" as the only aesthetic constraint recorded so far.

## Brand Commitments

- The name "Aethelgard" (app id `aethelgard`, demo domain `aethelgard.demo`) is binding and displayed in the UI title "Aethelgard EHR Demo".
- The infra/EC2 feed (ServedByBadge) and Infra page are existing features and must survive any redesign — they are the display of the deployment under the hood.
- No other brand commitments; voice/identity is open per interview answer 3.

## Evidence on Hand

- Real seeded demo users exposed by `/api/auth/demo-users` (display name, role, branch code).
- Real behavior already implemented and runnable: search, CRUD, discharge, health toggles, load burn.
- Deployment runbook in `docs/RUNBOOK.md`; service-restriction notes in `servicerestrictions.md` for Learner Lab.
- Absent claims that must not be fabricated: no testimonials, no real patients, no clinical credentials, no uptime/SLA numbers, no pricing, no proof of production traffic.

## Product Principles

1. **Look like the product.** The web frontend must read as a polished, credible EHR, not a scaffolding demo — "polished " was confirmed by the author (interview answer 2).
2. **The infrastructure stays honest.** ServedByBadge, the Infra page, and the health/load controls are real machine behavior; the UI can surface them but never fake or obscure them.
3. **Preserve the working contract.** All pages, routes, API calls, auth flows, and seeded data function as-is. Styling changes must not break behavior.
4. **Pleasing to all, not clever for one.** Aesthetics must be broadly appealing; no niche design direction that only the author would admire.
5. **Durable over decorative.** Every UI choice should serve the demo's purpose (someone reads the app and believes the infra story), not be decoration for its own sake.

## Accessibility & Inclusion

No product-specific requirement was established in the interview. The app should aim for ordinary web accessibility (semantic labels, focus states, contrast) as a default; not set as a confirmed spec beyond that.
