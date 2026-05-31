# ADR 0002: Real Execution Safety Boundary

Date: 2026-05-31

Status: accepted

## Context

The system is moving from dry-run/demo MVP toward real execution. Real Codex, shell commands, repository writes, browser automation, pushes, and deployments can modify code, consume external resources, or expose secrets.

## Decision

Real execution is allowed only through explicit gated modes. A real action must pass:

- explicit `ENABLE_REAL_*` environment gate;
- required credential presence when applicable;
- Approval policy check for risky actions;
- Mission state check;
- whitelisted job/action type;
- command allowlist/denylist policy;
- workspace path guard;
- protected branch guard;
- secret redaction before persistence or display;
- WorkerRun and MissionEvent audit logging.

If any check fails, the system must return blocked, paused, or manual-action output. It must not silently execute real work.

## Consequences

- Dry-run remains the default and safest path.
- Real Codex execution cannot be enabled by UI alone.
- Approval does not imply push, PR creation, deployment, or production action unless that specific gate is also enabled.
- Every new real worker must include real-disabled tests and redaction tests.
