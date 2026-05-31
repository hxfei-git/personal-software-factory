# Next Steps

## Recommended Next Batch

1. Run Task 8 verification for Phase 16A/16B/17A: focused package tests, API tests, Hub tests, full test/typecheck/build gates, and diff checks.
2. Exercise the local demo manually from README on a clean `.env`.
3. Add any missing operator screenshots or report examples only if they clarify the dry-run workflow without committing runtime noise.

## Before Real Codex

- Add reviewed command allowlists and workspace path guards.
- Add tests for secret redaction in worker prompts, stdout, stderr, and artifacts.
- Add event auditing for every Mission state change.
- Add approval gates for destructive, costly, external, and production actions.
- Prove branch/worktree isolation on a disposable fixture repository.

## Before Real Integrations

- Define provider client contracts with idempotency keys and retry/backoff behavior.
- Keep `realNetworkCall` audited per response.
- Add provider-specific redaction tests.
- Add rollback or manual recovery guidance.
- Require explicit user approval before enabling GitHub, Coolify, Uptime Kuma, or Plane network calls.

## Before Temporal/LangGraph

Stay with the explicit TypeScript state machine until there is evidence of long-running workflow recovery problems, complex graph branching, or multi-project scheduling pressure that the current stack cannot handle cleanly.
