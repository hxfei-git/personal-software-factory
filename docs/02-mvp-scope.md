# Personal Software Factory MVP Scope

## MVP Objective

The MVP must prove that a personal developer can manage one real project through an AI-assisted development and QA loop:

```text
create Mission in Web
  -> Codex develops on branch/worktree
  -> Playwright tests the result
  -> QA report captures issues
  -> Codex fixes structured bugs
  -> regression tests pass
  -> GitHub PR is ready for review
```

The MVP is successful when this loop works for the first project, `ai-novelist`, without relying on manual copy-paste between tools for every step.

## In Scope

### Single-User Control Plane

- one local or single-VPS deployment;
- basic API token authentication;
- no multi-tenant account system;
- one operator with approval control.

### Project Management in Hub

- view registered projects;
- view project details;
- create and inspect Missions;
- see Mission timeline, status, current worker, branch, PR, logs, QA reports, bugs, and artifacts;
- approve or reject high-risk actions.

### Mission Management

- create a Mission from a natural-language request;
- store raw request;
- produce `mission.md` and `acceptance.md`;
- assign risk level;
- route high-risk Missions to approval;
- persist state transitions as events.

### Codex Worker

- create isolated git branch/worktree;
- inject Mission files;
- run Codex CLI for implementation or fix mode;
- run declared build/test commands;
- record WorkerRun logs and exit codes;
- write `dev-summary.md`;
- commit local changes;
- prepare branch for PR creation.

### Playwright QA Worker

- run deterministic Playwright tests against a target URL;
- collect screenshots, traces, and HTML reports;
- generate `qa-report.md`;
- generate schema-valid `bugs.json`;
- write artifacts to durable storage;
- transition Mission based on QA result.

### QA Report to Fix Loop

- feed `qa-report.md` and `bugs.json` to Codex fix mode;
- require regression tests for reproducible P0/P1/P2 bugs;
- cap automatic fix attempts;
- rerun regression and QA;
- stop in human-review state when attempts are exhausted.

### GitHub Branch and PR Management

- maintain non-main development branches;
- create or prepare PRs;
- include Mission summary, checks, QA report, and risk notes;
- show PR URL in Hub.

## Out of Scope for MVP

- multi-user SaaS;
- complex enterprise permissions;
- full Jira or Plane replacement;
- full PaaS or deployment platform;
- custom monitoring system;
- direct AI control of production servers;
- direct production deploy without approval;
- fully autonomous multi-agent platform;
- Temporal-based workflow engine;
- LangGraph-based agent graph;
- n8n as a core orchestrator;
- full Coolify automation;
- full Uptime Kuma API sync;
- full Plane API sync;
- support for many projects before `ai-novelist` proves the loop.

## Required First-Stage Modules

The first-stage MVP needs these modules to exist in working form:

- Hub Web;
- Orchestrator API;
- Project Registry;
- Mission Planner;
- Mission state machine;
- PostgreSQL persistence;
- Redis/BullMQ job queue;
- Artifact Store;
- Codex Worker;
- QA Worker with deterministic Playwright;
- Fix Worker mode or Codex Worker fix mode;
- GitHub branch/PR integration;
- Approval handling.

## Modules to Postpone

Postpone these until the MVP loop is stable:

- Coolify preview automation;
- Uptime Kuma status polling;
- Plane issue creation and sync;
- n8n notifications;
- AI exploratory QA if deterministic QA is not yet reliable;
- Temporal;
- LangGraph;
- object storage migration;
- advanced analytics;
- multi-project scheduling.

## MVP Quality Gates

A Mission cannot enter `ready_for_review` unless:

- build passed or was explicitly marked not applicable by the Project Passport;
- unit tests passed or were explicitly marked not applicable;
- required Playwright tests passed;
- QA report exists;
- `bugs.json` exists and validates;
- no open P0 or P1 bugs remain;
- dev summary exists;
- worker logs are saved;
- artifacts are linked from the Mission;
- branch or PR is available for review.

## MVP Safety Rules

- No direct push to `main`.
- No production deployment without approval.
- No deletion of user data without approval.
- No secret values in prompts, logs, artifacts, PR bodies, or comments.
- No unbounded automatic repair loop.
- No Mission state mutation without a MissionEvent.
- No AI QA bug closure without evidence or explicit human acceptance.

## MVP Success Scenario

The first complete scenario should be:

1. Register `ai-novelist`.
2. Create a Mission in the Hub.
3. Generate structured Mission and acceptance files.
4. Start Codex Worker.
5. Worker creates branch/worktree and implements a small change.
6. Worker runs project checks.
7. QA Worker runs Playwright against the result.
8. QA Worker creates `qa-report.md` and `bugs.json`.
9. If bugs are found, Codex fix mode runs and regression tests are added.
10. QA passes.
11. GitHub PR is created or prepared.
12. Hub shows events, logs, QA evidence, bug status, and PR link.

