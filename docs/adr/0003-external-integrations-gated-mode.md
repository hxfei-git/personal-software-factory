# ADR 0003: External Integrations Gated Mode

Date: 2026-05-31

Status: accepted

## Context

GitHub, Coolify, Uptime Kuma, and Plane are currently implemented as mock/dry-run adapters. The next stages may add real provider calls, but those calls can change remote state, consume quota, or leak sensitive information if handled carelessly.

## Decision

External integrations remain dry-run/mock by default. Real provider calls require:

- provider-specific `ENABLE_REAL_* = 1`;
- required provider credentials;
- provider client policy allowing the operation;
- Mission/Approval state allowing the operation;
- redaction of token/password values from logs, artifacts, API responses, Hub UI, PR bodies, and issue bodies;
- explicit response metadata recording `realNetworkCall: true` only after a real network call occurred.

When real mode is enabled but prerequisites are missing, adapters must return clear manual-action or paused guidance instead of throwing unclear errors.

## Consequences

- Provider dry-runs stay useful for local demos without credentials.
- Tests do not require real external services.
- Real integration work can be implemented provider by provider without changing Hub or Orchestrator boundaries.
- Hub must call Orchestrator only; it must not call provider APIs directly.
