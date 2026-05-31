# Phase 16A/16B/17A Demo And Operations Hardening Design

## Context

Personal Software Factory already has the Phase 0-15 local-first dry-run stack:

- Project Registry and `ai-novelist` Project Passport.
- Mission Planner deterministic artifact generation.
- Codex Worker dry-run prompt and command artifact generation.
- QA Worker dry-run report, bug, summary, and regression template generation.
- Auto Fix Loop dry-run fix mission and fix Codex command generation.
- Orchestrator API with Dashboard, Mission Summary, resource routes, auth, and Integration dry-run routes.
- Hub Web with Dashboard, Mission Detail, and Integration status views.
- GitHub, Coolify, Uptime Kuma, and Plane adapters in mock/dry-run mode only.

The Phase 16A/16B/17A goal is to make the MVP stable to demo and locally verify. It must not introduce real Codex execution, real external APIs, remote push, PR creation, or deployment.

## Goals

1. Provide a one-command local health check.
2. Provide safe demo seed/reset commands for the `ai-novelist` demo namespace.
3. Provide one command that runs the full `ai-novelist` dry-run demo chain.
4. Generate a repeatable demo acceptance report.
5. Add protected Orchestrator API action routes for existing dry-run capabilities.
6. Add Hub Web dry-run action buttons that call the Orchestrator API.
7. Complete safety, operations, troubleshooting, and README documentation.

## Non-Goals

- No real Codex execution.
- No real Playwright browser requirement in default tests.
- No real GitHub, Coolify, Uptime Kuma, or Plane network calls.
- No real push, PR, issue creation, monitor creation, or deployment.
- No Temporal, LangGraph, BullMQ, or new large workflow framework.
- No Hub Web reset/delete button.
- No broad project-management system beyond existing Mission-oriented views.

## Recommended Architecture

Add a reusable local demo/action service layer, tentatively `packages/demo-workflow`, that composes existing packages:

```text
Project Registry
  -> ensure demo Mission
  -> Mission Planner
  -> Codex Worker dry-run
  -> QA Worker dry-run
  -> Auto Fix Loop dry-run
  -> demo report
```

CLI and Orchestrator API call this service layer directly. The API must not execute shell commands. Hub Web only calls Orchestrator API routes and never reads the database or filesystem directly.

The service layer should expose small, testable functions:

- `ensureAiNovelistDemoMission`
- `runDemoAiNovelist`
- `runMissionPlanAction`
- `runCodexDryRunAction`
- `runQaDryRunAction`
- `runFixDryRunAction`
- `runLoopDryRunAction`
- `resetDemoData`
- `runDoctor`
- `generateDemoReport`

The implementation should reuse existing deterministic workers and storage abstractions. It should avoid duplicating the Codex command renderer, QA report renderer, or Auto Fix Loop logic.

## CLI Design

Add or extend `pnpm psf` commands:

- `pnpm psf doctor`
- `pnpm psf doctor --json`
- `pnpm psf doctor --check-api`
- `pnpm psf doctor --check-hub`
- `pnpm psf demo:seed`
- `DEMO_RESET_CONFIRM=1 pnpm psf demo:reset`
- `pnpm psf demo:ai-novelist`
- `pnpm psf demo:ai-novelist --with-sample-bug`
- `DEMO_RESET_CONFIRM=1 pnpm psf demo:ai-novelist --reset-demo --with-sample-bug`
- `PSF_SKIP_DB=1 pnpm psf demo:ai-novelist --skip-db`
- `pnpm psf demo:report`

`demo:ai-novelist` must be repeatable. It should reuse or upsert the fixed demo Mission `mission-0001-ai-novelist-chapter-review` and avoid uncontrolled duplicate records.

Output should include:

- Mission ID.
- API URL.
- Hub URL.
- Mission Detail URL.
- Generated artifact paths.
- Whether DB sync was used.
- Explicit dry-run boundaries.

## Demo Reset Design

Demo reset remains CLI-only. Hub Web must not expose reset/delete actions.

Reset safety rules:

- Require `DEMO_RESET_CONFIRM=1` before deleting anything.
- Only clear data for `projectId=ai-novelist` and Mission IDs equal to `mission-0001-ai-novelist-chapter-review` or starting with `demo-`.
- Never truncate tables.
- Never delete non-demo projects or missions.
- In dry preview mode, print what would be deleted and exit without changes.
- Prefer scoped deletion of mission-owned resources: WorkerRun, QARun, Artifact, BugReport, Approval, MissionEvent, and demo mission files.

If database deletion APIs are not yet available in the storage abstraction, add narrowly scoped Prisma helper code in the CLI/service layer rather than widening general API deletion.

## Doctor Design

`doctor` is read-only. It must not modify files or database state.

Checks:

- Node.js version.
- pnpm availability.
- Current directory is `personal-software-factory`.
- Required directories exist: `apps/orchestrator-api`, `apps/hub`, `packages`, `workers`, `projects/ai-novelist`, `missions`.
- `.env` and `.env.example` presence.
- Auth configuration hints for `PSF_AUTH_DISABLED` and `PSF_API_TOKEN`.
- Prisma client availability.
- Database connection, with clear docker compose and migration guidance when unavailable.
- `projects/ai-novelist/project.passport.yaml` parses.
- Demo Mission files exist.
- Optional API health check with `--check-api`.
- Optional Hub check with `--check-hub`.
- Integration adapters report mock/dry-run state.
- Warnings if `ENABLE_REAL_*`, `ENABLE_REAL_CODEX`, or `ENABLE_REAL_PLAYWRIGHT` are set.

Output modes:

- Human-readable default.
- JSON with `--json`.

Final status values:

- `ok`
- `warning`
- `failed`

All outputs must redact token and password values.

## Orchestrator API Design

Add protected white-listed action routes:

- `POST /missions/:id/actions/plan`
- `POST /missions/:id/actions/codex-dry-run`
- `POST /missions/:id/actions/qa-dry-run`
- `POST /missions/:id/actions/fix-dry-run`
- `POST /missions/:id/actions/loop-dry-run`
- `POST /demo/ai-novelist`

Request body examples:

```json
{ "withSampleBug": true }
```

```json
{ "withSampleBug": true, "resetDemo": false }
```

API constraints:

- All routes are `POST` and require existing bearer-token write auth.
- No route accepts arbitrary shell commands.
- No route performs real Codex execution, real external calls, push, PR creation, or deployment.
- Missing Mission returns `404`.
- Missing artifacts should return an actionable validation error or generate prerequisites when safe.
- Responses include fields such as `mode`, `dryRun`, `realCodexExecuted: false`, `realExternalCall: false`, generated files, WorkerRun IDs, QARun IDs, BugReport IDs, Artifact IDs, and next recommended action.

`POST /demo/ai-novelist` may run the demo flow but must not reset data. Reset remains CLI-only.

## Hub Web Design

Hub remains a viewing and safe dry-run trigger surface.

Dashboard additions:

- `Generate ai-novelist Demo dry-run`
- `Generate ai-novelist Demo with Sample Bug dry-run`
- `Refresh Dashboard`

Mission Detail additions:

- `Plan Mission dry-run`
- `Generate Codex dry-run`
- `Run QA dry-run`
- `Run QA dry-run with Sample Bug`
- `Run Fix dry-run`
- `Run Full Loop dry-run`
- `Refresh Summary`

Integrations:

- Keep GitHub, Coolify, Uptime Kuma, and Plane dry-run buttons.

UI behavior:

- Every action button shows loading state.
- Success refreshes the related Dashboard or Mission Summary data.
- Failure shows a readable error.
- Missing `VITE_PSF_API_TOKEN` shows a clear local-token hint without printing token values.
- Button labels must include `dry-run`.
- No reset/delete button.
- No direct shell, filesystem, database, or external provider access from Hub.

## Demo Report Design

Generate `docs/reports/demo-ai-novelist-report.md`.

The report includes:

- Run time.
- Project information.
- Mission ID.
- Executed steps.
- WorkerRun count.
- QARun count.
- BugReport count.
- Artifact count.
- MissionEvent count.
- QA Report path.
- `bugs.json` path.
- `fix-mission.md` path.
- `fix-codex-command.sh` path.
- Hub Dashboard URL.
- Hub Mission Detail URL.
- Dry-run boundaries.
- Current limitations.
- Recommended next steps.

The report is repeatable and must not include secrets.

## Safety Design

Safety invariants:

- Codex is never executed.
- Generated Codex command artifacts remain review-only and non-executable.
- No external API calls are made by current integration adapters.
- No remote push, PR creation, issue creation, monitor creation, or deployment happens.
- Tokens and passwords are never returned by APIs, displayed in Hub, written to artifacts, written to reports, or printed by doctor.
- `ENABLE_REAL_*="1"` may be reported as a warning/flag, but Phase 16 still keeps `realNetworkCall: false`.
- Dangerous future actions require Approval and explicit later-phase implementation.

Documentation updates:

- `docs/safety.md`
- `docs/worker-permissions.md`
- `docs/operations.md`
- `docs/troubleshooting.md`
- `docs/local-development.md`
- `docs/health-checks.md`
- `docs/final-mvp-scope.md`
- `docs/next-steps.md`
- `docs/api.md`
- `docs/auth.md`
- `docs/hub-web.md`
- `docs/progress.md`
- `README.md`

## Testing Design

Run focused tests first, then broad verification:

```bash
pnpm test:scripts
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

Required coverage:

- `demo:ai-novelist` generates complete dry-run artifacts.
- `demo:ai-novelist --with-sample-bug` generates BugReport and fix artifacts.
- `demo:reset` cannot delete non-demo data and does nothing without confirmation.
- `doctor` returns `ok`, `warning`, or `failed`.
- `doctor` redacts secrets.
- `doctor` reports database connection guidance when DB is unavailable.
- Action API routes cover plan, Codex dry-run, QA dry-run, QA dry-run with sample bug, fix dry-run, loop dry-run, and demo ai-novelist.
- Action API routes require bearer token when auth is enabled.
- Action API routes do not execute Codex or external provider calls.
- Hub action buttons render, call the correct API, refresh on success, and show errors on failure.
- Hub and Integration pages do not leak token/password values.
- Demo report generation is validated with snapshot-like checks.

## Plan Alignment

This design aligns with `plan.md`:

- Phase 16 focuses on validating `ai-novelist` with a dry-run local demo chain.
- Phase 17A focuses on stable local operations, health checks, safety docs, and recovery guidance.
- Phase 18 Temporal/LangGraph is explicitly deferred until the MVP has real workflow pain requiring durable orchestration.

The current plan file is `plan.md`; references to the older `personal-software-factory-plan.md` are treated as historical naming only.
