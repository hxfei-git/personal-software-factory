# Storage

Phase 2-4 storage uses Prisma with local PostgreSQL.

## Local Services

PostgreSQL and Redis run through `docker-compose.yml`:

```bash
sudo docker compose up -d postgres redis
```

Redis is running for later phases. The current API MVP does not enqueue jobs yet.

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

The current API is local-only and has no authentication. API token authentication is deferred to a hardening batch before exposing the service remotely.
