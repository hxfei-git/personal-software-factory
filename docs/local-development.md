# Local Development

## Prerequisites

- Node.js 20 or newer.
- pnpm 9 or newer.
- Docker and Docker Compose for PostgreSQL and Redis.

## First Setup

```bash
pnpm install
cp .env.example .env
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm psf doctor
```

Keep `.env` local. Do not commit real tokens or passwords.

## Run The API And Hub

Terminal 1:

```bash
PSF_AUTH_DISABLED=true pnpm dev:api
```

Terminal 2:

```bash
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

Open `http://127.0.0.1:5173`.

## Run The Demo

```bash
pnpm psf demo:ai-novelist --with-sample-bug
```

If the database is not running:

```bash
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
```

## Useful Commands

```bash
pnpm psf doctor
pnpm psf integrations:status
pnpm psf demo:seed --skip-db
pnpm psf demo:reset --skip-db
pnpm psf demo:report --with-sample-bug --skip-db
pnpm test:scripts
```

## Boundaries

Local development remains dry-run only for Phase 16A/16B/17A. It does not execute Codex, push, create PRs, deploy, create monitors, create Plane issues, or call external services.
