# Orchestrator API MVP

The Orchestrator API is the local control-plane API for Personal Software Factory Phase 4. It is built with Fastify and currently has no authentication because this batch is local-only.

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

## Error Shape

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": {}
}
```

Stable error codes currently include `VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_MISSION_TRANSITION`, and `INTERNAL_SERVER_ERROR`.
