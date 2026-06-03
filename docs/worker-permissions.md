# Worker Permissions

## Current Worker Permissions

Current workers and guarded actions are local-first dry-run surfaces. They may generate local artifacts under `missions/` and, when the database is available, upsert local records through approved dry-run contracts.

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

The Orchestrator API owns protected dry-run and gated action entrypoints. It may persist local records and return action metadata, but default responses must keep real execution fields disabled and must not perform provider calls, pushes, deployments, or unmanaged execution.

## Hub

Hub Web is a control surface. It may call protected Orchestrator API endpoints and refresh read views. It must not run shell commands, access the filesystem, connect to providers, or reset demo data.

## Future Real Workers

Real worker permissions require a later explicit task and approval. Before enabling them, add reviewed command allowlists, workspace path guards, state-event auditing, redaction tests, approval gates, and rollback guidance.
