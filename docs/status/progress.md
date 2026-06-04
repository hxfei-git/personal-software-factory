# 当前进度

## 当前事实源

当前架构事实源是 `../architecture/structure.md`。当前问题、风险、待改进项和文档地图在 `../../summary.md`。调试和验证记录在 `../debug/debug.md`。

重复当前事实的详细 phase 和 batch rollup 已删除。本文档只保留简洁的当前进度摘要。

## Latest Update

Batch 05/06 is complete for gated fix/regression enforcement and GitHub PR gate preview. `fix-real` queued payloads now carry open bugs, attempts, Project Passport, Mission files, verification commands, regression evidence, branch/workspace context, and approvals. Worker Runner persists accepted BugReport updates only after regression evidence and injected verification succeed, then conservatively transitions through legal Mission states toward `ready_for_review`. `github-pr` now requires approved `EXTERNAL_COST_RISK`, queues a safe PR preview context, and persists a child integration WorkerRun plus PR preview Artifact while defaulting to manual-action/no-network. Focused package tests, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check` passed for this batch.

Batch 03/04 is complete for the local QA and local Codex proof surfaces. Orchestrator now queues `qa.playwright` with Project Passport, QA charter, target URL, Mission files, and e2e command metadata, and queues `codex.real` only after local mirror preflight builds a safe payload with Mission files, project `AGENTS.md`, review-only commands, workspace root, default branch, and an `agent/*` branch.

Deterministic QA now records scenario-level evidence, blocks missing or invalid `targetUrl` and unverified selectors as manual action instead of fabricating `passed`, and persists screenshot, trace, log, and scenario IDs when present. Worker Runner persists queued QA child resources and conservative status outcomes under the queue wrapper WorkerRun. Codex fixture proof covers an operator-prepared local mirror, isolated worktree, `agent/*` branch, injected spawn path, generated artifacts, no mirror `main` mutation, no push, and no external provider call.

Worker Runner `codex.real` integration remains default-safe: it requires local `repoUrl` and `agent/*` branch preflight, returns `manual_action` without an injected runner, and only passes queued context to an injected runner in this phase. Hub Mission detail and resource views expose QA evidence paths while display redaction prevents token, password, API key, authorization, session, credential, and secret-like values from rendering.

## Phase 18 Documentation

- Hub resource pages now read Projects, Missions, Bugs, WorkerRuns, Artifacts, and Approvals from Orchestrator API.
- Hub can create Missions through `/missions/new`, then open the created Mission detail page.
- Approval decisions can be recorded but do not execute real Codex, PR creation, deploy, monitor sync, or provider sync.
- Mission dry-run action preflight now checks Mission, Project, and Project Passport availability instead of rejecting non-demo Mission IDs by default.
- WorkerRunner records `mission.action_result` and conservative `mission.status.auto_transition` events.
- Real external actions remain disabled by default and integration dry-run/status responses keep `realNetworkCall: false`.

## Completed Tasks 1-13

1. Shared safety package: added safety utilities for redaction, command/path policy, and real-mode guardrails used by worker and integration paths.
2. Artifact store and retention policy: documented local artifact boundaries and path-only handling for large evidence.
3. Queue and API real-mode job contracts: added explicit real/gated action contracts instead of arbitrary job submission.
4. Real Codex runner gated mode: added a real-runner abstraction that stays blocked unless `ENABLE_REAL_CODEX=1`, safe Codex CLI policy, workspace guards, runtime limits, and approvals are satisfied.
5. Deterministic Playwright QA runner: added a gated real browser path requiring target URL plus `ENABLE_REAL_PLAYWRIGHT=1` or an injected runner.
6. AI exploratory QA gated mode: added the abstraction and validation path while keeping MCP/browser execution disabled by default.
7. Real auto-fix loop gated mode: connected the fix loop to gated real contracts while preserving dry-run/manual-action defaults.
8. Real integration adapters with injected transports: added GitHub, Coolify, Uptime Kuma, and Plane real adapters that require credentials, policy gates, and injected transports before network activity.
9. Worker Runner real job handlers: mapped whitelisted real contract jobs to gated handlers and safe manual-action outputs by default.
10. Orchestrator API and Hub visibility: exposed protected real-action readiness surfaces and route gates such as `PSF_ENABLE_REAL_CODEX` and `PSF_ENABLE_REAL_GITHUB_PR`.
11. ai-novelist real loop readiness: documented readiness boundaries for the first managed project without enabling autonomous external actions.
12. Operations hardening: extended doctor/safety guidance for real gates, queue runtime, workspace roots, and secret redaction.
13. Temporal and LangGraph decision record: kept both deferred until the BullMQ-based control plane needs durable workflow complexity.

## Task 14 Documentation And Verification

- README now distinguishes real-but-disabled abilities from default dry-run/mock behavior.
- `.env.example` now lists the phase real-mode variables and Orchestrator route gates with empty placeholders/comments for secrets.
- This progress file summarizes changed capabilities, safety boundaries, migrations, test commands, and remaining manual actions.
- Real external APIs were not called during this documentation task.
- Final verification passed after the documentation rollup, targeted test-stability commits, and final security-review fixes.

## Changed Capability List

Real but disabled/gated capabilities now include Codex real runner, deterministic Playwright QA, AI exploratory QA abstraction, real fix loop contract, GitHub/Coolify/Uptime Kuma/Plane real adapters via injected transport, and Worker Runner real job handlers.

Default-safe capabilities remain local dry-runs, mock integration status/dry-runs, manual-action outputs, demo workflow, and normal test execution. Provider real-mode flags only make real mode eligible; they do not call networks without credentials, route gates, approvals, runtime wiring, and injected transports.

## Default Safety Boundaries

- Codex child processes now receive only an allowlisted non-secret environment, and local repository mirrors must live under `PSF_WORKSPACE_ROOT/mirrors` after realpath resolution.
- Queued real-action jobs record approved approval records separately from worker policy grant ids.
- Uptime Kuma runtime session tokens are redacted from post-login transport error results.
- `realNetworkCall` remains `false` on default integration status and dry-run surfaces.
- Orchestrator real-action routes require `PSF_ACTION_EXECUTION_MODE=queued` plus route-specific `PSF_ENABLE_REAL_*` gates.
- Worker/provider gates such as `ENABLE_REAL_CODEX`, `ENABLE_REAL_PLAYWRIGHT`, `ENABLE_AI_EXPLORATORY_QA`, and `ENABLE_REAL_GITHUB` remain disabled in `.env.example`.
- Secrets must not appear in API responses, Hub UI state, logs, artifacts, PR bodies, Issue bodies, or integration outputs.
- No push, PR creation, deployment, monitor creation, Plane sync, production mutation, or provider API call is part of the default path.

## Migrations

Task 14 is documentation-only and introduces no Prisma migration. The phase rollup does not change schema or runtime code.

## Verification Results

Final coordinator gates passed:

```bash
pnpm install --lockfile-only
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm psf doctor
git diff --check
git status --short --branch
```

`pnpm psf doctor` completed with warnings because `.env` and optional provider credentials are absent in this local checkout. That is expected for the safe default setup and did not enable any real external call.

Focused checks that match the changed real-mode surfaces also passed:

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
```

## Remaining Manual Actions

- Operator must provide real credentials only in local `.env` or secret storage, never in tracked docs.
- Operator must explicitly approve and wire queued runtime, route gates, worker gates, injected runners/transports, and provider operation gates before any real external action.
- Provider API behavior should remain behind fake transports in tests unless a later approved task intentionally performs real network validation.
