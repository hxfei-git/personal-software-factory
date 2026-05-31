# Real Codex Execution Readiness

The system now has a gated Codex runner abstraction, but real Codex execution remains disabled by default. Dry-run remains the normal path, and real mode must be explicitly enabled, approved, pointed at an executable, and limited to local workspace leases.

## Required Preconditions

Real execution should not be enabled until all of these are in place:

1. Queue-backed execution with observable WorkerRun lifecycle.
2. Workspace isolation per Mission or per attempt.
3. Branch protection that rejects `main` and `master` as execution targets.
4. Human Approval gates for risky work and all production-impacting actions.
5. Command allowlist and denylist policy.
6. Bounded timeout handling.
7. Cooperative cancellation and retry behavior.
8. WorkerRun audit records for every attempt.
9. Artifact persistence for prompts, commands, logs, summaries, diffs, and test results.
10. Secret redaction in logs, API responses, Hub UI, and artifacts.
11. Explicit no-push default.
12. No production deploy path in the Codex worker.

## Why Queue Comes First

Real Codex work can take longer than an API request and can fail in ways that need retry, cancellation, and clear audit trails. The queue wrapper WorkerRun gives the system a stable state machine before any real execution is introduced.

## Workspace Isolation

The current gated runner leases a dedicated git worktree under `PSF_WORKSPACE_ROOT`, validates the target branch, and refuses `main` or `master`. It also refuses existing target agent branches or workspace paths instead of force-resetting or overwriting Mission work. It supports local repositories or local mirrors for tests and operator-prepared runs. Remote clone/update is still a manual-action boundary.

## Command Policy

The runner receives a `CodexExecutionRequest`, validates it with Zod, checks each requested command through `@psf/security`, and rejects dangerous commands before spawning the configured executable. It must not accept arbitrary shell commands from Hub or API users.

## Approval Gates

Approval should be required before real Codex execution when a Mission is high-risk, touches secrets, performs destructive operations, changes databases, or could create external cost. Approval still must not automatically imply push, PR creation, deployment, or provider calls.

## Future Integration Shape

A later queued integration can consume the same request shape, call the gated runner, persist WorkerRun/MissionEvent records, and stop before any push or production action unless a later approved phase adds those capabilities.

## Current Gates

Real mode returns `blocked` or `manual_action` unless all of these are true:

1. `ENABLE_REAL_CODEX=1`.
2. `approvalIds` satisfy `real_codex_execution` approval policy.
3. `CODEX_EXECUTABLE` is an explicit local executable path.
4. `PSF_WORKSPACE_ROOT` or request `workspaceRoot` is available and passes path guards.
5. The repository is a local git repository with an `origin` remote.
6. The execution branch is under `agent/` and is not `main` or `master`.
7. `CODEX_SANDBOX` is `workspace-write` or `read-only`, and `CODEX_APPROVAL_MODE` is `on-request`.
8. Requested commands pass the shared command policy before workspace leasing.
9. `timeoutMs` does not exceed `PSF_REAL_CODEX_MAX_RUNTIME_MS`.

The runner persists redacted prompt, command, stdout, stderr, dev summary, diff summary, and local commit summary artifacts through `@psf/artifact-store`. Secret-like environment variable values are included as extra redaction inputs. Timed-out executable processes are escalated from `SIGTERM` to `SIGKILL` with a hard fallback. It does not push, deploy, create PRs, or call external APIs.
