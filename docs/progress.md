# Phase 8-10 Progress

## Completed In This Batch

- Added `@psf/worker-runtime` with a synchronous `InProcessWorkerRuntime` facade.
- Converted `@psf/qa-worker` from scaffold to deterministic dry-run generator.
- Added QA artifacts for the ai-novelist example Mission: `qa-report.md`, `bugs.json`, `qa-summary.json`, `generated-regression.spec.ts`, screenshot/trace/log placeholder directories.
- Added `@psf/auto-fix-loop` dry-run controller that turns bugs into fix Mission artifacts and reuses Codex Worker dry-run.
- Added optional Playwright smoke config and a safe skip runner.
- Added Playwright MCP docs and AI QA prompt templates.
- Extended `pnpm psf` with QA and fix dry-run commands.
- Updated Artifact and Storage docs, README, and environment example.

## Created Or Modified Files

- `package.json`
- `pnpm-lock.yaml`
- `.env.example`
- `playwright.config.ts`
- `tests/e2e/psf-smoke.spec.ts`
- `scripts/psf.ts`
- `scripts/psf.test.ts`
- `scripts/run-playwright-smoke.mjs`
- `packages/mission-schema/src/schemas.ts`
- `packages/mission-schema/tests/schemas.test.ts`
- `packages/worker-runtime/**`
- `workers/qa-worker/**`
- `packages/auto-fix-loop/**`
- `missions/mission-0001-ai-novelist-chapter-review/**` QA/Fix outputs
- `docs/qa-worker.md`
- `docs/playwright.md`
- `docs/playwright-mcp.md`
- `docs/auto-fix-loop.md`
- `docs/worker-runtime.md`
- `docs/prompts/*.md`
- `docs/artifacts.md`
- `docs/storage.md`
- `docs/progress.md`
- `README.md`

## Database Migration

No Prisma migration is required. Existing Prisma models store worker type, QA status, artifact type, and statuses as strings. The Zod schema now accepts `auto_fix` WorkerRun type and `skipped` QARun status.

## Commands

QA dry-run:

```bash
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review
```

QA dry-run with sample bug:

```bash
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Auto-fix dry-run:

```bash
pnpm psf fix:dry-run mission-0001-ai-novelist-chapter-review
```

Full QA -> fix dry-run loop:

```bash
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Optional Playwright smoke:

```bash
pnpm test:e2e:smoke
QA_TEST_URL=http://127.0.0.1:8000 ENABLE_REAL_PLAYWRIGHT=1 pnpm test:e2e:smoke
```

## Dry-Run And Mock Boundaries

- QA dry-run does not open a browser.
- QA dry-run does not require staging URL.
- Optional Playwright smoke skips without URL or explicit `ENABLE_REAL_PLAYWRIGHT=1`.
- Playwright MCP is docs and prompt only.
- Auto Fix Loop does not execute Codex.
- `fix-codex-command.sh` is a non-executable review artifact.
- No GitHub push, PR creation, Coolify deploy, Uptime Kuma sync, Plane sync, or production action occurs.

## Requirements For Real Modes Later

- Real staging URL and browser binaries for Playwright.
- Explicit `ENABLE_REAL_PLAYWRIGHT=1` for local smoke command.
- Real Codex implementation behind `ENABLE_REAL_CODEX=1`, Approval, branch protection, and isolated workspace checks.

## Why Hub Web Is Deferred

Hub Web is Phase 11. This batch stabilizes backend records, worker artifacts, and CLI flows first so UI can render durable contracts later.

## Why BullMQ Is Deferred

Worker Runtime facade now defines the seam for a later queue adapter. BullMQ can be introduced after job payloads, retries, and event behavior are stable.

## Plan Alignment

This batch remains aligned with `plan.md`: it implements Phase 8 QA Worker MVP in dry-run form, Phase 9 Playwright MCP design placeholders, and Phase 10 auto-fix loop dry-run. Real browser, Codex, GitHub, deployment, monitoring, and Hub UI work remain later phases.

## Next Batch Suggestions

1. Add API endpoints to trigger QA dry-run and auto-fix loop from Orchestrator.
2. Add real Playwright smoke against a verified local ai-novelist staging URL.
3. Add Hub Web views for QARun, BugReport, Artifact, and WorkerRun records.
4. Introduce BullMQ only after in-process worker contracts remain stable.
