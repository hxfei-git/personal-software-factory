# Worker Runner

Consumes whitelisted Personal Software Factory queue jobs and updates the queue wrapper WorkerRun around each job.

The runner reuses existing dry-run workflows for mission planning, Codex dry-run prompt generation, QA dry-run, Auto Fix Loop dry-run, the ai-novelist demo workflow, and integration dry-run adapters. It does not execute Codex, push, create PRs, deploy, or call external providers.

## Commands

```bash
pnpm worker:dev
pnpm worker:once
```

The runner reads `PSF_REDIS_URL`, `PSF_QUEUE_PREFIX`, and `PSF_WORKER_CONCURRENCY`. Queue jobs remain dry-run/mock only in this phase.
