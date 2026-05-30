# Database

Prisma/PostgreSQL persistence package for Personal Software Factory.

## Responsibilities

- Own Prisma schema and migrations.
- Store core resource fields used by Planner, Codex dry-run, QA, artifacts, approvals, and bugs.
- Export the shared Prisma client wrapper.
- Provide seed data for `ai-novelist` and a sample Mission.
- Keep persistence separate from Orchestrator API routes.

## Models

- Project
- Mission
- MissionEvent
- WorkerRun
- QARun
- Bug
- Artifact
- Approval
- Deployment
- Monitor

## Core Resource Migration

Migration `000002_core_resources` expands worker runs, artifacts, approvals, bugs, and QA runs with nullable/defaulted columns so existing rows remain valid while later API and worker phases can persist dry-run resource data.

## Local Commands

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm --filter @psf/db typecheck
```

The package scripts include local development defaults for `DATABASE_URL`. A real environment can override `DATABASE_URL` from the shell or process manager.
