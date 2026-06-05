# @psf/integrations

Dry-run adapters and gated real adapter implementations for external services used by later Personal Software Factory phases.

## Safety Contract

- Dry-run/mock adapters remain the default path and never call real external APIs.
- Real adapters exist for approved execution paths, but they require `ENABLE_REAL_*=1`, complete credentials/configuration, explicit runtime policy gates, and an injected transport.
- Normal package tests use dry-runs or fake injected transports; they do not call real networks.
- `realNetworkCall` stays `false` until a gated real adapter actually invokes its injected transport.
- Gated real results expose `canQueue`, `canExecute`, sorted execute-only `blockers[]`, and `recommendedNextAction` so callers can display manual-action state without inferring from `safeToRun`.
- Blocker details are allowlisted sanitized metadata only; raw provider payloads, token-like values, long raw errors, and secret-like values must not be emitted.
- Tokens, passwords, secrets, keys, and credentials are only used to determine configuration or to build redacted transport requests.
- Secret values must not appear in statuses, outputs, logs, PR bodies, Issue bodies, or snapshots.

## Providers

- GitHub: simulates branch, Chinese commit message, PR, and Issue payloads; gated real mode can create a branch, open/update a PR, and post a QA comment through injected transport only.
- Coolify: simulates staging or production deploy requests; gated real mode can request staging deployments through injected transport, while production still requires explicit approval.
- Uptime Kuma: simulates monitor configuration, preferring staging URL over production URL; gated real mode can create/check monitors through injected transport only.
- Plane: simulates Mission issue creation and BugReport issue creation; gated real mode can create/update issues through injected transport only.

## Commands

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/integrations typecheck
```
