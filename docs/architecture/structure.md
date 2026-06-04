# Current Architecture Structure

## Status

This file is the current architecture fact source for Personal Software Factory.
It describes the implemented repository state after the gated real execution work, Batch 03/04 local QA and Codex proof surfaces, and Batch 05/06 fix/regression plus GitHub PR gate preview.

ADRs remain the durable decision history. Low-value historical phase plans are removed once their useful facts are represented in current docs, ADRs, `summary.md`, or `docs/debug/debug.md`.

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

1. `AGENTS.md`
2. `README.md`
3. `summary.md`
4. `docs/architecture/structure.md`
5. `docs/debug/debug.md`
6. `docs/adr/**` for architecture decision history
7. `docs/status/progress.md`
8. `docs/api/orchestrator-api.md`
9. `docs/security/safety.md`
10. `docs/runtime/queue-runtime.md`
11. provider-specific integration docs under `docs/integrations/` when touching that provider
