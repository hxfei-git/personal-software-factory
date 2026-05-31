# Worker Permissions

## Current Phase 16A/16B/17A Permissions

Current workers and demo actions are dry-run surfaces. They may generate local artifacts under `missions/` and, when the database is available, upsert local demo records for the fixed `ai-novelist` demo Mission.

They must not execute real Codex, run unmanaged shell commands from the Hub, push to GitHub, create PRs or Issues, deploy through Coolify, create Uptime Kuma monitors, create Plane issues, delete non-demo data, or expose secrets.

## CLI

The CLI may run local commands such as:

- `pnpm psf doctor`
- `pnpm psf demo:seed`
- `pnpm psf demo:ai-novelist --with-sample-bug`
- `pnpm psf demo:report --with-sample-bug`
- `pnpm psf integrations:status`
- `pnpm psf integrations:dry-run github`

Demo commands can sync local PostgreSQL unless `--skip-db` or `PSF_SKIP_DB=1` is used.

## API

The Orchestrator API owns protected dry-run action entrypoints. It may persist local demo records and return action metadata, but every action response must keep real execution fields disabled.

Mission-scoped dry-run actions are limited to `mission-0001-ai-novelist-chapter-review` in this batch.

## Hub

Hub Web is a control surface. It may call protected Orchestrator API endpoints and refresh read views. It must not run shell commands, access the filesystem, connect to providers, or reset demo data.

## Future Real Workers

Real worker permissions require a later explicit task and approval. Before enabling them, add reviewed command allowlists, workspace path guards, state-event auditing, redaction tests, approval gates, and rollback guidance.
