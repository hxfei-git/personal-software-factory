# Real Codex Execution Readiness

Phase 17B does not implement real Codex execution. Codex remains dry-run artifact generation only.

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

A future worker should lease a dedicated workspace, validate the target branch, and refuse `main` or `master`. Workspace cleanup must be explicit and must not delete user data or unrelated repositories.

## Command Policy

The future worker must generate or receive an `ExecutionRequest`, validate it against a command policy, and reject dangerous commands before execution. It must not accept arbitrary shell commands from Hub or API users.

## Approval Gates

Approval should be required before real Codex execution when a Mission is high-risk, touches secrets, performs destructive operations, changes databases, or could create external cost. Approval still must not automatically imply push, PR creation, deployment, or provider calls.

## Future Integration Shape

A later Codex worker can consume a queued job, lease a workspace, validate the command policy, run Codex with a timeout, persist logs and summaries as artifacts, update WorkerRun state, and stop before any push or production action unless a later approved phase adds those capabilities.
