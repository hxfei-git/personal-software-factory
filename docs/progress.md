# Phase 4.5-7 Documentation Pass Progress

## Completed In This Batch

- Documented API token auth with `PSF_API_TOKEN`, `PSF_AUTH_DISABLED`, public `GET /health`, protected write methods, and local/dev/test boundaries.
- Documented the expanded Orchestrator API surface: Project sync/passport, Mission plan, Approval, WorkerRun, Artifact, BugReport, and QARun routes.
- Added Project Registry documentation for scanning `projects/*/project.passport.yaml`, validation, DB sync, and `ai-novelist` intake.
- Expanded Project Passport documentation, including required fields and the manual-verification boundary for `ai-novelist` placeholder commands.
- Documented Mission Planner as a deterministic template generator that does not call an LLM and records WorkerRun, Artifact, and MissionEvent resources through API/CLI paths.
- Documented Codex Worker dry-run behavior: prompt, command review artifact, dev summary, no Codex execution, `ENABLE_REAL_CODEX=1` future gate, main/master protection, Approval requirement, and non-executable `codex-command.sh`.
- Added Artifact policy for inline small text artifacts versus path-only large/binary artifacts.
- Added Approval policy for release, production deploy, real Codex, remote push, dangerous operations, external cost, security risk, secret changes, and database migrations.
- Updated README with local setup, migration, API startup, CLI examples, and test commands.
- Updated `.env.example` with necessary local variables and no real secret values.

## Created Or Modified Files

- `README.md`
- `.env.example`
- `docs/api.md`
- `docs/auth.md`
- `docs/project-registry.md`
- `docs/project-passport.md`
- `docs/mission-planner.md`
- `docs/codex-worker.md`
- `docs/artifacts.md`
- `docs/approval-policy.md`
- `docs/progress.md`

Additional scan-cleanup edits were made where required by the requested validation command:

- `docs/superpowers/plans/2026-05-30-phase-4-5-7-project-registry-codex-worker-implementation.md`
- `scripts/psf.ts`
- `packages/mission-planner/src/index.ts`

## How To Run Tests

Focused checks for this documentation pass:

```bash
rg -n "TODO|FIXME|真实凭据|secret-value|不写入数据库" README.md docs .env.example projects missions scripts
pnpm test:scripts
```

Broader project checks remain available:

```bash
pnpm check
pnpm typecheck
pnpm test
```

Phase 1 check commands remain:

```bash
pnpm install --lockfile-only
pnpm check
pnpm typecheck
pnpm test
```

## Current Dry-Run And Mock Boundaries

- Mission Planner is deterministic and does not call an LLM.
- CLI commands are local dry-runs and do not call external APIs.
- `projects:sync` validates local passports and can sync Project records to Prisma.
- `mission:create` writes local metadata and can sync a Mission/Event to Prisma.
- `mission:plan` writes local planner files and can sync WorkerRun, Artifact, and MissionEvent records to Prisma.
- `codex:dry-run` writes prompt, command review, and summary artifacts. It never executes Codex.
- `codex-command.sh` is intentionally non-executable and exits without invoking Codex.
- Real Codex execution is not implemented; `ENABLE_REAL_CODEX=1` is only a future safety gate.
- QA Worker, Playwright execution, GitHub PR creation, remote push, production deploy, Coolify, Uptime Kuma, Plane, and n8n integrations remain unimplemented.

## Current Unfinished Work

- Real Codex Worker execution with isolated checkout/worktree and command runner.
- Deterministic Playwright QA Worker.
- QA bug report ingestion from real Playwright evidence.
- Automated fix loop.
- Hub Web UI.
- BullMQ queues.
- GitHub branch push and PR creation.
- Production deploy and monitoring integrations.
- Full artifact retention and cleanup policy.

## Next Batch Suggestions

1. Build Phase 8 deterministic Playwright QA Worker with path-only screenshot/trace/report artifacts.
2. Add queue-backed WorkerRun dispatch only after API and dry-run records remain stable.
3. Add Hub views for Projects, Missions, WorkerRuns, Artifacts, Bugs, QA runs, and Approvals.
4. Introduce real Codex execution only behind Approval, branch protection, workspace isolation, and mock-first tests.
5. Add retention and redaction utilities before large QA artifacts or worker logs grow.

## Plan Alignment

This pass does not deviate from `personal-software-factory-plan.md`. It documents the Phase 4.5-7 implementation and explicitly keeps unimplemented real worker, QA, PR, deployment, and external-service behavior out of scope.
