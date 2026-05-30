# Phase 2-4 Foundation Design

## Context

This design covers the next implementation batch for Personal Software Factory / 个人 AI 软件工厂 after Phase 0 and Phase 1.

The batch combines:

- Phase 2: schema and data model.
- Phase 3: Mission state machine.
- Phase 4: Orchestrator API MVP.

The repository root currently contains `personal-software-factory-plan.md`, not `plan.md`. The Phase 0 architecture documents already record this filename difference. This design treats `personal-software-factory-plan.md` as the canonical plan source for this batch.

## Goal

Build the core foundation that lets the system manage Projects and Missions through an auditable state machine:

```text
Project Passport
  -> Project record
  -> Mission record
  -> Mission transition
  -> MissionEvent audit trail
  -> Orchestrator API access
```

This batch must not implement Codex Worker, QA Worker, Hub Web UI, GitHub API integration, Coolify, Uptime Kuma, or Plane API integration.

## Chosen Approach

Use the existing Phase 1 TypeScript monorepo direction:

- pnpm workspace.
- TypeScript.
- Zod for runtime schemas.
- Prisma with PostgreSQL for persistence.
- Fastify for the Orchestrator API.
- Vitest for tests.

This matches `personal-software-factory-plan.md`, `docs/00-system-architecture.md`, and the Phase 2-4 acceptance direction. PostgreSQL is already available through `docker-compose.yml`, so the database path does not add a new service boundary.

## Alternatives Considered

### Local JSON Storage

This would be fastest to implement, but it would not satisfy the Phase 2 database intent and would be fragile for Mission events and list queries.

Decision: reject for this batch.

### SQLite With Storage Abstraction

This would keep local setup light, but it would diverge from the established Prisma/PostgreSQL plan and require a later migration.

Decision: reject for this batch.

### Prisma With PostgreSQL

This is slightly heavier, but it fits the plan, the existing Docker services, and the future need for event timelines, WorkerRun records, QA reports, bugs, approvals, deployments, and monitors.

Decision: use for this batch.

## Scope

### In Scope

- `packages/mission-schema`:
  - core Zod schemas;
  - TypeScript types;
  - example objects;
  - schema tests;
  - README documentation.
- `packages/project-passport`:
  - YAML parsing;
  - required-field validation;
  - normalized Project Passport output;
  - example `project.passport.yaml`;
  - parser tests;
  - README documentation.
- `packages/db`:
  - Prisma schema;
  - PostgreSQL datasource;
  - migration;
  - Prisma client wrapper;
  - seed data for `ai-novelist` and a sample Mission.
- `packages/mission-core`:
  - reusable Mission state machine;
  - transition validation;
  - transition event creation;
  - no Fastify dependency;
  - no direct Prisma dependency.
- `apps/orchestrator-api`:
  - Fastify server;
  - storage/service layer;
  - Project read endpoints;
  - Mission create/list/read endpoints;
  - Mission transition endpoint;
  - Mission event append/list endpoints;
  - API tests.
- Documentation:
  - `docs/api.md`;
  - `docs/schema.md`;
  - `docs/state-machine.md`;
  - `docs/storage.md`;
  - `docs/progress.md`;
  - README command updates.

### Out of Scope

- Codex Worker implementation.
- QA Worker implementation.
- Hub Web UI implementation.
- Real GitHub, Coolify, Uptime Kuma, or Plane API calls.
- BullMQ queues.
- API authentication.
- Production deployment.
- AI exploratory QA.

API authentication is intentionally out of scope because the user explicitly allowed the first Orchestrator API version to run without authentication. This is a scoped exception from the broader Phase 4 acceptance document and must be recorded in progress documentation.

## Package Boundaries

### `packages/mission-schema`

This package owns shared contracts. It is safe for API, workers, Hub, and tests to import.

Schemas to provide:

- `Project`
- `ProjectPassport`
- `Mission`
- `MissionStatus`
- `MissionEvent`
- `BugReport`
- `QAReport`
- `Artifact`
- `Approval`
- `WorkerRun`
- `IntegrationStatus`

Mission statuses will be a plan-compatible superset:

```text
received
planning
planned
approval_required
dev_queued
dev_running
build_running
test_running
staging_deploying
staging_ready
qa_running
bugs_found
fixing
regression_running
ready_for_review
release_approval
production_deploying
released
paused
blocked
needs_human
failed
cancelled
```

The user-requested flows use the required subset. The extra statuses preserve compatibility with the root plan and Phase 0 architecture docs.

### `packages/project-passport`

This package owns `project.passport.yaml` parsing and normalization.

Supported fields:

- `id`
- `name`
- `repo`
- `runtime`
- `commands.install`
- `commands.test`
- `commands.build`
- `commands.run_staging`
- `urls.production`
- `urls.staging`
- `quality_gates`
- `core_flows`

The parser will read YAML from disk, validate it through the shared Project Passport schema, and return normalized values. Command fields normalize to arrays so workers can execute them consistently later.

### `packages/db`

This package owns persistence primitives.

Prisma models:

- `Project`
- `Mission`
- `MissionEvent`
- `WorkerRun`
- `QARun`
- `Bug`
- `Artifact`
- `Deployment`
- `Monitor`
- `Approval`

The schema will use PostgreSQL through `DATABASE_URL`. JSON-like payload fields use Prisma `Json`. Timestamps use `createdAt` and `updatedAt` naming in code while mapping cleanly to database columns.

Seed data:

- `ai-novelist` project.
- one sample Mission in `received`.
- creation event for the sample Mission.

### `packages/mission-core`

This package owns deterministic Mission rules.

Exports:

- `canTransition(from, to)`;
- `assertTransition(from, to)`;
- `transitionMission(input)`;
- status metadata helpers such as final-state and running-state checks.

`transitionMission()` returns the new status and a MissionEvent-shaped object. It does not write to the database. The API service layer persists the Mission and event in one operation.

## State Machine Design

Primary valid flow:

```text
received
-> planning
-> dev_queued
-> dev_running
-> build_running
-> staging_deploying
-> qa_running
-> ready_for_review
```

Bug fix loop:

```text
qa_running
-> bugs_found
-> fixing
-> regression_running
-> qa_running
```

Release flow:

```text
ready_for_review
-> release_approval
-> production_deploying
-> released
```

Global rules:

- any non-final status can transition to `paused`;
- any non-final running status can transition to `failed`;
- any non-final status can transition to `cancelled`;
- final statuses do not transition unless a future explicit reopen feature is added.

Final statuses for this batch:

```text
released
failed
cancelled
```

No reopen behavior will be implemented in this batch.

## Orchestrator API Design

The API is a local single-user MVP with no authentication in this batch.

Endpoints:

- `GET /health`
- `POST /missions`
- `GET /missions`
- `GET /missions/:id`
- `POST /missions/:id/transition`
- `POST /missions/:id/events`
- `GET /missions/:id/events`
- `GET /projects`
- `GET /projects/:id`

Write behavior:

- `POST /missions` creates a Mission with status `received`.
- Mission creation writes a `mission.created` event.
- `POST /missions/:id/transition` calls the state machine.
- illegal transitions return `400` with a stable error code and clear message.
- successful transitions update the Mission and append a MissionEvent.
- `POST /missions/:id/events` appends a custom event without changing status.

The Fastify routes call services. Services call storage. Routes must not contain raw Prisma read/write logic.

## Storage Design

Storage will be accessed behind interfaces owned by the API package. The first implementation uses Prisma.

Initial storage methods:

- `listProjects()`
- `getProject(id)`
- `createMission(input)`
- `listMissions()`
- `getMission(id)`
- `transitionMission(id, transitionInput)`
- `appendMissionEvent(input)`
- `listMissionEvents(missionId)`

This keeps the API ready for later testing with in-memory or SQLite-backed adapters if needed, while the production path stays PostgreSQL.

## Error Handling

Errors should be explicit and predictable:

- validation errors return `400` with Zod issue details;
- missing Project or Mission returns `404`;
- illegal transition returns `400` with `INVALID_MISSION_TRANSITION`;
- unexpected storage failures return `500` without leaking secrets or database internals.

Tests should assert the important error shapes for validation and illegal transitions.

## Testing Strategy

Use the smallest meaningful tests for each layer:

- schema unit tests for valid examples and invalid required fields;
- passport parser tests for valid YAML, missing required fields, and normalization;
- state machine tests for valid flows, invalid jumps, final-state protection, failure, pause, and cancel;
- API tests using Fastify injection for health, Mission create/list/read, transition success, transition failure, event append/list, and project list/read;
- database seed/migration checks through Prisma commands.

The implementation should keep tests focused on the critical path and avoid slow external service calls.

## Documentation Updates

The implementation must update:

- `docs/api.md` with endpoint examples and error shapes;
- `docs/schema.md` with schema ownership and key fields;
- `docs/state-machine.md` with allowed transitions and examples;
- `docs/storage.md` with Prisma/PostgreSQL and storage abstraction details;
- `docs/progress.md` with completion summary, changed files, commands, remaining gaps, and next batch suggestions;
- `README.md` with current install, database, migration, seed, API, and test commands.

## Acceptance Criteria

This batch is complete when:

- schema tests pass;
- Project Passport parser tests pass;
- Mission state machine tests pass;
- Orchestrator API tests pass;
- Prisma migration and seed commands run successfully against local PostgreSQL;
- API can create and transition a Mission with event records;
- illegal transitions fail clearly;
- docs are updated;
- no real external services are called;
- no Codex Worker, QA Worker, or Hub UI behavior is implemented.

## Known Deviations From Existing Phase Documents

The root Phase 4 acceptance criteria include API token authentication and broader Project, Approval, WorkerRun, Artifact, Bug, and QA routes. The user explicitly scoped this batch to a smaller Orchestrator API MVP and allowed no authentication for the first version.

This design preserves the architecture direction and records the narrower implementation boundary. The omitted routes and authentication should be handled in a later hardening batch before exposing the API beyond local development.
