# Approval Policy

Personal Software Factory is single-user, but high-risk automation still requires explicit human approval. Approval records make those decisions auditable before workers act.

## Current API Types

The API currently accepts these Approval types:

- `PRODUCTION_DEPLOY`
- `DATABASE_MIGRATION`
- `SECRET_CHANGE`
- `DESTRUCTIVE_OPERATION`
- `EXTERNAL_COST_RISK`
- `SECURITY_RISK`

Approvals start as `pending` and can be decided as `approved`, `rejected`, or `cancelled`.

## Actions That Require Approval

Require approval before any of these actions:

- production release or production deploy;
- changing production or staging credentials;
- database migration against non-disposable data;
- destructive filesystem or database operation;
- real Codex execution after `ENABLE_REAL_CODEX=1` is introduced;
- remote branch push or PR creation when credentials are configured;
- direct interaction with paid external services;
- security-sensitive changes, including auth bypass, token handling, or permission broadening;
- deleting user writing data or generated artifacts;
- running commands outside the declared workspace boundary;
- overriding main/master branch protection.

## Codex Worker Gate

Codex Worker behavior is default-disabled and default-safe. Any gated real-runner execution must require all of the following:

- `ENABLE_REAL_CODEX=1`;
- an approved Approval record for the specific Mission/run;
- current branch is not `main` or `master`;
- workspace path is isolated under `workspaces/`;
- command and prompt artifacts are available for review;
- no secret values are included in prompts or artifacts;
- an intentionally injected runner and runtime wiring for the approved real action.

The current dry-run command artifact is not executable and exits without invoking Codex.

## Release Gate

A production release must wait for explicit approval and later phase evidence:

- Mission is ready for review;
- required tests and QA have passed;
- no open P0/P1 bugs remain;
- PR or review branch is available;
- rollback plan is documented;
- production credentials are not exposed to workers or artifacts.

## Decision Records

Approval decisions should include:

- who requested the action;
- who decided it;
- reason and scope;
- target environment or service;
- linked Mission and WorkerRun when available;
- decision notes explaining limits or rejection reasons.

A rejected or cancelled Approval must not be reused for later execution.
