# Phase 17B Queue Worker Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional BullMQ-backed asynchronous dry-run action execution with queue wrapper WorkerRuns, Worker Runner consumption, Queue API, CLI controls, Hub observability, and no real external execution.

**Architecture:** Keep Orchestrator as the API boundary and `@psf/worker-runtime` as the queue facade. API queued mode creates a wrapper WorkerRun and enqueues a safe whitelisted job; Worker Runner consumes the job, reuses existing dry-run workflows, and updates wrapper status/output while child WorkerRuns remain owned by existing business modules.

**Tech Stack:** pnpm workspace, TypeScript, Zod, Fastify, Prisma/PostgreSQL, BullMQ optional over Redis, Vitest, Vite React Hub.

---

## File Structure

Create:

- `docs/brainstorms/phase-17-queue-worker-runtime.md`: required design check for Phase 17B implementation.
- `docs/queue-runtime.md`: queue runtime operations and wrapper WorkerRun semantics.
- `docs/real-codex-execution-readiness.md`: design guardrails for a future real Codex stage.
- `apps/worker-runner/package.json`: Worker Runner app metadata and scripts.
- `apps/worker-runner/tsconfig.json`: Worker Runner TypeScript config.
- `apps/worker-runner/README.md`: runner purpose, dry-run boundary, startup commands.
- `apps/worker-runner/src/index.ts`: CLI entrypoint for long-running and once modes.
- `apps/worker-runner/src/handlers.ts`: job type to business dry-run handler mapping.
- `apps/worker-runner/src/runner.ts`: processing loop, WorkerRun state transitions, safe output mapping.
- `apps/worker-runner/tests/runner.test.ts`: unit tests for handler dispatch and wrapper status updates.

Modify:

- `package.json`: add root scripts `worker:dev`, optionally `worker:once`, and add workspace dependency visibility if scripts need imports.
- `.env.example`: add queue/runtime/action environment variables.
- `pnpm-lock.yaml`: update after adding BullMQ dependency.
- `packages/worker-runtime/package.json`: add `zod` for schemas and `bullmq` for the optional adapter.
- `packages/worker-runtime/src/index.ts`: add Zod job schemas, runtime facade methods, in-process/fake-compatible queue behavior, and BullMQ adapter.
- `packages/worker-runtime/tests/worker-runtime.test.ts`: add schema, in-process, BullMQ constructability, cancel/retry/stats tests.
- `apps/orchestrator-api/package.json`: add `@psf/worker-runtime` if not already present.
- `apps/orchestrator-api/src/actions.ts`: split action execution into inline and queued paths.
- `apps/orchestrator-api/src/services.ts`: wire action mode, wrapper WorkerRun creation, Queue API methods, cancel/retry/list filtering.
- `apps/orchestrator-api/src/server.ts`: add queue and worker-run control routes.
- `apps/orchestrator-api/src/storage.ts`: add list filtering helpers only if service-level filtering is not enough.
- `apps/orchestrator-api/tests/api.test.ts`: add inline compatibility, queued accepted, Queue API, cancel/retry, no-business-execution tests.
- `scripts/psf.ts`: add `queues:status`, `worker:start`, `worker:once`, `worker-runs:list`, `worker-runs:cancel`, `worker-runs:retry`.
- `scripts/psf.test.ts`: add focused CLI tests using fake/in-process mode.
- `packages/demo-workflow/src/doctor.ts`: add queue/runtime/Redis checks.
- `packages/demo-workflow/tests/demo-workflow.test.ts`: add doctor queue check tests.
- `apps/hub/src/api/types.ts`: add queue status, job, accepted action response, wrapper WorkerRun output types.
- `apps/hub/src/api/client.ts`: add queue status, worker-run list/cancel/retry client methods.
- `apps/hub/src/App.tsx`: render Dashboard queue status and Mission Detail accepted job info; distinguish wrapper and child WorkerRuns.
- `apps/hub/src/styles.css`: add compact queue status and accepted action styles.
- `apps/hub/tests/hub.test.tsx`: add queue card, accepted response, failed WorkerRun rendering, token safety tests.
- `docs/worker-runtime.md`, `docs/api.md`, `docs/operations.md`, `docs/troubleshooting.md`, `docs/health-checks.md`, `docs/local-development.md`, `docs/safety.md`, `docs/progress.md`, `README.md`: document Phase 17B usage and boundaries.

Protect:

- Do not change existing business WorkerRun semantics in `packages/demo-workflow`, `workers/qa-worker`, `workers/codex-worker`, or `packages/auto-fix-loop`.
- Do not add real Codex execution, real provider clients, Git push, PR creation, deployment, queue obliterate, or broad data reset behavior.
- Do not put tokens or passwords in job payloads, logs, WorkerRun output, API responses, CLI output, tests, snapshots, or Hub UI.

---

## Task 1: Add Phase 17B Brainstorm Doc

**Files:**
- Create: `docs/brainstorms/phase-17-queue-worker-runtime.md`
- Test: documentation review with `rg`

- [ ] **Step 1: Create the design check document**

Create `docs/brainstorms/phase-17-queue-worker-runtime.md`:

```md
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
```

- [ ] **Step 2: Review the doc for unresolved markers**

Run:

```bash
rg -n "TB[D]|TO[D]O|FIXM[E]" docs/brainstorms/phase-17-queue-worker-runtime.md
```

Expected: no matches and exit code `1`.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/brainstorms/phase-17-queue-worker-runtime.md
git commit -m "补充队列运行时设计检查" -m "新增 Phase 17B brainstorm 文档，记录同步 action、入队边界、Worker Runner、Hub 可观测、CLI 和 dry-run 安全边界。"
```

Expected: commit succeeds.

---

## Task 2: Extend WorkerRuntime Contracts And In-Process Queue Behavior

**Files:**
- Modify: `packages/worker-runtime/package.json`
- Modify: `packages/worker-runtime/src/index.ts`
- Modify: `packages/worker-runtime/tests/worker-runtime.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing tests for job schema and in-process queue methods**

Append to `packages/worker-runtime/tests/worker-runtime.test.ts`:

```ts
import {
  InProcessWorkerRuntime,
  WorkerJobSchema,
  buildWorkerJob,
} from "../src/index.js";

describe("WorkerJobSchema", () => {
  it("validates a whitelisted queue job", () => {
    const job = WorkerJobSchema.parse({
      id: "job-test-1",
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-queue-1",
      type: "qa.dry_run",
      mode: "dry-run",
      payload: { withSampleBug: false },
      idempotencyKey: "mission-0001-ai-novelist-chapter-review:qa.dry_run",
      priority: 5,
      attempts: 2,
      timeoutMs: 300000,
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    expect(job.type).toBe("qa.dry_run");
    expect(job.payload).toEqual({ withSampleBug: false });
  });

  it("rejects arbitrary job types", () => {
    expect(() => WorkerJobSchema.parse({
      id: "job-danger",
      missionId: "mission-1",
      projectId: "ai-novelist",
      workerRunId: "worker-run-danger",
      type: "shell.exec",
      mode: "dry-run",
      payload: {},
      idempotencyKey: "danger",
      priority: 5,
      attempts: 1,
      timeoutMs: 1000,
      createdAt: "2026-05-31T00:00:00.000Z",
    })).toThrow();
  });
});

describe("InProcessWorkerRuntime queue facade", () => {
  it("enqueues, lists, cancels, retries, and reports stats without Redis", async () => {
    const runtime = new InProcessWorkerRuntime({ now: () => "2026-05-31T00:00:00.000Z" });
    const job = buildWorkerJob({
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-queue-1",
      type: "qa.dry_run",
      payload: { withSampleBug: false },
    });

    const enqueued = await runtime.enqueue(job);
    expect(enqueued.status).toBe("queued");
    expect(await runtime.getJobStatus(job.id)).toBe("queued");
    expect((await runtime.listJobs({ status: "queued" })).map((item) => item.id)).toContain(job.id);

    const cancelled = await runtime.cancelJob(job.id);
    expect(cancelled.status).toBe("cancelled");

    const retried = await runtime.retryJob(job.id);
    expect(retried.status).toBe("queued");
    expect(retried.id).not.toBe(job.id);

    const stats = await runtime.getQueueStats();
    expect(stats.runtime).toBe("in-process");
    expect(stats.counts.queued).toBeGreaterThanOrEqual(1);

    await runtime.close();
  });
});
```

- [ ] **Step 2: Run the worker-runtime tests and verify failure**

Run:

```bash
pnpm --filter @psf/worker-runtime test
```

Expected: fails because `WorkerJobSchema`, `buildWorkerJob`, and queue facade methods do not exist.

- [ ] **Step 3: Add Zod dependency and implement WorkerRuntime contracts**

Run:

```bash
pnpm --filter @psf/worker-runtime add zod
```

Expected: `packages/worker-runtime/package.json` and `pnpm-lock.yaml` update.

Then implement the runtime contracts.

In `packages/worker-runtime/src/index.ts`, add Zod-based queue contracts while keeping the existing `run()` method compatible:

```ts
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const WorkerJobTypeSchema = z.enum([
  "mission.plan",
  "codex.dry_run",
  "qa.dry_run",
  "qa.dry_run_with_sample_bug",
  "fix.dry_run",
  "loop.dry_run",
  "demo.ai_novelist",
  "integration.dry_run",
]);

export const WorkerJobStatusSchema = z.enum([
  "queued",
  "active",
  "completed",
  "failed",
  "cancelled",
  "delayed",
]);

export const WorkerJobModeSchema = z.enum(["dry-run", "mock", "real"]);

export const WorkerJobSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  projectId: z.string().min(1),
  workerRunId: z.string().min(1),
  type: WorkerJobTypeSchema,
  mode: WorkerJobModeSchema.default("dry-run"),
  payload: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().min(1),
  priority: z.number().int().min(0).max(10).default(5),
  attempts: z.number().int().min(1).max(10).default(2),
  timeoutMs: z.number().int().min(1000).default(300000),
  createdAt: z.string().datetime(),
});

export type WorkerJobType = z.infer<typeof WorkerJobTypeSchema>;
export type WorkerJobStatus = z.infer<typeof WorkerJobStatusSchema>;
export type QueueWorkerJob = z.infer<typeof WorkerJobSchema>;

export interface QueuedJobRecord {
  id: string;
  status: WorkerJobStatus;
  job: QueueWorkerJob;
  attemptsMade: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface QueueStats {
  runtime: "in-process" | "bullmq";
  redisConfigured: boolean;
  redisReachable?: boolean;
  queueName: string;
  counts: {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    delayed: number;
  };
}

export interface ListJobsFilter {
  status?: WorkerJobStatus;
  missionId?: string;
  workerRunId?: string;
  type?: WorkerJobType;
}

export function buildWorkerJob(input: {
  missionId: string;
  projectId: string;
  workerRunId: string;
  type: WorkerJobType;
  mode?: "dry-run" | "mock" | "real";
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  attempts?: number;
  timeoutMs?: number;
  now?: string;
  id?: string;
}): QueueWorkerJob {
  const createdAt = input.now ?? new Date().toISOString();
  return WorkerJobSchema.parse({
    id: input.id ?? `job-${randomUUID()}`,
    missionId: input.missionId,
    projectId: input.projectId,
    workerRunId: input.workerRunId,
    type: input.type,
    mode: input.mode ?? "dry-run",
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey ?? `${input.missionId}:${input.type}:${input.workerRunId}`,
    priority: input.priority ?? 5,
    attempts: input.attempts ?? 2,
    timeoutMs: input.timeoutMs ?? 300000,
    createdAt,
  });
}
```

Extend `WorkerRuntime`:

```ts
export interface WorkerRuntime {
  run(job: WorkerJob, handler: (job: WorkerJob) => Promise<WorkerHandlerResult>): Promise<WorkerRuntimeResult>;
  enqueue(job: QueueWorkerJob): Promise<QueuedJobRecord>;
  getJob(jobId: string): Promise<QueuedJobRecord | null>;
  getJobStatus(jobId: string): Promise<WorkerJobStatus | null>;
  cancelJob(jobId: string): Promise<QueuedJobRecord>;
  retryJob(jobId: string): Promise<QueuedJobRecord>;
  listJobs(filter?: ListJobsFilter): Promise<QueuedJobRecord[]>;
  getQueueStats(): Promise<QueueStats>;
  close(): Promise<void>;
}
```

Add an in-process job map to `InProcessWorkerRuntime`:

```ts
private readonly queueName = "psf-in-process";
private readonly jobs = new Map<string, QueuedJobRecord>();

async enqueue(job: QueueWorkerJob): Promise<QueuedJobRecord> {
  const parsed = WorkerJobSchema.parse(job);
  const record: QueuedJobRecord = {
    id: parsed.id,
    status: "queued",
    job: parsed,
    attemptsMade: 0,
    createdAt: parsed.createdAt,
    updatedAt: this.now(),
  };
  this.jobs.set(record.id, record);
  return record;
}

async getJob(jobId: string): Promise<QueuedJobRecord | null> {
  return this.jobs.get(jobId) ?? null;
}

async getJobStatus(jobId: string): Promise<WorkerJobStatus | null> {
  return this.jobs.get(jobId)?.status ?? null;
}

async cancelJob(jobId: string): Promise<QueuedJobRecord> {
  const current = this.requireJob(jobId);
  if (current.status === "completed") {
    throw new Error(`Cannot cancel completed job ${jobId}`);
  }
  const updated = { ...current, status: "cancelled" as const, updatedAt: this.now() };
  this.jobs.set(jobId, updated);
  return updated;
}

async retryJob(jobId: string): Promise<QueuedJobRecord> {
  const current = this.requireJob(jobId);
  if (current.status !== "failed" && current.status !== "cancelled") {
    throw new Error(`Only failed or cancelled jobs can be retried: ${jobId}`);
  }
  const retryJob = buildWorkerJob({
    ...current.job,
    id: `job-${randomUUID()}`,
    idempotencyKey: `${current.job.idempotencyKey}:retry:${current.attemptsMade + 1}`,
    now: this.now(),
  });
  return this.enqueue(retryJob);
}

async listJobs(filter: ListJobsFilter = {}): Promise<QueuedJobRecord[]> {
  return [...this.jobs.values()].filter((record) => {
    if (filter.status && record.status !== filter.status) return false;
    if (filter.missionId && record.job.missionId !== filter.missionId) return false;
    if (filter.workerRunId && record.job.workerRunId !== filter.workerRunId) return false;
    if (filter.type && record.job.type !== filter.type) return false;
    return true;
  });
}

async getQueueStats(): Promise<QueueStats> {
  const counts = { queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0, delayed: 0 };
  for (const record of this.jobs.values()) {
    counts[record.status] += 1;
  }
  return { runtime: "in-process", redisConfigured: false, queueName: this.queueName, counts };
}

async close(): Promise<void> {}

private requireJob(jobId: string): QueuedJobRecord {
  const job = this.jobs.get(jobId);
  if (!job) {
    throw new Error(`Queue job not found: ${jobId}`);
  }
  return job;
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
pnpm --filter @psf/worker-runtime test
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/worker-runtime/package.json packages/worker-runtime/src/index.ts packages/worker-runtime/tests/worker-runtime.test.ts pnpm-lock.yaml
git commit -m "扩展工作运行时队列契约" -m "新增 WorkerJob schema、队列状态、QueueStats 和 InProcessWorkerRuntime 队列方法，为 BullMQ adapter 和 queued action 奠定接口。"
```

Expected: commit succeeds.

---

## Task 3: Add Optional BullMQWorkerRuntime Adapter

**Files:**
- Modify: `packages/worker-runtime/package.json`
- Modify: `packages/worker-runtime/src/index.ts`
- Modify: `packages/worker-runtime/tests/worker-runtime.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add BullMQ dependency**

Run:

```bash
pnpm --filter @psf/worker-runtime add bullmq
```

Expected: `packages/worker-runtime/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write failing BullMQ tests**

Append to `packages/worker-runtime/tests/worker-runtime.test.ts`:

```ts
import { BullMQWorkerRuntime, createWorkerRuntimeFromEnv } from "../src/index.js";

describe("BullMQWorkerRuntime", () => {
  it("can be constructed without connecting immediately", async () => {
    const runtime = new BullMQWorkerRuntime({
      redisUrl: "redis://127.0.0.1:0",
      queueName: "psf-test",
      prefix: "psf-test",
    });

    await runtime.close();
  });

  it("returns a readable Redis error when stats cannot connect", async () => {
    const runtime = new BullMQWorkerRuntime({
      redisUrl: "redis://127.0.0.1:1",
      queueName: "psf-test",
      prefix: "psf-test",
      connectionTimeoutMs: 50,
    });

    await expect(runtime.getQueueStats()).rejects.toThrow(/Redis is not reachable|ECONNREFUSED|connect/i);
    await runtime.close();
  });

  it("selects in-process runtime by default", () => {
    const runtime = createWorkerRuntimeFromEnv({ env: {} });
    expect(runtime.constructor.name).toBe("InProcessWorkerRuntime");
  });
});
```

- [ ] **Step 3: Implement BullMQ adapter**

In `packages/worker-runtime/src/index.ts`, add imports:

```ts
import { Job, Queue, type JobsOptions } from "bullmq";
```

Add options and class:

```ts
export interface BullMQWorkerRuntimeOptions {
  redisUrl: string;
  queueName?: string;
  prefix?: string;
  connectionTimeoutMs?: number;
}

export class BullMQWorkerRuntime implements WorkerRuntime {
  private readonly queueName: string;
  private readonly queue: Queue<QueueWorkerJob>;

  constructor(private readonly options: BullMQWorkerRuntimeOptions) {
    this.queueName = options.queueName ?? "psf-worker-jobs";
    this.queue = new Queue<QueueWorkerJob>(this.queueName, {
      connection: { url: options.redisUrl },
      prefix: options.prefix ?? "psf",
    });
  }

  async run(job: WorkerJob, handler: (job: WorkerJob) => Promise<WorkerHandlerResult>): Promise<WorkerRuntimeResult> {
    const runtime = new InProcessWorkerRuntime();
    return runtime.run(job, handler);
  }

  async enqueue(job: QueueWorkerJob): Promise<QueuedJobRecord> {
    const parsed = WorkerJobSchema.parse(job);
    const options: JobsOptions = {
      jobId: parsed.id,
      priority: parsed.priority,
      attempts: parsed.attempts,
      removeOnComplete: false,
      removeOnFail: false,
      timeout: parsed.timeoutMs,
    };
    const added = await this.queue.add(parsed.type, parsed, options);
    return mapBullJob(added, parsed);
  }

  async getJob(jobId: string): Promise<QueuedJobRecord | null> {
    const job = await this.queue.getJob(jobId);
    return job ? mapBullJob(job, WorkerJobSchema.parse(job.data)) : null;
  }

  async getJobStatus(jobId: string): Promise<WorkerJobStatus | null> {
    const job = await this.getJob(jobId);
    return job?.status ?? null;
  }

  async cancelJob(jobId: string): Promise<QueuedJobRecord> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Queue job not found: ${jobId}`);
    const state = await job.getState();
    if (state === "completed") throw new Error(`Cannot cancel completed job ${jobId}`);
    await job.remove();
    const parsed = WorkerJobSchema.parse(job.data);
    return {
      id: jobId,
      status: "cancelled",
      job: parsed,
      attemptsMade: job.attemptsMade,
      createdAt: parsed.createdAt,
      updatedAt: new Date().toISOString(),
    };
  }

  async retryJob(jobId: string): Promise<QueuedJobRecord> {
    const current = await this.getJob(jobId);
    if (!current) throw new Error(`Queue job not found: ${jobId}`);
    if (current.status !== "failed" && current.status !== "cancelled") {
      throw new Error(`Only failed or cancelled jobs can be retried: ${jobId}`);
    }
    const retry = buildWorkerJob({
      ...current.job,
      id: `job-${randomUUID()}`,
      idempotencyKey: `${current.job.idempotencyKey}:retry:${current.attemptsMade + 1}`,
      now: new Date().toISOString(),
    });
    return this.enqueue(retry);
  }

  async listJobs(filter: ListJobsFilter = {}): Promise<QueuedJobRecord[]> {
    const bullStatuses = filter.status ? [toBullStatus(filter.status)] : ["waiting", "active", "completed", "failed", "delayed", "paused"];
    const jobs = await this.queue.getJobs(bullStatuses);
    return jobs
      .map((job) => mapBullJob(job, WorkerJobSchema.parse(job.data)))
      .filter((record) => matchesFilter(record, filter));
  }

  async getQueueStats(): Promise<QueueStats> {
    try {
      const counts = await this.queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
      return {
        runtime: "bullmq",
        redisConfigured: true,
        redisReachable: true,
        queueName: this.queueName,
        counts: {
          queued: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          cancelled: 0,
          delayed: counts.delayed ?? 0,
        },
      };
    } catch (error) {
      throw new Error(`Redis is not reachable for BullMQ queue ${this.queueName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
```

Add helpers:

```ts
function mapBullJob(job: Job<QueueWorkerJob>, parsed: QueueWorkerJob): QueuedJobRecord {
  return {
    id: String(job.id ?? parsed.id),
    status: mapBullStateToWorkerJobStatus(job),
    job: parsed,
    attemptsMade: job.attemptsMade,
    createdAt: parsed.createdAt,
    updatedAt: new Date(job.timestamp).toISOString(),
    ...(job.failedReason ? { error: job.failedReason } : {}),
  };
}

function mapBullStateToWorkerJobStatus(job: Job<QueueWorkerJob>): WorkerJobStatus {
  if (job.finishedOn && !job.failedReason) return "completed";
  if (job.failedReason) return "failed";
  return "queued";
}

function toBullStatus(status: WorkerJobStatus): "waiting" | "active" | "completed" | "failed" | "delayed" | "paused" {
  if (status === "queued" || status === "cancelled") return "waiting";
  if (status === "active") return "active";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "delayed") return "delayed";
  return "waiting";
}

function matchesFilter(record: QueuedJobRecord, filter: ListJobsFilter): boolean {
  if (filter.status && record.status !== filter.status) return false;
  if (filter.missionId && record.job.missionId !== filter.missionId) return false;
  if (filter.workerRunId && record.job.workerRunId !== filter.workerRunId) return false;
  if (filter.type && record.job.type !== filter.type) return false;
  return true;
}

export function createWorkerRuntimeFromEnv(options: { env?: NodeJS.ProcessEnv } = {}): WorkerRuntime {
  const env = options.env ?? process.env;
  if (env.PSF_WORKER_RUNTIME === "bullmq") {
    return new BullMQWorkerRuntime({
      redisUrl: env.PSF_REDIS_URL ?? "redis://127.0.0.1:6379",
      queueName: `${env.PSF_QUEUE_PREFIX ?? "psf"}-worker-jobs`,
      prefix: env.PSF_QUEUE_PREFIX ?? "psf",
    });
  }
  return new InProcessWorkerRuntime();
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @psf/worker-runtime test
```

Expected: pass without Redis.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/worker-runtime/package.json packages/worker-runtime/src/index.ts packages/worker-runtime/tests/worker-runtime.test.ts pnpm-lock.yaml
git commit -m "增加可选 BullMQ 工作运行时" -m "为 @psf/worker-runtime 增加 BullMQWorkerRuntime、环境选择函数和无 Redis 可读错误测试，普通测试仍不依赖 Redis。"
```

Expected: commit succeeds.

---

## Task 4: Add Queued Action Mode In Orchestrator API

**Files:**
- Modify: `apps/orchestrator-api/package.json`
- Modify: `apps/orchestrator-api/src/actions.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Write queued action API tests**

Add tests in `apps/orchestrator-api/tests/api.test.ts`:

```ts
it("returns accepted response and wrapper WorkerRun in queued action mode", async () => {
  const storage = createInMemoryMissionStorage({ projects: [projectExample] });
  await seedDemoMission(storage);
  const server = buildServer({
    storage,
    auth: { disabled: true },
    actionExecutionMode: "queued",
    workerRuntime: new InProcessWorkerRuntime({ now: () => "2026-05-31T00:00:00.000Z" }),
  });

  const response = await server.inject({
    method: "POST",
    url: "/missions/mission-0001-ai-novelist-chapter-review/actions/qa-dry-run",
    payload: { withSampleBug: true },
  });

  expect(response.statusCode).toBe(202);
  const payload = response.json();
  expect(payload).toMatchObject({
    accepted: true,
    executionMode: "queued",
    missionId: "mission-0001-ai-novelist-chapter-review",
    status: "queued",
  });
  expect(payload.workerRunId).toMatch(/^worker-run-/);
  expect(payload.jobId).toMatch(/^job-/);

  const workerRun = await storage.getWorkerRun(payload.workerRunId);
  expect(workerRun?.status).toBe("queued");
  expect(workerRun?.metadata).toMatchObject({ jobId: payload.jobId, jobType: "qa.dry_run", queueWrapper: true });
});

it("keeps inline action behavior compatible", async () => {
  const storage = createInMemoryMissionStorage({ projects: [projectExample] });
  await seedDemoMission(storage);
  const server = buildServer({ storage, auth: { disabled: true }, actionExecutionMode: "inline" });

  const response = await server.inject({
    method: "POST",
    url: "/missions/mission-0001-ai-novelist-chapter-review/actions/qa-dry-run",
    payload: {},
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    accepted: true,
    executionMode: "inline",
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
  });
});
```

- [ ] **Step 2: Run focused API tests and verify failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- api.test.ts
```

Expected: fails because `actionExecutionMode`, `workerRuntime`, and queued response handling do not exist.

- [ ] **Step 3: Add server options**

In `apps/orchestrator-api/src/server.ts`, extend `BuildServerOptions`:

```ts
import type { WorkerRuntime } from "@psf/worker-runtime";

export interface BuildServerOptions {
  storage: MissionStorage;
  auth?: ApiAuthOptions;
  registryRoot?: string;
  actionExecutionMode?: "inline" | "queued";
  workerRuntime?: WorkerRuntime;
}
```

Pass options into service creation:

```ts
const services = createMissionServices(options.storage, {
  ...(registryRoot === undefined ? {} : { registryRoot }),
  actionExecutionMode: options.actionExecutionMode ?? process.env.PSF_ACTION_EXECUTION_MODE ?? "inline",
  ...(options.workerRuntime === undefined ? {} : { workerRuntime: options.workerRuntime }),
});
```

- [ ] **Step 4: Add queued action helpers**

In `apps/orchestrator-api/src/actions.ts`, export mappings:

```ts
import { buildWorkerJob, type QueueWorkerJob, type WorkerJobType } from "@psf/worker-runtime";

export type ActionExecutionMode = "inline" | "queued";

export interface QueuedActionInput {
  missionId: string;
  projectId: string;
  workerRunId: string;
  jobType: WorkerJobType;
  body: unknown;
}

export function buildQueuedActionJob(input: QueuedActionInput): QueueWorkerJob {
  const request = parseActionRequest(MissionActionRequestSchema, input.body ?? {});
  return buildWorkerJob({
    missionId: input.missionId,
    projectId: input.projectId,
    workerRunId: input.workerRunId,
    type: input.jobType,
    payload: { withSampleBug: request.withSampleBug ?? false },
    idempotencyKey: `${input.missionId}:${input.jobType}:${input.workerRunId}`,
  });
}

export function toInlineActionResponse(result: DemoWorkflowResult) {
  return {
    accepted: true,
    executionMode: "inline",
    ...toActionResponse(result),
  };
}

export function toQueuedActionResponse(input: {
  workerRunId: string;
  jobId: string;
  missionId: string;
  projectId: string;
}) {
  return {
    accepted: true,
    executionMode: "queued",
    workerRunId: input.workerRunId,
    jobId: input.jobId,
    missionId: input.missionId,
    projectId: input.projectId,
    status: "queued",
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    recommendedNextAction: "Start or refresh Worker Runner, then refresh Mission Summary.",
  };
}
```

Update existing inline action functions to return `toInlineActionResponse(result)`.

- [ ] **Step 5: Implement queued path in services**

In `apps/orchestrator-api/src/services.ts`, import runtime helpers:

```ts
import { buildQueuedActionJob, toQueuedActionResponse, type ActionExecutionMode } from "./actions.js";
import { createWorkerRuntimeFromEnv, type WorkerRuntime, type WorkerJobType } from "@psf/worker-runtime";
```

Extend service options:

```ts
export interface MissionServicesOptions {
  registryRoot?: string;
  actionExecutionMode?: ActionExecutionMode;
  workerRuntime?: WorkerRuntime;
}
```

Create helpers:

```ts
const actionExecutionMode = options.actionExecutionMode ?? "inline";
const workerRuntime = options.workerRuntime ?? createWorkerRuntimeFromEnv();

async function runActionOrEnqueue(input: {
  missionId: string;
  body: unknown;
  jobType: WorkerJobType;
  inline: () => Promise<unknown>;
}) {
  const mission = await getRawMission(input.missionId);
  if (actionExecutionMode === "inline") {
    return sanitizeApiResponse(await input.inline());
  }

  const now = new Date().toISOString();
  const workerRun: WorkerRun = {
    id: "worker-run-" + randomUUID(),
    mission_id: mission.id,
    worker_type: "integration",
    status: "queued",
    mode: "dry-run",
    input: { missionId: mission.id, projectId: mission.project_id, jobType: input.jobType },
    output: {},
    logs: [],
    metadata: { queueWrapper: true, jobType: input.jobType },
    created_at: now,
    updated_at: now,
  };

  const job = buildQueuedActionJob({
    missionId: mission.id,
    projectId: mission.project_id,
    workerRunId: workerRun.id,
    jobType: input.jobType,
    body: input.body,
  });

  const queued = await workerRuntime.enqueue(job);
  const queuedWorkerRun: WorkerRun = {
    ...workerRun,
    metadata: { ...workerRun.metadata, jobId: queued.id, jobType: input.jobType },
    output: { jobId: queued.id, jobType: input.jobType },
  };
  const event = buildEvent(mission.id, "worker_run.queued", "Worker run queued", {
    worker_run_id: queuedWorkerRun.id,
    job_id: queued.id,
    job_type: input.jobType,
  }, now);
  await storage.createWorkerRun({ resource: queuedWorkerRun, event });

  return sanitizeApiResponse(toQueuedActionResponse({
    workerRunId: queuedWorkerRun.id,
    jobId: queued.id,
    missionId: mission.id,
    projectId: mission.project_id,
  }));
}
```

Replace mission action methods:

```ts
async runQaDryRunAction(id: string, body: unknown) {
  return runActionOrEnqueue({
    missionId: id,
    body,
    jobType: "qa.dry_run",
    inline: () => runQaDryRunDryRunAction(id, body),
  });
}
```

Use analogous mappings:

- `plan` -> `mission.plan`
- `codex-dry-run` -> `codex.dry_run`
- `fix-dry-run` -> `fix.dry_run`
- `loop-dry-run` -> `loop.dry_run`

- [ ] **Step 6: Run focused API tests**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- api.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/orchestrator-api/package.json apps/orchestrator-api/src/actions.ts apps/orchestrator-api/src/server.ts apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "支持动作接口队列模式" -m "为 Orchestrator action API 增加 inline 和 queued 双模式，queued 模式创建 wrapper WorkerRun 并入队白名单 job。"
```

Expected: commit succeeds.

---

## Task 5: Add Queue API Cancel Retry And WorkerRun Listing

**Files:**
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Write failing Queue API tests**

Add to `apps/orchestrator-api/tests/api.test.ts`:

```ts
it("returns queue status", async () => {
  const runtime = new InProcessWorkerRuntime();
  const storage = createInMemoryMissionStorage({ projects: [projectExample] });
  await seedDemoMission(storage);
  const server = buildServer({ storage, auth: { disabled: true }, workerRuntime: runtime });

  const response = await server.inject({ method: "GET", url: "/queues/status" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    runtime: "in-process",
    redisConfigured: false,
    counts: expect.objectContaining({ queued: expect.any(Number) }),
  });
});

it("cancels only a queued wrapper WorkerRun", async () => {
  const runtime = new InProcessWorkerRuntime({ now: () => "2026-05-31T00:00:00.000Z" });
  const storage = createInMemoryMissionStorage({ projects: [projectExample] });
  await seedDemoMission(storage);
  const server = buildServer({ storage, auth: { disabled: true }, actionExecutionMode: "queued", workerRuntime: runtime });

  const accepted = await server.inject({
    method: "POST",
    url: "/missions/mission-0001-ai-novelist-chapter-review/actions/qa-dry-run",
    payload: {},
  });
  const workerRunId = accepted.json().workerRunId;

  const cancelled = await server.inject({ method: "POST", url: `/worker-runs/${workerRunId}/cancel` });

  expect(cancelled.statusCode).toBe(200);
  expect(cancelled.json()).toMatchObject({ id: workerRunId, status: "cancelled" });
  expect((await storage.getWorkerRun(workerRunId))?.status).toBe("cancelled");
});

it("rejects retry for succeeded wrapper WorkerRuns", async () => {
  const storage = createInMemoryMissionStorage({
    projects: [projectExample],
    workerRuns: [{
      id: "worker-run-wrapper-succeeded",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      worker_type: "integration",
      status: "succeeded",
      mode: "dry-run",
      input: {},
      output: { jobId: "job-1", jobType: "qa.dry_run" },
      logs: [],
      metadata: { queueWrapper: true, jobId: "job-1", jobType: "qa.dry_run" },
      created_at: "2026-05-31T00:00:00.000Z",
      updated_at: "2026-05-31T00:00:00.000Z",
    }],
  });
  await seedDemoMission(storage);
  const server = buildServer({ storage, auth: { disabled: true } });

  const response = await server.inject({ method: "POST", url: "/worker-runs/worker-run-wrapper-succeeded/retry" });

  expect(response.statusCode).toBe(400);
  expect(response.json().message).toMatch(/failed or cancelled/i);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- api.test.ts
```

Expected: fails because queue routes do not exist.

- [ ] **Step 3: Add routes**

In `apps/orchestrator-api/src/server.ts`:

```ts
server.get("/queues/status", async () => services.getQueueStatus());
server.get<{ Params: { jobId: string } }>("/jobs/:jobId", async (request) => services.getJob(request.params.jobId));
server.get("/worker-runs", async (request) => services.listWorkerRuns(request.query));
server.post<{ Params: { id: string } }>("/worker-runs/:id/cancel", async (request) => services.cancelWorkerRun(request.params.id));
server.post<{ Params: { id: string } }>("/worker-runs/:id/retry", async (request) => services.retryWorkerRun(request.params.id));
```

- [ ] **Step 4: Add service methods**

In `apps/orchestrator-api/src/services.ts`, add query schema:

```ts
const ListWorkerRunsQuerySchema = z.object({
  status: WorkerRunStatusSchema.optional(),
  missionId: z.string().optional(),
  workerType: WorkerTypeSchema.optional(),
}).strict();
```

Add helpers:

```ts
function requireQueueWrapper(workerRun: WorkerRun): { jobId: string; jobType: string } {
  const jobId = typeof workerRun.metadata.jobId === "string" ? workerRun.metadata.jobId : undefined;
  const jobType = typeof workerRun.metadata.jobType === "string" ? workerRun.metadata.jobType : undefined;
  if (!jobId || !jobType || workerRun.metadata.queueWrapper !== true) {
    throw badRequest("VALIDATION_ERROR", "WorkerRun is not a queue wrapper WorkerRun", { worker_run_id: workerRun.id });
  }
  return { jobId, jobType };
}
```

Add methods:

```ts
async getQueueStatus() {
  return sanitizeApiResponse(await workerRuntime.getQueueStats());
},
async getJob(jobId: string) {
  const job = await workerRuntime.getJob(jobId);
  if (!job) throw notFound("Job", jobId);
  return sanitizeApiResponse(job);
},
async listWorkerRuns(query: unknown) {
  const input = parseRequest(ListWorkerRunsQuerySchema, query ?? {});
  const runs = await storage.listAllWorkerRuns();
  return sanitizeApiList(runs.filter((run) => {
    if (input.status && run.status !== input.status) return false;
    if (input.missionId && run.mission_id !== input.missionId) return false;
    if (input.workerType && run.worker_type !== input.workerType) return false;
    return true;
  }));
},
async cancelWorkerRun(id: string) {
  const current = await getRawWorkerRun(id);
  const { jobId } = requireQueueWrapper(current);
  if (current.status !== "queued" && current.status !== "running") {
    throw badRequest("VALIDATION_ERROR", "Only queued or running wrapper WorkerRuns can be cancelled", { worker_run_id: id, status: current.status });
  }
  await workerRuntime.cancelJob(jobId);
  const now = new Date().toISOString();
  const updated = { ...current, status: "cancelled" as const, updated_at: now, output: { ...current.output, jobId, cancelledAt: now } };
  const event = buildEvent(current.mission_id, "worker_run.cancelled", "Worker run cancelled", { worker_run_id: id, job_id: jobId }, now);
  return sanitizeApiResponse(await storage.updateWorkerRun({ resource: updated, event }));
},
async retryWorkerRun(id: string) {
  const current = await getRawWorkerRun(id);
  const { jobId, jobType } = requireQueueWrapper(current);
  if (current.status !== "failed" && current.status !== "cancelled") {
    throw badRequest("VALIDATION_ERROR", "Only failed or cancelled wrapper WorkerRuns can be retried", { worker_run_id: id, status: current.status });
  }
  const retried = await workerRuntime.retryJob(jobId);
  const now = new Date().toISOString();
  const updated = {
    ...current,
    status: "queued" as const,
    error: "",
    output: { ...current.output, jobId: retried.id, previousJobId: jobId, jobType, retryAttempt: ((Number(current.output.retryAttempt) || 0) + 1) },
    metadata: { ...current.metadata, jobId: retried.id, previousJobId: jobId, jobType },
    updated_at: now,
  };
  const event = buildEvent(current.mission_id, "worker_run.retried", "Worker run retried", { worker_run_id: id, job_id: retried.id, previous_job_id: jobId }, now);
  return sanitizeApiResponse(await storage.updateWorkerRun({ resource: updated, event }));
},
```

- [ ] **Step 5: Run API tests**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- api.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/orchestrator-api/src/server.ts apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "补齐队列状态和重试取消接口" -m "新增 Queue API、WorkerRun 查询、指定 wrapper WorkerRun 的 cancel/retry，并保持白名单和 token 保护边界。"
```

Expected: commit succeeds.

---

## Task 6: Add Worker Runner App And Job Handlers

**Files:**
- Modify: `apps/orchestrator-api/package.json`
- Create: `apps/worker-runner/package.json`
- Create: `apps/worker-runner/tsconfig.json`
- Create: `apps/worker-runner/README.md`
- Create: `apps/worker-runner/src/handlers.ts`
- Create: `apps/worker-runner/src/runner.ts`
- Create: `apps/worker-runner/src/index.ts`
- Create: `apps/worker-runner/tests/runner.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing runner tests**

Create `apps/worker-runner/tests/runner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWorkerJob } from "@psf/worker-runtime";
import { createInMemoryMissionStorage } from "@psf/orchestrator-api/storage";
import { processWorkerJob } from "../src/runner.js";

describe("worker runner", () => {
  it("updates wrapper WorkerRun to succeeded and records child ids", async () => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [{
        id: "worker-run-wrapper",
        mission_id: "mission-0001-ai-novelist-chapter-review",
        worker_type: "integration",
        status: "queued",
        mode: "dry-run",
        input: {},
        output: {},
        logs: [],
        metadata: { queueWrapper: true, jobId: "job-qa", jobType: "qa.dry_run" },
        created_at: "2026-05-31T00:00:00.000Z",
        updated_at: "2026-05-31T00:00:00.000Z",
      }],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run",
      payload: { withSampleBug: false },
      now: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: async () => ({
        childWorkerRunIds: ["worker-run-child-qa"],
        childQARunIds: ["qa-run-child"],
        childArtifactIds: ["artifact-qa-report"],
        childBugReportIds: [],
        summary: "QA dry-run completed.",
        recommendedNextAction: "Refresh Mission Summary.",
      }),
      now: () => "2026-05-31T00:01:00.000Z",
    });

    const wrapper = await storage.getWorkerRun("worker-run-wrapper");
    expect(wrapper?.status).toBe("succeeded");
    expect(wrapper?.output).toMatchObject({
      jobId: "job-qa",
      jobType: "qa.dry_run",
      childWorkerRunIds: ["worker-run-child-qa"],
      childQARunIds: ["qa-run-child"],
    });
    expect(await storage.listMissionEvents("mission-0001-ai-novelist-chapter-review")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "worker_run.running" }),
        expect.objectContaining({ type: "worker_run.succeeded" }),
      ]),
    );
  });

  it("records failed wrapper WorkerRun errors without leaking secrets", async () => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [{
        id: "worker-run-wrapper",
        mission_id: "mission-0001-ai-novelist-chapter-review",
        worker_type: "integration",
        status: "queued",
        mode: "dry-run",
        input: {},
        output: {},
        logs: [],
        metadata: { queueWrapper: true, jobId: "job-loop", jobType: "loop.dry_run" },
        created_at: "2026-05-31T00:00:00.000Z",
        updated_at: "2026-05-31T00:00:00.000Z",
      }],
    });
    const job = buildWorkerJob({
      id: "job-loop",
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "loop.dry_run",
      payload: {},
      now: "2026-05-31T00:00:00.000Z",
    });

    await expect(processWorkerJob({
      job,
      storage,
      handler: async () => {
        throw new Error("failed with token secret-value");
      },
      now: () => "2026-05-31T00:01:00.000Z",
    })).rejects.toThrow("failed");

    const wrapper = await storage.getWorkerRun("worker-run-wrapper");
    expect(wrapper?.status).toBe("failed");
    expect(wrapper?.error).not.toContain("secret-value");
  });
});
```

- [ ] **Step 2: Run runner tests and verify failure**

Run:

```bash
pnpm --filter @psf/worker-runner test
```

Expected: fails because package and runner code do not exist.

- [ ] **Step 3: Expose Orchestrator storage subpath**

Modify `apps/orchestrator-api/package.json`:

```json
"exports": {
  "./storage": "./src/storage.ts",
  "./server": "./src/server.ts"
}
```

This lets Worker Runner import the existing storage abstraction without duplicating it.

- [ ] **Step 4: Create package scaffold**

Create `apps/worker-runner/package.json`:

```json
{
  "name": "@psf/worker-runner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "scripts": {
    "dev": "tsx src/index.ts start",
    "once": "tsx src/index.ts once",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests",
    "build": "tsc"
  },
  "dependencies": {
    "@psf/db": "workspace:*",
    "@psf/demo-workflow": "workspace:*",
    "@psf/integrations": "workspace:*",
    "@psf/mission-schema": "workspace:*",
    "@psf/orchestrator-api": "workspace:*",
    "@psf/worker-runtime": "workspace:*",
    "bullmq": "^5.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  },
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Create `apps/worker-runner/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Create `apps/worker-runner/README.md`:

```md
# Worker Runner

Consumes whitelisted Personal Software Factory dry-run queue jobs. It updates queue wrapper WorkerRuns and reuses existing demo workflow, QA dry-run, Codex dry-run, Auto Fix Loop dry-run, and integration dry-run handlers.

It does not execute Codex, push, create PRs, deploy, or call external providers.
```

- [ ] **Step 5: Implement handler contract**

Create `apps/worker-runner/src/handlers.ts`:

```ts
import {
  runAiNovelistDemo,
  runCodexDryRun,
  runFixDryRun,
  runLoopDryRun,
  runMissionPlan,
  runQaDryRun,
} from "@psf/demo-workflow";
import { runIntegrationDryRun, type ExternalIntegrationName } from "@psf/integrations";
import type { QueueWorkerJob } from "@psf/worker-runtime";

export interface WorkerJobHandlerResult {
  childWorkerRunIds: string[];
  childQARunIds: string[];
  childArtifactIds: string[];
  childBugReportIds: string[];
  summary: string;
  recommendedNextAction: string;
}

export type WorkerJobHandler = (job: QueueWorkerJob) => Promise<WorkerJobHandlerResult>;

export function createDefaultJobHandler(cwd = process.cwd()): WorkerJobHandler {
  return async (job) => {
    if (job.type === "integration.dry_run") {
      const name = String(job.payload.name ?? "github") as ExternalIntegrationName;
      const result = runIntegrationDryRun(name, { env: process.env });
      return {
        childWorkerRunIds: [],
        childQARunIds: [],
        childArtifactIds: [],
        childBugReportIds: [],
        summary: result.message,
        recommendedNextAction: "Review integration dry-run output.",
      };
    }

    const withSampleBug = job.type === "qa.dry_run_with_sample_bug" || job.payload.withSampleBug === true;
    const options = { cwd, skipDb: false, withSampleBug };
    const result = job.type === "mission.plan"
      ? await runMissionPlan(options)
      : job.type === "codex.dry_run"
        ? await runCodexDryRun(options)
        : job.type === "qa.dry_run" || job.type === "qa.dry_run_with_sample_bug"
          ? await runQaDryRun(options)
          : job.type === "fix.dry_run"
            ? await runFixDryRun(options)
            : job.type === "loop.dry_run"
              ? await runLoopDryRun(options)
              : await runAiNovelistDemo(options);

    return {
      childWorkerRunIds: result.workerRunIds,
      childQARunIds: result.qaRunIds,
      childArtifactIds: result.generatedArtifacts,
      childBugReportIds: result.bugIds,
      summary: result.message,
      recommendedNextAction: result.message,
    };
  };
}
```

- [ ] **Step 6: Implement runner state transitions**

Create `apps/worker-runner/src/runner.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { MissionEvent, WorkerRun } from "@psf/mission-schema";
import type { MissionStorage } from "@psf/orchestrator-api/storage";
import type { QueueWorkerJob } from "@psf/worker-runtime";
import type { WorkerJobHandler, WorkerJobHandlerResult } from "./handlers.js";

export interface ProcessWorkerJobInput {
  job: QueueWorkerJob;
  storage: MissionStorage;
  handler: WorkerJobHandler;
  now?: () => string;
}

export async function processWorkerJob(input: ProcessWorkerJobInput): Promise<WorkerRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const wrapper = await input.storage.getWorkerRun(input.job.workerRunId);
  if (!wrapper) {
    throw new Error(`Wrapper WorkerRun not found: ${input.job.workerRunId}`);
  }

  await updateWrapper(input.storage, wrapper, "running", input.job, now(), {
    jobId: input.job.id,
    jobType: input.job.type,
    summary: "Queue job is running.",
  });

  try {
    const result = await input.handler(input.job);
    return await updateWrapper(input.storage, wrapper, "succeeded", input.job, now(), buildSafeOutput(input.job, result));
  } catch (error) {
    const message = redactMessage(error instanceof Error ? error.message : String(error));
    await updateWrapper(input.storage, wrapper, "failed", input.job, now(), {
      jobId: input.job.id,
      jobType: input.job.type,
      summary: "Queue job failed.",
      recommendedNextAction: "Inspect WorkerRun error and retry after fixing the cause.",
    }, message);
    throw error;
  }
}

function buildSafeOutput(job: QueueWorkerJob, result: WorkerJobHandlerResult): Record<string, unknown> {
  return {
    jobId: job.id,
    jobType: job.type,
    childWorkerRunIds: result.childWorkerRunIds,
    childQARunIds: result.childQARunIds,
    childArtifactIds: result.childArtifactIds,
    childBugReportIds: result.childBugReportIds,
    summary: result.summary,
    recommendedNextAction: result.recommendedNextAction,
  };
}

async function updateWrapper(
  storage: MissionStorage,
  current: WorkerRun,
  status: WorkerRun["status"],
  job: QueueWorkerJob,
  timestamp: string,
  output: Record<string, unknown>,
  error = "",
): Promise<WorkerRun> {
  const updated: WorkerRun = {
    ...current,
    status,
    output: { ...current.output, ...output },
    error,
    ...(status === "running" ? { started_at: current.started_at ?? timestamp } : {}),
    ...(status === "succeeded" || status === "failed" || status === "cancelled" ? { finished_at: timestamp } : {}),
    updated_at: timestamp,
  };
  const event: MissionEvent = {
    id: `event-${current.id}-${status}-${randomUUID()}`,
    mission_id: current.mission_id,
    type: `worker_run.${status}`,
    message: `Queue wrapper WorkerRun ${status}`,
    payload: { worker_run_id: current.id, job_id: job.id, job_type: job.type },
    created_at: timestamp,
  };
  return storage.updateWorkerRun({ resource: updated, event });
}

function redactMessage(message: string): string {
  return message
    .replaceAll(/token\s+[A-Za-z0-9._-]+/gi, "token [REDACTED]")
    .replaceAll(/password\s+[^\s]+/gi, "password [REDACTED]")
    .replaceAll("secret-value", "[REDACTED]");
}
```

- [ ] **Step 7: Implement runner entrypoint**

Create `apps/worker-runner/src/index.ts`:

```ts
import { Worker } from "bullmq";
import { prisma } from "@psf/db";
import { createPrismaMissionStorage } from "@psf/orchestrator-api/storage";
import { WorkerJobSchema } from "@psf/worker-runtime";
import { createDefaultJobHandler } from "./handlers.js";
import { processWorkerJob } from "./runner.js";

async function main() {
  const mode = process.argv[2] ?? "start";
  const redisUrl = process.env.PSF_REDIS_URL ?? "redis://127.0.0.1:6379";
  const queueName = `${process.env.PSF_QUEUE_PREFIX ?? "psf"}-worker-jobs`;
  const storage = createPrismaMissionStorage(prisma);
  const handler = createDefaultJobHandler(process.cwd());
  const concurrency = Number(process.env.PSF_WORKER_CONCURRENCY ?? "2");

  const worker = new Worker(queueName, async (job) => {
    const parsed = WorkerJobSchema.parse(job.data);
    return processWorkerJob({ job: parsed, storage, handler });
  }, { connection: { url: redisUrl }, concurrency });

  if (mode === "once") {
    const timeout = setTimeout(async () => {
      await worker.close();
      await prisma.$disconnect();
      process.exit(0);
    }, 1000);
    worker.on("completed", async () => {
      clearTimeout(timeout);
      await worker.close();
      await prisma.$disconnect();
      process.exit(0);
    });
    worker.on("failed", async () => {
      clearTimeout(timeout);
      await worker.close();
      await prisma.$disconnect();
      process.exit(1);
    });
    return;
  }

  process.once("SIGINT", async () => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 8: Add root scripts**

Modify root `package.json` scripts:

```json
"worker:dev": "pnpm --filter @psf/worker-runner dev",
"worker:once": "pnpm --filter @psf/worker-runner once"
```

- [ ] **Step 9: Run runner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/worker-runner typecheck
```

Expected: pass.

- [ ] **Step 10: Commit**

Run:

```bash
git add apps/orchestrator-api/package.json apps/worker-runner package.json pnpm-lock.yaml
git commit -m "新增队列 Worker Runner" -m "添加 Worker Runner 应用、白名单 job handler、wrapper WorkerRun 状态更新和安全输出映射，继续复用现有 dry-run workflow。"
```

Expected: commit succeeds.

---

## Task 7: Add Queue CLI Commands

**Files:**
- Modify: `scripts/psf.ts`
- Modify: `scripts/psf.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Append to `scripts/psf.test.ts`:

```ts
it("prints queue status without leaking secrets", async () => {
  const result = await runPsfCli(["queues:status"], {
    cwd: testCwd,
    syncDatabase: false,
    env: { ...process.env, PSF_WORKER_RUNTIME: "in-process", PSF_API_TOKEN: "secret-token" },
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("\"runtime\"");
  expect(result.stdout).not.toContain("secret-token");
});

it("rejects worker-run cancel without id", async () => {
  const result = await runPsfCli(["worker-runs:cancel"], { cwd: testCwd, syncDatabase: false });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Usage: pnpm psf worker-runs:cancel <workerRunId>");
});
```

- [ ] **Step 2: Run CLI tests and verify failure**

Run:

```bash
pnpm test:scripts
```

Expected: fails because commands do not exist.

- [ ] **Step 3: Add command names and dispatch**

In `scripts/psf.ts`, extend `CliCommand`:

```ts
type CliCommand =
  | "projects:sync"
  | "mission:create"
  | "mission:plan"
  | "codex:dry-run"
  | "qa:dry-run"
  | "qa:playwright"
  | "fix:dry-run"
  | "loop:dry-run"
  | "integrations:status"
  | "integrations:dry-run"
  | "doctor"
  | "demo:seed"
  | "demo:reset"
  | "demo:ai-novelist"
  | "demo:report"
  | "queues:status"
  | "worker:start"
  | "worker:once"
  | "worker-runs:list"
  | "worker-runs:cancel"
  | "worker-runs:retry";
```

Add cases:

```ts
case "queues:status":
  await queuesStatusCommand(context, args);
  break;
case "worker:start":
  await workerStartCommand(context, args, "start");
  break;
case "worker:once":
  await workerStartCommand(context, args, "once");
  break;
case "worker-runs:list":
  await workerRunsListCommand(context, args);
  break;
case "worker-runs:cancel":
  await workerRunControlCommand(context, args, "cancel");
  break;
case "worker-runs:retry":
  await workerRunControlCommand(context, args, "retry");
  break;
```

- [ ] **Step 4: Implement CLI helpers**

Add imports:

```ts
import { createWorkerRuntimeFromEnv } from "@psf/worker-runtime";
```

Add commands:

```ts
async function queuesStatusCommand(context: CliContext, args: string[]): Promise<void> {
  if (args.length > 0) throw new PsfCliError("USAGE", "Usage: pnpm psf queues:status");
  const runtime = createWorkerRuntimeFromEnv({ env: context.env });
  try {
    context.stdout.push(JSON.stringify(await runtime.getQueueStats(), null, 2));
  } finally {
    await runtime.close();
  }
}

async function workerStartCommand(_context: CliContext, args: string[], mode: "start" | "once"): Promise<void> {
  if (args.length > 0) throw new PsfCliError("USAGE", `Usage: pnpm psf worker:${mode === "start" ? "start" : "once"}`);
  throw new PsfCliError("WORKER_RUNNER_SCRIPT", `Use pnpm worker:${mode === "start" ? "dev" : "once"} to start the Worker Runner process.`, 0);
}

async function workerRunsListCommand(context: CliContext, args: string[]): Promise<void> {
  parseFlags(args, new Set(["--json"]), "Usage: pnpm psf worker-runs:list [--json]");
  context.stdout.push("Use GET /worker-runs for live WorkerRun listing. CLI DB listing is not enabled in artifact-only mode.");
}

async function workerRunControlCommand(_context: CliContext, args: string[], action: "cancel" | "retry"): Promise<void> {
  const id = args[0];
  if (!id) throw new PsfCliError("USAGE", `Usage: pnpm psf worker-runs:${action} <workerRunId>`);
  throw new PsfCliError("API_REQUIRED", `Use POST /worker-runs/${id}/${action} through Orchestrator API so auth and queue runtime checks are enforced.`);
}
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
pnpm test:scripts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/psf.ts scripts/psf.test.ts
git commit -m "增加队列 CLI 入口" -m "为 psf CLI 增加 queue status、worker 启动提示和 WorkerRun 控制命令边界，避免任意命令执行和 token 泄露。"
```

Expected: commit succeeds.

---

## Task 8: Add Hub Queue Observability

**Files:**
- Modify: `apps/hub/src/api/types.ts`
- Modify: `apps/hub/src/api/client.ts`
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/src/styles.css`
- Modify: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Write failing Hub tests**

Add to `apps/hub/tests/hub.test.tsx`:

```tsx
it("renders queue status on dashboard", async () => {
  const client = createMockClient({
    dashboard: mockDashboard({
      queueStatus: {
        runtime: "bullmq",
        redisConfigured: true,
        redisReachable: true,
        queueName: "psf-worker-jobs",
        counts: { queued: 2, active: 1, completed: 3, failed: 1, cancelled: 0, delayed: 0 },
      },
    }),
  });

  render(<App client={client} />);

  expect(await screen.findByText("Queue Runtime")).toBeInTheDocument();
  expect(screen.getByText("bullmq")).toBeInTheDocument();
  expect(screen.getByText("2 queued")).toBeInTheDocument();
});

it("shows accepted queued action response with job id", async () => {
  const client = createMockClient({
    actionResponse: {
      accepted: true,
      executionMode: "queued",
      workerRunId: "worker-run-wrapper",
      jobId: "job-qa",
      missionId: "mission-0001-ai-novelist-chapter-review",
      status: "queued",
      recommendedNextAction: "Refresh Mission Summary.",
    },
  });

  render(<App client={client} initialView="mission-detail" initialMissionId="mission-0001-ai-novelist-chapter-review" />);
  await userEvent.click(await screen.findByRole("button", { name: /Run QA Dry-run/i }));

  expect(await screen.findByText(/job-qa/)).toBeInTheDocument();
  expect(screen.getByText(/worker-run-wrapper/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run Hub tests and verify failure**

Run:

```bash
pnpm --filter @psf/hub test
```

Expected: fails because queue fields are not rendered.

- [ ] **Step 3: Add types**

In `apps/hub/src/api/types.ts`:

```ts
export interface QueueStatus {
  runtime: "in-process" | "bullmq" | string;
  redisConfigured: boolean;
  redisReachable?: boolean;
  queueName: string;
  counts: {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    delayed: number;
  };
}

export interface QueuedActionResponse {
  accepted: true;
  executionMode: "queued";
  workerRunId: string;
  jobId: string;
  missionId: string;
  projectId?: string;
  status: "queued";
  recommendedNextAction: string;
}

export type ActionResponse = DryRunActionResponse | QueuedActionResponse;
```

Add optional `queueStatus?: QueueStatus` to `DashboardResponse`.

- [ ] **Step 4: Add client methods**

In `apps/hub/src/api/client.ts`, add:

```ts
getQueueStatus: () => request<QueueStatus>("/queues/status"),
listWorkerRuns: () => request<WorkerRun[]>("/worker-runs"),
cancelWorkerRun: (workerRunId: string) => request<WorkerRun>(`/worker-runs/${encodeURIComponent(workerRunId)}/cancel`, { method: "POST" }),
retryWorkerRun: (workerRunId: string) => request<WorkerRun>(`/worker-runs/${encodeURIComponent(workerRunId)}/retry`, { method: "POST" }),
```

- [ ] **Step 5: Render Dashboard queue status**

In `apps/hub/src/App.tsx`, add a compact queue section near health cards:

```tsx
function renderQueueStatus(queueStatus?: QueueStatus): ReactElement {
  if (!queueStatus) {
    return (
      <section className="panel queue-panel">
        <div className="panel-heading"><h2>Queue Runtime</h2></div>
        <p className="empty-line">Queue status is not available from this API response.</p>
      </section>
    );
  }

  return (
    <section className="panel queue-panel">
      <div className="panel-heading"><h2>Queue Runtime</h2></div>
      <div className="metric-grid compact">
        <div><strong>{queueStatus.runtime}</strong><span>runtime</span></div>
        <div><strong>{queueStatus.counts.queued}</strong><span>queued</span></div>
        <div><strong>{queueStatus.counts.active}</strong><span>running</span></div>
        <div><strong>{queueStatus.counts.failed}</strong><span>failed</span></div>
      </div>
      <p className="muted">{queueStatus.queueName} · {queueStatus.redisReachable === false ? "Redis unavailable" : "Redis status ok or not checked"}</p>
    </section>
  );
}
```

Call `renderQueueStatus(dashboard.queueStatus)` on Dashboard.

- [ ] **Step 6: Render accepted action output**

Where action success is currently shown, add:

```tsx
function renderActionResult(result: ActionResponse | null): ReactElement | null {
  if (!result) return null;
  if ("executionMode" in result && result.executionMode === "queued") {
    return (
      <div className="notice success">
        <strong>Queued dry-run accepted</strong>
        <span>WorkerRun: {result.workerRunId}</span>
        <span>Job: {result.jobId}</span>
        <span>{result.recommendedNextAction}</span>
      </div>
    );
  }
  return (
    <div className="notice success">
      <strong>Dry-run completed</strong>
      <span>{result.recommendedNextAction}</span>
    </div>
  );
}
```

- [ ] **Step 7: Style queue status**

In `apps/hub/src/styles.css`, add:

```css
.queue-panel .metric-grid.compact {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.notice.success span {
  display: block;
  margin-top: 4px;
}
```

- [ ] **Step 8: Run Hub tests**

Run:

```bash
pnpm --filter @psf/hub test
```

Expected: pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/hub/src/api/types.ts apps/hub/src/api/client.ts apps/hub/src/App.tsx apps/hub/src/styles.css apps/hub/tests/hub.test.tsx
git commit -m "展示队列状态和入队结果" -m "增强 Hub Dashboard 和 Mission Detail，展示 queue runtime、queued/running/failed 计数、accepted jobId 和 wrapper WorkerRun。"
```

Expected: commit succeeds.

---

## Task 9: Update Doctor Docs Env And Final Verification

**Files:**
- Modify: `.env.example`
- Modify: `packages/demo-workflow/src/doctor.ts`
- Modify: `packages/demo-workflow/tests/demo-workflow.test.ts`
- Create: `docs/queue-runtime.md`
- Create: `docs/real-codex-execution-readiness.md`
- Modify: `docs/worker-runtime.md`
- Modify: `docs/api.md`
- Modify: `docs/operations.md`
- Modify: `docs/troubleshooting.md`
- Modify: `docs/health-checks.md`
- Modify: `docs/local-development.md`
- Modify: `docs/safety.md`
- Modify: `docs/progress.md`
- Modify: `README.md`

- [ ] **Step 1: Write doctor queue tests**

Add to `packages/demo-workflow/tests/demo-workflow.test.ts`:

```ts
it("doctor reports queued mode Redis warning without leaking secrets", async () => {
  const result = await runDoctor({
    cwd: testCwd,
    env: {
      PSF_WORKER_RUNTIME: "bullmq",
      PSF_ACTION_EXECUTION_MODE: "queued",
      PSF_REDIS_URL: "redis://:secret-password@127.0.0.1:6379",
      PSF_API_TOKEN: "secret-token",
    },
    checkDatabase: false,
    checkApi: false,
    checkHub: false,
  });

  const rendered = formatDoctorResult(result, false);
  expect(rendered).toContain("PSF_WORKER_RUNTIME");
  expect(rendered).toContain("queued");
  expect(rendered).not.toContain("secret-password");
  expect(rendered).not.toContain("secret-token");
});
```

- [ ] **Step 2: Run focused demo-workflow tests and verify failure**

Run:

```bash
pnpm --filter @psf/demo-workflow test
```

Expected: fails because doctor does not report queue checks.

- [ ] **Step 3: Add env vars**

Append to `.env.example`:

```dotenv
# Queue-backed Worker Runtime
PSF_WORKER_RUNTIME=in-process
PSF_ACTION_EXECUTION_MODE=inline
PSF_REDIS_URL=redis://127.0.0.1:6379
PSF_QUEUE_PREFIX=psf
PSF_WORKER_CONCURRENCY=2
PSF_JOB_ATTEMPTS=2
PSF_JOB_TIMEOUT_MS=300000

# Optional Redis integration tests
PSF_TEST_REDIS=0
```

- [ ] **Step 4: Add doctor checks**

In `packages/demo-workflow/src/doctor.ts`, add checks:

```ts
checks.push({
  key: "PSF_WORKER_RUNTIME",
  status: env.PSF_WORKER_RUNTIME === "bullmq" ? "warning" : "ok",
  message: `Worker runtime is ${env.PSF_WORKER_RUNTIME ?? "in-process"}.`,
});
checks.push({
  key: "PSF_ACTION_EXECUTION_MODE",
  status: env.PSF_ACTION_EXECUTION_MODE === "queued" && env.PSF_WORKER_RUNTIME !== "bullmq" ? "warning" : "ok",
  message: `Action execution mode is ${env.PSF_ACTION_EXECUTION_MODE ?? "inline"}.`,
});
checks.push({
  key: "PSF_REDIS_URL",
  status: env.PSF_WORKER_RUNTIME === "bullmq" && !env.PSF_REDIS_URL ? "warning" : "ok",
  message: env.PSF_WORKER_RUNTIME === "bullmq"
    ? "Redis URL is required for BullMQ local mode. Use docker compose up -d redis."
    : "Redis is optional while worker runtime is in-process.",
});
```

Use the existing redaction helper before rendering details.

- [ ] **Step 5: Create queue docs**

Create `docs/queue-runtime.md`:

```md
# Queue Runtime

Phase 17B adds optional queued execution for dry-run actions.

## Inline Versus Queued

- `PSF_ACTION_EXECUTION_MODE=inline`: API executes the current dry-run workflow immediately.
- `PSF_ACTION_EXECUTION_MODE=queued`: API creates a queue wrapper WorkerRun and enqueues a whitelisted job.

## Queue Wrapper WorkerRun

The wrapper WorkerRun represents the queue job. Child planner, QA, Codex dry-run, fix, and demo WorkerRuns keep their existing semantics. The wrapper output records child ids in `childWorkerRunIds`, `childQARunIds`, `childArtifactIds`, and `childBugReportIds`.

## Local Redis

```bash
sudo docker compose up -d redis
```

## Queued Mode

```bash
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
```

Trigger a queued QA dry-run through Hub or API, then refresh Mission Detail to observe queued, running, succeeded, or failed status.

## Cancel And Retry

Cancel and retry target a specific wrapper WorkerRun. Cancel supports queued and delayed jobs. Active cancellation is best-effort and cooperative. Retry is allowed only for failed or cancelled wrapper WorkerRuns.

## Dry-Run Boundary

Queued mode still does not execute Codex, push, create PRs, deploy, or call external providers.
```

Create `docs/real-codex-execution-readiness.md`:

```md
# Real Codex Execution Readiness

Real Codex execution is not implemented in Phase 17B.

Before enabling it, the system needs queue-backed execution, workspace isolation, branch protection that rejects main/master, Approval gates, command policy, timeouts, cancel/retry support, WorkerRun audit records, artifact persistence, and explicit no-push defaults.

The future Codex Worker should consume a queued job, lease an isolated workspace, validate command policy, run with bounded timeout, persist logs and summaries as artifacts, update WorkerRun state, and stop before push or production deploy unless a later approved phase adds those actions.
```

- [ ] **Step 6: Update existing docs**

Edit docs to include the exact commands:

```bash
sudo docker compose up -d redis
PSF_WORKER_RUNTIME=bullmq PSF_ACTION_EXECUTION_MODE=queued pnpm dev:api
pnpm worker:dev
pnpm psf queues:status
pnpm psf worker-runs:cancel <workerRunId>
pnpm psf worker-runs:retry <workerRunId>
```

Update `docs/progress.md` with Phase 17B completed work, files changed, no Prisma migration unless implementation adds none, test commands, dry-run/mock boundaries, and next suggestions.

- [ ] **Step 7: Run focused docs and doctor tests**

Run:

```bash
pnpm --filter @psf/demo-workflow test
rg -n "real Codex execution is implemented|realNetworkCall: true|queue obliterate" docs README.md
```

Expected: tests pass; `rg` returns no misleading claims.

- [ ] **Step 8: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

Expected:

- `pnpm test`: pass without Redis.
- `pnpm typecheck`: pass.
- `pnpm build`: pass.
- `git diff --check`: no whitespace errors.
- `git status --short --branch`: only expected Phase 17B changes before final commit.

- [ ] **Step 9: Final commit**

Run:

```bash
git add .env.example README.md docs packages/demo-workflow/src/doctor.ts packages/demo-workflow/tests/demo-workflow.test.ts
git commit -m "完善队列运行时文档和医生检查" -m "补充 Phase 17B queue runtime 文档、真实 Codex 执行准备说明、环境变量、doctor 队列检查和进度记录。"
```

Expected: commit succeeds.

---

## Final Verification And Handoff

- [ ] **Step 1: Confirm branch**

Run:

```bash
git branch --show-current
```

Expected: `phase-17-queue-worker-runtime`.

- [ ] **Step 2: Run final gates**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

Expected: all checks pass; worktree is clean after final commit.

- [ ] **Step 3: Summarize results**

Final response must include:

- Completion summary.
- Current branch.
- Whether local commits were created.
- Added/modified files.
- Database migration note.
- New environment variables.
- New API list.
- New CLI list.
- How to start Redis, API, Worker Runner, Hub.
- How to trigger queued QA dry-run.
- How to view queue status.
- How to cancel/retry WorkerRun.
- Test results.
- Inline mode capability.
- Queued mode capability.
- Dry-run/mock boundaries.
- Explicitly not executed capabilities.
- Plan alignment.
- Recommended next phase order and risks.
