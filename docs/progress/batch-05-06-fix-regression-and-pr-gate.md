# Batch 05/06 Fix Regression And PR Gate Progress

Date: 2026-06-03

## Completed

Batch 05/06 connects the next safe local closure step without enabling real provider side effects.

- `fix-real` Orchestrator payloads now include Mission status, Mission attempts, open bugs, per-bug attempts, max bug attempts, Project Passport, project `AGENTS.md`, Mission files, verification commands, regression evidence, branch/current branch, workspace root, target URL, approval records, and approval grants.
- `runGatedRealAutoFixLoop` now emits fix summary, regression coverage, bug status summary artifacts, accepted BugReport outputs, and `bug.status.in_progress`, `bug.status.fixed`, and `bug.status.accepted` MissionEvents when injected Codex and verification runners pass with valid regression evidence.
- Worker Runner now persists updated child BugReports returned by `fix.real`, records child artifacts/events, and conservatively transitions through legal Mission states only: `bugs_found -> fixing -> regression_running -> qa_running -> ready_for_review` when regression passed and no unresolved bugs remain.
- `github-pr` now requires an approved `EXTERNAL_COST_RISK` Approval before enqueue. The queued payload includes Mission integration input, branch/base/source SHA metadata, QA comment preview, approval records, an operation gate summary, and a PR preview.
- Worker Runner now persists GitHub PR preview output as a child integration WorkerRun and `github-pr-preview.md` Artifact. The default path remains manual-action with `realNetworkCall=false`. Fake transport tests can exercise success/failure without real GitHub.
- GitHub adapter tests now cover fake transport success, protected branch refusal, 401/403/422/5xx/thrown error mapping, request summary redaction, and PR body redaction.

## Safety Boundary

This batch does not push, create a real GitHub PR, deploy, call GitHub/Coolify/Uptime Kuma/Plane, invoke an AI provider, or run arbitrary commands. Real provider calls remain impossible in the default Worker Runner path because network gates are false and no live transport is injected.

Bug `accepted` status is only emitted by the gated fix loop after:

1. real mode is explicitly enabled for the local gated path,
2. required approvals are present,
3. verification commands pass command policy,
4. reproducible bugs have meaningful regression evidence, and
5. injected Codex and test runners report success.

If regression evidence is missing, invalid, or command policy fails, the fix loop returns manual-action/needs-human style output and does not mark bugs accepted.

## Files Changed

Key implementation files:

- `apps/orchestrator-api/src/actions.ts`
- `apps/orchestrator-api/src/services.ts`
- `apps/orchestrator-api/tests/api.test.ts`
- `apps/worker-runner/src/handlers.ts`
- `apps/worker-runner/src/runner.ts`
- `apps/worker-runner/tests/runner.test.ts`
- `packages/auto-fix-loop/src/real-loop.ts`
- `packages/auto-fix-loop/tests/auto-fix-loop.test.ts`
- `packages/integrations/tests/integrations.test.ts`

Docs:

- `docs/progress/batch-05-06-brainstorming.md`
- `docs/progress/batch-05-06-fix-regression-and-pr-gate.md`
- `docs/progress.md`
- `docs/api.md`
- `docs/queue-runtime.md`
- `docs/safety.md`
- `docs/integrations.md`
- `docs/hub-web.md`

## Verification

Focused checks passed during implementation:

```bash
pnpm --filter @psf/auto-fix-loop test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/integrations test
```

Broad repository checks also passed:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

`git status --short --branch` shows this batch's tracked edits plus pre-existing root-level untracked zero-byte status files (`bugs_found`, `fixing`, `paused`, `ready_for_review`, `regression_running`) that were not deleted by this batch.

## Remaining Manual Work

- Operators still need to prepare local mirrors, approvals, and injected runners/transports before any real local or provider path can do work.
- A real GitHub PR still requires a later approved task to wire live transport, credentials, operation gates, and branch push semantics.
- Coolify, Uptime Kuma, Plane, n8n, Temporal, LangGraph, and production deployment remain out of scope for this batch.
