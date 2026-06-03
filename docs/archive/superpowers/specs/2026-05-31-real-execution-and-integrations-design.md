# Real Execution And Integrations Design

Date: 2026-05-31

Status: proposed design only

## Purpose

Personal Software Factory has reached a local-first dry-run MVP through Phase 17B. The current system can plan Missions, generate Codex/QA/fix artifacts, run demo workflows, enqueue dry-run jobs, and show the full audit trail in Hub Web. The next long-term objective is to add real execution and real integrations without weakening the safety model that made the dry-run MVP auditable.

This document is the architecture design for the post-Phase-17B path. It covers Batch A through Batch M as a staged roadmap. It is not an implementation plan and does not authorize real Codex execution, real network calls, pushes, pull requests, deployments, monitor creation, or Plane issue creation.

## Current Baseline

The current architecture remains the foundation:

- React/Vite Hub Web.
- Fastify Orchestrator API in `apps/orchestrator-api`.
- Worker Runner in `apps/worker-runner`.
- Queue facade in `packages/worker-runtime` with in-process and optional BullMQ implementations.
- Queue wrapper WorkerRun semantics for async jobs.
- Prisma/PostgreSQL as durable state.
- Redis/BullMQ as optional queue backing.
- Dry-run Codex Worker, dry-run QA Worker, dry-run Auto Fix Loop, and mock/dry-run integrations.
- Project Passport and Project Registry for project-specific commands and flows.

The following decisions are intentional and should not be reverted to match older plan examples:

- Hub stays React/Vite instead of Next.js.
- API stays `apps/orchestrator-api`.
- Schema/core stay `packages/mission-schema` and `packages/mission-core`.
- Existing dry-run/mock modes remain first-class.
- Queue wrapper WorkerRun semantics remain compatible with child WorkerRuns.

## Design Principles

1. Real capabilities are additive gated modes, not replacements for dry-run.
2. Every real action requires explicit environment enablement and policy checks.
3. High-risk actions require Approval records before execution.
4. Secrets must be redacted before prompts, logs, artifacts, API responses, Hub display, PR bodies, and issue bodies.
5. Workers may not execute arbitrary shell commands from Hub or API.
6. Codex must run only inside a guarded workspace/worktree, never on `main` or `master`.
7. External integrations must report whether a real network call happened.
8. Failures should produce paused, blocked, or needs-human outputs with artifacts instead of crashing silently.
9. Temporal and LangGraph remain deferred until there is evidence BullMQ plus the explicit state machine is insufficient.

## Target Closed Loop

```text
User request
  -> Mission planned
  -> safe worktree and branch
  -> real Codex execution when enabled
  -> local tests and build
  -> deterministic Playwright QA
  -> AI exploratory QA when enabled
  -> bugs.json
  -> regression test generation and validation
  -> Codex fix loop with max attempts
  -> ready_for_review
  -> GitHub PR when enabled
  -> staging deploy when enabled
  -> QA against staging URL
  -> monitor status
  -> Plane issue sync when enabled
  -> Hub-visible audit trail
```

## Stage Roadmap

### Batch A: Architecture And Safety Baseline

Goal: make the real-mode safety contract explicit before enabling any real execution.

Deliverables:

- ADRs for current architecture alignment, real execution boundary, external integration gating, artifact retention, and Temporal/LangGraph.
- Shared secret redaction utilities usable by worker prompts, stdout/stderr, artifacts, API responses, and Hub data.
- Command policy model with allowlist, denylist, timeout, working-directory, and environment constraints.
- Workspace path guard that refuses paths outside `PSF_WORKSPACE_ROOT`.
- Forbidden path guard for `.env`, SSH keys, credential files, home directories, root filesystem paths, and production data paths.
- Approval policy checker for production deploy, destructive operation, database migration, secret change, external cost risk, security risk, push/PR, and network call.
- Artifact store policy recommending `artifacts/missions/<mission-id>/<run-id>/...` while preserving compatibility with existing `missions/<mission-id>/...` demo files.

Acceptance:

- No real execution is introduced.
- Policy utilities have focused tests.
- Docs describe how to verify the system is still in dry-run mode.

### Batch B: Real Codex Worker Gated Mode

Goal: add a real Codex runner abstraction with all gates, defaulting to disabled.

Environment:

- `ENABLE_REAL_CODEX=0|1`
- `CODEX_EXECUTABLE=codex`
- `CODEX_SANDBOX=workspace-write`
- `CODEX_APPROVAL_MODE=on-request`
- `PSF_WORKSPACE_ROOT=./workspaces`
- `PSF_REAL_CODEX_MAX_RUNTIME_MS`

Components:

- `CodexRunner` interface with dry-run, mock, and real implementations.
- `WorkspaceLease` for clone/update/worktree preparation.
- `ExecutionRequest` validated by command policy.
- Branch naming policy: `agent/<mission-slug>-<mission-id>`.
- Real-mode preflight: env enabled, approval allowed, project passport valid, worktree safe, branch not protected, command allowed, timeout set, secrets redacted.
- Output capture: stdout, stderr, exit code, duration, diff summary, dev-summary, logs, and local commit metadata.

Execution rules:

- Default is no push.
- `main` and `master` are refused.
- No production deploy path is reachable from Codex Worker.
- If prerequisites fail, return blocked/manual-action with artifacts and MissionEvent.

Tests:

- fake repository worktree tests;
- mock codex executable tests;
- real-mode-disabled tests;
- main/master protection tests;
- redaction tests for prompt/stdout/stderr/artifacts.

### Batch C: Deterministic Playwright QA

Goal: turn QA Worker from template-only dry-run into a real deterministic QA runner when a target URL exists.

Inputs:

- Project Passport commands and paths;
- `target_url`, `QA_TEST_URL`, or `STAGING_URL`;
- mission.md and acceptance.md;
- qa-charter.md;
- generated or project-owned Playwright specs.

Outputs:

- `qa-report.md`;
- schema-valid `bugs.json`;
- `qa-summary.json`;
- screenshots, traces, videos, HTML report when available;
- QARun, BugReport, Artifact, WorkerRun, MissionEvent.

Rules:

- No URL means blocked/manual-action, not crash.
- Playwright failures become structured bugs.
- P0/P1 bugs require reproduction steps, expected result, actual result, and evidence.
- Normal `pnpm test` must not require browsers or a live target.

### Batch D: AI Exploratory QA Gated Mode

Goal: add AI exploratory QA as an optional runner after deterministic QA exists.

Environment:

- `ENABLE_AI_EXPLORATORY_QA=0|1`

Design:

- Keep Playwright Test as stable regression.
- Use Playwright MCP or an equivalent AI exploration runner for exploratory behavior only.
- Inputs include mission, acceptance, passport, qa-charter, and target URL.
- Outputs must validate against QA report and bug schemas.
- Generated regression specs must typecheck or produce a repair-feedback artifact.
- AI output without evidence cannot create P0/P1 bugs.

### Batch E: Real Auto Fix Loop

Goal: turn bug repair from dry-run artifact generation into gated Codex fix execution.

Rules:

- Read `bugs.json`, `qa-report.md`, and regression spec.
- Require or generate regression coverage before closing reproducible bugs.
- Run targeted tests, unit tests, and necessary e2e after fixes.
- Mission max attempts default to 3.
- Bug fix attempts default to 2.
- Exhausted attempts move to `needs_human` or `paused`.
- Hub shows fix round, failure reason, and next action.

### Batch F: GitHub / PR Gated Integration

Goal: add real GitHub branch push and PR creation only when enabled.

Environment:

- `ENABLE_REAL_GITHUB=0|1`
- `GITHUB_TOKEN` or `GH_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`

Rules:

- Dry-run adapter remains unchanged.
- Real adapter may push only an approved agent branch.
- Never push `main` or `master`.
- PR body includes Mission summary, dev summary, checks, QA state, bugs/fix attempts, artifacts, and risks.
- Missing token, permission failure, or network failure moves Mission to paused/manual-action without deleting local work.
- `realNetworkCall` must be true only after a real provider request happens.

### Batch G: Deploy Worker / Coolify Gated Mode

Goal: support staging or preview deployment through a deploy worker while keeping production gated.

Environment:

- `ENABLE_REAL_COOLIFY=0|1`
- `COOLIFY_BASE_URL`
- `COOLIFY_TOKEN`

Rules:

- Staging/preview deployment can be real only after explicit enablement and policy approval.
- Production deployment always creates an Approval and never auto-runs.
- Deployment status, URL, logs, and errors become durable records/artifacts.
- Successful staging deploy can enqueue QA against the staging URL.

### Batch H: Monitor Worker / Uptime Kuma Gated Mode

Goal: surface uptime status without coupling system health to Uptime Kuma availability.

Environment:

- `ENABLE_REAL_UPTIME_KUMA=0|1`
- `UPTIME_KUMA_BASE_URL`
- `UPTIME_KUMA_TOKEN` or the current authenticated variable set.

Rules:

- Real status polling and monitor creation are gated.
- Uptime Kuma outages do not crash Orchestrator or Worker Runner.
- Down status writes Project/Mission event and can optionally suggest a diagnosis Mission.
- No automatic production repair is triggered by monitoring alone.

### Batch I: Plane Gated Integration

Goal: link Missions and BugReports to Plane issues when enabled.

Environment:

- `ENABLE_REAL_PLANE=0|1`
- `PLANE_BASE_URL`
- `PLANE_API_TOKEN`
- `PLANE_WORKSPACE_SLUG`
- `PLANE_PROJECT_ID`

Rules:

- Plane is optional and cannot block core development.
- Mission and Bug issue URLs are stored and shown in Hub.
- Status mapping is explicit and tested.
- Provider failures create manual-action guidance.

### Batch J: Hub Web Full Visualization

Goal: expose the real/dry-run lifecycle without moving workflow rules into Hub.

Pages and details:

- Dashboard with health, queue, QA, bug, integration, deployment, and monitor summaries.
- Project list/detail.
- Mission list/detail with event timeline.
- WorkerRun detail with redacted logs and child run references.
- QARun detail.
- Bug list/detail.
- Artifact list/detail/download/open.
- Approval list/action.
- Integration status and gated action output.
- Queue status.
- Deployments, monitors, PR/Plane links.

Rules:

- Hub calls Orchestrator only.
- All writes use bearer token.
- Hub never displays secrets.
- Hub can show real-mode readiness, but cannot bypass policy.

### Batch K: ai-novelist Real Loop Readiness

Goal: make ai-novelist executable by the real worker without hardcoded guesses.

Updates:

- Extend `project.passport.yaml` with paths, install/dev/build/test/e2e/lint commands, URLs, quality gates, risk rules, and core flows.
- Update project AGENTS and QA charter.
- Add smoke/e2e entry points for novel creation, worldview, outline, chapter, review, repair, export, failure-to-bug, and regression.

Rule:

- If the target repository is not present or commands cannot be verified, produce manual-action docs and fixture tests instead of pretending the loop ran.

### Batch L: Operations Hardening

Goal: make real-mode operation diagnosable and recoverable.

Deliverables:

- correlation IDs for Mission, WorkerRun, and QARun;
- worker heartbeat;
- timeout and stale detection;
- retry with backoff;
- artifact retention/cleanup CLI;
- backup/restore docs;
- token rotation docs;
- crash recovery docs;
- production-like docker compose for local validation only;
- expanded doctor checks for DB, Redis, queue, runner, artifacts, redaction config, real-mode readiness, and passport validation.

### Batch M: Temporal / LangGraph Decision

Goal: decide based on evidence, not preference.

Current decision:

- Do not introduce Temporal or LangGraph yet.
- Keep BullMQ plus TypeScript state machine as the primary workflow engine.
- Revisit only when tests or operations show concrete problems with long workflow recovery, compensation, graph branching, or multi-project concurrency.

Future migration:

- Keep Orchestrator APIs and Mission records stable.
- Wrap existing handlers as future activities/nodes if needed.
- Preserve WorkerRun, MissionEvent, QARun, BugReport, and Artifact audit trails.

## Real-Mode Gate Contract

Every real action must satisfy all of the following:

1. Specific `ENABLE_REAL_*` variable is set to `1`.
2. Required credentials are present.
3. Approval policy allows the action.
4. Mission status allows the action.
5. Worker job type is whitelisted.
6. Workspace path is inside the allowed workspace root.
7. Command policy accepts the command.
8. Secrets are redacted from all outputs.
9. Artifact path is safe and addressable.
10. WorkerRun and MissionEvent are written.

If any gate fails, the result should be blocked, paused, or manual-action with a clear reason. It should not silently fall through to real execution.

## Artifact Store Policy

Recommended new path:

```text
artifacts/
  missions/
    <mission-id>/
      <run-id>/
        mission.md
        acceptance.md
        codex/
        qa/
        fix/
        logs/
        screenshots/
        traces/
```

Compatibility:

- Existing `missions/<mission-id>/...` demo outputs remain readable.
- Existing DB inline artifacts remain valid for small text.
- Large screenshots, traces, videos, and logs should be path-only.
- Artifact records should include size, mime type, retention class, redaction status, and source WorkerRun when available.

## Data And Schema Strategy

Avoid large schema rewrites in the first real-mode batches. Use existing JSON `input`, `output`, and `metadata` fields for safe incremental data. Add explicit columns or relations only when query needs are proven.

Likely future additions:

- deployment records;
- monitor records;
- parent/root WorkerRun relations;
- external link records for PRs and Plane issues;
- artifact retention metadata.

## Failure Handling

Failure outputs should be explicit:

- `blocked`: policy or prerequisites prevent execution.
- `paused`: human action required before continuing.
- `needs_human`: automatic attempts are exhausted or risk is high.
- `failed`: execution attempted and failed.

All failures must preserve redacted logs and a recommended next action.

## Testing Strategy

The default test suite must remain local and stable:

- unit tests for policies, guards, redaction, schema, and state transitions;
- fake repo tests for Codex worktree behavior;
- mock executable tests for Codex runner;
- fixture web app tests for deterministic Playwright;
- provider mock tests for integrations;
- real-disabled tests for every `ENABLE_REAL_*` path;
- optional real Redis tests gated by `PSF_TEST_REDIS=1`;
- optional real browser tests gated by URL and explicit env;
- no tests requiring real provider credentials by default.

## Documentation Strategy

Each batch should update:

- `docs/progress.md`;
- a batch-specific progress file;
- README current scope and real-mode setup;
- relevant integration docs;
- safety and operations docs;
- API docs when surfaces change.

## Recommended Implementation Order

1. Batch A.
2. Batch B with mock/fake repo coverage.
3. Batch C with fixture web target.
4. Batch E in dry-run-plus-real-Codex gated form.
5. Batch K to prepare ai-novelist commands.
6. Batch F once local commits and QA artifacts are reliable.
7. Batch G for staging deploy.
8. Batch H for monitor visibility.
9. Batch I for Plane sync.
10. Batch J improvements alongside each real backend capability.
11. Batch L continuously as operational risks appear.
12. Batch M only after evidence justifies a workflow engine change.

## Non-Goals For This Design Batch

- No code implementation.
- No real Codex execution.
- No real network calls.
- No dependency installation.
- No Prisma migration.
- No production deployment.
- No push to GitHub.
- No Temporal or LangGraph dependency.
