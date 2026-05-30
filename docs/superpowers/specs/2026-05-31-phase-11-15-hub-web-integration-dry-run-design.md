# Phase 11-15 Hub Web And Integration Dry-Run Design

## Objective

Phase 11-15 upgrades Personal Software Factory from a CLI-visible dry-run loop to a Web-visible control plane. The user should be able to open Hub Web and quickly judge whether the local AI software factory loop is healthy, then drill into Missions, QA reports, Bugs, WorkerRuns, Artifacts, Auto Fix outputs, and integration dry-run status.

This batch remains local-first and dry-run by default. It does not execute Codex, push GitHub branches, create real PRs, deploy through Coolify, create Uptime Kuma monitors, create Plane issues, or call real external APIs.

## Selected Approach

Use an API-first thin Hub design:

1. Add aggregation endpoints to `apps/orchestrator-api`.
2. Add `packages/integrations` with mock/dry-run adapters.
3. Implement `apps/hub` as a Vite + React + TypeScript app that only talks to Orchestrator API.

This preserves existing boundaries:

- Hub does not read Prisma directly.
- Hub does not read the local filesystem directly.
- Hub does not call GitHub, Coolify, Uptime Kuma, or Plane directly.
- Orchestrator routes call services; services call storage or adapters.
- External side effects remain disabled.

## Dashboard First UX

The Hub home page is an operations dashboard, not a project-management board. The first screen should show whether the whole factory loop is healthy.

Dashboard sections:

1. Overall health banner with recommended next action.
2. Mission metrics:
   - total Missions;
   - running Missions;
   - failed Missions;
   - `ready_for_review` Missions.
3. QA metrics:
   - total QARuns;
   - failed QARuns;
   - recent QA results.
4. Bug metrics:
   - total Bugs;
   - open Bugs;
   - P0/P1 Bugs.
5. WorkerRun metrics:
   - total WorkerRuns;
   - recent failed WorkerRuns.
6. Artifact metrics:
   - total Artifacts;
   - recent key artifacts, especially `qa_report`, `bugs_json`, `codex_command`, and `fix_mission`.
7. Integration cards:
   - GitHub;
   - Coolify;
   - Uptime Kuma;
   - Plane.
8. Recent lists:
   - latest 5 Missions;
   - latest 5 Bugs;
   - latest 5 WorkerRuns.

Recommended next actions should be deterministic:

- failed QA exists -> view QA Report;
- open Bug exists -> run `fix:dry-run`;
- Mission is `ready_for_review` -> prepare PR dry-run;
- Integration is not configured -> open Integrations page;
- no obvious issue -> inspect latest Mission or continue next planned phase.

## Orchestrator API Additions

Add read aggregation endpoints:

- `GET /dashboard`
- `GET /missions/:id/summary`
- `GET /integrations`

Add protected dry-run endpoint:

- `POST /integrations/:name/dry-run`

`GET /dashboard` returns:

- `metrics`;
- `healthSignals`;
- `recentMissions`;
- `recentBugs`;
- `recentWorkerRuns`;
- `recentFailedWorkerRuns`;
- `recentQaRuns`;
- `recentArtifacts`;
- `integrationStatuses`;
- `recommendedNextActions`.

`GET /missions/:id/summary` returns:

- `mission`;
- `project`;
- `currentStatus`;
- `events`;
- `artifacts`;
- `workerRuns`;
- `qaRuns`;
- `bugs`;
- `approvals`;
- highlighted artifacts:
  - `qaReportArtifact`;
  - `bugsJsonArtifact`;
  - `codexPromptArtifact`;
  - `codexCommandArtifact`;
  - `fixMissionArtifact`;
  - `fixCodexCommandArtifact`;
- `recommendedNextAction`.

Existing mission-scoped routes remain available and unchanged:

- `GET /missions/:id/artifacts`
- `GET /missions/:id/worker-runs`
- `GET /missions/:id/qa-runs`
- `GET /missions/:id/bugs`
- `GET /missions/:id/approvals`

Artifact rows should return metadata even when content is path-only. Missing local file content must not produce 500 errors.

## Integration Adapter Design

Create `packages/integrations`.

Core interface:

```ts
type IntegrationName = "github" | "coolify" | "uptime_kuma" | "plane";
type IntegrationMode = "mock" | "dry-run" | "real";

interface IntegrationAdapter {
  name: IntegrationName;
  mode: IntegrationMode;
  isRealEnabled(env: Record<string, string | undefined>): boolean;
  healthCheck(env: Record<string, string | undefined>): IntegrationStatus;
  dryRun(input: IntegrationDryRunInput, env: Record<string, string | undefined>): IntegrationDryRunResult;
  getStatus(env: Record<string, string | undefined>): IntegrationStatus;
  redactConfig(env: Record<string, string | undefined>): Record<string, unknown>;
}
```

External API and CLI names should use `uptime-kuma`. Internal TypeScript identifiers may use `uptime_kuma`.

Every dry-run result must include:

- `mode`;
- `realEnabled`;
- `realNetworkCall: false`;
- `configured`;
- `missingEnv`;
- `safeToRun`;
- `message`.

Even when an `ENABLE_REAL_*` variable is set to `"1"`, this batch reports `realEnabled: true` but still returns `realNetworkCall: false` and performs no network request.

### GitHub Adapter

Dry-run capabilities:

- generate branch name;
- generate Chinese commit message/title/body candidate where relevant;
- generate PR title;
- generate PR body;
- generate GitHub Issue title;
- generate GitHub Issue body;
- simulate PR creation result;
- simulate Issue creation result;
- return IntegrationStatus.

Required environment status fields:

- `GITHUB_TOKEN`;
- `GITHUB_OWNER`;
- `GITHUB_REPO`;
- `ENABLE_REAL_GITHUB`.

No token may appear in return values, logs, PR body, Issue body, Hub UI, or tests.

### Coolify Adapter

Dry-run capabilities:

- generate staging deploy request;
- generate production deploy request;
- mark production deploy as requiring Approval;
- simulate deployment id/status;
- generate deployment summary;
- return IntegrationStatus.

Required environment status fields:

- `COOLIFY_BASE_URL`;
- `COOLIFY_TOKEN`;
- `ENABLE_REAL_COOLIFY`.

No token may appear in return values, logs, or UI.

### Uptime Kuma Adapter

Dry-run capabilities:

- read project production/staging URL from input;
- generate monitor configuration;
- simulate monitor id/status;
- return uptime summary;
- return IntegrationStatus.

Required environment status fields:

- `UPTIME_KUMA_BASE_URL`;
- `UPTIME_KUMA_USERNAME`;
- `UPTIME_KUMA_PASSWORD`;
- `ENABLE_REAL_UPTIME_KUMA`.

No password may appear in return values, logs, or UI.

### Plane Adapter

Dry-run capabilities:

- map Mission to Plane Issue;
- map BugReport to Plane Bug Issue;
- generate issue title;
- generate issue body;
- simulate issue id/url;
- return IntegrationStatus.

Required environment status fields:

- `PLANE_BASE_URL`;
- `PLANE_API_TOKEN`;
- `PLANE_WORKSPACE_ID`;
- `PLANE_PROJECT_ID`;
- `ENABLE_REAL_PLANE`.

No token may appear in return values, logs, or UI.

## Hub Web Design

Implement `apps/hub` with Vite, React, and TypeScript. The app should be a control surface with restrained, dense, operational UI.

Navigation:

- Dashboard
- Projects
- Missions
- Mission Detail
- Bugs
- Worker Runs
- Artifacts
- Approvals
- Integrations

Pages:

- Dashboard: primary landing page using `GET /dashboard`.
- Projects: simple project list from `GET /projects`.
- Project Detail: `GET /projects/:id` and `GET /projects/:id/passport`.
- Missions: simple Mission list from `GET /missions`.
- Mission Detail: deep drill-down from `GET /missions/:id/summary`, with strong support for `mission-0001-ai-novelist-chapter-review`.
- Bugs: simple recent/global bug view from Dashboard data and Mission links.
- Worker Runs: simple recent/global WorkerRun view from Dashboard data and Mission links.
- Artifacts: simple key artifact view from Dashboard data and Mission links.
- Approvals: pending/history view, read-only in this batch.
- Integrations: integration status cards and dry-run buttons.

This batch may keep non-Dashboard list pages simple. It should not build a Jira/Linear-style project management system.

## Hub API Client

Add a typed client under `apps/hub/src/api/client.ts`.

Responsibilities:

- configure base URL with `VITE_ORCHESTRATOR_API_URL`, defaulting to `http://127.0.0.1:3000`;
- optionally attach `Authorization: Bearer <VITE_PSF_API_TOKEN>` for protected POST calls;
- expose functions for dashboard, projects, missions, mission summary, integrations, and integration dry-runs;
- handle API unavailable, 404, validation errors, and unauthorized writes;
- never print token values to console or rendered UI.

## Auth And Safety

Existing API token behavior remains:

- read endpoints are public local-MVP reads;
- write endpoints require bearer token unless auth is disabled for local/test;
- `POST /integrations/:name/dry-run` is a write route and must be protected.

Dry-run adapters must be safe without tokens. Missing configuration returns `configured: false`, `missingEnv`, `safeToRun: true` when no side effect is possible, and a clear message.

## Testing Plan

Integration package tests:

- GitHub dry-run works without token;
- Coolify dry-run works without token;
- Uptime Kuma dry-run works without password;
- Plane dry-run works without token;
- `ENABLE_REAL_*="0"` never performs real network calls;
- `ENABLE_REAL_*="1"` reports `realEnabled: true` but still `realNetworkCall: false`;
- GitHub token redaction;
- Coolify token redaction;
- Uptime Kuma password redaction;
- Plane token redaction;
- PR/Issue/deploy/monitor result bodies contain no secrets.

Orchestrator API tests:

- `GET /dashboard`;
- `GET /missions/:id/summary`;
- `GET /integrations`;
- `POST /integrations/:name/dry-run`;
- `POST /integrations/uptime-kuma/dry-run`;
- write auth rejects missing bearer token when auth is enabled;
- dry-run works without provider credentials;
- integration return values contain required safety fields.

Hub tests:

- API client builds requests and attaches token only to headers;
- Dashboard renders mock metrics and recommended actions;
- Mission Detail renders mock summary with QA report, bugs, artifacts, worker runs, and fix outputs;
- Integrations renders mock statuses and dry-run results;
- API error state renders clearly;
- empty state renders clearly;
- token values are not rendered.

Final verification:

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`
- `git status --short --branch`

## Documentation

Create or update:

- `docs/hub-web.md`
- `docs/integrations.md`
- `docs/github-integration.md`
- `docs/coolify-integration.md`
- `docs/uptime-kuma-integration.md`
- `docs/plane-integration.md`
- `docs/api.md`
- `docs/auth.md`
- `docs/progress.md`
- `README.md`
- `.env.example`

Also update stale active references from `personal-software-factory-plan.md` to `plan.md` where appropriate. Historical Superpowers specs may keep old context if clearly historical.

## Non-Goals

- No real GitHub API calls.
- No real Coolify API calls.
- No real Uptime Kuma API calls.
- No real Plane API calls.
- No real push, PR, deploy, monitor creation, or issue creation.
- No real Codex execution.
- No production deployment.
- No complex user account system.
- No Jira/Linear clone.
- No Phase 16 work.

## Plan Alignment

This design is aligned with `plan.md`. It implements Hub Web visibility and dry-run external integration boundaries after the backend dry-run loop from Phase 8-10. It does not change the technical stack or replace existing modules.

## Open Implementation Notes

- Prefer using existing storage methods for aggregation to avoid Prisma-specific dashboard code in routes.
- If global list methods for Bugs, WorkerRuns, Artifacts, QARuns, or Approvals become necessary, add them to the storage abstraction and both in-memory/Prisma implementations.
- Keep IntegrationStatus schema compatibility in mind; the package may expose richer adapter status while API responses include the user-requested fields.
- Use `uptime-kuma` for API/CLI path names and map to internal `uptime_kuma`.
