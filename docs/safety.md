# Safety

Current default real capabilities are disabled: Codex execution, GitHub push/PR/Issue, Coolify deploy, Uptime Kuma monitor creation, Plane issue creation, production deployment.

## Dry-Run Boundary

Phase 16A/16B/17A/18 is local dry-run/default-safe. Demo workflow, generic Mission dry-run preflight, Hub control-plane views, and integration outputs must keep:

- `dryRun: true`
- `realCodexExecuted: false`
- `realExternalCall: false`
- `realPush: false`
- `realDeploy: false`
- integration `realNetworkCall: false`

Do not treat the current CLI, API, or Hub surfaces as real Codex automation, PR creation, deployment, monitoring, or Plane sync.

Phase 18 Approval decisions are records only. Recording an approved Approval does not execute real Codex, queue real actions by itself, create PRs, deploy, create monitors, sync provider records, or bypass `PSF_ACTION_EXECUTION_MODE`, `PSF_ENABLE_REAL_*`, worker, provider, injected runner/transport, or explicit operator approval gates.

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

## Queue And Batch 03/04 Safety

The queue layer is an execution boundary, not permission to run real work. Phase 17B Worker Runner consumed only whitelisted dry-run/mock jobs. Batch 03/04 adds whitelisted gated `qa.playwright` and `codex.real` contracts, but default behavior remains manual-action or injected-runner only. Worker Runner does not execute Codex by default, run arbitrary commands, push, create PRs, deploy, create monitors, create Plane issues, or call provider APIs.

Queued `codex.real` requires a local repository mirror, an `agent/*` branch, stored approvals, workspace guards, safe commands, and an injected runner in this phase. Queued `qa.playwright` requires a target URL and a gated real Playwright path or an injected runner; missing/invalid targets and unverified selectors must be blocked/manual-action, not marked passed.

Queue payloads must not contain token, password, secret, API key, authorization, credential, session, JWT, or bearer values. Runtime and API responses redact secret-like values before returning errors.

Cancel and retry are scoped to a single queue wrapper WorkerRun. There is no API or CLI command to clear every queue job or perform destructive queue maintenance.

## Shared Safety Package

`@psf/security` centralizes the safety checks that later real-execution batches must call before writing prompts, logs, artifacts, API responses, Hub payloads, or worker outputs. It currently provides:

- `redactText`, `redactJson`, and `assertNoSecrets` for secret-like keys and explicit secret values.
- `evaluateCommandPolicy` and `assertCommandAllowed` for conservative command allow/deny checks before any worker command execution.
- `resolveSafeWorkspacePath`, `assertInsideWorkspace`, and `assertNotForbiddenPath` for workspace-scoped paths and forbidden credential/system paths.
- `evaluateApprovalPolicy` for high-risk actions including deploys, destructive operations, migrations, secret changes, external calls, Git push/PR, and real Codex execution.

This package does not enable real Codex execution, network calls, pushes, pull requests, deployments, monitor creation, or Plane sync. Later batches must wire these utilities into their gates while keeping dry-run responses explicitly marked as non-real until the corresponding real capability is intentionally implemented and approved.

## Real-Mode Readiness Boundary

`ENABLE_REAL_*` and `PSF_ENABLE_REAL_*` values are readiness signals only in this phase. Doctor warns when they are enabled, and integrations must still return `realNetworkCall: false` until a later approved task intentionally wires real provider calls.

Before any real action is allowed in a future phase, the operator must verify approvals, queue mode, Worker Runner health, artifact/workspace roots, redaction, token rotation procedures, backup/restore procedures, and action-specific provider configuration. Real Codex must use an operator-prepared mirror under `PSF_WORKSPACE_ROOT/mirrors`, and the child process receives only an allowlisted non-secret environment.

## Retention And Recovery Safety

`pnpm psf artifacts:cleanup --dry-run` is preview-only and must not delete files. Destructive retention cleanup, Redis queue clearing, database restores, and workspace deletion require explicit approval in a later task.

Worker heartbeat metadata supports manual stale-job detection. It is not automatic recovery, and it must not be used to bulk-cancel or retry unrelated jobs.
