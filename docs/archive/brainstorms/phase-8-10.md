# Phase 8-10 Brainstorm - QA Worker And Auto Fix Loop

## System Fit

Phase 8-10 extends the existing Personal Software Factory foundation without replacing earlier work. The current system already has Project Passport intake, Mission planning, Codex dry-run artifacts, Mission state transitions, and durable records for WorkerRun, QARun, BugReport, Artifact, Approval, and MissionEvent. This batch should connect those records into a local, auditable QA and repair loop while keeping real browser, Codex, GitHub, deployment, and external service actions disabled by default.

No architecture-breaking issue was found in the existing code. The current schema and Prisma models are sufficient for the first QA and fix loop. The only likely schema-level adjustment is allowing `auto_fix` as a worker type if the implementation chooses to distinguish the loop controller from the Codex worker. Mission statuses should be reused rather than expanded.

## Connection To Existing Resources

QA Worker will create or update:

- `WorkerRun` with `worker_type=qa`, `mode=dry-run` or `mock`, and explicit input/output/log metadata.
- `QARun` with `mode=dry-run`, `status=passed` or `failed`, report paths, screenshot directory, trace directory, and pass/fail counts.
- `Artifact` records for `qa-report.md`, `bugs.json`, `qa-summary.json`, `generated-regression.spec.ts`, and path-only screenshot/trace placeholder directories.
- `BugReport` records when `bugs.json` contains bugs.
- `MissionEvent` records for QA start, artifact generation, bug creation, and QA completion.

Auto Fix Loop will create or update:

- `WorkerRun` with `worker_type=auto_fix` if supported, otherwise `worker_type=orchestrator` with metadata that marks the run as auto-fix-loop.
- `Artifact` records for `fix-mission.md`, `fix-acceptance.md`, `fix-codex-prompt.md`, and `fix-codex-command.sh`.
- `MissionEvent` records for loop start, fix plan generation, Codex dry-run generation, max-attempt decisions, and loop completion.
- Mission status through the existing state machine: `qa_running -> ready_for_review` for passing QA, `qa_running -> bugs_found -> fixing -> regression_running -> qa_running` for bug flow, and `paused` when attempts are exhausted.

## Reusing ai-novelist Inputs

QA Worker should read `projects/ai-novelist/project.passport.yaml` through `@psf/project-registry` and `@psf/project-passport`, not by ad hoc YAML parsing. It should read `projects/ai-novelist/qa-charter.md` as the source of normal and abnormal user paths. For the example Mission, it should read:

- `missions/mission-0001-ai-novelist-chapter-review/mission.md`
- `missions/mission-0001-ai-novelist-chapter-review/acceptance.md`
- `missions/mission-0001-ai-novelist-chapter-review/technical-notes.md`
- `missions/mission-0001-ai-novelist-chapter-review/risk-notes.md`

The generated regression spec should explicitly cover the ai-novelist normal path and abnormal path from the QA charter. Because no real staging page exists yet, the first spec can be a skipped or template spec with selectors clearly isolated for later replacement.

## Reusing Codex Worker Dry Run

Auto Fix Loop must call the existing `createCodexDryRun` implementation instead of duplicating Codex prompt or command construction. The loop will generate fix-specific mission files, pass those files into `createCodexDryRun`, then write the returned prompt and command under fix-specific filenames:

- `fix-codex-prompt.md`
- `fix-codex-command.sh`

The command file must remain a review artifact, not an executable script. Real Codex execution remains unavailable unless a future phase implements it behind `ENABLE_REAL_CODEX=1`, Approval, workspace isolation, and main/master branch protection.

## Dry-Run And Mock Boundaries

This batch remains local-first and safe:

- QA dry-run does not open a browser.
- QA dry-run does not require `STAGING_URL` or `QA_TEST_URL`.
- QA dry-run does not clone or modify the real ai-novelist repository.
- Playwright smoke is optional and skipped unless a URL and browser environment are explicitly available.
- Playwright MCP is documentation, prompt, and config placeholder only.
- Auto Fix Loop does not execute Codex.
- Auto Fix Loop does not push, create PRs, deploy, or call external APIs.
- All dangerous future behavior must remain gated by environment variables and Approval records.

## Why Hub Web Is Deferred

Hub Web is Phase 11 in `plan.md`. Phase 8-10 needs to prove the backend loop first: QA evidence generation, bug structuring, fix planning, Codex dry-run reuse, status transitions, and artifacts. Building UI before those records and file outputs are stable would make the frontend depend on moving contracts. This batch should update docs and CLI/API-compatible data, not build screens.

## Why BullMQ Is Deferred

`plan.md` names Redis/BullMQ as the eventual queue layer, but this batch should first add a `WorkerRuntime` facade. The facade gives workers a stable execution boundary and allows tests to exercise WorkerRun/MissionEvent behavior synchronously. BullMQ can later implement the same interface after the job payloads, error model, and status events are proven. This avoids introducing queue infrastructure before the worker contracts are stable.

## Design Choice

Use a lightweight dry-run loop:

1. Add `packages/worker-runtime` with a synchronous `InProcessWorkerRuntime`.
2. Implement `workers/qa-worker` as deterministic artifact and record generator.
3. Implement `packages/auto-fix-loop` as a controller that consumes QA results and reuses Codex dry-run.
4. Extend the local `pnpm psf` CLI with QA and fix commands.
5. Document Playwright Test and Playwright MCP as separate layers: fixed regression tests versus AI exploratory testing.

This keeps the system aligned with Personal Software Factory's core goal: structured requirements, structured QA evidence, structured defects, and a reviewable dry-run repair path.
