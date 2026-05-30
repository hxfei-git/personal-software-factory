# Orchestrator API

Fastify MVP API for Personal Software Factory.

The Orchestrator API owns local Mission control-plane access for Phase 4. Routes call services and storage abstractions; route handlers do not contain raw Prisma persistence logic.

## MVP Endpoints

- `GET /health`
- `POST /missions`
- `GET /missions`
- `GET /missions/:id`
- `POST /missions/:id/transition`
- `POST /missions/:id/events`
- `GET /missions/:id/events`
- `GET /projects`
- `GET /projects/:id`

## Local Run

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

The first API version is local-only and has no authentication. API token authentication is deferred to a hardening batch before remote exposure.

## Tests

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```
