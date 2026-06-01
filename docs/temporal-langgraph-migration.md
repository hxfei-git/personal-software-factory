# Temporal And LangGraph Migration Sketch

## Current Baseline

The current execution model remains BullMQ plus the explicit TypeScript Mission state machine. Orchestrator API contracts, WorkerRun records, and MissionEvent auditing are the system boundaries that callers and operators rely on.

No Temporal or LangGraph dependency should be added during the current real-mode gated work. Integration adapters must also remain dry-run unless a later approved task intentionally enables real network calls.

## Migration Principle

A future migration should wrap the existing job handlers instead of rewriting the product contracts. The external Orchestrator request/response shape, WorkerRun lifecycle, Mission state transitions, and MissionEvent payload expectations should stay stable while the internal execution engine changes behind them.

## Temporal Path

If the evidence checklist in ADR 0005 is met for durable workflow execution, current BullMQ jobs can be mapped as Temporal activities:

- keep Orchestrator creating the same Mission and WorkerRun records;
- have the queue boundary start or signal a Temporal workflow for the Mission;
- wrap each current handler step as a Temporal activity that accepts the same internal inputs it receives today;
- persist WorkerRun status and MissionEvents from workflow/activity progress using the existing audit semantics;
- keep compensation steps explicit by modeling them as activities that emit the same recovery or failure events operators already inspect;
- expose migration state through current Hub and API surfaces rather than adding a parallel operator contract.

Temporal should be introduced only when recovery failures, compensation needs, durable timers, or retry orchestration create operational pressure that the current queue baseline cannot handle cleanly.

## LangGraph Path

If the evidence checklist is met for AI decision graph complexity, current handlers can be mapped as LangGraph nodes:

- keep Orchestrator and Mission contracts unchanged;
- treat each existing worker decision or execution step as a node with typed inputs and outputs derived from current handler data;
- route graph branch decisions through existing policy/state transition points;
- emit WorkerRun updates and MissionEvents from node boundaries so audit history remains continuous;
- keep deterministic worker behavior and tests around the current contract before expanding graph branching.

LangGraph should be introduced only when explicit workers, policies, and state transitions can no longer represent branching AI decisions clearly.

## Non-Goals For Current Phase

- Do not add Temporal or LangGraph dependencies.
- Do not implement workflows, activities, graphs, or nodes.
- Do not change Orchestrator, WorkerRun, or MissionEvent contracts.
- Do not enable real network calls in GitHub, Coolify, Uptime Kuma, or Plane adapters as part of this migration planning.
