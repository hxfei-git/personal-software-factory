# Phase 18 Progress: Hub Control Plane And Generic Mission Actions

## Completed Scope

- Hub resource pages now read Projects, Missions, Bugs, WorkerRuns, Artifacts, and Approvals through Orchestrator API instead of local placeholders.
- Hub can create Missions for registered projects from `/missions/new` and open the created Mission detail page.
- Approval decisions can be recorded from Hub, but they do not execute real Codex, PR creation, deploy, monitor sync, or provider sync.
- Mission dry-run action preflight no longer rejects non-demo Missions solely because of the Mission id; it now checks that the Mission exists, its Project exists, and the Project Passport is available when the action needs it.
- WorkerRunner records `mission.action_result` events for completed Mission actions and conservative `mission.status.auto_transition` events only when the existing state machine allows the transition.
- Normal Hub navigation no longer falls back to the fixed demo Mission. The demo Mission remains available as a dashboard shortcut.

## Safety Boundary

Phase 18 keeps the system dry-run/default-safe. The system still does not execute real Codex by default, does not push, does not create PRs, does not deploy, does not create monitors, and does not call GitHub, Coolify, Uptime Kuma, Plane, or other provider APIs by default.

Approval decisions are records for readiness and audit. They do not bypass `PSF_ACTION_EXECUTION_MODE`, route-specific `PSF_ENABLE_REAL_*` gates, worker gates, provider gates, injected runner/transport requirements, or future explicit operator approvals.

Integration status and dry-run surfaces must keep `realNetworkCall: false` unless a later approved task intentionally implements real external calls.

## Verification Commands

Run the focused checks for the changed Phase 18 surfaces first:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx
pnpm --filter @psf/worker-runner test
git diff --check -- README.md docs/progress.md docs/progress/phase-18-hub-control-plane-and-generic-actions.md docs/safety.md docs/queue-runtime.md docs/hub-web.md docs/api.md docs/next-steps.md
```

Run broader checks when preparing the phase gate or after shared contract edits:

```bash
pnpm check
pnpm typecheck
pnpm test
```
