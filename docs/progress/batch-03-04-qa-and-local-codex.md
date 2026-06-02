# Batch 03/04 QA And Local Codex Progress

## Task 5 Worker Runner QA Integration

- `qa.playwright` Worker Runner jobs now pass queued Orchestrator payload context through to deterministic QA when provided: `passport`, `qaCharter`, `targetUrl`, `missionFiles`, and `e2eCommandMetadata`.
- Deterministic QA results continue to be persisted beneath the queue wrapper WorkerRun as child WorkerRun, QARun, Artifact, BugReport, and MissionEvent records.
- Wrapper WorkerRun output records child IDs, summary, and recommended next action for the persisted deterministic QA resources.
- QA jobs only use existing guarded Mission transitions: failed QA with open bugs advances from `qa_running` to `bugs_found` when legal, passed QA without open bugs advances to `ready_for_review` when legal, and illegal transitions are not forced.
- `qa.playwright` blocked/manual-action outcomes are recorded in wrapper output and `mission.action_result`, but do not auto-transition Missions out of `qa_running`.
- Tests use injected deterministic QA runners only; no real browser or real network access is required.

## Task 6 Codex Worker Fixture Proof

- Added a focused fixture proof for gated local Codex execution using an operator-prepared local mirror under `PSF_WORKSPACE_ROOT/mirrors`, an `agent/*` worktree branch, and an injected mock spawn path.
- The fixture uses an independent local bare `origin`, commits only inside the leased worktree, and asserts the mirror `main` HEAD, `README.md`, checked-out branch, remote `main`, and remote refs remain unchanged.
- The proof records that the runner passes `codex exec` arguments with safe sandbox and approval settings while keeping push and external provider calls disabled through `realNetworkCall: false` and `pushed: false` metadata.
- The test verifies `stdout`, `stderr`, `dev-summary`, `diff-summary`, and `local-commit-summary` artifacts are generated and that raw token, password, secret, and API key values do not leak into result JSON or artifact files.
- Added runner-level blocked/manual-action coverage for missing approval and missing `CODEX_EXECUTABLE`; existing focused tests cover unsafe sandbox or approval settings, mirror path refusal, protected branch refusal, existing branch/worktree refusal, and unsafe command preflight.
- Artifact-writing Codex runner tests use a temporary cwd and clean it after assertions, so they do not leave package-local `workers/codex-worker/artifacts/` output.
- Tests use local fake executables plus injected spawn where needed; no real `codex exec`, push, provider API, or network clone is performed.

## Task 7 Orchestrator Codex Payload Context

- `codex-real` queued preflight now requires an explicitly provided local repository mirror from the request body or `PSF_LOCAL_REPO_<project>` / uppercase env fallback; GitHub HTTPS/SSH passport URLs are blocked before enqueue.
- Queued Codex payloads include Project Passport, mission files, AGENTS.md context, safe test/build-oriented command strings, local `repoUrl`, `defaultBranch`, `agent/*` branch name, workspace root, and approval record/grant IDs.
- Branch names for real Codex are rejected when they target `main`, `master`, or anything outside `agent/`.
- API responses and queued payload assertions cover secret-value redaction while preserving `realNetworkCall: false` and avoiding any real Codex execution, clone, push, or provider call.

## Task 8 Worker Runner Codex Integration

- `codex.real` Worker Runner jobs now pass the queued Codex context through to an injected Codex runner input after Worker Runner preflight: Project Passport, mission files, AGENTS.md context, local repo/default branch, `agent/*` branch, workspace root, commands, approval grant IDs, and approval record IDs.
- Codex runner results are adapted without copying Codex Worker business logic: child WorkerRun, Artifact, and MissionEvent resources are persisted beneath the queue wrapper, and wrapper output plus `mission.action_result` record child IDs, safe summary, recommended next action, status, and reason.
- Worker Runner blocks missing or remote `repoUrl` values and unsafe `branchName` values before calling an injected runner; missing branch names fall back only to `agent/<missionId>`.
- Worker Runner sanitizes handler results before persistence so raw token, password, API key, secret, authorization, session, and credential values do not leak through wrapper output, child resources, artifacts, or events.
- Blocked and manual-action Codex outcomes are recorded as safe wrapper/action-result summaries and do not advance Missions to ready/released success states.
- The default `codex.real` handler returns manual action unless a Codex runner is explicitly injected for this phase, so it cannot spawn a real Codex executable by default.
- Child MissionEvent persistence failures are not swallowed; the wrapper is marked failed and the error is visible for audit integrity.
- Tests use injected Codex runners only; no real Codex executable, clone, push, deploy, release transition, or network access is performed.

## Verification

```bash
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/worker-runner typecheck
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/codex-worker typecheck
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```

The requested `pnpm --filter @psf/worker-runner test -- --runInBand` command is not accepted by this package's Vitest CLI because `--runInBand` is a Jest option.
