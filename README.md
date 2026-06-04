# Personal Software Factory

Personal Software Factory / 个人 AI 软件工厂，是一个面向单用户的控制平面：把自然语言软件需求转成结构化 Mission、Codex 驱动开发、Playwright QA、结构化 bug 报告、审批门禁和可审阅的发布工作。

当前仓库已经包含 gated real execution 和集成阶段的基础能力：共享 schema、Prisma 持久化、Mission 状态机、Fastify Orchestrator API、API token auth、Project Registry、`ai-novelist` Project Passport、确定性 Mission Planner、本地 CLI、Codex Worker dry-run 与 gated real-runner 抽象、确定性 Playwright QA、AI exploratory QA 抽象、dry-run 与 gated fix loop、Hub Web、dashboard API、dry-run 与 gated real integration adapter、本地 demo workflow、doctor、受限 demo reset、报告生成、可选 BullMQ queue runtime，以及处理白名单 dry-run 和 gated real-mode job contract 的 Worker Runner。

## 当前范围

已实现：

- `packages/mission-schema`: Project、Mission、MissionEvent、Approval、WorkerRun、Artifact、BugReport 和 QARun 的共享 Zod schema 与 TypeScript 类型。
- `packages/db`: Prisma schema、migrations、client wrapper 和 seed 支持。
- `packages/mission-core`: Mission 状态转移校验和转移事件生成。
- `packages/project-passport`: `project.passport.yaml` 的 YAML 解析、规范化和校验。
- `packages/project-registry`: 扫描 `projects/*/project.passport.yaml` 并生成 Project metadata sync inputs。
- `packages/mission-planner`: 不调用 LLM 的确定性 template planner。
- `packages/integrations`: GitHub、Coolify、Uptime Kuma 和 Plane 的 mock/dry-run adapter，以及只有在 provider、approval、runtime gate 全部满足且注入 transport 后才可用的 gated real adapter。默认路径不会注入真实 transport，也不会调用外部 API。
- `packages/demo-workflow`: 本地 `ai-novelist` demo workflow、doctor、reset 和 report helper。
- `packages/worker-runtime`: dry-run action job 的 in-process 和可选 BullMQ queue facade。
- `apps/orchestrator-api`: Fastify API，包含 health、dashboard、project sync/passport、Mission creation/planning/summary、Approval、WorkerRun、Artifact、BugReport、QARun、Integration routes、Hub 全局资源列表路由，以及必须启用 queued mode 和路由级 `PSF_ENABLE_REAL_*` gate 的 protected real-action contract routes。
- `apps/hub`: React/Vite Hub Web console，提供 dashboard、API-backed project、Mission、bug、WorkerRun、artifact、approval resource pages，`/missions/new` Mission creation、Mission detail、queue status、Integration status、approval decision recording 和 gated real-action visibility。
- `apps/worker-runner`: BullMQ Worker Runner，消费白名单 dry-run jobs 和 gated real-mode contract jobs，然后更新 queue wrapper WorkerRuns 和 child run references。Batch 03/04 的 `codex.real` 在未注入 runner 时仍返回 manual-action。
- `workers/codex-worker`: dry-run prompt、command review artifact、dev summary generator 和 gated real Codex runner。真实执行默认关闭，必须配置 `ENABLE_REAL_CODEX=1`、显式绝对路径 `CODEX_EXECUTABLE`、workspace guards、safe Codex CLI policy、runtime limits、approvals 和 queue/runtime wiring。
- `workers/qa-worker`: 确定性 Playwright QA runner 和 AI exploratory QA 抽象。真实浏览器执行需要 target URL 加 `ENABLE_REAL_PLAYWRIGHT=1` 或注入 runner；AI exploratory QA 在 `ENABLE_AI_EXPLORATORY_QA=1` 且接入 approved executor path 之前保持 manual-action/dry-run。
- `scripts/psf.ts`: 本地 dry-run CLI，覆盖 registry sync、example Mission creation、planning、Codex/QA/fix dry-run artifacts、Integration dry-runs、doctor、demo reset 和 demo report。

真实但默认禁用/受 gate 保护：

- Codex real runner、确定性 Playwright QA、AI exploratory QA 抽象、real fix-loop contract、通过 injected transport 的 GitHub/Coolify/Uptime Kuma/Plane real adapters，以及 Worker Runner real job handlers 已作为代码路径或 contract 存在。
- 它们需要显式环境 gate、相关 credential 或 target URL、queue-backed runtime wiring、approval/policy gate、安全 workspace 配置、Codex local mirror，以及 injected runner/transport 后才会执行真实工作。Batch 03/04 中 Worker Runner 默认不会 spawn 真实 Codex。
- Orchestrator real-action routes 必须同时满足 `PSF_ACTION_EXECUTION_MODE=queued` 和路由级 gate，例如 `PSF_ENABLE_REAL_CODEX=true` 或 `PSF_ENABLE_REAL_GITHUB_PR=true`，才会接受 gated contract job。

默认安全行为：

- 本地 CLI examples、demo workflow、integration status/dry-runs、Hub buttons 和普通测试都保持 dry-run/mock/manual-action 取向。
- 默认不会调用 GitHub、Coolify、Uptime Kuma 或 Plane。设置 `ENABLE_REAL_GITHUB=1`、`ENABLE_REAL_COOLIFY=1`、`ENABLE_REAL_UPTIME_KUMA=1` 或 `ENABLE_REAL_PLANE=1` 只表示 real mode 具备资格；仍需要 runtime wiring、operation gates、credentials 和 injected transport。
- Real Codex spawn、真实 AI provider call、real push、PR creation、deployment、monitor creation、Plane issue sync、production changes 和 arbitrary command execution 都保持关闭，除非后续经批准的运行刻意启用完整 gate chain。

## 运行本地 MVP Demo

从干净 checkout 开始：

```bash
pnpm install
cp .env.example .env
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm psf doctor
pnpm psf demo:ai-novelist --with-sample-bug
PSF_AUTH_DISABLED=true pnpm dev:api
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

`pnpm dev:api` 和 `pnpm dev:hub` 需要在不同终端运行。打开 `http://127.0.0.1:5173` 查看 dashboard、API-backed resource pages、`/missions/new` Mission creation、Mission detail、protected dry-run buttons、approval decisions 和 gated real-action readiness states。Dashboard 仍保留固定 demo Mission 快捷入口，但普通导航不再 fallback 到它。

默认 MVP flow 不执行 Codex、不调用真实 AI provider、不 push、不创建 PR、不 deploy、不创建 monitor、不创建 Plane issue，也不调用外部服务。

常用后续命令：

```bash
pnpm psf doctor --check-db
pnpm psf integrations:status
pnpm psf queues:status
pnpm psf demo:report --with-sample-bug
pnpm psf demo:reset --skip-db
DEMO_RESET_CONFIRM=1 pnpm psf demo:reset --skip-db
pnpm test:scripts
```

## 仓库结构

```text
apps/
  hub/
  orchestrator-api/
workers/
  codex-worker/
  qa-worker/
packages/
  db/
  mission-core/
  mission-planner/
  mission-schema/
  project-passport/
  project-registry/
projects/
  ai-novelist/
missions/
artifacts/
workspaces/
docs/
scripts/
```

## 本地前置条件

- Node.js 20 或更新版本。
- pnpm 9 或更新版本。
- Docker 和 Docker Compose，用于 PostgreSQL 与 Redis。

## 环境变量

从示例文件开始，并把占位内容替换成本地值：

```bash
cp .env.example .env
```

重要 auth 变量：

- `PSF_API_TOKEN`: API write routes 需要的 bearer token。
- `PSF_AUTH_DISABLED`: 只应在本地开发或自动化测试中设为 `true`。
- `VITE_ORCHESTRATOR_API_URL`: Hub Web API base URL。本地默认是 `http://127.0.0.1:3000`。
- `VITE_PSF_API_TOKEN`: Hub Web 调用 protected POST dry-run actions 使用的 bearer token。
- `ENABLE_REAL_CODEX`: 除非一次经批准的 gated Codex run 已明确需要，并且 `CODEX_EXECUTABLE`、`PSF_WORKSPACE_ROOT`、`CODEX_SANDBOX`、`CODEX_APPROVAL_MODE` 和 runtime limits 已配置，否则保持 `0`。
- `ENABLE_REAL_PLAYWRIGHT`: 除非为已配置的 `QA_TEST_URL` 或 `STAGING_URL` 明确启用确定性 browser QA，否则保持 `0`。
- `ENABLE_AI_EXPLORATORY_QA`: 除非已接入经批准的 AI exploratory executor path，否则保持 `0`。
- `PSF_ENABLE_REAL_*`: Orchestrator real-action route gates。它们需要 `PSF_ACTION_EXECUTION_MODE=queued` 和 Worker Runner 支持；单独设置不会运行真实工作。

Integration 变量记录在 `docs/integrations/overview.md` 和 `docs/integrations/*.md` provider 文档中。Gated real adapters 已存在，但默认 Hub/API/CLI 路径仍避免真实网络调用。Provider credentials 和 base URLs 只让 real adapter 具备资格；真实外部调用还需要 operation gates 和 injected transport。

## 初始化和数据库

```bash
pnpm install
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Migration command:

```bash
pnpm db:migrate
```

Seed command:

```bash
pnpm db:seed
```

## 启动 API

```bash
pnpm dev:api
```

默认本地 API URL：`http://127.0.0.1:3000`。

`GET /health` 是公开路由。`POST`、`PUT`、`PATCH` 和 `DELETE` 路由需要：

```bash
Authorization: Bearer <PSF_API_TOKEN>
```

示例：

```bash
curl http://127.0.0.1:3000/health
curl -H "Authorization: Bearer $PSF_API_TOKEN" -X POST http://127.0.0.1:3000/projects/sync
```

Hub-facing read endpoints 包括 `GET /dashboard`、`GET /missions/:id/summary` 和 `GET /integrations`。Integration dry-runs 使用 `POST /integrations/:name/dry-run`，包括 `POST /integrations/uptime-kuma/dry-run`；启用 auth 时需要 bearer token。

## 启动 Hub Web

```bash
pnpm dev:hub
```

默认本地 Hub URL：`http://127.0.0.1:5173`。

Hub 读取 `VITE_ORCHESTRATOR_API_URL`，并只在 protected dry-run actions 中使用 `VITE_PSF_API_TOKEN`。Token 和 password 值不得渲染到 Hub、从 API 返回、写入日志，或复制进 PR/Issue bodies。

## CLI 示例

CLI 以本地优先和 dry-run 为默认姿态。默认会尝试同步 Prisma records；显式 artifact-only 运行可设置 `PSF_SKIP_DB=1`。

```bash
pnpm psf projects:sync
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
pnpm psf codex:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf doctor
pnpm psf demo:seed --skip-db
pnpm psf demo:ai-novelist --with-sample-bug
pnpm psf demo:report --with-sample-bug
pnpm psf demo:reset --skip-db
pnpm psf integrations:status
pnpm psf integrations:dry-run github
pnpm psf integrations:dry-run coolify
pnpm psf integrations:dry-run uptime-kuma
pnpm psf integrations:dry-run plane
```

Artifact-only 示例：

```bash
PSF_SKIP_DB=1 pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
```

`codex:dry-run` 会写入 `codex-prompt.md`、`codex-command.sh` 和 `dev-summary.md`。Command file 是不可执行的 review artifact；运行它会退出且不会调用 Codex。

## 测试和构建

运行 focused script tests：

```bash
pnpm test:scripts
```

运行 broader checks：

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

`AGENTS.md` 中的 baseline check commands：

```bash
pnpm install --lockfile-only
pnpm check
pnpm typecheck
pnpm test
```

## 文档入口

优先从当前事实源和主题文档进入，不要把历史阶段计划当作当前实现状态。

- `summary.md`: 中文总览、当前问题、待改进项和完整 Markdown 文档地图。
- `docs/architecture/structure.md`: 当前架构、模块边界和事实源优先级。
- `docs/debug/debug.md`: 调试热点、验证记录和排障记录。
- `docs/status/progress.md`: 当前进度、能力列表、验证结果和剩余人工动作。
- `docs/status/next-steps.md`: 推荐下一步和进入真实执行前的检查项。
- `docs/api/orchestrator-api.md`: Orchestrator API 路由和请求/响应约定。
- `docs/security/safety.md`: dry-run、queue、真实模式和 secret 安全边界。
- `docs/runtime/queue-runtime.md`: queued WorkerRun、Worker Runner、取消/重试和安全边界。
- `docs/integrations/overview.md`: 集成 dry-run/status 和 gated real adapter 共享边界。
- `docs/api/auth.md`: API token auth 和 local/dev/test 边界。
- `docs/workers/real-codex-execution-readiness.md`: gated real Codex runner 执行前所需 guardrails。
- `docs/security/worker-permissions.md`: worker、Hub/API permission model、dry-run/status 行为和 gated real-runner contract。
- `docs/operations/operations.md`: 本地启动、doctor、demo report 和 reset 操作。
- `docs/operations/troubleshooting.md`: 常见 dry-run failure 的本地处理方式。
- `docs/operations/local-development.md`: zero-to-local setup path。
- `docs/operations/health-checks.md`: doctor、API、Hub 和 integration health checks。
- `docs/apps/hub-web.md`: Hub Web 启动、路由和本地 demo flow。
- `docs/integrations/github.md`: GitHub dry-run PR/Issue 行为和 injected transport gated real adapter contract。
- `docs/integrations/coolify.md`: Coolify dry-run deploy 行为和 injected transport gated real adapter contract。
- `docs/integrations/uptime-kuma.md`: Uptime Kuma dry-run monitor 行为和 injected transport gated real adapter contract。
- `docs/integrations/plane.md`: Plane dry-run Mission/Bug issue 行为和 injected transport gated real adapter contract。
- `docs/projects/project-registry.md`: registry scan 和 DB sync 行为。
- `docs/projects/project-passport.md`: passport fields 和 `ai-novelist` caveats。
- `docs/projects/mission-planner.md`: deterministic planner API 和 CLI 行为。
- `docs/workers/codex-worker.md`: Codex Worker default-disabled/default-safe 边界、dry-run 行为和 gated real-runner contract。
- `docs/runtime/artifacts.md`: inline artifact 和 path-only artifact policy。
- `docs/security/approval-policy.md`: 需要 approval 的 action 类型。

当前实现状态和决策历史以 `summary.md`、`docs/architecture/structure.md`、`docs/debug/debug.md`、`docs/status/progress.md` 和 `docs/adr/` 为入口。

## QA 和自动修复 Dry Run

生成不启动浏览器的 QA dry-run artifacts：

```bash
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

从 `bugs.json` 生成 dry-run fix artifacts：

```bash
pnpm psf fix:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Optional Playwright smoke 在没有 URL 和显式 real-browser gate 时会跳过：

```bash
pnpm test:e2e:smoke
QA_TEST_URL=http://127.0.0.1:8000 ENABLE_REAL_PLAYWRIGHT=1 pnpm test:e2e:smoke
```

Playwright MCP 仅作为后续 AI exploratory QA 记录，默认不安装也不运行。Real Codex execution、remote push、PR creation、external APIs 和 production deploy 都保持关闭，除非显式 real-mode gates、credentials、approvals、queue/runtime wiring 和 injected runner/transport paths 被刻意配置。

## Queue Runtime

当前 queue runtime 默认安全。Inline mode 仍是 tests 和 simple demos 的默认路径；queued mode 只有在 runtime wiring、gates、approvals 和 injected runner/transport requirements 满足时，才会路由白名单 dry-run jobs 和 gated real-mode contract jobs：

```bash
PSF_WORKER_RUNTIME=in-process PSF_ACTION_EXECUTION_MODE=inline pnpm dev:api
```

Queued mode 使用 Redis 和 Worker Runner：

```bash
sudo docker compose up -d postgres redis
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

可从 Hub Mission Detail 触发 queued QA dry-run，也可通过 API：

```bash
curl -H "Authorization: Bearer $PSF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3000/missions/mission-0001-ai-novelist-chapter-review/actions/qa-dry-run \
  -d '{"withSampleBug":true}'
```

查看 queue status 和 WorkerRuns：

```bash
pnpm psf queues:status
curl http://127.0.0.1:3000/queues/status
curl 'http://127.0.0.1:3000/worker-runs?status=queued'
```

取消或重试指定 queue wrapper WorkerRun：

```bash
pnpm psf worker-runs:cancel <workerRunId>
pnpm psf worker-runs:retry <workerRunId>
```

Queue wrapper WorkerRun 记录 queue job state。Child planner、QA、Codex dry-run、fix 和 demo WorkerRuns 保持原有语义，并从 wrapper output 引用。

Queued mode 默认保持安全。它可以路由白名单 dry-run jobs 和 gated real-mode contract jobs，但常规配置不会执行 Codex、push、创建 PR、deploy、创建 provider records 或调用外部服务。
