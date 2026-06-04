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

Queue mode remains default-safe. Worker Runner can route dry-run/mock jobs and gated real-mode contract jobs, but default paths do not execute Codex, push, create PRs, deploy, create monitors, create Plane issues, or call external providers without explicit route, environment, approval, and injected runner or transport gates.

## Artifact Retention Operations

Real-mode artifact helpers write new artifacts under:

```text
artifacts/missions/<mission-id>/<worker-run-id>/<category>/<filename>
```

The legacy demo path `missions/<mission-id>/<filename>` remains readable for existing dry-run/demo files, but operators should not use it for new real-mode writes.

Retention cleanup must be previewed before deletion. The helper defaults to dry-run mode and returns candidate paths without deleting files. A non-dry-run cleanup must be explicitly requested and still refuses to delete paths outside the configured `artifacts/` root.

Use retention classes consistently: `short` for temporary logs/screenshots/traces, `mission` for Mission review artifacts, `release` for deployment/release evidence, and `audit` for evidence that must not expire automatically.

## Backup And Restore

Back up local operator state before destructive maintenance:

```bash
mkdir -p artifacts/backups
pg_dump "$DATABASE_URL" > artifacts/backups/psf-local-$(date +%Y%m%d%H%M%S).sql
tar -czf artifacts/backups/psf-files-$(date +%Y%m%d%H%M%S).tgz missions artifacts workspaces projects
```

Restore into a fresh local environment only after stopping API and Worker Runner processes:

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
psql "$DATABASE_URL" < artifacts/backups/<backup>.sql
tar -xzf artifacts/backups/<files>.tgz
pnpm psf doctor --check-db
```

Do not store provider tokens in backups. If a backup might contain secrets, rotate the affected tokens before sharing or archiving it.

## Token Rotation

Rotate local and provider tokens by replacing `.env` values, restarting API/Hub/Worker Runner, and running:

```bash
pnpm psf doctor
pnpm psf integrations:status
```

Do not paste old or new token values into logs, PRs, Issues, dry-run artifacts, Hub fields, or troubleshooting notes. `VITE_PSF_API_TOKEN` is browser-visible and must be a local throwaway value only.

## Crash And Queue Recovery

If the API crashes, restart it and check health before triggering more actions. If Worker Runner crashes, queued jobs remain in Redis/BullMQ and wrapper WorkerRuns may remain `running` until manually inspected. Doctor reports the heartbeat fields that operators should inspect: `heartbeatAt`, `workerRunnerHeartbeatAt`, `correlationId`, `jobId`, and `jobType`.

There is no automatic stale-job recovery in this phase. For a stale wrapper WorkerRun, inspect Mission Detail or the API, confirm no Worker Runner is still processing the job, then use the scoped cancel/retry controls for that specific WorkerRun. Do not clear Redis or bulk-delete queue data unless an explicit later recovery task approves that operation.

## Real-Mode Readiness

Before any later real-mode task can be considered ready, `pnpm psf doctor --json` must show dry-run-safe integrations with `realNetworkCall: false`, valid artifact/workspace roots, queue configuration that matches the intended runtime, active redaction, and no missing approvals for the specific action. Setting `ENABLE_REAL_*` or `PSF_ENABLE_REAL_*` only produces readiness warnings today; it must not enable provider API calls by itself.
