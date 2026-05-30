# Personal Software Factory System Architecture

## Phase 0 Context

This document refines `personal-software-factory-plan.md` into the first engineering architecture for the Personal Software Factory / 个人 AI 软件工厂.

The repository is currently greenfield. There is no application code yet. The root plan file is present as `personal-software-factory-plan.md`; later setup may create or rename a canonical `plan.md` if the team wants the filename to match the plan text exactly.

## System Goal

Personal Software Factory is a single-user AI software factory control plane. Its purpose is to turn a natural-language request into a controlled delivery loop:

```text
request
  -> structured mission
  -> isolated branch/worktree
  -> Codex Worker implementation
  -> build and deterministic tests
  -> Playwright QA
  -> QA report and bugs.json
  -> Codex fix loop
  -> regression tests
  -> GitHub PR
  -> human approval for high-risk actions
```

The system is not primarily a chat product, a project management clone, a PaaS, or a monitoring platform. It is a control plane that makes AI development visible, repeatable, testable, and reviewable for a personal developer.

## Problem It Solves

Personal developers can ask AI agents to write code, but the hard parts remain scattered:

- requirements are informal and hard to verify;
- AI code changes often lack a stable branch, test record, and review trail;
- browser QA is manual or omitted;
- defects found by QA are not automatically converted into structured regression work;
- deployment and monitoring status are disconnected from development work;
- high-risk actions need explicit approval instead of hidden automation.

Personal Software Factory solves this by creating one closed loop around mission planning, development, QA, bug extraction, automated repair, PR creation, and approval.

## Recommended Architecture

The MVP should use a modular TypeScript monorepo with a queue-backed Orchestrator:

```text
Hub Web
  -> Orchestrator API
    -> PostgreSQL data model
    -> Redis/BullMQ queues
    -> Artifact store
    -> Mission state machine
      -> Codex Worker
      -> QA Worker
      -> later Deploy Worker
      -> later Monitor Worker
  -> GitHub branch and PR integration
```

This approach is recommended because it keeps the first version understandable and testable while preserving a path to durable workflow engines later.

## Alternatives Considered

### Option A: Queue-Based Modular Monorepo

Use Next.js for the Hub, Fastify for the API, Prisma/PostgreSQL for durable state, Redis/BullMQ for jobs, and Playwright for QA.

Trade-offs:

- Best fit for the MVP because every part can be tested independently.
- Lower operational complexity than Temporal or LangGraph.
- Requires careful state transition and retry discipline because BullMQ is not a full durable workflow engine.

Decision: use this for MVP.

### Option B: Durable Workflow First

Use Temporal from the first phase and model each Mission as a long-running workflow.

Trade-offs:

- Stronger recovery, retries, and timeouts.
- More infrastructure and modeling cost before the core loop has proven value.
- Slower path to a usable first release.

Decision: defer until long-running missions, recovery needs, or multi-project concurrency justify it.

### Option C: Hub-First Thin Automation

Build the Web UI first and call shell scripts manually behind buttons.

Trade-offs:

- Fast to demo.
- Weak auditability, brittle error handling, and poor QA/fix loop enforcement.
- Risks becoming a dashboard over ad hoc scripts instead of a software factory.

Decision: reject for the core architecture. The Hub should observe and control a real Orchestrator, not replace it.

## Core Modules

### Hub Web

Responsibilities:

- manage projects;
- create and inspect Missions;
- show Mission timeline and Worker logs;
- show QA reports, bugs, screenshots, traces, and artifacts;
- expose approval actions;
- link to GitHub PRs and later external systems.

The Hub is a control surface. It should not contain business workflow rules that belong in the Orchestrator.

### Orchestrator API

Responsibilities:

- own Project, Mission, WorkerRun, QA Run, Bug, Artifact, Approval, and Event records;
- validate requests;
- enforce Mission state transitions;
- enqueue worker jobs;
- expose APIs to the Hub and workers;
- persist events for auditability.

The Orchestrator is the source of truth for Mission state.

### Mission State Machine

The state machine prevents ambiguous progress. MVP states should include:

```text
received
planning
planned
approval_required
dev_queued
dev_running
build_running
test_running
staging_ready
qa_running
bugs_found
fixing
regression_running
ready_for_review
release_approval
released
paused
blocked
failed
cancelled
```

Every transition must create a MissionEvent. Invalid transitions should fail visibly and should not silently rewrite state.

### Project Registry

Responsibilities:

- read `projects/*/project.passport.yaml`;
- validate startup, build, test, QA, deployment, and risk rules;
- sync known projects into the database;
- provide a stable contract for workers.

The first registered project is `ai-novelist`.

### Codex Worker

Responsibilities:

- create or update a local project workspace;
- create an isolated branch/worktree;
- inject Mission and acceptance files;
- run Codex CLI for implementation or fixes;
- run declared checks;
- record stdout, stderr, diffs, summary, and exit status;
- commit changes locally;
- create or prepare a GitHub PR when enabled.

Codex Worker must not push to `main`, deploy production, delete data, or expose secrets.

### QA Worker

Responsibilities:

- run deterministic Playwright tests;
- collect screenshots, traces, reports, logs, and console/network failure evidence;
- generate `qa-report.md`;
- generate schema-valid `bugs.json`;
- later run AI exploratory QA through Playwright MCP;
- ensure reproducible bugs become regression tests.

Deterministic Playwright QA is part of the MVP. Playwright MCP exploration is an enhancement after the deterministic loop is stable.

### Fix Loop

Responsibilities:

- convert open bugs into Codex fix input;
- require or create regression coverage for reproducible bugs;
- run targeted tests and then QA again;
- cap automatic attempts;
- move to paused or human review when attempts are exhausted.

This loop is the core value of the system.

### Artifact Store

Responsibilities:

- store Mission files, acceptance criteria, dev summaries, QA reports, `bugs.json`, logs, screenshots, traces, Playwright reports, and regression specs;
- avoid spaces in generated paths;
- mask secrets before writing displayable logs;
- keep artifacts addressable from the Hub.

Local filesystem storage is sufficient for MVP. MinIO or object storage can be introduced later if artifact volume requires it.

### GitHub Integration

Responsibilities:

- manage branches and PRs;
- attach Mission summary and QA report to PRs;
- sync PR status back to Mission records later.

MVP can use git CLI and optionally GitHub CLI. A GitHub App can wait until the workflow proves stable.

### Later Integrations

Coolify, Uptime Kuma, Plane, n8n, Temporal, and LangGraph are not first-stage core dependencies.

They should be integrated after the basic loop proves useful:

- Coolify: preview and production deployment orchestration;
- Uptime Kuma: runtime health status;
- Plane: issue and roadmap sync;
- n8n: low-risk notifications and webhook glue;
- Temporal: durable workflow upgrade;
- LangGraph: complex AI decision graphs.

## Data Flow

```text
1. User creates a Mission in Hub.
2. Orchestrator stores raw request and emits MISSION_CREATED.
3. Mission Planner creates mission.md and acceptance.md.
4. Orchestrator transitions Mission to planned or approval_required.
5. User starts approved Mission.
6. Codex Worker creates branch/worktree and runs implementation.
7. Worker records logs, summary, artifacts, and check results.
8. QA Worker runs Playwright against local or staging target.
9. QA Worker emits qa-report.md and bugs.json.
10. If bugs exist, Fix Worker runs Codex in fix mode.
11. Regression tests run and QA repeats within attempt limits.
12. Passing Mission becomes ready_for_review.
13. GitHub PR is created or linked.
14. Production release waits for explicit approval.
```

## Required First-Stage Modules

For the first usable Personal Software Factory release, the required modules are:

- Project Registry with Project Passport validation;
- Orchestrator API and durable data model;
- Mission state machine and event log;
- queue-backed WorkerRun tracking;
- Codex Worker MVP with branch/worktree isolation;
- deterministic Playwright QA Worker;
- QA Report and `bugs.json` artifact flow;
- automatic fix loop with attempt caps;
- Hub pages for projects, missions, events, QA, bugs, artifacts, and approvals;
- GitHub branch and PR creation or preparation.

## Deferred Modules

These should not block the first closed loop:

- full Coolify preview automation;
- Uptime Kuma API synchronization;
- Plane API synchronization;
- n8n notification workflows;
- Temporal durable workflows;
- LangGraph agent graphs;
- multi-user or enterprise permission system;
- multi-tenant SaaS support;
- full production deployment automation;
- self-hosted monitoring implementation.

## Technical Decisions for Phase 1 Planning

The following decisions should be fixed before implementation starts:

- Package manager: use `pnpm`.
- Runtime: use Node.js 20+.
- Monorepo: use pnpm workspaces and Turborepo.
- API: use Fastify.
- Hub: use Next.js.
- Database: use PostgreSQL through Prisma.
- Queue: use Redis and BullMQ.
- Schema validation: use Zod for config and artifact inputs.
- QA baseline: deterministic Playwright first.
- AI QA: Playwright MCP after baseline QA works.
- Artifact storage: local filesystem in MVP.
- Auth: single-user API token auth in MVP.
- GitHub: start with git CLI and optional GitHub CLI.

## Safety Boundaries

- AI workers operate only inside managed workspaces.
- No direct push to `main`.
- No production deployment without approval.
- No destructive data operation without approval.
- No secrets in prompts, artifacts, logs, or PR comments.
- Automatic repair attempts are capped.
- Worker failures must be recorded instead of hidden.
- Generated QA findings must include reproduction, expected result, actual result, and evidence.

