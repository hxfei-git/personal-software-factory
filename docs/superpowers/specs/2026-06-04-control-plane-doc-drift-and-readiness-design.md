# Control Plane Doc Drift And Readiness Design

## Context

`docs/vision/plan.md` remains a long-term product vision and historical planning reference. Current implementation state lives in `summary.md`, `docs/architecture/structure.md`, `docs/status/progress.md`, `docs/debug/debug.md`, `README.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, and `docs/runtime/queue-runtime.md`.

The current system already has a TypeScript monorepo, Orchestrator API, Hub Web, Mission state machine, Prisma-backed storage, optional BullMQ queue runtime, Worker Runner, deterministic planner, dry-run workers, gated real-mode contracts, GitHub PR preview, fix/regression enforcement, and default-safe integration adapters.

`docs/status/progress.md` records that Batch 03/04 already covered local QA and local Codex proof surfaces, and Batch 05/06 already covered fix/regression enforcement and GitHub PR preview. The remaining mirror-based work is proof against an operator-prepared `ai-novelist` mirror, not rebuilding those surfaces from zero.

The remaining gap is not a missing grand architecture. The risk is state pollution: old phase notes, old paths, and long-term vision language can still be mistaken for current implementation facts. The next work should first make the control plane and documentation precise, then prove the shortest local gated-runner path for `ai-novelist` against an operator-prepared mirror.

## Goal

Run the next workstream in this order:

1. Control-plane and documentation convergence.
2. `ai-novelist` local mirror gated-runner proof.
3. External provider real-network integration only after the local loop is proven and explicitly approved.

This design does not enable real Codex execution, Playwright browser execution, provider network calls, push, PR creation, deployment, monitor creation, or Plane sync.

## Non-Goals

- Do not wire real GitHub, Coolify, Uptime Kuma, or Plane network calls.
- Do not enable default real Codex execution.
- Do not enable default real Playwright or Playwright MCP execution.
- Do not introduce Temporal or LangGraph.
- Do not delete Markdown by default. Audit first, clean only when needed, and update `summary.md`'s document map for every Markdown add, move, rename, or delete.

## Current Architecture Versus Vision

| Area | Current State | Vision Gap | Next Treatment |
|---|---|---|---|
| Monorepo | Implemented with `apps/orchestrator-api`, `apps/hub`, `apps/worker-runner`, `workers/*`, and focused `packages/*`. | Vision used older names such as `apps/api`, `packages/core`, and `packages/schemas`. | Treat vision paths as historical. Keep current package names as facts. |
| Mission state | Implemented through `@psf/mission-core` and auditable MissionEvents. | Full production release path exists conceptually but not as a live autonomous workflow. | Keep explicit state machine. Improve blocker visibility before real work. |
| Hub | Implemented as React/Vite operator console backed by Orchestrator API. | Vision expected broader complete workflow visibility. | Improve readiness, manual-action, evidence, and blocker UX before real execution. |
| Queue runtime | Implemented with inline and BullMQ modes plus queue wrapper WorkerRuns. | Long-running durable workflow vision mentions Temporal later. | Keep BullMQ baseline per ADR 0005. |
| Codex worker | Dry-run and gated real-runner abstractions exist. Batch 03/04 proved local Codex surfaces with fixture/injected paths; default Worker Runner still returns manual-action without injected runner. | Vision expects autonomous branch/worktree/Codex/test/commit loop against the managed project. | Clarify readiness semantics, then prove the gated Codex path on a real `ai-novelist` mirror. |
| QA worker | Dry-run evidence and deterministic Playwright runner abstraction exist. Batch 03/04 proved local QA surfaces; missing target URL or unverified selectors still block safely. | Vision expects deterministic QA and AI exploratory QA against staging or local target. | Validate real `ai-novelist` target URL, commands, and selectors, then run deterministic QA gated path. |
| Auto-fix loop | Dry-run and gated real fix contract exist with regression evidence enforcement. | Vision expects automatic bug fix and regression loop. | Keep blocked/manual-action until local QA and Codex proof are reliable. |
| GitHub PR | Gated PR contract and preview artifact exist. No push or PR creation by default. | Vision expects branch push, PR creation, comments, and webhook sync. | Do not enable until local loop is proven and explicit provider approval exists. |
| Coolify | Dry-run/status and gated adapter contract exist. No deployment by default. | Vision expects staging or preview deployment. | Defer real deploy. Prefer local target URL proof first. |
| Uptime Kuma | Dry-run/status and gated adapter contract exist. No monitor creation or polling by default. | Vision expects monitor status in Hub. | Defer network monitor work. |
| Plane | Dry-run/status and gated adapter contract exist. No issue sync by default. | Vision expects Mission/Bug issue sync. | Defer network issue sync. |
| Documentation | Current fact sources are consolidated, and several Superpowers design/plan records intentionally remain. Old phase and old path wording can still re-enter. | Vision contains historical phase plan and old doc paths. | Treat doc drift as Batch B1: audit first, then minimal necessary cleanup. |

## Readiness Terminology

Current `safeToRun` in `buildRealModeReadiness` is a route-level readiness signal. It checks queue mode, worker runtime configuration, route env gates, integration env, and Mission approvals. It does not currently prove injected runner or transport availability, local mirror readiness, target URL validity, selector verification, or command policy success.

Batch B2 should avoid letting `safeToRun=true` read as "real execution can happen now." It should either add explicit fields such as `canQueue`, `canExecute`, and `blockers[]`, or an equivalent structured blocker model that separates:

- queue acceptance blockers: action execution mode, worker runtime, route gate, approval, and provider env;
- execution blockers: injected runner or transport, local mirror, target URL, selector verification, command policy, workspace guards, and operation gates;
- safety flags: `realNetworkCall: false`, `realExternalCall: false`, `realPush: false`, and `realDeploy: false` until a later approved task intentionally changes them.

## Batch Plan

### Batch B1: Documentation Difference Audit And Minimal Cleanup

Create a current architecture versus `docs/vision/plan.md` difference matrix in active docs. Audit first, then make the smallest necessary cleanup so old progress and old phase material cannot pollute current state:

- Update `summary.md` with a compact vision-difference summary and document-map changes.
- Update `docs/status/progress.md` and `docs/status/next-steps.md` to state the chosen order: B before A, C deferred.
- Update `docs/debug/debug.md` with the audit, stale wording findings, cleanup decisions, and verification results.
- Preserve retained Superpowers design/plan records when they have audit value or current context value. If cleanup requires deleting, moving, renaming, or adding any Markdown file, update `summary.md`'s document map in the same change.
- Remove or rewrite old progress, old phase, old path, and low-value completed documents only after the audit shows their useful facts are already in current docs or ADRs.
- Keep `docs/vision/plan.md` as a long-term reference only.

Verification should search for stale current-state pointers such as `docs/progress/current.md`, `phase-XX-summary`, old root `plan.md` guidance, `apps/api`, `packages/core`, and `packages/schemas`, then classify remaining matches as historical or current.

### Batch B2: Control-Plane Readiness Convergence

Make blocked and manual-action states operationally useful across API, Hub, Worker Runner, and integrations:

- Define the readiness/blocker contract first, including `canQueue` versus `canExecute` or an equivalent structured `blockers[]` model.
- Standardize blocker fields for route gate, worker gate, provider gate, approval, env, local mirror, target URL, selector verification, command policy, injected runner, and injected transport.
- Ensure every blocked/manual-action response includes a concrete recommended next action.
- Keep default response flags explicit and unchanged: `realNetworkCall: false`, `realExternalCall: false`, `realPush: false`, and `realDeploy: false`.
- Improve Hub Mission Detail and integration readiness displays so the operator can see what is missing without reading logs.

### Batch B3: Contract And Safety Test Reinforcement

Add focused tests where drift would be expensive:

- Mission summary readiness and policy failures.
- Approval gates for gated actions.
- Queue wrapper WorkerRun semantics.
- GitHub PR preview artifact behavior.
- Fix/regression evidence enforcement.
- Secret redaction in API responses, worker outputs, artifacts, and Hub-visible state.

Do not expand scope into broad refactors. B3 is for contract regression tests and only the minimal production-code adjustments required to make those contracts explicit. If duplicate schemas remain, either justify the duplication or cover the boundary with tests.

### Batch A1: `ai-novelist` Local Mirror Gated-Runner Proof

Only after B1-B3:

- Prepare or verify an operator-controlled local `ai-novelist` checkout or mirror.
- Treat `manual-verification-required` passport metadata as unverified until the operator proves it against that real checkout or mirror.
- Verify passport install, dev, build, test, lint, and E2E commands against the real project mirror.
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

If `rg` is unavailable, use equivalent `grep` and `find` checks. Search matches are not required to be zero; classify each remaining match as one of:

- historical context;
- explicit prohibition or safety boundary;
- current risk that needs cleanup.

The B1 acceptance condition is that no active current-fact guidance points to obsolete paths, old phase progress, or unsafe real-execution behavior.

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
