# Coolify Integration

Coolify integration keeps the existing mock/dry-run adapter and now also exposes a code-level real adapter for later orchestrator wiring. The Hub/API dry-run surface still does not call Coolify.

## Commands

```bash
pnpm psf integrations:status
pnpm psf integrations:dry-run coolify
```

API:

```text
GET /integrations
POST /integrations/coolify/dry-run
```

The POST route requires `Authorization: Bearer <PSF_API_TOKEN>` when auth is enabled.

## Environment

```text
COOLIFY_BASE_URL=
COOLIFY_TOKEN=
ENABLE_REAL_COOLIFY=0
```

Default is disabled. When `ENABLE_REAL_COOLIFY` is unset or `0`, the real adapter returns `realEnabled: false`, `realNetworkCall: false`, and manual-action guidance. Missing URL/token also returns manual action instead of throwing.

## Gated Real Mode

`runCoolifyReal` requires all of the following before it can call the injected transport:

- `ENABLE_REAL_COOLIFY=1`;
- configured `COOLIFY_BASE_URL` and `COOLIFY_TOKEN`;
- an injected `IntegrationTransport` function;
- `gates.allowNetwork=true`.

Staging deploy requests and status polling can run through the injected transport. Production deploy requests require `gates.approveProductionDeploy=true`; without approval the adapter returns manual action and does not call transport. Request summaries include method and URL only, never bearer tokens. Deployment errors and result objects are redacted before return.

## Injected Transport Testing

Tests pass fake transports that capture requests and return success, 401 auth failure, 403 permission failure, and thrown timeout/network errors. No test performs a real network call.

## Dry-Run Output

The dry-run may include:

- target project;
- target environment;
- staging or production URL;
- approval requirement for production;
- simulated deployment status.

It must not call Coolify, create deployments, mutate production, or expose `COOLIFY_TOKEN`.
