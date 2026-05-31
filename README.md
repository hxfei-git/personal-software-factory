# Personal Software Factory

Personal Software Factory / 个人 AI 软件工厂 is a single-user control plane for turning natural-language software requests into structured Missions, Codex-driven development, Playwright QA, structured bug reports, approval gates, and reviewable release work.

The repository currently contains the foundation through Phase 17B queue-backed worker runtime: shared schemas, Prisma persistence, Mission state machine, Fastify Orchestrator API, API token auth, Project Registry, Project Passport intake for `ai-novelist`, deterministic Mission Planner, local CLI helpers, Codex Worker dry-run artifact generation, QA/fix dry-runs, Hub Web, dashboard APIs, mock integration adapters, local demo workflow, doctor, scoped demo reset, report generation, optional BullMQ queue runtime, and Worker Runner.

## Current Scope

Implemented:

- `packages/mission-schema`: shared Zod schemas and TypeScript types for Project, Mission, MissionEvent, Approval, WorkerRun, Artifact, BugReport, and QARun.
- `packages/db`: Prisma schema, migrations, client wrapper, and seed support.
- `packages/mission-core`: Mission state transition validation and transition event generation.
- `packages/project-passport`: YAML parser, normalization, and validation for `project.passport.yaml`.
- `packages/project-registry`: scanner for `projects/*/project.passport.yaml` and Project metadata sync inputs.
- `packages/mission-planner`: deterministic template planner that does not call an LLM.
- `packages/integrations`: mock/dry-run GitHub, Coolify, Uptime Kuma, and Plane adapters. They never call real external APIs.
- `packages/demo-workflow`: shared local ai-novelist demo workflow, doctor, reset, and report helpers.
- `packages/worker-runtime`: in-process and optional BullMQ queue facade for dry-run action jobs.
- `apps/orchestrator-api`: Fastify API with health, dashboard, project sync/passport, Mission planning/summary, Approval, WorkerRun, Artifact, BugReport, QARun, and Integration routes.
- `apps/hub`: React/Vite Hub Web console for dashboard, Mission detail, queue status, Integration status, and simple placeholder navigation for QA, bugs, WorkerRun, artifact, approval, and project list pages.
- `apps/worker-runner`: BullMQ Worker Runner that consumes whitelisted dry-run jobs and updates queue wrapper WorkerRuns.
- `workers/codex-worker`: dry-run prompt, command review artifact, and dev summary generator. It never executes Codex.
- `scripts/psf.ts`: local dry-run CLI for registry sync, example Mission creation, planning, Codex/QA/fix dry-run artifacts, Integration dry-runs, doctor, demo reset, and demo report.

Not implemented yet:

- Real Codex execution, repository clone/update, worktree creation, project test execution, local commits, remote push, or PR creation.
- Real Playwright QA execution and browser report collection beyond the optional local smoke gate.
- Real external integrations with GitHub, Coolify, Uptime Kuma, Plane, or n8n. Current adapters remain dry-run/mock only.

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

Run `pnpm dev:api` and `pnpm dev:hub` in separate terminals. Open `http://127.0.0.1:5173` to inspect the dashboard, the fixed Mission detail for `mission-0001-ai-novelist-chapter-review`, and protected dry-run buttons.

The MVP does not execute Codex, push, create PRs, deploy, create monitors, create Plane issues, or call external services.

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
- `ENABLE_REAL_CODEX`: keep `0`; real Codex execution is not implemented in this batch.

Integration variables are documented in `docs/integrations.md` and provider-specific docs. Current adapters are still mock/dry-run only: setting `ENABLE_REAL_GITHUB=1`, `ENABLE_REAL_COOLIFY=1`, `ENABLE_REAL_UPTIME_KUMA=1`, or `ENABLE_REAL_PLANE=1` only returns `realEnabled: true`; `realNetworkCall` remains `false`.

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

- `docs/api.md`: Orchestrator API routes and request shapes.
- `docs/auth.md`: API token auth and local/dev/test boundaries.
- `docs/safety.md`: dry-run, queue, and secret safety boundaries.
- `docs/queue-runtime.md`: Phase 17B queue runtime, wrapper WorkerRun, cancel/retry, and Worker Runner usage.
- `docs/real-codex-execution-readiness.md`: guardrails required before any future real Codex execution.
- `docs/worker-permissions.md`: current dry-run worker and Hub/API permission model.
- `docs/operations.md`: local startup, doctor, demo report, and reset operations.
- `docs/troubleshooting.md`: local remedies for common dry-run failures.
- `docs/local-development.md`: zero-to-local setup path.
- `docs/health-checks.md`: doctor, API, Hub, and integration health checks.
- `docs/final-mvp-scope.md`: current local MVP scope and exclusions.
- `docs/next-steps.md`: recommended post-demo hardening path.
- `docs/hub-web.md`: Hub Web startup, routes, and local demo flow.
- `docs/integrations.md`: shared Integration dry-run contract and CLI/API commands.
- `docs/github-integration.md`: GitHub mock PR/Issue dry-run behavior.
- `docs/coolify-integration.md`: Coolify mock deploy dry-run behavior.
- `docs/uptime-kuma-integration.md`: Uptime Kuma mock monitor dry-run behavior.
- `docs/plane-integration.md`: Plane mock Mission/Bug issue dry-run behavior.
- `docs/project-registry.md`: registry scan and DB sync behavior.
- `docs/project-passport.md`: passport fields and `ai-novelist` caveats.
- `docs/mission-planner.md`: deterministic planner API and CLI behavior.
- `docs/codex-worker.md`: Codex Worker dry-run safety boundary.
- `docs/artifacts.md`: inline and path-only artifact policy.
- `docs/approval-policy.md`: actions that require approval.
- `docs/progress.md`: latest batch progress and remaining work.

Follow the phase order in `docs/01-execution-roadmap.md` and acceptance gates in `docs/04-phase-acceptance-criteria.md`.

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

Playwright MCP is documented for later AI exploratory QA. It is not installed or run by default. Real Codex execution, remote push, PR creation, external APIs, and production deploy remain disabled.

## Phase 17B Queue Runtime

Phase 17B adds optional queue-backed dry-run actions. Inline mode remains the default for tests and simple demos:

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

Queued mode is still dry-run/mock only. It does not execute Codex, push, create PRs, deploy, create provider records, or call external services.
