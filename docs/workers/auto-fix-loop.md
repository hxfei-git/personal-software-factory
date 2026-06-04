# Auto Fix Loop

The Auto Fix Loop keeps dry-run behavior as the default. It turns QA bugs into fix Mission artifacts and reuses the existing Codex Worker dry-run generator to produce reviewable Codex prompt and command artifacts. Rendered dry-run artifacts are redacted before they are returned.

A gated real mode now exists as an orchestration surface, but it is disabled by default and does not construct or execute a real Codex process, shell command, Git push, deploy, or external API call. Callers must inject mock or controlled runners for any execution-like behavior in this phase.

## Dry-Run Flow

Passing QA:

```text
qa_running -> ready_for_review
```

Bugs found:

```text
qa_running -> bugs_found -> fixing -> regression_running -> qa_running
```

The local CLI records the dry-run artifacts even when the current metadata status is not yet wired to the full state machine. API-level state transitions remain governed by `@psf/mission-core`.

## Gated Real Mode

`runGatedRealAutoFixLoop(input)` is the real-mode entry point. It is intended for future real execution, but in the current phase it only proceeds when all gates pass and injected runners are provided.

Required gates before a fix-mode Codex runner can be called:

- `enableRealMode: true`; omitted or false returns `blocked`.
- `real_codex_execution` approval through `@psf/security` approval policy.
- Verification commands accepted by `@psf/security` command policy with network and Git push disabled.
- Regression coverage for reproducible bugs, with meaningful test structure and a reference to the bug or reproduction signal.
- At least one verification command before a fix can be marked complete.
- Injected `codexRunner` and `testRunner`; otherwise the result is a safe `manual_action` plan.

The real loop passes a fix-mode request to the injected Codex runner only after gates pass. It still records `realNetworkCall: false`, `pushed: false`, and external-service-disabled metadata. Outputs, errors, runner summaries, and event payloads are redacted before returning.

## Regression-First Policy

A reproducible bug cannot be claimed fixed unless one of these is present and validates as meaningful test content tied to the reported bug or reproduction:

- Existing regression spec path and content.
- Generated regression spec path and content with a valid generated-spec validation result.

If regression coverage is missing, the loop returns `needs_human` with an intended pause when the state machine permits it. It does not call Codex and does not run verification. For multi-bug batches, every active reproducible bug must be covered; skipped output includes redacted `missingCoverage` entries with the bug id and title.

## Verification Commands

Regression, unit, and e2e commands are policy-checked before any runner is invoked. Allowed commands are limited by `@psf/security` command policy, with shell operators, dangerous tokens, network-capable commands, absolute paths, path traversal, and Git push blocked unless a later phase explicitly adds approved behavior.

Without an injected test runner, policy-passing commands are returned as a manual action plan. The current phase must not spawn shell commands from the auto-fix loop itself.

## Outputs

Dry-run outputs:

- `fix-mission.md`
- `fix-acceptance.md`
- `fix-codex-prompt.md`
- `fix-codex-command.sh`
- `WorkerRun` with `worker_type=auto_fix`
- `Artifact` and `MissionEvent` records

Gated real-mode outputs:

- `WorkerRun` with `worker_type=auto_fix` and `mode=real`
- Gate results for approval, command policy, and regression coverage
- Redacted injected Codex runner result when a runner is provided and gates pass
- Redacted injected test runner results when verification is run
- Artifact-like regression coverage metadata after a fixed decision
- `recommendedNextAction` for blocked, manual-action, needs-human, failed, and fixed outcomes

## Limits

- Default max Mission fix attempts: 3.
- Default max per-bug attempts: 2.
- Mission attempts greater than or equal to 3 return `paused` by default.
- Per-bug attempts greater than or equal to 2 return `paused` by default.
- Exceeding limits never invokes Codex or test runners and moves the intended next status to `paused` when the state machine permits it.

## Safety Boundary

The dry-run loop never executes Codex, pushes branches, creates PRs, deploys, calls external APIs, or modifies a real project checkout. `fix-codex-command.sh` is a non-executable review artifact.

The gated real loop keeps the same phase boundary unless callers inject controlled runners. It does not perform real shell execution itself, and integration responses must keep `realNetworkCall` false until a later approved task intentionally implements real external calls.
