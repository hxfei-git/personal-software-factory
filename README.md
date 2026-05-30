# Personal Software Factory

Personal Software Factory / 个人 AI 软件工厂 is a single-user control plane for turning natural-language software requests into structured Missions, Codex-driven development, Playwright QA, structured bug reports, approval gates, and reviewable release work.

The repository currently contains the foundation through the Phase 4.5-7 dry-run batch: shared schemas, Prisma persistence, Mission state machine, Fastify Orchestrator API, API token auth, Project Registry, Project Passport intake for `ai-novelist`, deterministic Mission Planner, local CLI helpers, and Codex Worker dry-run artifact generation.

## Current Scope

Implemented:

- `packages/mission-schema`: shared Zod schemas and TypeScript types for Project, Mission, MissionEvent, Approval, WorkerRun, Artifact, BugReport, and QARun.
- `packages/db`: Prisma schema, migrations, client wrapper, and seed support.
- `packages/mission-core`: Mission state transition validation and transition event generation.
- `packages/project-passport`: YAML parser, normalization, and validation for `project.passport.yaml`.
- `packages/project-registry`: scanner for `projects/*/project.passport.yaml` and Project metadata sync inputs.
- `packages/mission-planner`: deterministic template planner that does not call an LLM.
- `apps/orchestrator-api`: Fastify API with health, project sync/passport, Mission planning, Approval, WorkerRun, Artifact, BugReport, and QARun routes.
- `workers/codex-worker`: dry-run prompt, command review artifact, and dev summary generator. It never executes Codex.
- `scripts/psf.ts`: local dry-run CLI for registry sync, example Mission creation, planning, and Codex dry-run artifacts.

Not implemented yet:

- Real Codex execution, repository clone/update, worktree creation, project test execution, local commits, remote push, or PR creation.
- QA Worker execution and Playwright report collection.
- Hub Web UI beyond placeholder package structure.
- BullMQ queues and external integrations with GitHub, Coolify, Uptime Kuma, Plane, or n8n.

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
- `ENABLE_REAL_CODEX`: keep `0`; real Codex execution is not implemented in this batch.

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

## CLI Examples

The CLI is local-first and dry-run oriented. By default it tries to sync Prisma records; set `PSF_SKIP_DB=1` for explicit artifact-only runs.

```bash
pnpm psf projects:sync
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
pnpm psf codex:dry-run mission-0001-ai-novelist-chapter-review
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
- `docs/project-registry.md`: registry scan and DB sync behavior.
- `docs/project-passport.md`: passport fields and `ai-novelist` caveats.
- `docs/mission-planner.md`: deterministic planner API and CLI behavior.
- `docs/codex-worker.md`: Codex Worker dry-run safety boundary.
- `docs/artifacts.md`: inline and path-only artifact policy.
- `docs/approval-policy.md`: actions that require approval.
- `docs/progress.md`: latest batch progress and remaining work.

Follow the phase order in `docs/01-execution-roadmap.md` and acceptance gates in `docs/04-phase-acceptance-criteria.md`.
