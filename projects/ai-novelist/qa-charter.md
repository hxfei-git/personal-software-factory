# QA Charter - AI 小说助手

## Real Loop Readiness

The charter defines the expected QA surface for a future real loop. It does not claim the commands, URLs, selectors, or UI behavior were verified in this repository.

- Entry target: use `project.passport.yaml` `urls.local` or `urls.staging` only after the matching dev/staging command is manually verified.
- Smoke expectation: confirm the app loads, primary navigation is reachable, and no startup/runtime error is shown before deeper flow checks.
- E2E expectation: cover the normal paths below with deterministic assertions discovered from the real app. Do not hardcode guessed selectors.
- Manual fallback: if the repo, server, data setup, AI provider, or command is unavailable, record a manual-action report instead of fabricating pass/fail evidence.

## Normal Paths

1. 打开首页
2. 新建小说项目
3. 输入小说题材和基础设定
4. 生成世界观
5. 生成大纲
6. 生成章节
7. 自动审稿
8. 查看审稿报告
9. 按审稿报告修复章节
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
11. AI provider credentials missing or invalid
12. Export attempted while generation or repair is still running

## Evidence Expectations

Every QA bug must include reproduction steps, expected result, actual result, and evidence. Screenshots, traces, logs, and generated reports must avoid secrets and user manuscript content unless the user explicitly approves including sanitized excerpts.
