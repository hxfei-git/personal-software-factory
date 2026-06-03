# Real Execution And Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the post-Phase-17B path from dry-run/demo MVP to gated real execution, deterministic QA, external integrations, Hub visibility, and operations hardening while preserving dry-run safety.

**Architecture:** Keep the existing React/Vite Hub, Fastify Orchestrator API, BullMQ-backed Worker Runtime, Worker Runner, Mission state machine, queue wrapper WorkerRun semantics, and dry-run/mock adapters. Add real capabilities as gated modes behind policy, approval, credentials, workspace isolation, command allowlists, redaction, and auditable WorkerRun/MissionEvent records.

**Tech Stack:** TypeScript, pnpm workspace, Zod, Fastify, Prisma/PostgreSQL, Redis/BullMQ, Vitest, Playwright, React/Vite, Codex CLI, provider HTTP clients with injected transports for tests.

---

## Scope Rule

This plan covers Batch A through Batch M in one program of work. It does not mean unsafe actions are executed automatically. Real Codex, GitHub, Coolify, Uptime Kuma, Plane, push, PR creation, deployment, and production changes remain disabled unless their explicit gates, credentials, policy checks, and Approval records all pass.

## Proposed File Structure

Create or extend these units:

- `packages/security`: shared redaction, command policy, workspace path guard, forbidden path guard, approval policy checker, safe output helpers.
- `packages/artifact-store`: artifact path builder, artifact writer/reader, retention metadata helpers, compatibility resolver for existing demo paths.
- `workers/codex-worker/src/runner.ts`: `CodexRunner` interface and dry-run/mock/real implementations.
- `workers/codex-worker/src/workspace.ts`: clone/update/worktree lease and branch guard.
- `workers/codex-worker/src/execution-request.ts`: Zod schema for real Codex execution request.
- `workers/qa-worker/src/deterministic.ts`: real deterministic Playwright runner.
- `workers/qa-worker/src/ai-exploratory.ts`: gated AI exploratory QA runner abstraction.
- `packages/auto-fix-loop/src/real-loop.ts`: gated real fix loop orchestration using Codex runner and QA runner.
- `packages/integrations/src/*-real.ts`: provider real adapters with injected transports and real-disabled behavior.
- `apps/worker-runner/src/handlers.ts`: add gated real job handlers without removing current dry-run handlers.
- `packages/worker-runtime/src/index.ts`: extend job type enum for real/gated jobs.
- `apps/orchestrator-api/src/actions.ts`: add white-listed real action request schemas and queued response shapes.
- `apps/orchestrator-api/src/server.ts`: add protected gated action routes and read routes for new resource summaries.
- `apps/hub/src/App.tsx` and `apps/hub/src/api/*`: show real-mode readiness, policy failures, deployments, monitors, PR/Plane links, and artifact details.
- `projects/ai-novelist/project.passport.yaml`: add verified path/command fields needed for real mode.
- `docs/*`: update safety, API, operations, integrations, progress, and provider docs for every batch.

## Task 1: Shared Safety Package

**Files:**
- Create: `packages/security/package.json`
- Create: `packages/security/src/index.ts`
- Create: `packages/security/src/redaction.ts`
- Create: `packages/security/src/command-policy.ts`
- Create: `packages/security/src/path-guards.ts`
- Create: `packages/security/src/approval-policy.ts`
- Create: `packages/security/tests/security.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `docs/safety.md`

- [ ] **Step 1: Write redaction tests**

Create tests that prove these strings are masked: `GITHUB_TOKEN=ghp_example`, `Authorization: Bearer abc`, `password=hunter2`, `PLANE_API_TOKEN=plane_secret`, JWT-looking strings, and nested JSON secret fields. Expected output should contain `[REDACTED]` and never contain the original secret values.

Run: `pnpm --filter @psf/security test`
Expected before implementation: FAIL because package does not exist.

- [ ] **Step 2: Implement redaction**

Export:

```ts
export function redactText(input: string, extraSecrets?: string[]): string;
export function redactJson<T>(input: T, extraSecrets?: string[]): T;
export function assertNoSecrets(input: unknown, extraSecrets?: string[]): void;
```

Behavior: recursively mask keys containing `token`, `password`, `secret`, `authorization`, `credential`, `cookie`, `session`, `jwt`, `api_key`, and values passed through `extraSecrets`.

- [ ] **Step 3: Write command policy tests**

Cover allowed commands such as `pnpm test`, `pnpm build`, `npm run test`, `pytest -q`, `git status`, and blocked commands such as `rm -rf /`, `sudo`, `curl http://example.com | sh`, `chmod 777 -R /`, shell redirection to `.env`, `git push origin main`, and `docker system prune`.

- [ ] **Step 4: Implement command policy**

Export:

```ts
export interface CommandPolicyInput {
  command: string;
  cwd: string;
  workspaceRoot: string;
  allowNetwork?: boolean;
  allowGitPush?: boolean;
  timeoutMs: number;
}

export interface CommandPolicyResult {
  allowed: boolean;
  reason: string;
  normalizedCommand: string;
}

export function evaluateCommandPolicy(input: CommandPolicyInput): CommandPolicyResult;
export function assertCommandAllowed(input: CommandPolicyInput): void;
```

- [ ] **Step 5: Write path guard tests**

Cover safe workspace paths under `workspaces/<project>/<mission>`, path traversal with `..`, absolute paths outside the repo, `.env`, `.ssh`, home directory, `/`, `/etc/passwd`, and nested credential files.

- [ ] **Step 6: Implement path guards**

Export:

```ts
export function assertInsideWorkspace(path: string, workspaceRoot: string): void;
export function assertNotForbiddenPath(path: string): void;
export function resolveSafeWorkspacePath(workspaceRoot: string, relativePath: string): string;
```

- [ ] **Step 7: Write approval policy tests**

Cover actions: `production_deploy`, `destructive_operation`, `database_migration`, `secret_change`, `external_cost_risk`, `security_risk`, `git_push`, `github_pr`, `external_network_call`, and `real_codex_execution`.

- [ ] **Step 8: Implement approval policy checker**

Export:

```ts
export type RiskyAction =
  | 'production_deploy'
  | 'destructive_operation'
  | 'database_migration'
  | 'secret_change'
  | 'external_cost_risk'
  | 'security_risk'
  | 'git_push'
  | 'github_pr'
  | 'external_network_call'
  | 'real_codex_execution';

export interface ApprovalPolicyResult {
  allowed: boolean;
  requiredApprovalTypes: string[];
  missingApprovalTypes: string[];
  reason: string;
}
```

- [ ] **Step 9: Run checks and commit**

Run: `pnpm --filter @psf/security test && pnpm --filter @psf/security typecheck`

Commit:

```bash
git add packages/security pnpm-workspace.yaml package.json docs/safety.md
git commit -m "增加真实执行安全基线" -m "新增共享安全包，提供 secret 脱敏、命令策略、路径保护和审批策略，为后续真实执行提供统一门禁。"
```

## Task 2: Artifact Store And Retention Policy

**Files:**
- Create: `packages/artifact-store/package.json`
- Create: `packages/artifact-store/src/index.ts`
- Create: `packages/artifact-store/src/paths.ts`
- Create: `packages/artifact-store/src/store.ts`
- Create: `packages/artifact-store/src/retention.ts`
- Create: `packages/artifact-store/tests/artifact-store.test.ts`
- Modify: `docs/artifacts.md`
- Modify: `docs/operations.md`

- [ ] **Step 1: Write path policy tests**

Expected canonical path: `artifacts/missions/<mission-id>/<worker-run-id>/<category>/<filename>`. Existing demo path `missions/<mission-id>/<filename>` must resolve as legacy-readable but not be used for new real-mode writes.

- [ ] **Step 2: Implement path builder**

Export:

```ts
export interface ArtifactPathInput {
  artifactsRoot: string;
  missionId: string;
  runId: string;
  category: 'mission' | 'codex' | 'qa' | 'fix' | 'deploy' | 'monitor' | 'integration' | 'logs';
  filename: string;
}

export function buildArtifactPath(input: ArtifactPathInput): string;
export function resolveLegacyMissionArtifact(cwd: string, missionId: string, filename: string): string;
```

- [ ] **Step 3: Write store tests**

Verify small text artifacts write content and metadata, large binary-like artifacts are path-only, unsafe names are rejected, and content is redacted before write.

- [ ] **Step 4: Implement store helpers**

Export:

```ts
export interface SaveArtifactInput {
  missionId: string;
  workerRunId: string;
  type: string;
  name: string;
  content?: string;
  sourcePath?: string;
  metadata?: Record<string, unknown>;
}

export async function saveTextArtifact(input: SaveArtifactInput): Promise<Artifact>;
export async function savePathArtifact(input: SaveArtifactInput): Promise<Artifact>;
```

- [ ] **Step 5: Add retention helpers**

Retention classes: `short`, `mission`, `release`, `audit`. Cleanup must support dry-run preview first and refuse deletion outside artifacts root.

- [ ] **Step 6: Run checks and commit**

Run: `pnpm --filter @psf/artifact-store test && pnpm --filter @psf/artifact-store typecheck`

Commit:

```bash
git add packages/artifact-store docs/artifacts.md docs/operations.md pnpm-workspace.yaml package.json
git commit -m "规范真实执行产物存储" -m "新增 artifact store 包，统一 artifacts/missions 路径、legacy demo 兼容和 retention 元数据策略。"
```

## Task 3: Queue And API Real-Mode Job Contracts

**Files:**
- Modify: `packages/worker-runtime/src/index.ts`
- Modify: `packages/worker-runtime/tests/worker-runtime.test.ts`
- Modify: `apps/orchestrator-api/src/actions.ts`
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `docs/api.md`
- Modify: `docs/queue-runtime.md`

- [ ] **Step 1: Add failing tests for new whitelisted job types**

Add tests for these job types: `codex.real`, `qa.playwright`, `qa.ai_exploratory`, `fix.real`, `github.pr`, `deploy.coolify`, `monitor.uptime_kuma`, `plane.sync`. Confirm unknown job types are rejected and payload secret keys are still rejected.

- [ ] **Step 2: Extend Zod job type enum**

Keep existing dry-run types. Add real/gated types without changing existing queue wrapper behavior.

- [ ] **Step 3: Add API tests for gated action acceptance**

Routes should return accepted queued responses when `PSF_ACTION_EXECUTION_MODE=queued`, but if real mode is not enabled they should return blocked/manual-action payloads rather than execute real work.

- [ ] **Step 4: Add protected routes**

Add routes only for explicit actions, not arbitrary command execution:

```text
POST /missions/:id/actions/codex-real
POST /missions/:id/actions/qa-playwright
POST /missions/:id/actions/qa-ai-exploratory
POST /missions/:id/actions/fix-real
POST /missions/:id/actions/github-pr
POST /missions/:id/actions/deploy-staging
POST /missions/:id/actions/monitor-sync
POST /missions/:id/actions/plane-sync
```

- [ ] **Step 5: Run checks and commit**

Run: `pnpm --filter @psf/worker-runtime test && pnpm --filter @psf/orchestrator-api test`

Commit:

```bash
git add packages/worker-runtime apps/orchestrator-api docs/api.md docs/queue-runtime.md
git commit -m "扩展真实模式队列任务契约" -m "新增 gated real job 类型和白名单 action API 设计，保持 inline/queued 与 wrapper WorkerRun 兼容。"
```

## Task 4: Real Codex Runner Gated Mode

**Files:**
- Create: `workers/codex-worker/src/execution-request.ts`
- Create: `workers/codex-worker/src/workspace.ts`
- Create: `workers/codex-worker/src/runner.ts`
- Modify: `workers/codex-worker/src/index.ts`
- Modify: `workers/codex-worker/src/safety.ts`
- Modify: `workers/codex-worker/tests/codex-worker.test.ts`
- Modify: `.env.example`
- Modify: `docs/codex-worker.md`
- Modify: `docs/real-codex-execution-readiness.md`

- [ ] **Step 1: Write real-disabled tests**

Verify `ENABLE_REAL_CODEX=0` rejects `mode=real` with a blocked result and does not spawn a process.

- [ ] **Step 2: Write fake repo workspace tests**

Create a temp git repo, ensure the worker creates a worktree under `PSF_WORKSPACE_ROOT`, branch name `agent/<slug>-<mission-id>`, and refuses `main`/`master` as target execution branches.

- [ ] **Step 3: Write mock Codex executable tests**

Use a local test executable script that writes stdout/stderr and exits 0 or 1. Verify stdout/stderr are redacted and stored as artifacts.

- [ ] **Step 4: Implement execution request schema**

Zod fields: `missionId`, `projectId`, `repoUrl`, `defaultBranch`, `missionFiles`, `approvalIds`, `commands`, `branchName`, `workspaceRoot`, `timeoutMs`, `mode`.

- [ ] **Step 5: Implement workspace lease**

Clone or update repository only under `PSF_WORKSPACE_ROOT`. Refuse path traversal, protected branches, and missing git remotes with manual-action result.

- [ ] **Step 6: Implement `CodexRunner` interface**

Export:

```ts
export interface CodexRunner {
  run(input: CodexExecutionRequest): Promise<CodexExecutionResult>;
}
```

Implement `DryRunCodexRunner`, `MockCodexRunner`, and `RealCodexRunner`. `RealCodexRunner` checks all gates before spawning `CODEX_EXECUTABLE`.

- [ ] **Step 7: Persist artifacts and events**

Save prompt, command, stdout, stderr, dev-summary, diff summary, and local commit summary. Do not push.

- [ ] **Step 8: Run checks and commit**

Run: `pnpm --filter @psf/codex-worker test && pnpm --filter @psf/codex-worker typecheck`

Commit:

```bash
git add workers/codex-worker .env.example docs/codex-worker.md docs/real-codex-execution-readiness.md
git commit -m "加入受控真实 Codex 执行器" -m "新增 Codex runner 抽象、workspace guard、mock executable 测试和 real-disabled 门禁，默认不执行真实 Codex。"
```

## Task 5: Deterministic Playwright QA Runner

**Files:**
- Create: `workers/qa-worker/src/deterministic.ts`
- Create: `workers/qa-worker/tests/fixtures/simple-app.html`
- Modify: `workers/qa-worker/src/index.ts`
- Modify: `workers/qa-worker/tests/qa-worker.test.ts`
- Modify: `docs/qa-worker.md`
- Modify: `docs/playwright.md`

- [ ] **Step 1: Write skipped-without-url test**

When no `target_url`, `QA_TEST_URL`, or `STAGING_URL` exists, runner returns blocked/manual-action and does not fail the test process.

- [ ] **Step 2: Write fixture QA test**

Use a local static fixture server or mocked Playwright runner. Verify a passing run creates QARun, `qa-report.md`, `qa-summary.json`, and artifacts.

- [ ] **Step 3: Write failure-to-bug test**

A failing assertion must create schema-valid `bugs.json` and BugReport with reproduction steps, expected result, actual result, and evidence.

- [ ] **Step 4: Implement deterministic runner**

Expose:

```ts
export async function runDeterministicPlaywrightQa(input: DeterministicQaInput): Promise<DeterministicQaResult>;
```

It should use Playwright only when explicitly enabled and target URL is present.

- [ ] **Step 5: Run checks and commit**

Run: `pnpm --filter @psf/qa-worker test && pnpm test:e2e:smoke`

Commit:

```bash
git add workers/qa-worker docs/qa-worker.md docs/playwright.md
git commit -m "增加确定性 Playwright QA 执行器" -m "新增 gated deterministic QA runner、fixture 测试和失败转 BugReport 规则，默认不阻塞普通测试。"
```

## Task 6: AI Exploratory QA Gated Mode

**Files:**
- Create: `workers/qa-worker/src/ai-exploratory.ts`
- Create: `packages/prompts/qa-explore.md`
- Modify: `workers/qa-worker/tests/qa-worker.test.ts`
- Modify: `docs/playwright-mcp.md`
- Modify: `.env.example`

- [ ] **Step 1: Write disabled-mode tests**

`ENABLE_AI_EXPLORATORY_QA=0` returns dry-run/mock output and does not open a browser or MCP connection.

- [ ] **Step 2: Write output validation tests**

Invalid AI output is rejected; P0/P1 bugs without evidence are downgraded or rejected; generated regression spec must parse as TypeScript.

- [ ] **Step 3: Implement runner abstraction**

Expose `AiExploratoryQaRunner` with `dry-run`, `mock`, and future `real` implementations. Real implementation should return manual-action until an approved MCP execution path exists.

- [ ] **Step 4: Run checks and commit**

Run: `pnpm --filter @psf/qa-worker test`

Commit:

```bash
git add workers/qa-worker packages/prompts docs/playwright-mcp.md .env.example
git commit -m "补齐 AI 探索 QA 门禁设计" -m "新增 AI exploratory QA runner 抽象、prompt 和输出校验，真实 MCP 执行默认关闭。"
```

## Task 7: Real Auto Fix Loop Gated Mode

**Files:**
- Create: `packages/auto-fix-loop/src/real-loop.ts`
- Modify: `packages/auto-fix-loop/src/index.ts`
- Modify: `packages/auto-fix-loop/tests/auto-fix-loop.test.ts`
- Modify: `docs/auto-fix-loop.md`

- [ ] **Step 1: Write max-attempt tests**

Mission attempts > 3 or bug attempts > 2 returns `needs_human` or `paused`, never loops.

- [ ] **Step 2: Write regression-required tests**

A reproducible bug cannot move to fixed unless a regression test exists or a generated spec validates.

- [ ] **Step 3: Implement real fix loop orchestration**

Call Codex runner in fix mode only after approval and policy gates. Run regression/unit/e2e commands through command policy.

- [ ] **Step 4: Run checks and commit**

Run: `pnpm --filter @psf/auto-fix-loop test`

Commit:

```bash
git add packages/auto-fix-loop docs/auto-fix-loop.md
git commit -m "加入真实修复闭环门禁" -m "新增 gated real fix loop，要求回归覆盖、限制修复次数并保留 dry-run 行为。"
```

## Task 8: Real Integration Adapters With Injected Transports

**Files:**
- Create: `packages/integrations/src/github-real.ts`
- Create: `packages/integrations/src/coolify-real.ts`
- Create: `packages/integrations/src/uptime-kuma-real.ts`
- Create: `packages/integrations/src/plane-real.ts`
- Modify: `packages/integrations/src/index.ts`
- Modify: `packages/integrations/tests/integrations.test.ts`
- Modify: `docs/github-integration.md`
- Modify: `docs/coolify-integration.md`
- Modify: `docs/uptime-kuma-integration.md`
- Modify: `docs/plane-integration.md`

- [ ] **Step 1: Write real-disabled tests for all providers**

With every `ENABLE_REAL_*` unset or `0`, adapters return `realEnabled=false`, `realNetworkCall=false`, and manual-action guidance.

- [ ] **Step 2: Write injected transport tests**

Use fake HTTP transports to simulate success, auth failure, permission failure, and network timeout. No test should require real network.

- [ ] **Step 3: Implement GitHub real adapter**

Support push branch, create PR, update PR body, post QA comment, and return PR URL only through injected transport. Refuse protected branches.

- [ ] **Step 4: Implement Coolify real adapter**

Support staging deploy request, status polling, deployment record, staging URL, and production approval requirement.

- [ ] **Step 5: Implement Uptime Kuma real adapter**

Support monitor config, status fetch, and down event result. Provider unavailable returns degraded status, not process failure.

- [ ] **Step 6: Implement Plane real adapter**

Support Mission/Bug issue create/update, status mapping, and issue URL persistence.

- [ ] **Step 7: Run checks and commit**

Run: `pnpm --filter @psf/integrations test`

Commit:

```bash
git add packages/integrations docs/*integration.md
git commit -m "加入外部集成真实模式门禁" -m "新增 GitHub、Coolify、Uptime Kuma、Plane gated real adapters，使用注入 transport 测试且默认不联网。"
```

## Task 9: Worker Runner Real Job Handlers

**Files:**
- Modify: `apps/worker-runner/src/handlers.ts`
- Modify: `apps/worker-runner/src/runner.ts`
- Modify: `apps/worker-runner/tests/runner.test.ts`
- Modify: `docs/queue-runtime.md`

- [ ] **Step 1: Write handler tests for each new job type**

Each job type should call the relevant runner/adapter, update queue wrapper WorkerRun output, record child IDs, and never leak secrets.

- [ ] **Step 2: Implement handler dispatch**

Map `codex.real`, `qa.playwright`, `qa.ai_exploratory`, `fix.real`, `github.pr`, `deploy.coolify`, `monitor.uptime_kuma`, and `plane.sync` to their modules.

- [ ] **Step 3: Ensure failure behavior**

Failure updates wrapper WorkerRun to `failed`, stores redacted error summary, writes MissionEvent, and preserves child artifacts.

- [ ] **Step 4: Run checks and commit**

Run: `pnpm --filter @psf/worker-runner test`

Commit:

```bash
git add apps/worker-runner docs/queue-runtime.md
git commit -m "接入真实模式队列处理器" -m "Worker Runner 支持 gated real job handlers，并保持 wrapper WorkerRun 与 child WorkerRun 语义。"
```

## Task 10: Orchestrator API And Hub Visibility

**Files:**
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/src/api/types.ts`
- Modify: `apps/hub/tests/hub.test.tsx`
- Modify: `docs/api.md`
- Modify: `docs/hub-web.md`

- [ ] **Step 1: Write API summary tests**

Mission summary should include real-mode readiness, policy failures, PR links, deployment status, monitor status, Plane links, and artifact retention metadata when present.

- [ ] **Step 2: Write Hub rendering tests**

Hub must show readiness and blocked/manual-action states without exposing tokens. Real action buttons must be disabled or guarded when gates fail.

- [ ] **Step 3: Implement API summaries**

Extend existing summary builders. Do not let Hub read DB or filesystem directly.

- [ ] **Step 4: Implement Hub views**

Add WorkerRun detail/log view, QARun detail, artifact detail, approvals action view, deployment/monitor/PR/Plane sections.

- [ ] **Step 5: Run checks and commit**

Run: `pnpm --filter @psf/orchestrator-api test && pnpm --filter @psf/hub test`

Commit:

```bash
git add apps/orchestrator-api apps/hub docs/api.md docs/hub-web.md
git commit -m "完善真实闭环可视化" -m "API 和 Hub 展示真实模式 readiness、阻塞原因、PR/部署/监控/Plane 链接和 redacted 日志。"
```

## Task 11: ai-novelist Real Loop Readiness

**Files:**
- Modify: `projects/ai-novelist/project.passport.yaml`
- Modify: `projects/ai-novelist/AGENTS.md`
- Modify: `projects/ai-novelist/qa-charter.md`
- Modify: `packages/project-passport/src/index.ts`
- Modify: `packages/project-passport/tests/project-passport.test.ts`
- Modify: `docs/project-passport.md`

- [ ] **Step 1: Write passport extension tests**

Validate optional `paths`, `commands.dev`, `commands.e2e`, `commands.lint`, `risk_rules`, and local/staging URL fields.

- [ ] **Step 2: Extend passport schema compatibly**

Do not break existing passport. New fields are optional but normalized when present.

- [ ] **Step 3: Update ai-novelist docs**

Mark commands as `manual-verification-required` unless verified locally. Do not hardcode guessed selectors as truth.

- [ ] **Step 4: Run checks and commit**

Run: `pnpm --filter @psf/project-passport test && pnpm --filter @psf/project-registry test`

Commit:

```bash
git add projects/ai-novelist packages/project-passport docs/project-passport.md
git commit -m "补齐 ai-novelist 真实闭环准备" -m "扩展 Project Passport 可选字段并完善 ai-novelist 命令、路径、风险和 QA charter。"
```

## Task 12: Operations Hardening

**Files:**
- Modify: `packages/demo-workflow/src/doctor.ts`
- Modify: `scripts/psf.ts`
- Modify: `scripts/psf.test.ts`
- Modify: `docs/operations.md`
- Modify: `docs/troubleshooting.md`
- Modify: `docs/health-checks.md`
- Modify: `docs/local-development.md`
- Modify: `docs/safety.md`

- [ ] **Step 1: Write doctor tests**

Doctor checks DB, Redis, queue, worker runner hint, artifact root, workspace root, redaction config, real integration readiness, passport validation, and warns when `ENABLE_REAL_*` is set.

- [ ] **Step 2: Add heartbeat/stale design to runner**

Worker Runner writes heartbeat metadata to wrapper WorkerRun output. Stale detection is reported by doctor first before automatic recovery is introduced.

- [ ] **Step 3: Add retention CLI preview**

`pnpm psf artifacts:cleanup --dry-run` lists deletable artifacts and refuses deletion outside artifact root. Destructive cleanup requires explicit confirmation env.

- [ ] **Step 4: Update operations docs**

Document backup/restore, token rotation, crash recovery, queue recovery, and real-mode readiness.

- [ ] **Step 5: Run checks and commit**

Run: `pnpm test:scripts && pnpm --filter @psf/demo-workflow test`

Commit:

```bash
git add packages/demo-workflow scripts docs/operations.md docs/troubleshooting.md docs/health-checks.md docs/local-development.md docs/safety.md
git commit -m "加固真实模式运维检查" -m "扩展 doctor、artifact cleanup dry-run、heartbeat 提示和运维恢复文档。"
```

## Task 13: Temporal And LangGraph Decision Record

**Files:**
- Modify: `docs/adr/0005-temporal-langgraph-decision.md`
- Create: `docs/temporal-langgraph-migration.md`
- Modify: `docs/next-steps.md`

- [ ] **Step 1: Add evidence checklist**

Checklist must include recovery failures, compensation needs, durable timers, branching graph complexity, and multi-project pressure.

- [ ] **Step 2: Add migration sketch**

Describe wrapping current job handlers as Temporal activities or LangGraph nodes without changing Orchestrator/WorkerRun/MissionEvent contracts.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0005-temporal-langgraph-decision.md docs/temporal-langgraph-migration.md docs/next-steps.md
git commit -m "明确 Temporal 与 LangGraph 迁移条件" -m "补充证据门槛和未来迁移路径，当前继续使用 BullMQ 与 TypeScript 状态机。"
```

## Task 14: Full Verification And Documentation Rollup

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/progress.md`
- Create: `docs/progress/phase-real-execution-and-integrations.md`

- [ ] **Step 1: Update README scope**

README must state which abilities are real but disabled, which require credentials, which require Approval, and which are still dry-run/mock.

- [ ] **Step 2: Update env example**

Add all real-mode env vars with empty placeholder values and comments saying no real secrets should be committed.

- [ ] **Step 3: Run focused checks**

Run:

```bash
pnpm --filter @psf/security test
pnpm --filter @psf/artifact-store test
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/integrations test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
```

- [ ] **Step 4: Run full gates**

Run:

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

- [ ] **Step 5: Optional gated smoke checks**

Run only if local prerequisites exist:

```bash
PSF_TEST_REDIS=1 pnpm --filter @psf/worker-runtime test
QA_TEST_URL=http://127.0.0.1:8000 ENABLE_REAL_PLAYWRIGHT=1 pnpm test:e2e:smoke
```

- [ ] **Step 6: Final commit**

```bash
git add README.md .env.example docs/progress.md docs/progress/phase-real-execution-and-integrations.md
git commit -m "汇总真实执行阶段文档和验收结果" -m "更新 README、环境变量、进度文档和验收记录，说明真实能力默认关闭及后续人工启用条件。"
```

## Final Acceptance Criteria

- Dry-run/demo MVP remains working.
- Existing queue wrapper WorkerRun semantics remain intact.
- Normal `pnpm test`, `pnpm typecheck`, and `pnpm build` do not require Redis, browsers, credentials, or external services.
- Real Codex code path exists but is disabled unless explicitly enabled and approved.
- Real provider adapters exist but do not call network in default tests.
- All secret-like outputs are redacted.
- Protected branches are refused.
- Workspace execution is constrained to `PSF_WORKSPACE_ROOT`.
- Production deploy requires Approval.
- External failures produce paused/manual-action guidance.
- Hub shows real-mode readiness and blocked reasons without leaking secrets.
- Temporal/LangGraph are documented as deferred until evidence exists.
