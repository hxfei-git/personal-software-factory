# ADR 0001: Current Architecture Alignment

Date: 2026-05-31

Status: accepted

## Context

`plan.md` contains early directory and framework examples. The implemented system has evolved through Phase 17B while preserving the Personal Software Factory goal: Mission planning, worker execution, QA, fix loops, artifacts, events, queue-backed execution, and Hub visibility.

## Decision

The current architecture is the canonical implementation baseline:

- Hub Web uses React/Vite.
- Orchestrator API lives in `apps/orchestrator-api`.
- Worker Runner lives in `apps/worker-runner`.
- Schemas live in `packages/mission-schema`.
- Mission state machine lives in `packages/mission-core`.
- Queue facade lives in `packages/worker-runtime`.
- Dry-run/mock behavior remains first-class.
- Queue wrapper WorkerRun semantics remain in place for queued jobs.

Older references to Next.js, `apps/api`, `packages/schemas`, or `packages/core` are treated as historical examples, not required renames.

## Consequences

- Future work should extend current modules instead of renaming them for cosmetic plan alignment.
- Documentation should explicitly call out current naming so future agents do not attempt broad rewrites.
- Architecture drift should be evaluated against system goals and safety boundaries, not old sample paths.
