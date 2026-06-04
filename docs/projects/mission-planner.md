# Mission Planner

The Mission Planner currently uses a deterministic template generator. It does not call an LLM, does not call external services, and does not execute project commands.

## Package

`@psf/mission-planner` exports `createDeterministicMissionPlan(input)`.

Inputs:

- `projectId`
- `userRequirement`
- normalized Project Passport
- QA Charter text
- optional `title`
- optional `priority`
- optional `missionId`

Outputs:

- `mission.md`
- `acceptance.md`
- `technical-notes.md`
- `risk-notes.md`
- one planner `WorkerRun` with `worker_type: planner`, `mode: dry-run`, and `status: succeeded`
- four inline `Artifact` records for the generated markdown files
- planner `MissionEvent` records for planning start/completion

The package uses stable IDs and stable package-level timestamps so generated records are testable. API persistence rewrites planner event timestamps to the real planning execution window.

## API Usage

`POST /missions/:id/plan` plans an existing Mission.

Request fields are optional:

```json
{
  "userRequirement": "增加章节审稿和自动修复流程",
  "qaCharter": "# QA Charter\n- 打开首页",
  "title": "章节审稿与修复闭环",
  "priority": "P1"
}
```

Fallbacks:

- `userRequirement` defaults to the Mission `raw_request`.
- `title` defaults to the Mission `title`.
- `priority` defaults to the Mission `priority`.
- `qaCharter` defaults to `qa-charter.md` next to the Project Passport when the file exists.

For a normal Mission in `received`, the API records planner resources and moves state through:

```text
received -> planning -> planned
```

The API writes:

- one `WorkerRun`;
- `Artifact` records for `mission`, `acceptance`, `technical_notes`, and `risk_notes`;
- `MissionEvent` records from the planner;
- state transition events from the Mission state machine.

Repeated planning is idempotent when the expected planner WorkerRun, Artifacts, and Events already exist. A repeated call returns the persisted result instead of mixing newly generated files with old resources.

## CLI Usage

The local CLI uses the same deterministic package:

```bash
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
```

The CLI writes physical files under `missions/<mission-id>/` and, unless `PSF_SKIP_DB=1`, also syncs Project, Mission, WorkerRun, Artifact, and MissionEvent records to Prisma.

## Boundaries

The planner is a template generator. It does not:

- call an LLM;
- run Codex;
- run project tests;
- clone repositories;
- deploy production;
- decide or approve high-risk operations.

High-risk routing to `approval_required` remains a later workflow responsibility. The generated acceptance and risk notes still name the approval points that later phases must enforce.
