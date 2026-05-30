# Mission Schema

Shared runtime schemas and TypeScript types for Personal Software Factory.

This package is the contract layer used by the Orchestrator API, future Hub Web, Planner, Codex Worker, QA Worker, and tests. It uses Zod for runtime validation and exports inferred TypeScript types.

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

## Core Resource Contracts

The shared resource schemas include Phase 4.5-7 dry-run fields for Planner and worker orchestration: expanded worker types and modes, structured worker input/output/logs, inline artifact content and metadata, approval request/decision metadata, QA run counters/timestamps, and bug source/fix-direction fields.

Artifact types are constrained to planned resource values such as `mission`, `acceptance`, `codex_prompt`, `qa_report`, `bugs_json`, `playwright_trace`, `generated_test`, `log`, and `other`.

## Mission Statuses

The status list is a plan-compatible superset for Phase 2-4. It includes the user-requested MVP states plus planned states such as `planned`, `test_running`, `staging_ready`, `blocked`, and `needs_human` so later phases can extend without changing the shared enum.

## Commands

```bash
pnpm --filter @psf/mission-schema test
pnpm --filter @psf/mission-schema typecheck
```
