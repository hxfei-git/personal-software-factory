# Personal Software Factory

Personal Software Factory / 个人 AI 软件工厂 is a single-user control plane for turning natural-language software requests into structured Missions, Codex Worker development, Playwright QA, structured bug reports, automated fix loops, and GitHub PRs.

This repository is currently in Phase 1: monorepo foundation. It contains structure, configuration, and development guidance only. Business logic starts in later phases.

## Phase 1 Scope

Phase 1 creates the repository foundation for:

- Hub Web: future project and Mission control surface.
- Orchestrator API: future source of truth for Mission state, events, artifacts, and approvals.
- Codex Worker: future isolated branch/worktree development executor.
- QA Worker: future deterministic Playwright and AI exploratory QA executor.
- Shared packages: future Mission and Project Passport schemas.
- Project and Mission directories: future local registry and Mission artifacts.

## Repository Layout

```text
apps/
  hub/
  orchestrator-api/
workers/
  codex-worker/
  qa-worker/
packages/
  mission-schema/
  project-passport/
projects/
missions/
artifacts/
workspaces/
docs/
scripts/
```

## Local Prerequisites

- Node.js 20 or newer.
- pnpm.
- Docker and Docker Compose for PostgreSQL and Redis when database phases begin.

## Phase 1 Commands

```bash
pnpm install --lockfile-only
pnpm check
pnpm typecheck
pnpm test
```

The current `check`, `typecheck`, and `test` commands validate the Phase 1 structure. They do not run business logic tests yet.

## Development Order

Follow the documented phase order:

1. Phase 1: monorepo foundation.
2. Phase 2: schema and database.
3. Phase 3: state machine and core services.
4. Phase 4: Orchestrator API.
5. Later phases: project registry, workers, QA loop, Hub, GitHub PR integration, and external integrations.

Do not skip phase acceptance criteria in `docs/04-phase-acceptance-criteria.md`.
