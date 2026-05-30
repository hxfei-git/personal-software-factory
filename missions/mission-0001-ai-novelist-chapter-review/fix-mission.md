# Fix Mission

## Mission
mission-0001-ai-novelist-chapter-review

## Goal
Fix the QA-reported bugs without changing production, pushing remote branches, or bypassing review.

## Bugs
### Bug 1: 连续点击生成按钮会重复提交
- ID: bug-mission-0001-ai-novelist-chapter-review-sample-duplicate-generate
- Severity: P1
- Status: open
- Expected: 生成按钮进入 pending 状态且只提交一次生成请求。
- Actual: dry-run 示例 Bug：连续点击可能导致重复提交，需要真实页面验证。
- Reproduction steps:
  - 打开首页
  - 新建小说项目
  - 输入小说题材
  - 连续点击生成按钮
- Suggested direction: 优先检查生成按钮的 disabled 状态、请求幂等键和失败恢复路径。

## Required Safety
- Do not modify main/master.
- Do not push remote branches.
- Do not deploy production.
- Do not store secrets in logs, prompts, reports, or artifacts.
