import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const targetUrl = process.env.QA_TEST_URL || process.env.STAGING_URL || "";
if (!targetUrl) {
  console.log("Playwright smoke skipped: set QA_TEST_URL or STAGING_URL to run optional browser QA.");
  process.exit(0);
}

const require = createRequire(import.meta.url);
try {
  require.resolve("@playwright/test/package.json");
} catch {
  console.log("Playwright smoke skipped: @playwright/test is not installed in this local environment.");
  process.exit(0);
}

if (process.env.ENABLE_REAL_PLAYWRIGHT !== "1") {
  console.log("Playwright smoke skipped: set ENABLE_REAL_PLAYWRIGHT=1 to open a browser.");
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "playwright", "test", "tests/e2e/psf-smoke.spec.ts"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
