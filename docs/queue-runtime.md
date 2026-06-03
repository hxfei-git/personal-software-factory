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

## Whitelisted Job Types

The queue accepts these existing dry-run job types:

- `mission.plan`
- `codex.dry_run`
- `qa.dry_run`
- `qa.dry_run_with_sample_bug`
- `fix.dry_run`
- `loop.dry_run`
- `demo.ai_novelist`
- `integration.dry_run`

Task 9 wires these real/gated job contracts into Worker Runner handlers:

- `codex.real`: maps to the Codex Worker real runner abstraction. `ENABLE_REAL_CODEX` is forced off unless the job payload explicitly opts in and the environment is also enabled; normal runtime returns blocked/manual-action output without spawning Codex.
- `qa.playwright`: maps to deterministic Playwright QA. A missing target URL returns a blocked/manual-action QA run, and real browser execution still requires an approved runner or explicit real Playwright gate.
- `qa.ai_exploratory`: maps to the AI exploratory QA runner. `ENABLE_AI_EXPLORATORY_QA` defaults off, so the handler records manual-action artifacts and does not connect to MCP or open a browser.
- `fix.real`: maps to `runGatedRealAutoFixLoop`. Real mode defaults off unless route, approval, env, command policy, regression evidence, and injected runner gates are satisfied. When injected fix and verification runners succeed, child BugReports can be updated to `accepted` and legal Mission transitions can move toward `ready_for_review`.
- `github.pr`: maps to the gated GitHub real adapter with no transport and operation/network gates disabled by default. Worker Runner persists a PR preview child WorkerRun and Artifact for review; fake transports can exercise success/failure in tests without contacting GitHub.
- `deploy.coolify`: maps to the gated Coolify real adapter with no transport, no network, and no production deploy approval by default.
- `monitor.uptime_kuma`: maps to the gated Uptime Kuma real adapter with no transport and network gates disabled by default.
- `plane.sync`: maps to the gated Plane real adapter with no transport and network gates disabled by default.

The real/gated handlers preserve queue wrapper output semantics: the wrapper records `childWorkerRunIds`, `childQARunIds`, `childArtifactIds`, `childBugReportIds`, `summary`, and `recommendedNextAction`, while child resources are persisted when the underlying runner returns them. `github.pr` now persists a child integration WorkerRun plus `github-pr-preview.md` Artifact even when the default result is manual-action/no-network.

Phase 18 also records Mission-level audit events from Worker Runner completions. Successful or blocked action handling appends `mission.action_result` with the action outcome, child resource IDs, and safe recommended next action. Worker Runner may also append `mission.status.auto_transition` when the result maps to a conservative legal Mission status transition; if the state machine rejects the transition, the Mission status is left unchanged and the action result event remains the audit record.

Unknown job types are rejected by the Zod schema before enqueue. Payloads are recursively rejected when keys look like tokens, passwords, secrets, API keys, authorization headers, or credentials.

## Gated Real-Mode Routes

The Orchestrator API exposes explicit protected routes for real/gated contracts only; it does not expose arbitrary command submission or generic queue submission. Each route maps to one whitelisted job type and one route-specific gate. If the API is not in `PSF_ACTION_EXECUTION_MODE=queued`, or the route gate is not exactly `true`, the response is a blocked/manual payload and no WorkerRun or queue job is created.

When accepted, the API creates the queue wrapper WorkerRun and enqueues the contract job with `mode: real`. The API still sets `realNetworkCall: false`, `realExternalCall: false`, `realPush: false`, and `realDeploy: false`. Worker Runner then evaluates the job through the gated handler listed above.

## Safety Boundary

Queued dry-run mode remains dry-run/mock only. Gated real-mode handlers are connected to the real runner/adapter abstractions, but defaults remain safe: they do not execute Codex, run shell commands, open browsers, connect to Playwright MCP, push branches, create PRs, deploy, create monitors, create Plane issues, or call external provider APIs unless the relevant environment, approval, policy, and injected runner/transport gates are deliberately configured. Integration adapters are invoked without real transports by default, so `realNetworkCall` remains false in the normal Worker Runner path. Job payloads must not contain tokens, passwords, secrets, API keys, authorization headers, or credentials.

## Preparing For Future Real Codex Work

The queue gives a controlled place to add timeouts, cancellation, retries, status observation, and WorkerRun audit records. A future real Codex phase still needs workspace isolation, branch protection, command policy, approvals, log/artifact retention, and explicit no-push defaults before any real execution is allowed.
