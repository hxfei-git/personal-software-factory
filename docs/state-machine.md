# Mission State Machine

Mission transition rules live in `packages/mission-core`. The state machine has no Fastify or Prisma dependency.

## Normal Development Flow

```text
received -> planning -> dev_queued -> dev_running -> build_running -> staging_deploying -> qa_running -> ready_for_review
```

The implementation also supports plan-compatible intermediate states such as `planned`, `test_running`, and `staging_ready`.

## Bug Fix Loop

```text
qa_running -> bugs_found -> fixing -> regression_running -> qa_running
```

## Release Flow

```text
ready_for_review -> release_approval -> production_deploying -> released
```

## Global Rules

- Any non-final status can transition to `paused`.
- Any non-final status can transition to `cancelled`.
- Running statuses can transition to `failed`.
- Final statuses are `released`, `failed`, and `cancelled`.
- Final statuses do not transition in this batch.

Every successful transition returns a MissionEvent-shaped object with event type `mission.transition.<from>.<to>`.
