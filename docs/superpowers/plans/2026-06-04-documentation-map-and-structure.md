# Documentation Map And Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize global Markdown documentation under clear `docs/` topic directories while keeping `README.md`, `AGENTS.md`, and `summary.md` as the only root Markdown entrypoints.

**Architecture:** Preserve local README files near code and generated Mission/project context. Move global docs into topic directories, update all current links, and make `summary.md` the Chinese document map that explains every Markdown category and file purpose. Strengthen `AGENTS.md` so every file or architecture change updates the corresponding documentation record or explicitly explains why no update was needed.

**Tech Stack:** Markdown documentation, Git file moves, Node structure check script, pnpm verification commands.

---

## Scope And Safety Rules

- Do not change runtime behavior.
- Do not enable real Codex, Playwright, GitHub, Coolify, Uptime Kuma, Plane, or external network calls.
- Do not delete ADRs.
- Do not move local code-adjacent README files under `apps/**`, `packages/**`, or `workers/**`.
- Do not move Mission/project generated context under `missions/**` or `projects/**`.
- Keep commit titles and commit bodies in Chinese.
- Keep token/password/secret/API-key/authorization/cookie/session/JWT/bearer values out of all docs.

## File Structure

### Root Markdown Entrypoints Kept

- `README.md`: Chinese project entrypoint and quick-start guide.
- `AGENTS.md`: agent execution and documentation maintenance rules.
- `summary.md`: Chinese current status, problems, backlog, cleanup status, and full Markdown document map.

### Root Markdown Files Moved

- `struct.md` -> `docs/architecture/structure.md`
- `debug.md` -> `docs/debug/debug.md`
- `plan.md` -> `docs/vision/plan.md`

### Current `docs/*.md` Files Moved

- `docs/api.md` -> `docs/api/orchestrator-api.md`
- `docs/auth.md` -> `docs/api/auth.md`
- `docs/schema.md` -> `docs/api/schema.md`
- `docs/safety.md` -> `docs/security/safety.md`
- `docs/approval-policy.md` -> `docs/security/approval-policy.md`
- `docs/worker-permissions.md` -> `docs/security/worker-permissions.md`
- `docs/queue-runtime.md` -> `docs/runtime/queue-runtime.md`
- `docs/worker-runtime.md` -> `docs/runtime/worker-runtime.md`
- `docs/storage.md` -> `docs/runtime/storage.md`
- `docs/artifacts.md` -> `docs/runtime/artifacts.md`
- `docs/operations.md` -> `docs/operations/operations.md`
- `docs/local-development.md` -> `docs/operations/local-development.md`
- `docs/health-checks.md` -> `docs/operations/health-checks.md`
- `docs/troubleshooting.md` -> `docs/operations/troubleshooting.md`
- `docs/development-standards.md` -> `docs/operations/development-standards.md`
- `docs/integrations.md` -> `docs/integrations/overview.md`
- `docs/github-integration.md` -> `docs/integrations/github.md`
- `docs/coolify-integration.md` -> `docs/integrations/coolify.md`
- `docs/uptime-kuma-integration.md` -> `docs/integrations/uptime-kuma.md`
- `docs/plane-integration.md` -> `docs/integrations/plane.md`
- `docs/codex-worker.md` -> `docs/workers/codex-worker.md`
- `docs/qa-worker.md` -> `docs/workers/qa-worker.md`
- `docs/auto-fix-loop.md` -> `docs/workers/auto-fix-loop.md`
- `docs/playwright.md` -> `docs/workers/playwright.md`
- `docs/playwright-mcp.md` -> `docs/workers/playwright-mcp.md`
- `docs/real-codex-execution-readiness.md` -> `docs/workers/real-codex-execution-readiness.md`
- `docs/hub-web.md` -> `docs/apps/hub-web.md`
- `docs/state-machine.md` -> `docs/architecture/state-machine.md`
- `docs/project-registry.md` -> `docs/projects/project-registry.md`
- `docs/project-passport.md` -> `docs/projects/project-passport.md`
- `docs/mission-planner.md` -> `docs/projects/mission-planner.md`
- `docs/progress.md` -> `docs/status/progress.md`
- `docs/next-steps.md` -> `docs/status/next-steps.md`
- `docs/progress/README.md` -> `docs/status/README.md`

### Files Kept In Place

- `docs/README.md`
- `docs/adr/**`
- `docs/archive/README.md`
- `docs/prompts/**`
- `docs/superpowers/**`
- `apps/**/README.md`
- `packages/**/README.md`
- `workers/**/README.md`
- `missions/**.md`
- `projects/**.md`
- `packages/prompts/**.md`
- `artifacts/README.md`
- `workspaces/README.md`
- `scripts/README.md`

---

## Task 1: Move Global Documentation Into Topic Directories

**Files:**

- Move: root and `docs/*.md` files listed in File Structure.
- Modify: none beyond Git moves.
- Test: file listing and git status only.

- [ ] **Step 1: Create target directories**

Run:

```bash
mkdir -p docs/architecture docs/debug docs/vision docs/status docs/api docs/security docs/runtime docs/operations docs/integrations docs/workers docs/apps docs/projects
```

Expected: command exits 0.

- [ ] **Step 2: Move root global docs**

Run:

```bash
git mv struct.md docs/architecture/structure.md
git mv debug.md docs/debug/debug.md
git mv plan.md docs/vision/plan.md
```

Expected: all three moves succeed.

- [ ] **Step 3: Move API docs**

Run:

```bash
git mv docs/api.md docs/api/orchestrator-api.md
git mv docs/auth.md docs/api/auth.md
git mv docs/schema.md docs/api/schema.md
```

Expected: all three moves succeed.

- [ ] **Step 4: Move security docs**

Run:

```bash
git mv docs/safety.md docs/security/safety.md
git mv docs/approval-policy.md docs/security/approval-policy.md
git mv docs/worker-permissions.md docs/security/worker-permissions.md
```

Expected: all three moves succeed.

- [ ] **Step 5: Move runtime docs**

Run:

```bash
git mv docs/queue-runtime.md docs/runtime/queue-runtime.md
git mv docs/worker-runtime.md docs/runtime/worker-runtime.md
git mv docs/storage.md docs/runtime/storage.md
git mv docs/artifacts.md docs/runtime/artifacts.md
```

Expected: all four moves succeed.

- [ ] **Step 6: Move operations docs**

Run:

```bash
git mv docs/operations.md docs/operations/operations.md
git mv docs/local-development.md docs/operations/local-development.md
git mv docs/health-checks.md docs/operations/health-checks.md
git mv docs/troubleshooting.md docs/operations/troubleshooting.md
git mv docs/development-standards.md docs/operations/development-standards.md
```

Expected: all five moves succeed.

- [ ] **Step 7: Move integration docs**

Run:

```bash
git mv docs/integrations.md docs/integrations/overview.md
git mv docs/github-integration.md docs/integrations/github.md
git mv docs/coolify-integration.md docs/integrations/coolify.md
git mv docs/uptime-kuma-integration.md docs/integrations/uptime-kuma.md
git mv docs/plane-integration.md docs/integrations/plane.md
```

Expected: all five moves succeed.

- [ ] **Step 8: Move worker and app docs**

Run:

```bash
git mv docs/codex-worker.md docs/workers/codex-worker.md
git mv docs/qa-worker.md docs/workers/qa-worker.md
git mv docs/auto-fix-loop.md docs/workers/auto-fix-loop.md
git mv docs/playwright.md docs/workers/playwright.md
git mv docs/playwright-mcp.md docs/workers/playwright-mcp.md
git mv docs/real-codex-execution-readiness.md docs/workers/real-codex-execution-readiness.md
git mv docs/hub-web.md docs/apps/hub-web.md
```

Expected: all seven moves succeed.

- [ ] **Step 9: Move architecture, project, and status docs**

Run:

```bash
git mv docs/state-machine.md docs/architecture/state-machine.md
git mv docs/project-registry.md docs/projects/project-registry.md
git mv docs/project-passport.md docs/projects/project-passport.md
git mv docs/mission-planner.md docs/projects/mission-planner.md
git mv docs/progress.md docs/status/progress.md
git mv docs/next-steps.md docs/status/next-steps.md
git mv docs/progress/README.md docs/status/README.md
```

Expected: all seven moves succeed.

- [ ] **Step 10: Remove empty `docs/progress` directory if empty**

Run:

```bash
rmdir docs/progress
```

Expected: exits 0 if empty. If it is not empty, stop and inspect the unexpected file before continuing.

- [ ] **Step 11: Verify moved file list**

Run:

```bash
find docs -maxdepth 3 -name '*.md' -type f | sort
git status --short
```

Expected:

- The moved docs appear at the new paths.
- `docs/progress/` no longer appears.
- `README.md`, `AGENTS.md`, and `summary.md` remain at root.
- No runtime files are modified.

- [ ] **Step 12: Commit Task 1**

Run:

```bash
git add -A
git commit -m "重整全局文档目录" -m "将根目录和 docs 扁平层级中的全局 Markdown 迁入 architecture、status、debug、api、security、runtime、operations、integrations、workers、apps 和 projects 等主题目录，保留 README、AGENTS 和 summary 作为根入口。"
```

Expected: commit succeeds.

---

## Task 2: Update Structure Check Script And Required Path References

**Files:**

- Modify: `scripts/check-phase1-structure.mjs`
- Modify: `docs/status/README.md`
- Modify: `docs/README.md`
- Test: structure check.

- [ ] **Step 1: Update `requiredFiles` in structure check**

In `scripts/check-phase1-structure.mjs`, replace these old required file entries:

```js
'docs/development-standards.md',
'struct.md',
'summary.md',
'debug.md',
'docs/progress.md',
'docs/progress/README.md',
```

with:

```js
'summary.md',
'docs/architecture/structure.md',
'docs/debug/debug.md',
'docs/vision/plan.md',
'docs/status/progress.md',
'docs/status/next-steps.md',
'docs/status/README.md',
'docs/operations/development-standards.md',
```

Expected: `summary.md` remains required at root; moved docs are required at their new paths.

- [ ] **Step 2: Update `requiredDirectories` in structure check**

In `scripts/check-phase1-structure.mjs`, replace:

```js
'docs/progress',
```

with:

```js
'docs/architecture',
'docs/debug',
'docs/vision',
'docs/status',
'docs/api',
'docs/security',
'docs/runtime',
'docs/operations',
'docs/integrations',
'docs/workers',
'docs/apps',
'docs/projects',
```

Expected: the structure check validates the new topic directories.

- [ ] **Step 3: Rewrite `docs/status/README.md` in Chinese**

Replace the entire file with:

```markdown
# 状态文档

本目录保存当前进度和下一步计划。

- `progress.md`: 当前能力、验证结果、剩余人工动作和安全边界。
- `next-steps.md`: 推荐下一批工作和进入真实执行前的检查项。

旧的阶段和批次 rollup 已在文档清理中删除；需要了解当前状态时，以本目录和根目录 `../../summary.md` 为准。
```

Expected: no references to `../progress.md` remain.

- [ ] **Step 4: Rewrite `docs/README.md` in Chinese**

Replace the root docs index with:

```markdown
# 文档目录

本目录保存 Personal Software Factory 的全局说明文档。普通阅读入口优先看根目录：

- `../README.md`: 项目入口和快速启动。
- `../summary.md`: 当前状态、问题、待改进项和完整文档地图。
- `../AGENTS.md`: Codex/agent 执行规则和文档维护纪律。

主题目录：

- `architecture/`: 当前架构、状态机和结构事实源。
- `status/`: 当前进度和下一步。
- `debug/`: 调试记录、验证记录和排障入口。
- `api/`: Orchestrator API、认证和 schema 合同。
- `security/`: 安全边界、审批策略和 worker 权限。
- `runtime/`: 队列、WorkerRun、存储、artifact 和 worker runtime。
- `operations/`: 本地开发、启动、健康检查、故障排查和开发纪律。
- `integrations/`: GitHub、Coolify、Uptime Kuma、Plane 和共享集成边界。
- `workers/`: Codex、QA、auto-fix loop、Playwright 和真实执行准备。
- `apps/`: Hub Web 等应用说明。
- `projects/`: Project Registry、Project Passport 和 Mission Planner。
- `prompts/`: QA、BugReport 和 prompt 模板。
- `adr/`: 持久架构决策记录，清理时默认保留。
- `archive/`: 只保存确有审计价值的归档入口或未来明确保留材料。
- `superpowers/`: 当前 Superpowers 设计和实施计划。

维护规则：新增、移动、删除 Markdown 时，必须同步更新 `../summary.md` 的文档地图。
```

Expected: docs index is Chinese and points to the new directories.

- [ ] **Step 5: Run structure check**

Run:

```bash
node scripts/check-phase1-structure.mjs
```

Expected:

```text
Repository structure check passed.
```

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add scripts/check-phase1-structure.mjs docs/status/README.md docs/README.md
git commit -m "更新文档结构检查和索引" -m "将结构检查脚本和 docs 入口更新到新的主题目录，使用中文说明当前文档入口和状态目录维护规则。"
```

Expected: commit succeeds.

---

## Task 3: Update AGENTS Rules And Current Source Paths

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/operations/development-standards.md`
- Modify: `docs/architecture/structure.md`
- Test: targeted `rg` path checks.

- [ ] **Step 1: Update current implementation discipline in `AGENTS.md`**

In `AGENTS.md`, replace the current implementation state bullet with:

```markdown
- Current active implementation state is documented in `summary.md`, `docs/architecture/structure.md`, `docs/debug/debug.md`, `README.md`, and `docs/status/progress.md`.
```

Replace the alignment bullet with:

```markdown
- Keep changes small, documented, and aligned with `docs/architecture/structure.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, and `docs/runtime/queue-runtime.md`.
```

Expected: no current guidance points to root `struct.md`, root `debug.md`, or old flat docs paths.

- [ ] **Step 2: Update required reading in `AGENTS.md`**

Replace the required reading list with:

```markdown
- `summary.md` for current status, problems, risks, improvement backlog, and the full Markdown document map.
- `docs/architecture/structure.md` for the current implemented architecture.
- `docs/debug/debug.md` for known debug hotspots, verification records, and recent investigations.
- `README.md` for current local setup and capability boundaries.
- `docs/status/progress.md` for latest completed batches and verification status.
- `docs/api/orchestrator-api.md` for Orchestrator API contracts.
- `docs/security/safety.md` for dry-run, real-mode, and secret boundaries.
- `docs/runtime/queue-runtime.md` for queued WorkerRun and Worker Runner behavior.
- `docs/vision/plan.md` for long-term product vision only; do not treat it as current implementation state.
```

Expected: `summary.md` is the first user/status entry.

- [ ] **Step 3: Strengthen documentation maintenance rules in `AGENTS.md`**

Replace the entire `## Documentation Maintenance Rules` bullet list with:

```markdown
- Every Markdown file add, move, rename, or delete must update `summary.md`'s document map in the same task.
- Every architecture, module-boundary, data-flow, state-machine, worker-contract, integration-gate, or safety-boundary change must update `docs/architecture/structure.md` in the same task.
- Every current problem, risk, technical debt, status change, resolved issue, or improvement backlog change must update `summary.md` in the same task.
- Every debugging session, failed check, unexpected behavior, manual-action output, flaky test, queue/runtime issue, verification result, or incident-like finding must update `docs/debug/debug.md` in the same task.
- Preserve ADRs under `docs/adr/**`; do not delete them during cleanup unless the user explicitly asks and a newer ADR supersedes the decision.
- Remove completed plans, stale phase notes, and low-value historical documents once their useful facts are represented in current docs, ADRs, `summary.md`, or `docs/debug/debug.md`.
- If none of `summary.md`, `docs/architecture/structure.md`, or `docs/debug/debug.md` need changes, the final response and commit body must explicitly state why.
- Do not record secret values in any of these documents.
```

Expected: the rule explicitly covers every file and architecture change.

- [ ] **Step 4: Update `docs/operations/development-standards.md` paths**

Replace references in the Documentation and Commit sections:

- `struct.md` -> `docs/architecture/structure.md`
- `debug.md` -> `docs/debug/debug.md`
- `docs/progress.md` -> `docs/status/progress.md`

Expected: development standards point to current paths.

- [ ] **Step 5: Update `docs/architecture/structure.md` source priority**

In `docs/architecture/structure.md`, update the `## Current Source Priority` list to:

```markdown
1. `AGENTS.md`
2. `README.md`
3. `summary.md`
4. `docs/architecture/structure.md`
5. `docs/debug/debug.md`
6. `docs/adr/**` for architecture decision history
7. `docs/status/progress.md`
8. `docs/api/orchestrator-api.md`
9. `docs/security/safety.md`
10. `docs/runtime/queue-runtime.md`
11. provider-specific integration docs under `docs/integrations/` when touching that provider
```

Expected: root `struct.md` and root `debug.md` disappear from active source priority.

- [ ] **Step 6: Run targeted checks**

Run:

```bash
rg -n 'struct\.md|debug\.md|docs/progress\.md|docs/api\.md|docs/safety\.md|docs/queue-runtime\.md' AGENTS.md docs/operations/development-standards.md docs/architecture/structure.md
```

Expected: no output, except `summary.md` text is allowed if it refers to the root `summary.md`.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add AGENTS.md docs/operations/development-standards.md docs/architecture/structure.md
git commit -m "强化文档维护规则" -m "更新 AGENTS 和开发纪律中的当前事实源路径，要求每次文件、架构、问题或验证变化都同步维护 summary、structure 或 debug 文档。"
```

Expected: commit succeeds.

---

## Task 4: Update README And Main User-Facing Docs To Chinese

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture/structure.md`
- Modify: `docs/status/progress.md`
- Modify: `docs/status/next-steps.md`
- Modify: `docs/debug/debug.md`
- Test: path and language checks.

- [ ] **Step 1: Rewrite README introduction and documentation sections in Chinese**

In `README.md`, keep command blocks and environment variable names unchanged, but make the explanatory prose Chinese-led.

Required top-level headings:

```markdown
# Personal Software Factory

## 当前范围
## 运行本地 MVP Demo
## 仓库结构
## 本地前置条件
## 环境变量
## 初始化和数据库
## 启动 API
## 启动 Hub Web
## CLI 示例
## 测试和构建
## 文档入口
## QA 和自动修复 Dry Run
## Queue Runtime
```

In `## 文档入口`, include these bullets with current paths:

```markdown
- `summary.md`: 中文总览、当前问题、待改进项和完整 Markdown 文档地图。
- `docs/architecture/structure.md`: 当前架构、模块边界和事实源优先级。
- `docs/debug/debug.md`: 调试热点、验证记录和排障记录。
- `docs/status/progress.md`: 当前进度、能力列表、验证结果和剩余人工动作。
- `docs/status/next-steps.md`: 推荐下一步和进入真实执行前的检查项。
- `docs/api/orchestrator-api.md`: Orchestrator API 路由和请求/响应约定。
- `docs/security/safety.md`: dry-run、queue、真实模式和 secret 安全边界。
- `docs/runtime/queue-runtime.md`: queued WorkerRun、Worker Runner、取消/重试和安全边界。
- `docs/integrations/overview.md`: 集成 dry-run/status 和 gated real adapter 共享边界。
```

Expected: README is Chinese-led and no longer points to old flat docs paths as current docs.

- [ ] **Step 2: Update `docs/architecture/structure.md` status text in Chinese**

Rewrite the first two sections as Chinese-led content:

```markdown
# 当前架构结构

## 状态

本文档是 Personal Software Factory 当前架构事实源。它描述已经实现的仓库结构、模块边界、数据流、状态机、worker contract、集成边界和默认安全姿态。

ADR 是持久决策历史。低价值历史阶段计划会在有用事实进入当前文档、ADR、`summary.md` 或 `docs/debug/debug.md` 后删除。
```

Keep technical lists accurate and update any path references to new locations.

- [ ] **Step 3: Update `docs/status/progress.md` source note in Chinese**

Replace the current fact-source note with:

```markdown
## 当前事实源

当前架构事实源是 `../architecture/structure.md`。当前问题、风险、待改进项和文档地图在 `../../summary.md`。调试和验证记录在 `../debug/debug.md`。
```

Expected: relative links match the new file locations.

- [ ] **Step 4: Update `docs/status/next-steps.md` in Chinese**

Keep existing recommendations but use Chinese headings and current path names. The first heading must be:

```markdown
# 下一步
```

Expected: it remains an actionable next-step list and no old flat path appears.

- [ ] **Step 5: Update `docs/debug/debug.md` path references**

Keep historical entries intact when they describe old tasks. Add a short note near the top:

```markdown
> 当前调试记录入口为 `docs/debug/debug.md`。历史条目中出现的旧路径只表示当时的文件位置，不是当前事实源。
```

Expected: current guidance is clear while history is preserved.

- [ ] **Step 6: Run README/user-doc checks**

Run:

```bash
rg -n 'struct\.md|debug\.md|docs/progress\.md|docs/next-steps\.md|docs/api\.md|docs/safety\.md|docs/queue-runtime\.md|docs/integrations\.md' README.md docs/architecture/structure.md docs/status/progress.md docs/status/next-steps.md docs/debug/debug.md
```

Expected: no output for current guidance. Historical mentions in `docs/debug/debug.md` are allowed only when the line explicitly describes history or old paths.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add README.md docs/architecture/structure.md docs/status/progress.md docs/status/next-steps.md docs/debug/debug.md
git commit -m "中文化主要用户文档" -m "将 README、当前架构、状态、下一步和 debug 入口调整为中文主导内容，并同步新的 docs 主题路径。"
```

Expected: commit succeeds.

---

## Task 5: Rewrite Summary With Full Markdown Document Map

**Files:**

- Modify: `summary.md`
- Test: Markdown inventory vs summary map.

- [ ] **Step 1: Replace `summary.md` heading and status in Chinese**

Use this top structure:

```markdown
# 当前架构总览

## 使用方式

`summary.md` 是用户优先阅读的中文总入口。它记录当前状态、问题、待改进项、最近文档清理结果，以及仓库中 Markdown 文档的用途地图。

优先阅读顺序：

1. `README.md`
2. `summary.md`
3. `docs/architecture/structure.md`
4. `docs/status/progress.md`
5. `docs/debug/debug.md`
6. `AGENTS.md`
```

Expected: root `summary.md` becomes the human-readable overview.

- [ ] **Step 2: Translate current strengths, problems, and backlog headings to Chinese**

Use these section headings:

```markdown
## 当前优势
## 当前问题
## 改进待办
### P0
### P1
### P2
## 文档清理状态
## 最近已解决的文档问题
## 已完成
## 残余风险
```

Expected: existing content is preserved in meaning, but user-facing wording is Chinese.

- [ ] **Step 3: Add `## Markdown 文档地图` section**

Append a `## Markdown 文档地图` section after the backlog or cleanup status. It must include these categories and current paths:

```markdown
### 根目录入口

- `README.md`: 项目入口、快速启动、运行命令和核心文档导航，主要给用户阅读。
- `AGENTS.md`: Codex/agent 执行规则、安全边界和文档维护纪律，主要给 agent 和维护者阅读。
- `summary.md`: 当前状态、问题、待改进项和完整 Markdown 文档地图，主要给用户阅读。

### docs 全局文档

- `docs/README.md`: docs 目录中文索引。
- `docs/architecture/structure.md`: 当前架构事实源。
- `docs/architecture/state-machine.md`: Mission 状态机说明。
- `docs/runtime/artifacts.md`: artifact 存储和内容边界。
- `docs/status/progress.md`: 当前进度、能力列表和验证结果。
- `docs/status/next-steps.md`: 推荐下一步和真实执行前检查项。
- `docs/status/README.md`: 状态目录说明。
- `docs/debug/debug.md`: 调试、验证和排障记录。
- `docs/vision/plan.md`: 长期产品愿景，不作为当前事实源。
- `docs/api/orchestrator-api.md`: Orchestrator API 合同。
- `docs/api/auth.md`: API 认证和本地边界。
- `docs/api/schema.md`: 共享 schema、状态值和 Prisma 模型说明。
- `docs/security/safety.md`: dry-run、真实模式和 secret 安全边界。
- `docs/security/approval-policy.md`: 审批类型和 gated real 执行前置条件。
- `docs/security/worker-permissions.md`: worker、CLI、API、Hub 权限边界。
- `docs/runtime/queue-runtime.md`: 队列运行时、WorkerRun wrapper 和安全边界。
- `docs/runtime/worker-runtime.md`: worker runtime facade 和队列 job contract。
- `docs/runtime/storage.md`: PostgreSQL、Redis、Prisma 和存储抽象说明。
- `docs/operations/operations.md`: 本地启动、日常 demo、reset、备份和恢复流程。
- `docs/operations/local-development.md`: 本地开发路径和 dry-run/mock 默认边界。
- `docs/operations/health-checks.md`: doctor、API、Hub、integration 和 queue 健康检查。
- `docs/operations/troubleshooting.md`: 常见本地故障排查。
- `docs/operations/development-standards.md`: 当前开发纪律、测试和文档维护规则。
- `docs/integrations/overview.md`: 集成共享行为和执行边界。
- `docs/integrations/github.md`: GitHub dry-run 和 gated real adapter 合同。
- `docs/integrations/coolify.md`: Coolify dry-run 和 gated real adapter 合同。
- `docs/integrations/uptime-kuma.md`: Uptime Kuma dry-run 和 gated real adapter 合同。
- `docs/integrations/plane.md`: Plane dry-run 和 gated real adapter 合同。
- `docs/workers/codex-worker.md`: Codex worker dry-run 和 gated real runner 边界。
- `docs/workers/qa-worker.md`: QA worker 输入、输出、Playwright 和 AI exploratory QA 边界。
- `docs/workers/auto-fix-loop.md`: 自动修复闭环和 gated real fix 合同。
- `docs/workers/playwright.md`: Playwright deterministic QA 和 artifact 规则。
- `docs/workers/playwright-mcp.md`: Playwright MCP 后续 AI 探索说明。
- `docs/workers/real-codex-execution-readiness.md`: 真实 Codex 执行前 guardrail。
- `docs/apps/hub-web.md`: Hub Web 启动、路由和 demo flow。
- `docs/projects/project-registry.md`: project registry scan 和 DB sync 行为。
- `docs/projects/project-passport.md`: Project Passport 字段和 ai-novelist caveat。
- `docs/projects/mission-planner.md`: deterministic Mission Planner API 和 CLI。
```

Expected: every moved global doc appears once.

- [ ] **Step 4: Add ADR, prompt, workflow, and archive map**

Continue the document map with:

```markdown
### ADR 决策历史

- `docs/adr/0001-current-architecture-alignment.md`: 记录当前架构和早期 plan 的对齐决策。
- `docs/adr/0002-real-execution-safety-boundary.md`: 记录真实执行安全边界。
- `docs/adr/0003-external-integrations-gated-mode.md`: 记录外部集成 gated real 模式。
- `docs/adr/0004-artifact-store-and-retention-policy.md`: 记录 artifact store 和 retention 策略。
- `docs/adr/0005-temporal-langgraph-decision.md`: 记录暂不引入 Temporal/LangGraph 的决策。

### 模板和 prompt

- `docs/prompts/ai-qa-playwright-mcp.md`: AI QA Playwright MCP prompt 模板。
- `docs/prompts/bug-report-template.md`: Bug report 模板。
- `docs/prompts/qa-report-template.md`: QA report 模板。
- `packages/prompts/qa-explore.md`: package 内 AI exploratory QA prompt 输入模板。

### Superpowers 工作流

- `docs/superpowers/README.md`: Superpowers 工作流目录说明。
- `docs/superpowers/plans/README.md`: 当前实施计划目录说明。
- `docs/superpowers/plans/2026-06-04-aggressive-documentation-cleanup.md`: 上一轮激进文档清理实施记录，作为历史计划保留。
- `docs/superpowers/plans/2026-06-04-documentation-map-and-structure.md`: 当前文档地图和目录重整实施计划。
- `docs/superpowers/specs/2026-06-03-aggressive-documentation-cleanup-design.md`: 上一轮激进文档清理设计记录。
- `docs/superpowers/specs/2026-06-04-documentation-map-and-structure-design.md`: 当前文档地图和目录重整设计记录。

### 归档入口

- `docs/archive/README.md`: 归档策略入口；当前默认不保留低价值历史材料。
```

Expected: active current plan/spec and retained historical plan/spec are visible.

- [ ] **Step 5: Add code-adjacent README and context map**

Continue the document map with:

```markdown
### 代码目录就近 README

- `apps/README.md`: apps 工作区说明。
- `apps/hub/README.md`: Hub Web app commands。
- `apps/orchestrator-api/README.md`: Orchestrator API app endpoints、run 和 tests。
- `apps/worker-runner/README.md`: Worker Runner commands。
- `packages/README.md`: packages 工作区说明。
- `packages/auto-fix-loop/README.md`: auto-fix-loop package 说明。
- `packages/db/README.md`: database package 责任、模型和命令。
- `packages/demo-workflow/README.md`: demo workflow dry-run 边界。
- `packages/integrations/README.md`: integrations package 安全合同和 provider。
- `packages/mission-core/README.md`: Mission Core exports 和状态流。
- `packages/mission-planner/README.md`: Mission Planner exports、生成文件和命令。
- `packages/mission-schema/README.md`: Mission Schema exports、资源合同和状态值。
- `packages/project-passport/README.md`: Project Passport package 责任和命令。
- `packages/project-registry/README.md`: Project Registry package 行为。
- `packages/worker-runtime/README.md`: Worker Runtime package 说明。
- `workers/README.md`: workers 工作区说明。
- `workers/codex-worker/README.md`: Codex Worker package API 和检查。
- `workers/qa-worker/README.md`: QA Worker package 说明。
- `scripts/README.md`: scripts 和 PSF CLI 说明。

### Mission 和项目上下文

- `missions/README.md`: Mission 目录说明。
- `missions/mission-0001-ai-novelist-chapter-review/mission.md`: 示例 Mission 计划。
- `missions/mission-0001-ai-novelist-chapter-review/acceptance.md`: 示例 Mission 验收计划。
- `missions/mission-0001-ai-novelist-chapter-review/technical-notes.md`: 示例 Mission 技术说明。
- `missions/mission-0001-ai-novelist-chapter-review/risk-notes.md`: 示例 Mission 风险说明。
- `missions/mission-0001-ai-novelist-chapter-review/codex-prompt.md`: 示例 Codex dry-run prompt。
- `missions/mission-0001-ai-novelist-chapter-review/dev-summary.md`: 示例 Codex dry-run summary。
- `missions/mission-0001-ai-novelist-chapter-review/qa-report.md`: 示例 QA report。
- `missions/mission-0001-ai-novelist-chapter-review/fix-mission.md`: 示例 fix Mission。
- `missions/mission-0001-ai-novelist-chapter-review/fix-acceptance.md`: 示例 fix 验收计划。
- `missions/mission-0001-ai-novelist-chapter-review/fix-codex-prompt.md`: 示例 fix Codex prompt。
- `projects/README.md`: projects 目录说明。
- `projects/ai-novelist/README.md`: ai-novelist registry entry。
- `projects/ai-novelist/AGENTS.md`: ai-novelist 项目级 agent 规则。
- `projects/ai-novelist/qa-charter.md`: ai-novelist QA charter。
```

Expected: kept-near-code/generated-context files are represented without moving them.

- [ ] **Step 6: Include generated-root docs in map**

If `artifacts/README.md` or `workspaces/README.md` exist, include:

```markdown
### 生成目录说明

- `artifacts/README.md`: artifact 输出目录说明。
- `workspaces/README.md`: worker checkout 根目录说明。
```

Expected: structure-check-required generated directory docs remain discoverable.

- [ ] **Step 7: Run inventory consistency check**

Run:

```bash
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './artifacts' -prune -o -path './workspaces' -prune -o -name '*.md' -type f -print | sort
```

Expected: every listed file outside `artifacts/` and `workspaces/` appears in the `summary.md` document map.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add summary.md
git commit -m "更新中文文档总览地图" -m "将 summary 改为用户优先阅读的中文总览，记录当前问题、待改进项、文档清理状态和全部 Markdown 文档地图。"
```

Expected: commit succeeds.

---

## Task 6: Update Cross-Document Links And Historical Path Notes

**Files:**

- Modify: moved docs that contain old current path references.
- Modify: `docs/archive/README.md`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/README.md`
- Modify: current plan/spec path references only when they describe current source priority or current commands.
- Test: old path scan.

- [ ] **Step 1: Replace current-path references**

Run this scan:

```bash
rg -n '\b(struct\.md|debug\.md|plan\.md|docs/progress\.md|docs/next-steps\.md|docs/api\.md|docs/safety\.md|docs/queue-runtime\.md|docs/integrations\.md)\b' . --glob '*.md' --glob '!node_modules/**' --glob '!artifacts/**' --glob '!workspaces/**'
```

Update current guidance references to:

- `struct.md` -> `docs/architecture/structure.md`
- `debug.md` -> `docs/debug/debug.md`
- `plan.md` -> `docs/vision/plan.md`
- `docs/progress.md` -> `docs/status/progress.md`
- `docs/next-steps.md` -> `docs/status/next-steps.md`
- `docs/api.md` -> `docs/api/orchestrator-api.md`
- `docs/safety.md` -> `docs/security/safety.md`
- `docs/queue-runtime.md` -> `docs/runtime/queue-runtime.md`
- `docs/integrations.md` -> `docs/integrations/overview.md`

Expected: current docs use new paths.

- [ ] **Step 2: Preserve old paths only as history**

For `docs/debug/debug.md`, `docs/superpowers/plans/2026-06-04-aggressive-documentation-cleanup.md`, and `docs/superpowers/specs/2026-06-03-aggressive-documentation-cleanup-design.md`, old paths may remain only if the surrounding sentence makes clear it is a historical record or old command.

If a line could be read as current guidance, rewrite the sentence to start with:

```markdown
Historical note:
```

or:

```markdown
历史记录：
```

Expected: old path scan output is explainable line by line as history, not current guidance.

- [ ] **Step 3: Update archive and Superpowers index paths**

In `docs/archive/README.md`, update root fact source links:

```markdown
- `../../docs/architecture/structure.md`
- `../../summary.md`
- `../../docs/debug/debug.md`
```

In `docs/superpowers/README.md` and `docs/superpowers/plans/README.md`, replace references to `summary.md` and `debug.md` only when needed:

- `summary.md` remains root `summary.md`.
- `debug.md` becomes `docs/debug/debug.md`.
- Completed plans should still be removed after decisions and verification results are represented in `summary.md`, `docs/debug/debug.md`, ADRs, or current docs.

Expected: index docs use current debug path.

- [ ] **Step 4: Run old path scan**

Run:

```bash
rg -n '\b(struct\.md|debug\.md|plan\.md|docs/progress\.md|docs/next-steps\.md|docs/api\.md|docs/safety\.md|docs/queue-runtime\.md|docs/integrations\.md)\b' . --glob '*.md' --glob '!node_modules/**' --glob '!artifacts/**' --glob '!workspaces/**'
```

Expected:

- `summary.md` may still appear as root current path.
- `dev-summary.md` generated artifact names are allowed because they are not `summary.md`.
- Old `struct.md`, `debug.md`, `plan.md`, and flat `docs/*.md` paths appear only in historical records or migration notes.
- No current guidance points to deleted/moved paths.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add -A
git commit -m "修正文档迁移后的路径引用" -m "将当前文档引用更新到新的 docs 主题目录，并明确旧路径只作为历史记录保留，避免迁移后出现断链或误导入口。"
```

Expected: commit succeeds.

---

## Task 7: Final Validation

**Files:**

- Modify: `summary.md`
- Modify: `docs/debug/debug.md`
- Test: documentation and full project checks.

- [ ] **Step 1: Run structure and whitespace checks**

Run:

```bash
git status --short --branch
git diff --check
node scripts/check-phase1-structure.mjs
```

Expected:

- Working tree is clean before final notes or contains only `summary.md` and `docs/debug/debug.md`.
- `git diff --check` has no output.
- Structure check passes.

- [ ] **Step 2: Run Markdown inventory**

Run:

```bash
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './artifacts' -prune -o -path './workspaces' -prune -o -name '*.md' -type f -print | sort
```

Expected:

- Root Markdown files are `./AGENTS.md`, `./README.md`, and `./summary.md`.
- Global docs are under the new `docs/` topic directories.
- apps/packages/workers/missions/projects local docs remain in place.

- [ ] **Step 3: Run old current-path scan**

Run:

```bash
rg -n '\b(struct\.md|debug\.md|plan\.md|docs/progress\.md|docs/next-steps\.md|docs/api\.md|docs/safety\.md|docs/queue-runtime\.md|docs/integrations\.md)\b' . --glob '*.md' --glob '!node_modules/**' --glob '!artifacts/**' --glob '!workspaces/**'
```

Expected:

- No active current guidance points to old paths.
- Historical records may contain old paths only when the text says they are historical.
- `dev-summary.md` references are not a failure.

- [ ] **Step 4: Run safety-boundary scan**

Run:

```bash
rg -n 'realNetworkCall.*false|default-safe|gated real|injected runner|injected transport|do not execute Codex|does not call external' AGENTS.md README.md summary.md docs --glob '*.md'
```

Expected: active safety-boundary guidance remains present in `AGENTS.md`, `README.md`, `summary.md`, architecture/security/runtime/API/integration docs, or debug records.

- [ ] **Step 5: Generate Prisma client and run full check**

Run:

```bash
pnpm db:generate
pnpm check
```

Expected:

- Prisma client generation succeeds.
- `pnpm check` exits 0.
- Typecheck and test tasks pass.

- [ ] **Step 6: Add final validation record to debug doc**

Append this entry to `docs/debug/debug.md`:

```markdown
### 2026-06-04 - Documentation Map And Structure Validation

- Context: final validation after moving global Markdown into topic directories and keeping `README.md`, `AGENTS.md`, and `summary.md` as root entrypoints.
- Symptom: root and `docs/` Markdown paths were too flat for user navigation and made `summary.md` incomplete as a document map.
- Scope: root Markdown files, global `docs/` files, code-adjacent README files, Mission/project context files, Superpowers workflow files, structure checks, and current path references.
- Investigation: ran structure checks, Markdown inventory, old-path scans, safety-boundary scans, and full project checks.
- Fix: moved global docs into topic directories, kept code-adjacent/generated context docs in place, rewrote user-facing entry docs in Chinese, updated `summary.md` document map, and strengthened `AGENTS.md` documentation maintenance rules.
- Verification: record the exact passing commands and any historical-path matches that remain intentionally.
- Follow-up: keep `summary.md`'s document map updated whenever Markdown files are added, moved, renamed, or deleted.
```

Replace the `Verification:` sentence with the actual observed results before committing.

- [ ] **Step 7: Add final summary cleanup record**

In `summary.md`, under `## 最近已解决的文档问题`, add:

```markdown
- 全局 Markdown 已迁入 `docs/` 主题目录，根目录保留 `README.md`、`AGENTS.md`、`summary.md` 三个入口；`summary.md` 现在维护完整文档地图。
```

Expected: cleanup result is visible in user-facing summary.

- [ ] **Step 8: Commit final validation**

Run:

```bash
git add summary.md docs/debug/debug.md
git commit -m "记录文档目录重整验证" -m "记录全局 Markdown 主题目录迁移、中文文档地图、AGENTS 维护规则强化和最终验证结果。"
```

Expected: commit succeeds.

---

## Final Verification Summary

After all tasks, run:

```bash
git status --short --branch
git diff --check HEAD~7..HEAD
node scripts/check-phase1-structure.mjs
find . -maxdepth 1 -name '*.md' -type f | sort
find docs -maxdepth 3 -name '*.md' -type f | sort
rg -n '\b(struct\.md|debug\.md|plan\.md|docs/progress\.md|docs/next-steps\.md|docs/api\.md|docs/safety\.md|docs/queue-runtime\.md|docs/integrations\.md)\b' . --glob '*.md' --glob '!node_modules/**' --glob '!artifacts/**' --glob '!workspaces/**'
rg -n 'realNetworkCall.*false|default-safe|gated real|injected runner|injected transport|do not execute Codex|does not call external' AGENTS.md README.md summary.md docs --glob '*.md'
pnpm db:generate
pnpm check
```

Expected:

- Working tree is clean.
- Root Markdown files are `AGENTS.md`, `README.md`, and `summary.md`.
- Global docs live under `docs/` topic directories.
- Code-adjacent README and Mission/project context docs remain near their owning directories.
- `summary.md` lists all Markdown categories and paths.
- Old current paths appear only in historical records or migration notes.
- Safety boundaries remain documented.
- Structure check and full project check pass.
