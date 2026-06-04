# 当前架构结构

## 状态

本文档是 Personal Software Factory 当前架构事实源。它描述已经实现的仓库结构、模块边界、数据流、状态机、worker contract、集成边界和默认安全姿态。

ADR 是持久决策历史。低价值历史阶段计划会在有用事实进入当前文档、ADR、`summary.md` 或 `docs/debug/debug.md` 后删除。

## 系统目的

Personal Software Factory 是单用户 AI 软件工厂控制面。它把自然语言需求转成结构化 Mission、计划任务、dry-run 或 gated worker 执行、确定性 QA evidence、BugReport、fix-loop 记录、approval gate，以及可审阅的 release artifact。

产品默认姿态是 local-first、dry-run/mock/manual-action safe。真实 Codex 执行、浏览器执行、provider 调用、远端 push、PR 创建、部署、monitor 创建和 Plane sync 都保持禁用，除非后续任务明确配置对应 gate、approval、worker wiring，以及 injected runner 或 injected transport。

## Monorepo 边界

- `apps/hub`: React/Vite operator console。
- `apps/orchestrator-api`: Fastify control-plane API。
- `apps/worker-runner`: 用于 queued job 的 BullMQ worker process。
- `workers/codex-worker`: Codex dry-run 与 gated real-runner 抽象。
- `workers/qa-worker`: deterministic Playwright QA 与 AI exploratory QA 抽象。
- `packages/mission-schema`: 共享 Zod schema 和 TypeScript contract。
- `packages/mission-core`: Mission state machine 和 transition event builder。
- `packages/db`: Prisma schema、migration、seed 和 Prisma client wrapper。
- `packages/project-passport`: Project Passport parser 和 validator。
- `packages/project-registry`: 扫描 `projects/*/project.passport.yaml`。
- `packages/mission-planner`: deterministic Mission planner。
- `packages/artifact-store`: local artifact path 与 retention helper。
- `packages/worker-runtime`: in-process 和 BullMQ queue facade。
- `packages/demo-workflow`: 本地 ai-novelist dry-run demo workflow。
- `packages/integrations`: GitHub、Coolify、Uptime Kuma 和 Plane 的 dry-run 与 gated real adapter。
- `packages/security`: redaction、path、command 和 approval policy helper。
- `packages/auto-fix-loop`: dry-run 与 gated real fix-loop contract。
- `projects/ai-novelist`: 第一个 managed project 的 metadata、AGENTS guidance 和 QA charter。
- `missions/`, `artifacts/`, `workspaces/`: 生成的 Mission 文件、evidence 和 worker checkout root。

## Hub Web

Hub Web 是控制界面，不是 workflow truth source。它从 Orchestrator API 读取 dashboard metrics、projects、Missions、bugs、WorkerRuns、artifacts、approvals、integrations、queue status、real-mode readiness、external link visibility 和 Mission summaries。

Hub 的写操作只允许通过受保护的 Orchestrator API 调用完成，例如 Mission creation、dry-run actions、integration dry-runs 和 Approval decisions。Approval decisions 只更新记录；它们不会执行真实 Codex、不会自行 queue real work、不会创建 PR、不会部署、不会创建 monitor，也不会同步 provider。

## Orchestrator API

Orchestrator API 拥有 control-plane HTTP surface。`apps/orchestrator-api/src/server.ts` 负责 Fastify route wiring，`services.ts` 负责 request validation 和 response building，`storage.ts` 抽象 in-memory 与 Prisma-backed persistence。

API 暴露 health、dashboard、project registry sync、Project Passport read、Mission creation/planning/summary/actions、Approval records、WorkerRun records、Artifact records、BugReport records、QARun records、queue status，以及 integration dry-run/status routes。

除非为了本地开发或测试明确关闭，write routes 都要求 bearer-token auth。

## Storage 与 Events

Prisma model 包含 `Project`, `Mission`, `MissionEvent`, `WorkerRun`, `QARun`, `Bug`, `Artifact`, `Approval`, `Deployment`, 和 `Monitor`。

每一次 Mission state transition 和 resource write 都必须能通过 `MissionEvent` 审计。route 或 worker action 修改 state 时，storage implementation 应把 resource 和 event 一起写入。

## Mission State Machine

`packages/mission-core/src/state-machine.ts` 定义合法 Mission transition。Final states 不会继续 transition，除非显式实现 reopen behavior。Worker Runner 只在 `canTransition` 允许下一状态时执行保守的 automatic transition。

核心状态包括 `received`, `planning`, `planned`, `approval_required`, `dev_queued`, `dev_running`, `build_running`, `test_running`, `staging_deploying`, `staging_ready`, `qa_running`, `bugs_found`, `fixing`, `regression_running`, `ready_for_review`, `release_approval`, `production_deploying`, `released`, `paused`, `blocked`, `needs_human`, `failed`, 和 `cancelled`。

## Worker Runtime 与 Worker Runner

`@psf/worker-runtime` 提供 queue facade，并包含 in-process 与 BullMQ implementations。它只接受白名单 job types，并拒绝看起来像 token、password、secret、API key、authorization header 或 credential 的 payload keys。

在 queued mode 中，API 创建 queue wrapper `WorkerRun`，enqueue 一个已验证 job，并返回 queued response。`apps/worker-runner` 消费该 job、更新 wrapper WorkerRun、执行 mapped handler、持久化 child resources、记录 `mission.action_result`，并按合法规则应用保守的 automatic Mission transition。

## Worker Contracts

Dry-run jobs 包括 `mission.plan`, `codex.dry_run`, `qa.dry_run`, `qa.dry_run_with_sample_bug`, `fix.dry_run`, `loop.dry_run`, `demo.ai_novelist`, 和 `integration.dry_run`。

Gated real-mode contract jobs 包括 `codex.real`, `qa.playwright`, `qa.ai_exploratory`, `fix.real`, `github.pr`, `deploy.coolify`, `monitor.uptime_kuma`, 和 `plane.sync`。

默认 Worker Runner path 仍保持安全。Real handlers 会返回 blocked 或 manual-action output，除非完整 gate chain 被有意满足。

## Integration 边界

GitHub、Coolify、Uptime Kuma 和 Plane adapters 暴露 dry-run/status 行为以及 gated real adapter code paths。默认 API、CLI、Hub、tests 和 Worker Runner paths 不会调用外部 provider API。

`realNetworkCall` 必须保持 `false`，除非 gated real adapter 在明确批准的 run 中实际调用 injected transport。默认路径下 `realExternalCall`、`realPush` 和 `realDeploy` 必须保持 false。

## ai-novelist Readiness

`projects/ai-novelist/project.passport.yaml` 是第一个 managed project 的 readiness metadata。其 commands 和 selectors 标记为 manual-verification-required，因为真实仓库未在此 workspace 中验证。worker 不得声称该项目可运行，直到人工验证真实 checkout、commands、URLs 和 deterministic selectors。

## 当前 Source Priority

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
