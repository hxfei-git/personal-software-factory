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
