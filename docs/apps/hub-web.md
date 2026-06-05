# Hub Web

Hub Web is the local operator console for Personal Software Factory. The current implementation is a React/Vite app that reads Orchestrator API data for core resources and triggers only protected dry-run actions or approval record updates through the Orchestrator API.

## Start

Start the Orchestrator API first:

```bash
pnpm dev:api
```

Start Hub Web:

```bash
pnpm dev:hub
```

Default Hub URL: `http://127.0.0.1:5173`.

Default API URL: `http://127.0.0.1:3000`.

## Environment

Hub Web reads:

- `VITE_ORCHESTRATOR_API_URL`: Orchestrator API base URL.
- `VITE_PSF_API_TOKEN`: local bearer token for protected POST dry-run actions.

`VITE_PSF_API_TOKEN` is browser-visible and must be a local throwaway token. Do not use production or shared provider credentials in any `VITE_*` value.

## Demo Flow

Generate dry-run demo data with a sample bug:

```bash
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Then open `http://127.0.0.1:5173` and inspect:

- Dashboard metrics, recent Missions, bugs, QA runs, WorkerRuns, and Artifacts from `GET /dashboard`.
- Resource pages for Projects, Missions, Bugs, WorkerRuns, Artifacts, and Approvals from Orchestrator API list endpoints.
- Mission creation at `/missions/new`; successful creation opens the created Mission detail page.
- Dashboard dry-run buttons for `POST /demo/ai-novelist`, with and without the sample bug payload, plus `Refresh Dashboard`.
- Mission Detail for `mission-0001-ai-novelist-chapter-review` from `GET /missions/:id/summary`.
- Mission Detail dry-run buttons for `plan`, `codex-dry-run`, `qa-dry-run`, `fix-dry-run`, and `loop-dry-run`, plus a sample-bug QA dry-run and `Refresh Summary`.
- Guarded real-mode buttons for Codex, Playwright QA, AI QA, fix, GitHub PR, Coolify deploy, Uptime Kuma monitor sync, and Plane sync. Mission Detail reads API-provided `canQueue`, `canExecute`, and `blockers[]`; it does not infer env, approval, transport, runner, or provider state locally. Guarded action labels use queue/manual-action language rather than `Run real ...` when execution blockers remain; GitHub PR defaults to PR preview/manual-action rather than push or PR creation.
- Fix/regression evidence and GitHub PR preview child artifacts when Worker Runner records them under the Mission summary.
- Real-mode readiness and policy blockers from the Mission summary, including queue/execute status, recommended next action, structured blocker messages, disabled/manual-action states, missing environment names, required approval types, and missing approval types.
- External PR, deployment, monitor, and Plane links/statuses when the Orchestrator summary reports them.
- QA report and BugReport evidence linked from the Mission summary.
- WorkerRun detail/log previews, QARun detail, Artifact detail, approval action state, approval decision buttons, and artifact retention metadata from the Mission summary.
- Integration status and dry-run cards from `GET /integrations` and `POST /integrations/:name/dry-run`.

Normal Hub navigation no longer falls back to the fixed demo Mission. The demo Mission remains linked as a quick-start shortcut from Dashboard.

## Safety Boundary

Hub Web is not the source of truth for Mission state. It reads from the Orchestrator and sends protected dry-run requests, Mission creation requests, and Approval decision requests. It does not run shell commands, read or write the filesystem, access the database directly, reset demo data, delete records, or call GitHub, Coolify, Uptime Kuma, Plane, or other external providers directly. Real-mode status, links, approvals, and retention metadata are rendered only from Orchestrator API responses; Hub does not inspect the database or filesystem to produce those views.

Approval decision buttons record `approved`, `rejected`, or `cancelled` on Approval records only. They do not execute real Codex, create PRs, deploy, create monitors, sync Plane, or bypass real-action gates.

All protected POST buttons require `VITE_PSF_API_TOKEN`. If the token is missing, Hub shows a local-token setup hint without printing any token value. Token and password values must not be rendered, logged, stored in artifacts, or copied into PR/Issue preview bodies.
