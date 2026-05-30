import { test, expect } from '@playwright/test';

test.describe.skip('AI 小说助手 dry-run regression template', () => {
  test('normal path: create novel and export after review', async ({ page }) => {
    await page.goto(process.env.QA_TEST_URL ?? process.env.STAGING_URL ?? 'http://127.0.0.1:8000');
    await expect(page.locator('body')).toBeVisible();
    // 打开首页
    // 新建小说项目
    // 输入小说题材
    // 生成世界观
    // 生成大纲
    // 生成章节
    // 自动审稿
    // 查看审稿报告
    // 修复章节
    // 导出小说
  });

  test('abnormal paths: validation, refresh, multi-tab, failures', async ({ page, context }) => {
    await page.goto(process.env.QA_TEST_URL ?? process.env.STAGING_URL ?? 'http://127.0.0.1:8000');
    await expect(page.locator('body')).toBeVisible();
    // 空输入提交
    // 超长输入提交
    // 连续点击生成按钮
    // 生成过程中刷新页面
    // 生成过程中后退
    // 多标签页同时操作
    // API 失败
    // 审稿失败
    // 修复失败
    // 导出前跳过审稿
    await context.newPage();
  });
});

// Generated for mission mission-0001-ai-novelist-chapter-review. Replace selectors before enabling.