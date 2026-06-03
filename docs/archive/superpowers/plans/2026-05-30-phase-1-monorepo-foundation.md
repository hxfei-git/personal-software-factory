# Phase 1 Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Personal Software Factory repository foundation without implementing business logic.

**Architecture:** Use a pnpm workspace monorepo shaped for Hub Web, Orchestrator API, Codex Worker, QA Worker, shared schema packages, project registry files, and Mission artifacts. The foundation must make future phases independently implementable while keeping Phase 1 limited to documentation, configuration, and structure validation.

**Tech Stack:** pnpm workspace, Turborepo configuration, TypeScript base configuration, Docker Compose for PostgreSQL/Redis, Node-based structure checks.

---

## File Structure

- Create root governance and setup files: `AGENTS.md`, `README.md`, `.gitignore`, `.env.example`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `docker-compose.yml`.
- Create development standards: `docs/README.md`, `docs/development-standards.md`, `docs/progress/README.md`, `docs/progress/current.md`, `docs/progress/phase-01-summary.md`.
- Create app scaffolds: `apps/README.md`, `apps/hub/README.md`, `apps/hub/package.json`, `apps/orchestrator-api/README.md`, `apps/orchestrator-api/package.json`.
- Create worker scaffolds: `workers/README.md`, `workers/codex-worker/README.md`, `workers/codex-worker/package.json`, `workers/qa-worker/README.md`, `workers/qa-worker/package.json`.
- Create package scaffolds: `packages/README.md`, `packages/mission-schema/README.md`, `packages/mission-schema/package.json`, `packages/project-passport/README.md`, `packages/project-passport/package.json`.
- Create operational directories: `projects/README.md`, `missions/README.md`, `artifacts/README.md`, `workspaces/README.md`, `scripts/README.md`.
- Create validation script: `scripts/check-phase1-structure.mjs`.

## Task 1: Root Governance and Workspace Configuration

- [ ] Create root files listed above.
- [ ] Ensure `package.json` has scripts: `check`, `typecheck`, `test`, `lint`, and package-scoped commands.
- [ ] Ensure `.env.example` contains no real secrets.
- [ ] Ensure `docker-compose.yml` only defines PostgreSQL and Redis for Phase 1.

## Task 2: Directory Scaffolds and README Files

- [ ] Create every required app, worker, package, project, mission, artifact, workspace, docs, and scripts directory.
- [ ] Add a minimal README to every created directory explaining its purpose and phase boundary.
- [ ] Keep README text focused on Personal Software Factory and avoid future implementation details that belong in later phases.

## Task 3: Package Manifests Without Business Logic

- [ ] Add minimal package manifests for Hub, Orchestrator API, Codex Worker, QA Worker, mission-schema, and project-passport.
- [ ] Keep package scripts as scaffold checks only.
- [ ] Do not add source implementation files in Phase 1.

## Task 4: Structure Verification

- [ ] Add `scripts/check-phase1-structure.mjs` to validate required files and directories.
- [ ] Run `node scripts/check-phase1-structure.mjs` and expect success.
- [ ] Run `pnpm --version` if available.
- [ ] Run `pnpm install --lockfile-only` if pnpm is available and no network install is required.
- [ ] Run `pnpm check`, `pnpm typecheck`, and `pnpm test` if pnpm is available.

## Task 5: Final Review

- [ ] Run `rg --files` to inspect structure.
- [ ] Run `git status --short` to list changed files.
- [ ] Confirm no business logic was implemented.
- [ ] Stop after Phase 1 and report files changed, repository structure, next phase recommendation, and blockers.
