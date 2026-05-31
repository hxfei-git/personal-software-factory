# ADR 0005: Temporal And LangGraph Decision

Date: 2026-05-31

Status: accepted

## Context

`plan.md` mentions Temporal and LangGraph as later enhancements. The current system already has an explicit TypeScript Mission state machine, BullMQ-backed queue runtime, WorkerRun records, MissionEvents, and Hub observability.

## Decision

Do not introduce Temporal or LangGraph now. Continue with BullMQ plus the explicit TypeScript state machine until there is concrete evidence of need.

Temporal should be reconsidered only if the system demonstrates problems with:

- long-running workflow recovery;
- compensation logic;
- durable timers;
- complex retry orchestration;
- high multi-project concurrency;
- restart recovery beyond the current queue/runtime model.

LangGraph should be reconsidered only if the system demonstrates real AI decision-graph complexity that cannot be cleanly represented by explicit workers, policies, and state transitions.

## Consequences

- Current dependencies stay light.
- Worker code remains understandable and testable.
- Future migration remains possible by wrapping existing job handlers as workflow activities or graph nodes.
- No batch should add Temporal or LangGraph merely for architectural completeness.
