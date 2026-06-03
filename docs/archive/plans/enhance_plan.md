# plan.md — Personal Software Factory 后续改进计划

> 基于 `hxfei-git/personal-software-factory` 当前 `main` 分支状态整理。  
> 日期：2026-06-01  
> 目标：把当前“安全可演示的本地 dry-run / gated-real MVP”推进为“以 `ai-novelist` 为首个项目的真实本地闭环软件工厂”，再逐步接入 GitHub PR、预览部署、监控与项目管理集成。

---

## 0. 当前结论

当前仓库已经不是早期骨架。它已经具备一个比较完整的“控制平面雏形”：

```text
Hub Web
  -> Orchestrator API
    -> Prisma/PostgreSQL durable state
    -> Mission state machine
    -> Artifact / Bug / QARun / WorkerRun / Approval records
    -> Worker Runtime abstraction
      -> In-process runtime or BullMQ/Redis queue
        -> Worker Runner
          -> Codex dry-run / gated real Codex runner
          -> QA dry-run / gated deterministic Playwright runner
          -> AI exploratory QA abstraction
          -> Auto-fix dry-run / gated real fix contract
          -> GitHub/Coolify/Uptime Kuma/Plane dry-run and gated real adapter contracts
```

但当前仍然应被视为：

```text
local-first demo + safety hardening MVP
```

而不是：

```text
fully autonomous software factory
```

当前最核心的问题不是“缺少更多外部工具”，而是“第一个真实闭环还没有跑通”。下一阶段不要优先扩 Coolify、Uptime Kuma、Plane、Temporal、LangGraph，也不要先做复杂多项目 SaaS；应集中力量完成：

```text
ai-novelist Mission
  -> 真实本地工作区 / 分支 / worktree
  -> Codex gated real local execution
  -> deterministic Playwright QA against real local/staging URL
  -> bugs.json
  -> fix loop
  -> regression
  -> ready_for_review
  -> approval-gated GitHub PR
```

---

## 1. 当前架构讲解

### 1.1 系统定位

Personal Software Factory 的核心定位是个人开发者的 AI 软件工厂控制平面。它不是聊天产品，也不是普通项目管理工具，而是把自然语言需求转成可追踪的 Mission，再把 Mission 交给 Worker 执行，并用 QA、Bug、Artifact、Approval、Event 把整个开发闭环变得可审计。

理想闭环是：

```text
User request
  -> Mission
  -> Plan
  -> Codex implementation
  -> Build/Test
  -> Playwright QA
  -> Bug extraction
  -> Codex fix
  -> Regression
  -> Review
  -> GitHub PR
  -> Release approval
```

当前仓库已经把这个闭环的多数“数据结构、API、dry-run 轨道、安全闸门、队列边界、Hub 可视化”搭起来了，但真实执行默认仍被关闭。

### 1.2 Monorepo 分层

当前目录大致按以下方式分层：

```text
apps/
  hub/                 # React/Vite Web 控制台
  orchestrator-api/    # Fastify API，系统状态与动作入口
  worker-runner/       # BullMQ Worker Runner，消费队列任务

workers/
  codex-worker/        # Codex dry-run / mock / gated real runner
  qa-worker/           # QA dry-run / deterministic Playwright / AI exploratory abstraction

packages/
  mission-schema/      # Zod schema 与 TS types
  mission-core/        # Mission 状态机
  db/                  # Prisma schema/client/seed/migration
  project-passport/    # project.passport.yaml 解析与校验
  project-registry/    # projects/* 注册扫描
  mission-planner/     # deterministic Mission planner
  artifact-store/      # local artifact path/store/retention
  worker-runtime/      # in-process + BullMQ runtime abstraction
  integrations/        # GitHub/Coolify/Uptime Kuma/Plane adapters
  demo-workflow/       # ai-novelist demo chain、doctor、reset、report
  auto-fix-loop/       # dry-run and gated real fix loop contracts
  security/            # redaction, command/path policy, approval policy

projects/
  ai-novelist/         # 第一个被管理项目的 Passport/AGENTS/QA charter

scripts/
  psf.ts               # 本地 CLI：demo、doctor、dry-run、queue status 等
```

### 1.3 Orchestrator API

Orchestrator 是当前架构的中心。它负责：

1. 保存 Project、Mission、WorkerRun、QARun、Bug、Artifact、Approval、MissionEvent。
2. 校验 API 请求。
3. 调用 Mission state machine，拒绝非法状态跳转。
4. 暴露 Hub 所需的 Dashboard、Mission Summary、Integration Status。
5. 在 inline 模式下直接执行 dry-run demo workflow。
6. 在 queued 模式下创建 queue wrapper WorkerRun，并把任务送入 Worker Runtime。
7. 对 real-mode action 做 route gate、approval gate、queue mode gate、env gate 检查。

Orchestrator 的重点设计是：

```text
Hub 不直接改数据库
Hub 不直接跑 shell
Hub 不直接调外部 provider
所有动作必须经 Orchestrator API
```

当前 API 已有的主要能力包括：

```text
GET  /health
GET  /dashboard
GET  /queues/status
GET  /jobs/:jobId
GET  /integrations
POST /integrations/:name/dry-run
GET  /projects
POST /projects/sync
GET  /projects/:projectId/passport
POST /missions
GET  /missions
GET  /missions/:id
GET  /missions/:id/summary
POST /missions/:id/plan
POST /missions/:id/actions/plan
POST /missions/:id/actions/codex-dry-run
POST /missions/:id/actions/qa-dry-run
POST /missions/:id/actions/fix-dry-run
POST /missions/:id/actions/loop-dry-run
POST /missions/:id/actions/codex-real
POST /missions/:id/actions/qa-playwright
POST /missions/:id/actions/qa-ai-exploratory
POST /missions/:id/actions/fix-real
POST /missions/:id/actions/github-pr
POST /missions/:id/actions/deploy-staging
POST /missions/:id/actions/monitor-sync
POST /missions/:id/actions/plane-sync
POST /missions/:id/transition
GET  /missions/:id/events
POST /missions/:id/events
POST /missions/:missionId/approvals
GET  /missions/:missionId/approvals
POST /approvals/:approvalId/decision
GET  /worker-runs
POST /worker-runs/:id/cancel
POST /worker-runs/:id/retry
GET/POST/PATCH artifacts, bugs, qa-runs, worker-runs
```

### 1.4 数据模型

Prisma 目前已经覆盖软件工厂的核心实体：

```text
Project
  -> Mission[]
  -> Deployment[]
  -> Monitor[]

Mission
  -> MissionEvent[]
  -> WorkerRun[]
  -> QARun[]
  -> Bug[]
  -> Artifact[]
  -> Approval[]
  -> Deployment[]

WorkerRun
  -> Artifact[]

QARun
  -> Bug[]
```

这些表支撑了“控制平面”的可审计性。后续真正执行 Codex、QA、Fix、PR 时，不应该绕过这些记录直接跑脚本。

当前需要注意的是，部分关系还比较弱。例如 queue wrapper WorkerRun 和 child WorkerRun/QARun/Artifact/Bug 的关系主要记录在 `output` 或 `metadata` 中，数据库层还没有 `parentWorkerRunId` / `rootWorkerRunId` 这样的显式字段。

### 1.5 Mission 状态机

当前状态机已经覆盖较完整的生命周期：

```text
received
planning
planned
approval_required
dev_queued
dev_running
build_running
test_running
staging_deploying
staging_ready
qa_running
bugs_found
fixing
regression_running
ready_for_review
release_approval
production_deploying
released
paused
blocked
needs_human
failed
cancelled
```

状态机目前的优势：

1. 明确区分 received/planning/planned/dev/qa/fix/release 状态。
2. final 状态不能继续跳转。
3. paused/cancelled 有通用跳转逻辑。
4. failed 只允许从 running 类状态进入。
5. 每次合法 transition 都会生成 MissionEvent。

当前不足是：状态机本身存在，但 worker 真实执行链路还没有充分自动驱动这些状态。例如 dry-run action 更像“生成演示资源”，不是完整地从 `planned -> dev_queued -> dev_running -> ... -> ready_for_review` 自动推进。

### 1.6 Worker Runtime 与队列

当前 Worker Runtime 有两种实现：

```text
PSF_WORKER_RUNTIME=in-process
  -> 测试/轻量本地 helper 使用

PSF_WORKER_RUNTIME=bullmq
  -> Redis + BullMQ queue
  -> apps/worker-runner 消费任务
```

队列层的价值是：

1. API 不需要长时间阻塞。
2. 每个排队动作先创建 wrapper WorkerRun。
3. 可以查询 job 状态。
4. 可以 cancel/retry wrapper WorkerRun。
5. 后续真实 Codex/QA/Fix/PR 都可以统一走队列边界。

当前队列已支持 dry-run job types：

```text
mission.plan
codex.dry_run
qa.dry_run
qa.dry_run_with_sample_bug
fix.dry_run
loop.dry_run
demo.ai_novelist
integration.dry_run
```

也已经有 gated real job contracts：

```text
codex.real
qa.playwright
qa.ai_exploratory
fix.real
github.pr
deploy.coolify
monitor.uptime_kuma
plane.sync
```

但 real job contracts 默认仍然是安全阻断或 manual-action 输出，不代表系统已经会自动调用外部服务。

### 1.7 Codex Worker

当前 Codex Worker 已有三类路径：

```text
DryRunCodexRunner
  -> 不执行真实进程，只生成 review artifacts

MockCodexRunner
  -> 测试用，不 spawn Codex

RealCodexRunner
  -> 真实 runner abstraction，但默认 blocked/manual-action
```

真实 Codex 执行必须满足多个 gate：

```text
mode=real
ENABLE_REAL_CODEX=1
approval policy passed
CODEX_EXECUTABLE is absolute path
CODEX_SANDBOX is workspace-write or read-only
CODEX_APPROVAL_MODE=on-request
workspace root is guarded
commands pass conservative policy
runtime timeout within limit
child env is allowlisted and non-secret
```

即使真实 Codex runner 跑起来，当前设计也明确：

```text
Push: disabled
External provider calls: disabled
```

这非常重要，因为下一阶段应先证明“本地安全开发闭环”，而不是一上来就让 AI push 或部署。

### 1.8 QA Worker

当前 QA Worker 包括三条路径：

```text
QA dry-run
  -> 生成 qa-report / bugs.json demo artifacts

Deterministic Playwright QA
  -> 需要 targetUrl + ENABLE_REAL_PLAYWRIGHT=1 或 injected runner
  -> 当前真实逻辑很基础：打开页面、检查 body 可见性、生成 QA/Bug artifacts

AI Exploratory QA
  -> 已有 abstraction、output validation、generated regression spec validation
  -> 真实 Playwright MCP 路径尚未批准，默认 manual-action
```

这说明 QA 的“合同层”已经有了，但真正像人类测试员一样操作网页、点击、输入、误操作、发现复杂交互问题，还没有实现。

### 1.9 Integration 层

当前已有 GitHub、Coolify、Uptime Kuma、Plane 的 dry-run adapter 和 gated real adapter。

关键设计是：

```text
ENABLE_REAL_* 只表示 real eligible
PSF_ENABLE_REAL_* 只表示 Orchestrator route eligible
真实网络调用还需要 injected transport + operation gate + approval/config
默认 realNetworkCall=false
```

这是一种正确的安全边界。当前 integration 层已经足够作为“后续真实集成的接口契约”，但还不是可直接投入使用的真实外部系统集成。

### 1.10 Hub Web

当前 Hub 是 React/Vite，不是最初计划中的 Next.js。这个差异不是方向性问题，因为 Hub 的核心职责仍然是控制台。

当前 Hub 已有：

1. Dashboard metrics。
2. Queue status panel。
3. Recent Missions/Bugs/WorkerRuns/Artifacts。
4. Mission Detail。
5. Mission dry-run action buttons。
6. Real-mode readiness/policy blockers 显示。
7. Integrations page 和 dry-run cards。

但当前 Hub 仍偏 demo console：

1. Projects、Missions、Bugs、Worker Runs、Artifacts、Approvals 等 nav 多数还是 placeholder。
2. Mission Detail 默认固定 `mission-0001-ai-novelist-chapter-review`。
3. 用户还不能通过 Hub 顺畅创建 Mission、选择项目、查看完整列表、审批真实动作。
4. real action buttons 目前更多是 readiness visibility，不是完整交互链路。

---

## 2. 当前不足与未实现清单

### 2.1 产品层不足

1. **还不是最终闭环产品。**  
   当前主要证明本地 demo、dry-run、queue、safety gate、Hub visibility，而不是“用户提需求后系统自动完成开发测试修复 PR”。

2. **用户入口还不完整。**  
   Hub 还不能作为完整工作台使用。项目列表、Mission 列表、Bug 列表、WorkerRun 列表、Artifact 列表、Approval 页面仍需要真实 API-backed 页面。

3. **Mission 创建与执行体验不足。**  
   目前 demo action 仍围绕固定 ai-novelist demo mission。需要让任意通过 Project Passport 注册的项目都可以创建 Mission、计划、排队、执行、QA、修复。

4. **AI 管家/项目经理层还没有形成。**  
   现在 Mission Planner 是 deterministic template，不是能理解上下文、分解需求、判断风险、主动安排 QA/fix 的 AI 管家。

### 2.2 架构层不足

1. **状态机没有充分驱动真实执行闭环。**  
   需要让 WorkerRunner 的结果真正推动 Mission transition，而不是只记录 child resources。

2. **queue wrapper 与 child resources 关系弱。**  
   目前 wrapper-child 主要在 `output`/`metadata` 中记录，后续应考虑增加显式 parent/root relationship。

3. **active job cancellation 只是 cooperative。**  
   对长时间 Codex/Playwright 任务，需要更明确的 heartbeat、timeout、stale detection、graceful cancel、failed recovery。

4. **API schema 与 shared schema 有不一致。**  
   `@psf/mission-schema` 的 WorkerType 包含 `auto_fix`，但 Orchestrator service 层局部 WorkerTypeSchema 当前没有包含 `auto_fix`。这类重复 schema 应收敛，避免隐藏 bug。

5. **文档存在状态漂移。**  
   部分 safety 文档仍描述 Worker Runner 只消费 dry-run/mock jobs，而 queue-runtime/progress/README 已经描述 gated real job contracts 和 real handlers。需要统一文档口径。

### 2.3 Codex 执行不足

1. **真实 Codex 默认禁用，这是正确的，但下一阶段需要受控打通。**
2. **branch/worktree isolation 需要用 disposable fixture repo 证明。**
3. **命令 allowlist 需要更贴近项目。**  
   `ai-novelist` 应从 Project Passport 读取 install/build/test/e2e 命令，并经过 policy 过滤后执行。
4. **当前不应 push。**  
   下一阶段先本地分支 + 本地 diff + 本地 commit summary，再进入 GitHub PR gate。

### 2.4 QA 不足

1. **deterministic Playwright 当前太基础。**  
   只打开页面、检查 body 可见性，不足以覆盖 `ai-novelist` 的真实核心流程。

2. **截图/trace/report 需要真实落盘。**  
   当前 artifacts 有路径，但真实截图、trace、HTML report 的采集能力需要补齐。

3. **AI Exploratory QA 还没有真正接 Playwright MCP。**  
   当前主要是 abstraction + validation + manual-action，不能替代人工探索。

4. **Bug -> Regression 的强制闭环还不够。**  
   QA 发现 bug 后，应强制生成或更新 Playwright regression spec，且修复后必须跑 regression。

### 2.5 Auto-fix 不足

1. **fix loop 仍以 dry-run/demo 为主。**
2. **Bug 状态流转还不够严格。**  
   例如 open -> in_progress -> fixed -> accepted 应与证据和 regression result 绑定。
3. **maxAttempts 已有字段，但自动策略还需落地。**
4. **exhausted attempts 后应进入 `needs_human` 或 `paused`，并在 Hub 显示清楚。**

### 2.6 GitHub/部署/监控/Plane 不足

1. **GitHub real adapter 需要 injected transport。**  
   默认不会 push、create PR、comment。
2. **缺少 idempotency/retry/backoff。**
3. **缺少 rollback/manual recovery 指南。**
4. **Coolify/Uptime Kuma/Plane 当前不应优先真实接入。**  
   它们应在第一个 ai-novelist 本地闭环和 GitHub PR 闭环完成后再做。

### 2.7 运维与安全不足

1. **secret redaction 已有基础，但需要更多回归测试。**
2. **真实执行前需要 token rotation、backup/restore、artifact retention、workspace cleanup 策略。**
3. **缺少 structured log / trace correlation 的完整视图。**
4. **doctor 应扩展为 real readiness checklist，而不是只给 warning。**

---

## 3. 下一阶段总体策略

### 3.1 不要立刻做的事情

下一阶段不要优先做：

```text
多用户 SaaS
复杂权限系统
Temporal/LangGraph 重构
Coolify 真实生产部署
Uptime Kuma 自动修复触发
Plane 双向同步
n8n 通知流
完整 Jira/PaaS/监控平台
```

原因：当前最有价值、最短路径、风险最可控的目标是先证明第一个真实闭环。

### 3.2 应优先完成的目标

下一阶段目标定义为：

```text
M1: ai-novelist local real closed loop
```

验收标准：

```text
1. 用户在 Hub 创建 ai-novelist Mission。
2. Mission Planner 生成 mission.md / acceptance.md / risk notes。
3. Orchestrator 将 Mission 排入 queue。
4. Worker Runner 在受控 workspace / branch / worktree 中运行 Codex。
5. Codex 不 push、不部署、不泄露 secret，只生成本地 diff/artifacts。
6. 系统启动或使用 ai-novelist local/staging target URL。
7. Deterministic Playwright 覆盖至少 3 条核心流程。
8. QA 失败时生成 schema-valid bugs.json、截图、trace、qa-report。
9. Fix loop 读取 bugs.json，驱动 Codex 修复。
10. 修复后 regression 必须通过。
11. Mission 进入 ready_for_review。
12. Hub 可以完整查看 Mission timeline、WorkerRun、QA、Bug、Artifact、Approval。
13. 可选择 approval-gated GitHub PR，但默认不创建外部 PR。
```

---

## 4. 分阶段实施计划

## Phase A — Baseline Truth Cleanup / 统一真实状态

### 目标

先清理当前仓库的“状态漂移”，避免下一阶段在错误假设上继续堆代码。

### 任务

1. 阅读并更新：
   - `README.md`
   - `docs/safety.md`
   - `docs/queue-runtime.md`
   - `docs/progress.md`
   - `docs/final-mvp-scope.md`
   - `docs/next-steps.md`
   - `docs/00-system-architecture.md`

2. 统一说明：
   - Worker Runner 已经有 gated real job handlers。
   - 默认仍然不执行真实外部动作。
   - `realNetworkCall=false` 的含义必须一致。
   - `ENABLE_REAL_*` 与 `PSF_ENABLE_REAL_*` 的区别必须明确。

3. 修复 schema drift：
   - 删除 Orchestrator service 层重复 WorkerType enum，改为复用 `@psf/mission-schema`。
   - 或至少补齐 `auto_fix`。

4. 生成当前能力矩阵：

```markdown
| capability | current state | default behavior | required gates | next action |
|---|---|---|---|---|
| Codex dry-run | implemented | generates artifacts | none | keep |
| Codex real | abstraction present | blocked | ENABLE_REAL_CODEX + approvals + workspace + executable | prove on fixture |
| Playwright deterministic | basic runner present | blocked/manual unless configured | targetUrl + ENABLE_REAL_PLAYWRIGHT/injected runner | implement ai-novelist flows |
| AI exploratory QA | abstraction present | manual-action | future approved MCP executor | defer |
| GitHub PR | gated adapter present | no network | transport + gates + approval | after local loop |
```

### 验收标准

- 文档不再互相矛盾。
- shared schema 与 API schema 一致。
- `pnpm typecheck` 通过。
- `pnpm test` 通过。
- 新增或更新测试覆盖 schema drift。

### 建议命令

```bash
pnpm install --lockfile-only
pnpm typecheck
pnpm test
pnpm build
pnpm psf doctor
```

---

## Phase B — Hub 从 Demo Console 升级为真实控制台

### 目标

把 Hub 从“能看固定 demo mission”升级为“能管理项目、Mission、Bug、WorkerRun、Artifact、Approval 的真实控制面”。

### 任务

1. 路由改造：

```text
/dashboard
/projects
/projects/:projectId
/missions
/missions/new
/missions/:missionId
/bugs
/bugs/:bugId
/worker-runs
/worker-runs/:workerRunId
/artifacts
/artifacts/:artifactId
/approvals
/approvals/:approvalId
/integrations
```

2. API client 补齐：

```text
listProjects()
getProject()
syncProjects()
listMissions()
createMission()
getMissionSummary()
listWorkerRuns(filter)
getWorkerRun()
cancelWorkerRun()
retryWorkerRun()
listBugs()
getBug()
listArtifacts()
getArtifact()
listApprovals()
decideApproval()
```

3. 移除固定 Mission 依赖：

```text
defaultMissionId = mission-0001-ai-novelist-chapter-review
```

可以保留 demo quick link，但不能作为正常路径。

4. Mission 创建表单：
   - project select
   - title
   - raw_request
   - priority
   - risk_level
   - submit 后进入 Mission Detail

5. Approval 页面：
   - 展示 pending approvals
   - 展示 requiredApprovalTypes / missingApprovalTypes
   - approve/reject 按钮
   - 明确警告真实动作仍需 env gates + queued mode

6. WorkerRun 页面：
   - wrapper WorkerRun 与 child WorkerRun 区分展示
   - jobId/jobType/correlationId/heartbeatAt
   - cancel/retry 操作

### 验收标准

- 用户可以不碰 CLI，在 Hub 中：同步项目、创建 Mission、计划 Mission、触发 dry-run、查看 QA/Bug/Artifact、审批 pending approval。
- 所有 placeholder 页面替换为真实 API-backed list/detail。
- Hub 不泄露 token/password/secret。
- Hub E2E smoke test 覆盖 dashboard -> create mission -> mission detail。

### 建议命令

```bash
pnpm --filter @psf/hub typecheck
pnpm --filter @psf/hub test
pnpm test:e2e:smoke
pnpm build
```

---

## Phase C — Generic Mission Workflow / 摆脱固定 Demo Mission

### 目标

让 Orchestrator 能对任意 Project Passport 注册项目执行通用 Mission workflow，而不是只支持 ai-novelist demo mission。

### 任务

1. 将 action 支持范围从：

```text
assertDemoMissionActionSupported(id)
```

升级为：

```text
assertMissionActionSupported(mission, projectPassport, action)
```

2. 通用 action 前置校验：
   - Mission exists。
   - Project exists。
   - Project Passport exists。
   - action 对当前 Mission status 合法。
   - required commands are declared。
   - missing target URL 时 QA action 返回 blocked/manual-action。

3. 通用 workflow service：

```text
planMission
queueDev
recordDevStarted
recordDevCompleted
queueQa
recordQaCompleted
queueFix
recordFixCompleted
queueRegression
recordRegressionCompleted
markReadyForReview
```

4. WorkerRunner 完成后推动状态：
   - `codex.real` succeeded -> `build_running` or `test_running`
   - `qa.playwright` passed -> `ready_for_review`
   - `qa.playwright` failed with bugs -> `bugs_found`
   - `fix.real` -> `regression_running`
   - regression passed -> `qa_running` or `ready_for_review`
   - attempts exhausted -> `needs_human` or `paused`

5. 事件审计：
   - 每个自动 transition 必须有 MissionEvent。
   - WorkerRun status change 与 Mission status change 都要能在 Hub 时间线看到。

### 验收标准

- 任意注册项目都能 create/plan Mission。
- ai-novelist 不再是唯一可执行 action 的 Mission。
- demo mission 仍可用，但只是 sample data。
- 状态机与 WorkerRunner 结果连接。
- 非法状态下 action 返回明确错误。

### 建议命令

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/worker-runner test
pnpm typecheck
pnpm test
```

---

## Phase D — Real Codex Local Execution / 安全打通本地真实 Codex

### 目标

在 disposable fixture repo 和 ai-novelist 本地镜像中证明真实 Codex 可在受控 workspace/branch/worktree 中执行，不 push、不部署、不泄露 secret。

### 任务

1. workspace 准备：

```text
PSF_WORKSPACE_ROOT/workspaces
PSF_WORKSPACE_ROOT/mirrors
```

2. fixture repo 测试：
   - 创建 disposable git repo。
   - 准备简单 failing test。
   - Codex real runner 在非 main branch/worktree 执行。
   - 生成 diff-summary、stdout/stderr、dev-summary。
   - 验证 main 未修改。

3. branch/worktree policy：
   - 禁止 main/master。
   - branch 命名：`agent/<missionId>` 或 `psf/<missionId>`。
   - workspace realpath 必须在 workspace root 内。

4. command allowlist：
   - 允许从 Project Passport 读取：install/build/test/e2e/lint。
   - 禁止 git push、rm -rf、curl/wget、ssh、scp、生产 URL、secret path。
   - timeout 必须有上限。

5. Codex result contract：
   - `executed=true/false`
   - `workspacePath`
   - `branchName`
   - `exitCode`
   - `diffSummaryArtifact`
   - `devSummaryArtifact`
   - `realNetworkCall=false`
   - `pushed=false`

6. Hub readiness：
   - 显示缺少的 env/gate/approval。
   - 通过 approval 后才允许点击 real Codex。

### 验收标准

- fixture repo 测试通过。
- ai-novelist 本地镜像可完成一次受控 Codex run。
- 不 push。
- 不改 main。
- 不泄露 secret。
- 失败时 WorkerRun failed，并保留 stdout/stderr/artifacts。

### 建议命令

```bash
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/orchestrator-api test
pnpm typecheck
pnpm test
```

---

## Phase E — Deterministic Playwright QA for ai-novelist

### 目标

把 QA 从“打开页面检查 body”升级为覆盖 ai-novelist 核心用户流程的 deterministic QA。

### 核心流程建议

至少覆盖以下流程：

1. 首页加载：
   - 打开 local/staging URL。
   - 页面主要区域可见。
   - 无明显 console error。

2. 小说创建流程：
   - 输入主题/设定。
   - 点击生成。
   - 等待阶段结果。
   - 验证输出非空。

3. 章节生成与审稿流程：
   - 生成章节。
   - 进入 review/report 区域。
   - 验证 review result 存在。
   - 验证异常状态不会卡死。

4. 防重复点击/加载态流程：
   - 连续点击生成按钮。
   - 验证不会重复提交或 UI 崩溃。

5. 导出流程：
   - 如果已有导出功能，验证导出入口可用。

### 任务

1. 在 `projects/ai-novelist/qa-charter.md` 补齐核心流程。
2. 为 QA Worker 增加 project-specific deterministic spec runner。
3. 真实采集：
   - screenshot
   - trace.zip
   - HTML report path
   - console/network error summary
4. 生成 schema-valid：
   - `qa-report.md`
   - `bugs.json`
   - `qa-summary.json`
5. Bug evidence 必须包含：
   - reproductionSteps
   - expectedResult
   - actualResult
   - severity
   - screenshot/trace/log path

### 验收标准

- `ENABLE_REAL_PLAYWRIGHT=1` + `QA_TEST_URL=http://127.0.0.1:<port>` 可以执行真实 QA。
- 至少 3 条 ai-novelist 核心流程通过。
- 失败时生成 bug reports。
- Hub 能查看 QA run、bugs、artifacts。
- QA 不依赖人工观察。

### 建议命令

```bash
pnpm --filter @psf/qa-worker test
pnpm test:e2e:smoke
pnpm typecheck
pnpm test
```

---

## Phase F — Auto Fix Loop + Regression Enforcement

### 目标

让 QA 发现的问题自动变成 Codex fix 输入，并强制回归测试通过后才关闭 Bug。

### 任务

1. Bug lifecycle：

```text
open
  -> in_progress
  -> fixed
  -> accepted
  -> wont_fix
```

2. Fix input artifacts：
   - `bugs.json`
   - `qa-report.md`
   - screenshot/trace/log paths
   - relevant acceptance criteria
   - previous attempts summary

3. Regression policy：
   - 每个 P0/P1 reproducible bug 必须有 regression spec。
   - 没有 regression spec 时不能进入 `accepted`。
   - fix 后必须跑 targeted regression。

4. Attempt policy：

```text
current_attempt += 1
if current_attempt >= max_attempts and bugs remain:
  Mission -> needs_human or paused
```

5. WorkerRunner 状态推进：
   - `bugs_found -> fixing`
   - `fixing -> regression_running`
   - regression passed -> `qa_running` or `ready_for_review`
   - regression failed -> `bugs_found` or `needs_human`

### 验收标准

- 用 sample bug 可以完成：QA failed -> fix run -> regression -> ready_for_review。
- 超过 maxAttempts 会进入人工处理状态。
- Hub 清楚显示每轮 fix attempt。
- Bug 关闭必须有证据。

### 建议命令

```bash
pnpm --filter @psf/auto-fix-loop test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/orchestrator-api test
pnpm test
```

---

## Phase G — GitHub PR Preparation and Gated PR Creation

### 目标

在本地闭环稳定后，提供 approval-gated PR 创建能力。默认仍不 push、不创建 PR；只有 operator 明确启用后才允许。

### 任务

1. PR preparation dry-run：
   - branch name
   - commit summary
   - diff summary
   - QA result
   - bug/fix summary
   - risk notes
   - approval status

2. GitHub real adapter 补齐：
   - idempotency key
   - retry/backoff
   - safe request summary
   - redaction tests
   - provider error mapping

3. Operation gates：

```text
gates.allowNetwork=true
gates.allowPushBranch=true
gates.allowCreatePullRequest=true
gates.allowPostQaComment=true optional
```

4. Approval requirements：
   - GitHub PR: `EXTERNAL_COST_RISK` or dedicated `GITHUB_PR_CREATE`
   - Push branch: explicit approval
   - protected branch refusal

5. Hub PR panel：
   - PR readiness
   - missing gates
   - dry-run PR body preview
   - create PR button only when safeToRun true

### 验收标准

- dry-run PR body 正确。
- fake transport tests 覆盖 success/auth failure/permission denied/5xx。
- real network 默认关闭。
- approved real path 可以创建 PR，并把 URL 存到 Mission。
- PR body 不含 secret。

### 建议命令

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
pnpm typecheck
pnpm test
```

---

## Phase H — Operations Hardening

### 目标

把系统从“能跑一次”提升到“能长期使用”。

### 任务

1. structured logs：
   - missionId
   - workerRunId
   - jobId
   - correlationId
   - action
   - status

2. heartbeat/stale detection：
   - workerRunnerHeartbeatAt
   - stale threshold
   - stale job warning
   - manual recovery action

3. retention：
   - artifact retention class
   - dry-run cleanup preview
   - destructive cleanup approval

4. backup/restore docs：
   - PostgreSQL backup
   - Redis queue caveats
   - artifacts backup
   - workspace cleanup

5. token rotation：
   - PSF_API_TOKEN rotation
   - provider token handling
   - `VITE_PSF_API_TOKEN` local-only warning

6. doctor upgrade：
   - db reachable
   - redis reachable
   - worker runner reachable
   - workspace root safe
   - artifact root safe
   - real gate summary
   - redaction self-test

### 验收标准

- `pnpm psf doctor --check-db` 输出可执行建议。
- stale jobs 可被识别。
- artifact cleanup 默认 dry-run。
- 所有破坏性操作需要 explicit confirm/approval。

---

## Phase I — Later Integrations: Coolify / Uptime Kuma / Plane

### 进入条件

只有满足以下条件后再进入：

```text
1. ai-novelist local real closed loop 已跑通。
2. GitHub PR dry-run/real gated path 已跑通。
3. Hub 可以完整查看 Mission、QA、Bug、Artifact、Approval。
4. realNetworkCall audit 已稳定。
5. rollback/manual recovery docs 已有。
```

### 后续顺序建议

1. Coolify staging deploy：只做 staging，不做 production。
2. QA against staging URL。
3. Uptime Kuma monitor sync：只展示状态，不自动修复。
4. Plane one-way sync：Mission/Bug -> Plane issue，不做复杂双向状态同步。
5. n8n notification：只做低风险通知。

---

## 5. 当前最推荐的开发批次

### Batch 1：Truth Cleanup + Hub 基础补齐

优先级最高，因为它直接改善“我能不能用这个平台管理任务”。

```text
1. 修复 docs 状态漂移。
2. 修复 WorkerType schema drift。
3. Hub 替换 placeholder pages。
4. Hub 支持 create/list missions。
5. Hub 支持 approvals list/decision。
6. 添加 smoke tests。
```

### Batch 2：Generic Mission Actions

```text
1. 去掉 dry-run action 对固定 demo mission 的强依赖。
2. 通用 action preflight。
3. WorkerRunner result -> Mission transition。
4. child resource relationship 改善。
```

### Batch 3：ai-novelist Deterministic QA

```text
1. 标准化 ai-novelist local startup。
2. 加 Playwright core flows。
3. 真实截图/trace/report。
4. Bug evidence schema 强化。
```

### Batch 4：Gated Local Real Codex

```text
1. fixture repo proof。
2. ai-novelist local branch/worktree proof。
3. no push/no main mutation/no secret tests。
4. WorkerRun/artifacts/HUB visibility。
```

### Batch 5：Fix Loop + Regression

```text
1. bugs.json -> fix mission。
2. regression spec required。
3. attempts cap。
4. ready_for_review transition。
```

### Batch 6：GitHub PR Gate

```text
1. PR dry-run preview。
2. fake transport integration tests。
3. approval-gated real PR creation。
4. PR URL persisted and shown in Hub。
```

---

## 6. Codex CLI 执行指令

Codex 在执行本计划时必须遵守：

1. 不要直接 push。
2. 不要启用真实 provider 网络调用。
3. 不要把 token/password/secret 写入日志、artifact、PR body、Issue body、Hub UI、API response。
4. 每个 batch 开始前先阅读：
   - `README.md`
   - `AGENTS.md`
   - `docs/00-system-architecture.md`
   - `docs/01-execution-roadmap.md`
   - `docs/04-phase-acceptance-criteria.md`
   - `docs/queue-runtime.md`
   - `docs/safety.md`
   - `docs/progress.md`
5. 每个 batch 结束必须更新：
   - `docs/progress.md`
   - `docs/progress/<batch-name>.md`
   - 相关 feature docs
6. 每个 batch 至少运行 focused tests，再视影响范围运行 broader tests。


## 7. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 过早接入外部系统 | 增加复杂度，掩盖核心闭环问题 | 先完成 ai-novelist local loop，再接 GitHub/Coolify/Plane |
| Hub 做成大而全 dashboard | 业务规则散落到前端 | Hub 只调用 Orchestrator，不直接执行业务逻辑 |
| Codex real 执行误改 main | 代码风险 | worktree/branch guard + fixture proof + no push default |
| Playwright QA 不稳定 | 自动闭环失效 | 先 deterministic core flows，再 AI exploratory |
| secrets 泄露 | 高风险 | redaction tests + response sanitizer + artifact sanitizer |
| queue job 卡死 | Mission 卡住 | heartbeat + stale detection + manual recovery |
| fix loop 无限循环 | 浪费时间和成本 | maxAttempts + needs_human/paused |
| schema drift | 隐性 bug | 共享 schema，减少重复 enum |

---

## 8. 最终验收目标

当以下命令和流程都能稳定完成时，可以认为 Personal Software Factory 进入“第一个可用闭环版本”：

```bash
pnpm install
cp .env.example .env
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm psf doctor
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

Hub 流程：

```text
1. 打开 Hub。
2. 同步 Projects。
3. 创建 ai-novelist Mission。
4. Plan Mission。
5. Approval 如果需要则审批。
6. Queue Codex real local execution。
7. 查看 WorkerRun artifacts。
8. Run deterministic Playwright QA。
9. 若失败，查看 bugs.json / screenshots / trace。
10. Run fix loop。
11. Run regression。
12. Mission 进入 ready_for_review。
13. Preview GitHub PR body。
14. 可选：approval-gated create PR。
```

必须始终满足：

```text
No secret leakage
No push to main
No production deploy
No unapproved external API call
Every Mission state change has MissionEvent
Every bug has reproduction/expected/actual/evidence
Every fix has regression evidence
```
