# Worker Runtime

`@psf/worker-runtime` is the lightweight queue facade for Personal Software Factory. It exists so workers do not become ad hoc CRUD scripts while BullMQ and Temporal remain deferred.

## Current Runtime

- `InProcessWorkerRuntime` runs a job synchronously in the current Node process.
- Each job has `id`, `missionId`, `projectId`, `workerType`, `mode`, `input`, and `createdAt`.
- Successful runs return a `WorkerRun` and `MissionEvent[]`.
- Failed handlers create failure metadata and rethrow the original error.

## Future Queue Migration

A future `BullMQWorkerRuntime` can implement the same interface and persist queue IDs in WorkerRun metadata. Temporal can also become an adapter later when long-running durable workflows are needed. This batch deliberately avoids both.
