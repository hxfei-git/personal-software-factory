# @psf/integrations

Mock and dry-run adapters for external services used by later Personal Software Factory phases.

## Safety Contract

- Adapters never call real external APIs.
- `realNetworkCall` is always `false`.
- `ENABLE_REAL_*="1"` only sets `realEnabled: true`; it does not change execution into real mode.
- Tokens, passwords, secrets, keys, and credentials are only used to determine `configured`.
- Secret values must not appear in statuses, outputs, logs, PR bodies, Issue bodies, or snapshots.

## Providers

- GitHub: simulates branch, Chinese commit message, PR, and Issue payloads.
- Coolify: simulates staging or production deploy requests; production requires approval.
- Uptime Kuma: simulates monitor configuration, preferring staging URL over production URL.
- Plane: simulates Mission issue creation and BugReport issue creation.

## Commands

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/integrations typecheck
```
