# Batch 03/04 QA And Local Codex Progress

## Task 5 Worker Runner QA Integration

- `qa.playwright` Worker Runner jobs now pass queued Orchestrator payload context through to deterministic QA when provided: `passport`, `qaCharter`, `targetUrl`, `missionFiles`, and `e2eCommandMetadata`.
- Deterministic QA results continue to be persisted beneath the queue wrapper WorkerRun as child WorkerRun, QARun, Artifact, BugReport, and MissionEvent records.
- Wrapper WorkerRun output records child IDs, summary, and recommended next action for the persisted deterministic QA resources.
- QA jobs only use existing guarded Mission transitions: failed QA with open bugs advances from `qa_running` to `bugs_found` when legal, passed QA without open bugs advances to `ready_for_review` when legal, and illegal transitions are not forced.
- `qa.playwright` blocked/manual-action outcomes are recorded in wrapper output and `mission.action_result`, but do not auto-transition Missions out of `qa_running`.
- Tests use injected deterministic QA runners only; no real browser or real network access is required.

## Verification

```bash
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/worker-runner typecheck
```

The requested `pnpm --filter @psf/worker-runner test -- --runInBand` command is not accepted by this package's Vitest CLI because `--runInBand` is a Jest option.
