# Troubleshooting

## DB Unavailable

Symptom: demo sync or migration fails with a database connection error.

Remedy:

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

For artifact-only dry-runs, use `--skip-db` or `PSF_SKIP_DB=1`.

## API Token Failure

Symptom: protected POST routes return unauthorized.

Remedy: set `PSF_API_TOKEN` for the API and send `Authorization: Bearer <token>`. For local-only manual testing, `PSF_AUTH_DISABLED=true pnpm dev:api` bypasses write auth. Do not use disabled auth in shared or exposed environments.

## Hub Cannot Connect API

Symptom: Hub shows failed API reads or dry-run action errors.

Remedy: start the API first, confirm `http://127.0.0.1:3000/health`, and start Hub with:

```bash
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

For protected buttons, set `VITE_PSF_API_TOKEN` to a local throwaway token matching `PSF_API_TOKEN`, or run the API with local auth disabled.

If the API responds to `curl` but Hub still shows `API unavailable: Failed to fetch`, check browser CORS/preflight behavior. The Orchestrator API returns local development CORS headers by default and handles `OPTIONS` requests. In a stricter environment, set `PSF_CORS_ORIGIN` before starting the API, for example:

```bash
DATABASE_URL=postgresql://psf:psf_dev_password@localhost:5432/psf?schema=public \
  PSF_AUTH_DISABLED=true \
  PSF_CORS_ORIGIN=http://127.0.0.1:5173 \
  pnpm dev:api
```

For VSCode forwarded ports with a non-localhost browser origin, local development can leave `PSF_CORS_ORIGIN` unset so the API uses a wildcard CORS origin. Do not use wildcard CORS for shared or production deployments.

## Artifact Missing

Symptom: Mission detail references are empty or an expected file is absent.

Remedy:

```bash
pnpm psf demo:seed --skip-db
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
```

Then inspect `missions/mission-0001-ai-novelist-chapter-review/`.

## QA Dry-Run Failure

Symptom: QA dry-run action fails or produces no sample bug.

Remedy: rerun the fixed demo action:

```bash
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
```

This QA path is deterministic and does not launch a browser.

## Auto Fix Loop Failure

Symptom: `fix:dry-run` or `loop-dry-run` cannot find bug input.

Remedy: run QA dry-run with a sample bug first:

```bash
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf fix:dry-run mission-0001-ai-novelist-chapter-review
```

## Playwright Skipped

Symptom: Playwright smoke reports skipped.

Remedy: this is expected unless a target URL and explicit real-browser gate are provided:

```bash
QA_TEST_URL=http://127.0.0.1:8000 ENABLE_REAL_PLAYWRIGHT=1 pnpm test:e2e:smoke
```

The Phase 16A/16B/17A demo does not require real browser QA.

## Integration Dry-Run Failure

Symptom: an integration dry-run reports missing env or unsafe state.

Remedy:

```bash
pnpm psf integrations:status
pnpm psf integrations:dry-run github
pnpm psf integrations:dry-run coolify
pnpm psf integrations:dry-run uptime-kuma
pnpm psf integrations:dry-run plane
```

Missing provider env can be acceptable in dry-run. `realNetworkCall` must remain `false`.

## pnpm test Failure

Symptom: test suite fails after local changes.

Remedy: start with focused checks for the changed surface:

```bash
pnpm test:scripts
pnpm --filter @psf/demo-workflow test
```

Then run broader checks when shared contracts changed:

```bash
pnpm test
pnpm typecheck
```

## Safe Demo Reset

Symptom: demo data is stale or inconsistent.

Remedy: preview first, then confirm only when intentional:

```bash
pnpm psf demo:reset --skip-db
DEMO_RESET_CONFIRM=1 pnpm psf demo:reset --skip-db
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
```

## Queue Runtime Problems

Symptom: queued dry-run actions stay queued.

Remedy: verify Redis and Worker Runner are running:

```bash
sudo docker compose up -d redis
pnpm psf queues:status
pnpm worker:dev
```

Symptom: API returns a queue enqueue error.

Remedy: check `PSF_WORKER_RUNTIME`, `PSF_ACTION_EXECUTION_MODE`, and `PSF_REDIS_URL`. For Redis-free local work, use inline mode:

```bash
PSF_WORKER_RUNTIME=in-process PSF_ACTION_EXECUTION_MODE=inline pnpm dev:api
```

Symptom: cancel does not stop an already running job immediately.

Remedy: active cancellation is cooperative and best-effort. Refresh Mission Detail and inspect the wrapper WorkerRun output for `cancellationRequested`.

Symptom: retry is rejected.

Remedy: retry is allowed only for failed or cancelled queue wrapper WorkerRuns, not running or succeeded runs.

## Worker Runner Stale Heartbeat

Symptom: a queue wrapper WorkerRun stays `running` after Worker Runner stopped.

Remedy: run doctor and inspect the wrapper WorkerRun output/metadata for `heartbeatAt`, `workerRunnerHeartbeatAt`, `correlationId`, `jobId`, and `jobType`. Restart Worker Runner, then cancel or retry only that specific wrapper after confirming no process is still handling it. This phase does not perform automatic stale recovery.

## Artifact Cleanup Preview

Symptom: local artifacts are growing.

Remedy: preview expired files first:

```bash
pnpm psf artifacts:cleanup --dry-run
```

The command lists candidates and deletes nothing. It scans only `artifacts/`, skips symlinks, uses retention helpers, and refuses cleanup candidates outside the artifact root.

## Token Rotation

Symptom: a local or provider token was exposed or should be refreshed.

Remedy: rotate it at the source, update `.env`, restart API/Hub/Worker Runner, then run `pnpm psf doctor` and `pnpm psf integrations:status`. Do not include the old or new token in bug reports, logs, PRs, Issues, or artifacts.

## Backup Restore Problems

Symptom: restored local data does not match Hub/API state.

Remedy: stop API and Worker Runner, restore PostgreSQL first, restore `missions/`, `artifacts/`, `workspaces/`, and `projects/`, then run `pnpm psf doctor --check-db`. If queue state is inconsistent, prefer scoped WorkerRun cancel/retry over deleting Redis keys.

## Real-Mode Readiness Failure

Symptom: doctor warns about `ENABLE_REAL_*` or `PSF_ENABLE_REAL_*`.

Remedy: treat the warning as readiness visibility only. Current integrations and Hub actions must keep `realNetworkCall: false`; do not add credentials or retry expecting a real provider call in this phase.
