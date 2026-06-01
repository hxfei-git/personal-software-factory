# AGENTS.md - AI 小说助手

## Project Goal

AI 小说助手用于创建小说项目、生成世界观、生成大纲、生成章节、自动审稿、按审稿报告修复章节并导出小说。

## Real Loop Readiness

This project passport is ready for real-loop wiring only as metadata. The real `ai-novelist` repository and its commands were not cloned, inspected, or executed from this workspace.

- Treat every passport command marked `manual-verification-required` as unverified until a human confirms it in a real checkout.
- Use `urls.local` or `urls.staging` as the expected smoke target only after the staging/dev command has been manually verified.
- Do not invent selectors, file paths, or command behavior. Add deterministic smoke/E2E details only after they are observed in the real project.
- If the repo, dependency installation, dev server, or test command is unavailable, stop and produce a manual-action report with the missing prerequisite, attempted safe check, expected next action, and owner.

## Development Rules

- Do not delete user writing data.
- Do not bypass the review step after chapter generation.
- Do not hide backend or AI provider failures from the user.
- Do not print or persist secrets, API keys, tokens, provider responses containing secrets, or user manuscript content in logs or artifacts.
- Do not push remote branches without explicit approval.
- Keep changes on non-main branches.

## Required Checks

- Run the project passport test command before reporting success only after it has been manually verified for the real checkout.
- Run the project passport build command before review when build is available and verified.
- Run the passport lint and E2E commands when available and verified.
- Smoke/E2E entry should start from the verified local or staging URL and cover the core flows in `qa-charter.md` without relying on guessed selectors.
- Add or update E2E coverage for critical user flows when the real project is available.
