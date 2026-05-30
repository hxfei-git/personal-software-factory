# Uptime Kuma Integration

Uptime Kuma integration is currently a mock/dry-run adapter. It simulates monitor configuration for Hub visibility without creating or updating monitors.

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

`ENABLE_REAL_UPTIME_KUMA=1` only reports `realEnabled: true`; `realNetworkCall` remains `false`.

## Dry-Run Output

The dry-run may include:

- monitor name;
- HTTP monitor type;
- target URL;
- interval and retry settings;
- simulated monitor status.

It must not call Uptime Kuma, create monitors, poll monitors, or expose usernames or passwords.
