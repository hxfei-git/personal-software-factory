# Phase 8-10 Design - QA Worker, Playwright Placeholders, And Dry-Run Auto Fix Loop

## Purpose

This design extends Personal Software Factory from planning and Codex dry-run artifacts into the first local QA and repair loop. The goal is not to run real Codex or a real browser by default. The goal is to make the loop observable and testable: a Mission can produce a QA report, structured bugs, regression test templates, fix mission files, fix Codex dry-run artifacts, WorkerRun records, Artifact records, QARun records, BugReport records, and MissionEvent history.

The design preserves the current TypeScript monorepo, Zod, Fastify, Prisma, PostgreSQL, Vitest, Project Registry, Mission state machine, and Codex dry-run package.

## Scope

In scope:

- Add a lightweight worker runtime facade with synchronous in-process execution.
- Implement QA Worker dry-run output generation.
- Add optional Playwright smoke support that is skipped unless explicitly configured.
- Add Playwright MCP design docs, config example, and prompt templates.
- Implement a dry-run auto-fix loop that turns QA bugs into fix Mission artifacts and Codex dry-run artifacts.
- Add local CLI commands for QA dry-run, QA dry-run with sample bug, fix dry-run, loop dry-run, and optional Playwright smoke.
- Update documentation, examples, tests, and progress notes.

Out of scope:

- Hub Web UI.
- BullMQ, Redis job dispatch, or Temporal.
- Real Codex execution.
- Real GitHub push, PR creation, or comments.
- Real Coolify, Uptime Kuma, Plane, or n8n API calls.
- Production deployment.
- Required real browser installation for `pnpm test`.

## Architecture

### Worker Runtime

Add `packages/worker-runtime`.

The package defines:

- `WorkerJob`: `id`, `missionId`, `projectId`, `workerType`, `mode`, `input`, `createdAt`.
- `WorkerRuntime`: a small interface for running a job through a handler.
- `InProcessWorkerRuntime`: a synchronous implementation for local development and unit tests.
- Documentation for future `BullMQWorkerRuntime` and `TemporalWorkerRuntime` adapters.

The runtime is not a persistence layer replacement. It should produce or update `WorkerRun` and `MissionEvent` records around handler execution. It must not swallow handler errors. On failure it records an error-shaped result and rethrows or returns failure according to the interface contract selected in implementation.

### QA Worker

Implement `workers/qa-worker` as a real TypeScript package.

Inputs:

- `missionId`
- `projectId`
- optional `stagingUrl`
- optional `withSampleBug`
- Project Passport from `@psf/project-registry`
- `qa-charter.md`
- Mission files from `missions/<mission-id>/`

Dry-run outputs under `missions/<mission-id>/`:

- `qa-report.md`
- `bugs.json`
- `qa-summary.json`
- `generated-regression.spec.ts`
- `artifacts/screenshots/.gitkeep`
- `artifacts/traces/.gitkeep`
- `artifacts/logs/.gitkeep`

Dry-run records:

- `WorkerRun` with `worker_type=qa`, `mode=dry-run`, `status=succeeded`.
- `QARun` with `mode=dry-run`, `status=passed` when there are no bugs and `failed` when sample bugs are requested.
- `Artifact` records for the generated report, JSON, regression spec, and path-only directories.
- `BugReport` records for each bug in `bugs.json`.
- `MissionEvent` records for QA start, artifact generation, bug creation, and QA completion.

The generated `qa-report.md` must include mission/project info, environment, mode, scope, summary, pass/fail items, bug list, reproduction steps, evidence placeholders, risk rating, ready-for-review recommendation, browser/staging flags, and regression template flag.

The generated `bugs.json` must contain an object with `bugs`. Each bug object must match the existing `BugReportSchema` shape after parsing or normalization. No-bug dry-run should use an empty array.

### Optional Playwright Smoke

Playwright should be added as optional local QA capability. Normal `pnpm test` must not require browsers, a staging URL, or network. A separate command can run smoke tests when `STAGING_URL` or `QA_TEST_URL` is present.

The Playwright smoke path should:

- read `QA_TEST_URL` first, then `STAGING_URL`;
- skip cleanly when no URL is set;
- skip or report a controlled failure when browser binaries are unavailable;
- produce a normalized `qa-summary.json` shape if it runs;
- never block unit tests in a fresh local environment.

### Playwright MCP Placeholder

Phase 9 is design and integration placeholder only. Add docs and prompt templates:

- `docs/playwright.md`
- `docs/playwright-mcp.md`
- `docs/prompts/ai-qa-playwright-mcp.md`
- `docs/prompts/qa-report-template.md`
- `docs/prompts/bug-report-template.md`

The docs should explain that Playwright Test is for stable regression checks and Playwright MCP is for AI exploratory QA. MCP output must be converted into structured BugReport and stable Playwright tests. The prompt must require evidence-based findings and prohibit high-severity bugs without evidence.

### Auto Fix Loop

Add `packages/auto-fix-loop`.

Inputs:

- `missionId`
- `projectId`
- QA result or existing `bugs.json`
- Mission files
- Project Passport
- Project `AGENTS.md`
- fix attempt counters
- max mission attempts, default `3`
- max per-bug attempts, default `2`

Outputs when QA passes:

- Mission transition attempt from `qa_running` to `ready_for_review`, when the current state allows it.
- `WorkerRun` and `MissionEvent` records showing the dry-run loop decision.

Outputs when bugs exist:

- `fix-mission.md`
- `fix-acceptance.md`
- `fix-codex-prompt.md`
- `fix-codex-command.sh`
- `WorkerRun`, `Artifact`, and `MissionEvent` records.
- Mission transition attempt through existing states: `qa_running -> bugs_found -> fixing -> regression_running -> qa_running`, as permitted by the current Mission state.

Outputs when attempts are exhausted:

- Mission transition to `paused`.
- MissionEvent explaining the max-attempt decision.

The package must call `createCodexDryRun` from `@psf/codex-worker`. It must not duplicate Codex command generation. It must write the command as a non-executable review artifact.

## Data Flow

QA dry-run:

1. CLI validates `missionId` and reads Mission metadata.
2. Registry loads the project passport and QA charter.
3. QA Worker reads Mission files.
4. QA Worker generates report, bug JSON, summary, regression spec, and placeholder dirs.
5. CLI writes files under `missions/<mission-id>/`.
6. CLI syncs WorkerRun, QARun, Artifact, BugReport, and MissionEvent records to Prisma unless `PSF_SKIP_DB=1`.

Auto-fix dry-run:

1. CLI reads existing `bugs.json` or runs QA as part of `loop:dry-run`.
2. Auto Fix Loop decides pass, bug-fix, or pause.
3. For bugs, it generates fix Mission documents.
4. It calls Codex dry-run with fix-specific Mission files.
5. CLI writes fix files under `missions/<mission-id>/`.
6. CLI syncs WorkerRun, Artifact, MissionEvent, and status-related records when database sync is enabled.

## State Machine Strategy

Use existing statuses:

- `qa_running`
- `bugs_found`
- `fixing`
- `regression_running`
- `ready_for_review`
- `paused`
- `failed`

Do not add new Mission statuses in this batch. If a Mission is currently `planned`, local CLI dry-run may record QA/Fix resources without forcing an invalid state jump. API/workflow integration can later start from `staging_ready` or `qa_running` once deploy/staging phases exist.

## Error Handling

- Invalid mission IDs are rejected before path construction.
- Missing Mission files produce a clear CLI error.
- Invalid passport or QA charter loading errors are surfaced.
- Invalid `bugs.json` fails the QA Worker result validation.
- Worker Runtime records failure metadata and does not hide the error.
- Optional Playwright smoke records skipped state when no URL is configured.
- Real Codex mode remains blocked by default and cannot be reached through these commands.
- Max attempts stop the loop and move the Mission toward `paused` when a valid transition is available.

## Testing

Add focused unit tests for:

- Worker Runtime success and failure behavior.
- QA Worker dry-run output generation.
- QA Worker sample bug generation and schema compatibility.
- QARun, WorkerRun, Artifact, BugReport, and MissionEvent generation.
- Playwright configuration existence and default skip behavior.
- Auto Fix Loop pass path.
- Auto Fix Loop bug path and fix file generation.
- Auto Fix Loop Codex dry-run reuse.
- Max attempt pause behavior.
- No real Codex execution.
- CLI commands writing expected files.

Required final checks:

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`
- `git status --short`

## Documentation Updates

Create or update:

- `docs/qa-worker.md`
- `docs/playwright.md`
- `docs/playwright-mcp.md`
- `docs/auto-fix-loop.md`
- `docs/worker-runtime.md`
- `docs/artifacts.md`
- `docs/progress.md`
- `README.md`
- `.env.example`

Also update `docs/storage.md` to remove the stale statement that the current API has no authentication, because token auth already exists.

## Safety Boundaries

This batch must not:

- run `codex exec`;
- push to a remote;
- create GitHub PRs;
- call external services;
- deploy to staging or production;
- require real browser execution for unit tests;
- modify a real ai-novelist checkout;
- store secrets in artifacts, prompts, reports, logs, or docs.

Real modes remain future work and must require explicit environment gates and Approval records.

## Acceptance Criteria

The batch is complete when:

- QA dry-run generates all required files and records.
- QA dry-run with sample bug generates a schema-valid bug and BugReport record.
- Auto Fix Loop dry-run generates fix files and Codex fix review artifacts.
- Max attempts prevent infinite loops.
- Playwright MCP docs and prompts exist.
- Optional Playwright smoke is documented and does not affect normal tests.
- Tests, typecheck, build, diff check, and status check are run.
- A local Chinese commit is created if checks pass.
