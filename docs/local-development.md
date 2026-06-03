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

Local development is dry-run/mock/manual-action by default. Gated real contract paths require explicit route, environment, approval, and injected runner or transport gates before they can execute Codex, push, create PRs, deploy, create monitors, create Plane issues, or call external services.

## Optional Queued Mode

Phase 17B supports a queued dry-run path. Keep inline mode for the smallest local loop:

```bash
PSF_ACTION_EXECUTION_MODE=inline pnpm dev:api
```

Use BullMQ only when you want to verify asynchronous Worker Runner behavior:

```bash
sudo docker compose up -d postgres redis
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

After triggering a Hub dry-run action, refresh Mission Detail to watch the queue wrapper WorkerRun move through queued, running, succeeded, or failed.

Useful queue commands:

```bash
pnpm psf queues:status
pnpm psf worker-runs:cancel <workerRunId>
pnpm psf worker-runs:retry <workerRunId>
```

## Local Backup And Restore

For local experiments, keep backups under `artifacts/backups/` and avoid storing real provider tokens there. Stop API and Worker Runner before restoring database or filesystem state. After restore, run:

```bash
pnpm psf doctor --check-db
pnpm psf queues:status
```

## Artifact Cleanup Preview

Use the preview command to see expired local artifacts without deleting them:

```bash
pnpm psf artifacts:cleanup --dry-run
```

Cleanup is preview-only in this phase. Do not manually delete shared artifact directories while a Worker Runner is active.

## Token Rotation Locally

When changing `PSF_API_TOKEN`, provider tokens, or browser-visible `VITE_PSF_API_TOKEN`, restart every process that reads the value. Use only local throwaway values for Vite-exposed tokens, then rerun doctor and integration status.
