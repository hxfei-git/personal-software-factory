# Mission Planner API

The Mission Planner API connects the Orchestrator API to the deterministic `@psf/mission-planner` package.

## Endpoint

`POST /missions/:id/plan`

The endpoint plans an existing Mission. It does not create a new Mission and it does not write physical files to disk in this task.

Request body fields are optional:

```json
{
  "userRequirement": "增加章节审稿和自动修复流程",
  "qaCharter": "# QA Charter\n- 打开首页\n- 导出小说",
  "title": "章节审稿与修复闭环",
  "priority": "P1"
}
```

Fallbacks:

- `userRequirement` defaults to the Mission `raw_request`.
- `title` defaults to the Mission `title`.
- `priority` defaults to the Mission `priority`.
- `qaCharter` defaults to `qa-charter.md` next to the Project Passport when that file exists; otherwise it is an empty string.

## Planning Flow

The API service loads the Mission and validates that the current Mission status can be planned before reading Project Passport or QA Charter files. It then verifies the Project exists in storage and loads the Project Passport through the Project Registry code. Route handlers do not read registry files directly.

The service calls `createDeterministicMissionPlan` with `missionId: mission.id`, so generated planner resources belong to the existing Mission.

For a normal low or medium risk Mission in `received`, the service advances state through the existing state machine:

```text
received -> planning -> planned
```

Those transitions create `mission.transition.received.planning` and `mission.transition.planning.planned` events. High-risk routing to `approval_required` is deferred; this endpoint currently plans the Mission and leaves approval routing to later workflow tasks.

The API records the returned planner resources through storage:

- one `WorkerRun` with `worker_type: planner`;
- four inline `Artifact` records: `mission`, `acceptance`, `technical_notes`, and `risk_notes`;
- planner `MissionEvent` records including `mission.planning.started` and `mission.planning.completed`.

Planning is idempotent after resources are persisted. If a Mission is already `planned`, or is still `planning`, and the expected planner WorkerRun, Artifacts, and planner Events exist, a repeated `POST /missions/:id/plan` returns the persisted planner result without appending duplicate planner or transition events. This remains true even if the repeat request sends a different title, requirement, or QA Charter; the response is reconstructed from persisted WorkerRun input and Artifact records rather than mixing new generated files with old resources. Planner persistence also uses deterministic IDs idempotently so duplicate writes do not surface as generic database unique-key failures.

For the local MVP dry-run, these records are written as one planner result operation. Artifact `content` is stored inline in the database or in-memory storage; files under `missions/{missionId}/` are planned paths only until the later file-writing task. Mission event listing is ordered by `created_at` and then event `id`; Prisma persists supplied event timestamps so in-memory and database-backed ordering remain consistent.

## Response

The response is compact and omits artifact content:

```json
{
  "missionId": "mission-123",
  "title": "章节审稿与修复闭环",
  "files": [
    { "name": "mission.md", "path": "missions/mission-123/mission.md", "size": 1234 }
  ],
  "workerRun": { "worker_type": "planner", "status": "succeeded" },
  "artifacts": [
    { "type": "mission", "path": "missions/mission-123/mission.md" }
  ],
  "events": [
    { "type": "mission.planning.started" },
    { "type": "mission.planning.completed" }
  ]
}
```

Missing Missions, Projects, or Project Passports return `404 NOT_FOUND`. Invalid registry reads or invalid request bodies return stable validation errors. Calling the endpoint from a Mission state where planning is not valid returns `INVALID_MISSION_TRANSITION` rather than recording planner artifacts silently.
