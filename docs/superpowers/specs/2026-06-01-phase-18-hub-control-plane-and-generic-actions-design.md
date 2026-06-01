# Phase 18 Design: Hub Control Plane And Generic Mission Actions

Date: 2026-06-01

## Context

`enhance_plan.md` identifies the next useful milestone as moving from a demo-oriented control surface to a usable local control plane. The current system already has Mission schemas, state machine, Orchestrator API, Hub Web, dry-run workers, gated real contracts, BullMQ-backed queue runtime, and safety documentation. The remaining gap is not another external integration. The immediate gap is that Hub still depends on placeholder pages and a fixed demo Mission, while action execution is still too closely shaped around the demo path.

This phase covers the next two batches from `enhance_plan.md`:

- Batch 1: Truth Cleanup + Hub basic control plane.
- Batch 2: Generic Mission Actions.

The work must preserve the current safety model. Codex real execution, external provider calls, push, PR creation, deployment, monitor creation, and Plane sync remain disabled unless a later approved phase explicitly enables their full gate chain.

## Goals

1. Remove the normal Hub path's dependency on `mission-0001-ai-novelist-chapter-review`.
2. Replace Hub placeholder pages with API-backed list and detail pages for Projects, Missions, Bugs, WorkerRuns, Artifacts, and Approvals.
3. Add Hub Mission creation for registered projects.
4. Add safe Approval decision actions in Hub.
5. Fix known schema drift between Orchestrator worker type validation and shared `@psf/mission-schema`.
6. Align README and docs with the current gated-real, dry-run-by-default architecture.
7. Generalize Mission action preflight so non-demo Missions can run the existing dry-run action pipeline.
8. Let WorkerRunner results write auditable MissionEvents and perform conservative Mission state transitions where the result is unambiguous.

## Non-Goals

- Do not enable real Codex execution.
- Do not push Git branches or create GitHub PRs.
- Do not call real GitHub, Coolify, Uptime Kuma, Plane, or other external APIs.
- Do not deploy to staging or production.
- Do not introduce Temporal, LangGraph, or another workflow engine.
- Do not redesign the Prisma schema around parent/child WorkerRun relations in this phase.
- Do not turn Hub into a full Jira or Linear replacement.

## Recommended Execution Shape

Use two sequential sub-phases in one implementation plan:

1. **Phase 18A: Baseline Truth Cleanup + Hub Control Plane**
   - Fix schema drift.
   - Update docs and capability matrix.
   - Expand API client methods.
   - Implement Hub list/detail/create/approval pages.
   - Keep demo quick links as shortcuts only.

2. **Phase 18B: Generic Mission Action Workflow**
   - Replace demo-only action assertions with generic Mission/project/passport preflight.
   - Keep wrapper WorkerRun semantics.
   - Route existing dry-run jobs through the same queue and inline surfaces.
   - Add conservative WorkerRunner-to-Mission status transitions.

This order is intentional. The user should first get a usable control plane before workflow logic becomes more general.

## Architecture

### Hub Web

Hub remains React/Vite and must only talk to Orchestrator API. It must not read Prisma, files, Redis, GitHub, or provider APIs directly.

New or upgraded routes:

```text
/dashboard
/projects
/projects/:projectId
/missions
/missions/new
/missions/:missionId
/bugs
/bugs/:bugId
/worker-runs
/worker-runs/:workerRunId
/artifacts
/artifacts/:artifactId
/approvals
/approvals/:approvalId
/integrations
```

The existing fixed demo Mission can remain as a "Demo Mission" shortcut on Dashboard, but route resolution must not silently substitute that Mission when the user opens normal Mission pages.

### Orchestrator API Client

The Hub API client should add typed methods for:

```text
listProjects
getProject
syncProjects
listMissions
createMission
getMissionSummary
listWorkerRuns
getWorkerRun
cancelWorkerRun
retryWorkerRun
listBugs
getBug
listArtifacts
getArtifact
listApprovals
getApproval
decideApproval
```

Existing dry-run action methods remain. All write methods must still require `VITE_PSF_API_TOKEN` when API auth is enabled. The client must redact tokens from surfaced errors.

### Orchestrator Services

Worker type validation should use the shared schema or mirror it exactly. The known immediate fix is ensuring `auto_fix` is accepted wherever WorkerRun worker type is validated.

Generic action preflight replaces demo-specific assumptions. It should validate:

- Mission exists.
- Project exists.
- Project Passport can be resolved.
- Requested action is in the whitelist.
- Current Mission status allows the action or returns a clear blocked/manual-action result.
- Required passport commands exist for actions that need them.
- QA actions without target URL produce a clear manual-action/blocked response instead of a 500.

### Worker Runtime And WorkerRunner

Keep the existing queue wrapper WorkerRun semantics:

- API queued mode creates a wrapper WorkerRun for the queue job.
- Business handlers may continue creating child WorkerRuns, QARuns, Artifacts, and BugReports.
- Wrapper `output` records child ids and summary fields.
- No parent/root WorkerRun schema migration is required for this phase.

WorkerRunner should add conservative result-to-state behavior:

- Plan success can move `received` or `planning` toward `planned` where legal.
- QA success can move toward `ready_for_review` only when there are no open bugs and state transition is legal.
- QA failure with bugs can move toward `bugs_found`.
- Fix completion can move toward `regression_running` or `qa_running` only when the current state and output support it.
- Exhausted attempts should move to `needs_human` or `paused` if the state machine allows it.

If the transition is not clearly legal, the WorkerRunner should write a MissionEvent with recommended next action instead of forcing state.

## Data Flow

### Create And Plan Mission From Hub

1. User opens `/missions/new`.
2. Hub loads registered projects from Orchestrator.
3. User selects project, enters title, requirement, priority, and optional risk level.
4. Hub calls `POST /missions`.
5. Orchestrator creates Mission with initial status and MissionEvent.
6. Hub navigates to `/missions/:missionId`.
7. User can click Plan Mission, which uses existing action API in inline or queued mode.

### Generic Dry-Run Action

1. Hub calls a whitelisted action route for the selected Mission.
2. Orchestrator resolves Mission, Project, and Project Passport.
3. Orchestrator runs action preflight.
4. In inline mode, Orchestrator executes the existing dry-run service.
5. In queued mode, Orchestrator creates wrapper WorkerRun and enqueues the job.
6. WorkerRunner consumes the job and calls existing business handlers.
7. WorkerRunner updates wrapper WorkerRun, writes MissionEvent, and records child ids.
8. Hub refreshes Mission Summary and WorkerRun list.

### Approval Decision

1. Hub lists Approvals and shows pending decisions.
2. User clicks Approve or Reject.
3. Hub sends a protected API request.
4. Orchestrator records decision and MissionEvent.
5. Approval decision does not automatically execute real Codex, PR, deploy, monitor, or external sync in this phase.

## Error Handling

- Missing Mission returns 404 with a readable message.
- Missing Project Passport returns a blocked/manual-action result for action routes and a readable error for direct fetch routes.
- Missing token for write routes returns a local setup hint, not the token value.
- Illegal Mission status for an action returns a clear preflight failure with recommended next action.
- Queue unavailable in queued mode returns a readable queue/runtime error.
- Artifact file missing should render metadata plus "missing file" in Hub, not crash the page.
- WorkerRunner should prefer MissionEvent plus safe error summary over silent failure.

## Safety Rules

- Hub must never display tokens, passwords, or provider secrets.
- API responses must not include secret values.
- Logs and WorkerRun output must pass redaction helpers where untrusted text may contain secrets.
- No arbitrary command API is added.
- No queue obliterate or bulk destructive action is added.
- Cancel/retry remains scoped to a single WorkerRun/job.
- Approval decisions are records only; they do not bypass route gates or provider gates.

## Testing Strategy

Focused tests should be added before broader gates:

- Orchestrator service test for `auto_fix` WorkerRun validation.
- Orchestrator action preflight tests for valid generic Mission, missing passport, illegal status, and missing QA target URL.
- WorkerRunner tests for conservative MissionEvent and status transition behavior.
- Hub API client tests for new list/detail/create/approval methods.
- Hub rendering tests for Projects, Missions, Mission create, Bugs, WorkerRuns, Artifacts, Approvals, and token-safe error display.
- Hub action tests confirming Mission Detail no longer relies on the fixed demo Mission for normal paths.

Phase gate commands:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/hub test
pnpm typecheck
pnpm test
pnpm build
pnpm psf doctor
git diff --check
git status --short --branch
```

## Documentation Updates

Update:

- `README.md`
- `docs/progress.md`
- `docs/progress/phase-18-hub-control-plane-and-generic-actions.md`
- `docs/safety.md`
- `docs/queue-runtime.md`
- `docs/hub-web.md`
- `docs/api.md`
- `docs/next-steps.md`

Docs must explicitly say the system remains dry-run/default-safe for real external operations.

## Acceptance Criteria

1. Hub placeholder pages are replaced by API-backed views.
2. Hub can create a Mission for `ai-novelist`.
3. Hub can list Missions and open the created Mission detail route.
4. Hub can list and inspect Bugs, WorkerRuns, Artifacts, and Approvals.
5. Hub can approve or reject an Approval through Orchestrator API without triggering external work.
6. Normal routing does not fall back to `mission-0001-ai-novelist-chapter-review`.
7. The demo Mission remains available as a shortcut.
8. `auto_fix` WorkerRun validation is accepted consistently.
9. Generic action preflight works for registered project Missions.
10. Missing passport/commands/target URL failures are readable and auditable.
11. WorkerRunner writes MissionEvents for action results.
12. Conservative legal Mission transitions occur when action results are unambiguous.
13. No real Codex, push, PR, deploy, monitor, Plane sync, or provider API call occurs.
14. Focused tests, typecheck, broader tests, build, doctor, and diff checks pass or any environment-only warning is documented.

## Spec Self-Review

- Placeholder scan: no placeholder requirements remain in this spec.
- Consistency check: Hub remains API-only, Orchestrator remains the control plane, WorkerRunner keeps queue wrapper WorkerRun semantics.
- Scope check: Batch 1 and Batch 2 are large but coherent because Hub control plane and generic actions share the same API contracts.
- Ambiguity check: real external actions remain out of scope; approval decisions do not execute real work in this phase.
