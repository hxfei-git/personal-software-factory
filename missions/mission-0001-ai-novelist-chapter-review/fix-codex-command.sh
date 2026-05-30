#!/usr/bin/env sh
# DRY-RUN REVIEW ARTIFACT
# Codex was not executed by the PSF auto-fix loop.
# This file is intentionally written without executable permissions.
# Running this file exits without invoking Codex.
#
# Reviewed command, kept as comments only:
# codex exec --sandbox workspace-write --ask-for-approval on-request '# Codex Mission Prompt
#
# ## Mission Context
# - Mission ID: mission-0001-ai-novelist-chapter-review
# - Project ID: ai-novelist
# - Required branch: psf/mission-0001-ai-novelist-chapter-review
# - Current branch: dry-run/no-worktree
# - Repository: https://github.com/hxfei-git/ai-novelist.git
# - Default branch: main
#
# ## Required Instructions
# 1. Read mission.md.
# 2. Read acceptance.md.
# 3. Read technical-notes.md.
# 4. Read risk-notes.md.
# 5. Read project AGENTS.md.
# 6. Do not modify main/master.
# 7. Create independent branch psf/mission-0001-ai-novelist-chapter-review.
# 8. Implement requirement.
# 9. Run project-required tests: . .venv/bin/activate && pytest -q.
# 10. Generate dev-summary.md.
# 11. Do not directly publish production.
# 12. Do not push remote unless explicitly authorized.
#
# ## Project Passport
# ```json
# {
#   "id": "ai-novelist",
#   "name": "AI 小说助手",
#   "description": "Web AI writing assistant for creating, reviewing, repairing and exporting novels. Commands are conservative local defaults and require manual verification before real worker execution.",
#   "repo": {
#     "url": "https://github.com/hxfei-git/ai-novelist.git",
#     "default_branch": "main"
#   },
#   "runtime": {
#     "kind": "web",
#     "backend": {
#       "language": "python",
#       "framework": "manual-verification-required"
#     },
#     "frontend": {
#       "language": "typescript",
#       "framework": "manual-verification-required"
#     }
#   },
#   "commands": {
#     "install": [
#       "python -m venv .venv",
#       ". .venv/bin/activate && pip install -e .",
#       "npm --prefix web/frontend install"
#     ],
#     "test": [
#       ". .venv/bin/activate && pytest -q"
#     ],
#     "build": [
#       "npm --prefix web/frontend run build"
#     ],
#     "run_staging": [
#       ". .venv/bin/activate && ai-novelist web --host 127.0.0.1 --port 8000"
#     ]
#   },
#   "urls": {
#     "production": "",
#     "staging": ""
#   },
#   "quality_gates": {
#     "require_build": true,
#     "require_unit_tests": true,
#     "require_e2e_tests": true,
#     "require_ai_qa": true,
#     "require_pr_review": true,
#     "require_human_production_approval": true
#   },
#   "core_flows": [
#     {
#       "id": "open_home",
#       "name": "打开首页",
#       "priority": "P0"
#     },
#     {
#       "id": "create_novel_project",
#       "name": "新建小说项目",
#       "priority": "P0"
#     },
#     {
#       "id": "generate_worldview",
#       "name": "生成世界观",
#       "priority": "P0"
#     },
#     {
#       "id": "generate_outline",
#       "name": "生成大纲",
#       "priority": "P0"
#     },
#     {
#       "id": "generate_chapter",
#       "name": "生成章节",
#       "priority": "P0"
#     },
#     {
#       "id": "review_chapter",
#       "name": "自动审稿",
#       "priority": "P0"
#     },
#     {
#       "id": "repair_chapter",
#       "name": "修复章节",
#       "priority": "P0"
#     },
#     {
#       "id": "export_novel",
#       "name": "导出小说",
#       "priority": "P1"
#     }
#   ]
# }
# ```
#
# ## Project AGENTS.md
# ```markdown
# # AGENTS.md - AI 小说助手
#
# ## Project Goal
#
# AI 小说助手用于创建小说项目、生成世界观、生成大纲、生成章节、自动审稿、按审稿报告修复章节并导出小说。
#
# ## Development Rules
#
# - Do not delete user writing data.
# - Do not bypass the review step after chapter generation.
# - Do not hide backend or AI provider failures from the user.
# - Do not push remote branches without explicit approval.
# - Keep changes on non-main branches.
#
# ## Required Checks
#
# - Run the project passport test command before reporting success.
# - Run the project passport build command before review when build is available.
# - Add or update E2E coverage for critical user flows when the real project is available.
#
# ```
#
# ## mission.md
# ```markdown
# # Fix Mission
#
# ## Mission
# mission-0001-ai-novelist-chapter-review
#
# ## Goal
# Fix the QA-reported bugs without changing production, pushing remote branches, or bypassing review.
#
# ## Bugs
# ### Bug 1: 连续点击生成按钮会重复提交
# - ID: bug-mission-0001-ai-novelist-chapter-review-sample-duplicate-generate
# - Severity: P1
# - Status: open
# - Expected: 生成按钮进入 pending 状态且只提交一次生成请求。
# - Actual: dry-run 示例 Bug：连续点击可能导致重复提交，需要真实页面验证。
# - Reproduction steps:
#   - 打开首页
#   - 新建小说项目
#   - 输入小说题材
#   - 连续点击生成按钮
# - Suggested direction: 优先检查生成按钮的 disabled 状态、请求幂等键和失败恢复路径。
#
# ## Required Safety
# - Do not modify main/master.
# - Do not push remote branches.
# - Do not deploy production.
# - Do not store secrets in logs, prompts, reports, or artifacts.
#
# ```
#
# ## acceptance.md
# ```markdown
# # Fix Acceptance
#
# ## Functional Acceptance
# - Every listed Bug has a concrete code-level fix or documented reason for human review.
#
# ## Regression Acceptance
# - Add or update a regression test for bug-mission-0001-ai-novelist-chapter-review-sample-duplicate-generate: 连续点击生成按钮会重复提交
#
# ## Verification
# - Run: . .venv/bin/activate && pytest -q
#
# ## Manual Approval
# - Stop for approval before production deploy, destructive operations, secret changes, or real external service calls.
#
# ```
#
# ## technical-notes.md
# ```markdown
# # Technical Notes
#
# ## 相关项目命令
# - install: `python -m venv .venv`, `. .venv/bin/activate && pip install -e .`, `npm --prefix web/frontend install`
# - test: `. .venv/bin/activate && pytest -q`
# - build: `npm --prefix web/frontend run build`
# - run_staging: `. .venv/bin/activate && ai-novelist web --host 127.0.0.1 --port 8000`
#
# ## 相关核心流程
# - 打开首页 (open_home, P0)
# - 新建小说项目 (create_novel_project, P0)
# - 生成世界观 (generate_worldview, P0)
# - 生成大纲 (generate_outline, P0)
# - 生成章节 (generate_chapter, P0)
# - 自动审稿 (review_chapter, P0)
# - 修复章节 (repair_chapter, P0)
# - 导出小说 (export_novel, P1)
#
# ## 推荐修改区域
# - 根据需求优先定位现有业务模块、测试目录和文档。
# - 保持 Mission Planner 输出为本地 artifact，不接入 API 或 Worker 执行。
#
# ## 推荐测试策略
# - 优先运行与变更面最接近的单元或集成测试。
# - 再运行 Project Passport 声明的关键测试命令。
# - QA Charter:
#   # QA Charter - AI 小说助手
#
#   ## Normal Paths
#
#   1. 打开首页
#   2. 新建小说项目
#   3. 输入小说题材
#   4. 生成世界观
#   5. 生成大纲
#   6. 生成章节
#   7. 自动审稿
#   8. 查看审稿报告
#   9. 修复章节
#   10. 导出小说
#
#   ## Abnormal Paths
#
#   1. 空输入提交
#   2. 超长输入提交
#   3. 连续点击生成按钮
#   4. 生成过程中刷新页面
#   5. 生成过程中后退
#   6. 多标签页同时操作
#   7. API 失败
#   8. 审稿失败
#   9. 修复失败
#   10. 导出前跳过审稿
#
#
# ```
#
# ## risk-notes.md
# ```markdown
# # Risk Notes
#
# ## 技术风险
# - 需求可能跨越多个模块，需要避免扩大实现范围。
# - 后续 API 集成必须保持规划包可替换为 LLM-backed planner。
#
# ## 数据风险
# - CLI dry-run 阶段会同步 Project、Mission、WorkerRun、Artifact 和 MissionEvent 到 Prisma；不会执行生产业务写入或外部服务。
# - 后续阶段如涉及状态变更，必须生成 MissionEvent 并保留审计线索。
#
# ## AI 输出风险
# - 当前实现不调用 LLM，输出来自确定性模板。
# - 后续接入 LLM 时必须保留结构化校验和人工审阅点。
#
# ## 部署风险
# - 当前任务不部署。
# - 生产部署必须显式人工批准。
#
# ## 需要人工确认的风险
# - 需求边界：增加章节审稿和自动修复流程
# - 是否涉及生产数据、外部付费服务、secret 或破坏性操作。
#
# ```
# '
exit 1
