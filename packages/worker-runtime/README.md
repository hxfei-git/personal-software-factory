# Worker Runtime

`@psf/worker-runtime` is the lightweight queue facade for Personal Software Factory. The current implementation is `InProcessWorkerRuntime`, a synchronous local runner used by tests, CLI dry-runs, QA Worker, and auto-fix loop.

It deliberately does not depend on BullMQ. A future `BullMQWorkerRuntime` can implement the same `WorkerRuntime` interface after job payloads and event behavior are stable.
