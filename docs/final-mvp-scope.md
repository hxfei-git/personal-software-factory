# Final MVP Scope

## Current Local MVP

The local MVP demonstrates a default-safe operator loop with gated real contracts and PR preview/fix-regression readiness:

```text
Project Registry
  -> local Mission records
  -> deterministic planning and worker contracts
  -> Codex dry-run/manual-action artifacts
  -> QA dry-run and regression artifacts
  -> Auto Fix Loop dry-run artifacts
  -> gated GitHub PR preview contracts
  -> API/Hub guarded action controls
  -> doctor/reset/report/readiness operations
```

This is a demo and operations hardening MVP, not the final autonomous software factory.

## Included

- TypeScript pnpm monorepo.
- Prisma/PostgreSQL local persistence.
- Fastify Orchestrator API.
- React/Vite Hub Web.
- Project Registry for `ai-novelist`.
- Deterministic Mission Planner.
- Codex Worker dry-run artifact generation.
- QA Worker dry-run artifact generation.
- Auto Fix Loop dry-run artifact generation.
- Gated GitHub PR preview readiness for branch, commit, PR body, and Issue payloads without default push or PR creation.
- Mock integration status, dry-runs, and gated real-adapter contracts for GitHub, Coolify, Uptime Kuma, and Plane.
- Batch 05/06 fix-regression readiness surfaces for guarded local verification.
- Local doctor, scoped demo reset, and demo report generation.

## Excluded

- Real Codex execution.
- Real project workspace mutation.
- GitHub push, PR creation, Issue creation, or comments.
- Real GitHub, Coolify, Uptime Kuma, or Plane network calls by default.
- Coolify deploys.
- Uptime Kuma monitor creation or polling.
- Plane issue creation or sync.
- Production deployment.
- Temporal or LangGraph orchestration.
- Multi-user SaaS permissions.

## Acceptance Boundary

The MVP is acceptable when a new local operator can install dependencies, start local services, run doctor, generate the demo chain, inspect API/Hub results, safely reset demo state, and verify that no real external action occurred.

The final closed-loop product still requires later phases for real worker execution, deterministic browser QA against managed apps, PR preparation, approval-gated external integrations, and production operations.
