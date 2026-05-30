# Codex Mission Prompt

## Mission Context
- Mission ID: mission-0001-ai-novelist-chapter-review
- Project ID: ai-novelist
- Required branch: psf/mission-0001-ai-novelist-chapter-review
- Current branch: dry-run/no-worktree
- Repository: https://github.com/hxfei-git/ai-novelist.git
- Default branch: main

## Required Instructions
1. Read mission.md.
2. Read acceptance.md.
3. Read technical-notes.md.
4. Read risk-notes.md.
5. Read project AGENTS.md.
6. Do not modify main/master.
7. Create independent branch psf/mission-0001-ai-novelist-chapter-review.
8. Implement requirement.
9. Run project-required tests: . .venv/bin/activate && pytest -q.
10. Generate dev-summary.md.
11. Do not directly publish production.
12. Do not push remote unless explicitly authorized.

## Project Passport
```json
{
  "id": "ai-novelist",
  "name": "AI 小说助手",
  "description": "Web AI writing assistant for creating, reviewing, repairing and exporting novels. Commands are conservative local defaults and require manual verification before real worker execution.",
  "repo": {
    "url": "https://github.com/hxfei-git/ai-novelist.git",
    "default_branch": "main"
  },
  "runtime": {
    "kind": "web",
    "backend": {
      "language": "python",
      "framework": "manual-verification-required"
    },
    "frontend": {
      "language": "typescript",
      "framework": "manual-verification-required"
    }
  },
  "commands": {
    "install": [
      "python -m venv .venv",
      ". .venv/bin/activate && pip install -e .",
      "npm --prefix web/frontend install"
    ],
    "test": [
      ". .venv/bin/activate && pytest -q"
    ],
    "build": [
      "npm --prefix web/frontend run build"
    ],
    "run_staging": [
      ". .venv/bin/activate && ai-novelist web --host 127.0.0.1 --port 8000"
    ]
  },
  "urls": {
    "production": "",
    "staging": ""
  },
  "quality_gates": {
    "require_build": true,
    "require_unit_tests": true,
    "require_e2e_tests": true,
    "require_ai_qa": true,
    "require_pr_review": true,
    "require_human_production_approval": true
  },
  "core_flows": [
    {
      "id": "open_home",
      "name": "打开首页",
      "priority": "P0"
    },
    {
      "id": "create_novel_project",
      "name": "新建小说项目",
      "priority": "P0"
    },
    {
      "id": "generate_worldview",
      "name": "生成世界观",
      "priority": "P0"
    },
    {
      "id": "generate_outline",
      "name": "生成大纲",
      "priority": "P0"
    },
    {
      "id": "generate_chapter",
      "name": "生成章节",
      "priority": "P0"
    },
    {
      "id": "review_chapter",
      "name": "自动审稿",
      "priority": "P0"
    },
    {
      "id": "repair_chapter",
      "name": "修复章节",
      "priority": "P0"
    },
    {
      "id": "export_novel",
      "name": "导出小说",
      "priority": "P1"
    }
  ]
}
```

## Project AGENTS.md
```markdown
# AGENTS.md - AI 小说助手

## Project Goal

AI 小说助手用于创建小说项目、生成世界观、生成大纲、生成章节、自动审稿、按审稿报告修复章节并导出小说。

## Development Rules

- Do not delete user writing data.
- Do not bypass the review step after chapter generation.
- Do not hide backend or AI provider failures from the user.
- Do not push remote branches without explicit approval.
- Keep changes on non-main branches.

## Required Checks

- Run the project passport test command before reporting success.
- Run the project passport build command before review when build is available.
- Add or update E2E coverage for critical user flows when the real project is available.

```

## mission.md
```markdown
# Mission Plan

## Mission 标题
增加章节审稿和自动修复流程

## 背景
项目 AI 小说助手 (ai-novelist) 收到需求：增加章节审稿和自动修复流程

## 目标
- 将用户需求拆解为可交付、可验收、可测试的开发任务。
- 保持任务 mission-0001-ai-novelist-chapter-review 的范围清晰，优先级为 P2。

## 用户故事
- 作为项目用户，我希望增加章节审稿和自动修复流程，以便获得更完整和可验证的产品能力。

## 范围
- 依据 Project Passport、QA Charter 和用户需求生成实现指导。
- 产出 mission、acceptance、technical notes 和 risk notes 四份规划文档。

## 非目标
- 不调用 LLM 或外部服务。
- 不修改 API、数据库、Worker 执行逻辑或 Hub UI。
- 不执行生产部署或真实业务变更。

## 验收标准
- 规划文档覆盖任务背景、目标、范围、测试、交付物和风险。
- 验收文档覆盖功能、交互、错误处理、数据一致性、回归、安全和人工审批。
- 技术说明列出相关命令、核心流程、推荐修改区域和测试策略。

## 必须运行的测试
- `. .venv/bin/activate && pytest -q`

## 禁止事项
- 禁止泄露、记录或提交任何 secret。
- 禁止直接推送 main 分支。
- 禁止在未获批准时部署生产或删除用户数据。

## 预期交付物
- 可审阅的代码变更。
- 本地测试结果。
- 相关文档更新。
- 如进入后续阶段，提交 GitHub PR 等待人工审阅。

## 风险点
- 需求可能影响核心流程，需要在实现前确认范围边界。
- QA Charter 中的关键路径必须在后续 QA 阶段覆盖。
- 任何部署、数据迁移或外部成本风险都需要人工审批。

```

## acceptance.md
```markdown
# Acceptance Plan

## 功能验收
- 用户需求“增加章节审稿和自动修复流程”对应的核心功能可以被人工或自动化步骤验证。
- 所有声明完成的行为都有明确的期望结果。

## 交互验收
- 涉及 UI 或命令行交互时，主要路径、取消路径和重复提交路径均可预期。
- 文案和状态反馈不会误导用户。

## 错误处理验收
- 失败场景返回可理解的错误信息。
- 重试、回滚或人工处理路径被清楚记录。

## 数据一致性验收
- 任务不破坏既有数据结构和持久化约定。
- 状态变化在后续集成阶段必须可审计。

## 回归测试验收
- 运行 Project Passport 中声明的测试命令。
- 覆盖 QA Charter 中列出的关键路径。

## 安全验收
- 不打印、不持久化、不提交 secret。
- 涉及权限、外部服务或生产数据时必须进入人工审批。

## 人工审批点
- 生产部署。
- 数据库迁移。
- Secret 变更。
- 破坏性操作。
- 外部成本或安全风险。

```

## technical-notes.md
```markdown
# Technical Notes

## 相关项目命令
- install: `python -m venv .venv`, `. .venv/bin/activate && pip install -e .`, `npm --prefix web/frontend install`
- test: `. .venv/bin/activate && pytest -q`
- build: `npm --prefix web/frontend run build`
- run_staging: `. .venv/bin/activate && ai-novelist web --host 127.0.0.1 --port 8000`

## 相关核心流程
- 打开首页 (open_home, P0)
- 新建小说项目 (create_novel_project, P0)
- 生成世界观 (generate_worldview, P0)
- 生成大纲 (generate_outline, P0)
- 生成章节 (generate_chapter, P0)
- 自动审稿 (review_chapter, P0)
- 修复章节 (repair_chapter, P0)
- 导出小说 (export_novel, P1)

## 推荐修改区域
- 根据需求优先定位现有业务模块、测试目录和文档。
- 保持 Mission Planner 输出为本地 artifact，不接入 API 或 Worker 执行。

## 推荐测试策略
- 优先运行与变更面最接近的单元或集成测试。
- 再运行 Project Passport 声明的关键测试命令。
- QA Charter:
  # QA Charter - AI 小说助手
  
  ## Normal Paths
  
  1. 打开首页
  2. 新建小说项目
  3. 输入小说题材
  4. 生成世界观
  5. 生成大纲
  6. 生成章节
  7. 自动审稿
  8. 查看审稿报告
  9. 修复章节
  10. 导出小说
  
  ## Abnormal Paths
  
  1. 空输入提交
  2. 超长输入提交
  3. 连续点击生成按钮
  4. 生成过程中刷新页面
  5. 生成过程中后退
  6. 多标签页同时操作
  7. API 失败
  8. 审稿失败
  9. 修复失败
  10. 导出前跳过审稿
  

```

## risk-notes.md
```markdown
# Risk Notes

## 技术风险
- 需求可能跨越多个模块，需要避免扩大实现范围。
- 后续 API 集成必须保持规划包可替换为 LLM-backed planner。

## 数据风险
- CLI dry-run 阶段会同步 Project、Mission、WorkerRun、Artifact 和 MissionEvent 到 Prisma；不会执行生产业务写入或外部服务。
- 后续阶段如涉及状态变更，必须生成 MissionEvent 并保留审计线索。

## AI 输出风险
- 当前实现不调用 LLM，输出来自确定性模板。
- 后续接入 LLM 时必须保留结构化校验和人工审阅点。

## 部署风险
- 当前任务不部署。
- 生产部署必须显式人工批准。

## 需要人工确认的风险
- 需求边界：增加章节审稿和自动修复流程
- 是否涉及生产数据、外部付费服务、secret 或破坏性操作。

```
