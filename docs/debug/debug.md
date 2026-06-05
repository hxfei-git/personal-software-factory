# 调试记录

> 当前调试记录入口为 `docs/debug/debug.md`。历史条目中出现的旧路径只表示当时的文件位置，不是当前事实源。

## 目的

本文记录需要跨越单次 terminal session 保留的调试上下文。它汇总 investigation、failed checks、unexpected behavior、manual-action results、queue/runtime issues，以及后续 verification。

不要在这里粘贴 secrets、raw tokens、passwords、cookies、provider credentials、private manuscript content 或长日志。大型 generated evidence 应存放在 `artifacts/` 下，本文只链接安全路径或写入 sanitized summary。

## 已知调试热点

- Orchestrator write auth 与本地 `PSF_API_TOKEN` / `VITE_PSF_API_TOKEN` 不一致。
- `PSF_WORKER_RUNTIME`、`PSF_ACTION_EXECUTION_MODE`、Redis、API 和 Worker Runner 之间的 queue mode 不一致。
- `qa.playwright` 因缺少 target URL、verified selectors 或 `ENABLE_REAL_PLAYWRIGHT=1` 而 blocked。
- `codex.real` 因未接入 injected runner、`repoUrl` 不是 local mirror、branch 不在 `agent/` 下或 workspace guards 失败而返回 manual-action output。
- GitHub PR preview 因缺少 `EXTERNAL_COST_RISK` approval 或 operation gates 而 blocked。
- Integration readiness 容易被误解：`realEnabled=true` 时仍然正确报告 `realNetworkCall=false`。
- `ai-novelist` command assumptions 仍是 manual-verification-required。

## 聚焦验证命令

```bash
git status --short --branch
git diff --check
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/integrations test
pnpm psf doctor
pnpm psf integrations:status
pnpm psf queues:status
```

优先运行覆盖改动面的最小有意义检查。涉及 shared contracts、phase gates 或 cross-package behavior 时，再运行更广的 `pnpm check`、`pnpm typecheck` 和 `pnpm test`。

## 调试记录格式

新增条目使用以下格式：

```markdown
### YYYY-MM-DD - 短问题标题

- 背景: 改了什么，或正在检查什么。
- 现象: 准确的失败或异常行为，secret 必须已 redacted。
- 范围: 涉及的 packages、apps、docs 或 commands。
- 调查: 关键观察和排除掉的原因。
- 修复: 修改的文件或作出的决策。
- 验证: 已运行的命令和结果。
- 后续: 具体剩余动作，或 `none`。
```

## 当前条目

### 2026-06-05 - A1 ai-novelist 本地镜像证明阻断

- 背景: 执行 A1 `ai-novelist` local mirror gated-runner proof，目标是在隔离 mirror 上证明至少一个本地目标 Web 可观测事件，同时允许目标 app 内部使用 DeepSeek provider 配置；PSF 自身不得启用真实 provider transport、push、PR、deploy 或 browser automation。
- 现象: 聚焦脚本测试和 typecheck 通过；`DEEPSEEK_API_KEY` 存在但未输出。A1 proof 成功准备/验证 source 与 mirror git metadata，但目标 Web 启动失败，原因是隔离 mirror 中缺少已验证命令依赖 `.venv/bin/ai-novelist`。
- 范围: `scripts/a1-ai-novelist-proof.ts`、`scripts/psf.ts`、`workspaces/mirrors/ai-novelist`、`artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json`、`docs/architecture/structure.md`、`docs/security/safety.md`、`docs/status/progress.md`、`docs/status/next-steps.md` 和 `summary.md`。
- 调查: Source checkout `/home/ubuntu/1.project/ai-novelist` 位于 clean `main...origin/main`；PSF implementation worktree 位于 clean `a1-local-mirror-deepseek-proof`；A1 mirror 位于 clean `agent/a1-local-mirror-deepseek-proof`。Artifact 摘要显示 `status: "manual_action"`、`canQueue: true`、`canExecute: false`、blocker `target.web_start_failed`、`targetProvider: "deepseek"`、`targetProviderBoundary: "ai-novelist-web"`、`targetAppProviderCall: "not_observed"`、`webProcessStarted: false`、`webProcessStopped: false`。Artifact secret-like scan 为 0 hits；没有保存 DeepSeek prompt/response 原文或 provider payload。
- 修复: 未把 manual-action 伪造成 proof success；保留 artifact 作为 sanitized evidence，并更新事实源说明 A1 当前阻断在 mirror dependency/web command provisioning。PSF 安全 flags 在 artifact 和 CLI response 中均保持 `realNetworkCall: false`、`realExternalCall: false`、`realPush: false` 和 `realDeploy: false`；DeepSeek 只作为目标 app 内部 provider metadata 记录。
- 验证: Focused checks 通过：`pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts` 23 passed；`pnpm exec vitest run scripts/psf.test.ts -t "a1 proof"` 3 passed / 21 skipped；`pnpm typecheck:scripts` 通过。A1 proof 命令 `pnpm psf a1:ai-novelist-proof --confirm-web-command --source /home/ubuntu/1.project/ai-novelist --target-url http://127.0.0.1:8000/api/projects --json --skip-db` 返回 manual-action blocker `target.web_start_failed`，sanitized log summary 为 `.venv/bin/ai-novelist` missing。Artifact sanitized scan 通过，secret-like hits 为 0。Final checks 通过：`pnpm test:scripts` 47 passed；`pnpm typecheck:scripts` 通过；`git diff --check` 通过；`node scripts/check-phase1-structure.mjs` 通过并验证 40 files 和 26 directories；`pnpm check` 通过，typecheck 17/17 packages、workspace tests 17/17 packages、script tests 47/47。Implementation baseline 曾在 fresh worktree 中因未生成 Prisma Client 导致 `pnpm typecheck:scripts` 失败，运行 `pnpm db:generate` 后通过；本 Task 5 rerun 未复现该失败。
- 后续: 在隔离 mirror 中由 operator 明确准备/验证 Web 启动命令和依赖，或把 A1 command template 改为经过 operator 确认的可复现 setup/start command 后重试。重试仍不得把本次 proof success 扩大成 passport commands/selectors 全局 verified，除非每个 command/selector 都在同次 evidence 中明确验证。

### 2026-06-05 - B3 合同安全测试精补

- 背景: 根据 B3 设计补强 readiness/blocker 合同缺口，覆盖 API 400 preflight、Hub `canQueue` 优先、Hub blocker 顺序、Worker Runner defense-in-depth execute-only blockers，以及默认 GitHub PR preview/manual-action no-network 边界。
- 现象: B2 已完成主合同收敛，但缺少聚焦 contract tests 时，后续可能把 legacy `safeToRun` 重新当作真实执行 ready，或把已入队 Worker Runner defense-in-depth blocker 误写成 queue rejected。
- 范围: `apps/orchestrator-api/src/services.ts`、`apps/orchestrator-api/tests/api.test.ts`、`apps/hub/tests/hub.test.tsx`、`apps/worker-runner/src/handlers.ts`、`apps/worker-runner/tests/runner.test.ts`、`docs/architecture/structure.md` 和 `docs/security/safety.md`。
- 调查: 先按 TDD 补缺口测试；API canonical preflight tests 的 RED 显示旧 400 body 缺少 `canQueue`、`canExecute`、安全 flags 和 `blockers[]`；Worker GitHub PR 边界 RED 显示 child WorkerRun metadata 缺少 `realExternalCall:false`；Hub 新 contract tests 直接通过，说明现有 Hub production code 已按 API readiness 消费 `canQueue` 和 blocker 顺序。最终 code review 又发现 whitespace-wrapped remote repo URLs 会绕过 local-mirror classifier，且 unsafe branch top-level details 会回显 secret-like branch text。
- 修复: `codex-real` 本地镜像和 unsafe branch preflight 通过 readiness blocker builder 输出 canonical 400 details；Hub 增加 `canQueue` 优先与 API blocker 顺序回归测试；Worker Runner 锁定已入队 `codex.real` policy blockers 只阻塞 execute，并补齐 GitHub PR child WorkerRun no-external-call metadata；review fix 进一步在 API 和 Worker Runner repo URL 分类前 trim 输入，并对 unsafe branch API details 使用 redacted value；未新增共享 schema 迁移或真实 provider runner/transport。
- 验证: RED: `pnpm --filter @psf/orchestrator-api test -- tests/api.test.ts -t "canonical"` 先失败，2 failed / 86 skipped，原因是新 tests 期望 canonical readiness fields；修复后同命令通过，2 passed / 86 skipped。RED: `pnpm --filter @psf/worker-runner test -- tests/runner.test.ts -t "blocks codex.real|blocks unsafe codex.real branch|keeps github.pr default manual-action"` 先失败，原因是 GitHub PR child WorkerRun metadata 缺少 `realExternalCall:false`；修复后同命令通过，7 passed / 39 skipped。Review RED: `pnpm --filter @psf/orchestrator-api test -- tests/api.test.ts -t "whitespace-wrapped remote codex-real|redacts secret-like unsafe branch"` 先失败，2 failed / 88 skipped；修复后同命令通过，2 passed / 88 skipped。Review RED: `pnpm --filter @psf/worker-runner test -- tests/runner.test.ts -t "blocks codex.real"` 先失败，2 failed / 3 passed / 43 skipped；修复后同命令通过，5 passed / 43 skipped。Final checks 通过：`pnpm --filter @psf/orchestrator-api test -- tests/api.test.ts -t "codex-real .*preflight|whitespace-wrapped remote codex-real|redacts secret-like unsafe branch|gated real actions|real-mode readiness"` 10 passed / 80 skipped；`pnpm --filter @psf/hub test -- tests/hub.test.tsx -t "real-mode readiness|canQueue|API-provided order"` 3 passed / 35 skipped；`pnpm --filter @psf/worker-runner test -- tests/runner.test.ts -t "codex.real|github.pr|canonical blockers|defense-in-depth"` 24 passed / 24 skipped；`pnpm --filter @psf/orchestrator-api test` 93 passed；`pnpm --filter @psf/orchestrator-api typecheck` 通过；`pnpm --filter @psf/hub test` 38 passed；`pnpm --filter @psf/hub typecheck` 通过；`pnpm --filter @psf/worker-runner test` 48 passed；`pnpm --filter @psf/worker-runner typecheck` 通过；`pnpm check` 通过；`git diff --check` 通过；`node scripts/check-phase1-structure.mjs` 通过。
- 后续: B3 完成后可继续进入 A1 `ai-novelist` local mirror gated-runner proof；真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 和 Plane sync 仍需后续明确批准。

### 2026-06-05 - B2 控制面 readiness/blocker 合同收敛

- 背景: 用户确认进入 B2 实施阶段，目标是让 blocked/manual-action 状态在 API、Hub、Worker Runner 和 integrations 中可操作、可测试、可展示，同时保持默认安全边界。
- 现象: 旧 `safeToRun` 容易被误读成真实执行已经可发生；Worker Runner 和 integrations 的 manual-action output 也缺少统一 blocker shape。
- 范围: `apps/orchestrator-api`、`apps/hub`、`apps/worker-runner`、`packages/integrations`、`docs/api/orchestrator-api.md`、`docs/apps/hub-web.md`、`docs/architecture/structure.md`、`docs/runtime/queue-runtime.md`、`docs/integrations/overview.md`、`packages/integrations/README.md`、`docs/status/progress.md` 和 `summary.md`。
- 调查: 先按设计确认 `safeToRun` 只能保留 legacy route-level queue readiness；新的判断必须来自 `canQueue`、`canExecute`、排序后的 `blockers[]` 和 `recommendedNextAction`。执行期间发现受限 sandbox 的 `bwrap` loopback 设置失败，命令通过审批后的 escalated path 运行；没有绕过 provider/network/push/deploy 安全边界。
- 修复: 新增 Orchestrator readiness helper 和合同测试；route preflight、blocked real-action response、Mission summary readiness、Hub Mission Detail、Worker Runner wrapper/action_result、GitHub PR preview/manual-action output 和 integration real results 统一输出 sanitized blockers。Integration mapper 不把 `safeToRun:false` 当作具体 blocker 原因，缺少具体原因时使用 unclassified manual-action fallback。
- 验证: Focused checks 通过：`pnpm --filter @psf/orchestrator-api test`、`pnpm --filter @psf/orchestrator-api typecheck`、`pnpm --filter @psf/hub test`、`pnpm --filter @psf/hub typecheck`、`pnpm --filter @psf/worker-runner test`、`pnpm --filter @psf/worker-runner typecheck`、`pnpm --filter @psf/integrations test`、`pnpm --filter @psf/integrations typecheck`。Workspace checks 通过：`pnpm typecheck`、`pnpm test`、`pnpm check`。
- 后续: B3 只补 focused contract tests 和必要最小 production-code 调整；可考虑把 shared real-result helper 从 provider 文件抽到更中性的 internal module，并细化 disabled real-mode env blocker 文案。

### 2026-06-04 - B1 文档差异审计与最小清理

- 背景: 已批准控制面文档差异收敛设计，当前批次只执行 B1 文档审计和最小必要清理。
- 现象: `docs/vision/plan.md` 仍包含长期愿景、旧 phase、旧路径和旧执行 prompt；这些内容必须继续被标记为非当前事实，避免污染当前状态。
- 范围: `summary.md`、`docs/status/progress.md`、`docs/status/next-steps.md`、`docs/debug/debug.md`、`README.md`、`AGENTS.md`、`docs/vision/plan.md` 和 retained Superpowers plan/spec records。
- 调查: 运行 Markdown inventory、stale path/phase scan 和 safety wording scan；由于当前环境没有 `rg`，使用 `grep` fallback；命中分类为 historical context、explicit non-current wording、explicit prohibition or safety boundary，未发现 current-risk matches。
- 修复: 更新当前事实源的愿景差异摘要和 B1 -> B2 -> B3 -> A1 路线；没有默认删除 Markdown；没有发现需要删除、移动、改名或新增的 Markdown；没有启用真实执行或外部 provider 调用。
- 验证: `git diff --check` 通过；`node scripts/check-phase1-structure.mjs` 通过；stale path/phase scan 和 safety wording scan 的剩余命中均已分类为历史语境、明确非当前措辞或安全禁止边界。
- 后续: B2 定义 readiness/blocker 合同，避免 `safeToRun=true` 被误读成真实执行已可发生。

### 2026-06-03 - 发现文档漂移

- 背景: 规划当前 documentation cleanup。
- 现象: `docs/progress/current.md` 仍描述 Phase 1，但 README 和 progress rollups 已描述 gated real execution 与 Batch 05/06。
- 范围: 当时的 root docs、progress docs、AGENTS guidance、historical planning files。
- 调查: 搜索 stale phase labels、archived enhancement-plan references，以及 historical plans 的 active references。
- 修复: 创建 current fact-source docs，并把误导性 historical files 归档到 `docs/archive/`。
- 验证: spec 和 plan 在 file cleanup 前已 commit，archive task 使用 `git mv` 移动 historical files。
- 后续: 每次 cleanup pass 后重新运行 documentation text checks。

### 2026-06-03 - 发现活跃旧阶段措辞

- 背景: supplemental Task 3B 在 active documentation cleanup 后继续做 stale-phase verification。
- 现象: stale-phase search 仍在 active reference docs 中匹配 current-state wording，且这些文件不在原 cleanup spec/plan 范围内。
- 范围: AGENTS guidance、architecture docs、worker permissions、final MVP scope、migration notes、roadmap headings、acceptance criteria headings、summary 和 debug records。
- 调查: 运行 required search，排除 `docs/archive/**`，并把 intended historical cleanup spec/plan matches 与需要更新的 active reference docs 分开。
- 修复: 重命名 current-phase headings，更新 active docs 以描述当前 dry-run 与 gated real contracts，保留 no real execution、no provider call、no push 和 no deploy defaults，并把 historical files 归档到 `docs/archive/`。
- 验证: 重新运行 stale-phase search 和允许文件的 `git diff --check`。
- 后续: 后续 cleanup pass 继续监控 stale active-doc wording。

### 2026-06-03 - 修正 Runtime Boundary 阶段措辞

- 背景: Task 4 quality review 发现 active runtime、local-development 和 safety docs 仍使用旧 phase-boundary wording 描述当前 execution safety。
- 现象: active docs 把 runtime 和 local development 描述成 phase-specific dry-run-boundary，可能掩盖当前 gated real contract paths。
- 范围: `docs/worker-runtime.md`、`docs/local-development.md`、`docs/safety.md`、`summary.md` 和 `debug.md`。
- 调查: 搜索 active docs 中的精确 stale phase sentences，并验证已有 `realNetworkCall: false` 与 default-safe safety boundaries。
- 修复: 用 default-safe 加 gated real contract wording 替换旧 phase-boundary statements，没有启用 Codex、Playwright、provider、GitHub、Coolify、Uptime Kuma 或 Plane real calls。
- 验证: 重新运行 stale-sentence search、safety-boundary search、targeted `git diff --check` 和 `git status --short`。
- 后续: none。

### 2026-06-03 - 修正 Operations Queue Boundary 措辞

- 背景: Task 4 quality review 发现 `docs/operations.md` 仍把 queue mode 描述成 dry-run/mock only。
- 现象: operations guide 没有反映当前 default-safe queue behavior 与 gated real-mode contract jobs。
- 范围: `docs/operations.md`、`summary.md` 和 `debug.md`。
- 调查: 搜索 active operations、summary 和 debug docs 中的 stale queue sentence 与现有 `realNetworkCall: false` safety wording。
- 修复: 用 default-safe、dry-run/mock、gated real-mode contract、explicit gates 和 injected runner/transport wording 替换 dry-run-only queue sentence，未启用真实调用。
- 验证: 重新运行 stale queue search、safety-boundary search、targeted `git diff --check` 和 `git status --short`。
- 后续: none。

### 2026-06-03 - 文档清理验证

- 背景: 创建 current fact-source docs 并归档 historical planning files 后的 final validation。
- 现象: active docs 之前混合了 current architecture 与 stale phase guidance。
- 范围: `AGENTS.md`、当时的 root docs、progress docs、Superpowers docs、runtime/safety docs 和 archive paths。
- 调查: 运行 whitespace、stale-phase text、safety-boundary text 和 git status checks。
- 修复: 历史说明：当时 active docs 已更新为指向那时的 `struct.md`、`summary.md` 和 `debug.md`；后续 documentation-map work 又把这些入口迁移到 `docs/architecture/structure.md`、`summary.md` 和 `docs/debug/debug.md`。Historical plans 在该 cleanup pass 中归档；后续 aggressive cleanup 删除了低价值 archive files；runtime/safety docs 使用 default-safe 加 gated real contract wording。
- 验证: `git diff --check HEAD~3..HEAD` passed with no output; `git diff --check main...HEAD` passed with no output; `rg -n 'Phase 1: Monorepo Foundation|Phase 11-15 currently|Current Phase' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'` only matched active cleanup spec/plan command examples and replacement instructions; `rg -n 'realNetworkCall.*false|realNetworkCall` stays `false|realNetworkCall` remains `false' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'` found current safety-boundary wording plus cleanup plan/spec and debug history references; `git status --short --branch` showed `## docs/current-architecture-cleanup`.
- 后续: none。

### 2026-06-03 - 修正 Active Docs Final Safety 措辞

- 背景: final reviewer 发现 active docs 中仍有 stale dry-run-boundary、old phase-surface 和 archived-plan wording。
- 现象: API、risk、approval、README 和 progress docs 可能暗示 provider 或 Codex surfaces 只是 historical dry-runs，而不是当前 default-safe contracts with gated real runner or adapter paths。
- 范围: `README.md`、`docs/api.md`、当时 active 的 `docs/03-risk-and-assumptions.md`（Task 5 中已删除）、`docs/approval-policy.md`、`docs/progress/batch-05-06-brainstorming.md`、`summary.md` 和 `debug.md`。
- 调查: 搜索允许的 active docs 中的精确 stale phrases，并与现有 default-safe、`realNetworkCall: false`、injected transport、injected runner 和 historical archive wording 对照。
- 修复: 用 default-safe dry-run/status 加 gated real contract wording 替换 stale dry-run-boundary 和 phase-only wording，保留 `realNetworkCall: false` defaults，直到 explicit gates、approvals 和 injected transports 或 runners 接好，并把 progress note 改成 historical archived enhancement-plan reference。
- 验证: 重新运行 stale wording search、current safety/archive wording search、targeted `git diff --check` 和 `git status --short`。
- 后续: none。

### 2026-06-04 - 删除低价值 Archive 文件

- 背景: 当前架构文档合并后执行 aggressive cleanup。
- 现象: `docs/archive/` 仍保留已完成的 Superpowers plans/specs、brainstorms、archived enhancement plan，以及已被取代的 Phase 1 current note；这些内容不再有独特决策价值。
- 范围: `docs/archive/**`、`docs/README.md`、`summary.md` 和 `debug.md`。
- 调查: 将 archive contents 与 current fact sources 和 ADR protection rules 对比。
- 修复: 删除低价值 archive files，重写 `docs/archive/README.md` 为 retained-audit policy，并修正仍指向已删除 archive material 的 active docs。
- 验证: 运行 archive listing、stale-reference search、`git diff --check` 和 `git status --short --branch`。
- 后续: none。

### 2026-06-04 - 删除已完成的 Superpowers Cleanup Docs

- 背景: active Superpowers directories 仍包含已完成的 current-architecture cleanup spec 和 implementation plan。
- 现象: completed workflow artifacts 可能被误认为 active workstream。
- 范围: `docs/superpowers/**`、`summary.md` 和 `debug.md`。
- 调查: 列出 active Superpowers files，并区分已完成的 previous cleanup 与 current aggressive cleanup spec/plan。
- 修复: 删除已完成的 previous cleanup spec/plan，并更新 Superpowers README guidance。
- 验证: 运行 active Superpowers listing、deleted-path search、`git diff --check` 和 `git status --short`。
- 后续: 在此 workstream 不再 active 后，删除当前 aggressive cleanup plan/spec。

### 2026-06-04 - 合并 Progress Rollups

- 背景: 当前事实进入当时的 current fact sources 后，执行 progress files aggressive cleanup；当前 progress entrypoint 是 `docs/status/progress.md`。
- 现象: `docs/progress/` 包含旧 phase 和 batch rollups，重复了当时的 current progress entrypoint、current docs 和 debug history。
- 范围: historical `docs/progress/**`、current `docs/status/progress.md`、`summary.md` 和 `docs/debug/debug.md`。
- 调查: 搜索 progress child files 的 active references，并确认 progress entrypoint 已包含 current capability 与 verification summary。
- 修复: 删除 progress child rollups，并移除 active links。Progress README 现在只保留 `../progress.md` 作为 child rollup 删除后的 path reference。Progress child rollup deletion 同时把 structure check script 从 old phase files 更新到 current fact sources。
- 验证: 运行 deleted-path search、stale phase search、`git diff --check` 和 `git status --short`。
- 后续: 未来 current progress 记录在 `docs/status/progress.md`，除非明确需要新的 focused current note。

### 2026-06-04 - 删除重复 Phase Planning Docs

- 背景: aggressive cleanup 删除 old numbered phase planning documents。
- 现象: roadmap、acceptance、MVP scope、migration sketch 和 early architecture planning docs 重复 current fact sources 或 ADRs。
- 范围: numbered docs、README documentation links、development standards、next steps、summary 和 debug records。
- 调查: 搜索 numbered phase docs 的 active references，并替换为 root fact-source 和 ADR guidance。
- 修复: 删除 duplicate phase planning docs 并更新 active references。
- 验证: 运行 deleted-path search、stale phase search、`git diff --check` 和 `git status --short`。
- 后续: 未来 architecture decision 应创建新 ADR 或 design，而不是恢复 numbered phase plans。

### 2026-06-04 - 重写保留的 Operational Docs 措辞

- 背景: active operational docs 被保留，但仍包含旧 phase-entry wording。
- 现象: API、queue、local development、safety、auth、schema、storage、artifacts、worker runtime 和 integration docs 读起来像 phase plans，而不是 current operating guidance。
- 范围: retained operational docs、`summary.md` 和 `debug.md`。
- 调查: 搜索 active docs 中的 old phase phrases，并按 current default-safe 与 gated real boundaries 核对每个保留文件。
- 修复: 用 current operational wording 替换 old phase-entry language，同时保留 `realNetworkCall: false` 和 gated runner/transport boundaries。Storage queue wording 也从 old later-phase/API-MVP language 修正为 current optional queue runtime wording。保留 operational docs 中剩余的 phase/batch wording 规范为 task/current-runtime wording。Safety doc 中剩余的 batch wording 规范为 current queue safety 和 future-approved-task wording。
- 验证: 运行 stale phase search、safety-boundary search、`git diff --check` 和 `git status --short`。
- 后续: none。

### 2026-06-04 - 更新 Cleanup Governance

- 背景: aggressive cleanup 改变了 documentation retention policy。
- 现象: previous guidance 允许 historical docs 留在 archive，即使它们不再有 unique audit value。
- 范围: `AGENTS.md`、当时 current 的 `struct.md`、`summary.md` 和 `debug.md`。
- 调查: 对比 approved cleanup boundary、current documentation maintenance rules 和 source priority。
- 修复: 记录 ADR protection，以及 useful facts 进入 current docs 后删除 low-value completed plans 或 stale phase notes 的规则。
- 验证: 运行 governance wording search、source-priority check、`git diff --check` 和 `git status --short`。
- 后续: none。

### 2026-06-04 - 激进文档清理验证

- 背景: 在 `docs/aggressive-documentation-cleanup` worktree 中删除 low-value historical docs、duplicate phase planning files、old progress rollups 和 merged cleanup worktree 后的 final validation。
- 现象: repository documentation 在第一轮 cleanup 后仍保留 stale phase artifacts、completed workflow documents 和 old archive/progress paths。
- 范围: 当时 active root docs、`docs/archive`、`docs/superpowers`、historical `docs/progress`、retained operational docs、ADRs 和 local worktrees。
- 调查: 写入这些 final notes 前，运行 structural checks、deleted-path checks、stale phase wording checks、safety-boundary checks 和 git status checks。
- 修复: 保留 current fact sources 和 ADRs，删除 low-value historical files，把 archive/progress child directories 缩减为 README policy files，并记录 cleanup policy 与 final validation result。
- 验证: `git status --short --branch` initially showed clean `## docs/aggressive-documentation-cleanup`; `git diff --check` passed with no output; `git worktree list` showed the main worktree and this aggressive cleanup worktree only, with no `.worktrees/docs-current-architecture-cleanup`; active Superpowers contained only the current aggressive cleanup spec/plan and README files; `docs/archive` contained only `docs/archive/README.md`; historical `docs/progress` contained only `docs/progress/README.md`; `test -d docs/adr` exited 0. Deleted-path search matched cleanup history or commands in the debug record and the active aggressive cleanup plan/spec only. Stale phase wording search still matched current repository check labels, retained operational feature labels, current progress/history labels, ADR history, summary/debug cleanup records, and active aggressive cleanup plan/spec verification text, but did not show retained operational docs treating deleted phase documents as current instructions. Safety-boundary search found active `realNetworkCall: false`, default-safe, gated real, injected runner, injected transport, and no-external-call guidance across `AGENTS.md`, `README.md`, `docs/architecture/structure.md`, `summary.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, `docs/runtime/queue-runtime.md`, provider docs, worker docs, and cleanup records.
- 后续: none。

### 2026-06-04 - 修正文档迁移链接

- 背景: documentation map migration 把 root 和 flat docs 移入 topic directories 后的 Task 6。
- 现象: 保留的 README files、operation standards、debug history 和 cleanup workflow docs 仍包含 old paths，可能被误认为 current entrypoints。
- 范围: archive 和 Superpowers README files、development standards、debug records、aggressive cleanup plan/spec、vision plan historical note 和 summary。
- 调查: 运行 required old-path 和 root-fact-source scans，然后区分 current guidance、historical old paths 和 command examples。
- 修复: 更新 current guidance 到 `docs/architecture/structure.md`、`docs/debug/debug.md`、`docs/status/progress.md`、`docs/api/orchestrator-api.md`、`docs/security/safety.md`、`docs/runtime/queue-runtime.md` 和 `docs/integrations/overview.md`；把保留的 old paths 标为 historical notes。
- 验证: old-path scan output 仅限于包含 legacy basenames 的 current new paths、migration mappings、historical cleanup commands/records、vision historical prompt text 和 ADR history；root wording scan 只有 then-root history 或 documentation-map plan headings；`git diff --check` passed with no output；git status showed only Task 6 Markdown edits。
- 后续: none。

### 2026-06-04 - 文档地图和结构验证

- 背景: 移动 global Markdown 到 topic directories，并保留 `README.md`、`AGENTS.md` 和 `summary.md` 为 root entrypoints 后的 final validation。
- 现象: root 和 `docs/` Markdown paths 过于扁平，不利于用户导航，也让 `summary.md` 作为 document map 不完整。
- 范围: root Markdown files、global `docs/` files、code-adjacent README files、Mission/project context files、Superpowers workflow files、structure checks 和 current path references。
- 调查: 运行 structure checks、Markdown inventory、old-path scans、safety-boundary scans、Prisma generation 和 full project checks。
- 修复: 将 global docs 移入 topic directories，保留 code-adjacent/generated context docs，重写 user-facing entry docs 为中文，更新 `summary.md` document map，强化 `AGENTS.md` documentation maintenance rules，并把 historical old paths 标为 non-current。
- 验证: `git status --short --branch` showed clean `## docs/documentation-map-and-structure`; `git diff --check` passed with no output; `node scripts/check-phase1-structure.mjs` passed and validated 40 files plus 26 directories; Markdown inventory with `artifacts/` and `workspaces/` pruned showed root Markdown limited to `./AGENTS.md`, `./README.md`, and `./summary.md`, with global docs under topic directories and local docs beside apps/packages/workers/missions/projects. Old current-path scan still matched current new paths containing legacy basenames, migration maps, historical command examples, debug history, ADR references to early `plan.md`, and `docs/vision/plan.md` historical prompt text; no active current guidance pointed to old moved paths. Safety-boundary scan found active `realNetworkCall: false`, default-safe, gated real, injected runner, injected transport, do-not-execute-Codex, and no-external-call guidance across `AGENTS.md`, `README.md`, `summary.md`, architecture, security, runtime, integration, worker, operation, status, and debug docs. `pnpm db:generate` generated Prisma Client v6.19.3 successfully. `pnpm check` passed: typecheck completed 17/17 packages, script tests passed 21/21, and workspace tests completed 17/17 packages.
- 后续: 每次 Markdown 文件新增、移动、改名或删除时，继续同步维护 `summary.md` document map。


### 2026-06-04 - 主要事实源文档中文化

- 背景: final reviewer 阻塞反馈指出主要当前事实源文档仍以英文为主，不满足用户入口中文主导要求。
- 现象: `docs/architecture/structure.md`、`docs/status/progress.md` 和 `docs/debug/debug.md` 的关键章节与解释性文字仍保留大量英文。
- 范围: `docs/architecture/structure.md`、`docs/status/progress.md`、`docs/debug/debug.md` 和 `summary.md`。
- 调查: 核对三份事实源当前内容，确认路径、包名、状态值、env、字段名、命令和 `realNetworkCall: false` 等 literal 需要保留，同时用户可读解释应改为中文主导。
- 修复: 将三份主要事实源改为中文主导，并在 `summary.md` 记录该 reviewer 发现已处理；没有修改代码、移动文件、启用真实外部调用或写入 secret。
- 验证: `git status --short --branch` 显示工作区干净；`git diff --check af4e137e2441a58caac624ee367e69476d030f44..HEAD` 无输出；`node scripts/check-phase1-structure.mjs` 通过并验证 40 files 和 26 directories；旧英文章节标题搜索无输出；root Markdown 仍只有 `./AGENTS.md`、`./README.md` 和 `./summary.md`；docs Markdown 仍位于主题目录；旧路径扫描只剩 current new paths、迁移映射、历史命令、debug 历史、ADR 早期 `plan.md` 引用和已标注的 vision 历史文本；安全边界搜索仍找到 `realNetworkCall: false`、default-safe、gated real、injected runner/transport、默认不执行和不调用外部服务等说明；`pnpm db:generate` 成功生成 Prisma Client v6.19.3；`pnpm check` 通过，typecheck 17/17，scripts tests 21/21，workspace tests 17/17 packages。
- 后续: none。

### 2026-06-04 - 回退 B2 readiness/blocker 合同收敛

- 背景: 用户要求先回退 B2。采用非破坏性 `git revert --no-commit` 反向回退 B2 顶部四个提交，而不是使用 `reset --hard`。
- 范围: 回退 `规划就绪合同收敛`、`收敛就绪阻塞合同`、`更新就绪阻塞展示` 和 `记录就绪合同收敛`。删除 B2 计划文件，并同步移除 `summary.md` 文档地图中的 B2 计划条目。
- 结果: Mission summary readiness 恢复为 B1 后状态，仍以原 `safeToRun` readiness surface 表达；事实源恢复为下一步执行 B2，再执行 B3 和 A1，不再声称 B2 已完成。
- 安全边界: 回退没有启用 Codex、Playwright、provider network、push、PR、deploy、monitor 或 Plane sync。
- 验证: `pnpm --filter @psf/orchestrator-api test` 通过 85 tests；`pnpm --filter @psf/orchestrator-api typecheck` 通过；`pnpm --filter @psf/hub test` 通过 35 tests；`pnpm --filter @psf/hub typecheck` 通过；`node scripts/check-phase1-structure.mjs` 通过并验证 40 files 和 26 directories；`git diff --cached --check` 无输出。
- 后续: 若重新执行 B2，需要先重新确认 contract 范围，并重新创建/登记实施计划。
