# Health Checks

## Doctor

Run the default local doctor:

```bash
pnpm psf doctor
```

Doctor checks Node, pnpm detection, required directories, `.env.example`, optional `.env`, the `ai-novelist` Project Passport, database check status, optional loopback API/Hub HTTP checks, integration dry-run safety, and real-mode warning env vars.

JSON output:

```bash
pnpm psf doctor --json
```

## Optional Checks

```bash
pnpm psf doctor --check-db
pnpm psf doctor --check-api
pnpm psf doctor --check-hub
```

`--check-api` and `--check-hub` only check local loopback URLs. Non-local URLs are skipped with a warning.

Environment flags may enable optional checks in local scripts:

```dotenv
PSF_DOCTOR_CHECK_API=0
PSF_DOCTOR_CHECK_HUB=0
```

## API

```bash
curl http://127.0.0.1:3000/health
```

Expected:

```json
{ "status": "ok" }
```

## Hub

Start Hub and open:

```text
http://127.0.0.1:5173
```

The Hub should load dashboard data from the Orchestrator API and show dry-run action controls when the local token setup is present.

## Integration Safety

```bash
pnpm psf integrations:status
```

Every current integration must report `realNetworkCall: false`.
