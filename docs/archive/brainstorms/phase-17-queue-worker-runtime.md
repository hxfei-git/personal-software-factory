# Phase 17B Queue Worker Runtime Brainstorm

## Current Synchronous Actions

- `POST /missions/:id/actions/plan`
- `POST /missions/:id/actions/codex-dry-run`
- `POST /missions/:id/actions/qa-dry-run`
- `POST /missions/:id/actions/fix-dry-run`
- `POST /missions/:id/actions/loop-dry-run`
- `POST /demo/ai-novelist`
- `POST /integrations/:name/dry-run`

These routes currently call dry-run workflow functions in the API process.

## Queue Candidates

The mission action routes, demo route, and integration dry-run route are safe queue candidates because each is already a whitelisted dry-run or mock action. CRUD routes, transition routes, and resource update routes remain synchronous.

## WorkerRuntime Current State

`@psf/worker-runtime` currently has an in-process synchronous runtime. Phase 17B extends it into a queue facade with both in-process and BullMQ implementations.

## BullMQ As Runtime Implementation

BullMQ stores and schedules jobs over Redis. It does not replace Orchestrator, Mission storage, demo workflow, QA worker, Codex worker, or Auto Fix Loop.

## API Enqueue Model

Queued action requests create a wrapper WorkerRun, record safe job metadata, enqueue a whitelisted job, and return an accepted response. The API process does not execute the long dry-run action.

## Worker Runner Consumption

Worker Runner consumes BullMQ jobs, updates the wrapper WorkerRun, calls existing dry-run handlers, records child IDs in wrapper output, and writes MissionEvent audit records.

## Hub Observability

Hub reads `/queues/status`, Mission Summary, WorkerRuns, and action accepted responses through Orchestrator API. It never connects to Redis directly.

Dashboard, Mission Detail, and the WorkerRun list show queue wrapper WorkerRun status values: `queued`, `running`, `succeeded`, and `failed`. After a dry-run action is accepted, Hub shows the returned `workerRunId` and `jobId`; the user observes progress by refreshing Dashboard, Mission Detail, or the WorkerRun list. Mission Detail can also show child WorkerRun, QARun, Artifact, and BugReport IDs from the wrapper WorkerRun output.

## CLI Controls

CLI commands inspect queue status, start a runner, consume one job for local verification, list WorkerRuns, and cancel or retry a specific wrapper WorkerRun.

## Dry-Run Boundary

This phase does not execute Codex, push, create PRs, deploy, call GitHub/Coolify/Uptime Kuma/Plane, or implement Temporal/LangGraph.

Real Codex execution remains out of scope because Phase 17B is validating queue behavior, Worker Runner execution, WorkerRun state changes, and MissionEvent auditability. Real Codex should wait until workspace isolation, explicit approval, command policy, timeouts, cancellation, and retry semantics are mature enough to protect the user repositories.

Real GitHub, Coolify, Uptime Kuma, and Plane integrations remain out of scope because they require external tokens and can create network side effects such as PRs, deployments, monitors, or issues. Those capabilities need later approval, redaction, idempotency, and rollback protections. This phase keeps the adapters in dry-run or mock mode only.

Temporal and LangGraph remain out of scope because BullMQ is sufficient to validate the local asynchronous queue, runner, and observability model. Temporal or LangGraph would add additional runtime requirements and orchestration complexity before the queue semantics are proven. They can be evaluated after the BullMQ-backed worker runtime is stable.
