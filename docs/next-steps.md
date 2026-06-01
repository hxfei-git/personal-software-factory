# Next Steps

## Recommended Next Batch

1. Finish post-real-mode gated verification with focused package/API/Hub checks first, then broader typecheck/test/build gates only where the changed surface requires them.
2. Exercise the local demo manually from README on a clean `.env`, confirming real-mode gates stay explicit and dry-run integration responses keep `realNetworkCall: false`.
3. Keep the BullMQ-backed queue runtime and explicit TypeScript Mission state machine as the baseline while collecting operational evidence.
4. Add any missing operator screenshots or report examples only if they clarify the gated real-mode or dry-run workflow without committing runtime noise.

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

Stay with BullMQ plus the explicit TypeScript state machine until ADR 0005 evidence exists across recovery failures, compensation needs, durable timers, branching graph complexity, or multi-project pressure.

If that evidence appears, use `docs/temporal-langgraph-migration.md` as the migration sketch: wrap current job handlers as Temporal activities or LangGraph nodes while preserving Orchestrator, WorkerRun, and MissionEvent contracts.
