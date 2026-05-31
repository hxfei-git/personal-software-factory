# Integrations

Phase 11-15 integrations default to local mock/dry-run adapters for GitHub, Coolify, Uptime Kuma, and Plane. They let the Hub and CLI show what later external actions would look like without mutating any external service. This phase also includes gated real adapter implementations for approved execution paths, but they only run when runtime wiring explicitly selects them.

## Supported Providers

- `github`: simulates branch, Chinese commit message, PR body, and Issue body; gated real mode can create a branch, open/update a PR, and post QA comments through injected transport only.
- `coolify`: simulates staging or production deploy request payloads; gated real mode can request staging deployments through injected transport, while production still requires approval.
- `uptime-kuma`: simulates HTTP monitor configuration; gated real mode can create/check monitors through injected transport only.
- `plane`: simulates Mission and Bug issue payloads; gated real mode can create/update issues through injected transport only.

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

## Execution Boundary

Dry-run/mock adapters are the default and never call external APIs. Setting `ENABLE_REAL_GITHUB`, `ENABLE_REAL_COOLIFY`, `ENABLE_REAL_UPTIME_KUMA`, or `ENABLE_REAL_PLANE` to `"1"` only makes real mode eligible; it does not by itself perform a network call.

A real external call can occur only when runtime wiring chooses a real adapter and provides all required credentials/configuration, explicit approval/policy gates, and an injected transport. Normal tests use fake transports and do not call the network. Integration results must keep `realNetworkCall: false` until a gated real adapter actually invokes its injected transport.

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

These variables configure dry-run status and gated real-mode eligibility. They do not enable real network calls unless the runtime also chooses the real adapter path, provides approval/policy gates, and injects a transport.
