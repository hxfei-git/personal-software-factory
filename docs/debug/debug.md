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
