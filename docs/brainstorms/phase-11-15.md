# Phase 11-15 Design Check

## Scope

This batch upgrades Personal Software Factory from a CLI-visible dry-run loop to a Web-visible control plane. It covers:

- Phase 11: Hub Web MVP
- Phase 12: GitHub / PR Integration Adapter dry-run
- Phase 13: Coolify Deploy Adapter dry-run
- Phase 14: Uptime Kuma Monitor Adapter dry-run
- Phase 15: Plane Project Management Adapter dry-run

It does not redo Phase 0-10 and does not enable real external API calls.

## Hub Web Data Flow

Hub Web must read through Orchestrator API only.

```text
Hub Web
  -> Orchestrator API
  -> service layer
  -> storage abstraction / integration adapters
```

Hub Web must not directly read Prisma, local files, Project Passport YAML, mission files, or external provider APIs. `VITE_ORCHESTRATOR_API_URL` selects the API base URL. `VITE_PSF_API_TOKEN` is optional and only used for protected dry-run POST calls.

## Dashboard API Aggregation

The Dashboard should be the first screen and answer whether the factory loop is healthy. `GET /dashboard` should aggregate:

- Mission counts: total, running, failed, ready for review.
- QA counts: total, failed, recent QA runs.
- Bug counts: total, open, P0/P1.
- WorkerRun counts: total, recent failed runs.
- Artifact counts and recent key artifacts: `qa_report`, `bugs_json`, `codex_command`, `fix_mission`.
- Recent 5 Missions.
- Recent 5 Bugs.
- Recent 5 WorkerRuns.
- Integration statuses for GitHub, Coolify, Uptime Kuma, and Plane.
- Recommended next actions derived from current data.

This keeps Hub's first screen simple: one API call, one health overview, clear drill-down links.

## Mission Detail Aggregation

`GET /missions/:id/summary` should return a Mission Detail object that Hub can render without orchestrating multiple resource calls:

- `mission`
- `project`
- `currentStatus`
- `events`
- `artifacts`
- `workerRuns`
- `qaRuns`
- `bugs`
- `approvals`
- highlighted artifacts:
  - `qaReportArtifact`
  - `bugsJsonArtifact`
  - `codexPromptArtifact`
  - `codexCommandArtifact`
  - `fixMissionArtifact`
  - `fixCodexCommandArtifact`
- `recommendedNextAction`

Artifact rows should return metadata even when only a path is available. Missing local file content must not become a 500 response.

## Integration Adapter Boundary

`packages/integrations` should provide one adapter interface for GitHub, Coolify, Uptime Kuma, and Plane. The external API/CLI name for Uptime Kuma should be `uptime-kuma`; internal TypeScript names may use `uptime_kuma`.

Every dry-run response must include:

- `mode`
- `realEnabled`
- `realNetworkCall: false`
- `configured`
- `missingEnv`
- `safeToRun`
- `message`

All adapters default to mock or dry-run. Even when `ENABLE_REAL_*="1"`, this batch must not make a real network call. It may report `realEnabled: true`, but `realNetworkCall` remains `false`.

Secrets are only used to determine configuration status. Tokens and passwords must not appear in API responses, logs, tests, PR body, issue body, or Hub UI.

## Why No Real External Integrations

This batch is a control-plane visibility phase. Real GitHub, Coolify, Uptime Kuma, and Plane calls require:

- explicit credentials;
- approval gates;
- network error policy;
- audit logging for side effects;
- redaction verification;
- rollback or idempotency strategy.

Implementing dry-run adapters first proves request/response contracts, Hub UX, and redaction boundaries without side effects.

## Why No Complex User System

The MVP is single-user and local-first. Existing bearer-token protection is enough for protected write routes. Login, roles, tenants, sessions, and user management would add architecture weight without improving the local dry-run loop.

## Why No Production Deploy

Production deploy is a high-risk action. It needs approval policy enforcement, deployment provider credentials, health checks, rollback notes, and evidence that QA and review gates passed. This batch only visualizes and dry-runs deploy requests.

## Why No Jira-Like Project Management

The Hub should be an AI software factory control surface, not a full project management clone. Projects, Missions, Bugs, WorkerRuns, Artifacts, Approvals, and Integrations should be readable and navigable, but advanced planning boards, cycles, issue workflows, and multi-user assignments remain out of scope.
