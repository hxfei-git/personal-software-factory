# Documentation Map And Structure Design

## Status

Approved for planning.

## Goal

将仓库文档收敛成更容易阅读和维护的结构：

- 根目录只保留少量入口文档。
- 大多数全局文档统一放入 `docs/` 并按主题分目录。
- `summary.md` 保留在根目录，作为用户可一次性查看当前状态、问题、待改进项和全部 Markdown 文档地图的中文总览。
- 主要给用户阅读的入口文档改为中文；工程局部 README、API 合同、prompt 模板和生成物不强制一次性中文化。
- `AGENTS.md` 强化文档维护规则，要求每次修改文件或架构时同步更新对应文档，或明确说明无需更新。

## Root Entry Documents

根目录保留三个 Markdown 入口：

- `README.md`: 项目入口、快速启动、常用命令、核心文档导航。
- `AGENTS.md`: Codex/agent 执行规则、当前安全边界、文档维护纪律。
- `summary.md`: 用户中文总览，包含当前状态、问题、待改进项、文档地图和维护说明。

根目录不再保留以下全局说明文档：

- `struct.md` 迁移为 `docs/architecture/structure.md`。
- `debug.md` 迁移为 `docs/debug/debug.md`。
- `plan.md` 迁移为 `docs/vision/plan.md`。

## Docs Directory Structure

全局文档按主题放入 `docs/` 子目录：

- `docs/architecture/`: 当前架构、模块边界、数据流、状态机、系统结构说明。
- `docs/status/`: 当前进度、下一步、状态类记录。
- `docs/debug/`: 调试记录、失败检查、验证记录、排障入口。
- `docs/api/`: Orchestrator API、认证、schema 等 API 合同。
- `docs/security/`: 安全边界、审批策略、worker 权限。
- `docs/runtime/`: 队列运行时、WorkerRun、worker runtime、存储和本地运行边界。
- `docs/operations/`: 本地启动、健康检查、故障排查、运维流程。
- `docs/integrations/`: GitHub、Coolify、Uptime Kuma、Plane 和共享集成边界。
- `docs/workers/`: Codex Worker、QA Worker、auto-fix loop、Playwright 相关 worker 文档。
- `docs/projects/`: Project Registry、Project Passport、Mission Planner 等项目接入文档。
- `docs/templates/` 或既有 `docs/prompts/`: prompt 和报告模板。
- `docs/adr/`: ADR 决策历史，保持原目录不动。
- `docs/archive/`: 仅保留有审计价值的归档入口和未来明确保留材料。
- `docs/superpowers/`: 当前 Superpowers spec/plan 文档先保持不动，避免打散既有工作流路径约定。

实施计划可根据实际文件数量微调目录名，但必须保持“一个文件只属于一个清晰主题目录”的原则。

## Files Kept Near Code Or Generated Context

以下 Markdown 暂不强制迁入 `docs/`：

- `apps/**/README.md`
- `packages/**/README.md`
- `workers/**/README.md`
- `missions/**.md`
- `projects/**.md`
- `packages/prompts/**.md`

原因：

- apps/packages/workers README 是代码目录就近说明，搬离会降低维护性。
- missions/projects 文件是样例或生成上下文，和对应数据目录绑定。
- prompt 文件是运行输入模板，不是全局阅读入口。

这些文件仍必须出现在 `summary.md` 的文档地图中，用一句中文说明用途和维护责任。

## Summary Document Map

`summary.md` 保留在根目录，并新增中文“文档地图”部分。

文档地图采用分层结构：

- 先列出用户入口和事实源优先级。
- 再按目录/主题列出所有 Markdown 文件。
- 每个文件只写一句话说明用途。
- 标记哪些文档是用户主要阅读入口，哪些是 agent/工程文档，哪些是样例/生成物/模板。
- 不在 `summary.md` 中复制各文档的详细内容，避免双重维护。

成功标准：

- 用户打开 `summary.md` 可以知道当前有哪些 Markdown、各自做什么、应该先看哪个。
- 新增、移动、删除 Markdown 时，文档地图必须同步更新。

## Chinese Documentation Scope

主要给用户阅读的文档使用中文编辑：

- `README.md`
- `summary.md`
- `docs/architecture/structure.md`
- `docs/debug/debug.md`
- `docs/status/progress.md`
- `docs/status/next-steps.md`
- `docs/README.md`

可暂时保留英文或双语的文档：

- apps/packages/workers 目录内 README。
- API 合同、provider 合同和 prompt 模板。
- mission 生成物和 project 样例上下文。
- ADR 标题和结构。

技术命令、环境变量、路由、包名、文件路径和代码标识保持原文，不强行翻译。

## AGENTS Maintenance Rules

`AGENTS.md` 需要强化以下规则：

- 每次新增、移动、删除 Markdown 文件，必须更新 `summary.md` 的文档地图。
- 每次修改架构、模块边界、数据流、状态机、worker contract、集成 gate 或安全边界，必须更新 `docs/architecture/structure.md`。
- 每次新增、解决或发现当前问题、风险、技术债、状态变化或改进项，必须更新 `summary.md`。
- 每次发生调试、失败检查、异常行为、手动操作输出、验证结果、排障发现、队列/runtime 问题，必须更新 `docs/debug/debug.md`。
- 如果某次修改不需要更新上述文档，最终回复和 commit body 必须明确说明原因。
- 禁止把 token、password、secret、API key、authorization、cookie、credential、session、JWT、bearer 等值写入任何文档。

旧路径引用需要同步替换：

- `struct.md` -> `docs/architecture/structure.md`
- `debug.md` -> `docs/debug/debug.md`
- `plan.md` -> `docs/vision/plan.md`
- `docs/progress.md` -> `docs/status/progress.md`
- `docs/next-steps.md` -> `docs/status/next-steps.md`

`summary.md` 保持根目录路径不变。

## Link And Reference Updates

实施时必须更新以下范围内的 Markdown 链接和路径引用：

- `AGENTS.md`
- `README.md`
- `summary.md`
- `docs/README.md`
- `docs/progress/README.md`
- 迁移后的架构、状态、debug 文档
- 当前 Superpowers spec/plan 中仍然作为历史记录出现的路径，保留时需说明是历史记录，不作为当前事实源。
- 结构检查脚本和其他检查脚本中的文档路径。

允许历史记录保留旧路径文字，但必须避免把旧路径写成当前可用入口。

## Verification Requirements

实施完成后至少运行：

```bash
git status --short --branch
git diff --check
node scripts/check-phase1-structure.mjs
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './artifacts' -prune -o -path './workspaces' -prune -o -name '*.md' -type f -print | sort
rg -n '\b(struct\.md|debug\.md|plan\.md|docs/progress\.md|docs/next-steps\.md)\b' . --glob '*.md' --glob '!node_modules/**' --glob '!artifacts/**' --glob '!workspaces/**'
```

Expected:

- 工作区只包含本任务变更。
- `git diff --check` 无输出。
- 结构检查通过。
- Markdown 文件清单与 `summary.md` 文档地图一致。
- 旧路径只出现在明确历史记录或迁移说明中，不作为当前入口。
- `README.md`、`summary.md`、`docs/README.md` 和用户入口文档是中文主导。

如果迁移影响 package tests 或脚本行为，再运行 `pnpm check`。

## Non-Goals

- 不改运行时代码行为。
- 不启用真实 Codex、Playwright、GitHub、Coolify、Uptime Kuma、Plane 或外部网络调用。
- 不删除 ADR。
- 不把所有局部 README 一次性迁出代码目录。
- 不把所有工程文档一次性完整中文化。
- 不重写 mission 生成物内容，除非路径迁移需要更新引用。

## Success Criteria

- 根目录 Markdown 收敛为 `README.md`、`AGENTS.md`、`summary.md`。
- 全局文档迁入清晰的 `docs/` 主题目录。
- `summary.md` 提供中文文档地图，覆盖当前所有 Markdown 文件或明确说明就近文档类别。
- 用户主要阅读入口中文化。
- `AGENTS.md` 明确要求每次文件或架构修改都同步维护对应文档。
- 所有当前链接和路径引用可用，历史路径不会被误读为当前事实源。
