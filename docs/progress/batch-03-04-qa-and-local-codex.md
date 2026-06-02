# Batch 03/04 QA And Local Codex Progress

Batch 03/04 proves local deterministic QA and local Codex execution wiring through queued Orchestrator and Worker Runner paths. It does not push, create PRs, deploy, call GitHub/Coolify/Uptime Kuma/Plane, call a real AI provider, or spawn real Codex by default.

## Completed Surfaces

- Orchestrator `qa-playwright` queued payloads now include Project Passport, QA charter, resolved `targetUrl`, Mission files, and e2e command metadata with `executionPolicy: "review-only"`.
- Orchestrator `codex-real` queued payloads now require a local repository mirror from request or local env fallback, reject GitHub HTTPS/SSH passport URLs before enqueue, and include Passport, Mission files, project `AGENTS.md`, safe commands, local `repoUrl`, default branch, workspace root, approval IDs, and an `agent/*` branch.
- Deterministic QA now models controlled scenarios and evidence. Missing or invalid `targetUrl`, unavailable real Playwright gates, and unverified selectors return blocked/manual-action outcomes instead of pretending the run passed.
- QA evidence includes `scenarioId` plus path-only `screenshotPath`, `tracePath`, and `logPath` when an injected or gated real runner provides them. Bug reports retain reproduction steps, expected result, actual result, and redacted evidence.
- Worker Runner persists queued `qa.playwright` child WorkerRun, QARun, Artifact, BugReport, and MissionEvent resources beneath the queue wrapper WorkerRun, then records conservative wrapper output and `mission.action_result` summaries.
- Codex Worker fixture proof validates local mirror/worktree behavior with an injected spawn path: the worktree uses an `agent/*` branch, mirror `main` and remote refs remain unchanged, push metadata stays false, and artifacts are redacted.
- Worker Runner `codex.real` now passes queued context to an injected Codex runner only after local repo and branch preflight. Without an injected runner it returns `manual_action`, so Task 8 does not spawn real Codex.
- Hub Mission detail and resource views expose QA evidence paths and child resource references when present. Display redaction prevents secret-like values from rendering in evidence summaries or resource JSON.

## Added Or Modified Files

Implementation files changed during Batch 03/04:

- `apps/orchestrator-api/src/actions.ts`
- `apps/orchestrator-api/src/services.ts`
- `apps/orchestrator-api/tests/api.test.ts`
- `workers/qa-worker/src/deterministic.ts`
- `workers/qa-worker/src/index.ts`
- `workers/qa-worker/tests/qa-worker.test.ts`
- `workers/codex-worker/src/execution-request.ts`
- `workers/codex-worker/tests/codex-worker.test.ts`
- `apps/worker-runner/src/handlers.ts`
- `apps/worker-runner/src/runner.ts`
- `apps/worker-runner/tests/runner.test.ts`
- `apps/hub/src/App.tsx`
- `apps/hub/src/displaySafety.ts`
- `apps/hub/src/views/resources.tsx`
- `apps/hub/tests/hub.test.tsx`
- `docs/progress.md`
- `docs/progress/batch-03-04-qa-and-local-codex.md`

Task 10 documentation also updates the QA, Playwright, API, Codex readiness, Safety, and README descriptions so the user-facing docs match the implemented safe defaults.

## Safety Boundaries

- Default responses must keep `realNetworkCall: false`; no external integration provider is contacted by these Batch 03/04 paths.
- `qa.playwright` requires a target URL and either `ENABLE_REAL_PLAYWRIGHT=1` for the built-in real browser path or an injected runner for tests/fixtures. Missing/invalid context is blocked/manual-action.
- `codex.real` requires a local mirror under `PSF_WORKSPACE_ROOT/mirrors`, an `agent/*` branch, stored approvals, safe commands, workspace guards, and an injected runner in Worker Runner Task 8. Real Codex spawn remains a later gated step.
- API and Hub payloads must redact token, password, secret, API key, authorization, credential, session, JWT, cookie, and bearer-like values.
- No push, PR creation, deployment, monitor creation, Plane sync, production mutation, remote clone/update, or real AI provider call is part of this batch.

## Manual Preparation Still Required

- Operators must prepare any local repository mirror themselves under `PSF_WORKSPACE_ROOT/mirrors`; remote clone/update remains outside this automated path.
- Operators must create/approve Mission approvals before gated real-action contracts are accepted.
- Operators must explicitly wire Worker Runner, local workspace root, route gates, worker gates, and injected runners/transports before future real execution.
- Real external provider calls and real Codex execution require later explicit implementation and approval; fixture and injected-runner tests are not evidence of live provider execution.

## Verification

Batch implementation used focused package checks for the changed surfaces:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/qa-worker typecheck
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/codex-worker typecheck
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/worker-runner typecheck
pnpm --filter @psf/hub test
pnpm --filter @psf/hub typecheck
```

The requested `pnpm --filter @psf/worker-runner test -- --runInBand` command is not accepted by this package's Vitest CLI because `--runInBand` is a Jest option.

Task 10 documentation verification:

```bash
git diff --check
```
