# AGENTS.md - Personal Software Factory

## Mission

Build a personal AI software factory that turns user requirements into planned Missions, Codex-driven development, Playwright QA, iterative fixes, GitHub PRs, and controlled releases.

## Current Implementation Discipline

- Current active implementation state is documented in `summary.md`, `docs/architecture/structure.md`, `docs/debug/debug.md`, `README.md`, and `docs/status/progress.md`.
- The repository includes gated real execution contracts and Batch 05/06 fix/regression plus GitHub PR preview work, but the default posture remains local-first, dry-run/mock/manual-action safe.
- Do not turn GitHub, Coolify, Uptime Kuma, Plane, Codex, Playwright, or AI exploratory adapters into real external callers or real execution paths without an explicit later task and approval.
- Integration responses and default gated real-mode responses must keep `realNetworkCall` false until real external calls are intentionally implemented and approved.
- Keep changes small, documented, and aligned with `docs/architecture/structure.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, and `docs/runtime/queue-runtime.md`.

## Required Reading Before Major Changes

- `summary.md` for current status, problems, risks, improvement backlog, and the full Markdown document map.
- `docs/architecture/structure.md` for the current implemented architecture.
- `docs/debug/debug.md` for known debug hotspots, verification records, and recent investigations.
- `README.md` for current local setup and capability boundaries.
- `docs/status/progress.md` for latest completed batches and verification status.
- `docs/api/orchestrator-api.md` for Orchestrator API contracts.
- `docs/security/safety.md` for dry-run, real-mode, and secret boundaries.
- `docs/runtime/queue-runtime.md` for queued WorkerRun and Worker Runner behavior.
- `docs/vision/plan.md` for long-term product vision only; do not treat it as current implementation state.

## Working Rules

- Do not push to `main` directly.
- Do not deploy production without explicit approval.
- Do not delete user data without explicit approval.
- Do not print or persist secrets in prompts, logs, reports, artifacts, PR bodies, or comments.
- Token and password values must not appear in Orchestrator API responses, Hub UI, logs, PR bodies, Issue bodies, or integration dry-run outputs.
- Every Mission state change in later phases must be evented and auditable.
- Every QA bug in later phases must include reproduction steps, expected result, actual result, and evidence.
- Keep generated artifacts under `artifacts/` and worker project clones under `workspaces/`.
- Every task must finish with a focused local git commit and relevant documentation updates, unless the user explicitly says not to commit or a blocker prevents a safe commit. Do not push to GitHub without explicit approval.
- Every commit must use a Chinese summary as the commit title and include a Chinese description in the commit body.
- During testing, minimize elapsed time by running the smallest meaningful checks for the changed surface first. Focus on critical test chains, then run broader suites only when phase gates, shared contracts, or risk level require them.

## Documentation Maintenance Rules

- Every Markdown file add, move, rename, or delete must update `summary.md`'s document map in the same task.
- Every architecture, module-boundary, data-flow, state-machine, worker-contract, integration-gate, or safety-boundary change must update `docs/architecture/structure.md` in the same task.
- Every current problem, risk, technical debt, status change, resolved issue, or improvement backlog change must update `summary.md` in the same task.
- Every debugging session, failed check, unexpected behavior, manual-action output, flaky test, queue/runtime issue, verification result, or incident-like finding must update `docs/debug/debug.md` in the same task.
- Preserve ADRs under `docs/adr/**`; do not delete them during cleanup unless the user explicitly asks and a newer ADR supersedes the decision.
- Remove completed plans, stale phase notes, and low-value historical documents once their useful facts are represented in current docs, ADRs, `summary.md`, or `docs/debug/debug.md`.
- If none of `summary.md`, `docs/architecture/structure.md`, or `docs/debug/debug.md` need changes, the final response and commit body must explicitly state why.
- Do not record secret values in any of these documents.

## Phase 1 Checks

- `pnpm install --lockfile-only`
- `pnpm check`
- `pnpm typecheck`
- `pnpm test`

## Architecture Defaults

- TypeScript monorepo with pnpm workspaces and Turborepo configuration.
- Fastify for the Orchestrator API in later phases.
- React/Vite for the current Hub Web app.
- Prisma with PostgreSQL for durable state in later phases.
- Redis and BullMQ for job queues in later phases.
- Playwright for deterministic QA before Playwright MCP exploration.
- Local artifacts first; object storage later only if needed.
