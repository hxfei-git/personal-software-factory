# Final MVP Scope

## Current Phase 16A/16B/17A MVP

The local MVP now demonstrates the ai-novelist dry-run operator loop:

```text
Project Registry
  -> fixed demo Mission
  -> deterministic plan
  -> Codex dry-run artifacts
  -> QA dry-run artifacts
  -> Auto Fix Loop dry-run artifacts
  -> API/Hub dry-run action controls
  -> doctor/reset/report operations
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
- Mock integration status and dry-runs for GitHub, Coolify, Uptime Kuma, and Plane.
- Local doctor, scoped demo reset, and demo report generation.

## Excluded

- Real Codex execution.
- Real project workspace mutation.
- GitHub push, PR creation, Issue creation, or comments.
- Coolify deploys.
- Uptime Kuma monitor creation or polling.
- Plane issue creation or sync.
- Production deployment.
- Temporal or LangGraph orchestration.
- Multi-user SaaS permissions.

## Acceptance Boundary

The MVP is acceptable when a new local operator can install dependencies, start local services, run doctor, generate the demo chain, inspect API/Hub results, safely reset demo state, and verify that no real external action occurred.

The final closed-loop product still requires later phases for real worker execution, deterministic browser QA against managed apps, PR preparation, approval-gated external integrations, and production operations.
