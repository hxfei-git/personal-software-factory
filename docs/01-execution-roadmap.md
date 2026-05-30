# Personal Software Factory Execution Roadmap

## Roadmap Principle

Personal Software Factory must be built as a sequence of verifiable phases. The project should not attempt to implement the whole long-term vision at once.

The first release should prove one closed loop:

```text
Project -> Mission -> Codex Worker -> Playwright QA -> bugs.json -> Codex Fix -> Regression -> PR
```

Everything else should either support this loop or wait.

## Phase Grouping

### Phase 0: Architecture Confirmation

Goal:

- convert the root plan into engineering documents;
- confirm MVP scope, risks, assumptions, and phase gates;
- stop before business implementation.

Deliverables:

- `docs/00-system-architecture.md`
- `docs/01-execution-roadmap.md`
- `docs/02-mvp-scope.md`
- `docs/03-risk-and-assumptions.md`
- `docs/04-phase-acceptance-criteria.md`

### Phase 1: Monorepo Foundation

Goal:

- create the TypeScript monorepo foundation.

Primary outputs:

- root package setup;
- workspace configuration;
- base TypeScript configuration;
- API, Hub, worker, package directories;
- Docker Compose for PostgreSQL and Redis;
- root README and AGENTS guidance.

This phase should not build the full workflow. It only makes the repository runnable and ready for incremental implementation.

### Phase 2: Schema and Database

Goal:

- create durable data structures for the factory.

Primary outputs:

- Prisma schema for Project, Mission, MissionEvent, WorkerRun, QA Run, Bug, Artifact, Deployment, Monitor, and Approval;
- Zod schemas for project passport, missions, bugs, QA reports, deployment, and events;
- migrations, seed data, and schema tests.

### Phase 3: Core State and Services

Goal:

- implement the core rules that make the factory deterministic.

Primary outputs:

- Mission state machine;
- transition validation;
- MissionEvent logging;
- quality gates;
- artifact store;
- command runner with stdout, stderr, exit code, and timing records.

### Phase 4: Orchestrator API

Goal:

- expose the control plane over HTTP.

Primary outputs:

- Fastify API;
- health endpoint;
- Project, Mission, Approval, WorkerRun, Event, and Artifact routes;
- Prisma integration;
- single-user API token auth;
- API integration tests.

### Phase 5: Project Registry and ai-novelist Intake

Goal:

- make `ai-novelist` the first managed project.

Primary outputs:

- `projects/ai-novelist/project.passport.yaml`;
- `projects/ai-novelist/AGENTS.md`;
- `projects/ai-novelist/qa-charter.md`;
- passport parser;
- registry sync command;
- seed Missions for standardization and QA.

### Phase 6: Mission Planner

Goal:

- convert a raw request into a structured Mission.

Primary outputs:

- Mission creation command/API;
- `mission.md`;
- `acceptance.md`;
- risk assessment;
- planned state transition;
- high-risk approval routing.

MVP can begin with deterministic templates. Codex-generated planning can be added after the state flow is reliable.

### Phase 7: Codex Worker MVP

Goal:

- run AI implementation inside an isolated workspace.

Primary outputs:

- clone or update project workspace;
- git worktree and branch creation;
- mission file injection;
- Codex CLI runner abstraction;
- WorkerRun logging;
- test command execution;
- dev summary artifact;
- local commit.

The worker must be testable with a mock Codex command before using a real Codex invocation.

### Phase 8: Deterministic Playwright QA

Goal:

- establish repeatable browser QA before AI exploration.

Primary outputs:

- QA Worker;
- Playwright runner;
- target URL support;
- screenshot, trace, and HTML report collection;
- `qa-report.md`;
- `bugs.json`;
- artifact persistence;
- Mission transition to `ready_for_review` or `bugs_found`.

### Phase 9: AI Exploratory QA with Playwright MCP

Goal:

- let AI QA explore the product like a human tester.

Primary outputs:

- Playwright MCP setup documentation;
- QA exploration prompt;
- runner for AI exploration;
- qa-charter input;
- schema validation of AI output;
- generated regression spec dry run.

This phase should start only after deterministic QA is stable.

### Phase 10: Automated Fix Loop

Goal:

- close the QA to repair loop.

Primary outputs:

- fix queue;
- Codex fix mode;
- regression test requirement;
- bug status update rules;
- max attempt policy;
- Hub-visible fix rounds.

### Phase 11: Hub Web MVP

Goal:

- give the user one place to see and control the factory.

Primary outputs:

- dashboard;
- projects list/detail;
- missions list/detail;
- event timeline;
- worker logs;
- QA report and bugs views;
- artifact links;
- approval list and actions;
- basic auth.

### Phase 12: GitHub and PR Integration

Goal:

- connect local automation to reviewable code changes.

Primary outputs:

- push branch when configured;
- create PR when configured;
- PR body with Mission summary and QA state;
- PR comment for QA report;
- PR URL stored on Mission;
- webhook sync later.

### Phase 13: Coolify Staging and Preview

Goal:

- provide deployable preview targets for QA.

Primary outputs:

- Coolify configuration docs;
- deploy worker integration;
- deployment status tracking;
- staging URL persistence;
- production deploy approval.

This phase is post-MVP unless local staging is insufficient.

### Phase 14: Uptime Kuma Monitoring

Goal:

- surface runtime health in the Hub.

Primary outputs:

- monitor URL storage;
- status display;
- optional status polling;
- ProjectEvent on outages;
- optional repair or diagnosis Mission creation.

### Phase 15: Plane Integration

Goal:

- sync Mission and Bug progress into a dedicated project management tool.

Primary outputs:

- Plane URL linking;
- optional issue creation;
- optional state sync;
- Hub links to Plane records.

### Phase 16: ai-novelist Closed-Loop Validation

Goal:

- prove the factory on the first real project.

Primary outputs:

- standardized ai-novelist commands;
- smoke E2E;
- interaction state fixes;
- chapter review and repair flow;
- full AI QA novel creation journey.

### Phase 17: Stability and Operations

Goal:

- make the system reliable enough for long-running use.

Primary outputs:

- structured logs;
- worker heartbeat;
- stale mission detection;
- retry with backoff;
- artifact cleanup;
- backup documentation;
- crash recovery documentation.

### Phase 18: Temporal and LangGraph Enhancements

Goal:

- upgrade orchestration and AI decision flows only when complexity requires it.

Temporal is justified by long mission duration, complex recovery, compensation, and concurrency. LangGraph is justified by complex planning, QA reasoning, repair strategy branching, or stateful human-in-the-loop AI decisions.

## First-Stage Implementation Boundary

The first implementation stage should mean the first usable factory loop, not every numbered phase. It should cover Phases 1 through 12 at a minimal level:

- repository foundation;
- database and schemas;
- state machine and artifacts;
- API;
- project registry;
- mission creation;
- Codex Worker MVP;
- deterministic QA Worker;
- automated fix loop;
- Hub MVP;
- GitHub branch/PR support.

Coolify, Uptime Kuma, Plane, Temporal, LangGraph, n8n, and multi-project scaling should wait until the first closed loop works with `ai-novelist`.

## Stop Points

Each phase must stop with:

- changed files listed;
- tests or validation commands recorded;
- remaining risks documented;
- acceptance criteria checked;
- next phase entry conditions stated.

No later phase should start until the current phase has passing acceptance criteria or an explicit user-approved exception.

