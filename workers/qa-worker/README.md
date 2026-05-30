# QA Worker

`@psf/qa-worker` generates deterministic QA dry-run artifacts for Personal Software Factory. It reads Project Passport, QA Charter, and Mission files, then emits `qa-report.md`, `bugs.json`, `qa-summary.json`, and `generated-regression.spec.ts` records without opening a browser.

The optional Playwright path is skipped unless a later command provides `QA_TEST_URL` or `STAGING_URL`. Normal `pnpm test` does not require browser binaries.
