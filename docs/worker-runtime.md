# Worker Runtime

`@psf/worker-runtime` is the queue facade for Personal Software Factory. It gives the API, CLI, tests, and Worker Runner one contract for queue job creation, status, cancellation, retry, and queue stats.

## Implementations

- `InProcessWorkerRuntime`: used by unit tests and local dry-runs that do not require Redis.
- `BullMQWorkerRuntime`: optional queue adapter backed by Redis and BullMQ.

BullMQ is an implementation of the runtime interface. It does not replace Orchestrator, Mission storage, demo workflow, QA worker, Codex worker, Auto Fix Loop, or integration adapters.

## Queue Job Contract

Queue jobs are validated with Zod and are restricted to whitelisted types:

- `mission.plan`
- `codex.dry_run`
- `qa.dry_run`
- `qa.dry_run_with_sample_bug`
- `fix.dry_run`
- `loop.dry_run`
- `demo.ai_novelist`
- `integration.dry_run`

The runtime rejects payload keys that look like tokens, passwords, secrets, API keys, authorization headers, or credentials.

## Wrapper WorkerRun Semantics

API queued mode creates a queue wrapper WorkerRun with `status=queued`. The Worker Runner updates it to `running`, then `succeeded` or `failed`. Cancellation of queued/delayed jobs records `cancelled`; active jobs are cooperative best-effort and can record `cancellationRequested` while remaining `running`.

Child business WorkerRuns remain owned by existing planner, QA, Codex dry-run, Auto Fix Loop, demo workflow, and integration modules. Wrapper output records child IDs instead of forcing a schema-wide parent relation in this phase.

## Runtime Methods

The runtime interface supports:

- `enqueue(job)`
- `getJob(jobId)`
- `getJobStatus(jobId)`
- `cancelJob(jobId)`
- `retryJob(jobId)`
- `listJobs(filter)`
- `getQueueStats()`
- `close()`

It also keeps the older `run()` compatibility method for existing in-process tests.

## Local BullMQ Mode

```bash
sudo docker compose up -d redis
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
```

Ordinary `pnpm test` does not require Redis. Redis-specific checks are optional and should be gated with `PSF_TEST_REDIS=1`.

## Safety

The runtime only handles queue/job/status mechanics. Business handlers live in Worker Runner. Default runtime paths remain dry-run/mock/manual-action safe. Gated real-mode contract jobs exist only behind explicit route, environment, approval, and injected runner or transport gates.
