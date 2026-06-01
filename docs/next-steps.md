# Next Steps

## Recommended Next Batch

1. After Phase 18, focus the next implementation batch on deterministic QA for `ai-novelist` or carefully gated real local Codex execution.
2. Do not expand external providers next; keep GitHub, Coolify, Uptime Kuma, Plane, and other provider network calls disabled until local QA/Codex control-plane behavior is proven.
3. Exercise the Hub control plane manually from README on a clean `.env`, confirming Mission creation, resource pages, Approval decisions, and dry-run action preflight keep real-mode gates explicit and integration responses keep `realNetworkCall: false`.
4. Keep the BullMQ-backed queue runtime and explicit TypeScript Mission state machine as the baseline while collecting operational evidence.

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
