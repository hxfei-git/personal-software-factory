import { test, expect } from "@playwright/test";

const targetUrl = process.env.QA_TEST_URL ?? process.env.STAGING_URL ?? "";

test.skip(!targetUrl, "Set QA_TEST_URL or STAGING_URL to run optional smoke QA.");

test("target URL responds with a visible page", async ({ page }) => {
  await page.goto(targetUrl);
  await expect(page.locator("body")).toBeVisible();
});
