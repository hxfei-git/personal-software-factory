# Personal Software Factory

Personal Software Factory / 个人 AI 软件工厂 is a single-user control plane for turning natural-language software requests into structured Missions, Codex Worker development, Playwright QA, structured bug reports, automated fix loops, and GitHub PRs.

The repository now contains the Phase 2-4 core foundation: shared schemas, Project Passport parsing, Prisma/PostgreSQL persistence, a reusable Mission state machine, and a minimal Orchestrator API.

## Current Scope

Implemented:

- `packages/mission-schema`: shared Zod schemas, TypeScript types, and examples.
- `packages/project-passport`: YAML parser and validator for `project.passport.yaml`.
- `packages/db`: Prisma schema, initial migration, client wrapper, and seed data.
- `packages/mission-core`: Mission state machine and transition event generation.
- `apps/orchestrator-api`: Fastify API MVP for projects, missions, transitions, and events.

Not implemented in this batch:

- Codex Worker.
- QA Worker.
- Hub Web UI.
- Real GitHub, Coolify, Uptime Kuma, or Plane API integrations.

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
  mission-schema/
  project-passport/
projects/
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

## Setup And Database

```bash
pnpm install
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Test And Build

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Run API

```bash
pnpm dev:api
```

Default local API URL: `http://127.0.0.1:3000`.

## API Docs

See `docs/api.md` for endpoint details.

## Development Order

Follow the documented phase order in `docs/01-execution-roadmap.md` and acceptance gates in `docs/04-phase-acceptance-criteria.md`.
