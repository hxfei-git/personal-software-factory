# 当前架构总览

## 使用方式

`summary.md` 是用户查看当前状态和文档地图的中文总入口；`README.md` 仍是项目启动入口。本文记录当前状态、问题、待改进项、最近文档清理结果，以及仓库中 Markdown 文档的用途地图。

优先阅读顺序：

1. `README.md`
2. `summary.md`
3. `docs/architecture/structure.md`
4. `docs/status/progress.md`
5. `docs/debug/debug.md`
6. `AGENTS.md`

本文不是历史阶段日志。已完成且低价值的历史阶段材料，会在有用事实进入当前文档或 ADR 后移除；`docs/archive/` 只保留仍有审计价值的归档入口。

## 当前优势

- 仓库已有清晰的 TypeScript monorepo 边界。
- Orchestrator API 负责状态管理，并提供本地控制面 API。
- Mission 状态迁移显式、可审计。
- Worker Runtime 和 Worker Runner 提供队列边界，但不授予任意执行能力。
- Hub Web 通过 Orchestrator 读取数据，不直接修改文件系统、数据库或外部 provider。
- 集成 dry-run 和真实模式 readiness surface 默认保持 `realNetworkCall: false`。
- B2 readiness/blocker 合同已收敛：Orchestrator canonical response、Hub、Worker Runner 和 integrations 现在共享 `canQueue`、`canExecute`、`blockers[]` 与 `recommendedNextAction` 语义。
- `ai-novelist` 已作为 readiness metadata 注册，但不会把未验证命令伪装成安全可执行。

## 当前问题

1. 文档仍有漂移风险：新增活跃文档如果复用旧阶段语言，必须明确标为历史语境，不能当作当前事实。
2. B3 已用 focused contract tests 锁定 API、Hub、Worker Runner 的 readiness/blocker 高风险边界；后续新增或修改 route gate、worker gate、provider gate、approval、injected runner/transport、本地 workspace 检查时，必须同步补充同级别 contract tests。
3. `ai-novelist` 执行仍未验证：passport commands、selectors、本地 URL 行为和 E2E 入口需要在真实 checkout 中人工验证。
4. Hub API types、Mission schemas、Orchestrator service schemas、worker job schemas、integration types 之间仍有合同重复。
5. Hub Mission Detail 已能展示 API 返回的 queue/execute readiness、blockers 和 recommended next action；后续仍可继续打磨不同 gated action 的按钮文案和 operator flow。
6. 归档策略已用于完成的历史阶段材料，但未来仍可能有人把陈旧文档加到 `docs/archive/` 之外。

## docs/vision/plan.md 差异摘要

`docs/vision/plan.md` 是长期产品愿景和历史规划上下文，不是当前实现事实源。当前事实以本文、`docs/architecture/structure.md`、`docs/status/progress.md`、`docs/debug/debug.md`、`README.md`、`docs/api/orchestrator-api.md`、`docs/security/safety.md` 和 `docs/runtime/queue-runtime.md` 为准。

- 已实现或已有 proof surface：TypeScript monorepo、Fastify Orchestrator API、React/Vite Hub、Prisma storage、Mission state machine、MissionEvent auditing、optional BullMQ queue runtime、Worker Runner、Project Passport/Registry、deterministic planner、dry-run workers、deterministic QA and local Codex proof surfaces、fix/regression enforcement、GitHub PR preview artifact，以及 default-safe integration adapters。
- Contract-only 或 manual-action：`codex.real`、`qa.playwright`、`qa.ai_exploratory`、`fix.real`、`github.pr`、`deploy.coolify`、`monitor.uptime_kuma` 和 `plane.sync`。这些路径需要 gate、approval、queue/runtime wiring、injected runner 或 injected transport 才能继续推进；默认仍保持 `realNetworkCall: false`、`realExternalCall: false`、`realPush: false` 和 `realDeploy: false`。
- 未验证：`ai-novelist` 的 operator-prepared local mirror、passport commands、local URL、E2E command、deterministic selectors 和目标项目本地运行行为。Passport 中的 `manual-verification-required` 不得当作已验证事实。
- 暂缓：GitHub/Coolify/Uptime Kuma/Plane provider network calls、push、真实 PR 创建、部署、monitor 创建、Plane sync、Temporal 和 LangGraph。Temporal/LangGraph 继续遵守 ADR 0005 的证据门槛。
- 后续顺序：B1 文档差异审计与最小必要清理、B2 readiness/blocker 合同收敛、B3 合同回归测试和必要最小调整均已完成；下一步执行 A1 `ai-novelist` local mirror gated-runner proof。

## 改进待办

### P0

- 默认 integration response 和 gated real-mode response 必须继续保持 `realNetworkCall: false`。
- token、password、API key、authorization、cookie、credential、session、JWT、bearer 等 secret 值不得进入文档、日志、Hub UI、API response、artifact、PR body 或 Issue body。
- 当代码、文件、架构、数据流、状态迁移、worker 合同、集成 gate 或安全边界变化时，同步更新 `docs/architecture/structure.md`、`summary.md`、`docs/debug/debug.md` 等对应事实源。

### P1

- 在启用真实 worker 执行前，在真实 checkout 中验证 `ai-novelist` 的 install、dev、build、test、lint 和 E2E 命令。
- 在新增或修改 gated real action 时，沿用 B3 focused contract tests 方式锁定 readiness/blocker 输出边界。
- 减少重复类型合同；若重复有价值，则补充聚焦的 contract tests。
- 继续让 Hub 真实模式 blocker 精确指向缺失的 approval、gate、env var、本地 mirror、target URL、runner 或 transport，并避免按钮文案暗示立即真实执行。

### P2

- 判断当前文档中的旧 phase 标签何时应替换为 batch 标签或历史说明。
- 当前事实稳定后，补充一张短架构图。
- 只有 BullMQ/state-machine orchestration 出现具体恢复痛点或长流程痛点后，才重新评估 Temporal 或 LangGraph。

## 文档清理状态

- 根目录当前只保留 `README.md`、`AGENTS.md`、`summary.md` 三个 Markdown 入口。
- 全局 Markdown 已迁入 `docs/` 主题目录；代码就近 README、Mission/project 上下文、prompt 模板、Superpowers 计划和生成目录入口保留在原业务位置。
- `summary.md` 现在承担用户中文总览和完整 Markdown 文档地图职责；每次 Markdown 新增、移动、改名或删除，都必须同步维护本地图。
- 旧路径不能作为当前事实源；如需提及已移动路径，必须明确标注为历史旧路径。

## 最近已解决的文档问题

- 主要当前事实源 `docs/architecture/structure.md`、`docs/status/progress.md`、`docs/debug/debug.md` 已改为中文主导，避免用户入口仍以英文为主。
- 保留的运行文档已改为描述当前 queue、API、auth、schema、storage、artifact、safety 和 integration 行为，不再使用旧 phase-entry 作为当前语境。
- 低价值 archive 文件、低价值旧 Superpowers plans/specs、brainstorm、归档 enhancement planning、已被取代的 phase-current notes 已移除；保留的归档策略位于 `docs/archive/README.md`。
- 活跃指导不再把历史旧路径 `docs/progress/current.md`、已归档 enhancement plan、旧 brainstorm 或旧 Superpowers plans/specs 当作当前指令。
- `docs/archive/` 当前只保留归档策略 README，除非未来明确需要保留有独特审计价值的材料。
- runtime、operations、local-development、safety 文档已改为当前 default-safe 加 gated real contract 表述，不再停留在旧 phase-only dry-run 表述。
- API、risk、approval、README、progress、summary、debug 相关文档已修正 stale dry-run-boundary、旧 phase 和 archived-plan 表述。
- 历史旧进度子 rollup 已删除；当前状态、验证姿态和安全边界已合并进 `docs/status/progress.md`、`summary.md` 和 `docs/debug/debug.md`。
- status README 现在指向当前 `docs/status/progress.md`，不再依赖历史旧进度子 rollup。
- structure check script 已从历史旧 phase 文件切换到当前事实源。
- 重复的 numbered phase planning、MVP scope、acceptance、Temporal/LangGraph migration notes 已删除；当前状态依赖根入口、运行文档和 ADR。
- 全局 Markdown 已迁入 `docs/` 主题目录，根目录保留 `README.md`、`AGENTS.md`、`summary.md` 三个入口；`summary.md` 现在维护完整文档地图。
- 文档迁移后的交叉链接已更新到当前主题目录；保留的旧路径仅作为历史旧路径、迁移映射或历史命令出现。

## 已完成

- `docs/architecture/structure.md` 是当前架构地图和事实源。
- `summary.md` 是当前问题、风险、待改进项和 Markdown 文档地图的用户中文入口。
- `docs/debug/debug.md` 是调试、验证和排障记录源。
- 活跃 docs 和索引已更新为当前实现指导。
- B2 readiness/blocker 合同已实施：`safeToRun` 保留为 legacy route-level queue readiness；Orchestrator、Hub、Worker Runner 和 integrations 使用 `canQueue`、`canExecute`、排序后的 `blockers[]` 和 `recommendedNextAction` 表达 blocked/manual-action 状态。
- B3 合同安全测试精补已完成：API 400 preflight、Hub `canQueue` 优先和 blocker 顺序、Worker Runner execute-only blockers、GitHub PR preview/manual-action no-network 边界，以及 repo URL trim 分类和 unsafe branch redaction 均已由 focused tests 锁定。
- 活跃参考文档中的 stale current-phase wording 已修正，同时保留必要历史含义。
- runtime、local development、safety、operations 文档已使用 default-safe 加 gated real contract wording。
- API、provider、Codex、queue、approval、progress 引用已描述 dry-run/status 行为和 gated real adapter 或 runner contract，保持 default-disabled/default-safe execution。
- 误导性的历史 current-state 文件已在有用事实进入当前文档或 ADR 后移除。

## 残余风险

- 未来完成的 phase material 仍需避免进入活跃指导；低价值历史应在当前事实捕获后删除，持久决策才进入 ADR。
- 真实执行仍需要明确后续任务和批准；当前文档地图不代表任何外部调用能力已启用。
- 文档地图的准确性依赖后续每次 Markdown 新增、移动、改名、删除时同步更新 `summary.md`。

## Markdown 文档地图

### 根入口

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
- `docs/status/README.md`: status 目录说明和当前状态文档入口。
- `docs/debug/debug.md`: 调试、验证和排障记录。
- `docs/vision/plan.md`: 长期产品愿景，不作为当前事实源。
- `docs/api/orchestrator-api.md`: Orchestrator API 合同。
- `docs/api/auth.md`: API 认证和本地边界。
- `docs/api/schema.md`: 共享 schema、状态值和 Prisma 模型说明。
- `docs/security/safety.md`: dry-run、真实模式和 secret 安全边界。
- `docs/security/approval-policy.md`: 审批类型和 gated real 执行前置条件。
- `docs/security/worker-permissions.md`: worker、CLI、API、Hub 权限边界。
- `docs/runtime/queue-runtime.md`: 队列运行时、WorkerRun wrapper 和安全边界。
- `docs/runtime/worker-runtime.md`: worker runtime facade 和 queue job contract。
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

### ADR

- `docs/adr/0001-current-architecture-alignment.md`: 记录当前架构和早期 plan 的对齐决策。
- `docs/adr/0002-real-execution-safety-boundary.md`: 记录真实执行安全边界。
- `docs/adr/0003-external-integrations-gated-mode.md`: 记录外部集成 gated real 模式。
- `docs/adr/0004-artifact-store-and-retention-policy.md`: 记录 artifact store 和 retention 策略。
- `docs/adr/0005-temporal-langgraph-decision.md`: 记录暂不引入 Temporal/LangGraph 的决策。

### 模板

- `docs/prompts/ai-qa-playwright-mcp.md`: AI QA Playwright MCP prompt 模板。
- `docs/prompts/bug-report-template.md`: bug report 模板。
- `docs/prompts/qa-report-template.md`: QA report 模板。
- `packages/prompts/qa-explore.md`: package 内 AI exploratory QA prompt 输入模板。

### Superpowers

- `docs/superpowers/README.md`: Superpowers 工作流目录说明。
- `docs/superpowers/plans/README.md`: 当前实施计划目录说明。
- `docs/superpowers/plans/2026-06-04-b1-documentation-drift-audit-and-minimal-cleanup.md`: B1 文档差异审计与最小必要清理实施计划。
- `docs/superpowers/plans/2026-06-04-b2-control-plane-readiness-convergence.md`: B2 控制面 readiness/blocker 合同收敛实施计划。
- `docs/superpowers/plans/2026-06-05-b3-contract-safety-test-reinforcement.md`: B3 合同与安全测试缺口精补实施计划。
- `docs/superpowers/plans/2026-06-04-aggressive-documentation-cleanup.md`: 上一轮激进文档清理实施记录，作为历史计划保留。
- `docs/superpowers/plans/2026-06-04-documentation-map-and-structure.md`: 当前文档地图和目录重整实施计划。
- `docs/superpowers/specs/2026-06-03-aggressive-documentation-cleanup-design.md`: 上一轮激进文档清理设计记录。
- `docs/superpowers/specs/2026-06-04-documentation-map-and-structure-design.md`: 当前文档地图和目录重整设计记录。
- `docs/superpowers/specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md`: 控制面 readiness、文档差异清理和后续 B→A 路线设计记录。
- `docs/superpowers/specs/2026-06-04-control-plane-readiness-convergence-design.md`: B2 控制面 readiness/blocker 合同收敛设计记录。
- `docs/superpowers/specs/2026-06-05-b3-contract-safety-test-reinforcement-design.md`: B3 合同与安全测试缺口精补设计记录。

### 归档

- `docs/archive/README.md`: 归档策略入口；当前默认不保留低价值历史材料。

### 工作区 README

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

### Mission/project 文档

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

### 生成/本地输出入口

- `artifacts/README.md`: artifact 输出目录说明。
- `workspaces/README.md`: worker checkout 根目录说明。
