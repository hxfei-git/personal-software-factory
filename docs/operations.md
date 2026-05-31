# Operations

## Local Startup Order

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm dev:hub
pnpm psf demo:ai-novelist --with-sample-bug
```

Run `pnpm dev:api` and `pnpm dev:hub` in separate terminals. The default API URL is `http://127.0.0.1:3000`; the default Hub URL is `http://127.0.0.1:5173`.

## Daily Local Demo

```bash
pnpm psf doctor
pnpm psf demo:ai-novelist --with-sample-bug
pnpm psf demo:report --with-sample-bug
```

Use `--skip-db` or `PSF_SKIP_DB=1` for artifact-only dry-runs when PostgreSQL is not running.

## Safe Reset

Preview reset:

```bash
pnpm psf demo:reset --skip-db
```

Delete scoped demo files and records intentionally:

```bash
DEMO_RESET_CONFIRM=1 pnpm psf demo:reset
```

Reset is scoped to `mission-0001-ai-novelist-chapter-review` or `demo-*` IDs and refuses non-demo Missions.

## Health Checks

```bash
pnpm psf doctor
pnpm psf doctor --check-db
pnpm psf doctor --check-api
pnpm psf doctor --check-hub
pnpm psf integrations:status
```

Doctor is local and read-only. API and Hub HTTP checks are optional and restricted to loopback URLs.

## Dry-Run Boundaries

Current operations do not execute Codex, push branches, create PRs, deploy, create monitors, create Plane issues, or call provider APIs. Real external integrations require a later approved implementation task.

## Queue-Backed Local Actions

Inline mode remains the simplest local path:

```bash
PSF_ACTION_EXECUTION_MODE=inline pnpm dev:api
```

To verify the Phase 17B queue path locally:

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
pnpm dev:hub
```

Use Hub Mission Detail dry-run buttons or call the API to enqueue work. Inspect queue state with:

```bash
pnpm psf queues:status
curl http://127.0.0.1:3000/queues/status
```

Cancel or retry only a specific wrapper WorkerRun:

```bash
pnpm psf worker-runs:cancel <workerRunId>
pnpm psf worker-runs:retry <workerRunId>
```

Queue mode is still dry-run/mock only. Worker Runner reuses existing dry-run workflows and does not execute Codex, push, create PRs, deploy, or call external providers.
