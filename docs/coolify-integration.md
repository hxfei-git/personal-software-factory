# Coolify Integration

Coolify integration is currently a mock/dry-run adapter. It simulates deploy request payloads so the factory can document staging and production boundaries before any real deploy automation exists.

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

`ENABLE_REAL_COOLIFY=1` only reports `realEnabled: true`; `realNetworkCall` remains `false`.

## Dry-Run Output

The dry-run may include:

- target project;
- target environment;
- staging or production URL;
- approval requirement for production;
- simulated deployment status.

It must not call Coolify, create deployments, mutate production, or expose `COOLIFY_TOKEN`.
