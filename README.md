# Personal Software Factory

Personal Software Factory / 个人 AI 软件工厂 is a single-user control plane for turning natural-language software requests into structured Missions, Codex-driven development, Playwright QA, structured bug reports, approval gates, and reviewable release work.

The repository currently contains the foundation through the gated real execution and integrations phase: shared schemas, Prisma persistence, Mission state machine, Fastify Orchestrator API, API token auth, Project Registry, Project Passport intake for `ai-novelist`, deterministic Mission Planner, local CLI helpers, Codex Worker dry-run and gated real-runner abstractions, deterministic Playwright QA, AI exploratory QA abstraction, dry-run and gated fix loop paths, Hub Web, dashboard APIs, dry-run plus gated real integration adapters, local demo workflow, doctor, scoped demo reset, report generation, optional BullMQ queue runtime, and Worker Runner handlers for whitelisted dry-run and gated real-mode job contracts.

## Current Scope

Implemented:

- `packages/mission-schema`: shared Zod schemas and TypeScript types for Project, Mission, MissionEvent, Approval, WorkerRun, Artifact, BugReport, and QARun.
- `packages/db`: Prisma schema, migrations, client wrapper, and seed support.
- `packages/mission-core`: Mission state transition validation and transition event generation.
- `packages/project-passport`: YAML parser, normalization, and validation for `project.passport.yaml`.
- `packages/project-registry`: scanner for `projects/*/project.passport.yaml` and Project metadata sync inputs.
- `packages/mission-planner`: deterministic template planner that does not call an LLM.
- `packages/integrations`: mock/dry-run GitHub, Coolify, Uptime Kuma, and Plane adapters plus gated real adapter implementations that can use injected transports only when all provider, approval, and runtime gates are satisfied. The default path does not inject a real transport and does not call external APIs.
- `packages/demo-workflow`: shared local ai-novelist demo workflow, doctor, reset, and report helpers.
- `packages/worker-runtime`: in-process and optional BullMQ queue facade for dry-run action jobs.
- `apps/orchestrator-api`: Fastify API with health, dashboard, project sync/passport, Mission creation/planning/summary, Approval, WorkerRun, Artifact, BugReport, QARun, Integration routes, global Hub resource list routes, and protected real-action contract routes that require queued mode plus route-specific `PSF_ENABLE_REAL_*` gates.
- `apps/hub`: React/Vite Hub Web console for dashboard, API-backed project, Mission, bug, WorkerRun, artifact, and approval resource pages, Mission creation at `/missions/new`, Mission detail, queue status, Integration status, approval decision recording, and gated real-action visibility.
- `apps/worker-runner`: BullMQ Worker Runner that consumes whitelisted dry-run jobs and gated real-mode contract jobs, then updates queue wrapper WorkerRuns and child run references. Batch 03/04 `codex.real` remains manual-action unless an injected runner is supplied.
- `workers/codex-worker`: dry-run prompt, command review artifact, dev summary generator, and gated real Codex runner. Real execution is disabled by default and requires `ENABLE_REAL_CODEX=1`, an explicit absolute `CODEX_EXECUTABLE`, workspace guards, safe Codex CLI policy, runtime limits, approvals, and queue/runtime wiring.
- `workers/qa-worker`: deterministic Playwright QA runner and AI exploratory QA abstraction. Real browser execution requires a target URL plus `ENABLE_REAL_PLAYWRIGHT=1` or an injected runner; AI exploratory QA stays manual-action/dry-run unless `ENABLE_AI_EXPLORATORY_QA=1` and an approved executor path are wired.
- `scripts/psf.ts`: local dry-run CLI for registry sync, example Mission creation, planning, Codex/QA/fix dry-run artifacts, Integration dry-runs, doctor, demo reset, and demo report.

Real but disabled/gated:

- Codex real runner, deterministic Playwright QA, AI exploratory QA abstraction, real fix-loop contract, GitHub/Coolify/Uptime Kuma/Plane real adapters via injected transport, and Worker Runner real job handlers are present as code paths or contracts.
- They require explicit environment gates, credentials or target URLs where relevant, queue-backed runtime wiring, approval/policy gates, safe workspace configuration, local mirrors for Codex, and injected runners/transports before they can do real work. Worker Runner does not spawn real Codex by default in Batch 03/04.
- Orchestrator real-action routes require `PSF_ACTION_EXECUTION_MODE=queued` and the route-specific gate, such as `PSF_ENABLE_REAL_CODEX=true` or `PSF_ENABLE_REAL_GITHUB_PR=true`, before a gated contract job is accepted.

Default safe behavior:

- Local CLI examples, demo workflow, integration status/dry-runs, Hub buttons, and normal tests remain dry-run/mock/manual-action oriented.
- External integrations do not call GitHub, Coolify, Uptime Kuma, or Plane by default. Setting `ENABLE_REAL_GITHUB=1`, `ENABLE_REAL_COOLIFY=1`, `ENABLE_REAL_UPTIME_KUMA=1`, or `ENABLE_REAL_PLANE=1` only makes real mode eligible; it still needs runtime wiring, operation gates, credentials, and an injected transport.
- Real Codex spawn, real AI provider calls, real push, PR creation, deployment, monitor creation, Plane issue sync, production changes, and arbitrary command execution remain off unless a later approved run deliberately enables the full gate chain.

## Run The Local MVP Demo

From a clean checkout:

```bash
pnpm install
cp .env.example .env
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm psf doctor
pnpm psf demo:ai-novelist --with-sample-bug
PSF_AUTH_DISABLED=true pnpm dev:api
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

Run `pnpm dev:api` and `pnpm dev:hub` in separate terminals. Open `http://127.0.0.1:5173` to inspect the dashboard, API-backed resource pages, `/missions/new` Mission creation, Mission detail, protected dry-run buttons, approval decisions, and gated real-action readiness states. The dashboard still links the fixed demo Mission as a shortcut, but normal navigation no longer falls back to it.

The default MVP flow does not execute Codex, call a real AI provider, push, create PRs, deploy, create monitors, create Plane issues, or call external services.

Useful follow-up commands:

```bash
pnpm psf doctor --check-db
pnpm psf integrations:status
pnpm psf queues:status
pnpm psf demo:report --with-sample-bug
pnpm psf demo:reset --skip-db
DEMO_RESET_CONFIRM=1 pnpm psf demo:reset --skip-db
pnpm test:scripts
```

## Repository Layout

```text
apps/
  hub/
  orchestrator-api/
workers/
  codex-worker/
  qa-worker/
packages/
  db/
  mission-core/
  mission-planner/
  mission-schema/
  project-passport/
  project-registry/
projects/
  ai-novelist/
missions/
artifacts/
workspaces/
docs/
scripts/
```

## Local Prerequisites

- Node.js 20 or newer.
- pnpm 9 or newer.
- Docker and Docker Compose for PostgreSQL and Redis.

## Environment

Start from the example file and replace placeholders with local-only values:

```bash
cp .env.example .env
```

Important auth variables:

- `PSF_API_TOKEN`: bearer token required for API write routes.
- `PSF_AUTH_DISABLED`: set to `true` only for local development or automated tests.
- `VITE_ORCHESTRATOR_API_URL`: Hub Web API base URL. Local default is `http://127.0.0.1:3000`.
- `VITE_PSF_API_TOKEN`: Hub Web bearer token for protected POST dry-run actions.
- `ENABLE_REAL_CODEX`: keep `0` unless an approved gated Codex run is intentional and `CODEX_EXECUTABLE`, `PSF_WORKSPACE_ROOT`, `CODEX_SANDBOX`, `CODEX_APPROVAL_MODE`, and runtime limits are configured.
- `ENABLE_REAL_PLAYWRIGHT`: keep `0` unless deterministic browser QA is intentionally enabled for a configured `QA_TEST_URL` or `STAGING_URL`.
- `ENABLE_AI_EXPLORATORY_QA`: keep `0` unless an approved AI exploratory executor path is wired.
- `PSF_ENABLE_REAL_*`: Orchestrator real-action route gates. These require `PSF_ACTION_EXECUTION_MODE=queued` and Worker Runner support; setting them alone does not run real work.

Integration variables are documented in `docs/integrations.md` and provider-specific docs. Gated real adapters exist, but the default Hub/API/CLI path still avoids real network calls. Provider credentials and base URLs only make a real adapter eligible; a real external call also needs operation gates and an injected transport.

## Setup And Database

```bash
pnpm install
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Migration command:

```bash
pnpm db:migrate
```

Seed command:

```bash
pnpm db:seed
```

## Run API

```bash
pnpm dev:api
```

Default local API URL: `http://127.0.0.1:3000`.

`GET /health` is public. `POST`, `PUT`, `PATCH`, and `DELETE` routes require:

```bash
Authorization: Bearer <PSF_API_TOKEN>
```

Example:

```bash
curl http://127.0.0.1:3000/health
curl -H "Authorization: Bearer $PSF_API_TOKEN" -X POST http://127.0.0.1:3000/projects/sync
```

Hub-facing read endpoints include `GET /dashboard`, `GET /missions/:id/summary`, and `GET /integrations`. Integration dry-runs use `POST /integrations/:name/dry-run`, including `POST /integrations/uptime-kuma/dry-run`, and require the bearer token when auth is enabled.

## Run Hub Web

```bash
pnpm dev:hub
```

Default local Hub URL: `http://127.0.0.1:5173`.

The Hub reads `VITE_ORCHESTRATOR_API_URL` and uses `VITE_PSF_API_TOKEN` only for protected dry-run actions. Token and password values must not be rendered in the Hub, returned from the API, logged, or copied into PR/Issue bodies.

## CLI Examples

The CLI is local-first and dry-run oriented. By default it tries to sync Prisma records; set `PSF_SKIP_DB=1` for explicit artifact-only runs.

```bash
pnpm psf projects:sync
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
pnpm psf codex:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf doctor
pnpm psf demo:seed --skip-db
pnpm psf demo:ai-novelist --with-sample-bug
pnpm psf demo:report --with-sample-bug
pnpm psf demo:reset --skip-db
pnpm psf integrations:status
pnpm psf integrations:dry-run github
pnpm psf integrations:dry-run coolify
pnpm psf integrations:dry-run uptime-kuma
pnpm psf integrations:dry-run plane
```

Artifact-only example:

```bash
PSF_SKIP_DB=1 pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
```

`codex:dry-run` writes `codex-prompt.md`, `codex-command.sh`, and `dev-summary.md`. The command file is a non-executable review artifact; running it exits without invoking Codex.

## Test And Build

Run focused script tests:

```bash
pnpm test:scripts
```

Run broader checks:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

Phase 1 check commands remain:

```bash
pnpm install --lockfile-only
pnpm check
pnpm typecheck
pnpm test
```

## Documentation

Start with the root current fact sources before reading historical phase plans.

- `struct.md`: current implemented architecture map and module boundaries.
- `summary.md`: current architecture problems, risks, and improvement backlog.
- `debug.md`: debug hotspots, focused verification commands, and investigation records.
- `docs/api.md`: Orchestrator API routes and request shapes.
- `docs/auth.md`: API token auth and local/dev/test boundaries.
- `docs/safety.md`: dry-run, queue, and secret safety boundaries.
- `docs/queue-runtime.md`: current default-safe queue runtime, wrapper WorkerRun, cancel/retry, dry-run jobs, and gated real-mode contract jobs.
- `docs/real-codex-execution-readiness.md`: guardrails required before gated real Codex runner execution.
- `docs/worker-permissions.md`: default-safe worker and Hub/API permission model with dry-run/status behavior plus gated real-runner contracts.
- `docs/operations.md`: local startup, doctor, demo report, and reset operations.
- `docs/troubleshooting.md`: local remedies for common dry-run failures.
- `docs/local-development.md`: zero-to-local setup path.
- `docs/health-checks.md`: doctor, API, Hub, and integration health checks.
- `docs/next-steps.md`: recommended post-demo hardening path.
- `docs/hub-web.md`: Hub Web startup, routes, and local demo flow.
- `docs/integrations.md`: shared Integration dry-run/status behavior plus gated real adapter contracts, default disabled/default-safe.
- `docs/github-integration.md`: GitHub dry-run PR/Issue behavior plus gated real adapter contract with injected transport.
- `docs/coolify-integration.md`: Coolify dry-run deploy behavior plus gated real adapter contract with injected transport.
- `docs/uptime-kuma-integration.md`: Uptime Kuma dry-run monitor behavior plus gated real adapter contract with injected transport.
- `docs/plane-integration.md`: Plane dry-run Mission/Bug issue behavior plus gated real adapter contract with injected transport.
- `docs/project-registry.md`: registry scan and DB sync behavior.
- `docs/project-passport.md`: passport fields and `ai-novelist` caveats.
- `docs/mission-planner.md`: deterministic planner API and CLI behavior.
- `docs/codex-worker.md`: Codex Worker default-disabled/default-safe boundary with dry-run behavior plus gated real-runner contract.
- `docs/artifacts.md`: inline and path-only artifact policy.
- `docs/approval-policy.md`: actions that require approval.
- `docs/progress.md`: latest batch progress and remaining work.

Use `struct.md`, `summary.md`, `debug.md`, `docs/progress.md`, and ADRs under `docs/adr/` for current implementation state and decision history.

## QA And Auto Fix Dry Run

Generate QA dry-run artifacts without a browser:

```bash
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Generate dry-run fix artifacts from `bugs.json`:

```bash
pnpm psf fix:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Optional Playwright smoke is skipped unless a URL and explicit real-browser gate are provided:

```bash
pnpm test:e2e:smoke
QA_TEST_URL=http://127.0.0.1:8000 ENABLE_REAL_PLAYWRIGHT=1 pnpm test:e2e:smoke
```

Playwright MCP is documented for later AI exploratory QA. It is not installed or run by default. Real Codex execution, remote push, PR creation, external APIs, and production deploy remain disabled unless the explicit real-mode gates, credentials, approvals, queue/runtime wiring, and injected runner/transport paths are deliberately configured.

## Queue Runtime

The current queue runtime is default-safe. Inline mode remains the default for tests and simple demos, while queued mode can route whitelisted dry-run jobs and gated real-mode contract jobs only when their runtime wiring, gates, approvals, and injected runner or transport requirements are satisfied:

```bash
PSF_WORKER_RUNTIME=in-process PSF_ACTION_EXECUTION_MODE=inline pnpm dev:api
```

Queued mode uses Redis and Worker Runner:

```bash
sudo docker compose up -d postgres redis
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

Trigger a queued QA dry-run from Hub Mission Detail, or through API:

```bash
curl -H "Authorization: Bearer $PSF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3000/missions/mission-0001-ai-novelist-chapter-review/actions/qa-dry-run \
  -d '{"withSampleBug":true}'
```

View queue status and WorkerRuns:

```bash
pnpm psf queues:status
curl http://127.0.0.1:3000/queues/status
curl 'http://127.0.0.1:3000/worker-runs?status=queued'
```

Cancel or retry a specific queue wrapper WorkerRun:

```bash
pnpm psf worker-runs:cancel <workerRunId>
pnpm psf worker-runs:retry <workerRunId>
```

The queue wrapper WorkerRun records the queue job state. Child planner, QA, Codex dry-run, fix, and demo WorkerRuns keep their existing semantics and are referenced from wrapper output.

Queued mode remains safe by default. It can route whitelisted dry-run jobs and gated real-mode contract jobs, but the normal configuration does not execute Codex, push, create PRs, deploy, create provider records, or call external services.
