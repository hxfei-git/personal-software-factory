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

## Queue Checks

Doctor reports queue-related configuration:

- `PSF_WORKER_RUNTIME`
- `PSF_ACTION_EXECUTION_MODE`
- `PSF_REDIS_URL` presence with redacted URL details

Examples:

```bash
pnpm psf doctor
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm psf doctor
```

Warnings are expected when queued mode is selected without BullMQ, or when BullMQ is selected without `PSF_REDIS_URL`. Doctor does not print token, password, or secret values.

Queue runtime status is available separately:

```bash
pnpm psf queues:status
curl http://127.0.0.1:3000/queues/status
```

## Operations Readiness Checks

Doctor also reports:

- artifact root and workspace root status;
- active redaction configuration;
- Worker Runner heartbeat/stale-detection guidance;
- newer `PSF_ENABLE_REAL_*` action gates;
- integration readiness while preserving `realNetworkCall: false`.

A warning for missing `artifacts/` or `workspaces/` is acceptable before the first real-mode write or clone. A failed root check means the path exists but is not a directory and should be fixed before running workers.

## Stale Worker Detection

Queue wrapper WorkerRuns expose heartbeat metadata when Worker Runner marks a job running. Operators should compare `workerRunnerHeartbeatAt` with current time and the queue status output. This phase reports stale-detection data only; it does not automatically cancel, retry, or recover stale jobs.

## Retention Preview

```bash
pnpm psf artifacts:cleanup --dry-run
```

Expected output is JSON with `dryRun: true`, `deletionEnabled: false`, and a candidate list. The command must not delete files or print secret values.
