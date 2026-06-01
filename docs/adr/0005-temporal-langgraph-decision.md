# ADR 0005: Temporal And LangGraph Decision

Date: 2026-05-31

Status: accepted

## Context

`plan.md` mentions Temporal and LangGraph as later enhancements. The current system already has an explicit TypeScript Mission state machine, BullMQ-backed queue runtime, WorkerRun records, MissionEvents, and Hub observability.

## Decision

Do not introduce Temporal or LangGraph now. Continue with BullMQ plus the explicit TypeScript state machine until there is concrete evidence of need.

Temporal or LangGraph should be reconsidered only after the team can point to repeated evidence in the following checklist:

- recovery failures that are not handled cleanly by the current BullMQ runtime, WorkerRun records, and MissionEvents;
- compensation needs where rollback, cleanup, or manual recovery steps become hard to audit in the current state machine;
- durable timers that must survive restarts and coordinate long-running waits beyond the queue/runtime model;
- branching graph complexity where explicit workers, policies, and Mission state transitions become unclear or brittle;
- multi-project pressure where concurrent Missions make scheduling, throttling, or recovery difficult to operate.

Temporal should be reconsidered only if the evidence points to durable workflow execution, recovery, compensation, timers, or retry orchestration needs that exceed the current BullMQ/state-machine baseline.

LangGraph should be reconsidered only if the system demonstrates real AI decision-graph complexity that cannot be cleanly represented by explicit workers, policies, and state transitions.

## Consequences

- Current dependencies stay light.
- Worker code remains understandable and testable.
- Future migration remains possible by wrapping existing job handlers as workflow activities or graph nodes.
- No batch should add Temporal or LangGraph merely for architectural completeness.
- Orchestrator, WorkerRun, and MissionEvent contracts remain the integration boundary for any future migration.
