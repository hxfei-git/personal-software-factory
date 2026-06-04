# Control Plane Doc Drift And Readiness Design

## Context

`docs/vision/plan.md` remains a long-term product vision and historical planning reference. Current implementation state lives in `summary.md`, `docs/architecture/structure.md`, `docs/status/progress.md`, `docs/debug/debug.md`, `README.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, and `docs/runtime/queue-runtime.md`.

The current system already has a TypeScript monorepo, Orchestrator API, Hub Web, Mission state machine, Prisma-backed storage, optional BullMQ queue runtime, Worker Runner, deterministic planner, dry-run workers, gated real-mode contracts, GitHub PR preview, fix/regression enforcement, and default-safe integration adapters.

The remaining gap is not a missing grand architecture. The risk is state pollution: old phase notes, old paths, and long-term vision language can still be mistaken for current implementation facts. The next work should first make the control plane and documentation precise, then prove the shortest local real loop for `ai-novelist`.

## Goal

Run the next workstream in this order:

1. Control-plane and documentation convergence.
2. `ai-novelist` shortest local real-loop proof.
3. External provider real-network integration only after the local loop is proven and explicitly approved.

This design does not enable real Codex execution, Playwright browser execution, provider network calls, push, PR creation, deployment, monitor creation, or Plane sync.

## Non-Goals

- Do not wire real GitHub, Coolify, Uptime Kuma, or Plane network calls.
- Do not enable default real Codex execution.
- Do not enable default real Playwright or Playwright MCP execution.
- Do not introduce Temporal or LangGraph.
- Do not preserve low-value old phase progress material if its useful facts are already represented in current docs or ADRs.

## Current Architecture Versus Vision

| Area | Current State | Vision Gap | Next Treatment |
|---|---|---|---|
| Monorepo | Implemented with `apps/orchestrator-api`, `apps/hub`, `apps/worker-runner`, `workers/*`, and focused `packages/*`. | Vision used older names such as `apps/api`, `packages/core`, and `packages/schemas`. | Treat vision paths as historical. Keep current package names as facts. |
| Mission state | Implemented through `@psf/mission-core` and auditable MissionEvents. | Full production release path exists conceptually but not as a live autonomous workflow. | Keep explicit state machine. Improve blocker visibility before real work. |
| Hub | Implemented as React/Vite operator console backed by Orchestrator API. | Vision expected broader complete workflow visibility. | Improve readiness, manual-action, evidence, and blocker UX before real execution. |
| Queue runtime | Implemented with inline and BullMQ modes plus queue wrapper WorkerRuns. | Long-running durable workflow vision mentions Temporal later. | Keep BullMQ baseline per ADR 0005. |
| Codex worker | Dry-run and gated real-runner abstractions exist. Default Worker Runner returns manual-action without injected runner. | Vision expects autonomous branch/worktree/Codex/test/commit loop. | First improve readiness output, then prove local gated Codex on a fixture or verified `ai-novelist` mirror. |
| QA worker | Dry-run evidence and deterministic Playwright runner abstraction exist. Missing target URL or unverified selectors block safely. | Vision expects deterministic QA and AI exploratory QA against staging. | Validate `ai-novelist` target URL, commands, selectors, then run deterministic QA gated path. |
| Auto-fix loop | Dry-run and gated real fix contract exist with regression evidence enforcement. | Vision expects automatic bug fix and regression loop. | Keep blocked/manual-action until local QA and Codex proof are reliable. |
| GitHub PR | Gated PR contract and preview artifact exist. No push or PR creation by default. | Vision expects branch push, PR creation, comments, and webhook sync. | Do not enable until local loop is proven and explicit provider approval exists. |
| Coolify | Dry-run/status and gated adapter contract exist. No deployment by default. | Vision expects staging or preview deployment. | Defer real deploy. Prefer local target URL proof first. |
| Uptime Kuma | Dry-run/status and gated adapter contract exist. No monitor creation or polling by default. | Vision expects monitor status in Hub. | Defer network monitor work. |
| Plane | Dry-run/status and gated adapter contract exist. No issue sync by default. | Vision expects Mission/Bug issue sync. | Defer network issue sync. |
| Documentation | Current fact sources are consolidated, but old phase and old path wording can re-enter. | Vision contains historical phase plan and old doc paths. | Treat doc-drift cleanup as Batch B1. |

## Batch Plan

### Batch B1: Documentation Difference Audit And Cleanup

Create a current architecture versus `docs/vision/plan.md` difference matrix in active docs. Clean old progress and old phase contamination aggressively:

- Update `summary.md` with a compact vision-difference summary and document-map changes.
- Update `docs/status/progress.md` and `docs/status/next-steps.md` to state the chosen order: B before A, C deferred.
- Update `docs/debug/debug.md` with the audit, stale wording findings, cleanup decisions, and verification results.
- Remove or rewrite old progress, old phase, old path, and low-value completed Superpowers documents when their useful facts are already in current docs or ADRs.
- Keep `docs/vision/plan.md` as a long-term reference only.

Verification should search for stale current-state pointers such as `docs/progress/current.md`, `phase-XX-summary`, old root `plan.md` guidance, `apps/api`, `packages/core`, and `packages/schemas`, then classify remaining matches as historical or current.

### Batch B2: Control-Plane Readiness Convergence

Make blocked and manual-action states operationally useful across API, Hub, Worker Runner, and integrations:

- Standardize blocker fields for route gate, worker gate, provider gate, approval, env, local mirror, target URL, command policy, injected runner, and injected transport.
- Ensure every blocked/manual-action response includes a concrete recommended next action.
- Keep default response flags explicit: `realNetworkCall: false`, `realExternalCall: false`, `realPush: false`, and `realDeploy: false`.
- Improve Hub Mission Detail and integration readiness displays so the operator can see what is missing without reading logs.

### Batch B3: Contract And Safety Test Reinforcement

Add focused tests where drift would be expensive:

- Mission summary readiness and policy failures.
- Approval gates for gated actions.
- Queue wrapper WorkerRun semantics.
- GitHub PR preview artifact behavior.
- Fix/regression evidence enforcement.
- Secret redaction in API responses, worker outputs, artifacts, and Hub-visible state.

Prefer focused contract tests over large refactors. If duplicate schemas remain, either justify the duplication or cover the boundary with tests.

### Batch A1: `ai-novelist` Shortest Local Real-Loop Proof

Only after B1-B3:

- Prepare or verify an operator-controlled local `ai-novelist` checkout or mirror.
- Verify passport install, dev, build, test, lint, and E2E commands against the real project.
- Verify local URL and deterministic selectors.
- Run deterministic Playwright QA gated path against a real local target.
- Prove local gated Codex runner behavior with no push, no PR, no deploy, and no provider network call.

## Error Handling

- If documentation cleanup finds old files with unique audit value, preserve them only if they are clearly marked historical and linked from the document map.
- If a readiness blocker cannot be classified, return manual-action output rather than guessing.
- If `ai-novelist` commands, selectors, or local URLs cannot be verified, stop A1 with a manual-action report instead of fabricating readiness.
- If any response would expose a token, password, credential, authorization header, session value, JWT, bearer value, or provider secret, redact it before returning or persisting.

## Testing And Verification

For B1, use documentation and structure checks:

```bash
git diff --check
node scripts/check-phase1-structure.mjs
rg -n 'docs/progress/current.md|phase-XX-summary|apps/api|packages/core|packages/schemas|root `plan.md`|./plan.md' README.md AGENTS.md summary.md docs --glob '!docs/vision/plan.md'
rg -n 'realNetworkCall.*true|realPush.*true|realDeploy.*true|create PR|deploy production' README.md AGENTS.md summary.md docs
```

For B2-B3, run the smallest focused tests for touched packages first, then broaden when shared contracts change:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/integrations test
pnpm --filter @psf/auto-fix-loop test
pnpm typecheck
pnpm test
```

For A1, use only local, approved, non-provider execution with explicit gates and documented evidence. External network providers remain disabled.

## Approval Boundary

This design approves planning and documentation convergence only. Each later batch still needs its own implementation plan, focused edits, verification, documentation updates, and Chinese git commit. Real provider network calls require a separate explicit user approval.
