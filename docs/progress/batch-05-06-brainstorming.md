# Batch 05/06 Brainstorming - Fix Regression And PR Gate

Date: 2026-06-03

## Scope

This historical batch note implemented the next local-first control-plane step from the archived reference `../archive/plans/enhance_plan.md`. That archived reference is audit context only, not active current instruction:

- Batch 5: Fix Loop + Regression enforcement.
- Batch 6: GitHub PR Gate.

It does not implement Coolify, Uptime Kuma, Plane, n8n, Temporal, LangGraph, production deploys, or real external provider calls.

## Current Fix Loop Gaps

The repository already has `packages/auto-fix-loop` with gated real fix contracts, attempt caps, command policy checks, regression coverage validation, and redaction. Worker Runner already persists child WorkerRuns/artifacts/events under a queue wrapper WorkerRun.

The gaps are:

- Orchestrator `fix-real` currently queues an almost empty context. It needs the same project-level payload quality as `qa-playwright` and `codex-real`.
- Bug lifecycle is partially modeled in schema/API, but the worker path does not standardize `open -> in_progress -> fixed -> accepted/wont_fix` events.
- Regression coverage is validated inside `auto-fix-loop`, but persisted output does not clearly summarize bug status changes, test results, and regression evidence.
- WorkerRunner transitions need explicit conservative handling for `fix.real`: `bugs_found -> fixing`, `fixing -> regression_running`, successful regression to `ready_for_review` when no open bugs remain, and max-attempt/manual-action paths to `paused` when legal.

## Current Regression Enforcement Gaps

Existing `runGatedRealAutoFixLoop` requires meaningful regression coverage for reproducible bugs, and tests already cover missing/invalid generated regression specs. The missing pieces are mostly integration-level:

- `fix-real` payload must include open bugs, per-bug attempts, max attempts, verification commands, regression evidence, branch/workspace context, and approvals.
- Bug acceptance must be tied to regression evidence. A Codex fix without regression pass must not mark a bug accepted.
- Regression summary artifacts should make the evidence requirement visible in Hub/API without requiring operators to inspect raw worker logs.
- Secret-like user content in bug titles/evidence/regression specs must stay redacted.

## Current GitHub PR Gate Gaps

`packages/integrations` already has GitHub dry-run PR body generation and a gated real adapter with injected transport, protected branch checks, provider error mapping, and redaction tests.

The gaps are:

- Orchestrator `github-pr` currently has no rich Mission context, PR preview, QA/fix/regression evidence summary, approval summary, or operation gate summary.
- WorkerRunner currently calls `runGitHubReal` with `env: {}` and all operation gates false, which is safe but too opaque for users. It should preserve default manual-action behavior while exposing PR preview and missing gates.
- Successful fake/approved adapter results need to be persisted as a child integration WorkerRun/artifact/event so Hub can show PR preview or PR URL.
- Protected branch refusal, request summary redaction, PR body redaction, and provider error mapping should remain covered by tests.

## Reusable Foundations

The smallest safe implementation can reuse:

- `packages/auto-fix-loop` for regression coverage gate, attempt gate, command policy, redaction, and fix artifacts.
- `packages/integrations` GitHub dry-run body builder and gated real adapter.
- `apps/orchestrator-api/src/services.ts` gated real action context pattern from `qa-playwright` and `codex-real`.
- `apps/worker-runner/src/runner.ts` queue wrapper WorkerRun persistence, child resource persistence, and `canTransition`-guarded automatic transitions.
- Existing Mission schema fields such as `current_attempt`, `max_attempts`, `branch_name`, `workspace_path`, and `pr_url`.
- Existing Hub Mission detail resource rendering, external links, and real-mode readiness display.

## Required Safety Blocks

Defaults must continue to block:

- Git push.
- GitHub PR creation.
- GitHub network calls.
- Deployments.
- External provider APIs.
- AI provider calls.
- Arbitrary shell commands.
- Secret persistence in logs, artifacts, Hub UI, API responses, PR bodies, or Issue bodies.

`github.pr` should remain manual-action unless env, approval, route gate, operation gate, and injected transport are all satisfied. In this batch, normal WorkerRunner paths still do not inject a live transport.

## Minimal Implementation Plan

1. Orchestrator context:
   - Add `fix-real` context with mission status, attempts, open bugs, per-bug attempts, passport, project AGENTS, mission files, verification commands, regression evidence, branch/workspace, and approvals.
   - Add `github-pr` context with Mission integration input, branch/base/source metadata, QA comment preview, approval records, operation gate summary, and PR preview.

2. Auto-fix loop:
   - Extend result artifacts with fix summary, regression coverage summary, test results summary, bug status change summary, and explicit `realNetworkCall=false` / `pushed=false`.
   - Emit bug lifecycle events for in-progress/fixed/accepted/manual-action decisions without updating DB directly from the package.
   - Keep regression evidence mandatory before accepted.

3. Worker Runner:
   - Persist child resources from `fix.real` and `github.pr`.
   - For `fix.real`, apply conservative transition paths only through `mission-core canTransition`.
   - For GitHub, persist PR preview artifact and, only if a fake/approved result returns a PR URL, include it in child output/events. Do not call network by default.

4. GitHub integration:
   - Keep adapter transport-injected.
   - Add/verify PR preview body redaction and request summary safety.
   - Map 401/403/422/5xx/thrown errors into safe decisions.

5. Hub:
   - Prefer existing Mission detail resources.
   - Only add minimal labels/visibility for PR readiness, PR preview artifact, missing gates, and fix/regression evidence if current rendering is insufficient.

6. Tests:
   - Add focused tests for `auto-fix-loop`, `integrations`, `orchestrator-api`, and `worker-runner`.
   - Only touch Hub tests if UI code changes.
