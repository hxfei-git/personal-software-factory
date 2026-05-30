# Orchestrator API MVP

The Orchestrator API is the local control-plane API for Personal Software Factory Phase 4. It is built with Fastify. Write routes are protected by API token auth unless auth is explicitly disabled for local tests or development.

## Conventions

- Responses use the shared `@psf/mission-schema` snake_case field style.
- New resource create/update requests accept the camelCase fields shown below and map them to snake_case responses.
- Every write operation appends a `MissionEvent`.
- Mission-scoped list/create routes first verify the Mission exists.
- Missing resources return `404 NOT_FOUND`.
- Invalid request bodies return `400 VALIDATION_ERROR`.

## Endpoints

### GET /health

Response:

```json
{ "status": "ok" }
```

### GET /projects

Returns registered projects from storage.

### GET /projects/:id

Returns one project or `404 NOT_FOUND`.

### POST /missions

Creates a Mission with initial status `received` and appends a `mission.created` event.

Request:

```json
{
  "project_id": "ai-novelist",
  "title": "Add smoke test",
  "raw_request": "Add a smoke test for the app.",
  "acceptance_markdown": "# Acceptance\nSmoke test exists."
}
```

### GET /missions

Returns all Missions.

### GET /missions/:id

Returns one Mission or `404 NOT_FOUND`.

### POST /missions/:id/transition

Runs the Mission state machine, updates status, and appends a transition event.

Request:

```json
{
  "to": "planning",
  "actor": "local-user",
  "payload": { "reason": "start planning" }
}
```

Illegal transitions return:

```json
{
  "code": "INVALID_MISSION_TRANSITION",
  "message": "Invalid Mission transition from received to released"
}
```

### POST /missions/:id/events

Appends a custom event without changing Mission status.

Request:

```json
{
  "type": "mission.note",
  "message": "A manual note.",
  "payload": { "source": "operator" }
}
```

### GET /missions/:id/events

Returns Mission events in creation order.

## Approvals

### POST /missions/:missionId/approvals

Creates an Approval and appends `approval.created`.

```json
{
  "type": "PRODUCTION_DEPLOY",
  "requestedBy": "planner",
  "reason": "Release requires approval.",
  "payload": { "target": "production" }
}
```

### GET /missions/:missionId/approvals

Lists Approvals for a Mission.

### GET /approvals/:approvalId

Returns one Approval or `404 NOT_FOUND`.

### POST /approvals/:approvalId/decision

Updates an Approval decision and appends `approval.decided`.

```json
{
  "status": "approved",
  "decidedBy": "local-user",
  "decision": "Approved for dry-run."
}
```

`status` may be `approved`, `rejected`, or `cancelled`.

## Worker Runs

### POST /missions/:missionId/worker-runs

Creates a WorkerRun and appends `worker_run.created`.

```json
{
  "workerType": "planner",
  "status": "queued",
  "mode": "dry-run",
  "input": { "missionId": "mission-123" }
}
```

### GET /missions/:missionId/worker-runs

Lists WorkerRuns for a Mission.

### GET /worker-runs/:workerRunId

Returns one WorkerRun or `404 NOT_FOUND`.

### PATCH /worker-runs/:workerRunId

Updates a WorkerRun and appends `worker_run.updated`.

```json
{
  "status": "succeeded",
  "output": { "files": ["mission.md"] },
  "logs": ["done"]
}
```

## Artifacts

### POST /missions/:missionId/artifacts

Creates an Artifact and appends `artifact.created`. `name` is accepted as a display name and stored in `metadata.name` in this version.

```json
{
  "type": "mission",
  "name": "mission.md",
  "path": "missions/mission-123/mission.md",
  "content": "# Mission",
  "metadata": { "storage": "inline" }
}
```

### GET /missions/:missionId/artifacts

Lists Artifacts for a Mission.

### GET /artifacts/:artifactId

Returns one Artifact or `404 NOT_FOUND`.

## Bug Reports

### POST /missions/:missionId/bugs

Creates a BugReport with default status `open` and appends `bug.created`.

```json
{
  "title": "Repeated generate clicks",
  "severity": "P1",
  "reproductionSteps": ["Open editor", "Click generate twice"],
  "expectedResult": "One request is submitted.",
  "actualResult": "Two requests are submitted.",
  "evidence": { "source": "api-test" },
  "suggestedFixDirection": "Disable the button while running.",
  "source": "qa-worker"
}
```

### GET /missions/:missionId/bugs

Lists BugReports for a Mission.

### GET /bugs/:bugId

Returns one BugReport or `404 NOT_FOUND`.

### PATCH /bugs/:bugId

Updates a BugReport and appends `bug.updated`.

```json
{ "status": "in_progress" }
```

## QA Runs

### POST /missions/:missionId/qa-runs

Creates a QA run and appends `qa_run.created`.

```json
{
  "status": "queued",
  "mode": "mock",
  "stagingUrl": "http://127.0.0.1:8000",
  "summary": "Queued mock QA."
}
```

### GET /missions/:missionId/qa-runs

Lists QA runs for a Mission.

### GET /qa-runs/:qaRunId

Returns one QA run or `404 NOT_FOUND`.

### PATCH /qa-runs/:qaRunId

Updates a QA run and appends `qa_run.updated`.

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
