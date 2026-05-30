# Personal Software Factory Risks and Assumptions

## Current Assumptions

- The repository is greenfield and currently contains only the root plan file.
- The root plan file is named `personal-software-factory-plan.md`, although the plan text refers to `plan.md`.
- The first managed project is `hxfei-git/ai-novelist`.
- The first deployment target is local development or a single VPS.
- The first user model is single-user.
- The MVP stack is TypeScript, Node.js 20+, pnpm, Turborepo, Fastify, Next.js, Prisma, PostgreSQL, Redis, BullMQ, and Playwright.
- The first QA layer is deterministic Playwright.
- Playwright MCP and AI exploratory QA are added after deterministic QA is working.
- GitHub branch and PR integration can start through git CLI and optionally GitHub CLI.
- Production deployment requires explicit human approval.
- External service credentials are not assumed to exist during early phases.

## Key Risks

### Scope Creep

Risk:

The plan spans project management, AI development, QA, deployment, monitoring, and external integrations. Implementing all of it at once would create a fragile system with no proven core loop.

Mitigation:

Build only the closed loop first: Mission, Codex Worker, deterministic QA, bug report, fix loop, PR, and Hub visibility. Defer Coolify, Uptime Kuma, Plane, Temporal, LangGraph, and n8n.

### Unclear Target Project Commands

Risk:

`ai-novelist` may not have stable install, dev, build, and test commands. Workers cannot safely automate a project without reliable commands.

Mitigation:

Make Project Passport validation a first-class phase. The first ai-novelist Missions should standardize startup, build, test, and E2E behavior before deeper feature work.

### Codex CLI Contract Changes

Risk:

Codex CLI flags, output format, MCP support, or sandbox behavior may change.

Mitigation:

Hide Codex invocation behind `runCodex.ts`. Test it with a mock command. Store raw stdout/stderr as artifacts. Treat Codex command construction as a replaceable adapter.

### AI QA Non-Determinism

Risk:

AI exploratory QA may produce vague bugs, invalid JSON, unstable regression tests, or inconsistent reproduction steps.

Mitigation:

Use deterministic Playwright first. Validate all AI-produced `bugs.json` files against schema. Dry-run generated tests. Reject vague bugs that lack reproduction, expected result, actual result, and evidence.

### Worker Safety

Risk:

Workers execute shell commands and touch git workspaces. A bad command could modify the wrong path, leak logs, or damage user data.

Mitigation:

Run workers in bounded workspaces. Avoid host root mounts. Mask secrets. Require approval for destructive operations, production deployment, database migration, auth changes, secret changes, and large risky refactors.

### State Drift

Risk:

Long-running jobs can crash, retry, or partially complete while Mission state becomes inaccurate.

Mitigation:

Use explicit state transitions, WorkerRun records, heartbeat later, and event logs for every meaningful change. Add stale mission detection in the operations phase.

### Infinite Repair Loops

Risk:

Codex and QA could repeatedly alternate without convergence.

Mitigation:

Set `max_mission_attempts = 3` and `max_bug_fix_attempts = 2` by default. Exceeding attempts moves the Mission to paused or human review.

### Secret Leakage

Risk:

Logs, prompts, artifacts, screenshots, PR comments, or QA reports could expose tokens or private data.

Mitigation:

Never put real secrets into prompts. Keep `.env` out of git. Mask known secret patterns before displaying logs or writing public artifacts. Keep production credentials outside worker prompts.

### Artifact Growth

Risk:

Screenshots, traces, Playwright reports, and logs can grow quickly.

Mitigation:

Use local artifact storage for MVP with predictable paths. Add retention and cleanup policy in the stability phase. Move to object storage only when volume requires it.

### External Service Availability

Risk:

GitHub, Coolify, Uptime Kuma, Plane, or n8n may be unavailable, unconfigured, or missing credentials.

Mitigation:

Make GitHub PR optional until configured. Treat Coolify, Uptime Kuma, Plane, and n8n as non-core integrations. The core Mission loop should still work locally.

### Production Risk

Risk:

An AI worker could deploy broken code or perform a risky operation if production gates are weak.

Mitigation:

Production deployment is out of the MVP automation path unless approved. Release requires human approval, merged PR, successful deploy, healthy monitor, and rollback documentation.

## Technical Trade-Offs to Confirm Before Phase 1

### Queue Versus Durable Workflow

Default:

Use Redis and BullMQ first.

Reason:

The MVP needs a clear, testable job system more than it needs durable workflow complexity.

Revisit when:

Missions regularly span long periods, recovery becomes complex, or multiple projects require stronger orchestration.

### Local Artifact Store Versus Object Storage

Default:

Use local filesystem artifacts.

Reason:

The first version runs locally or on one VPS and benefits from simple paths and easy inspection.

Revisit when:

Artifact volume grows, multiple worker hosts exist, or remote access is needed.

### Deterministic QA Versus AI Exploratory QA

Default:

Build deterministic Playwright QA first.

Reason:

The fix loop needs repeatable failures before AI exploration is useful.

Revisit when:

Baseline Playwright reports and bug schemas are stable.

### GitHub CLI Versus GitHub App

Default:

Start with git CLI and optional GitHub CLI.

Reason:

This is simpler for a personal local/VPS setup.

Revisit when:

Webhook sync, permissions, or multi-project management require app-level integration.

### Hub-Driven Actions Versus CLI-First Actions

Default:

Expose both API and CLI paths where practical, but keep the Orchestrator as the source of truth.

Reason:

CLI makes early phases testable before the full Hub is polished. Hub remains the main user control surface.

Revisit when:

Hub workflows cover all common operations.

### Local Staging Versus Coolify Preview

Default:

Use local staging or project dev server for early QA.

Reason:

Coolify integration is useful but should not block the development and QA loop.

Revisit when:

PR preview URLs are needed for realistic browser QA or external review.

## Non-Negotiable Constraints

- No direct production mutation by AI.
- No direct push to `main`.
- No data deletion without approval.
- No hidden test failures.
- No unstructured QA bug reports.
- No state transition without an event.
- No implementation phase starts before the previous phase has acceptance evidence or user-approved exception.

