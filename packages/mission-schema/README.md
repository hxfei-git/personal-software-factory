# Mission Schema

Shared runtime schemas and TypeScript types for Personal Software Factory.

This package is the contract layer used by the Orchestrator API, future Hub Web, Codex Worker, QA Worker, and tests. It uses Zod for runtime validation and exports inferred TypeScript types.

## Exports

- `MissionStatus`, `missionStatusValues`, and `MissionStatusValue`.
- `ProjectSchema` and `Project`.
- `ProjectPassportSchema` and `ProjectPassport`.
- `MissionSchema` and `Mission`.
- `MissionEventSchema` and `MissionEvent`.
- `BugReportSchema` and `BugReport`.
- `QAReportSchema` and `QAReport`.
- `ArtifactSchema` and `Artifact`.
- `ApprovalSchema` and `Approval`.
- `WorkerRunSchema` and `WorkerRun`.
- `IntegrationStatusSchema` and `IntegrationStatus`.
- Example objects for each schema in `src/examples.ts`.

## Mission Statuses

The status list is a plan-compatible superset for Phase 2-4. It includes the user-requested MVP states plus planned states such as `planned`, `test_running`, `staging_ready`, `blocked`, and `needs_human` so later phases can extend without changing the shared enum.

## Commands

```bash
pnpm --filter @psf/mission-schema test
pnpm --filter @psf/mission-schema typecheck
```
