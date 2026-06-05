# 当前进度

## 当前事实源

当前架构事实源是 `../architecture/structure.md`。当前问题、风险、待改进项和文档地图在 `../../summary.md`。调试和验证记录在 `../debug/debug.md`。

重复当前事实的详细 phase 和 batch rollup 已删除。本文档只保留简洁的当前进度摘要。

## 当前执行路线

B1 文档差异审计与最小必要清理已完成。B2 控制面 readiness/blocker 合同收敛已完成并进入当前实现事实：`safeToRun` 只作为 legacy route-level queue readiness 字段保留，新的判断优先使用 `canQueue`、`canExecute`、`blockers[]` 和 `recommendedNextAction`。下一批工作按 B3 -> A1 执行；B3 只补合同回归测试和必要的最小 production-code 调整，A1 最后在 operator-prepared `ai-novelist` local mirror 上证明 gated-runner path。

GitHub、Coolify、Uptime Kuma、Plane、push、真实 PR 创建、部署、monitor 创建、Plane sync、Temporal 和 LangGraph 继续暂缓，直到本地 mirror gated-runner path 被证明且后续任务获得明确批准。

## 最新更新

B2 控制面 readiness/blocker 合同收敛已完成。Orchestrator API 现在作为 canonical response outlet，在 Mission summary、gated real action blocked/manual-action response 和 route preflight error body 中输出 `canQueue`、`canExecute`、排序后的 `blockers[]` 和 `recommendedNextAction`；`safeToRun` 保留为 legacy route-level queue readiness。Hub Mission Detail 改为消费 API readiness 展示 queue/execute 状态和 blocker，不再自行推断 env、approval、transport 或 runner。Worker Runner wrapper output、`mission.action_result` 和 integration real results 统一保留 execute blockers；已入队结果不回写 queue 语义。默认仍不启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync，`realNetworkCall`、`realExternalCall`、`realPush` 和 `realDeploy` 在默认 gated real outputs 中继续为 `false`。

B2 focused verification 通过：`pnpm --filter @psf/orchestrator-api test`、`pnpm --filter @psf/orchestrator-api typecheck`、`pnpm --filter @psf/hub test`、`pnpm --filter @psf/hub typecheck`、`pnpm --filter @psf/worker-runner test`、`pnpm --filter @psf/worker-runner typecheck`、`pnpm --filter @psf/integrations test` 和 `pnpm --filter @psf/integrations typecheck`。Workspace verification 也通过：`pnpm typecheck`、`pnpm test` 和 `pnpm check`。

Batch 05/06 已完成，覆盖 gated fix/regression enforcement 和 GitHub PR gate preview。`fix-real` queued payloads 现在携带 open bugs、attempts、Project Passport、Mission files、verification commands、regression evidence、branch/workspace context 和 approvals。Worker Runner 只有在 regression evidence 与 injected verification 成功后，才持久化 accepted BugReport updates，并通过合法 Mission states 保守 transition 到 `ready_for_review`。`github-pr` 现在要求已批准的 `EXTERNAL_COST_RISK`，会 queue 安全的 PR preview context，并持久化 child integration WorkerRun 和 PR preview Artifact；默认仍是 manual-action/no-network。该 batch 的 focused package tests、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 `git diff --check` 已通过。

Batch 03/04 已完成，覆盖 local QA 和 local Codex proof surfaces。Orchestrator 现在会用 Project Passport、QA charter、target URL、Mission files 和 e2e command metadata queue `qa.playwright`；只有在 local mirror preflight 构造出安全 payload 后，才会 queue `codex.real`，该 payload 包含 Mission files、project `AGENTS.md`、review-only commands、workspace root、default branch 和 `agent/*` branch。

Deterministic QA 现在记录 scenario-level evidence；缺少或无效的 `targetUrl`、未验证 selectors 会被 blocked 为 manual action，而不是伪造 `passed`；存在 screenshot、trace、log 和 scenario IDs 时会持久化这些 evidence。Worker Runner 在 queue wrapper WorkerRun 下持久化 queued QA child resources 和保守 status outcomes。Codex fixture proof 覆盖 operator-prepared local mirror、isolated worktree、`agent/*` branch、injected spawn path、generated artifacts、无 mirror `main` mutation、无 push、无 external provider call。

Worker Runner `codex.real` integration 仍然 default-safe：它要求 local `repoUrl` 和 `agent/*` branch preflight；没有 injected runner 时返回 `manual_action`；本阶段只把 queued context 传给 injected runner。Hub Mission detail 和 resource views 暴露 QA evidence paths，同时 display redaction 会阻止 token、password、API key、authorization、session、credential 和 secret-like values 被渲染。

## Phase 18 文档

- Hub resource pages 现在从 Orchestrator API 读取 Projects、Missions、Bugs、WorkerRuns、Artifacts 和 Approvals。
- Hub 可以通过 `/missions/new` 创建 Missions，然后打开创建后的 Mission detail page。
- Approval decisions 可以被记录，但不会执行真实 Codex、PR creation、deploy、monitor sync 或 provider sync。
- Mission dry-run action preflight 现在检查 Mission、Project 和 Project Passport 可用性，而不是默认拒绝非 demo Mission IDs。
- WorkerRunner 记录 `mission.action_result` 和保守的 `mission.status.auto_transition` events。
- 真实 external actions 默认仍禁用，integration dry-run/status responses 保持 `realNetworkCall: false`。

## 已完成 Tasks 1-13

1. Shared safety package：添加 redaction、command/path policy 和 real-mode guardrails，供 worker 与 integration paths 使用。
2. Artifact store and retention policy：记录 local artifact 边界，以及 large evidence 只保留 path 的处理方式。
3. Queue and API real-mode job contracts：添加显式 real/gated action contracts，避免 arbitrary job submission。
4. Real Codex runner gated mode：添加 real-runner abstraction；除非 `ENABLE_REAL_CODEX=1`、安全 Codex CLI policy、workspace guards、runtime limits 和 approvals 都满足，否则保持 blocked。
5. Deterministic Playwright QA runner：添加 gated real browser path，要求 target URL 加 `ENABLE_REAL_PLAYWRIGHT=1` 或 injected runner。
6. AI exploratory QA gated mode：添加 abstraction 和 validation path，同时默认禁用 MCP/browser execution。
7. Real auto-fix loop gated mode：把 fix loop 连接到 gated real contracts，同时保留 dry-run/manual-action defaults。
8. Real integration adapters with injected transports：添加 GitHub、Coolify、Uptime Kuma 和 Plane real adapters；必须具备 credentials、policy gates 和 injected transports 才可能产生 network activity。
9. Worker Runner real job handlers：把白名单 real contract jobs 映射到 gated handlers，默认输出安全 manual-action。
10. Orchestrator API and Hub visibility：暴露受保护的 real-action readiness surfaces 和 route gates，例如 `PSF_ENABLE_REAL_CODEX` 与 `PSF_ENABLE_REAL_GITHUB_PR`。
11. ai-novelist real loop readiness：记录第一个 managed project 的 readiness 边界，但不启用 autonomous external actions。
12. Operations hardening：扩展 doctor/safety guidance，覆盖 real gates、queue runtime、workspace roots 和 secret redaction。
13. Temporal and LangGraph decision record：暂缓二者，直到 BullMQ-based control plane 需要 durable workflow complexity。

## Task 14 文档与验证

- README 现在区分 real-but-disabled abilities 和默认 dry-run/mock behavior。
- `.env.example` 现在列出 phase real-mode variables 和 Orchestrator route gates，并用空 placeholder/comment 表示 secrets。
- 本 progress 文件汇总 changed capabilities、safety boundaries、migrations、test commands 和 remaining manual actions。
- 本 documentation task 未调用真实 external APIs。
- Final verification 在 documentation rollup、targeted test-stability commits 和 final security-review fixes 后通过。

## 能力变更清单

Real but disabled/gated capabilities 现在包括 Codex real runner、deterministic Playwright QA、AI exploratory QA abstraction、real fix loop contract、通过 injected transport 的 GitHub/Coolify/Uptime Kuma/Plane real adapters，以及 Worker Runner real job handlers。

Default-safe capabilities 仍是 local dry-runs、mock integration status/dry-runs、manual-action outputs、demo workflow 和 normal test execution。Provider real-mode flags 只让 real mode 具备资格；没有 credentials、route gates、approvals、runtime wiring 和 injected transports 时，不会调用 network。

## 默认安全边界

- Codex child processes 现在只接收 allowlisted non-secret environment，local repository mirrors 必须在 realpath resolution 后位于 `PSF_WORKSPACE_ROOT/mirrors` 下。
- Queued real-action jobs 会把 approved approval records 和 worker policy grant ids 分开记录。
- Uptime Kuma runtime session tokens 会从 post-login transport error results 中 redacted。
- 默认 integration status 和 dry-run surfaces 上，`realNetworkCall` 保持 `false`。
- Orchestrator real-action routes 要求 `PSF_ACTION_EXECUTION_MODE=queued` 加 route-specific `PSF_ENABLE_REAL_*` gates。
- Worker/provider gates，例如 `ENABLE_REAL_CODEX`、`ENABLE_REAL_PLAYWRIGHT`、`ENABLE_AI_EXPLORATORY_QA` 和 `ENABLE_REAL_GITHUB`，在 `.env.example` 中仍保持 disabled。
- Secrets 不得出现在 API responses、Hub UI state、logs、artifacts、PR bodies、Issue bodies 或 integration outputs。
- 默认路径不包含 push、PR creation、deployment、monitor creation、Plane sync、production mutation 或 provider API call。

## Migrations

Task 14 仅修改文档，没有引入 Prisma migration。该 phase rollup 不改变 schema 或 runtime code。

## 验证结果

Final coordinator gates 已通过：

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

`pnpm psf doctor` 由于本地 checkout 缺少 `.env` 和可选 provider credentials 而输出 warnings。这符合安全默认设置，且不会启用任何真实 external call。

匹配 changed real-mode surfaces 的 focused checks 也已通过：

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
```

## 剩余人工动作

- Operator 必须只在本地 `.env` 或 secret storage 中提供真实 credentials，绝不能写入 tracked docs。
- Operator 必须显式批准并接好 queued runtime、route gates、worker gates、injected runners/transports 和 provider operation gates，才允许任何真实 external action。
- Provider API behavior 在 tests 中应继续使用 fake transports，除非后续批准的任务明确要求真实 network validation。
