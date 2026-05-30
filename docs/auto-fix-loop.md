# Auto Fix Loop

The Auto Fix Loop MVP is dry-run only. It turns QA bugs into fix Mission artifacts and reuses the existing Codex Worker dry-run generator to produce reviewable Codex prompt and command artifacts.

## Flow

Passing QA:

```text
qa_running -> ready_for_review
```

Bugs found:

```text
qa_running -> bugs_found -> fixing -> regression_running -> qa_running
```

The local CLI records the dry-run artifacts even when the current metadata status is not yet wired to the full state machine. API-level state transitions remain governed by `@psf/mission-core`.

## Outputs

- `fix-mission.md`
- `fix-acceptance.md`
- `fix-codex-prompt.md`
- `fix-codex-command.sh`
- `WorkerRun` with `worker_type=auto_fix`
- `Artifact` and `MissionEvent` records

## Limits

- Default max Mission fix attempts: 3.
- Default max per-bug attempts: 2.
- Exceeding limits moves the intended next status to `paused` when the state machine permits it.

## Safety Boundary

The loop never executes Codex, pushes branches, creates PRs, deploys, calls external APIs, or modifies a real project checkout. `fix-codex-command.sh` is a non-executable review artifact.
