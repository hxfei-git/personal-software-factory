# QA Worker

The QA Worker MVP is a deterministic dry-run generator. It validates that the Personal Software Factory QA loop can produce evidence, structured bugs, artifacts, and records before a real staging browser exists.

## Inputs

- Mission ID and Project ID.
- Project Passport from `projects/<project-id>/project.passport.yaml`.
- `qa-charter.md`.
- Mission files under `missions/<mission-id>/`: `mission.md` and `acceptance.md`.
- Optional `--with-sample-bug`.

## Outputs

Generated under `missions/<mission-id>/`:

- `qa-report.md`
- `bugs.json`
- `qa-summary.json`
- `generated-regression.spec.ts`
- `artifacts/screenshots/.gitkeep`
- `artifacts/traces/.gitkeep`
- `artifacts/logs/.gitkeep`

Generated records:

- `WorkerRun` with `worker_type=qa` and `mode=dry-run`.
- `QARun` with `status=passed` or `failed`.
- `Artifact` records for report, JSON, summary, regression template, and path-only QA directories.
- `BugReport` records when sample bugs are requested.
- `MissionEvent` records for QA start, artifact creation, bug creation, and completion.

## Commands

```bash
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Use `PSF_SKIP_DB=1` for artifact-only local runs.


## Deterministic Playwright QA

`runDeterministicPlaywrightQa` adds a deterministic QA runner for controlled Playwright checks while keeping normal package tests browser-free. It returns structured `WorkerRun`, `QARun`, `Artifact`, `BugReport`, and `MissionEvent` records without requiring a live target during unit tests.

Inputs:

- `missionId` and `projectId`.
- Optional `targetUrl`; otherwise `QA_TEST_URL` then `STAGING_URL` are checked.
- Optional injected `execute` runner for tests and dry local fixtures.
- Optional `env` map for deterministic tests.

Behavior:

- If no target URL exists, the result is `status=blocked`, `manualActionRequired=true`, `browserOpened=false`, and the `QARun` is `status=skipped`.
- If a target URL exists but `ENABLE_REAL_PLAYWRIGHT` is not `1`, the real browser path remains blocked unless an injected runner is supplied.
- Injected runners are used by unit tests and do not open browsers unless the injected implementation explicitly reports that it did.
- Real Playwright is dynamically imported only when `ENABLE_REAL_PLAYWRIGHT=1`, a target URL is present, and no injected runner is supplied.

Outputs:

- `qa-report.md`.
- `bugs.json`.
- `qa-summary.json`.
- Canonical artifact records under `artifacts/missions/<mission-id>/<worker-run-id>/` using artifact-store path policy.
- Failing assertions become schema-valid `BugReport` records with reproduction steps, expected result, actual result, and redacted evidence.

Secrets in logs, summaries, evidence, and artifact content are redacted with `@psf/security` before records are returned.

## Boundary

Dry-run mode does not open a browser, visit staging, clone ai-novelist, execute project commands, call external services, or modify production. Deterministic Playwright mode follows the same no-network default unless a target URL and `ENABLE_REAL_PLAYWRIGHT=1` are explicitly provided, or a test supplies an injected runner.
