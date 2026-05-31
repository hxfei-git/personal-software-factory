# Phase 17B Progress

## Completed In This Batch

- Added optional queue-backed dry-run execution with `@psf/worker-runtime` supporting in-process and BullMQ runtimes.
- Added queue wrapper WorkerRun semantics for accepted jobs while preserving existing planner, QA, Codex dry-run, fix, demo, and integration child WorkerRun behavior.
- Updated Orchestrator action APIs to support `PSF_ACTION_EXECUTION_MODE=inline` and `PSF_ACTION_EXECUTION_MODE=queued`.
- Added Queue API surfaces for queue status, job lookup, WorkerRun filtering, cancel, and retry.
- Added Worker Runner for consuming whitelisted dry-run jobs and updating wrapper WorkerRun status.
- Added CLI queue helpers for status, worker guidance, WorkerRun cancel, and WorkerRun retry.
- Updated Hub Web to show queue runtime status, accepted queued action metadata, wrapper WorkerRuns, child IDs, and failed WorkerRun errors.
- Added doctor queue checks, queue environment variables, queue runtime docs, and future real Codex readiness docs.

## Created Or Modified Files

- `.env.example`
- `README.md`
- `apps/orchestrator-api/*`
- `apps/hub/*`
- `apps/worker-runner/*`
- `packages/worker-runtime/*`
- `packages/demo-workflow/src/doctor.ts`
- `packages/demo-workflow/tests/demo-workflow.test.ts`
- `scripts/psf.ts`
- `scripts/psf.test.ts`
- `docs/brainstorms/phase-17-queue-worker-runtime.md`
- `docs/queue-runtime.md`
- `docs/real-codex-execution-readiness.md`
- `docs/worker-runtime.md`
- `docs/api.md`
- `docs/operations.md`
- `docs/troubleshooting.md`
- `docs/health-checks.md`
- `docs/local-development.md`
- `docs/safety.md`
- `docs/progress.md`

## Database Migration

No Prisma migration is required for Phase 17B. Queue wrapper metadata and child ID references use existing WorkerRun `metadata` and `output` JSON fields.

## Environment Variables

```dotenv
PSF_WORKER_RUNTIME=in-process
PSF_ACTION_EXECUTION_MODE=inline
PSF_REDIS_URL=redis://127.0.0.1:6379
PSF_QUEUE_PREFIX=psf
PSF_WORKER_CONCURRENCY=2
PSF_JOB_ATTEMPTS=2
PSF_JOB_TIMEOUT_MS=300000
PSF_TEST_REDIS=0
```

## Commands

```bash
sudo docker compose up -d redis
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
pnpm worker:once
pnpm psf queues:status
pnpm psf worker-runs:list
pnpm psf worker-runs:cancel <workerRunId>
pnpm psf worker-runs:retry <workerRunId>
```

## Test Commands

Focused checks:

```bash
pnpm --filter @psf/demo-workflow test
pnpm --filter @psf/demo-workflow typecheck
rg -n "misleading real-execution claims" docs README.md
```

Full gates:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

## Dry-Run And Mock Boundaries

- Queue jobs are whitelisted dry-run/mock jobs only.
- Worker Runner does not execute Codex.
- Worker Runner does not push, create PRs, deploy, create monitors, create Plane issues, or call external provider APIs.
- Integration adapters must continue to return `realNetworkCall: false`.
- Active cancel is cooperative and best-effort; it does not promise a hard process kill.
- Retry is limited to failed or cancelled queue wrapper WorkerRuns.

## Plan Alignment

Phase 17B aligns with `plan.md` by adding a local queue-backed Worker Runtime while keeping Orchestrator as the API boundary and existing business workflows intact. It does not introduce Temporal, LangGraph, real Codex execution, or real external integrations.

## Next Suggestions

1. Manually verify queued mode with Redis, API, Worker Runner, and Hub running together.
2. Add stronger parent/child WorkerRun relations only after queue semantics are stable.
3. Prepare workspace isolation, command policy, approval checks, and log/artifact retention before considering real Codex execution.
4. Keep real GitHub PR, Coolify deploy, Uptime Kuma monitor, and Plane issue adapters behind later explicit approval.
