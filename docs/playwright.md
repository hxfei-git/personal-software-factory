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
