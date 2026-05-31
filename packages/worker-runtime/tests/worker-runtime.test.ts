import { describe, expect, it } from "vitest";
import {
  buildWorkerJob,
  BullMQWorkerRuntime,
  createWorkerRuntimeFromEnv,
  InProcessWorkerRuntime,
  QueueWorkerJobSchema,
  WorkerJobSchema,
  type QueuedJobRecord,
  type QueueWorkerJob,
  type WorkerJob,
} from "../src/index.js";

const job: WorkerJob = {
  id: "job-qa-001",
  missionId: "mission-001",
  projectId: "ai-novelist",
  workerType: "qa",
  mode: "dry-run",
  input: { dryRun: true },
  createdAt: "2026-05-31T10:00:00.000Z",
};

const queueJob: QueueWorkerJob = {
  id: "job-queue-001",
  missionId: "mission-001",
  projectId: "ai-novelist",
  workerRunId: "worker-run-queue-001",
  type: "qa.dry_run",
  mode: "dry-run",
  payload: { withSampleBug: false },
  idempotencyKey: "mission-001:qa.dry_run",
  priority: 5,
  attempts: 2,
  timeoutMs: 300000,
  createdAt: "2026-05-31T10:00:00.000Z",
};

describe("InProcessWorkerRuntime", () => {
  it("validates queue worker jobs with the QueueWorkerJobSchema", () => {
    expect(QueueWorkerJobSchema.parse(queueJob)).toMatchObject({
      id: "job-queue-001",
      type: "qa.dry_run",
      mode: "dry-run",
    });
  });

  it("keeps WorkerJobSchema as a compatibility alias", () => {
    expect(WorkerJobSchema).toBe(QueueWorkerJobSchema);
  });

  it("rejects arbitrary queue job types", () => {
    expect(() => QueueWorkerJobSchema.parse({ ...queueJob, type: "shell.exec" })).toThrow();
  });

  it("rejects sensitive payload keys before queue jobs can be built or enqueued", async () => {
    expect(() => buildWorkerJob({
      missionId: "mission-001",
      projectId: "ai-novelist",
      workerRunId: "worker-run-sensitive",
      type: "qa.dry_run",
      payload: { token: "secret" },
    })).toThrow(/sensitive/i);

    expect(() => buildWorkerJob({
      missionId: "mission-001",
      projectId: "ai-novelist",
      workerRunId: "worker-run-sensitive",
      type: "qa.dry_run",
      payload: { config: { password: "x" } },
    })).toThrow(/sensitive/i);

    const runtime = new InProcessWorkerRuntime();
    await expect(runtime.enqueue({ ...queueJob, payload: { authorization: "Bearer secret" } })).rejects.toThrow(/sensitive/i);
  });

  it("builds queue worker jobs with safe defaults", () => {
    const built = buildWorkerJob({
      missionId: "mission-001",
      projectId: "ai-novelist",
      workerRunId: "worker-run-queue-002",
      type: "loop.dry_run",
      payload: { withSampleBug: true },
    });

    expect(built).toMatchObject({
      missionId: "mission-001",
      projectId: "ai-novelist",
      workerRunId: "worker-run-queue-002",
      type: "loop.dry_run",
      mode: "dry-run",
      priority: 5,
      attempts: 2,
      timeoutMs: 300000,
    });
    expect(built.id).toMatch(/^job-/);
    expect(new Date(built.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("supports in-process enqueue, list, cancel, retry, and stats without Redis", async () => {
    const runtime = new InProcessWorkerRuntime({ now: () => "2026-05-31T10:03:00.000Z" });

    const queued = await runtime.enqueue(queueJob);
    expect(queued).toMatchObject({ job: queueJob, status: "queued", attemptsMade: 0 });

    await expect(runtime.getJob(queueJob.id)).resolves.toMatchObject({ status: "queued" });
    await expect(runtime.getJobStatus(queueJob.id)).resolves.toBe("queued");
    await expect(runtime.listJobs({ missionId: "mission-001", type: "qa.dry_run" })).resolves.toHaveLength(1);

    const cancelled = await runtime.cancelJob(queueJob.id);
    expect(cancelled).toMatchObject({ status: "cancelled" });

    const retry = await runtime.retryJob(queueJob.id);
    expect(retry.job).toMatchObject({
      missionId: queueJob.missionId,
      projectId: queueJob.projectId,
      workerRunId: queueJob.workerRunId,
      type: queueJob.type,
      payload: queueJob.payload,
    });
    expect(retry.job.id).not.toBe(queueJob.id);
    expect(retry.status).toBe("queued");

    await expect(runtime.getQueueStats()).resolves.toMatchObject({
      runtime: "in-process",
      redisConfigured: false,
      counts: {
        queued: 1,
        active: 0,
        completed: 0,
        failed: 0,
        cancelled: 1,
        delayed: 0,
      },
    });
  });

  it("does not cancel failed or completed jobs", async () => {
    const runtime = new InProcessWorkerRuntime();

    seedInProcessJob(runtime, { ...queueJob, id: "job-failed-001" }, "failed");
    seedInProcessJob(runtime, { ...queueJob, id: "job-completed-001" }, "completed");

    await expect(runtime.cancelJob("job-failed-001")).rejects.toThrow("Cannot cancel failed or completed jobs");
    await expect(runtime.cancelJob("job-completed-001")).rejects.toThrow("Cannot cancel failed or completed jobs");
  });

  it("does not retry jobs that have not failed or been cancelled", async () => {
    const runtime = new InProcessWorkerRuntime();

    await runtime.enqueue(queueJob);

    await expect(runtime.retryJob(queueJob.id)).rejects.toThrow("Only failed or cancelled jobs can be retried");
  });

  it("wraps successful handlers with WorkerRun and MissionEvent records", async () => {
    const runtime = new InProcessWorkerRuntime({ now: () => "2026-05-31T10:01:00.000Z" });

    const result = await runtime.run(job, async () => ({
      output: { generatedFiles: ["qa-report.md"] },
      logs: ["qa dry-run completed"],
    }));

    expect(result.workerRun).toMatchObject({
      id: "worker-run-job-qa-001",
      mission_id: "mission-001",
      worker_type: "qa",
      mode: "dry-run",
      status: "succeeded",
      output: { generatedFiles: ["qa-report.md"] },
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "worker_runtime.started",
      "worker_runtime.succeeded",
    ]);
  });

  it("records failure metadata and rethrows handler errors", async () => {
    const runtime = new InProcessWorkerRuntime({ now: () => "2026-05-31T10:02:00.000Z" });

    await expect(runtime.run(job, async () => {
      throw new Error("qa exploded");
    })).rejects.toThrow("qa exploded");

    expect(runtime.lastFailure?.workerRun).toMatchObject({
      id: "worker-run-job-qa-001",
      status: "failed",
      error: "qa exploded",
    });
    expect(runtime.lastFailure?.events.at(-1)?.type).toBe("worker_runtime.failed");
  });
});


describe("BullMQWorkerRuntime", () => {
  it("can be constructed and closed without requiring Redis to be reachable", async () => {
    const runtime = new BullMQWorkerRuntime({
      redisUrl: "redis://127.0.0.1:6399",
      queueName: "psf-worker-runtime-test",
      prefix: "psf-test",
      connectTimeoutMs: 50,
    });

    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it("returns a readable error when Redis is not reachable", async () => {
    const runtime = new BullMQWorkerRuntime({
      redisUrl: "redis://127.0.0.1:6399",
      queueName: "psf-worker-runtime-test",
      prefix: "psf-test",
      connectTimeoutMs: 50,
    });

    await expect(runtime.getQueueStats()).rejects.toThrow(/Redis is not reachable/i);
    await runtime.close();
  });
});

describe("createWorkerRuntimeFromEnv", () => {
  it("defaults to the in-process runtime", () => {
    expect(createWorkerRuntimeFromEnv({ env: {} })).toBeInstanceOf(InProcessWorkerRuntime);
  });

  it("creates the BullMQ runtime when PSF_WORKER_RUNTIME is bullmq", async () => {
    const runtime = createWorkerRuntimeFromEnv({
      env: {
        PSF_WORKER_RUNTIME: "bullmq",
        PSF_REDIS_URL: "redis://127.0.0.1:6399",
        PSF_QUEUE_PREFIX: "psf-test",
      },
    });

    expect(runtime).toBeInstanceOf(BullMQWorkerRuntime);
    await runtime.close();
  });
});

function seedInProcessJob(runtime: InProcessWorkerRuntime, job: QueueWorkerJob, status: QueuedJobRecord["status"]): void {
  const record: QueuedJobRecord = {
    job,
    status,
    attemptsMade: 1,
    createdAt: job.createdAt,
    updatedAt: job.createdAt,
  };
  (runtime as unknown as { jobs: Map<string, QueuedJobRecord> }).jobs.set(job.id, record);
}
