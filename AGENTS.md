# AGENTS.md - Personal Software Factory

## Mission

Build a personal AI software factory that turns user requirements into planned Missions, Codex-driven development, Playwright QA, iterative fixes, GitHub PRs, and controlled releases.

## Current Phase Discipline

- Phase 11-15 currently exposes Hub Web and integration dry-run surfaces only.
- Do not turn GitHub, Coolify, Uptime Kuma, or Plane adapters into real network callers without an explicit later task and approval.
- Integration responses must keep `realNetworkCall` false until real external calls are intentionally implemented.
- Keep changes small, documented, and aligned with `docs/00-system-architecture.md` and `docs/01-execution-roadmap.md`.

## Required Reading Before Major Changes

- `plan.md` for the full project plan.
- `docs/00-system-architecture.md` for architecture boundaries.
- `docs/01-execution-roadmap.md` for phase order.
- `docs/02-mvp-scope.md` for MVP scope.
- `docs/03-risk-and-assumptions.md` for safety assumptions.
- `docs/04-phase-acceptance-criteria.md` for phase gates.

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
