# Safety

Current default real capabilities are disabled: Codex execution, GitHub push/PR/Issue, Coolify deploy, Uptime Kuma monitor creation, Plane issue creation, production deployment.

## Dry-Run Boundary

Phase 16A/16B/17A is local dry-run only. Demo workflow and integration outputs must keep:

- `dryRun: true`
- `realCodexExecuted: false`
- `realExternalCall: false`
- `realPush: false`
- `realDeploy: false`
- integration `realNetworkCall: false`

Do not treat the current CLI, API, or Hub surfaces as real Codex automation, PR creation, deployment, monitoring, or Plane sync.

## Verify Dry-Run Mode

```bash
pnpm psf doctor
pnpm psf integrations:status
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
```

Review the output for disabled real-action fields. Integration status may report `realEnabled: true` when an `ENABLE_REAL_*` variable is set, but current adapters must still report `realNetworkCall: false`.

## Secrets

Do not place real provider credentials in prompts, logs, artifacts, Hub UI, API responses, PR bodies, Issue bodies, or dry-run outputs. `.env.example` must remain placeholder-only. `VITE_PSF_API_TOKEN` is browser-visible and must only contain a local throwaway token.

## Reset Safety

`pnpm psf demo:reset` previews by default. It deletes only scoped demo data when `DEMO_RESET_CONFIRM=1`, and it refuses non-demo Mission IDs. Use `--skip-db` when local PostgreSQL is unavailable or when only file cleanup is intended.

## Phase 17B Queue Safety

The queue layer is an execution boundary, not permission to run real work. Phase 17B Worker Runner consumes only whitelisted dry-run/mock jobs. It does not execute Codex, run arbitrary commands, push, create PRs, deploy, create monitors, create Plane issues, or call provider APIs.

Queue payloads must not contain token, password, secret, API key, authorization, credential, session, JWT, or bearer values. Runtime and API responses redact secret-like values before returning errors.

Cancel and retry are scoped to a single queue wrapper WorkerRun. There is no API or CLI command to clear every queue job or perform destructive queue maintenance.
