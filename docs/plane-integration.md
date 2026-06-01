# Plane Integration

Plane integration keeps the existing mock/dry-run adapter and now also exposes a code-level real adapter for later orchestrator wiring. The Hub/API dry-run surface still does not call Plane.

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

Default is disabled. When `ENABLE_REAL_PLANE` is unset or `0`, the real adapter returns `realEnabled: false`, `realNetworkCall: false`, and manual-action guidance. Missing URL/token/workspace/project also returns manual action instead of throwing.

## Gated Real Mode

`runPlaneReal` requires all of the following before it can call the injected transport:

- `ENABLE_REAL_PLANE=1`;
- configured `PLANE_BASE_URL`, `PLANE_API_TOKEN`, `PLANE_WORKSPACE_ID`, and `PLANE_PROJECT_ID`;
- an injected `IntegrationTransport` function;
- `gates.allowNetwork=true`.

The adapter can create/update a Mission issue, create/update Bug issues, map Mission/Bug statuses to Plane states, and return issue URLs from transport responses. Request summaries include method and URL only, never bearer tokens. Mission descriptions, Bug issue descriptions, evidence summaries, errors, logs, and result objects are redacted before return.

## Injected Transport Testing

Tests pass fake transports that capture requests and return success, 401 auth failure, 403 permission failure, and thrown timeout/network errors. No test performs a real network call.

## Dry-Run Output

The dry-run may include:

- simulated Mission issue title and description;
- simulated Bug issue titles, severities, descriptions, and evidence summaries;
- example Plane issue URLs.

It must not call Plane, create issues, update issue state, or expose `PLANE_API_TOKEN`.
