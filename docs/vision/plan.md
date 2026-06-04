# plan.md — Personal Software Factory / 个人 AI 软件工厂

> Historical note: this file was originally authored as root `plan.md`. Its current repository path is `docs/vision/plan.md`; legacy `plan.md` mentions below are historical prompt text, not current documentation-entry guidance.

> 当前说明：本文件仅保留长期产品愿景和早期规划上下文，不是当前实现事实源，也不是当前任务执行指令。当前事实和执行入口以 `summary.md`、`docs/architecture/structure.md`、`docs/status/progress.md`、`docs/debug/debug.md` 和 `AGENTS.md` 为准。

> 目标：为个人开发者构建一个可持续演进的 AI 软件工厂。用户只提出需求，系统自动完成需求拆解、分支开发、自动测试、AI 浏览器探索测试、缺陷回传、自动修复、预览部署、运行监控与 Web 进度管理。  
> 执行方式：本文件将交给 Codex CLI，并优先由 Superpowers 的 `brainstorming` / planning / TDD 工作流驱动执行。  
> 首个接入项目：`hxfei-git/ai-novelist`。  
> 默认仓库名：`personal-software-factory`。

---

## 0. 给 Codex / Superpowers 的最高优先级执行指令

在执行本计划时，Codex 必须遵守以下规则：

1. **先设计，后实现。**
   - 首先启用 Superpowers 的 brainstorming 能力。
   - 先阅读本 `plan.md`、仓库现状、已有代码、已有文档。
   - 生成设计文档：`docs/superpowers/specs/YYYY-MM-DD-personal-software-factory-design.md`。
   - 生成实施计划：`docs/superpowers/plans/YYYY-MM-DD-personal-software-factory-implementation.md`。
   - 设计未通过自检前，不允许开始大规模编码。

2. **本计划已经包含默认架构决策。**
   - 遇到非阻塞问题时，不要频繁向用户提问，直接采用本文默认方案。
   - 只有遇到会导致数据丢失、生产风险、费用风险、凭证风险、外部服务不可用、架构无法继续的问题，才向用户确认。

3. **每个阶段都必须可验证。**
   - 每个阶段都要有代码、文档、测试、验收标准。
   - 每个阶段结束前必须运行对应测试。
   - 每个阶段结束后写入 `docs/progress/phase-XX-summary.md`。

4. **AI 不允许直接修改生产环境。**
   - 不允许直接 push 到 `main`。
   - 不允许直接部署生产。
   - 不允许删除用户数据。
   - 不允许泄露 `.env`、API Key、数据库密码、Cookie、Token。
   - 所有高风险操作必须进入 approval 状态。

5. **开发必须遵守闭环。**
   - 需求必须变成 Mission。
   - Mission 必须有验收标准。
   - 开发必须在独立 branch/worktree 中完成。
   - 测试失败必须生成结构化报告。
   - AI QA 发现的问题必须沉淀为可重复执行的 Playwright 回归测试。
   - 同一 Mission 自动修复最多 3 轮；超过后进入人工审查状态。

---

## 1. 系统定位

本系统不是普通的项目管理工具，也不是单纯的 AI 编程插件，而是一个面向个人开发者的 **AI 软件工厂控制平面**。

用户希望达到：

```text
我提出自然语言需求
  ↓
系统自动理解需求并拆解任务
  ↓
Codex 自动开发
  ↓
AI 像人类测试员一样访问网页、点击、输入、等待、误操作、发现问题
  ↓
系统把问题交给 Codex 修复
  ↓
自动回归测试
  ↓
Web 管理台显示开发进度、测试结果、部署状态、运行状态
  ↓
我只处理最终审批和少数高风险问题
```

本系统必须围绕“闭环”设计，而不是围绕“聊天”设计。

---

## 2. 总体架构

### 2.1 架构总览

```text
┌──────────────────────────────────────────────────────────────┐
│ User / 个人开发者                                             │
│ - 提自然语言需求                                               │
│ - 查看项目进度                                                 │
│ - 审批高风险动作                                               │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Hub Web / 管理平台                                             │
│ - 项目列表                                                     │
│ - Mission 状态                                                 │
│ - Worker 运行日志                                              │
│ - QA 报告与截图                                                │
│ - 部署与监控状态                                               │
│ - 人工审批入口                                                 │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Orchestrator API / AI 管家控制平面                             │
│ - Mission 状态机                                               │
│ - 任务队列                                                     │
│ - Worker 调度                                                  │
│ - 事件日志                                                     │
│ - Artifact 管理                                                │
│ - Approval 管理                                                │
│ - 外部系统集成                                                 │
└───────┬───────────────┬────────────────┬────────────────────┘
        │               │                │
        ▼               ▼                ▼
┌──────────────┐ ┌────────────────┐ ┌──────────────────────────┐
│ Codex Worker │ │ QA Worker      │ │ Deploy / Monitor Worker  │
│ - 开发功能    │ │ - Playwright   │ │ - Coolify Preview/Prod   │
│ - 修 Bug      │ │ - AI Explorer  │ │ - Uptime Kuma 状态       │
│ - 生成 PR     │ │ - 回归测试      │ │ - 健康检查               │
└──────┬───────┘ └───────┬────────┘ └───────────┬──────────────┘
       │                 │                      │
       ▼                 ▼                      ▼
┌──────────────┐ ┌────────────────┐ ┌──────────────────────────┐
│ GitHub Repo  │ │ QA Artifacts   │ │ Staging / Production     │
│ - Branch      │ │ - screenshots  │ │ - 运行环境               │
│ - Commit      │ │ - traces       │ │ - 预览地址               │
│ - PR          │ │ - bug reports  │ │ - 运行状态               │
└──────────────┘ └────────────────┘ └──────────────────────────┘
```

### 2.2 核心思想

系统中不应该有一个“万能大脑”自由发挥，而应该有一个确定的状态机：

```text
received
  → planning
  → planned
  → approval_required?
  → dev_queued
  → dev_running
  → build_running
  → test_running
  → staging_deploying
  → staging_ready
  → qa_running
  → bugs_found?
  → fixing
  → regression_running
  → ready_for_review
  → release_approval
  → production_deploying
  → released
```

异常状态：

```text
paused
failed
cancelled
blocked
needs_human
```

### 2.3 核心原则

1. **AI 开发与 AI 测试必须分离。**
   - Codex Worker 负责实现。
   - QA Worker 负责从用户角度验证。
   - Review Worker 负责审查风险。
   - 不允许同一个执行结果未经测试直接进入完成状态。

2. **探索测试必须沉淀为回归测试。**
   - AI QA 发现问题后，必须生成 `bugs.json`。
   - 每个可复现 bug 必须生成或更新 Playwright spec。
   - 回归测试通过后，才能关闭 bug。

3. **项目必须标准化。**
   - 每个项目都有 `project.passport.yaml`。
   - 每个项目都有 `AGENTS.md`。
   - 每个项目声明启动、构建、测试、部署、核心用户流程。

4. **系统先轻后重。**
   - MVP 用 PostgreSQL + Redis + BullMQ + Node/TypeScript。
   - 后续再引入 Temporal / LangGraph 做复杂长流程。
   - 不要第一阶段就做复杂多 Agent 平台。

---

## 3. 技术选型

### 3.1 主体技术栈

默认采用 TypeScript monorepo：

```text
pnpm workspace
Turborepo
TypeScript
Node.js 20+
Fastify API
Next.js Hub
Prisma + PostgreSQL
Redis + BullMQ
Playwright
Docker Compose
```

选择 TypeScript 的原因：

1. Hub、API、Worker、Playwright 都可以统一技术栈。
2. Playwright 原生生态更顺。
3. GitHub、Plane、Coolify、Uptime Kuma 等 HTTP/Webhook 集成方便。
4. 后续如果引入 Temporal，可使用 Temporal TypeScript SDK。

### 3.2 外部开源系统

| 层级 | 推荐项目 | 用法 |
|---|---|---|
| AI 开发执行 | OpenAI Codex CLI | 通过 `codex exec` 自动开发、修复、总结 |
| Agent 方法论 | obra/superpowers | brainstorming、planning、TDD、review 工作流 |
| AI 编程工作台参考 | OpenHands / Agent Canvas | 参考 UI 与 Agent Server 结构，不作为 MVP 核心 |
| 异步工程师参考 | LangChain Open SWE | 参考 issue → plan → code → test → PR 模式 |
| 浏览器自动化 | Microsoft Playwright | 固定 E2E 与回归测试 |
| AI 浏览器探索 | Microsoft Playwright MCP | 让 AI 使用浏览器进行探索测试 |
| 项目管理 | Plane | 需求、Bug、路线图、Cycle、Module |
| 部署 | Coolify | staging / preview / production 部署 |
| 运行监控 | Uptime Kuma | HTTP/TCP/Docker 健康监控 |
| 工作流集成 | n8n，可选 | 通知、Webhook、状态同步 |
| 长流程编排 | Temporal，后续 | Durable workflow、失败恢复 |
| Agent 状态图 | LangGraph，后续 | 复杂 AI 决策、human-in-the-loop |

### 3.3 MVP 不做的事情

第一版不要做：

```text
不要自研完整 Jira
不要自研完整 PaaS
不要自研完整监控系统
不要从零写浏览器自动化框架
不要让 AI 直接管理生产服务器
不要一开始做复杂多 Agent 自治系统
不要做多租户 SaaS
不要做权限复杂的企业系统
```

第一版只做：

```text
单用户
本地或单 VPS
一个主项目 ai-novelist
一个 Orchestrator
一个 Codex Worker
一个 QA Worker
一个 Hub Dashboard
```

---

## 4. Monorepo 目录结构

Codex 应创建以下结构：

```text
personal-software-factory/
  plan.md
  README.md
  AGENTS.md
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .env.example
  .gitignore
  docker-compose.yml

  apps/
    api/
      src/
        index.ts
        server.ts
        routes/
        services/
        workers/
      tests/
      package.json

    hub/
      app/
      components/
      lib/
      package.json

  workers/
    codex-worker/
      src/
        index.ts
        runCodex.ts
        gitWorkspace.ts
        prompts/
      tests/
      package.json

    qa-worker/
      src/
        index.ts
        runDeterministicQa.ts
        runAiExploration.ts
        bugExtractor.ts
        playwright/
      tests/
      package.json

    deploy-worker/
      src/
        index.ts
        coolifyClient.ts
      tests/
      package.json

    monitor-worker/
      src/
        index.ts
        uptimeKumaClient.ts
      tests/
      package.json

  packages/
    db/
      prisma/
        schema.prisma
      src/
        client.ts
      package.json

    schemas/
      src/
        projectPassport.ts
        mission.ts
        bug.ts
        qaReport.ts
        deployment.ts
        events.ts
      tests/
      package.json

    core/
      src/
        stateMachine.ts
        qualityGates.ts
        artifactStore.ts
        commandRunner.ts
        eventLog.ts
      tests/
      package.json

    integrations/
      src/
        github/
        plane/
        coolify/
        uptimeKuma/
      tests/
      package.json

    prompts/
      pm-plan.md
      dev-implement.md
      qa-explore.md
      fix-bugs.md
      review-pr.md

  projects/
    ai-novelist/
      project.passport.yaml
      AGENTS.md
      qa-charter.md
      missions/
      generated-tests/

  workspaces/
    .gitkeep

  artifacts/
    .gitkeep

  docs/
    architecture.md
    workflow.md
    safety.md
    operations.md
    adr/
    progress/
    superpowers/
      specs/
      plans/
```

---

## 5. 核心数据模型

### 5.1 Project

项目是系统可管理的软件单元。

字段：

```text
id
slug
name
description
repo_url
default_branch
local_path
passport_path
production_url
staging_url
status
created_at
updated_at
```

### 5.2 Mission

Mission 是一次用户需求、开发任务或修复任务。

字段：

```text
id
project_id
title
slug
raw_request
mission_markdown
acceptance_markdown
status
priority
risk_level
branch_name
workspace_path
pr_url
current_attempt
max_attempts
created_at
updated_at
```

### 5.3 MissionEvent

所有状态变化必须记录事件。

字段：

```text
id
mission_id
type
message
payload_json
created_at
```

事件类型示例：

```text
MISSION_CREATED
MISSION_PLANNED
BRANCH_CREATED
CODEX_STARTED
CODEX_FINISHED
BUILD_STARTED
BUILD_FAILED
QA_STARTED
BUG_FOUND
FIX_STARTED
FIX_FINISHED
APPROVAL_REQUIRED
READY_FOR_REVIEW
RELEASED
FAILED
```

### 5.4 WorkerRun

记录每个 Worker 的执行。

字段：

```text
id
mission_id
worker_type
status
command
stdout_path
stderr_path
started_at
finished_at
exit_code
metadata_json
```

### 5.5 Bug

字段：

```text
id
mission_id
qa_run_id
title
severity
status
reproduction_steps
expected_result
actual_result
evidence_json
suggested_fix
regression_test_path
created_at
updated_at
```

Severity：

```text
P0: 数据丢失、安全问题、系统不可用
P1: 核心流程不可用
P2: 重要功能异常但有绕过方式
P3: 文案、样式、小交互问题
```

### 5.6 QA Run

字段：

```text
id
mission_id
target_url
mode
status
summary
report_path
screenshots_dir
trace_path
bugs_json_path
created_at
updated_at
```

Mode：

```text
deterministic
ai_exploratory
regression
smoke
```

### 5.7 Artifact

字段：

```text
id
mission_id
type
path
mime_type
size
created_at
```

类型：

```text
mission.md
acceptance.md
dev-summary.md
qa-report.md
bugs.json
screenshot
playwright-trace
regression-test
build-log
test-log
```

### 5.8 Approval

字段：

```text
id
mission_id
type
status
reason
payload_json
created_at
approved_at
rejected_at
```

Approval 类型：

```text
PRODUCTION_DEPLOY
DATABASE_MIGRATION
SECRET_CHANGE
DESTRUCTIVE_OPERATION
EXTERNAL_COST_RISK
SECURITY_RISK
```

---

## 6. Project Passport 标准

每个被系统管理的项目都必须有 `project.passport.yaml`。

### 6.1 Schema 目标

`project.passport.yaml` 用来告诉 Orchestrator、Codex、QA、Deploy Worker：

```text
这个项目是什么
怎么安装
怎么启动
怎么测试
怎么构建
怎么部署
有哪些核心用户流程
哪些操作是高风险
哪些质量门禁必须通过
```

### 6.2 ai-novelist 示例

Codex 应创建：

`projects/ai-novelist/project.passport.yaml`

```yaml
id: ai-novelist
name: AI 小说助手
description: Web AI writing assistant for creating, reviewing, repairing and exporting novels.
repo:
  url: git@github.com:hxfei-git/ai-novelist.git
  default_branch: main

runtime:
  kind: web
  backend:
    language: python
    framework: unknown
  frontend:
    language: typescript
    framework: unknown

paths:
  repo_root: ./workspaces/ai-novelist
  backend_root: .
  frontend_root: web/frontend
  e2e_root: tests/e2e

commands:
  install:
    - python -m venv .venv
    - . .venv/bin/activate && pip install -e .
    - npm --prefix web/frontend install
  dev:
    - . .venv/bin/activate && ai-novelist web --host 0.0.0.0 --port 8000
  test:
    - . .venv/bin/activate && pytest -q
  build:
    - npm --prefix web/frontend run build
  e2e:
    - npx playwright test
  lint: []

urls:
  local: http://127.0.0.1:8000
  staging: ""
  production: ""

quality_gates:
  require_build: true
  require_unit_tests: true
  require_e2e_tests: true
  require_ai_qa: true
  require_pr_review: true
  require_human_production_approval: true

core_flows:
  - id: create_novel_project
    name: 新建小说项目
    priority: P0
  - id: generate_worldview
    name: 生成世界观
    priority: P0
  - id: generate_outline
    name: 生成大纲
    priority: P0
  - id: generate_chapter
    name: 生成章节
    priority: P0
  - id: review_chapter
    name: 审稿章节
    priority: P0
  - id: repair_chapter
    name: 修复章节
    priority: P0
  - id: export_novel
    name: 导出小说
    priority: P1

risk_rules:
  destructive_paths:
    - data/
    - uploads/
    - database/
  requires_approval:
    - database_migration
    - deleting_user_data
    - production_deploy
    - changing_auth
    - changing_secrets
```

---

## 7. AGENTS.md 标准

每个项目必须有 `AGENTS.md`。

### 7.1 根仓库 AGENTS.md

Codex 应在 `personal-software-factory/AGENTS.md` 中写入：

```markdown
# AGENTS.md — Personal Software Factory

## Mission
Build a personal AI software factory that turns user requirements into planned missions, Codex-driven development, AI QA, iterative fixes, staging deployments, and monitored releases.

## Working Rules
- Always read `plan.md` before major changes.
- Follow Superpowers brainstorming/planning/TDD workflow when available.
- Do not skip tests.
- Do not push to main.
- Do not deploy production without explicit approval.
- Do not print secrets.
- Keep changes small and phase-based.
- Update `docs/progress/` after each completed phase.

## Required Checks
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`

## Architecture Defaults
- TypeScript monorepo.
- Fastify API.
- Next.js Hub.
- Prisma + PostgreSQL.
- Redis + BullMQ.
- Playwright for E2E.
- Codex CLI for code changes.
- Coolify for deployment integration.
- Uptime Kuma for monitoring integration.
```

### 7.2 ai-novelist AGENTS.md

Codex 应在 `projects/ai-novelist/AGENTS.md` 中写入：

```markdown
# AGENTS.md — AI Novel Assistant

## Project Goal
This project is an AI novel writing assistant. It must support novel setup, worldview generation, outline generation, chapter generation, chapter review, chapter repair, and export.

## Development Rules
- Do not remove existing user data.
- Do not bypass review flow after chapter generation.
- Do not hide backend errors from the user.
- Every critical user flow must have an E2E test.
- Every bug found by AI QA must be converted into a regression test.

## Expected User Flows
1. Create a novel project.
2. Generate worldview.
3. Generate outline.
4. Generate chapter.
5. Automatically review chapter.
6. Repair chapter from review report.
7. Export final text.

## Required Checks
- Backend tests must pass.
- Frontend build must pass.
- Playwright E2E tests must pass.
```

---

## 8. Mission 文件标准

每个 Mission 目录：

```text
missions/<mission-id>/
  mission.md
  acceptance.md
  dev-summary.md
  qa-report.md
  bugs.json
  regression-tests/
  screenshots/
  traces/
```

### 8.1 mission.md 模板

```markdown
# Mission: <title>

## Background
Explain the current problem and why this work matters.

## Goal
What should be true after the mission is complete.

## User Story
As a <user>, I want <capability>, so that <benefit>.

## Scope
### In Scope
- ...

### Out of Scope
- ...

## Acceptance Criteria
- ...

## Technical Constraints
- ...

## Risk Rules
- ...

## Required Commands
- ...

## Done Means
- Code implemented.
- Unit/build/e2e checks pass.
- QA report passes.
- Bugs fixed or explicitly accepted.
- PR is created or local branch is ready.
```

### 8.2 bugs.json Schema 示例

```json
{
  "bugs": [
    {
      "id": "bug-001",
      "title": "Repeatedly clicking Generate Chapter creates duplicate requests",
      "severity": "P1",
      "status": "open",
      "reproduction_steps": [
        "Open staging URL",
        "Create a novel project",
        "Click Generate Chapter five times quickly"
      ],
      "expected_result": "The button becomes disabled and only one request is sent.",
      "actual_result": "Multiple requests are sent and chapter state becomes inconsistent.",
      "evidence": {
        "screenshots": ["screenshots/bug-001.png"],
        "trace": "traces/bug-001.zip",
        "console_errors": [],
        "network_errors": []
      },
      "suggested_fix": "Add frontend pending state lock and backend idempotency key.",
      "regression_test": "tests/e2e/generated/bug-001.spec.ts"
    }
  ]
}
```

---

## 9. 状态机设计

### 9.1 状态枚举

在 `packages/core/src/stateMachine.ts` 中实现：

```ts
export const MissionStatus = {
  RECEIVED: "received",
  PLANNING: "planning",
  PLANNED: "planned",
  APPROVAL_REQUIRED: "approval_required",
  DEV_QUEUED: "dev_queued",
  DEV_RUNNING: "dev_running",
  BUILD_RUNNING: "build_running",
  TEST_RUNNING: "test_running",
  STAGING_DEPLOYING: "staging_deploying",
  STAGING_READY: "staging_ready",
  QA_RUNNING: "qa_running",
  BUGS_FOUND: "bugs_found",
  FIXING: "fixing",
  REGRESSION_RUNNING: "regression_running",
  READY_FOR_REVIEW: "ready_for_review",
  RELEASE_APPROVAL: "release_approval",
  PRODUCTION_DEPLOYING: "production_deploying",
  RELEASED: "released",
  PAUSED: "paused",
  BLOCKED: "blocked",
  FAILED: "failed",
  CANCELLED: "cancelled"
} as const;
```

### 9.2 合法流转

必须实现 `canTransition(from, to)`。

示例：

```text
received → planning
planning → planned
planned → approval_required
planned → dev_queued
dev_queued → dev_running
dev_running → build_running
build_running → test_running
test_running → staging_deploying
staging_deploying → staging_ready
staging_ready → qa_running
qa_running → bugs_found
qa_running → ready_for_review
bugs_found → fixing
fixing → regression_running
regression_running → qa_running
ready_for_review → release_approval
release_approval → production_deploying
production_deploying → released
any non-final → paused
any non-final → failed
any non-final → cancelled
```

### 9.3 状态机测试

必须写单元测试：

```text
- allow valid transitions
- reject invalid transitions
- final states cannot transition except manual reopen
- failed worker creates failed state
- bug found creates bugs_found state
- max attempts exceeded creates needs_human / paused
```

---

## 10. API 设计

### 10.1 Project API

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
POST   /api/projects/:id/refresh
GET    /api/projects/:id/missions
```

### 10.2 Mission API

```text
GET    /api/missions
POST   /api/missions
GET    /api/missions/:id
POST   /api/missions/:id/plan
POST   /api/missions/:id/start
POST   /api/missions/:id/pause
POST   /api/missions/:id/cancel
POST   /api/missions/:id/retry
GET    /api/missions/:id/events
GET    /api/missions/:id/artifacts
GET    /api/missions/:id/bugs
GET    /api/missions/:id/qa-runs
```

### 10.3 Approval API

```text
GET    /api/approvals
POST   /api/approvals/:id/approve
POST   /api/approvals/:id/reject
```

### 10.4 Worker API

```text
GET    /api/worker-runs
GET    /api/worker-runs/:id
GET    /api/worker-runs/:id/logs
```

### 10.5 Integration API

```text
POST   /api/webhooks/github
POST   /api/webhooks/coolify
POST   /api/webhooks/plane
POST   /api/webhooks/uptime-kuma
```

---

## 11. Worker 设计

## 11.1 Codex Worker

Codex Worker 负责自动开发与修复。

### 输入

```text
mission_id
project_id
workspace_path
branch_name
mission.md
acceptance.md
attempt_number
mode: implement | fix | review
```

### 流程

```text
1. 读取 Project Passport。
2. clone repo 或更新本地镜像。
3. 创建 git worktree。
4. 创建 branch：agent/<mission-slug>-<mission-id>。
5. 写入 mission.md / acceptance.md 到 workspace。
6. 调用 codex exec。
7. 运行项目声明的 build/test/e2e 命令。
8. 生成 dev-summary.md。
9. commit 变更。
10. 可选：创建 PR。
11. 更新 Mission 状态。
```

### Codex 调用示例

具体 CLI 参数随 Codex 版本调整；默认形式：

```bash
codex exec \
  --cd "$WORKSPACE_PATH" \
  "Read AGENTS.md and docs/missions/$MISSION_ID/mission.md. Implement the mission. Run required checks. Fix failures. Write docs/missions/$MISSION_ID/dev-summary.md."
```

### Codex Worker Prompt：实现模式

文件：`packages/prompts/dev-implement.md`

```markdown
You are the Dev Agent for Personal Software Factory.

Read:
- AGENTS.md
- project.passport.yaml if present
- mission.md
- acceptance.md

Rules:
- Work only inside the current repository.
- Do not push to main.
- Do not deploy production.
- Do not delete user data.
- Prefer small, testable changes.
- Every behavioral change needs tests.
- Run the required commands from the mission.
- If a command fails, fix the underlying issue instead of hiding the failure.
- Write a clear dev-summary.md.

Output:
- Code changes
- Passing tests or explicit failure report
- dev-summary.md
```

### Codex Worker Prompt：修复模式

文件：`packages/prompts/fix-bugs.md`

```markdown
You are the Fix Agent.

Read:
- qa-report.md
- bugs.json
- Playwright traces/screenshots when available
- existing tests
- project AGENTS.md

For each open P0/P1/P2 bug:
1. Reproduce or understand the failure.
2. Add or update a regression test.
3. Fix the root cause.
4. Run targeted tests.
5. Run required project checks.
6. Update bug status only if the regression test passes.

Do not mark a bug fixed without a repeatable test unless the bug is explicitly non-deterministic and documented.
```

---

## 11.2 QA Worker

QA Worker 负责像人类测试员一样测试软件。

QA 分成两层：

```text
deterministic QA：固定 Playwright 测试
AI exploratory QA：AI 借助 Playwright MCP 探索页面
```

### 输入

```text
mission_id
project_id
target_url
acceptance.md
project.passport.yaml
qa-charter.md
mode
```

### 输出

```text
qa-report.md
bugs.json
screenshots/
traces/
generated-regression.spec.ts
```

### QA Charter 示例

文件：`projects/ai-novelist/qa-charter.md`

```markdown
# QA Charter — AI 小说助手

## Normal Flow
1. Open the app.
2. Create a novel project.
3. Enter a genre and premise.
4. Generate worldview.
5. Generate outline.
6. Generate chapter.
7. Wait for chapter review.
8. Read structured review report.
9. Click repair chapter.
10. Export result.

## Abnormal Flow
1. Click generate without input.
2. Click generate repeatedly.
3. Refresh while generation is running.
4. Go back during a multi-step flow.
5. Enter extremely long text.
6. Simulate backend API failure.
7. Try exporting before review.
8. Retry review after failure.
9. Use two tabs on the same project.

## Must Check
- No blank screen.
- No uncaught console errors.
- No unexplained 500 errors.
- Loading state must eventually resolve.
- Buttons must prevent duplicate submission.
- Errors must be visible and understandable.
- User data must not be lost.
- Chapter generation must enter review flow.
```

### AI Exploratory QA Prompt

文件：`packages/prompts/qa-explore.md`

```markdown
You are an AI QA engineer.

Your job is not to trust the implementation. Your job is to behave like a real user and try to break the app.

Read:
- acceptance.md
- qa-charter.md
- project.passport.yaml
- target URL

Use browser automation to:
1. Complete the normal user flow.
2. Try abnormal user behavior.
3. Observe console errors, network errors, stuck loading states, confusing UI, and data loss.
4. Capture evidence: screenshots, traces, request logs, console logs.
5. Write qa-report.md.
6. Write bugs.json.
7. For every reproducible bug, create or update a Playwright regression test.

Severity rules:
- P0: data loss, security issue, app unusable.
- P1: core mission flow broken.
- P2: important feature broken with workaround.
- P3: visual/text/minor issue.

Do not report vague bugs. Every bug must include reproduction steps, expected result, actual result, and evidence.
```

### Playwright MCP 设置

如果 Codex CLI 支持 MCP，应在开发机器执行一次：

```bash
codex mcp add playwright npx "@playwright/mcp@latest"
```

或者在 `~/.codex/config.toml` 加入：

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

### QA Worker 最小实现

MVP 阶段即使 AI MCP 未完全接入，也必须实现：

```text
- 自动启动目标项目或读取 staging_url
- 运行 npx playwright test
- 收集 screenshots/trace/html-report
- 根据失败结果生成 qa-report.md
- 允许 Codex Fix Worker 读取报告修复
```

---

## 11.3 Deploy Worker

第一版不要重度依赖 Coolify API，分两步做。

### MVP：本地 staging

```text
1. 从 branch 构建 Docker 镜像或启动本地 dev server。
2. 暴露本地 staging URL。
3. QA Worker 测这个 URL。
```

### 增强：Coolify Preview

```text
1. 接入 Coolify GitHub App / Deploy Key。
2. branch 或 PR 触发 preview deployment。
3. Deploy Worker 记录 preview URL。
4. QA Worker 测 preview URL。
5. 生产部署必须人工审批。
```

### Deploy Worker 状态

```text
queued
deploying
ready
failed
cancelled
```

---

## 11.4 Monitor Worker

Monitor Worker 不自研监控，只集成 Uptime Kuma。

### MVP

```text
- Hub 中手动配置 production_url / staging_url。
- 显示链接。
```

### 增强

```text
- 通过 Uptime Kuma API 或配置导入监控项。
- 定期拉取状态。
- 写入 monitors 表。
- Hub 展示：up/down、响应时间、最近失败原因。
```

监控项：

```text
HTTP 200 check
API health check
Docker container check
SSL check
Response time
```

---

## 12. Hub Web 设计

Hub 是轻量控制台，不替代 Plane/Coolify/Uptime Kuma。

### 12.1 页面结构

```text
/dashboard
/projects
/projects/:id
/projects/:id/missions
/missions/:id
/missions/:id/events
/missions/:id/qa
/missions/:id/bugs
/missions/:id/artifacts
/approvals
/settings/integrations
```

### 12.2 Dashboard 显示

```text
- 项目总数
- 正在开发 Mission 数
- QA 失败 Mission 数
- 等待审批 Mission 数
- 生产运行异常项目数
- 最近事件流
```

### 12.3 Project Detail 显示

```text
项目名称
仓库地址
生产地址
staging 地址
当前 Mission
最近部署
运行状态
核心流程覆盖率
最近 Bug
```

### 12.4 Mission Detail 显示

```text
Mission 标题
原始需求
状态时间线
当前 Worker
分支名
PR 链接
测试结果
QA 报告
Bug 列表
Artifact 下载
审批按钮
```

### 12.5 UI 原则

```text
先做可用，不做花哨。
状态必须清楚。
失败必须可追踪。
日志必须可展开。
每个外部系统都可以跳转查看。
```

---

## 13. 外部集成设计

## 13.1 GitHub

MVP：

```text
- 使用 git CLI clone / worktree / commit。
- 可选用 GitHub CLI 创建 PR。
```

增强：

```text
- GitHub App。
- Webhook 同步 PR 状态。
- 自动评论 QA 报告。
- 自动创建 Issue。
```

需要支持：

```text
gh pr create
gh pr comment
gh issue create
```

### PR 模板

```markdown
## Mission
<mission title>

## Summary
<dev summary>

## Checks
- [ ] Build passed
- [ ] Unit tests passed
- [ ] E2E tests passed
- [ ] AI QA passed
- [ ] No P0/P1 bugs remain

## QA Report
<link or artifact path>

## Risks
<risk notes>
```

---

## 13.2 Plane

MVP：

```text
- Hub 记录 Plane issue URL。
- 手动同步。
```

增强：

```text
- Mission 创建时同步 Plane Issue。
- Bug 发现时创建 Plane 子任务。
- 状态变化时同步 Plane 状态。
```

建议映射：

```text
Mission received/planning → Backlog
dev_running → In Progress
qa_running → Testing
bugs_found/fixing → Fixing
ready_for_review → Review
released → Done
failed/blocked → Blocked
```

---

## 13.3 Coolify

MVP：

```text
- 手动配置项目部署。
- Hub 保存 Coolify 项目 URL。
```

增强：

```text
- PR Preview Deployment。
- 部署状态 webhook。
- 生产部署审批。
```

---

## 13.4 Uptime Kuma

MVP：

```text
- Hub 保存 Uptime Kuma dashboard URL。
```

增强：

```text
- 自动创建 monitor。
- 定时同步 monitor 状态。
- 异常时写入 MissionEvent / ProjectEvent。
```

---

## 13.5 n8n

n8n 只作为可选集成层，不作为核心 Orchestrator。

可用场景：

```text
- Telegram/Discord/Email 通知
- GitHub/Plane/Coolify 之间状态同步
- 定时触发健康检查
- 低风险 webhook glue
```

禁止场景：

```text
- 不要用 n8n 执行高权限 shell。
- 不要把生产密钥暴露给 n8n 的 Code Node。
- 不要让 n8n 直接执行生产部署审批。
```

---

## 14. 安全策略

### 14.1 Sandbox

默认：

```text
- Codex 只在 worktree/workspace 内工作。
- Worker 在容器内运行。
- 不使用 danger/full access 模式。
- 不把宿主机根目录挂载给 Worker。
```

### 14.2 Secret 管理

```text
- `.env` 不进 git。
- Artifact 中禁止保存 token。
- Worker 日志要做 secret mask。
- Prompt 中不包含真实 secret。
- 对外展示日志前进行脱敏。
```

### 14.3 高风险审批

以下操作必须进入 approval：

```text
生产部署
数据库迁移
删除数据
改认证/权限
改支付/计费
改密钥
开启外网 webhook
引入高风险依赖
大规模重构
```

### 14.4 自动修复上限

```text
max_mission_attempts = 3
max_bug_fix_attempts = 2
max_worker_runtime = configurable
max_concurrent_missions = configurable
```

### 14.5 失败策略

```text
构建失败 → failed 或 fixing
QA P0/P1 → fixing
QA P2 → fixing 或 needs_human
QA P3 → 可进入 ready_for_review，但必须展示
超过修复次数 → paused / needs_human
```

---

## 15. 分阶段执行计划

---

# Phase 0 — Superpowers 设计启动

## 目标

让 Codex/Superpowers 先把本计划转成可执行设计文档和实施文档，而不是直接写代码。

## 任务

- [ ] 读取 `plan.md`。
- [ ] 检查当前目录是否已有代码。
- [ ] 如果是空目录，记录为 greenfield。
- [ ] 如果已有项目，识别现有结构。
- [ ] 启用 Superpowers brainstorming。
- [ ] 产出系统设计文档：
  - `docs/superpowers/specs/YYYY-MM-DD-personal-software-factory-design.md`
- [ ] 产出实施计划：
  - `docs/superpowers/plans/YYYY-MM-DD-personal-software-factory-implementation.md`
- [ ] 建立 ADR 目录：
  - `docs/adr/0001-architecture-defaults.md`
  - `docs/adr/0002-worker-sandbox-policy.md`
  - `docs/adr/0003-qa-loop-policy.md`

## 验收标准

- [ ] 设计文档存在。
- [ ] 实施计划存在。
- [ ] ADR 存在。
- [ ] 文档中明确 MVP 范围。
- [ ] 文档中明确非目标。
- [ ] 文档中明确安全边界。

---

# Phase 1 — Monorepo 初始化

## 目标

创建基础仓库结构，使后续 API、Hub、Worker、Packages 可以独立开发和测试。

## 任务

- [ ] 初始化 `package.json`。
- [ ] 初始化 `pnpm-workspace.yaml`。
- [ ] 初始化 `turbo.json`。
- [ ] 初始化 `tsconfig.base.json`。
- [ ] 创建 `apps/api`。
- [ ] 创建 `apps/hub`。
- [ ] 创建 `workers/*`。
- [ ] 创建 `packages/*`。
- [ ] 创建 `docs/`。
- [ ] 创建 `.env.example`。
- [ ] 创建 `docker-compose.yml`，包含：
  - PostgreSQL
  - Redis
  - 可选 MinIO
- [ ] 创建根 `AGENTS.md`。
- [ ] 创建根 `README.md`。

## 验收标准

- [ ] `pnpm install` 成功。
- [ ] `pnpm typecheck` 成功。
- [ ] `pnpm test` 至少能运行空测试。
- [ ] `docker compose up -d postgres redis` 成功。
- [ ] README 能说明如何启动开发环境。

---

# Phase 2 — Schema 与数据库

## 目标

建立系统核心数据模型、Prisma schema、Zod schema 和基础测试。

## 任务

- [ ] 实现 Prisma schema：
  - Project
  - Mission
  - MissionEvent
  - WorkerRun
  - QA Run
  - Bug
  - Artifact
  - Deployment
  - Monitor
  - Approval
- [ ] 实现 `packages/schemas`：
  - projectPassport.ts
  - mission.ts
  - bug.ts
  - qaReport.ts
  - deployment.ts
  - events.ts
- [ ] 实现 migration。
- [ ] 实现 seed 数据：
  - ai-novelist project
  - sample mission
- [ ] 实现 schema 单元测试。

## 验收标准

- [ ] `pnpm db:migrate` 成功。
- [ ] `pnpm db:seed` 成功。
- [ ] schema 测试通过。
- [ ] 数据库中可以看到 sample project 和 sample mission。

---

# Phase 3 — 状态机与核心服务

## 目标

实现 Mission 状态机、事件日志、Artifact 管理、质量门禁。

## 任务

- [ ] 实现 `packages/core/src/stateMachine.ts`。
- [ ] 实现 `canTransition()`。
- [ ] 实现 `transitionMission()`。
- [ ] 实现 `eventLog.ts`。
- [ ] 实现 `qualityGates.ts`。
- [ ] 实现 `artifactStore.ts`。
- [ ] 实现 `commandRunner.ts`。
- [ ] 编写状态机测试。
- [ ] 编写质量门禁测试。

## 验收标准

- [ ] 合法状态流转测试通过。
- [ ] 非法状态流转会抛错。
- [ ] 每次状态变化写 MissionEvent。
- [ ] Artifact 可保存、读取、列出。
- [ ] commandRunner 能记录 stdout/stderr/exit code。

---

# Phase 4 — Orchestrator API

## 目标

提供 Web 和 Worker 使用的 HTTP API。

## 任务

- [ ] 搭建 Fastify server。
- [ ] 实现 health endpoint：
  - `GET /health`
- [ ] 实现 Project API。
- [ ] 实现 Mission API。
- [ ] 实现 Approval API。
- [ ] 实现 WorkerRun API。
- [ ] 实现 Mission Event API。
- [ ] 接入 Prisma。
- [ ] 接入基础 API token auth。
- [ ] 编写 API integration tests。

## 验收标准

- [ ] `GET /health` 返回 ok。
- [ ] 可以创建 project。
- [ ] 可以创建 mission。
- [ ] 可以查询 mission timeline。
- [ ] API 测试通过。
- [ ] 没有 auth token 时拒绝写操作。

---

# Phase 5 — Project Registry 与 ai-novelist 接入

## 目标

让系统能识别和管理第一个真实项目：`ai-novelist`。

## 任务

- [ ] 创建 `projects/ai-novelist/project.passport.yaml`。
- [ ] 创建 `projects/ai-novelist/AGENTS.md`。
- [ ] 创建 `projects/ai-novelist/qa-charter.md`。
- [ ] 实现 Project Passport parser。
- [ ] 实现 Project Registry：
  - scan local `projects/*/project.passport.yaml`
  - validate schema
  - sync to DB
- [ ] 实现 `psf project sync` CLI。
- [ ] 为 ai-novelist 生成初始 Mission：
  - “标准化启动、构建、测试命令”
  - “增加章节审稿与修复闭环”
  - “增加 AI QA 核心流程测试”

## 验收标准

- [ ] `psf project sync` 能导入 ai-novelist。
- [ ] invalid passport 会报清晰错误。
- [ ] Hub/API 能看到 ai-novelist。
- [ ] ai-novelist 有 AGENTS 和 QA charter。

---

# Phase 6 — Mission Planner

## 目标

把用户自然语言需求转为结构化 Mission。

## 任务

- [ ] 创建 prompt：`packages/prompts/pm-plan.md`。
- [ ] 实现 `psf mission create <project> "<request>"`。
- [ ] MVP 可先生成模板 Mission。
- [ ] 增强：调用 Codex CLI 生成 mission.md 与 acceptance.md。
- [ ] Mission 创建后写入 DB。
- [ ] Mission 文档写入 artifact。
- [ ] 生成风险等级：
  - low
  - medium
  - high
- [ ] 高风险 Mission 自动进入 `approval_required`。

## Prompt 模板

```markdown
You are the AI PM for Personal Software Factory.

Convert the user's raw request into:
1. mission.md
2. acceptance.md
3. risk assessment
4. testing checklist

Rules:
- Be specific.
- Include user-facing acceptance criteria.
- Include abnormal flows.
- Include required checks.
- Identify high-risk operations.
- Do not include secrets.
```

## 验收标准

- [ ] 输入一句自然语言能生成 Mission。
- [ ] Mission 包含背景、目标、范围、验收标准、测试清单。
- [ ] 高风险任务不会直接进入开发。
- [ ] Mission 状态从 received → planning → planned。

---

# Phase 7 — Codex Worker MVP

## 目标

实现自动开发 Worker，能在独立 workspace 中调用 Codex。

## 任务

- [ ] 实现 git clone / pull。
- [ ] 实现 git worktree 创建。
- [ ] 实现 branch 命名：
  - `agent/<mission-slug>-<mission-id>`
- [ ] 实现 mission 文件注入。
- [ ] 实现 `runCodex.ts`。
- [ ] 实现 WorkerRun 记录。
- [ ] 实现 stdout/stderr artifact 保存。
- [ ] 实现测试命令执行。
- [ ] 实现 dev-summary.md 生成。
- [ ] 实现 commit。
- [ ] 不自动 push，除非配置允许。
- [ ] 编写 mock Codex 测试。

## 验收标准

- [ ] Worker 能在 fake repo 中创建 branch。
- [ ] Worker 能调用 mock codex。
- [ ] Worker 能记录日志。
- [ ] Worker 成功后 Mission 进入 test/build 阶段。
- [ ] Worker 失败时 Mission 进入 failed 或 blocked。
- [ ] 不会改 main。

---

# Phase 8 — QA Worker MVP：Deterministic Playwright

## 目标

先实现稳定、可重复的 Playwright 测试闭环。

## 任务

- [ ] 初始化 Playwright。
- [ ] 创建 QA Worker。
- [ ] 支持传入 target_url。
- [ ] 支持运行 `npx playwright test`。
- [ ] 收集 HTML report。
- [ ] 收集 screenshots。
- [ ] 收集 trace。
- [ ] 解析测试失败。
- [ ] 生成 qa-report.md。
- [ ] 生成 bugs.json。
- [ ] 将 artifacts 写入 DB。

## 验收标准

- [ ] QA Worker 能测试一个示例 Web 页面。
- [ ] 测试失败时生成 qa-report.md。
- [ ] 测试失败时生成 bugs.json。
- [ ] 测试 artifacts 可在 Hub 查看。
- [ ] Mission 根据 QA 结果进入 ready_for_review 或 bugs_found。

---

# Phase 9 — AI Exploratory QA：Playwright MCP

## 目标

让 AI QA 具备类似人工测试员的探索能力。

## 任务

- [ ] 添加文档：如何给 Codex 配置 Playwright MCP。
- [ ] 创建 `qa-explore.md` prompt。
- [ ] 实现 QA Explorer runner。
- [ ] 读取 qa-charter。
- [ ] 读取 acceptance.md。
- [ ] 使用目标 URL 执行探索测试。
- [ ] 要求 AI 输出：
  - qa-report.md
  - bugs.json
  - generated regression spec
- [ ] 对 AI 输出做 schema 校验。
- [ ] 对生成的 Playwright spec 做 dry run。
- [ ] 不通过则要求修复生成测试。

## 验收标准

- [ ] QA Explorer 能打开页面并完成基础操作。
- [ ] QA Explorer 能识别至少一种异常行为。
- [ ] 输出 bugs.json 通过 schema。
- [ ] 生成的 regression test 可运行。
- [ ] 所有 P1 bug 都有复现步骤。

---

# Phase 10 — 自动修复闭环

## 目标

实现 QA → Bug → Codex Fix → Regression → QA 的自动闭环。

## 流程

```text
QA failed
  → bugs_found
  → enqueue fix worker
  → Codex reads bugs.json and qa-report.md
  → add regression tests
  → fix code
  → run tests
  → regression_running
  → qa_running
  → pass or repeat
```

## 任务

- [ ] 实现 fix queue。
- [ ] 实现 max attempt 策略。
- [ ] Codex Fix Worker 读取 bugs.json。
- [ ] 修复前确保 regression test 存在。
- [ ] 修复后运行 regression。
- [ ] 修复成功更新 Bug status。
- [ ] 超过尝试次数进入 `paused`。
- [ ] Hub 显示修复轮次。

## 验收标准

- [ ] 人为制造一个 Playwright 失败。
- [ ] QA Worker 生成 bug。
- [ ] Fix Worker 尝试修复。
- [ ] 回归测试重新运行。
- [ ] 超过次数后不无限循环。

---

# Phase 11 — Hub Web MVP

## 目标

提供可视化管理平台。

## 任务

- [ ] 创建 Next.js app。
- [ ] 实现 dashboard。
- [ ] 实现 projects list。
- [ ] 实现 project detail。
- [ ] 实现 missions list。
- [ ] 实现 mission detail。
- [ ] 实现 event timeline。
- [ ] 实现 bug list。
- [ ] 实现 artifact links。
- [ ] 实现 approval list。
- [ ] 实现基础 auth。

## 验收标准

- [ ] 用户能看到 ai-novelist。
- [ ] 用户能创建 Mission。
- [ ] 用户能启动 Mission。
- [ ] 用户能看到 Codex Worker 运行日志。
- [ ] 用户能看到 QA 报告。
- [ ] 用户能看到 Bug 和修复轮次。
- [ ] 用户能批准或拒绝高风险操作。

---

# Phase 12 — GitHub / PR 集成

## 目标

把本地开发闭环连接到 GitHub PR。

## 任务

- [ ] 配置 GitHub token / gh CLI。
- [ ] Codex Worker 支持 push branch。
- [ ] Codex Worker 支持创建 PR。
- [ ] PR body 使用标准模板。
- [ ] QA 报告作为 PR comment。
- [ ] Mission 保存 PR URL。
- [ ] GitHub webhook 同步 PR 状态。
- [ ] merge 后更新 Mission 状态。

## 验收标准

- [ ] Mission 完成后能创建 PR。
- [ ] PR 中包含 dev-summary 和 QA report。
- [ ] Hub 能显示 PR URL。
- [ ] PR 状态变化能同步回 Mission。

---

# Phase 13 — Coolify Staging / Preview 部署

## 目标

让每个 Mission 分支拥有可测试的 staging 或 preview URL。

## 任务

- [ ] 文档化 Coolify 配置方式。
- [ ] 保存 Coolify project/app identifiers。
- [ ] Deploy Worker 支持触发部署。
- [ ] Deploy Worker 轮询部署状态。
- [ ] 部署成功后保存 target_url。
- [ ] QA Worker 自动测试 target_url。
- [ ] 部署失败时记录日志。
- [ ] 生产部署必须 approval。

## 验收标准

- [ ] branch/PR 可以部署到 staging。
- [ ] Hub 显示 staging URL。
- [ ] QA Worker 使用 staging URL 测试。
- [ ] production deploy 需要人工批准。

---

# Phase 14 — Uptime Kuma 监控集成

## 目标

显示项目运行状态。

## 任务

- [ ] 添加 monitor 配置。
- [ ] 支持手动保存 Uptime Kuma monitor URL。
- [ ] 增强：拉取 monitor 状态。
- [ ] Hub 显示 up/down。
- [ ] 异常时写 ProjectEvent。
- [ ] 异常时可触发 repair/diagnosis Mission。

## 验收标准

- [ ] Hub 能显示 production/staging 运行状态。
- [ ] down 状态可见。
- [ ] 监控异常可生成事件。
- [ ] 不因 Uptime Kuma 不可用导致主系统崩溃。

---

# Phase 15 — Plane 集成

## 目标

将需求、Bug、进度同步到开源项目管理工具 Plane。

## 任务

- [ ] 文档化 Plane 使用方式。
- [ ] Mission 可绑定 Plane issue URL。
- [ ] Bug 可绑定 Plane issue URL。
- [ ] 增强：通过 API 创建/更新 Issue。
- [ ] 状态同步映射。
- [ ] Hub 显示 Plane 链接。

## 验收标准

- [ ] Mission 能关联 Plane Issue。
- [ ] bugs_found 时能创建或提示创建 Plane Bug。
- [ ] 状态变化能反映在 Plane 或至少在 Hub 中可跳转。

---

# Phase 16 — ai-novelist 专项闭环

## 目标

把第一个真实项目 `ai-novelist` 跑通，验证系统价值。

## Mission A：标准化启动、构建、测试

### 目标

让 Codex 和 QA 可以稳定启动并测试 ai-novelist。

### 验收标准

- [ ] 后端启动命令明确。
- [ ] 前端启动命令明确。
- [ ] 构建命令明确。
- [ ] 测试命令明确。
- [ ] Playwright E2E 能运行。
- [ ] AGENTS.md 更新。
- [ ] project.passport.yaml 更新。

## Mission B：核心交互状态机修复

### 目标

修复 Web 交互异常，包括 loading、重复点击、失败恢复。

### 验收标准

- [ ] 生成按钮有 pending 状态。
- [ ] 重复点击不会发送重复请求。
- [ ] 生成失败显示明确错误。
- [ ] 页面刷新不导致白屏。
- [ ] 后端 500 不被静默吞掉。
- [ ] 有 Playwright 测试覆盖。

## Mission C：章节审稿与修复闭环

### 目标

章节生成后必须自动进入审稿流程，审稿报告可驱动修复。

### 验收标准

- [ ] 章节生成完成后进入“审稿中”。
- [ ] 审稿完成后显示结构化报告。
- [ ] 审稿报告包含：
  - 剧情一致性
  - 人物一致性
  - 节奏
  - 语言风格
  - 需要修复的问题
- [ ] 用户可以点击“修复章节”。
- [ ] 修复后保留原始版本。
- [ ] 修复失败有错误提示。
- [ ] 审稿流程有 E2E 测试。

## Mission D：AI QA 完整小说流程

### 目标

让 QA Worker 自动验证完整小说创作流程。

### 验收标准

- [ ] 新建小说。
- [ ] 生成世界观。
- [ ] 生成大纲。
- [ ] 生成章节。
- [ ] 等待审稿。
- [ ] 修复章节。
- [ ] 导出结果。
- [ ] 测试中记录 screenshot/trace。
- [ ] 发现问题生成 bugs.json。
- [ ] 修复后回归通过。

---

# Phase 17 — 稳定性与运维

## 目标

让系统可以长期运行，而不是一次性 demo。

## 任务

- [ ] structured logging。
- [ ] worker heartbeat。
- [ ] worker timeout。
- [ ] stale mission detection。
- [ ] retry with backoff。
- [ ] artifact cleanup policy。
- [ ] database backup docs。
- [ ] `.env.example` 完整化。
- [ ] production docker compose。
- [ ] admin token rotation docs。
- [ ] crash recovery docs。

## 验收标准

- [ ] Worker 崩溃不会导致 Mission 永远卡住。
- [ ] 重启 API 后 Mission 状态仍可恢复。
- [ ] Artifact 不会无限增长。
- [ ] 日志可追踪一次 Mission 的完整生命周期。

---

# Phase 18 — 后续增强：Temporal / LangGraph

## 目标

当 MVP 跑通后，将简单队列升级为更强的 durable workflow / agent graph。

## Temporal 引入条件

满足任意条件可考虑：

```text
Mission 经常跨越很长周期
Worker 重启恢复复杂
需要强一致的重试、补偿、超时
需要同时管理多个项目、多条任务线
```

Temporal 负责：

```text
MissionWorkflow
CodexActivity
BuildActivity
DeployActivity
QaActivity
FixActivity
ApprovalActivity
ReleaseActivity
```

## LangGraph 引入条件

满足任意条件可考虑：

```text
需求拆解越来越复杂
QA 判断需要多轮推理
修复策略需要动态分支
需要 human-in-the-loop 的状态化 AI 决策
```

LangGraph 负责：

```text
AI PM graph
AI QA graph
AI Repair decision graph
Risk review graph
```

---

## 16. CLI 设计

创建 `psf` CLI，方便无 Hub 时也能运行。

命令：

```bash
psf init
psf project sync
psf project list
psf mission create ai-novelist "增加章节审稿和自动修复流程"
psf mission plan <mission-id>
psf mission start <mission-id>
psf mission status <mission-id>
psf mission events <mission-id>
psf qa run <mission-id>
psf worker codex <mission-id>
psf worker qa <mission-id>
```

MVP 可通过 `tsx` 运行：

```bash
pnpm psf mission create ai-novelist "..."
```

---

## 17. 测试策略

### 17.1 单元测试

必须覆盖：

```text
schemas
state machine
quality gates
artifact store
command runner
passport parser
bug parser
```

### 17.2 集成测试

必须覆盖：

```text
API create project
API create mission
mission state transition
worker run record
artifact save/load
```

### 17.3 Worker 测试

用 fake repo 测试：

```text
clone/worktree
branch creation
mock codex
mock test failure
mock QA report
max attempts
```

### 17.4 E2E 测试

Hub E2E：

```text
open dashboard
create mission
view mission detail
approve approval
view qa report
```

目标项目 E2E：

```text
ai-novelist smoke
ai-novelist chapter review flow
ai-novelist abnormal flows
```

### 17.5 AI QA 输出测试

对 AI 生成文件做严格校验：

```text
bugs.json must match schema
qa-report.md must exist
generated spec must compile
generated spec must not contain secrets
```

---

## 18. 质量门禁

Mission 进入 `ready_for_review` 前必须满足：

```text
- Build passed
- Unit tests passed
- Required e2e passed
- AI QA completed
- No open P0/P1 bugs
- All generated artifacts saved
- dev-summary.md exists
- qa-report.md exists
```

生产发布前必须满足：

```text
- Human approval
- PR merged
- Production deploy successful
- Uptime monitor healthy
- Rollback path documented
```

---

## 19. Artifact 规范

Artifacts 存储路径：

```text
artifacts/
  missions/
    <mission-id>/
      mission.md
      acceptance.md
      dev-summary.md
      qa-report.md
      bugs.json
      worker-runs/
        <worker-run-id>/
          stdout.log
          stderr.log
      screenshots/
      traces/
      playwright-report/
      regression-tests/
```

Artifact 命名规则：

```text
不使用空格
包含 mission id
包含 run id
日志保留原始顺序
敏感信息写入前脱敏
```

---

## 20. 运行方式

### 20.1 开发环境

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### 20.2 启动 API

```bash
pnpm --filter @psf/api dev
```

### 20.3 启动 Hub

```bash
pnpm --filter @psf/hub dev
```

### 20.4 启动 Worker

```bash
pnpm --filter @psf/codex-worker dev
pnpm --filter @psf/qa-worker dev
pnpm --filter @psf/deploy-worker dev
pnpm --filter @psf/monitor-worker dev
```

---

## 21. 第一批默认 Mission

系统完成基础能力后，创建以下 Mission：

### Mission 001

```text
标题：接入 ai-novelist 并标准化启动、测试、构建命令
目标：让 ai-novelist 可被 Codex Worker 和 QA Worker 稳定操作
```

### Mission 002

```text
标题：为 ai-novelist 增加核心 Smoke E2E
目标：验证首页、新建小说、生成流程入口不会白屏
```

### Mission 003

```text
标题：修复 ai-novelist 生成流程的重复点击和 loading 状态
目标：核心交互稳定，错误可见
```

### Mission 004

```text
标题：增加章节审稿与章节修复闭环
目标：生成章节后自动审稿，用户可按审稿报告修复章节
```

### Mission 005

```text
标题：实现 AI QA 完整小说创作探索测试
目标：让 QA Worker 自动模拟真实用户测试完整小说流程
```

---

## 22. 失败处理策略

### 22.1 Codex Worker 失败

```text
- 记录 stdout/stderr
- 保存 git diff
- MissionEvent 写 CODEX_FAILED
- 如果 attempt < max_attempts，允许 retry
- 否则 paused
```

### 22.2 测试失败

```text
- 保存测试日志
- 生成 bug
- 进入 bugs_found
- 自动进入 fixing，除非 P0 风险需要人工确认
```

### 22.3 QA 输出不合法

```text
- 要求 QA Worker 修复格式
- 如果再次失败，保存 raw output
- Mission 进入 paused
```

### 22.4 部署失败

```text
- 保存部署日志
- 不进入 QA
- Mission 进入 failed 或 blocked
```

---

## 23. 后续多项目扩展

当 ai-novelist 跑通后，新增项目只需要：

```text
projects/<project-id>/project.passport.yaml
projects/<project-id>/AGENTS.md
projects/<project-id>/qa-charter.md
```

系统复用：

```text
Mission Planner
Codex Worker
QA Worker
Deploy Worker
Monitor Worker
Hub
```

未来项目示例：

```text
直播自动录屏并推送 Bilibili 助手
个人知识库助手
自动数据分析助手
自动报表助手
个人财务分析助手
```

---

## 24. 最终验收标准

整个系统的最终 MVP 完成标准：

```text
1. 用户可以在 Hub 创建 ai-novelist 的自然语言 Mission。
2. 系统生成 mission.md 和 acceptance.md。
3. Codex Worker 创建独立 branch/worktree。
4. Codex Worker 自动实现或修复。
5. 系统运行 build/test。
6. 系统部署或启动 staging。
7. QA Worker 用 Playwright 测试 staging。
8. AI QA 能生成 qa-report.md 和 bugs.json。
9. Bug 能交给 Codex Fix Worker 自动修复。
10. 回归测试能重新运行。
11. Mission 通过后进入 ready_for_review。
12. Hub 能显示完整事件流、日志、QA 报告、Bug、Artifact。
13. 生产部署必须人工审批。
14. Uptime Kuma 或等价监控能显示生产状态。
```

---

## 25. 推荐给 Codex 的第一条执行 Prompt

将本文件保存为 `plan.md` 后，可在仓库根目录对 Codex 输入：

```text
Use Superpowers brainstorming first.

Read ./plan.md completely. This is a greenfield project unless the repository already contains code.

Your task is to build the Personal Software Factory described in plan.md.

Do not start implementation immediately.
First:
1. Explore the repository.
2. Produce docs/superpowers/specs/YYYY-MM-DD-personal-software-factory-design.md.
3. Produce docs/superpowers/plans/YYYY-MM-DD-personal-software-factory-implementation.md.
4. Create ADRs for the architecture defaults, worker sandbox policy, and QA loop policy.
5. Present the design summary for approval.

After approval, implement Phase 1 only.
Do not skip tests.
Do not implement later phases until Phase 1 passes its acceptance criteria.
```

---

## 26. 执行纪律

Codex 执行时必须持续维护：

```text
docs/progress/current.md
docs/progress/phase-XX-summary.md
docs/adr/
```

每次阶段完成必须记录：

```text
- 完成了什么
- 改了哪些文件
- 运行了哪些测试
- 哪些测试失败
- 剩余风险
- 下一阶段入口条件
```

---

## 27. 重要提醒

本系统的核心价值不是“让 AI 写代码”，而是：

```text
需求结构化
开发自动化
测试自动化
缺陷结构化
修复自动化
部署可控
状态可见
风险可审批
经验可沉淀
```

只要这个闭环跑通，个人开发者就可以逐步把不同项目接入同一个 AI 软件工厂，而不是每个项目都重新人工测试、人工报错、人工让 Codex 修。
