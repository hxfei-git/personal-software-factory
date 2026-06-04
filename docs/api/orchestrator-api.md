# Orchestrator API

The Orchestrator API is the local control-plane API for Personal Software Factory. It is built with Fastify and persists through the configured `MissionStorage` implementation, currently in-memory for tests or Prisma/PostgreSQL for local development.

## Authentication

`GET /health` is public. All `POST`, `PUT`, `PATCH`, and `DELETE` routes are protected unless auth is explicitly disabled.

Protected write requests must include:

```text
Authorization: Bearer <PSF_API_TOKEN>
```

Auth configuration:

- `PSF_API_TOKEN`: local bearer token for protected writes.
- `PSF_AUTH_DISABLED=true`: bypasses write auth for local development only.
- `NODE_ENV=test`: API auth is disabled automatically for automated tests.

Do not run shared, staging, or production-like environments with `PSF_AUTH_DISABLED=true`.

## Conventions

- Responses use the shared `@psf/mission-schema` snake_case field style.
- Create and update request bodies use the camelCase fields accepted by the service layer where documented.
- Every write operation appends a `MissionEvent`.
- Mission-scoped routes first verify that the Mission exists.
- Missing resources return `404 NOT_FOUND`.
- Invalid request bodies return `400 VALIDATION_ERROR`.
- Invalid Mission state transitions return `400 INVALID_MISSION_TRANSITION`.

## Health

### GET /health

Public endpoint.

```json
{ "status": "ok" }
```

## Dashboard And Hub Reads

### GET /dashboard

Public read endpoint for the local MVP API. Returns dashboard metrics, recent Missions, bugs, WorkerRuns, QA runs, Artifacts, Integration statuses, real-mode readiness, policy failures, recommended next actions, and health signals. This route has no side effects and is intended for Hub Web.

### GET /bugs

Public read endpoint for Hub resource pages. Returns all BugReports sorted by creation order. This route has no side effects and does not inspect provider systems.

### GET /artifacts

Public read endpoint for Hub resource pages. Returns all Artifacts. Large artifact records should expose paths and metadata, not inline copies of large evidence files or secret values.

### GET /approvals

Public read endpoint for Hub resource pages. Returns all Approval records. Approval records are audit/readiness data and do not execute real actions.

### GET /missions/:id/summary

Public read endpoint for Mission detail screens. Returns the Mission, Project, current status, events, artifacts, WorkerRuns, QA runs, bugs, approvals, selected key artifacts such as QA report and Codex prompt, real-mode readiness, policy failures, external links, external status summaries, artifact retention summaries, and one recommended next action.

Additional summary fields are derived only from Orchestrator-owned records and sanitized API values:

- `realModeReadiness`: entries for `codex`, `qaPlaywright`, `qaAiExploratory`, `fix`, `github`, `coolify`, `uptimeKuma`, and `plane`. Each entry includes `enabled`, `configured`, `ready`, legacy `safeToRun`, explicit `canQueue`, explicit `canExecute`, `missingEnv`, `requiredApprovalTypes`, `approvedApprovalTypes`, `missingApprovalTypes`, `queueBlockers`, `executionBlockers`, combined `blockers`, `recommendedNextAction`, `message`, and `realNetworkCall: false`. `canQueue` means action execution mode, Worker Runtime, route gate, provider env, and required approvals are ready for a queued guarded action. `canExecute` remains `false` until a later approved task proves injected runner or transport, local mirror, target URL, selector verification, command policy, workspace guards, and operation gates. `safeToRun` is retained only as a backward-compatible queue-readiness alias and must not be interpreted as execution permission.
- `policyFailures`: human-readable blockers derived from structured `queueBlockers` and `executionBlockers`, such as missing `PSF_ACTION_EXECUTION_MODE=queued`, disabled `PSF_ENABLE_REAL_*` gates, missing provider environment variables, missing approved Mission approvals, missing Worker Runtime configuration, missing injected runner/transport, unverified local mirror, missing target URL, missing selector verification, missing command policy, workspace guards, or provider operation gates.
- `externalLinks`: `githubPrUrl`, `deploymentUrl`, `monitorUrl`, and `planeIssueUrl` when those safe URLs are present on the Mission, WorkerRuns, Artifacts, or Approvals.
- `deploymentStatus`, `monitorStatus`, and `planeStatus`: latest relevant WorkerRun-derived status summaries.
- `artifactRetention`: Artifact retention metadata from `metadata.retentionClass`, `metadata.path`, and `metadata.missing`.

These fields are visibility only. They do not trigger real external calls, and `realNetworkCall` remains `false`. Token, password, and secret-like values are redacted before the response is sent.

The route returns `404 NOT_FOUND` when the Mission or linked Project is missing.

## Integrations

Integration routes are default-safe with dry-run/status routes plus gated real-mode contracts. Default responses and any path without an intentionally injected transport keep `realNetworkCall: false`; real provider calls are possible only when the explicit provider gates, approvals, operation gates, credentials, and injected transport are all satisfied and approved.

### GET /integrations

Public read endpoint. Returns the supported integration statuses in display order: `github`, `coolify`, `uptime_kuma`, and `plane`.

Each status includes `configured`, `missingEnv`, `realEnabled`, `realNetworkCall`, and `safeToRun`. Even when an `ENABLE_REAL_*` variable is set to `"1"`, `realEnabled` may become `true` but `realNetworkCall` remains `false`.

### POST /integrations/:name/dry-run

Protected. Runs a local dry-run for one integration and returns the simulated payloads that would later become PRs, deploy requests, monitors, or issues. Supported names are `github`, `coolify`, `uptime_kuma`, `uptime-kuma`, and `plane`.

`POST /integrations/uptime-kuma/dry-run` is supported as the external-name path for the internal `uptime_kuma` adapter.

Example:

```bash
curl -H "Authorization: Bearer $PSF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3000/integrations/uptime-kuma/dry-run \
  -d '{}'
```

Dry-run responses include `realNetworkCall: false` and must not include token or password values.

## Projects And Registry

### GET /projects

Returns registered projects from storage.

### POST /projects/sync

Protected. Scans `PSF_PROJECTS_ROOT` or `projects` by default, validates every `projects/*/project.passport.yaml`, skips child directories without a passport, and upserts valid Projects into storage.

Invalid passport files return `VALIDATION_ERROR` with registry details.

```json
{
  "synced": 1,
  "projects": [{ "id": "ai-novelist", "status": "active" }]
}
```

### GET /projects/:id

Returns one Project or `404 NOT_FOUND`.

### GET /projects/:projectId/passport

Returns the normalized Project Passport for a registered project. The Project must already exist in storage, and the passport must still be present in the configured registry root.

## Missions

### POST /missions

Protected. Creates a Mission with status `received` and appends `mission.created`.

Hub sends camelCase request fields:

```json
{
  "projectId": "ai-novelist",
  "title": "Review chapter export",
  "rawRequest": "Add review coverage for export flow",
  "priority": "P2",
  "riskLevel": "medium"
}
```

### GET /missions

Returns all Missions.

### GET /missions/:id

Returns one Mission or `404 NOT_FOUND`.

### POST /missions/:id/plan

Protected. Runs deterministic Mission planning for an existing Mission. It may use the Mission raw request/title/priority, request overrides, the Project Passport, and `qa-charter.md` next to the passport.

The planner does not call an LLM. The API persists one planner `WorkerRun`, planner `Artifact` records, and planner `MissionEvent` records, then moves a normal received Mission through:

```text
received -> planning -> planned
```

Request body fields are optional:

```json
{
  "userRequirement": "增加章节审稿和自动修复流程",
  "qaCharter": "# QA Charter\n- 打开首页",
  "title": "章节审稿与修复闭环",
  "priority": "P1"
}
```

### POST /missions/:id/actions/plan
### POST /missions/:id/actions/codex-dry-run
### POST /missions/:id/actions/qa-dry-run
### POST /missions/:id/actions/fix-dry-run
### POST /missions/:id/actions/loop-dry-run

Protected. Runs local Orchestrator action entrypoints backed by `@psf/demo-workflow` for the fixed demo Mission and controlled generic dry-run responses for other supported Missions. These endpoints are default-safe with dry-run/status routes plus gated real-mode contracts: default responses do not execute shell commands, Codex, external APIs, pushes, PR creation, or deployments, and real execution requires the explicit gates, approvals, injected runner or transport, and route wiring for that action.

Mission action preflight does not reject non-demo Missions solely because the Mission ID is not `mission-0001-ai-novelist-chapter-review`. The API verifies that the Mission exists, the linked Project exists, and the Project Passport is available when an action needs project context. Missing Missions return `404 NOT_FOUND`; missing Projects or unavailable Project Passports return `400 VALIDATION_ERROR` with a specific blocker. Default action responses remain dry-run/manual-action oriented and report `realCodexExecuted: false`, `realExternalCall: false`, `realPush: false`, and `realDeploy: false`.

Request body:

```json
{
  "withSampleBug": true
}
```

Response shape:

```json
{
  "missionId": "mission-0001-ai-novelist-chapter-review",
  "projectId": "ai-novelist",
  "mode": "dry-run",
  "dryRun": true,
  "realCodexExecuted": false,
  "realExternalCall": false,
  "realPush": false,
  "realDeploy": false,
  "generatedArtifacts": ["missions/mission-0001-ai-novelist-chapter-review/qa-report.md"],
  "workerRunIds": ["worker-run-mission-0001-ai-novelist-chapter-review-qa-dry-run"],
  "qaRunIds": ["qa-run-mission-0001-ai-novelist-chapter-review-dry-run"],
  "bugIds": ["bug-mission-0001-ai-novelist-chapter-review-sample-duplicate-generate"],
  "eventIds": ["event-mission-0001-ai-novelist-chapter-review-qa-started-worker-run-mission-0001-ai-novelist-chapter-review-qa-dry-run"],
  "missionDetailUrl": "http://127.0.0.1:5173/#mission-detail?id=mission-0001-ai-novelist-chapter-review",
  "recommendedNextAction": "AI Novelist demo dry-run completed. Codex, external providers, pushes, and deployments were not executed."
}
```

### Gated Real-Mode Action Contracts

Protected routes:

- `POST /missions/:id/actions/codex-real` -> `codex.real`, gate `PSF_ENABLE_REAL_CODEX=true`
- `POST /missions/:id/actions/qa-playwright` -> `qa.playwright`, gate `PSF_ENABLE_REAL_QA_PLAYWRIGHT=true`
- `POST /missions/:id/actions/qa-ai-exploratory` -> `qa.ai_exploratory`, gate `PSF_ENABLE_REAL_QA_AI_EXPLORATORY=true`
- `POST /missions/:id/actions/fix-real` -> `fix.real`, gate `PSF_ENABLE_REAL_FIX=true`
- `POST /missions/:id/actions/github-pr` -> `github.pr`, gate `PSF_ENABLE_REAL_GITHUB_PR=true`
- `POST /missions/:id/actions/deploy-staging` -> `deploy.coolify`, gate `PSF_ENABLE_REAL_COOLIFY_DEPLOY=true`
- `POST /missions/:id/actions/monitor-sync` -> `monitor.uptime_kuma`, gate `PSF_ENABLE_REAL_UPTIME_KUMA_SYNC=true`
- `POST /missions/:id/actions/plane-sync` -> `plane.sync`, gate `PSF_ENABLE_REAL_PLANE_SYNC=true`

These routes are default-safe contracts. They never run Codex, Playwright, GitHub, Coolify, Uptime Kuma, Plane, pushes, PR creation, deployments, or arbitrary commands inside the API process. If `PSF_ACTION_EXECUTION_MODE` is not `queued`, or the route-specific gate is not set to exactly `true`, the API returns a blocked/manual payload and creates no WorkerRun or queue job.

Blocked response shape:

```json
{
  "accepted": false,
  "executionMode": "queued",
  "missionId": "mission-0001-ai-novelist-chapter-review",
  "projectId": "ai-novelist",
  "action": "github-pr",
  "jobType": "github.pr",
  "status": "blocked",
  "dryRun": false,
  "realEnabled": false,
  "realNetworkCall": false,
  "realExternalCall": false,
  "realPush": false,
  "realDeploy": false,
  "recommendedNextAction": "Set PSF_ENABLE_REAL_GITHUB_PR=true and PSF_ACTION_EXECUTION_MODE=queued after approvals and worker support are ready."
}
```

When queued mode and the route-specific gate are both enabled, the API creates the existing queue wrapper WorkerRun and enqueues only the mapped whitelisted job type. Required approval types must already exist as approved Approvals on the same Mission; otherwise the route returns `accepted: false`, includes `missingApprovalTypes`, and does not create a WorkerRun or queue job. The queued response has `accepted: true`, `status: queued`, `mode: real` on the wrapper WorkerRun, and `realNetworkCall: false`. Action responses and queued payloads must continue to redact secret-like values.

Request body is strict and accepts only the fields needed by the gated contracts. `approvalId` is a reference only; it is not sufficient by itself because the gate is enforced from stored approved Mission approvals:

```json
{
  "approvalId": "approval-123",
  "targetUrl": "http://127.0.0.1:8999/app",
  "repoUrl": "/home/user/psf-workspaces/mirrors/ai-novelist.git",
  "branchName": "agent/mission-123",
  "workspaceRoot": "/home/user/psf-workspaces",
  "baseBranch": "main",
  "sourceSha": "abc123"
}
```

`qa-playwright` queued payloads include the Project Passport, QA charter, resolved target URL, Mission files, and e2e command metadata with `executionPolicy: "review-only"`. Missing or invalid target URLs are blocked before a real browser path is attempted; the API must not report a passed QA result from missing context.

`codex-real` queued preflight requires a local repository mirror from the request body or a local `PSF_LOCAL_REPO_<project>` environment fallback. GitHub HTTPS/SSH passport repository URLs are blocked at this stage, because remote clone/update is still manual operator preparation. The queued Codex payload includes the local `repoUrl`, default branch, `agent/*` branch, workspace root, Project Passport, Mission files, project `AGENTS.md`, safe command metadata, approval record IDs, and approval grant IDs. Branch names targeting `main`, `master`, or anything outside `agent/` are rejected.

`fix-real` queued payloads include Mission status, `currentAttempt`, `maxAttempts`, open bugs, per-bug attempts, `maxBugAttempts`, Project Passport, project `AGENTS.md`, Mission files, verification commands, regression evidence, branch/current branch, workspace root, target URL, approval record IDs, and approval grant IDs. Bug `accepted` is not emitted unless regression evidence exists and injected Codex/test runners pass. Missing regression evidence returns manual-action/needs-human style output and keeps external side effects disabled.

`github-pr` requires an approved `EXTERNAL_COST_RISK` Approval before enqueue. The queued payload includes Mission integration input, `branchName`, `baseBranch`, optional `sourceSha`, QA comment preview, PR preview, approval record IDs, and `operationGates` set to false by default. The API and default Worker Runner do not push, create a PR, or call GitHub; PR preview is persisted as an Artifact for review.

Worker Runner currently persists `qa.playwright` and `codex.real` child resources for injected or deterministic paths, but default `codex.real` still returns `manual_action` without an injected runner. These routes still do not run Codex, push, create PRs, deploy, call external providers, or set `realNetworkCall` to `true`.

### POST /demo/ai-novelist

Protected. Runs the local ai-novelist demo dry-run action and returns the same safety fields and generated artifact IDs as the Mission action endpoints. This route does not support reset. Reset remains CLI-only; requests containing `resetDemo: true` return `400 VALIDATION_ERROR`.

```json
{
  "withSampleBug": true
}
```

### POST /missions/:id/transition

Protected. Runs the Mission state machine, updates status, and appends a transition event.

```json
{
  "to": "planning",
  "actor": "local-user",
  "payload": { "reason": "start planning" }
}
```

### POST /missions/:id/events

Protected. Appends a custom event without changing Mission status. Event types must use lower-case dotted format.

```json
{
  "type": "mission.note",
  "message": "Manual note.",
  "payload": { "source": "operator" }
}
```

### GET /missions/:id/events

Returns Mission events in storage order.

## Approvals

Approval types currently accepted by the API:

- `PRODUCTION_DEPLOY`
- `DATABASE_MIGRATION`
- `SECRET_CHANGE`
- `DESTRUCTIVE_OPERATION`
- `EXTERNAL_COST_RISK`
- `SECURITY_RISK`

### POST /missions/:missionId/approvals

Protected. Creates a pending Approval and appends `approval.created`.

```json
{
  "type": "PRODUCTION_DEPLOY",
  "requestedBy": "planner",
  "reason": "Production release requires human approval.",
  "payload": { "target": "production" }
}
```

### GET /missions/:missionId/approvals

Lists Approvals for a Mission.

### GET /approvals

Lists all Approvals for Hub resource pages.

### GET /approvals/:approvalId

Returns one Approval or `404_NOT_FOUND`.

### POST /approvals/:approvalId/decision

Protected. Records a decision while the Approval is still `pending` and appends `approval.decided`.

```json
{
  "status": "approved",
  "decidedBy": "local-user",
  "decision": "Approved for the documented dry-run boundary."
}
```

`status` may be `approved`, `rejected`, or `cancelled`.

This route records the decision only. It does not execute Codex, queue real actions, create PRs, deploy, create monitors, sync provider records, or bypass real-action gates.

## Worker Runs

Worker run types: `codex`, `qa`, `deploy`, `monitor`, `planner`, `integration`, `orchestrator`.

Worker run modes: `dry-run`, `mock`, `real`.

### POST /missions/:missionId/worker-runs

Protected. Creates a WorkerRun and appends `worker_run.created`.

```json
{
  "workerType": "planner",
  "status": "succeeded",
  "mode": "dry-run",
  "input": { "missionId": "mission-123" },
  "output": { "files": ["mission.md"] },
  "logs": ["planner completed"]
}
```

### GET /missions/:missionId/worker-runs

Lists WorkerRuns for a Mission.

### GET /worker-runs/:workerRunId

Returns one WorkerRun or `404 NOT_FOUND`.

### PATCH /worker-runs/:workerRunId

Protected. Updates a WorkerRun and appends `worker_run.updated`.

```json
{
  "status": "succeeded",
  "exitCode": 0,
  "logs": ["done"]
}
```

## Artifacts

### POST /missions/:missionId/artifacts

Protected. Creates an Artifact and appends `artifact.created`. `name` is accepted as a display name and stored in `metadata.name`.

Small text artifacts may include `content`. Large artifacts should store only `path`, `size`, `mimeType`, and metadata.

```json
{
  "type": "mission",
  "name": "mission.md",
  "path": "missions/mission-123/mission.md",
  "content": "# Mission",
  "mimeType": "text/markdown",
  "metadata": { "storage": "inline" }
}
```

### GET /missions/:missionId/artifacts

Lists Artifacts for a Mission.

### GET /artifacts/:artifactId

Returns one Artifact or `404 NOT_FOUND`.

### GET /artifacts

Lists all Artifacts for Hub resource pages.

## Bug Reports

### POST /missions/:missionId/bugs

Protected. Creates a BugReport with default status `open` and appends `bug.created`. Bug reports must include reproduction steps, expected result, actual result, and evidence metadata.

```json
{
  "title": "Repeated generate clicks",
  "severity": "P1",
  "reproductionSteps": ["Open editor", "Click generate twice"],
  "expectedResult": "One request is submitted.",
  "actualResult": "Two requests are submitted.",
  "evidence": { "source": "qa-worker" },
  "suggestedFixDirection": "Disable the button while running.",
  "source": "qa-worker"
}
```

### GET /missions/:missionId/bugs

Lists BugReports for a Mission.

### GET /bugs/:bugId

Returns one BugReport or `404 NOT_FOUND`.

### GET /bugs

Lists all BugReports for Hub resource pages.

### PATCH /bugs/:bugId

Protected. Updates a BugReport and appends `bug.updated`.

```json
{ "status": "in_progress" }
```

## QA Runs

QA modes currently accepted by the API: `dry-run`, `mock`, `playwright`, `playwright-mcp`, `deterministic`, `ai_exploratory`, `regression`, and `smoke`.

### POST /missions/:missionId/qa-runs

Protected. Creates a QARun and appends `qa_run.created`.

```json
{
  "status": "queued",
  "mode": "mock",
  "stagingUrl": "http://127.0.0.1:8000",
  "summary": "Queued mock QA."
}
```

### GET /missions/:missionId/qa-runs

Lists QA runs for a Mission. Returned QA runs include linked BugReports when available.

### GET /qa-runs/:qaRunId

Returns one QA run or `404 NOT_FOUND`.

### PATCH /qa-runs/:qaRunId

Protected. Updates a QA run and appends `qa_run.updated`.

```json
{
  "status": "passed",
  "passed": 8,
  "failed": 0
}
```

## Error Shape

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": {}
}
```

Stable error codes currently include `VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_MISSION_TRANSITION`, `UNAUTHORIZED`, and `INTERNAL_SERVER_ERROR`.

## Current Demo And Control Surfaces

The API surfaces are default-safe with dry-run/status routes plus gated real-mode contracts. Default responses and paths without intentionally injected runners or transports do not execute Codex, run shell commands from the Hub, push, create PRs, deploy, create provider records, or call external services, and they keep `realNetworkCall: false`; real calls or real runners are possible only after explicit gates and approvals are satisfied and the required runner or transport is intentionally wired.

Related CLI operations are local helpers, not API routes:

```bash
pnpm psf doctor
pnpm psf demo:ai-novelist --with-sample-bug
pnpm psf demo:report --with-sample-bug
pnpm psf demo:reset --skip-db
```

Reset is intentionally CLI-only and confirmation-gated.

## Queue Runtime APIs

Queued execution is optional for protected dry-run action endpoints and gated real-mode contract endpoints. The same action routes support two modes:

- `PSF_ACTION_EXECUTION_MODE=inline`: API executes the existing dry-run workflow and returns the completed dry-run result.
- `PSF_ACTION_EXECUTION_MODE=queued`: API creates a queue wrapper WorkerRun, enqueues a whitelisted job, and returns accepted metadata without running the long workflow in the API process.

Queued action response shape:

```json
{
  "accepted": true,
  "executionMode": "queued",
  "workerRunId": "worker-run-queue-123",
  "jobId": "job-123",
  "missionId": "mission-0001-ai-novelist-chapter-review",
  "status": "queued",
  "recommendedNextAction": "Start or refresh Worker Runner, then refresh Mission Summary."
}
```

### GET /queues/status

Returns queue runtime, queue name, counts, and any runtime warning. This is a read endpoint and has no side effects.

### GET /jobs/:jobId

Returns one queue job status when the active runtime can inspect it.

### GET /worker-runs?status=&missionId=&workerType=

Lists WorkerRuns with optional filters. Queue wrapper WorkerRuns can be identified by `metadata.queueWrapper` or `output.queueWrapper`.

### POST /worker-runs/:id/cancel

Protected. Cancels a specific queue wrapper WorkerRun. Queued or delayed jobs can become `cancelled`. Active cancellation is cooperative and best-effort, so the API records `cancellationRequested` rather than claiming a hard kill.

### POST /worker-runs/:id/retry

Protected. Retries a specific failed or cancelled queue wrapper WorkerRun. Retry preserves the original job type, Mission ID, Project ID, and safe payload, and records the previous and new job IDs.

No queue API accepts arbitrary commands, clears all jobs, or performs destructive queue maintenance.
