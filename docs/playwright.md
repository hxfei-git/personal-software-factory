# Playwright

Playwright is the stable regression layer for Personal Software Factory QA. In this batch it is optional and skipped by default.

## Optional Smoke Command

```bash
pnpm test:e2e:smoke
```

The command exits successfully without a browser when no URL is configured. To enable real browser execution in a later environment, provide all of these values:

```bash
QA_TEST_URL=http://127.0.0.1:8000
ENABLE_REAL_PLAYWRIGHT=1
pnpm test:e2e:smoke
```

`QA_TEST_URL` takes precedence over `STAGING_URL`.

## Artifacts

Screenshots, traces, and HTML reports are large or binary artifacts. Store them path-only in the database and keep files under `artifacts/` or `missions/<mission-id>/artifacts/`. Do not inline them into PostgreSQL.


## Deterministic Runner

The QA worker exposes `runDeterministicPlaywrightQa` for deterministic QA records. It is safe for normal unit tests because it does not import or launch Playwright by default.

Gates:

- `targetUrl`, `QA_TEST_URL`, or `STAGING_URL` must be present.
- `ENABLE_REAL_PLAYWRIGHT=1` is required for the built-in real browser path.
- Tests can pass an injected `execute` function to simulate pass/fail fixture runs without browser binaries.

No URL returns a blocked/manual-action result and exits through normal test assertions without failing the test process. A failing deterministic assertion creates `bugs.json` and a schema-valid `BugReport` with reproduction steps, expected result, actual result, and redacted evidence.

The optional smoke command remains:

```bash
pnpm test:e2e:smoke
```

It exits successfully when no URL is configured, when `@playwright/test` is not installed, or when `ENABLE_REAL_PLAYWRIGHT` is not `1`.
