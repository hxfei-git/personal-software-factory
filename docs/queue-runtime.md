# Queue Runtime

Phase 17B adds optional queue-backed execution for safe dry-run actions. The goal is to keep the Orchestrator API responsive while longer dry-run workflows are consumed by a Worker Runner.

## Why The Queue Exists

Before Phase 17B, protected action routes could run the dry-run workflow inside the API process. That is acceptable for small demos, but it makes status observation, retry, cancellation, and future long-running worker isolation harder. The queue layer gives the system a durable boundary for accepted work while preserving the existing Mission, Artifact, BugReport, QARun, and WorkerRun models.

## Inline Versus Queued

- `PSF_ACTION_EXECUTION_MODE=inline`: the API executes the current dry-run workflow immediately. This remains the default for tests and simple local demos.
- `PSF_ACTION_EXECUTION_MODE=queued`: the API validates the request, creates a queue wrapper WorkerRun, enqueues a whitelisted job, and returns an accepted response with `workerRunId` and `jobId`.
- `PSF_WORKER_RUNTIME=in-process`: no Redis is required; useful for tests and local helpers.
- `PSF_WORKER_RUNTIME=bullmq`: the runtime uses BullMQ over Redis. Start Redis and a Worker Runner before expecting queued jobs to finish.

## Queue Wrapper WorkerRun

Phase 17B intentionally uses a queue-level wrapper WorkerRun. This wrapper represents the queue job itself, not the planner, QA, Codex dry-run, or fix worker business run.

Wrapper lifecycle:

```text
queued -> running -> succeeded
queued -> running -> failed
queued -> cancelled
running -> running with cancellationRequested=true, when active cancellation is only best-effort
```

The existing dry-run workflows keep their current child WorkerRun semantics. The wrapper `output` or `metadata` records relationships such as:

```json
{
  "queueWrapper": true,
  "jobId": "job-123",
  "jobType": "qa.dry_run",
  "childWorkerRunIds": [],
  "childQARunIds": [],
  "childArtifactIds": [],
  "childBugReportIds": [],
  "summary": "QA dry-run queued or completed.",
  "recommendedNextAction": "Refresh Mission Detail to inspect child resources."
}
```

If a later phase needs stronger relationships, add `parentWorkerRunId` or `rootWorkerRunId` deliberately. Phase 17B avoids that schema migration.

## Start Redis, API, Worker Runner, And Hub

```bash
sudo docker compose up -d redis
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

The API still needs the database for persisted Missions and WorkerRuns. For a full local stack, start PostgreSQL too:

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Trigger A Queued Action

Through Hub, use a Mission Detail dry-run button such as Run QA Dry-run. Through API:

```bash
curl -H "Authorization: Bearer $PSF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3000/missions/mission-0001-ai-novelist-chapter-review/actions/qa-dry-run \
  -d '{"withSampleBug":true}'
```

Queued responses include `accepted`, `executionMode`, `workerRunId`, `jobId`, `status`, and `recommendedNextAction`.

## View Queue And Job Status

```bash
pnpm psf queues:status
curl http://127.0.0.1:3000/queues/status
curl http://127.0.0.1:3000/jobs/<jobId>
curl 'http://127.0.0.1:3000/worker-runs?status=queued'
```

Hub Dashboard shows queue runtime counts. Mission Detail shows wrapper WorkerRuns alongside child WorkerRuns.

## Cancel And Retry

Cancel and retry always target a specific wrapper WorkerRun:

```bash
pnpm psf worker-runs:cancel <workerRunId>
pnpm psf worker-runs:retry <workerRunId>
```

API equivalents:

```bash
curl -H "Authorization: Bearer $PSF_API_TOKEN" -X POST http://127.0.0.1:3000/worker-runs/<workerRunId>/cancel
curl -H "Authorization: Bearer $PSF_API_TOKEN" -X POST http://127.0.0.1:3000/worker-runs/<workerRunId>/retry
```

Cancel supports queued or delayed jobs. Active job cancellation is cooperative and best-effort; the system records `cancellationRequested` instead of claiming a hard kill. Retry is allowed only for failed or cancelled wrapper WorkerRuns and preserves the original job type, Mission ID, Project ID, and payload while recording the new `jobId` or retry attempt.

## Safety Boundary

Queued mode is still dry-run/mock only. It does not execute Codex, push branches, create PRs, deploy, create monitors, create Plane issues, run arbitrary shell commands, or call external provider APIs. Job payloads must not contain tokens, passwords, secrets, API keys, authorization headers, or credentials.

## Preparing For Future Real Codex Work

The queue gives a controlled place to add timeouts, cancellation, retries, status observation, and WorkerRun audit records. A future real Codex phase still needs workspace isolation, branch protection, command policy, approvals, log/artifact retention, and explicit no-push defaults before any real execution is allowed.
