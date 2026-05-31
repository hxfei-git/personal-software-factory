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

## CLI Controls

CLI commands inspect queue status, start a runner, consume one job for local verification, list WorkerRuns, and cancel or retry a specific wrapper WorkerRun.

## Dry-Run Boundary

This phase does not execute Codex, push, create PRs, deploy, call GitHub/Coolify/Uptime Kuma/Plane, or implement Temporal/LangGraph.
