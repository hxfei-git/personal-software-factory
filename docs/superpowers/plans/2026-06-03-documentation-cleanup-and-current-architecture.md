# Documentation Cleanup And Current Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale current-state documentation with `struct.md`, `summary.md`, and `debug.md`, then archive misleading historical plans without losing audit evidence.

**Architecture:** This is a documentation-only governance cleanup. Root-level current fact sources become the entrypoint for active architecture, current problems, and debug records; historical Superpowers and phase planning artifacts move under `docs/archive/` unless they are part of this cleanup's active spec/plan.

**Tech Stack:** Markdown documentation, git moves, ripgrep validation, `git diff --check`.

---

## File Structure

Create:

- `struct.md`: current implemented architecture map.
- `summary.md`: current problems, risks, and improvement backlog.
- `debug.md`: current debug entrypoint and log format.
- `docs/archive/README.md`: archive policy and navigation.

Move:

- `docs/progress/current.md` -> `docs/archive/progress/current-phase-1.md`
- `enhance_plan.md` -> `docs/archive/plans/enhance_plan.md`
- `docs/brainstorms/*.md` -> `docs/archive/brainstorms/*.md`
- old `docs/superpowers/plans/*.md` except this plan -> `docs/archive/superpowers/plans/*.md`
- old `docs/superpowers/specs/*.md` except `docs/superpowers/specs/2026-06-03-documentation-cleanup-and-current-architecture-design.md` -> `docs/archive/superpowers/specs/*.md`

Modify:

- `AGENTS.md`: replace stale phase discipline and add required update rules for `struct.md`, `summary.md`, and `debug.md`.
- `README.md`: add the current fact-source documents near the top-level docs list and remove root `enhance_plan.md` as an active source.
- `docs/README.md`: point active readers to root `struct.md`, `summary.md`, `debug.md`, and `docs/progress.md`.
- `docs/progress.md`: add a current pointer section and mention the archive move.
- `docs/progress/README.md`: remove `current.md` as an active current-state pointer.
- `docs/superpowers/README.md`: explain that current Superpowers specs/plans stay in active folders and older completed artifacts are archived.
- `docs/superpowers/plans/README.md`: explain that this directory is for active implementation plans and completed historical plans live in archive.

Do not modify runtime code, package files, Prisma schema, tests, or `.env.example`.

---

### Task 1: Create Current Architecture Fact Source

**Files:**

- Create: `struct.md`
- Modify: none
- Test: none

- [ ] **Step 1: Write `struct.md`**

Create `struct.md` with these sections and content:

```markdown
# Current Architecture Structure

## Status

This file is the current architecture fact source for Personal Software Factory.
It describes the implemented repository state after the gated real execution work, Batch 03/04 local QA and Codex proof surfaces, and Batch 05/06 fix/regression plus GitHub PR gate preview.

Historical phase plans remain useful for audit, but they are not the current architecture source.

## System Purpose

Personal Software Factory is a single-user AI software factory control plane. It turns natural-language requirements into structured Missions, planned work, dry-run or gated worker execution, deterministic QA evidence, bug reports, fix-loop records, approval gates, and reviewable release artifacts.

The default product posture is local-first, dry-run/mock/manual-action safe. Real Codex execution, browser execution, provider calls, remote push, PR creation, deployment, monitor creation, and Plane sync remain disabled unless explicit gates, approvals, worker wiring, and injected runners or transports are intentionally configured.

## Monorepo Boundaries

- `apps/hub`: React/Vite operator console.
- `apps/orchestrator-api`: Fastify control-plane API.
- `apps/worker-runner`: BullMQ worker process for queued jobs.
- `workers/codex-worker`: Codex dry-run and gated real-runner abstractions.
- `workers/qa-worker`: deterministic Playwright QA and AI exploratory QA abstractions.
- `packages/mission-schema`: shared Zod schemas and TypeScript contracts.
- `packages/mission-core`: Mission state machine and transition event builder.
- `packages/db`: Prisma schema, migrations, seed, and Prisma client wrapper.
- `packages/project-passport`: Project Passport parser and validator.
- `packages/project-registry`: scanner for `projects/*/project.passport.yaml`.
- `packages/mission-planner`: deterministic Mission planner.
- `packages/artifact-store`: local artifact path and retention helpers.
- `packages/worker-runtime`: in-process and BullMQ queue facade.
- `packages/demo-workflow`: local ai-novelist dry-run demo workflow.
- `packages/integrations`: dry-run and gated real adapters for GitHub, Coolify, Uptime Kuma, and Plane.
- `packages/security`: redaction, path, command, and approval policy helpers.
- `packages/auto-fix-loop`: dry-run and gated real fix-loop contracts.
- `projects/ai-novelist`: first managed project metadata, AGENTS guidance, and QA charter.
- `missions/`, `artifacts/`, `workspaces/`: generated Mission files, evidence, and worker checkout roots.

## Hub Web

Hub Web is a control surface, not the source of workflow truth. It reads Orchestrator API data for dashboard metrics, projects, Missions, bugs, WorkerRuns, artifacts, approvals, integrations, queue status, real-mode readiness, external link visibility, and Mission summaries.

Hub write actions are limited to protected Orchestrator API calls such as Mission creation, dry-run actions, integration dry-runs, and Approval decisions. Approval decisions only update records; they do not execute real Codex, queue real work by themselves, create PRs, deploy, create monitors, or sync providers.

## Orchestrator API

The Orchestrator API owns the control-plane HTTP surface. `apps/orchestrator-api/src/server.ts` wires Fastify routes, `services.ts` validates requests and builds responses, and `storage.ts` abstracts in-memory and Prisma-backed persistence.

The API exposes health, dashboard, project registry sync, project passport reads, Mission creation/planning/summary/actions, Approval records, WorkerRun records, Artifact records, BugReport records, QARun records, queue status, and integration dry-run/status routes.

Write routes require bearer-token auth unless explicitly disabled for local development or tests.

## Storage And Events

The Prisma model includes `Project`, `Mission`, `MissionEvent`, `WorkerRun`, `QARun`, `Bug`, `Artifact`, `Approval`, `Deployment`, and `Monitor`.

Every Mission state transition and resource write must be auditable through a `MissionEvent`. Storage implementations are expected to write the resource and event together when a route or worker action mutates state.

## Mission State Machine

`packages/mission-core/src/state-machine.ts` defines legal Mission transitions. Final states do not transition without explicit reopen behavior. Worker Runner only performs conservative automatic transitions when `canTransition` allows the next state.

Core states include `received`, `planning`, `planned`, `approval_required`, `dev_queued`, `dev_running`, `build_running`, `test_running`, `staging_deploying`, `staging_ready`, `qa_running`, `bugs_found`, `fixing`, `regression_running`, `ready_for_review`, `release_approval`, `production_deploying`, `released`, `paused`, `blocked`, `needs_human`, `failed`, and `cancelled`.

## Worker Runtime And Worker Runner

`@psf/worker-runtime` provides a queue facade with in-process and BullMQ implementations. It accepts only whitelisted job types and rejects payload keys that look like tokens, passwords, secrets, API keys, authorization headers, or credentials.

In queued mode, the API creates a queue wrapper `WorkerRun`, enqueues a validated job, and returns a queued response. `apps/worker-runner` consumes the job, updates the wrapper WorkerRun, executes the mapped handler, persists child resources, records `mission.action_result`, and applies legal automatic Mission transitions.

## Worker Contracts

Dry-run jobs include `mission.plan`, `codex.dry_run`, `qa.dry_run`, `qa.dry_run_with_sample_bug`, `fix.dry_run`, `loop.dry_run`, `demo.ai_novelist`, and `integration.dry_run`.

Gated real-mode contract jobs include `codex.real`, `qa.playwright`, `qa.ai_exploratory`, `fix.real`, `github.pr`, `deploy.coolify`, `monitor.uptime_kuma`, and `plane.sync`.

The default Worker Runner path remains safe. Real handlers return blocked or manual-action output unless their full gate chain is intentionally satisfied.

## Integration Boundaries

GitHub, Coolify, Uptime Kuma, and Plane adapters expose dry-run/status behavior and gated real adapter code paths. Default API, CLI, Hub, tests, and Worker Runner paths do not call external provider APIs.

`realNetworkCall` must remain `false` unless a gated real adapter actually invokes an injected transport during an explicitly approved run. `realExternalCall`, `realPush`, and `realDeploy` must remain false in default paths.

## ai-novelist Readiness

`projects/ai-novelist/project.passport.yaml` is readiness metadata for the first managed project. Its commands and selectors are marked manual-verification-required because the real repository is not verified in this workspace. Workers must not claim the project is runnable until a human verifies the real checkout, commands, URLs, and deterministic selectors.

## Current Source Priority

Use these documents as active sources before coding:

1. `AGENTS.md`
2. `struct.md`
3. `summary.md`
4. `debug.md`
5. `README.md`
6. `docs/progress.md`
7. `docs/api.md`
8. `docs/safety.md`
9. `docs/queue-runtime.md`
10. provider-specific integration docs when touching that provider
```

- [ ] **Step 2: Verify `struct.md` contains the safety boundary**

Run:

```bash
rg -n "realNetworkCall|manual-verification-required|Worker Runtime|Orchestrator API" struct.md
```

Expected: output contains all four searched phrases.

- [ ] **Step 3: Commit**

Run:

```bash
git add struct.md
git commit -m "记录当前架构事实源" -m "新增 struct.md，汇总当前 monorepo、Hub、Orchestrator、Worker、状态机、集成边界和 ai-novelist 就绪限制。"
```

Expected: commit succeeds.

---

### Task 2: Create Summary And Debug Entrypoints

**Files:**

- Create: `summary.md`
- Create: `debug.md`
- Test: none

- [ ] **Step 1: Write `summary.md`**

Create `summary.md` with this content:

```markdown
# Current Architecture Summary

## Status

This file tracks current architecture problems, risks, and improvement items. It is not a historical phase log; historical phase material is kept under `docs/progress.md` and `docs/archive/`.

## Current Strengths

- The project has clear TypeScript monorepo boundaries.
- Orchestrator API owns state and exposes a broad local control-plane surface.
- Mission state transitions are explicit and auditable.
- Worker Runtime and Worker Runner provide a queue boundary without granting arbitrary execution.
- Hub Web reads Orchestrator data and does not directly mutate the filesystem, database, or providers.
- Integration dry-runs and real-mode readiness surfaces preserve `realNetworkCall: false` by default.
- `ai-novelist` is registered as readiness metadata without pretending unverified commands are safe.

## Current Problems

1. Documentation phase drift: older documents still refer to Phase 1, Phase 11-15, Phase 16A/16B/17A, or Phase 17B as if they are the current state.
2. Historical plans are mixed with active guidance: root-level and active docs make some completed plans look current.
3. Real-mode gate complexity is high: route gates, worker gates, provider gates, approvals, injected transports, and local workspace checks are spread across several documents and code paths.
4. `ai-novelist` execution is not verified: passport commands, selectors, local URL behavior, and E2E entrypoints require manual verification in a real checkout.
5. Contract duplication exists between Hub API types, mission schemas, Orchestrator service schemas, worker job schemas, and integration types.
6. Manual-action UX is useful but not yet ergonomic: operators can see blockers, but the next concrete action is not always obvious.
7. The archive policy has not been consistently applied, so future agents can read stale phase material as active instruction.

## Improvement Backlog

### P0

- Keep `realNetworkCall: false` in default integration and gated real-mode responses.
- Keep token, password, API key, authorization, cookie, credential, session, JWT, and bearer values out of docs, logs, Hub UI, API responses, artifacts, PR bodies, and Issue bodies.
- Update `struct.md`, `summary.md`, and `debug.md` when code or files change their covered areas.

### P1

- Verify `ai-novelist` install, dev, build, test, lint, and E2E commands in a real checkout before enabling real worker execution.
- Build a single readiness checklist for each gated real action.
- Reduce repeated type contracts or add focused contract tests where duplication is still useful.
- Make Hub real-mode blockers point to the exact missing approval, gate, env var, local mirror, target URL, runner, or transport.

### P2

- Decide when old phase labels should be replaced with batch labels in current docs.
- Add a short architecture diagram after the current facts stabilize.
- Revisit Temporal or LangGraph only after BullMQ/state-machine orchestration shows concrete recovery or long-running workflow pain.

## Recently Resolved By Documentation Cleanup

- A new `struct.md` is the current architecture map.
- A new `summary.md` is the issue and improvement source.
- A new `debug.md` is the debug record source.
- Misleading historical current-state files are archived instead of left as active guidance.
```

- [ ] **Step 2: Write `debug.md`**

Create `debug.md` with this content:

```markdown
# Debug Notes

## Purpose

This file records debugging context that should survive a single terminal session. It summarizes investigations, failed checks, unexpected behavior, manual-action results, queue/runtime issues, and follow-up verification.

Do not paste secrets, raw tokens, passwords, cookies, provider credentials, private manuscript content, or long logs here. Store large generated evidence under `artifacts/` and link only safe paths or sanitized summaries.

## Known Debug Hotspots

- Orchestrator write auth and local `PSF_API_TOKEN` / `VITE_PSF_API_TOKEN` mismatch.
- Queue mode mismatch between `PSF_WORKER_RUNTIME`, `PSF_ACTION_EXECUTION_MODE`, Redis, API, and Worker Runner.
- `qa.playwright` blocked because target URL, verified selectors, or `ENABLE_REAL_PLAYWRIGHT=1` is missing.
- `codex.real` manual-action output because no injected runner is wired, repoUrl is not a local mirror, branch is not under `agent/`, or workspace guards fail.
- GitHub PR preview blocked because `EXTERNAL_COST_RISK` approval or operation gates are missing.
- Integration readiness confusion where `realEnabled=true` still correctly reports `realNetworkCall=false`.
- `ai-novelist` command assumptions that remain manual-verification-required.

## Focused Verification Commands

```bash
git status --short --branch
git diff --check
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/integrations test
pnpm psf doctor
pnpm psf integrations:status
pnpm psf queues:status
```

Run the smallest meaningful checks first. Use broader `pnpm check`, `pnpm typecheck`, and `pnpm test` when shared contracts, phase gates, or cross-package behavior change.

## Debug Record Format

Use this format for new entries:

```markdown
### YYYY-MM-DD - Short Issue Title

- Context: what changed or what was being checked.
- Symptom: exact failure or unexpected behavior, with secrets redacted.
- Scope: packages, apps, docs, or commands involved.
- Investigation: key observations and discarded causes.
- Fix: files changed or decision made.
- Verification: commands run and results.
- Follow-up: concrete remaining action or `none`.
```

## Current Entries

### 2026-06-03 - Documentation Drift Identified

- Context: current documentation cleanup planning.
- Symptom: `docs/progress/current.md` still described Phase 1, while README and progress rollups described gated real execution and Batch 05/06.
- Scope: root docs, progress docs, AGENTS guidance, historical planning files.
- Investigation: searched docs for stale phase labels, `enhance_plan.md`, and active references to historical plans.
- Fix: create current fact-source docs and archive misleading historical files through the documentation cleanup implementation.
- Verification: spec and plan are committed before file cleanup begins.
- Follow-up: implement the cleanup plan and re-run documentation text checks.
```

- [ ] **Step 3: Verify summary and debug docs**

Run:

```bash
rg -n "Documentation phase drift|realNetworkCall|Debug Record Format|Documentation Drift Identified" summary.md debug.md
```

Expected: output contains all four searched phrases.

- [ ] **Step 4: Commit**

Run:

```bash
git add summary.md debug.md
git commit -m "新增架构总结和调试记录" -m "新增 summary.md 和 debug.md，记录当前架构问题、改进项、调试热点、验证命令和后续调试记录格式。"
```

Expected: commit succeeds.

---

### Task 3: Update Agent Governance And Active Documentation Indexes

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/progress.md`
- Modify: `docs/progress/README.md`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/README.md`
- Test: none

- [ ] **Step 1: Update `AGENTS.md` current phase discipline**

Replace the `## Current Phase Discipline` section with:

```markdown
## Current Phase Discipline

- Current active implementation state is documented in `struct.md`, `summary.md`, `debug.md`, `README.md`, and `docs/progress.md`.
- The repository includes gated real execution contracts and Batch 05/06 fix/regression plus GitHub PR preview work, but the default posture remains local-first, dry-run/mock/manual-action safe.
- Do not turn GitHub, Coolify, Uptime Kuma, Plane, Codex, Playwright, or AI exploratory adapters into real external callers or real execution paths without an explicit later task and approval.
- Integration responses and default gated real-mode responses must keep `realNetworkCall` false until real external calls are intentionally implemented and approved.
- Keep changes small, documented, and aligned with `struct.md`, `docs/api.md`, `docs/safety.md`, and `docs/queue-runtime.md`.
```

- [ ] **Step 2: Update `AGENTS.md` required reading**

Replace the `## Required Reading Before Major Changes` list with:

```markdown
## Required Reading Before Major Changes

- `struct.md` for the current implemented architecture.
- `summary.md` for current problems, risks, and improvement backlog.
- `debug.md` for known debug hotspots and recent investigations.
- `README.md` for current local setup and capability boundaries.
- `docs/progress.md` for latest completed batches and verification status.
- `docs/api.md` for Orchestrator API contracts.
- `docs/safety.md` for dry-run, real-mode, and secret boundaries.
- `docs/queue-runtime.md` for queued WorkerRun and Worker Runner behavior.
- `plan.md` for long-term product vision only; do not treat it as current implementation state.
```

- [ ] **Step 3: Add `AGENTS.md` document maintenance rule**

Insert this section after `## Working Rules`:

```markdown
## Documentation Maintenance Rules

- If a change modifies architecture, module boundaries, data flow, state transitions, worker contracts, integration gates, or safety boundaries, update `struct.md` in the same task.
- If a change adds, resolves, or discovers architecture problems, risks, technical debt, phase status changes, or improvement work, update `summary.md` in the same task.
- If a change involves debugging, failed checks, unexpected behavior, manual-action output, flaky tests, queue/runtime issues, or incident-like findings, update `debug.md` in the same task.
- If none of `struct.md`, `summary.md`, or `debug.md` need changes, the final response and commit body must explicitly state why.
- Do not record secret values in any of these documents.
```

- [ ] **Step 4: Update README documentation list**

In `README.md`, add these bullets at the start of the `## Documentation` list:

```markdown
- `struct.md`: current implemented architecture map and module boundaries.
- `summary.md`: current architecture problems, risks, and improvement backlog.
- `debug.md`: debug hotspots, focused verification commands, and investigation records.
```

Also add this sentence before the existing docs bullets:

```markdown
Start with the root current fact sources before reading historical phase plans.
```

- [ ] **Step 5: Update `docs/README.md`**

Replace the file with:

```markdown
# Documentation

This directory holds architecture references, API contracts, safety guidance, operations notes, ADRs, progress rollups, and archived historical planning material for Personal Software Factory.

Start with the root current fact sources:

- `../struct.md`
- `../summary.md`
- `../debug.md`
- `../README.md`
- `progress.md`

Historical phase plans and brainstorms are scheduled to move under `archive/` in Task 4. Until then, do not treat those historical files as current implementation instructions.

Documentation should stay aligned with the implemented system. Do not describe a capability as enabled unless its gates, tests, and safety boundaries are implemented and verified.
```

- [ ] **Step 6: Update `docs/progress.md` with current pointer**

Add this section after the title:

```markdown
## Current Fact Sources

The current architecture fact source is `../struct.md`. Current problems and improvement items are tracked in `../summary.md`. Debug notes and investigation records are tracked in `../debug.md`.

Older phase plans and brainstorms are historical references after the documentation cleanup and should not override current fact-source documents.
```

- [ ] **Step 7: Update `docs/progress/README.md`**

Replace the file with:

```markdown
# Progress Notes

This directory stores current progress rollups and focused batch summaries.

Use `../progress.md` as the active progress entrypoint. The old `current.md` Phase 1 note is scheduled to move under `../archive/progress/current-phase-1.md` in Task 4 because it no longer represents the repository's current implementation state.
```

- [ ] **Step 8: Update Superpowers README files**

Replace `docs/superpowers/README.md` with:

```markdown
# Superpowers Workflow Documents

This directory stores active Superpowers design and planning artifacts for the current workstream.

Completed historical specs, plans, and brainstorms are scheduled to move under `docs/archive/` in Task 4. Plans in this directory are execution guides, not runtime source code.
```

Replace `docs/superpowers/plans/README.md` with:

```markdown
# Superpowers Implementation Plans

This directory is for active implementation plans. Completed historical plans are scheduled to move under `docs/archive/superpowers/plans/` in Task 4.

Use the newest active plan for the current task and ignore archived plans unless researching implementation history.
```

- [ ] **Step 9: Verify stale active phase wording is removed from active docs**

Run:

```bash
rg -n "Phase 1: Monorepo Foundation|Phase 11-15 currently|Current Phase" AGENTS.md README.md docs --glob '!docs/archive/**'
```

Expected: no output and exit code 1, except matches inside the active cleanup spec or plan are acceptable during implementation planning. If the cleanup spec or plan is the only match, keep it.

- [ ] **Step 10: Commit**

Run:

```bash
git add AGENTS.md README.md docs/README.md docs/progress.md docs/progress/README.md docs/superpowers/README.md docs/superpowers/plans/README.md
git commit -m "更新文档治理入口" -m "更新 AGENTS、README 和文档索引，指向 struct、summary、debug 当前事实源，并移除旧阶段作为当前状态的表述。"
```

Expected: commit succeeds.

---

### Task 4: Archive Misleading Historical Documents

**Files:**

- Create: `docs/archive/README.md`
- Move: `docs/progress/current.md` -> `docs/archive/progress/current-phase-1.md`
- Move: `enhance_plan.md` -> `docs/archive/plans/enhance_plan.md`
- Move: `docs/brainstorms/phase-11-15.md` -> `docs/archive/brainstorms/phase-11-15.md`
- Move: `docs/brainstorms/phase-16-17a.md` -> `docs/archive/brainstorms/phase-16-17a.md`
- Move: `docs/brainstorms/phase-17-queue-worker-runtime.md` -> `docs/archive/brainstorms/phase-17-queue-worker-runtime.md`
- Move: `docs/brainstorms/phase-8-10.md` -> `docs/archive/brainstorms/phase-8-10.md`
- Move: historical files under `docs/superpowers/plans/`
- Move: historical files under `docs/superpowers/specs/`
- Test: none

- [ ] **Step 1: Create archive directories**

Run:

```bash
mkdir -p docs/archive/progress docs/archive/plans docs/archive/brainstorms docs/archive/superpowers/plans docs/archive/superpowers/specs
```

Expected: command exits 0.

- [ ] **Step 2: Write `docs/archive/README.md`**

Create `docs/archive/README.md` with:

```markdown
# Documentation Archive

This directory preserves historical plans, brainstorms, specs, and superseded progress notes.

Archived files are audit references. They can explain why earlier choices were made, but they are not current implementation instructions. For active architecture and operating guidance, read:

- `../../struct.md`
- `../../summary.md`
- `../../debug.md`
- `../../README.md`
- `../progress.md`
- `../api.md`
- `../safety.md`
- `../queue-runtime.md`

Do not move ADRs, API docs, safety docs, operations docs, provider docs, or verified progress rollups here unless a newer active document explicitly replaces them.
```

- [ ] **Step 3: Move stale current and root plan files**

Run:

```bash
git mv docs/progress/current.md docs/archive/progress/current-phase-1.md
git mv enhance_plan.md docs/archive/plans/enhance_plan.md
```

Expected: both moves succeed.

- [ ] **Step 4: Move old brainstorm files**

Run:

```bash
git mv docs/brainstorms/phase-11-15.md docs/archive/brainstorms/phase-11-15.md
git mv docs/brainstorms/phase-16-17a.md docs/archive/brainstorms/phase-16-17a.md
git mv docs/brainstorms/phase-17-queue-worker-runtime.md docs/archive/brainstorms/phase-17-queue-worker-runtime.md
git mv docs/brainstorms/phase-8-10.md docs/archive/brainstorms/phase-8-10.md
```

Expected: all moves succeed.

- [ ] **Step 5: Move historical Superpowers plans**

Run these commands, leaving this cleanup plan in `docs/superpowers/plans/`:

```bash
git mv docs/superpowers/plans/2026-05-30-phase-1-monorepo-foundation.md docs/archive/superpowers/plans/2026-05-30-phase-1-monorepo-foundation.md
git mv docs/superpowers/plans/2026-05-30-phase-2-4-foundation-implementation.md docs/archive/superpowers/plans/2026-05-30-phase-2-4-foundation-implementation.md
git mv docs/superpowers/plans/2026-05-30-phase-4-5-7-project-registry-codex-worker-implementation.md docs/archive/superpowers/plans/2026-05-30-phase-4-5-7-project-registry-codex-worker-implementation.md
git mv docs/superpowers/plans/2026-05-31-phase-8-10-qa-worker-auto-fix-loop-implementation.md docs/archive/superpowers/plans/2026-05-31-phase-8-10-qa-worker-auto-fix-loop-implementation.md
git mv docs/superpowers/plans/2026-05-31-phase-11-15-hub-web-integration-dry-run-implementation.md docs/archive/superpowers/plans/2026-05-31-phase-11-15-hub-web-integration-dry-run-implementation.md
git mv docs/superpowers/plans/2026-05-31-phase-16a-16b-17a-demo-ops-hardening-implementation.md docs/archive/superpowers/plans/2026-05-31-phase-16a-16b-17a-demo-ops-hardening-implementation.md
git mv docs/superpowers/plans/2026-05-31-phase-17b-queue-worker-runtime-implementation.md docs/archive/superpowers/plans/2026-05-31-phase-17b-queue-worker-runtime-implementation.md
git mv docs/superpowers/plans/2026-05-31-real-execution-and-integrations-implementation.md docs/archive/superpowers/plans/2026-05-31-real-execution-and-integrations-implementation.md
git mv docs/superpowers/plans/2026-06-01-phase-18-hub-control-plane-and-generic-actions-implementation.md docs/archive/superpowers/plans/2026-06-01-phase-18-hub-control-plane-and-generic-actions-implementation.md
git mv docs/superpowers/plans/2026-06-02-batch-03-04-qa-and-local-codex-implementation.md docs/archive/superpowers/plans/2026-06-02-batch-03-04-qa-and-local-codex-implementation.md
```

Expected: all moves succeed.

- [ ] **Step 6: Move historical Superpowers specs**

Run these commands, leaving the approved cleanup spec in `docs/superpowers/specs/`:

```bash
git mv docs/superpowers/specs/2026-05-30-phase-2-4-foundation-design.md docs/archive/superpowers/specs/2026-05-30-phase-2-4-foundation-design.md
git mv docs/superpowers/specs/2026-05-30-phase-4-5-7-project-registry-codex-worker-design.md docs/archive/superpowers/specs/2026-05-30-phase-4-5-7-project-registry-codex-worker-design.md
git mv docs/superpowers/specs/2026-05-31-phase-8-10-qa-worker-auto-fix-loop-design.md docs/archive/superpowers/specs/2026-05-31-phase-8-10-qa-worker-auto-fix-loop-design.md
git mv docs/superpowers/specs/2026-05-31-phase-11-15-hub-web-integration-dry-run-design.md docs/archive/superpowers/specs/2026-05-31-phase-11-15-hub-web-integration-dry-run-design.md
git mv docs/superpowers/specs/2026-05-31-phase-16-demo-ops-hardening-design.md docs/archive/superpowers/specs/2026-05-31-phase-16-demo-ops-hardening-design.md
git mv docs/superpowers/specs/2026-05-31-phase-17b-queue-worker-runtime-design.md docs/archive/superpowers/specs/2026-05-31-phase-17b-queue-worker-runtime-design.md
git mv docs/superpowers/specs/2026-05-31-real-execution-and-integrations-design.md docs/archive/superpowers/specs/2026-05-31-real-execution-and-integrations-design.md
git mv docs/superpowers/specs/2026-06-01-phase-18-hub-control-plane-and-generic-actions-design.md docs/archive/superpowers/specs/2026-06-01-phase-18-hub-control-plane-and-generic-actions-design.md
git mv docs/superpowers/specs/2026-06-02-batch-03-04-qa-and-local-codex-design.md docs/archive/superpowers/specs/2026-06-02-batch-03-04-qa-and-local-codex-design.md
```

Expected: all moves succeed.

- [ ] **Step 7: Verify active Superpowers folders contain only active docs**

Run:

```bash
find docs/superpowers -maxdepth 3 -type f | sort
```

Expected output contains:

```text
docs/superpowers/README.md
docs/superpowers/plans/2026-06-03-documentation-cleanup-and-current-architecture.md
docs/superpowers/plans/README.md
docs/superpowers/specs/2026-06-03-documentation-cleanup-and-current-architecture-design.md
```

- [ ] **Step 8: Verify archive contains moved files**

Run:

```bash
find docs/archive -maxdepth 4 -type f | sort
```

Expected: output includes `docs/archive/progress/current-phase-1.md`, `docs/archive/plans/enhance_plan.md`, archived brainstorms, archived Superpowers plans, and archived Superpowers specs.

- [ ] **Step 9: Commit**

Run:

```bash
git add docs/archive docs/superpowers docs/brainstorms docs/progress/current.md docs/archive/progress/current-phase-1.md docs/archive/plans/enhance_plan.md
git commit -m "归档历史方案文档" -m "将过时 current 进度、增强方案、brainstorm、历史 Superpowers specs 和 plans 移入 docs/archive，保留审计证据但避免误导当前开发。"
```

Expected: commit succeeds.

---

### Task 5: Final Documentation Validation

**Files:**

- Modify: `debug.md`
- Modify: `summary.md`
- Test: documentation checks only

- [ ] **Step 1: Run whitespace validation**

Run:

```bash
git diff --check HEAD~3..HEAD
```

Expected: no output.

- [ ] **Step 2: Run active stale-phase text check**

Run:

```bash
rg -n "Phase 1: Monorepo Foundation|Phase 11-15 currently|Current Phase" AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
```

Expected: no output and exit code 1, except matches inside the active cleanup spec or plan are acceptable. If the cleanup spec or plan is the only match, record that in `debug.md`.

- [ ] **Step 3: Run safety-boundary text check**

Run:

```bash
rg -n "realNetworkCall.*false|realNetworkCall` stays `false|realNetworkCall` remains `false" AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
```

Expected: output shows active docs still preserve the no-network default boundary.

- [ ] **Step 4: Run status check**

Run:

```bash
git status --short --branch
```

Expected: branch is ahead by the documentation commits and working tree is clean before the final summary commit. If `summary.md` or `debug.md` is modified by this task, the working tree shows only those files.

- [ ] **Step 5: Record validation in `debug.md`**

Append an entry like this, replacing the command results with the actual observed results:

```markdown
### 2026-06-03 - Documentation Cleanup Validation

- Context: final validation after creating current fact-source docs and archiving historical planning files.
- Symptom: active docs previously mixed current architecture with stale phase guidance.
- Scope: `AGENTS.md`, root docs, progress docs, Superpowers docs, and archive paths.
- Investigation: ran whitespace, stale-phase text, safety-boundary text, and git status checks.
- Fix: active docs now point to `struct.md`, `summary.md`, and `debug.md`; historical plans are under `docs/archive/`.
- Verification: `git diff --check HEAD~3..HEAD` passed; stale-phase check only matched active cleanup planning docs or produced no output; safety-boundary check found active `realNetworkCall=false` guidance; `git status --short --branch` showed only expected files.
- Follow-up: none.
```

- [ ] **Step 6: Record cleanup completion in `summary.md`**

Under `## Recently Resolved By Documentation Cleanup`, add:

```markdown
- Active guidance no longer treats `docs/progress/current.md`, `enhance_plan.md`, old brainstorms, or old Superpowers plans/specs as current instructions.
- Historical material is preserved under `docs/archive/` for audit.
```

- [ ] **Step 7: Commit final validation notes**

Run:

```bash
git add summary.md debug.md
git commit -m "记录文档清理验证" -m "记录文档清理后的验证结果、剩余跟进状态和已归档历史材料，确认当前事实源已生效。"
```

Expected: commit succeeds if `summary.md` or `debug.md` changed. If both files are unchanged because the entries were already added, skip this commit and state that no final validation note commit was needed.

- [ ] **Step 8: Final status**

Run:

```bash
git status --short --branch
```

Expected: working tree is clean and branch is ahead of `origin/main` by the new local commits.

---

## Verification Summary

The implementation is documentation-only. Do not run package tests unless a package file, executable script, TypeScript source file, Prisma schema, or generated runtime artifact changes.

Required final checks:

```bash
git diff --check HEAD~3..HEAD
rg -n "Phase 1: Monorepo Foundation|Phase 11-15 currently|Current Phase" AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
rg -n "realNetworkCall.*false|realNetworkCall` stays `false|realNetworkCall` remains `false" AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
git status --short --branch
```

If the stale-phase command only matches the active cleanup spec or plan, treat it as acceptable and record it in `debug.md`.

## Expected Commit Sequence

1. `记录当前架构事实源`
2. `新增架构总结和调试记录`
3. `更新文档治理入口`
4. `归档历史方案文档`
5. `记录文档清理验证`

All commits must use Chinese titles and Chinese commit bodies.
