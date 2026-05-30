# Plane Integration

Plane integration is currently a mock/dry-run adapter. It simulates Mission and Bug issue payloads without creating or updating Plane records.

## Commands

```bash
pnpm psf integrations:status
pnpm psf integrations:dry-run plane
```

API:

```text
GET /integrations
POST /integrations/plane/dry-run
```

The POST route requires `Authorization: Bearer <PSF_API_TOKEN>` when auth is enabled.

## Environment

```text
PLANE_BASE_URL=
PLANE_API_TOKEN=
PLANE_WORKSPACE_ID=
PLANE_PROJECT_ID=
ENABLE_REAL_PLANE=0
```

`ENABLE_REAL_PLANE=1` only reports `realEnabled: true`; `realNetworkCall` remains `false`.

## Dry-Run Output

The dry-run may include:

- simulated Mission issue title and description;
- simulated Bug issue titles, severities, descriptions, and evidence summaries;
- example Plane issue URLs.

It must not call Plane, create issues, update issue state, or expose `PLANE_API_TOKEN`.
