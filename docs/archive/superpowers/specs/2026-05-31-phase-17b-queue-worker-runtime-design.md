# Phase 17B Queue-Backed Worker Runtime Design

## Purpose

Phase 17B upgrades Personal Software Factory from synchronous API-triggered dry-run actions to an asynchronous queue-backed action pipeline. The goal is to validate the local Redis / BullMQ / Worker Runner path while keeping all business execution dry-run or mock.

This phase does not change the product boundary: Codex is not executed, GitHub/Coolify/Uptime Kuma/Plane are not called, no push is performed, no PR is created, and no deployment is triggered.

## Confirmed Approach

Use BullMQ adapter plus queue wrapper WorkerRun plus inline compatibility.

- `@psf/worker-runtime` remains the queue facade.
- `InProcessWorkerRuntime` stays available for tests and no-Redis local dry-runs.
- `BullMQWorkerRuntime` is added as an optional implementation enabled by environment variables.
- Orchestrator API supports both inline and queued action execution.
- Queued mode creates one wrapper WorkerRun per queued job.
- Worker Runner consumes BullMQ jobs and updates the wrapper WorkerRun state.
- Existing `demo-workflow`, `qa-worker`, `codex-worker`, and `auto-fix-loop` keep their current business WorkerRun write semantics.

## Queue Wrapper WorkerRun Semantics

The wrapper WorkerRun represents the queue job itself, not the child business work.

At enqueue time:

- `status = queued`
- `mode = dry-run` or `mock`
- `metadata.jobId` records the queue job id.
- `metadata.jobType` records the job type, such as `qa.dry_run`, `loop.dry_run`, or `demo.ai_novelist`.
- `input` stores only safe job payload fields.

At Worker Runner execution time:

- `queued -> running` when processing starts.
- `running -> succeeded` when the handler completes.
- `running -> failed` when the handler fails.
- `queued/delayed -> cancelled` when cancellation succeeds.
- active job cancellation is best-effort and cooperative only; the system must not promise force-kill semantics.

The wrapper WorkerRun output records safe child references:

- `jobId`
- `jobType`
- `childWorkerRunIds`
- `childQARunIds`
- `childArtifactIds`
- `childBugReportIds`
- `summary`
- `recommendedNextAction`

This phase will not add a formal `parentWorkerRunId` or `rootWorkerRunId` schema relation. If cleaner relational semantics are needed later, they can be added after the queue layer is stable.

## WorkerRuntime Package

`packages/worker-runtime` will define runtime-neutral queue concepts with Zod validation.

Core types:

- `WorkerJob`
- `WorkerJobType`
- `WorkerJobStatus`
- `WorkerRuntime`
- `QueueStats`
- `QueuedJobRecord`

Job types:

- `mission.plan`
- `codex.dry_run`
- `qa.dry_run`
- `qa.dry_run_with_sample_bug`
- `fix.dry_run`
- `loop.dry_run`
- `demo.ai_novelist`
- `integration.dry_run`

Job statuses:

- `queued`
- `active`
- `completed`
- `failed`
- `cancelled`
- `delayed`

Runtime methods:

- `enqueue(job)`
- `getJob(jobId)`
- `getJobStatus(jobId)`
- `cancelJob(jobId)`
- `retryJob(jobId)`
- `listJobs(filter)`
- `getQueueStats()`
- `close()`

`BullMQWorkerRuntime` only handles queue, job, status, cancellation, retry, and stats. It must not contain business handlers.

## Environment Configuration

New environment variables:

- `PSF_WORKER_RUNTIME=in-process`
- `PSF_REDIS_URL=redis://127.0.0.1:6379`
- `PSF_QUEUE_PREFIX=psf`
- `PSF_WORKER_CONCURRENCY=2`
- `PSF_JOB_ATTEMPTS=2`
- `PSF_JOB_TIMEOUT_MS=300000`
- `PSF_ACTION_EXECUTION_MODE=inline`

Default behavior:

- Test mode uses inline / in-process behavior and does not require Redis.
- Local queued mode is enabled with `PSF_WORKER_RUNTIME=bullmq` and `PSF_ACTION_EXECUTION_MODE=queued`.
- Redis integration tests are optional and only run when `PSF_TEST_REDIS=1`.

## Orchestrator API Design

Existing action routes remain stable:

- `POST /missions/:id/actions/plan`
- `POST /missions/:id/actions/codex-dry-run`
- `POST /missions/:id/actions/qa-dry-run`
- `POST /missions/:id/actions/fix-dry-run`
- `POST /missions/:id/actions/loop-dry-run`
- `POST /demo/ai-novelist`
- `POST /integrations/:name/dry-run`

Execution mode is selected by `PSF_ACTION_EXECUTION_MODE`.

Inline mode:

- Keeps current behavior compatible.
- Runs the existing dry-run workflow immediately.
- Returns existing dry-run output plus `accepted: true` and `executionMode: "inline"` where practical.

Queued mode:

- Validates the request and Mission.
- Creates wrapper WorkerRun with `status = queued`.
- Enqueues a whitelisted WorkerJob.
- Returns accepted response without executing business work in the API process.

Queued response shape:

```json
{
  "accepted": true,
  "executionMode": "queued",
  "workerRunId": "worker-run-...",
  "jobId": "job-...",
  "missionId": "mission-0001-ai-novelist-chapter-review",
  "status": "queued",
  "recommendedNextAction": "Start or refresh Worker Runner, then refresh Mission Summary."
}
```

New queue routes:

- `GET /queues/status`
- `GET /jobs/:jobId`
- `GET /worker-runs?status=&missionId=&workerType=`
- `POST /worker-runs/:id/cancel`
- `POST /worker-runs/:id/retry`

Rules:

- Write routes remain Bearer-token protected.
- No arbitrary job type is accepted.
- No arbitrary shell command execution is exposed.
- No destructive queue clearing or clear-all endpoint is added.
- Cancel only targets a specific wrapper WorkerRun/job.
- Retry only targets failed or cancelled wrapper WorkerRuns.
- Retry preserves original job type, mission id, project id, and payload, and records a new `jobId` or retry attempt metadata.

## Worker Runner Design

Add a dedicated Worker Runner entrypoint, preferably `apps/worker-runner`.

Commands:

- `pnpm worker:dev`
- `pnpm psf worker:start`
- `pnpm psf worker:once`

Responsibilities:

1. Connect to Redis through `BullMQWorkerRuntime`.
2. Register business job handlers outside the runtime adapter.
3. Consume whitelisted jobs.
4. Load and update the wrapper WorkerRun.
5. Write MissionEvent for state changes.
6. Execute existing dry-run workflow handlers.
7. Store safe output or error summaries.
8. Support graceful shutdown.
9. Respect configured concurrency and timeout.

Handler mapping:

- `mission.plan` calls the existing Mission Planner/demo workflow path.
- `codex.dry_run` calls existing Codex dry-run workflow.
- `qa.dry_run` calls existing QA dry-run workflow.
- `qa.dry_run_with_sample_bug` calls QA dry-run with sample bug input.
- `fix.dry_run` calls existing Auto Fix dry-run workflow.
- `loop.dry_run` calls existing QA -> fix loop dry-run workflow.
- `demo.ai_novelist` calls `packages/demo-workflow`.
- `integration.dry_run` calls `packages/integrations` dry-run adapters.

Business logic must not be copied into the runtime adapter.

## Hub Web Design

Hub continues to call only Orchestrator API.

Dashboard additions:

- Queue runtime.
- Queued job count.
- Running job count.
- Failed job count.
- Last queue wrapper WorkerRun.
- Redis / queue status warning when available.

Mission Detail additions:

- Dry-run action responses show accepted state, `jobId`, and `workerRunId`.
- WorkerRun list distinguishes queue wrapper WorkerRuns from child business WorkerRuns.
- Wrapper output can show child WorkerRun, QARun, Artifact, and BugReport ids.
- Failed wrapper WorkerRuns show a safe error summary.
- Refresh remains the primary way to observe status changes in this phase.

Worker Runs view:

- Shows `workerRunId`, `missionId`, `workerType`, `mode`, `status`, `jobId`, `jobType`, timestamps, and error summary.
- Optional cancel/retry buttons call Orchestrator API only.

## CLI Design

Add queue-oriented commands to the existing `pnpm psf` CLI:

- `pnpm psf queues:status`
- `pnpm psf worker:start`
- `pnpm psf worker:once`
- `pnpm psf worker-runs:list`
- `pnpm psf worker-runs:cancel <workerRunId>`
- `pnpm psf worker-runs:retry <workerRunId>`

CLI constraints:

- No arbitrary command execution.
- No token or password output.
- Redis unavailable errors are readable.
- Retry and cancel operate only on the specified WorkerRun.

## Doctor And Operations

Doctor adds queue checks:

- `PSF_WORKER_RUNTIME`
- `PSF_ACTION_EXECUTION_MODE`
- `PSF_REDIS_URL` presence
- optional Redis connectivity
- BullMQ availability
- whether Worker Runner should be started
- existing `ENABLE_REAL_*` and `ENABLE_REAL_CODEX` warnings remain

Documentation will cover:

- How to start Redis.
- How to run API inline.
- How to run API queued.
- How to start Worker Runner.
- How to trigger queued QA dry-run.
- How to inspect queue status.
- How to cancel/retry WorkerRuns.

## Safety And Redaction

All Phase 17B execution remains dry-run or mock.

Forbidden in this phase:

- real Codex execution
- Git push
- PR creation
- production deploy
- real provider network calls
- Temporal or LangGraph implementation
- queue endpoints that clear or obliterate all jobs

Job payloads, WorkerRun output, API responses, CLI output, Hub UI, logs, and docs must not include tokens or passwords.

## Testing Strategy

Normal `pnpm test` must not require Redis.

Required normal tests:

- WorkerJob schema validation.
- InProcess runtime compatibility.
- BullMQ runtime constructability.
- Redis unavailable failure is readable.
- enqueue/get/list/stats behavior through fake or in-process runtime.
- cancel queued job behavior.
- retry failed/cancelled job behavior.
- retry rejects running/succeeded WorkerRuns.
- wrapper WorkerRun `queued -> running -> succeeded`.
- wrapper WorkerRun `queued -> running -> failed`.
- wrapper WorkerRun cancel state.
- MissionEvent writes for wrapper state changes.
- action API inline compatibility.
- action API queued accepted response.
- action API queued creates wrapper WorkerRun and does not execute business workflow in API process.
- Worker Runner consumes at least `qa.dry_run` and `loop.dry_run` jobs through test doubles or in-process wiring.
- queue status API.
- WorkerRun cancel/retry API.
- CLI `queues:status`.
- CLI `worker:once` or runner command path.
- Hub queue status rendering.
- Hub accepted response rendering.
- Hub failed WorkerRun rendering.
- token redaction.

Optional tests:

- Real Redis/BullMQ integration tests only when `PSF_TEST_REDIS=1`.

## Documentation Updates

Create or update:

- `docs/brainstorms/phase-17-queue-worker-runtime.md`
- `docs/queue-runtime.md`
- `docs/worker-runtime.md`
- `docs/api.md`
- `docs/operations.md`
- `docs/troubleshooting.md`
- `docs/health-checks.md`
- `docs/local-development.md`
- `docs/safety.md`
- `docs/real-codex-execution-readiness.md`
- `docs/progress.md`
- `README.md`
- `.env.example`

`docs/worker-runtime.md` and `docs/queue-runtime.md` must explicitly document queue wrapper WorkerRun semantics and the deferred parent-child relation.

## Acceptance Criteria

- API can run dry-run actions inline as before.
- API can accept queued dry-run actions without executing the long task in the API process.
- Worker Runner can consume queued jobs and update wrapper WorkerRun status.
- Hub can show queue status and accepted job ids.
- CLI can show queue status and target cancel/retry by WorkerRun id.
- Normal tests, typecheck, build, and whitespace checks pass without Redis.
- Real Redis testing remains optional through `PSF_TEST_REDIS=1`.
- No real Codex, push, PR, deploy, or external provider call occurs.
- The implementation remains aligned with `plan.md` and the existing local-first Personal Software Factory architecture.
