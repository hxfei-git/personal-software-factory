# Mission Planner

Deterministic Mission Planner package for Personal Software Factory.

This package turns a user requirement, Project Passport, and QA Charter into local planning artifacts. The first version is template-only: it does not call an LLM, does not call external services, and does not integrate with the Orchestrator API. API integration is deferred to a later task.

## Exports

- `createDeterministicMissionPlan(input)`
- `MissionPlannerInput`
- `PlannedFile`
- `MissionPlan`

## Generated Files

- `mission.md`
- `acceptance.md`
- `technical-notes.md`
- `risk-notes.md`

The planner also returns schema-compatible `WorkerRun`, `Artifact`, and `MissionEvent` objects. Artifact content is inline markdown with paths under `missions/{missionId}/`.

## Commands

```bash
pnpm --filter @psf/mission-planner test
pnpm --filter @psf/mission-planner typecheck
pnpm --filter @psf/mission-planner check
```
