# 20-Minute Presentation Script — One Request, Four Layers

**Date:** 2026-08-09
**Format:** 4 presenters × 5 minutes, live demo against the deployed AWS stack.
**Structure:** the whole 20 minutes follows a single user request through the system — it arrives (network), is served (compute), touches data (data), and then we break it (resilience). Each presenter owns one layer and shows the application behaviour and its AWS backing in the same beat.

Read §0 before the session. Presenters 1–4 read their own section. §5 lists what is deliberately *not* demonstrated — read it so nobody improvises a claim the stack can't back.

---

## 0. Shared pre-flight checklist

Run this as a team, **before** the 20 minutes starts. Budget 15 minutes.

| # | Check | How | Pass condition |
|---|---|---|---|
| 1 | Learner Lab session is fresh | Start the lab, write the start time here → `______` | ≥ 90 minutes of session left when you begin presenting |
| 2 | Stack is up | `cd infra/terraform && terraform output` | `alb_dns_name`, `ecs_cluster_name`, `ecs_service_name` all print |
| 3 | Outputs captured | Paste the three values into a scratch note all four presenters can see | No one is running `terraform output` on stage |
| 4 | App answers | `curl -s -o /dev/null -w "%{http_code}\n" "http://<alb_dns_name>/health"` | `200` |
| 5 | Demo users seeded | `curl -X POST "http://<alb_dns_name>/api/auth/login" -H 'content-type: application/json' -d '{"email":"doctor.kl@aethelgard.demo","password":"demo1234"}'` | Returns a `token` |
| 6 | Health state clean | `curl -X POST "http://<alb_dns_name>/api/admin/health/recover" -H "authorization: Bearer <token>"` | `{"forcedUnhealthy":false}` |
| 7 | Task count is at baseline | ECS console → cluster → service | Running tasks = **2**. If a rehearsal left it at 3–4, wait for scale-in or force desired count back to 2 |
| 8 | Both targets healthy | EC2 console → Target Groups → the app's TG → Targets tab | 2 targets, both `healthy` |
| 9 | Load script rehearsed | `npm install` once, then `npm run load-test -- --url "<alb_dns_name>" --minutes 0.5` | Prints `Authenticated.` and a task distribution, `failed=0` |
| 10 | Backup screenshots open | Open the console-configuration reference docs in a background tab | Every presenter knows which screenshot is theirs |

### Browser tabs, pre-loaded in this order

Loading a tab live on conference wifi is the single most common way this demo stalls. Open all of these **before** you start, left to right:

1. The app — `http://<alb_dns_name>/login`
2. VPC console → Subnets, filtered to the project VPC
3. EC2 console → Load Balancers → the ALB, **Description** tab
4. EC2 console → Target Groups → the app's TG, **Targets** tab
5. RDS console → the database instance
6. ECS console → cluster → service, **Tasks** tab
7. CloudWatch → the ECS service CPU / running-task-count graph

### Who drives

One laptop is on the projector. One person drives it throughout — presenters talk, the driver clicks. The **load script runs on the driver's machine** and must be started during presenter 3's segment (see §3, step 1). It does not need to run on the projected laptop, only on something with network access to the ALB.

---

## 1. Presenter 1 — The request arrives (network layer)

> **Hook:** "Everything you're about to see starts with one HTTP request, and it doesn't reach our application first — it reaches a load balancer sitting in front of three availability zones."

**Time budget: 5:00.** You are the shortest and most disciplined segment. Do not explain CIDR maths. One sentence on topology, then get to the browser.

| # | Do | On screen | Say (one line) | Time |
|---|---|---|---|---|
| 1 | Tab 1 — the app login page, already loaded | The app renders | "That URL is not a server. It's an Application Load Balancer DNS name." | 0:30 |
| 2 | Tab 3 — ALB Description tab. Point at the DNS name and the **Availability Zones** list | ALB shown across 3 AZs | "The ALB has a presence in three availability zones in `ap-southeast-5`, Malaysia." | 1:00 |
| 3 | Tab 2 — Subnets, filtered to the VPC | Six subnets: 3 public, 3 private | "Three public subnets carry the load balancer and the application; three private subnets carry the database, with no route to the internet." | 1:15 |
| 4 | Point at the AZ column | Three distinct AZ values | "One of each per zone — that's what makes the three-zone claim in our report real rather than aspirational." | 0:45 |
| 5 | Back to Tab 3, point at the AZ list once more | ALB AZ list | "Note the third zone. Nothing of ours is running in it right now — that's deliberate, and my colleague will come back to it at the end." | 0:30 |
| 6 | Hand over | — | Handoff line below | 0:15 |

**Leave 1:00 of slack.** If you finish early that is a success, not a problem.

**Fallback lines**

- *Console slow to load a tab:* "I've got the subnet layout captured here —" switch to the VPC screenshot in the reference doc and carry on. Do not wait on a spinner.
- *The app page doesn't render:* "The load balancer's own view is the more interesting one anyway —" go straight to Tab 3 and let presenter 2 recover the app view.

**Handoff line:** "So the request has reached the load balancer. What it does *next* — which of our machines actually answers — is [name]'s."

---

## 2. Presenter 2 — The request is served (compute layer)

> **Hook:** "The load balancer has to pick a machine. I want to show you that it genuinely picks a different one each time, because that's the whole basis of everything that follows."

**Time budget: 5:00.**

The app has a **permanent footer** on every page reading `Served by <task-id> in <az>`. It is populated from the `X-Served-By` and `X-AZ` response headers that the API attaches to every single response. **Use the footer, not browser dev tools** — no audience can read a Network tab from the back of a room. Point at the footer with the cursor.

| # | Do | On screen | Say (one line) | Time |
|---|---|---|---|---|
| 1 | Tab 1 — log in as `doctor.kl@aethelgard.demo` / `demo1234` | Patient registry loads | "Standard login — JWT issued by the application itself." | 0:45 |
| 2 | Point at the footer, bottom of the page | `Served by <id> in ap-southeast-5x` | "Bottom of the screen: the exact task that answered, and the zone it's in." | 0:30 |
| 3 | Open any patient, then go back, twice | Footer task ID changes | "Same session, different machine — the load balancer is distributing, not pinning me to one box." | 1:00 |
| 4 | Navigate to **Infra** in the top nav | The Infra page, polling every 1.5s | "This page polls the API twice a second and tallies which task answered." | 0:30 |
| 5 | Let the *Instance distribution* histogram fill for ~15 seconds | Two bars, roughly even | "Two tasks, roughly even split. That's the ALB's round-robin, measured rather than asserted." | 1:00 |
| 6 | Point at the `db` / `auth` / `identity` line above the histogram | `postgres`, `localJwt`, `ecs` | "And the adapters currently wired in — that line is what makes the next segment's swap story concrete." | 0:45 |
| 7 | Hand over | — | Handoff line below | 0:30 |

**Fallback lines**

- *Footer shows `—` or the ID doesn't change:* "The distribution page tallies this more reliably than a single refresh —" go straight to step 4; the histogram is the stronger visual anyway.
- *Only one bar appears in the histogram:* "One task is taking this sample — the target group shows both are in rotation." Switch to Tab 4 and point at two `healthy` targets. Do not keep refreshing hoping for a second bar.
- *Login fails:* "Session may have rotated —" the driver re-runs the pre-flight step 5 curl while you narrate the adapter line from step 6.

**Handoff line:** "That task ID in the footer is a stateless compute node — it holds nothing. Everything that has to survive it lives one layer down, which is [name]'s."

---

## 3. Presenter 3 — The request touches data (data layer)

> **Hook:** "The task that answered me a moment ago could be destroyed right now and we'd lose nothing, because the moment anything matters clinically, it leaves the container."

**Time budget: 5:00.**

### ⚠ Step 1 is a timing action — do it first, before you say anything

Target-tracking autoscaling is slow by design: roughly **3 minutes** of sustained above-target CPU before the alarm fires, plus **30–60 seconds** for a new Fargate task to reach `RUNNING`. That is 4–5 minutes total — *longer than presenter 4's entire segment*. If the load starts when presenter 4 starts talking, nothing will have happened by the time they finish.

So the **driver starts the load script as presenter 3 begins**, and presenter 3 talks over the first three seconds of it.

| # | Do | On screen | Say (one line) | Time |
|---|---|---|---|---|
| 1 | **Driver runs:** `npm run load-test -- --url "<alb_dns_name>" --minutes 7` | Terminal prints `Authenticated. Starting load` | "I'm starting a load generator in the background — ignore it for now, it's my colleague's evidence and it needs a head start." | 0:20 |
| 2 | Tab 1 — Patients, open a named patient | Patient detail, encounter list | "One patient record, held in Postgres, not in the container that just served it." | 0:45 |
| 3 | Under *Open encounter*: type `outpatient`, department `Cardiology`, submit | New encounter appears in the ledger | "Opening an encounter — that's a write, and it's going to a managed database in a private subnet." | 0:50 |
| 4 | Open the new encounter, record an observation: `heart_rate`, value `82`, unit `bpm` | Observation appears | "And a clinical observation against it. Eighty-two beats per minute, written and read back." | 0:50 |
| 5 | Point at the footer | Task ID — likely a *different* one than served step 3 | "Note the footer — a different task read that back than the one that wrote it. The data outlived the machine." | 0:30 |
| 6 | Tab 5 — RDS console | Live DB instance, private subnet group | "That's the instance. It is in the private subnet group — there is no public route to it." | 0:50 |
| 7 | Stay on the RDS tab | — | The Aurora line below | 0:45 |
| 8 | Hand over | — | Handoff line below | 0:10 |

**Step 7, the Aurora swap — say it as a design decision, not a hedge:**

> "We're running RDS PostgreSQL here. The application cannot tell the difference between this and Aurora, because the connection string is assembled in exactly one place from config, and the Terraform module emits the same five outputs either way. Switching is a one-line variable change and a re-apply — no application code changes at all. We chose not to run Aurora for this session purely on cost."

**Fallback lines**

- *Encounter or observation write fails:* "The write path is the same one the seed data came through —" navigate to a pre-existing patient with encounters already on it and narrate that record instead. Pick your fallback patient during pre-flight and know its name.
- *RDS console slow:* "The instance configuration is captured here —" use the RDS screenshot from the reference doc.
- *The load script errors on start:* don't debug it on stage. Say nothing, let the driver retry once quietly, and tell presenter 4 before they stand up so they can take the documented-evidence path in §4.

**Handoff line:** "That encounter is now durable, in a database in a private subnet across three zones. What I haven't shown is what happens when part of this fails — which is [name]'s."

---

## 4. Presenter 4 — When it breaks (resilience / ops layer)

> **Hook:** "Everything so far assumed things work. This last five minutes is the opposite: I'm going to deliberately kill one of our machines, and then I'm going to overload the rest."

**Time budget: 5:00.** The load generator has been running for ~5 minutes by the time you start. Check the terminal before you speak — you should already be near a scale-out.

You have two demos: a failure (fast, reliable) and a scale-out (slow, already in flight). **Do the failure first**, because it's the one you control.

### Part A — Forced failure and drain (2:30)

| # | Do | On screen | Say (one line) | Time |
|---|---|---|---|---|
| 1 | Tab 1 → **Infra** page → click **Force unhealthy** | Button clicks, no visible change yet | "That set a flag on whichever one of our tasks answered the click. Its health endpoint now returns 503." | 0:30 |
| 2 | Tab 4 — Target Groups → Targets | One target goes `unhealthy`, then `draining` | "The load balancer is health-checking every 30 seconds. It's noticed, and it's taking that target out of rotation." | 0:50 |
| 3 | Back to Tab 1, click around the app — Patients, open a record | App works normally throughout | "And the application is completely unaffected. No errors, no retry, nothing a clinician would ever see." | 0:40 |
| 4 | Tab 6 — ECS Tasks | The failed task stops; a replacement starts | "ECS doesn't nurse a sick task back — it destroys it and starts a clean one. That's the recovery path." | 0:30 |

**Read this before you present it — the Recover button does not do what its label implies.**

The unhealthy flag is held **in memory on one specific task**. Your `Recover` click goes through the load balancer — which has by then removed that task from rotation — so it lands on a *healthy* task and clears a flag that was already clear. The failed task cannot be reached to be recovered. In AWS, the genuine recovery is ECS replacing the task, which is what step 4 shows.

**Do not click Recover on stage expecting it to work.** Either skip it, or use it as the teaching point: *"I could click Recover, but I'd be talking to a different task — the broken one is already out of rotation. That's a real property of stateless instances, not a bug in the demo, and it's exactly why ECS replaces rather than repairs."* That framing is stronger than the button working.

### Part B — Load and scale-out (2:00)

| # | Do | On screen | Say (one line) | Time |
|---|---|---|---|---|
| 5 | Show the load script terminal | Progress lines, `ok=` climbing, task IDs listed | "This has been hammering the API for about five minutes — four concurrent workers doing bounded CPU burns." | 0:30 |
| 6 | Tab 7 — CloudWatch CPU graph | CPU well above the 50% line | "Service-average CPU, against a target-tracking threshold of 50%. We're comfortably over it and have been held there." | 0:40 |
| 7 | Tab 6 — ECS service | Running task count **above 2** | "So the service scaled out. Those extra tasks were not there when [presenter 1] started talking." | 0:30 |
| 8 | Point at the new task's AZ column | A task in the previously-idle third AZ | "And there's the third availability zone [presenter 1] flagged at the start — now carrying load." | 0:20 |

### Part C — Close and reset (0:30)

| # | Do | Say | Time |
|---|---|---|---|
| 9 | Driver stops the load script (Ctrl-C) or lets it expire | "Scale-in runs on a much longer cooldown — around 15 minutes — so you won't see it come back down in this room. It's in the CloudWatch graph in our report." | 0:20 |
| 10 | Driver runs the reset curl from §0 step 6 | — | 0:10 |

**Fallback lines**

- *Target never goes unhealthy:* "The health check interval is 30 seconds and we may be inside it —" move to Part B and come back only if time allows. Do not stand watching the Targets tab.
- *Task count is still 2:* "Target tracking is deliberately conservative — it won't scale on a spike, only on sustained load, and we're inside that window." Switch to Tab 7 and present the **CPU graph above the threshold** as the evidence, plus the scale-out screenshot from rehearsal in the reference doc. The CPU curve is legitimate evidence on its own; the task count is the bonus.
- *A new task appears but not in the third AZ:* "Placement is spread across zones over time rather than guaranteed per-task —" don't force it. Fall back to the ALB's three-AZ presence from presenter 1.
- *The app errors during the drain window:* say so honestly — "that's a request that was in flight to the draining target" — and note deregistration delay is what's meant to absorb it. Do not pretend it didn't happen.

**Closing line:** "One request: balanced across three zones, served by interchangeable tasks, persisted to a private managed database, and — when we broke it and then overloaded it — replaced and scaled without anyone using the application noticing."

---

## 5. Documented, not demonstrated

Say these plainly if asked. Do not imply any of them is running.

| Thing | Status | Line to use if asked |
|---|---|---|
| **S3 attachments** | **Not built.** The `ObjectStore` port was deliberately never created — there is no upload flow in the application at all | "Attachments are a designed extension point, not a built feature — a new port, an S3 adapter, and one Terraform resource. We scoped it out; we're not going to claim it." |
| **AWS WAF** | One-cycle, torn down | "WAF is on Learner Lab's permitted list and attaches to the ALB at `REGIONAL` scope. We provisioned it once, captured the configuration, and destroyed it for cost. It's evidenced in the report, not running now." |
| **Aurora PostgreSQL** | One-cycle, torn down | See presenter 3, step 7 — the swap is a config change, and that's the actual claim |
| **Cognito** | Not built | "`AuthProvider` is a port with one implementation. A Cognito adapter is additive." |
| **Scale-in** | Real but too slow to show | "~15 minute cooldown. It's in the CloudWatch graph." |
| **RBAC / branch scoping** | Fields exist, enforcement doesn't | "Every principal and record already carries role and branch. Enforcement is middleware we haven't added." |

**One known gap, if a marker probes it:** the `/api/admin/*` endpoints require authentication but are **not role-gated** — any seeded demo user's token can call them, not just `admin`. They're demo instrumentation. If asked, say that, and say the fix is a role predicate in `authMiddleware.ts`. Don't claim they're admin-only.

---

## 6. Why the "Burn CPU" button is not the load demo

Presenter 4 uses the script, not the button, and someone will ask why.

`ECSServiceAverageCPUUtilization` averages CPU across **every task in the service**. The API is single-threaded and each Fargate task gets 0.25 vCPU, so a single in-flight burn saturates exactly one task. With 2 tasks running, that's a **~50% service average** — sitting exactly *at* the scaling target, never above it. That is the ~60% ceiling you hit clicking the button by hand, and no amount of clicking fixes it, because the requests queue on the task rather than running in parallel.

Target tracking additionally requires the metric held above target across roughly three consecutive 1-minute datapoints. Manual clicking cannot sustain that duty cycle.

The script fixes the actual problem, which is **concurrency, not duration** — it keeps every task loaded simultaneously for a fixed wall-clock window.

**Why the burns stay short (1500ms) rather than getting longer:** the burn loop is synchronous and blocks Node's event loop, so a burning task cannot answer `GET /health`. The ALB's health check timeout is 5 seconds. Long burns — or high concurrency, which queues burns ahead of an arriving health check — breach that timeout, and the ALB deregisters healthy tasks that were only ever busy. That destroys the evidence. The endpoint now rejects any `durationMs` above 5000 for this reason. The defaults (4 workers × 1500ms burn × 250ms pause) are chosen to sit safely inside the health check budget while holding service CPU roughly double the scaling target.

```bash
# The one command presenter 3's driver runs:
npm run load-test -- --url "<alb_dns_name>" --minutes 7

# Tunable if rehearsal shows you need more or less:
npm run load-test -- --url "<alb>" --minutes 7 --concurrency 4 --burn-ms 1500 --pause-ms 250
```

---

## 7. Rehearsal notes

- **Rehearse the whole 20 minutes once end-to-end with the timer visible.** The two segments that overrun are 1 (topology temptation) and 3 (form typing). Pre-fill nothing — practise typing `Cardiology` and `82` quickly.
- **Rehearsing costs a scale-out.** After any rehearsal, task count will be 3–4 and will take ~15 minutes to come back to 2. Either rehearse ≥ 20 minutes before you present, or accept starting at 3 and adjust presenter 4's step 7 line.
- **Always run the reset** (§0 step 6) after every rehearsal. A left-over unhealthy flag is invisible until it isn't.
- **Do not click "Delete patient"** at any point. It opens a browser confirm dialog and destroys seeded data.
- Assign the backup screenshots to each presenter by name during rehearsal, so nobody hunts for one live.
