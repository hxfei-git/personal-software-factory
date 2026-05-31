# Phase 16A/16B/17A Progress

## Completed In This Batch

- Added the Phase 16A/16B/17A brainstorm document for the demo chain, Hub/API dry-run actions, doctor/reset/report operations, forbidden real actions, external-call deferral, and Temporal/LangGraph deferral.
- Documented safety boundaries, worker permissions, operations, troubleshooting, local development, health checks, final MVP scope, and next steps.
- Updated README with a zero-to-local dry-run demo path covering install, local services, database setup, doctor, demo generation, API, Hub, reset, tests, and boundaries.
- Updated API/auth docs for Phase 16B protected dry-run actions and local demo auth.
- Added demo reset and optional doctor flags to `.env.example`.

## Created Or Modified Files

- `.env.example`
- `README.md`
- `docs/brainstorms/phase-16-17a.md`
- `docs/safety.md`
- `docs/worker-permissions.md`
- `docs/operations.md`
- `docs/troubleshooting.md`
- `docs/local-development.md`
- `docs/health-checks.md`
- `docs/final-mvp-scope.md`
- `docs/next-steps.md`
- `docs/progress.md`
- `docs/auth.md`
- `docs/api.md`

## Database Migration

No Prisma migration is required for this documentation batch. The changes only document existing Phase 16A/16B/17A behavior and add environment placeholders. Local demo commands may sync existing Prisma models, but no schema or migration file changed.

## Commands Documented

```bash
pnpm install
cp .env.example .env
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm psf doctor
pnpm psf doctor --check-db
pnpm psf doctor --check-api
pnpm psf doctor --check-hub
pnpm psf demo:ai-novelist --with-sample-bug
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
pnpm psf demo:report --with-sample-bug
pnpm psf demo:reset --skip-db
DEMO_RESET_CONFIRM=1 pnpm psf demo:reset --skip-db
PSF_AUTH_DISABLED=true pnpm dev:api
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
pnpm psf integrations:status
pnpm test:scripts
```

## Dry-Run Boundaries

- Phase 16A demo chain is local dry-run only.
- Phase 16B Hub/API action buttons call only the Orchestrator API.
- Phase 17A doctor is read-only, demo reset is scoped and confirmation-gated, and report generation writes a local acceptance report.
- Codex execution, GitHub push/PR/Issue, Coolify deploy, Uptime Kuma monitor creation, Plane issue creation, production deployment, and external provider network calls remain disabled.
- Integration responses must keep `realNetworkCall: false`.
- Demo workflow responses must keep `realCodexExecuted: false`, `realExternalCall: false`, `realPush: false`, and `realDeploy: false`.

## Plan Alignment

This batch aligns with `plan.md`, `docs/00-system-architecture.md`, and `docs/01-execution-roadmap.md` by keeping the Hub as a control surface, the Orchestrator as the API boundary, local artifacts first, and real integrations deferred until explicit approval and safety gates exist.

It uses Phase 16A/16B/17A naming to distinguish the local demo chain, Hub/API dry-run actions, and operations hardening work. It does not claim that real Codex execution, PR creation, deployment, monitoring, or Plane sync is complete.

## Next Suggestions

1. Run Task 8 focused and broad verification gates for the completed Phase 16A/16B/17A batch.
2. Manually exercise the README local demo flow from a fresh `.env`.
3. Add real worker or provider clients only after approval gates, redaction tests, idempotency, retry behavior, and audit fields are implemented.
