# Personal Software Factory Phase Acceptance Criteria

## Global Acceptance Rules

Every phase must end with:

- changed files documented;
- verification commands or manual checks documented;
- failed checks documented with reason;
- remaining risks documented;
- next phase entry conditions documented;
- no secrets added to tracked files;
- no production-changing action taken without approval.

For implementation phases, tests must be added or updated in proportion to the behavior changed.

## Phase 0: Architecture Confirmation

Acceptance criteria:

- root plan has been read completely;
- repository status has been checked;
- greenfield status has been recorded;
- system goal is documented;
- MVP scope is documented;
- non-goals are documented;
- safety boundaries are documented;
- risks and assumptions are documented;
- phase roadmap is documented;
- Phase 1 is not started before user confirmation.

Evidence:

- `docs/00-system-architecture.md`
- `docs/01-execution-roadmap.md`
- `docs/02-mvp-scope.md`
- `docs/03-risk-and-assumptions.md`
- `docs/04-phase-acceptance-criteria.md`

## Phase 01 - Monorepo Foundation

Acceptance criteria:

- package workspace files exist;
- API, Hub, worker, and package directories exist;
- root README explains local setup;
- root AGENTS guidance exists;
- `.env.example` exists and contains no real secrets;
- Docker Compose can start PostgreSQL and Redis;
- `pnpm install` succeeds;
- `pnpm typecheck` succeeds;
- `pnpm test` runs at least initial smoke tests.

## Phase 2: Schema and Database

Acceptance criteria:

- Prisma schema includes Project, Mission, MissionEvent, WorkerRun, QA Run, Bug, Artifact, Deployment, Monitor, and Approval;
- Zod schemas exist for Project Passport, Mission, Bug, QA Report, Deployment, and Events;
- migrations run successfully;
- seed data creates `ai-novelist` and a sample Mission;
- schema tests pass;
- invalid data produces clear validation errors.

## Phase 3: Core State and Services

Acceptance criteria:

- Mission status enum exists;
- valid transitions are accepted;
- invalid transitions are rejected;
- final states do not transition without explicit reopen logic;
- every transition writes MissionEvent;
- artifact store can save, read, and list artifacts;
- command runner records stdout, stderr, exit code, and timestamps;
- state machine and quality gate tests pass.

## Phase 4: Orchestrator API

Acceptance criteria:

- `GET /health` returns an ok response;
- Project APIs can create, list, read, update, refresh, and list project Missions;
- Mission APIs can create, read, plan, start, pause, cancel, retry, and list events/artifacts/bugs/QA runs;
- Approval APIs can approve and reject;
- WorkerRun APIs expose run details and logs;
- write routes reject missing or invalid API token;
- API integration tests pass.

## Phase 5: Project Registry and ai-novelist Intake

Acceptance criteria:

- `projects/ai-novelist/project.passport.yaml` exists;
- `projects/ai-novelist/AGENTS.md` exists;
- `projects/ai-novelist/qa-charter.md` exists;
- passport parser validates known-good files;
- invalid passports fail with clear messages;
- registry sync imports `ai-novelist` into the database;
- Hub/API can show `ai-novelist`.

## Phase 6: Mission Planner

Acceptance criteria:

- a natural-language request can create a Mission;
- `mission.md` is generated;
- `acceptance.md` is generated;
- risk level is assigned;
- high-risk Missions enter `approval_required`;
- normal Missions transition `received -> planning -> planned`;
- Mission artifacts are persisted.

## Phase 7: Codex Worker MVP

Acceptance criteria:

- worker can operate on a fake repository in tests;
- worker creates a non-main branch/worktree;
- worker injects Mission files;
- worker calls a mock Codex command successfully;
- stdout and stderr artifacts are saved;
- dev summary is written;
- test command results are recorded;
- successful run advances the Mission;
- failed run records failure and does not hide logs;
- worker does not modify `main`.

## Phase 8: Deterministic Playwright QA

Acceptance criteria:

- QA Worker can run Playwright against a sample web target;
- passing QA creates a QA report and advances Mission toward review;
- failing QA creates `qa-report.md`;
- failing QA creates schema-valid `bugs.json`;
- screenshots, traces, and HTML reports are saved when available;
- artifacts are visible through API or Hub;
- Mission transitions to `ready_for_review` or `bugs_found` based on result.

## Phase 9: AI Exploratory QA with Playwright MCP

Acceptance criteria:

- Playwright MCP setup is documented;
- AI QA reads acceptance criteria, Project Passport, and QA Charter;
- AI QA produces `qa-report.md`;
- AI QA produces schema-valid `bugs.json`;
- reproducible P1 bugs include reproduction steps, expected result, actual result, and evidence;
- generated regression specs compile or fail with clear repair feedback;
- vague or invalid AI output is rejected.

## Phase 10: Automated Fix Loop

Acceptance criteria:

- QA failure enqueues fix work;
- Codex fix mode reads `bugs.json` and `qa-report.md`;
- reproducible bugs have regression coverage before closure;
- regression tests run after fixes;
- bug status updates only after evidence passes;
- max attempt policy prevents infinite loops;
- exhausted attempts move Mission to paused or human review;
- Hub/API shows fix attempts.

## Phase 11: Hub Web MVP

Acceptance criteria:

- dashboard shows project and Mission status summary;
- user can see `ai-novelist`;
- user can create and start a Mission;
- Mission detail shows timeline, branch, PR, worker run, tests, QA report, bugs, artifacts, and approvals;
- user can approve or reject high-risk actions;
- basic auth protects the Hub;
- Hub E2E smoke tests pass.

## Phase 12: GitHub and PR Integration

Acceptance criteria:

- branch push works when credentials are configured;
- PR creation works when GitHub CLI or configured integration is available;
- PR body includes Mission, summary, checks, QA report link or path, and risks;
- QA report can be added as PR comment when configured;
- Mission stores PR URL;
- Hub displays PR URL;
- missing credentials produce a clear paused or manual-action state.

## Phase 13: Coolify Staging and Preview

Acceptance criteria:

- Coolify setup is documented;
- Deploy Worker can trigger or observe staging deployment when configured;
- deployment status is recorded;
- staging URL is saved;
- QA Worker can test the staging URL;
- production deploy requires approval;
- Coolify failure does not corrupt Mission state.

## Phase 14: Uptime Kuma Monitoring

Acceptance criteria:

- Hub can store and display monitor URLs;
- monitor status is visible when integration is configured;
- down status creates an event;
- Uptime Kuma unavailability does not crash the core system;
- monitoring can optionally trigger diagnosis or repair Mission later.

## Phase 15: Plane Integration

Acceptance criteria:

- Mission can link to a Plane issue URL;
- Bug can link to a Plane issue URL;
- optional API sync can create or update issues when configured;
- Hub shows Plane links;
- Plane outages do not block the core development loop.

## Phase 16: ai-novelist Closed-Loop Validation

Acceptance criteria:

- ai-novelist install, dev, build, and test commands are standardized;
- smoke E2E verifies the basic app path;
- duplicate-click and loading-state issues are tested;
- chapter generation enters review flow;
- review report can drive repair;
- export flow is covered;
- Playwright screenshots and traces are recorded;
- QA bugs become regression tests;
- the full flow can complete through PR readiness.

## Phase 17: Stability and Operations

Acceptance criteria:

- structured logging exists;
- worker heartbeat exists;
- stale Mission detection exists;
- retry with backoff exists;
- artifact retention policy exists;
- database backup docs exist;
- admin token rotation docs exist;
- crash recovery docs exist;
- system restart does not lose Mission audit trail.

## Phase 18: Temporal and LangGraph Enhancements

Acceptance criteria:

- upgrade trigger is documented with actual evidence;
- Temporal or LangGraph is introduced only for a demonstrated complexity need;
- existing Mission behavior remains compatible;
- migration path from BullMQ/state machine is documented;
- new workflow or graph behavior has tests.

