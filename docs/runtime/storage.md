# Storage

Storage uses Prisma with local PostgreSQL.

## Local Services

PostgreSQL and Redis run through `docker-compose.yml`:

```bash
sudo docker compose up -d postgres redis
```

Redis backs the optional BullMQ queue runtime when queued mode is enabled. Inline mode remains available for small local loops, and queued jobs stay limited to whitelisted dry-run or gated real-mode contracts.

## Prisma Commands

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`@psf/db` scripts include local development defaults for `DATABASE_URL`, while allowing a real environment variable to override them.

## Storage Abstraction

`apps/orchestrator-api/src/storage.ts` defines `MissionStorage`. The API can run against:

- `createInMemoryMissionStorage()` for API tests;
- `createPrismaMissionStorage(prisma)` for local development.

Routes do not perform raw Prisma operations. Routes call services; services call storage.

## Authentication Scope

The Orchestrator API now protects write routes with API token auth unless `PSF_AUTH_DISABLED=true` or `NODE_ENV=test`. Storage remains auth-agnostic: routes call services, services call storage, and auth is enforced before write handlers run.
