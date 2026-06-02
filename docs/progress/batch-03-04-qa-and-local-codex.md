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
- The fixture commits only inside the leased worktree and asserts the mirror `main` HEAD, `README.md`, and checked-out branch remain unchanged.
- The proof records that the runner passes `codex exec` arguments with safe sandbox and approval settings while keeping push and external provider calls disabled through `realNetworkCall: false` and `pushed: false` metadata.
- The test verifies `stdout`, `stderr`, `dev-summary`, `diff-summary`, and `local-commit-summary` artifacts are generated and that raw token, password, secret, and API key values do not leak into result JSON or artifact files.
- Existing gate coverage continues to return blocked/manual-action for missing enablement, missing executable, unsafe sandbox or approval settings, mirrors outside the workspace, protected branches, existing branches/worktrees, and unsafe commands.
- Tests use a local fake executable plus injected spawn only; no real `codex exec`, push, provider API, or network clone is performed.

## Verification

```bash
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/worker-runner typecheck
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/codex-worker typecheck
```

The requested `pnpm --filter @psf/worker-runner test -- --runInBand` command is not accepted by this package's Vitest CLI because `--runInBand` is a Jest option.
