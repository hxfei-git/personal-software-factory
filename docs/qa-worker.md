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

## Boundary

Dry-run mode does not open a browser, visit staging, clone ai-novelist, execute project commands, call external services, or modify production.
