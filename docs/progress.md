# Phase 11-15 Progress

## Completed In This Batch

- Documented Hub Web startup, dashboard usage, Mission detail inspection, and local demo data flow.
- Documented Dashboard and Mission Summary API reads for Hub Web.
- Documented Integration status and dry-run API/CLI commands for GitHub, Coolify, Uptime Kuma, and Plane.
- Documented that every current integration is mock/dry-run only.
- Documented token and password redaction requirements for API responses, logs, PR/Issue bodies, and Hub UI.
- Updated `.env.example` with Hub Web and provider integration variables.
- Updated active plan references to the canonical `plan.md` filename.

## Created Or Modified Files

- `.env.example`
- `README.md`
- `AGENTS.md`
- `docs/api.md`
- `docs/auth.md`
- `docs/artifacts.md`
- `docs/progress.md`
- `docs/00-system-architecture.md`
- `docs/03-risk-and-assumptions.md`
- `docs/hub-web.md`
- `docs/integrations.md`
- `docs/github-integration.md`
- `docs/coolify-integration.md`
- `docs/uptime-kuma-integration.md`
- `docs/plane-integration.md`

## Database Migration

No Prisma migration is required for this documentation batch. No database models or migration files changed; Integration status remains a computed API/CLI response rather than a persisted table.

## Start API And Hub

Start the Orchestrator API:

```bash
pnpm dev:api
```

Default API URL: `http://127.0.0.1:3000`.

Start Hub Web:

```bash
pnpm dev:hub
```

Default Hub URL: `http://127.0.0.1:5173`.

Hub Web reads `VITE_ORCHESTRATOR_API_URL` and uses `VITE_PSF_API_TOKEN` for protected integration dry-run POST requests.

## Demo Data And Views

Generate the dry-run demo Mission data with a sample bug:

```bash
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Then use Hub Web to inspect:

- Dashboard metrics and recent operational rows from `GET /dashboard`.
- Mission Detail from `GET /missions/mission-0001-ai-novelist-chapter-review/summary`.
- QA report, BugReport, WorkerRun, and Artifact records linked to the Mission summary.
- Integration cards from `GET /integrations`.
- Integration dry-run responses from `POST /integrations/:name/dry-run`.

## Integration Commands

Status:

```bash
pnpm psf integrations:status
```

Dry-runs:

```bash
pnpm psf integrations:dry-run github
pnpm psf integrations:dry-run coolify
pnpm psf integrations:dry-run uptime-kuma
pnpm psf integrations:dry-run plane
```

API dry-runs use the same mock adapters:

```bash
curl -H "Authorization: Bearer $PSF_API_TOKEN" -X POST http://127.0.0.1:3000/integrations/github/dry-run
curl -H "Authorization: Bearer $PSF_API_TOKEN" -X POST http://127.0.0.1:3000/integrations/uptime-kuma/dry-run
```

## Dry-Run And Mock Boundaries

- GitHub does not push branches, create PRs, create Issues, comment, or call GitHub.
- Coolify does not trigger staging or production deploys.
- Uptime Kuma does not create, update, or poll monitors.
- Plane does not create or update Mission/Bug issues.
- `ENABLE_REAL_*="1"` only changes `realEnabled` to `true`.
- Every current integration result must keep `realNetworkCall: false`.
- Provider tokens and passwords are used only to determine whether a provider appears configured and must be redacted from every displayable output.

## Env Needed For Real Integrations Later

- Hub: `VITE_ORCHESTRATOR_API_URL`, `VITE_PSF_API_TOKEN`.
- GitHub: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `ENABLE_REAL_GITHUB`.
- Coolify: `COOLIFY_BASE_URL`, `COOLIFY_TOKEN`, `ENABLE_REAL_COOLIFY`.
- Uptime Kuma: `UPTIME_KUMA_BASE_URL`, `UPTIME_KUMA_USERNAME`, `UPTIME_KUMA_PASSWORD`, `ENABLE_REAL_UPTIME_KUMA`.
- Plane: `PLANE_BASE_URL`, `PLANE_API_TOKEN`, `PLANE_WORKSPACE_ID`, `PLANE_PROJECT_ID`, `ENABLE_REAL_PLANE`.

These variables are placeholders for later real integrations. In the current batch, they do not authorize network calls.

## Why No Real External Calls

Real external calls would create branches, PRs, deploys, monitors, or project-management issues outside the local factory. Those actions require reviewed provider clients, approval gates, retries, idempotency, secret redaction tests, and rollback behavior. This batch only documents and exposes dry-run contracts so the Hub and operator workflow can be tested safely first.

## Plan Alignment

This batch remains aligned with `plan.md`: it documents Phase 11 Hub Web MVP, Phase 12 GitHub integration dry-run behavior, Phase 13 Coolify dry-run behavior, Phase 14 Uptime Kuma dry-run behavior, and Phase 15 Plane dry-run behavior. It does not implement new feature code and does not claim that real external integrations are complete.

## Next Batch Suggestions

1. Reconcile integration environment variable aliases between `.env.example` and adapter `requiredEnv` reporting.
2. Add focused docs or tests for Hub operator flows once real users exercise the local console.
3. Add reviewed provider clients only behind explicit approvals, redaction tests, and `realNetworkCall` assertions.
