# Database

Prisma/PostgreSQL persistence package for Personal Software Factory.

## Responsibilities

- Own Prisma schema and migrations.
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

## Local Commands

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm --filter @psf/db typecheck
```

The package scripts include local development defaults for `DATABASE_URL`. A real environment can override `DATABASE_URL` from the shell or process manager.
