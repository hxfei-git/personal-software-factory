# Uptime Kuma Integration

Uptime Kuma integration keeps the existing mock/dry-run adapter and now also exposes a code-level real adapter for later orchestrator wiring. The Hub/API dry-run surface still does not call Uptime Kuma.

## Commands

```bash
pnpm psf integrations:status
pnpm psf integrations:dry-run uptime-kuma
```

API:

```text
GET /integrations
POST /integrations/uptime-kuma/dry-run
```

The API also accepts `POST /integrations/uptime_kuma/dry-run`. POST routes require `Authorization: Bearer <PSF_API_TOKEN>` when auth is enabled.

## Environment

```text
UPTIME_KUMA_BASE_URL=
UPTIME_KUMA_USERNAME=
UPTIME_KUMA_PASSWORD=
ENABLE_REAL_UPTIME_KUMA=0
```

Default is disabled. When `ENABLE_REAL_UPTIME_KUMA` is unset or `0`, the real adapter returns `realEnabled: false`, `realNetworkCall: false`, and manual-action guidance. Missing URL/username/password also returns manual action instead of throwing.

## Gated Real Mode

`runUptimeKumaReal` requires all of the following before it can call the injected transport:

- `ENABLE_REAL_UPTIME_KUMA=1`;
- configured `UPTIME_KUMA_BASE_URL`, `UPTIME_KUMA_USERNAME`, and `UPTIME_KUMA_PASSWORD`;
- an injected `IntegrationTransport` function;
- `gates.allowNetwork=true`.

The adapter can submit monitor config, fetch monitor status, and return a down-event boolean through the injected transport. Provider unavailable and timeout/network errors return degraded/manual-action style results rather than failing the process. Request summaries include method and URL only, never passwords or session tokens. Errors, logs, and result objects are redacted before return.

## Injected Transport Testing

Tests pass fake transports that capture requests and return success, 401 auth failure, 403 permission failure, 503 provider unavailable, and thrown timeout/network errors. No test performs a real network call.

## Dry-Run Output

The dry-run may include:

- monitor name;
- HTTP monitor type;
- target URL;
- interval and retry settings;
- simulated monitor status.

It must not call Uptime Kuma, create monitors, poll monitors, or expose usernames or passwords.
