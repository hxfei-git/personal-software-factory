# Mission Core

Reusable Mission state machine for Personal Software Factory.

This package has no Fastify or Prisma dependency. It can be reused by the Orchestrator API, future Hub Web, Codex Worker, and QA Worker.

## Exports

- `canTransition(from, to)`
- `assertTransition(from, to)`
- `transitionMission(input)`
- `isFinalStatus(status)`
- `isRunningStatus(status)`

## Main Flows

```text
received -> planning -> dev_queued -> dev_running -> build_running -> staging_deploying -> qa_running -> ready_for_review
qa_running -> bugs_found -> fixing -> regression_running -> qa_running
ready_for_review -> release_approval -> production_deploying -> released
```

Global rules:

- Any non-final status can transition to `paused`.
- Any non-final status can transition to `cancelled`.
- Running statuses can transition to `failed`.
- Final statuses are `released`, `failed`, and `cancelled`.

## Commands

```bash
pnpm --filter @psf/mission-core test
pnpm --filter @psf/mission-core typecheck
```
