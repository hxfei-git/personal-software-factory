# Phase 16A/16B/17A Demo Ops Hardening Brainstorm

## Phase 16A Demo Chain

Phase 16A proves one fixed local dry-run chain for `ai-novelist`:

```text
seed demo Mission
  -> deterministic Mission plan
  -> Codex Worker dry-run artifacts
  -> QA Worker dry-run artifacts
  -> Auto Fix Loop dry-run artifacts
  -> optional acceptance report
```

The chain is exposed through `pnpm psf demo:ai-novelist --with-sample-bug` and uses the fixed Mission ID `mission-0001-ai-novelist-chapter-review`. It may sync local PostgreSQL records when the database is available, or run artifact-only with `--skip-db`.

The demo chain is intentionally narrow. It exists to validate operator flow, artifact shape, DB sync shape, and safety fields before real worker execution is added.

## Phase 16B Hub/API Dry-Run Actions

Phase 16B adds protected Orchestrator API actions and Hub Web buttons for local dry-runs:

- `POST /demo/ai-novelist`
- `POST /missions/:id/actions/plan`
- `POST /missions/:id/actions/codex-dry-run`
- `POST /missions/:id/actions/qa-dry-run`
- `POST /missions/:id/actions/fix-dry-run`
- `POST /missions/:id/actions/loop-dry-run`

The Hub calls the Orchestrator API only. It does not run shell commands, access the filesystem, read `.env`, reset demo data, connect to the database directly, or call providers. Protected POST actions require the local bearer token unless `PSF_AUTH_DISABLED=true` is used for local development.

## Phase 17A Doctor, Reset, Report, Operations

Phase 17A adds local operator tools:

- `pnpm psf doctor` checks local prerequisites, required directories, `.env.example`, optional `.env`, the `ai-novelist` passport, dry-run integration safety, and optional DB/API/Hub health.
- `pnpm psf demo:reset --skip-db` previews reset by default and deletes only scoped demo data when `DEMO_RESET_CONFIRM=1`.
- `pnpm psf demo:report --with-sample-bug` writes `docs/reports/demo-ai-novelist-report.md` from the dry-run result.

These tools are operations helpers for the local MVP. Doctor is read-only. Reset is guarded and scoped to the fixed demo Mission or `demo-*` IDs. Report generation documents what the dry-run produced.

## Forbidden Real Actions

The current implementation must not:

- execute Codex;
- clone or mutate managed project workspaces for real development;
- push branches;
- open GitHub PRs or Issues;
- trigger Coolify deploys;
- create or update Uptime Kuma monitors;
- create or update Plane issues;
- deploy production;
- delete non-demo data;
- print or persist secrets.

All demo and integration responses must keep real action flags disabled, including `realCodexExecuted: false`, `realExternalCall: false`, `realPush: false`, and `realDeploy: false`.

## Why No GitHub/Coolify/Uptime Kuma/Plane Real Calls

Real provider calls create external state that is hard to undo: branches, PRs, Issues, deploy jobs, monitors, and project-management records. Those actions need reviewed network clients, explicit approval gates, idempotency, retry behavior, audit events, rollback guidance, and redaction tests.

Phase 16A/16B/17A focuses on proving the operator workflow and contracts while every integration remains mock/dry-run. Even if `ENABLE_REAL_GITHUB`, `ENABLE_REAL_COOLIFY`, `ENABLE_REAL_UPTIME_KUMA`, or `ENABLE_REAL_PLANE` is set to `1`, current integration responses must keep `realNetworkCall: false`.

## Why No Temporal/LangGraph

The project plan defers Temporal and LangGraph until the local state machine, dry-run workflow, worker artifacts, QA loop, and operations practices show a real need for durable workflow or graph orchestration.

Adding Temporal or LangGraph now would increase infrastructure and modeling cost before the MVP loop has proven stable. The current TypeScript packages, Fastify API, Prisma/PostgreSQL persistence, local CLI, and explicit Mission events are sufficient for Phase 16A/16B/17A.
