# Schema

Phase 2 introduces shared runtime schemas in `packages/mission-schema` and persistence models in `packages/db`.

## Shared Zod Schemas

`packages/mission-schema` exports Zod schemas, inferred TypeScript types, and example objects for:

- Project
- ProjectPassport
- Mission
- MissionStatus
- MissionEvent
- BugReport
- QAReport
- Artifact
- Approval
- WorkerRun
- IntegrationStatus

## Mission Status Values

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

The list is a plan-compatible superset. The Orchestrator API MVP uses the required Phase 2-4 subset.

## Project Passport

`packages/project-passport` reads YAML, validates through `ProjectPassportSchema`, and normalizes command fields to arrays.

Required fields include `id`, `name`, `repo`, `runtime`, `commands.install`, `commands.test`, `commands.build`, `commands.run_staging`, `urls.production`, `urls.staging`, `quality_gates`, and `core_flows`.

## Prisma Models

`packages/db/prisma/schema.prisma` includes Project, Mission, MissionEvent, WorkerRun, QARun, Bug, Artifact, Approval, Deployment, and Monitor. JSON payload fields use PostgreSQL `jsonb` through Prisma `Json`.
