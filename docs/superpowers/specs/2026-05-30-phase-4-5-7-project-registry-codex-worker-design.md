# Phase 4.5-7 Design: Project Registry, Mission Planner, Codex Worker Dry Run

## Context

This spec extends the completed Phase 0-4 foundation of Personal Software Factory. The current repository already has:

- pnpm workspace, TypeScript, Turborepo, Vitest;
- Zod schemas in `packages/mission-schema`;
- Project Passport parsing in `packages/project-passport`;
- Prisma/PostgreSQL persistence in `packages/db`;
- a reusable Mission state machine in `packages/mission-core`;
- a Fastify Orchestrator API MVP in `apps/orchestrator-api`.

The root plan file is tracked as `personal-software-factory-plan.md`; the plan text still refers to `plan.md`. This batch will keep using the tracked file as the canonical plan source unless the user later asks to rename it.

## Scope

This batch combines:

- Phase 4.5: API hardening and core resource route completion;
- Phase 5: Project Registry and `ai-novelist` intake;
- Phase 6: Mission Planner MVP;
- Phase 7: Codex Worker MVP dry-run.

The goal is to make the system capable of registering a project, creating a structured Mission, generating planning artifacts, generating a Codex execution prompt and command, and recording WorkerRun, Artifact, Bug, QA Run, Approval, and MissionEvent records.

## Non-Goals

This batch will not:

- implement Playwright QA Worker;
- implement Hub Web UI;
- execute `codex exec` for real;
- modify the real `ai-novelist` repository;
- call GitHub, Coolify, Uptime Kuma, Plane, or other external APIs;
- push to any remote repository;
- run production deployment or destructive operations;
- introduce Temporal, LangGraph, Next.js implementation, or another heavy framework.

All external or risky behavior remains dry-run or mock by default.

## Recommended Approach

Use an incremental architecture on top of the existing monorepo:

- keep Fastify for Orchestrator API;
- keep Prisma/PostgreSQL for durable state;
- add a Prisma migration to make frequently queried resource fields first-class columns;
- keep route handlers thin and route writes through service and storage abstractions;
- add small reusable packages for Project Registry and Mission Planner;
- implement Codex Worker as a dry-run generator with explicit real-execution guards;
- add a small `psf` CLI through `tsx`, without introducing a CLI framework.

This is preferred over a JSON-first shortcut because Hub, workers, and reports need stable resource contracts. It is also preferred over starting queues or real Codex execution because this batch is about control-plane readiness and safe dry-run behavior.

## Database Design

The existing Prisma schema already includes Project, Mission, MissionEvent, WorkerRun, QARun, Bug, Artifact, and Approval models. A new migration will extend those models rather than replacing them.

Planned additions:

- `WorkerRun`: `mode`, `input`, `output`, `error`, `logs`, `created_at`, `updated_at`.
- `Artifact`: optional `worker_run_id`, optional `content`, `metadata`.
- `Approval`: `requested_by`, `decided_by`, `decision`, `decided_at`.
- `Bug`: align API naming through mapped fields such as `suggested_fix_direction` while preserving existing intent.
- `QARun`: `staging_url`, `passed`, `failed`, optional started/finished timestamps.

Existing columns such as `metadata`, `payload`, and `evidence` remain useful for flexible data, but API-critical fields should not be hidden exclusively inside JSON.

## API Hardening

The API will add token authentication:

- `GET /health` remains public.
- All `POST`, `PUT`, `PATCH`, and `DELETE` routes require `Authorization: Bearer <PSF_API_TOKEN>` unless `PSF_AUTH_DISABLED=true`.
- `PSF_AUTH_DISABLED=true` is intended for local development and tests.
- Missing or invalid tokens return a stable `UNAUTHORIZED` error.
- `.env.example`, README, and API docs will explain the local and protected modes.

No login, user table, sessions, or multi-user permission model will be added.

## Core Resource APIs

The API will preserve existing endpoints and add route families for:

- Approval:
  - `POST /missions/:missionId/approvals`
  - `GET /missions/:missionId/approvals`
  - `GET /approvals/:approvalId`
  - `POST /approvals/:approvalId/decision`
- WorkerRun:
  - `POST /missions/:missionId/worker-runs`
  - `GET /missions/:missionId/worker-runs`
  - `GET /worker-runs/:workerRunId`
  - `PATCH /worker-runs/:workerRunId`
- Artifact:
  - `POST /missions/:missionId/artifacts`
  - `GET /missions/:missionId/artifacts`
  - `GET /artifacts/:artifactId`
- BugReport:
  - `POST /missions/:missionId/bugs`
  - `GET /missions/:missionId/bugs`
  - `GET /bugs/:bugId`
  - `PATCH /bugs/:bugId`
- QARun:
  - `POST /missions/:missionId/qa-runs`
  - `GET /missions/:missionId/qa-runs`
  - `GET /qa-runs/:qaRunId`
  - `PATCH /qa-runs/:qaRunId`

Every write creates a MissionEvent. Event names will be lower-case dotted names such as `approval.created`, `worker_run.updated`, `artifact.created`, `bug.created`, and `qa_run.updated` to match the current `mission.created` style.

## Project Registry

A new `packages/project-registry` package will own local project discovery:

- scan `projects/*/project.passport.yaml`;
- validate each passport through `@psf/project-passport`;
- normalize command values to arrays;
- list all registry projects;
- get one project by id;
- sync projects to Prisma through a storage-friendly function.

The Orchestrator API will not read YAML directly in route handlers. It will call Project Registry through service-level functions.

New API endpoints:

- `POST /projects/sync`, protected by token auth;
- `GET /projects/:projectId/passport`, read-only.

`GET /projects` must continue to work with database-backed projects and should be compatible with registry-synced records.

## ai-novelist Intake

The project entry `projects/ai-novelist` will include:

- `project.passport.yaml`;
- `AGENTS.md`;
- `qa-charter.md`;
- `README.md`.

The passport will use:

- `id: ai-novelist`;
- `name: AI 小说助手`;
- `repo: https://github.com/hxfei-git/ai-novelist.git`;
- runtime metadata;
- install, test, build, and staging commands;
- production and staging URL placeholders;
- quality gates;
- core flows.

Unknown real commands will be explicitly marked as placeholders in the project README and passport comments or descriptive fields. The QA charter will cover the required normal and abnormal flows.

## Mission Planner MVP

A new `packages/mission-planner` package will provide a deterministic planner:

Input:

- project id;
- user requirement;
- Project Passport;
- QA charter text;
- optional title;
- optional priority.

Output:

- `mission.md`;
- `acceptance.md`;
- `technical-notes.md`;
- `risk-notes.md`.

The first version will not call an LLM. It will expose a planner interface that can later be backed by an LLM implementation. The deterministic implementation will be easier to test and will keep this batch repeatable.

The planner flow will:

- create or update a planner WorkerRun with `workerType=planner` and `mode=dry-run`;
- write artifacts under `missions/<mission-slug-or-id>/`;
- register generated files as Artifact records;
- append MissionEvents for planning start and completion.

API addition:

- `POST /missions/:missionId/plan`.

The endpoint will keep compatibility with existing Mission creation. Mission creation remains separate; planning can be invoked after creation.

## Codex Worker Dry Run

`workers/codex-worker` will become a real TypeScript package, but only for dry-run generation.

Input:

- mission id;
- project id;
- generated mission files;
- Project Passport;
- project `AGENTS.md`.

Output:

- `codex-prompt.md`;
- `codex-command.sh`;
- `dev-summary.md`;
- WorkerRun record;
- Artifact records;
- MissionEvent records.

The generated command will be shaped like:

```bash
codex exec --sandbox workspace-write --ask-for-approval on-request "<mission prompt>"
```

The command is written as an artifact and is not executed by default.

Safety rules:

- default `mode=dry-run`;
- only `ENABLE_REAL_CODEX=1` may unlock a future real-execution path;
- real execution must require an approved Approval record;
- real execution is blocked on `main` and `master`;
- `danger-full-access` is not allowed by default;
- no remote push is performed;
- no production release is performed.

Tests will prove that dry-run does not call Codex and that main/master protection exists.

## CLI

Add a minimal CLI entry that can be run through pnpm scripts:

- `pnpm psf projects:sync`;
- `pnpm psf mission:create`;
- `pnpm psf mission:plan`;
- `pnpm psf codex:dry-run`.

The CLI will use existing packages and Prisma storage. It will not call external services. It will generate a sample mission directory such as:

```text
missions/mission-0001-ai-novelist-chapter-review/
  mission.md
  acceptance.md
  technical-notes.md
  risk-notes.md
  codex-prompt.md
  codex-command.sh
  dev-summary.md
```

## Testing

Testing will be focused and layered:

- schema tests for expanded resource values and examples;
- Project Registry tests for scanning valid and invalid passports;
- Mission Planner tests for generated markdown sections and artifact descriptors;
- Codex Worker tests for dry-run outputs and safety guards;
- Orchestrator API tests for token auth and every new resource route family;
- final `pnpm test`, `pnpm typecheck`, and `pnpm build`.

Database migration verification will include `pnpm db:generate` and, when PostgreSQL is available, `pnpm db:migrate`.

## Documentation

Create or update:

- `docs/api.md`;
- `docs/auth.md`;
- `docs/project-registry.md`;
- `docs/project-passport.md`;
- `docs/mission-planner.md`;
- `docs/codex-worker.md`;
- `docs/artifacts.md`;
- `docs/approval-policy.md`;
- `docs/progress.md`;
- `README.md`;
- `.env.example`.

`docs/progress.md` will record completed work, changed files, verification commands, remaining work, whether the implementation deviated from the plan, and dry-run/mock boundaries.

## Risks And Mitigations

- API/storage growth: split storage and services by resource when files become too large.
- Migration mismatch: preserve existing fields and add new columns rather than renaming large surfaces.
- Placeholder ai-novelist commands: mark them clearly and require manual verification before real worker execution.
- Dry-run confusion: record `mode` on WorkerRun and generated artifacts, and document that no command is executed.
- Auth friction in tests: build server options and env support will allow explicit disabled-auth test mode.
- Secret leakage: generated prompts and docs must not contain real tokens or credentials.

## Acceptance Criteria

This design is complete when:

- API token auth protects write routes;
- Approval, WorkerRun, Artifact, BugReport, and QARun APIs have tests;
- Project Registry scans and validates `projects/ai-novelist`;
- Mission Planner generates all four required planning files and records WorkerRun, Artifact, and MissionEvent data;
- Codex Worker dry-run generates prompt, command, and summary artifacts without executing Codex;
- main/master protection has tests;
- docs and `.env.example` are updated;
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass;
- no real external service calls, production actions, or remote pushes occur.
