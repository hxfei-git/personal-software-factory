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

Public read endpoint for the local MVP API. Returns dashboard metrics, recent Missions, bugs, WorkerRuns, QA runs, Artifacts, Integration statuses, recommended next actions, and health signals. This route has no side effects and is intended for Hub Web.

### GET /missions/:id/summary

Public read endpoint for Mission detail screens. Returns the Mission, Project, current status, events, artifacts, WorkerRuns, QA runs, bugs, approvals, selected key artifacts such as QA report and Codex prompt, and one recommended next action.

The route returns `404 NOT_FOUND` when the Mission or linked Project is missing.

## Integrations

Integration routes are currently mock/dry-run only. They never call GitHub, Coolify, Uptime Kuma, Plane, or any other external network service.

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

```json
{
  "project_id": "ai-novelist",
  "title": "增加章节审稿和自动修复流程",
  "raw_request": "增加章节审稿和自动修复流程",
  "priority": "P2",
  "risk_level": "medium"
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

Protected. Runs local Orchestrator action entrypoints backed by `@psf/demo-workflow`. These endpoints are dry-run only: they do not execute shell commands, Codex, external APIs, pushes, PR creation, or deployments.

In this batch, mission-scoped dry-run actions support only the fixed ai-novelist demo Mission ID `mission-0001-ai-novelist-chapter-review`. Missing Missions return `404 NOT_FOUND`; other existing Mission IDs return `400 VALIDATION_ERROR` with a clear demo-only message.

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
