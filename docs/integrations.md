# Integrations

Phase 11-15 integrations are local mock/dry-run adapters for GitHub, Coolify, Uptime Kuma, and Plane. They let the Hub and CLI show what later external actions would look like without mutating any external service.

## Supported Providers

- `github`: simulates branch, Chinese commit message, PR body, and Issue body.
- `coolify`: simulates staging or production deploy request payloads.
- `uptime-kuma`: simulates HTTP monitor configuration.
- `plane`: simulates Mission and Bug issue payloads.

The API also accepts the internal Uptime Kuma name `uptime_kuma`.

## Commands

Status:

```bash
pnpm psf integrations:status
```

Dry-runs:

```bash
pnpm psf integrations:dry-run github
pnpm psf integrations:dry-run coolify
pnpm psf integrations:dry-run uptime-kuma
pnpm psf integrations:dry-run plane
```

## API

Read statuses:

```text
GET /integrations
```

Run a protected dry-run:

```text
POST /integrations/:name/dry-run
```

`POST /integrations/uptime-kuma/dry-run` is supported and maps to the internal `uptime_kuma` adapter.

## Auth

`GET /integrations` is a no-side-effect read. `POST /integrations/:name/dry-run` requires `Authorization: Bearer <PSF_API_TOKEN>` when auth is enabled because it models future side effects.

## Mock Boundary

All current integrations are mock/dry-run only. Even if `ENABLE_REAL_GITHUB`, `ENABLE_REAL_COOLIFY`, `ENABLE_REAL_UPTIME_KUMA`, or `ENABLE_REAL_PLANE` is set to `"1"`, the adapters only report `realEnabled: true`; they still return `realNetworkCall: false` and do not call external APIs.

Token and password values must not enter API responses, logs, PR bodies, Issue bodies, artifacts, or Hub UI.

## Environment Variables

Hub:

- `VITE_ORCHESTRATOR_API_URL`
- `VITE_PSF_API_TOKEN`

GitHub:

- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `ENABLE_REAL_GITHUB=0`

Coolify:

- `COOLIFY_BASE_URL`
- `COOLIFY_TOKEN`
- `ENABLE_REAL_COOLIFY=0`

Uptime Kuma:

- `UPTIME_KUMA_BASE_URL`
- `UPTIME_KUMA_USERNAME`
- `UPTIME_KUMA_PASSWORD`
- `ENABLE_REAL_UPTIME_KUMA=0`

Plane:

- `PLANE_BASE_URL`
- `PLANE_API_TOKEN`
- `PLANE_WORKSPACE_ID`
- `PLANE_PROJECT_ID`
- `ENABLE_REAL_PLANE=0`

These variables are placeholders for later real providers in this documentation batch. They do not enable real network calls.
