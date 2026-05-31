import type { MissionEvent, WorkerRun } from "@psf/mission-schema";
import { z } from "zod";

export type WorkerRuntimeType = "qa" | "auto_fix" | "codex" | "planner" | "integration";
export type WorkerRuntimeMode = "dry-run" | "mock" | "real";

export const QueueWorkerJobTypeSchema = z.enum([
  "mission.plan",
  "codex.dry_run",
  "qa.dry_run",
  "qa.dry_run_with_sample_bug",
  "fix.dry_run",
  "loop.dry_run",
  "demo.ai_novelist",
  "integration.dry_run",
]);

export const QueueWorkerJobStatusSchema = z.enum([
  "queued",
  "active",
  "completed",
  "failed",
  "cancelled",
  "delayed",
]);
export const QueueWorkerJobModeSchema = z.enum(["dry-run", "mock", "real"]);

const QueueJobPayloadSchema = z.record(z.unknown()).default({}).superRefine((payload, context) => {
  try {
    assertSafePayload(payload);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Sensitive payload key is not allowed",
    });
  }
});

export const QueueWorkerJobSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  projectId: z.string().min(1),
  workerRunId: z.string().min(1),
  type: QueueWorkerJobTypeSchema,
  mode: QueueWorkerJobModeSchema,
  payload: QueueJobPayloadSchema,
  idempotencyKey: z.string().min(1).optional(),
  priority: z.number().int().min(0).default(5),
  attempts: z.number().int().min(1).default(2),
  timeoutMs: z.number().int().positive().default(300000),
  createdAt: z.string().datetime(),
});

export const WorkerJobTypeSchema = QueueWorkerJobTypeSchema;
export const WorkerJobStatusSchema = QueueWorkerJobStatusSchema;
export const WorkerJobModeSchema = QueueWorkerJobModeSchema;
export const WorkerJobSchema = QueueWorkerJobSchema;

export type WorkerJobType = z.infer<typeof QueueWorkerJobTypeSchema>;
export type WorkerJobStatus = z.infer<typeof QueueWorkerJobStatusSchema>;
export type QueueWorkerJob = z.infer<typeof QueueWorkerJobSchema>;

export interface QueuedJobRecord {
  job: QueueWorkerJob;
  status: WorkerJobStatus;
  attemptsMade: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  retryOfJobId?: string;
  retryAttempt?: number;
}

export interface QueueStats {
  runtime: "in-process" | "bullmq" | string;
  redisConfigured: boolean;
  redisReachable?: boolean;
  counts: Record<WorkerJobStatus, number>;
}

export interface ListJobsFilter {
  status?: WorkerJobStatus;
  missionId?: string;
  workerRunId?: string;
  type?: WorkerJobType;
}

export interface BuildWorkerJobInput {
  id?: string;
  missionId: string;
  projectId: string;
  workerRunId: string;
  type: WorkerJobType;
  mode?: z.input<typeof QueueWorkerJobModeSchema>;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  attempts?: number;
  timeoutMs?: number;
  createdAt?: string;
}

export function buildWorkerJob(input: BuildWorkerJobInput): QueueWorkerJob {
  assertSafePayload(input.payload ?? {});
  return QueueWorkerJobSchema.parse({
    id: input.id ?? `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    missionId: input.missionId,
    projectId: input.projectId,
    workerRunId: input.workerRunId,
    type: input.type,
    mode: input.mode ?? "dry-run",
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey,
    priority: input.priority ?? 5,
    attempts: input.attempts ?? 2,
    timeoutMs: input.timeoutMs ?? 300000,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export interface WorkerJob {
  id: string;
  missionId: string;
  projectId: string;
  workerType: WorkerRuntimeType;
  mode: WorkerRuntimeMode;
  input: Record<string, unknown>;
  createdAt: string;
}

export interface WorkerHandlerResult {
  output?: Record<string, unknown>;
  logs?: string[];
}

export interface WorkerRuntimeResult {
  workerRun: WorkerRun;
  events: MissionEvent[];
}

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

export interface InProcessWorkerRuntimeOptions {
  now?: () => string;
}

export class InProcessWorkerRuntime implements WorkerRuntime {
  public lastFailure: WorkerRuntimeResult | null = null;
  private readonly now: () => string;
  private readonly jobs = new Map<string, QueuedJobRecord>();

  constructor(options: InProcessWorkerRuntimeOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async enqueue(job: QueueWorkerJob): Promise<QueuedJobRecord> {
    const parsedJob = QueueWorkerJobSchema.parse(job);
    assertSafePayload(parsedJob.payload);
    const now = this.now();
    const record: QueuedJobRecord = {
      job: parsedJob,
      status: "queued",
      attemptsMade: 0,
      createdAt: parsedJob.createdAt,
      updatedAt: now,
    };
    this.jobs.set(parsedJob.id, record);
    return record;
  }

  async getJob(jobId: string): Promise<QueuedJobRecord | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async getJobStatus(jobId: string): Promise<WorkerJobStatus | null> {
    return (await this.getJob(jobId))?.status ?? null;
  }

  async cancelJob(jobId: string): Promise<QueuedJobRecord> {
    const record = this.requireJob(jobId);
    if (record.status === "failed" || record.status === "completed") {
      throw new Error("Cannot cancel failed or completed jobs");
    }
    const finishedAt = this.now();
    const updated = { ...record, status: "cancelled" as const, updatedAt: finishedAt, finishedAt };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async retryJob(jobId: string): Promise<QueuedJobRecord> {
    const record = this.requireJob(jobId);
    if (record.status !== "failed" && record.status !== "cancelled") {
      throw new Error("Only failed or cancelled jobs can be retried");
    }

    const retryAttempt = (record.retryAttempt ?? 0) + 1;
    const retryInput: BuildWorkerJobInput = {
      missionId: record.job.missionId,
      projectId: record.job.projectId,
      workerRunId: record.job.workerRunId,
      type: record.job.type,
      mode: record.job.mode,
      payload: record.job.payload,
      priority: record.job.priority,
      attempts: record.job.attempts,
      timeoutMs: record.job.timeoutMs,
      createdAt: this.now(),
    };
    if (record.job.idempotencyKey) {
      retryInput.idempotencyKey = record.job.idempotencyKey;
    }
    const retryJob = buildWorkerJob(retryInput);
    const retryRecord: QueuedJobRecord = {
      job: retryJob,
      status: "queued",
      attemptsMade: 0,
      createdAt: retryJob.createdAt,
      updatedAt: this.now(),
      retryOfJobId: record.job.id,
      retryAttempt,
    };
    this.jobs.set(retryJob.id, retryRecord);
    return retryRecord;
  }

  async listJobs(filter: ListJobsFilter = {}): Promise<QueuedJobRecord[]> {
    return Array.from(this.jobs.values()).filter((record) => {
      if (filter.status && record.status !== filter.status) return false;
      if (filter.missionId && record.job.missionId !== filter.missionId) return false;
      if (filter.workerRunId && record.job.workerRunId !== filter.workerRunId) return false;
      if (filter.type && record.job.type !== filter.type) return false;
      return true;
    });
  }

  async getQueueStats(): Promise<QueueStats> {
    const counts = createEmptyCounts();
    for (const record of this.jobs.values()) {
      counts[record.status] += 1;
    }
    return {
      runtime: "in-process",
      redisConfigured: false,
      counts,
    };
  }

  async close(): Promise<void> {
    // In-process runtime has no external handles.
  }

  async run(job: WorkerJob, handler: (job: WorkerJob) => Promise<WorkerHandlerResult>): Promise<WorkerRuntimeResult> {
    const startedAt = this.now();
    const started = buildEvent(job, "worker_runtime.started", "Worker runtime started.", startedAt);

    try {
      const handlerResult = await handler(job);
      const finishedAt = this.now();
      const workerRun = buildWorkerRun(job, "succeeded", startedAt, finishedAt, {
        output: handlerResult.output ?? {},
        logs: handlerResult.logs ?? [],
      });
      return {
        workerRun,
        events: [
          started,
          buildEvent(job, "worker_runtime.succeeded", "Worker runtime completed.", finishedAt, {
            workerRunId: workerRun.id,
          }),
        ],
      };
    } catch (error) {
      const finishedAt = this.now();
      const workerRun = buildWorkerRun(job, "failed", startedAt, finishedAt, {
        error: error instanceof Error ? error.message : String(error),
        logs: ["worker runtime failed"],
      });
      this.lastFailure = {
        workerRun,
        events: [
          started,
          buildEvent(job, "worker_runtime.failed", "Worker runtime failed.", finishedAt, {
            workerRunId: workerRun.id,
            error: workerRun.error ?? "unknown error",
          }),
        ],
      };
      throw error;
    }
  }

  private requireJob(jobId: string): QueuedJobRecord {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new Error(`Queue job not found: ${jobId}`);
    }
    return record;
  }
}

function assertSafePayload(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafePayload(item, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["token", "password", "secret", "apikey", "authorization"].some((sensitiveKey) => normalizedKey.includes(sensitiveKey))) {
      throw new Error(`Sensitive payload key is not allowed: ${[...path, key].join(".")}`);
    }
    assertSafePayload(childValue, [...path, key]);
  }
}

function createEmptyCounts(): Record<WorkerJobStatus, number> {
  return {
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    delayed: 0,
  };
}

function buildWorkerRun(
  job: WorkerJob,
  status: WorkerRun["status"],
  startedAt: string,
  finishedAt: string,
  values: { output?: Record<string, unknown>; error?: string; logs?: string[] },
): WorkerRun {
  return {
    id: `worker-run-${job.id}`,
    mission_id: job.missionId,
    worker_type: job.workerType as WorkerRun["worker_type"],
    status,
    mode: job.mode,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: status === "succeeded" ? 0 : 1,
    input: { projectId: job.projectId, ...job.input },
    output: values.output ?? {},
    error: values.error ?? "",
    logs: values.logs ?? [],
    metadata: { runtime: "in-process", jobId: job.id },
    created_at: startedAt,
    updated_at: finishedAt,
  };
}

function buildEvent(
  job: WorkerJob,
  type: string,
  message: string,
  createdAt: string,
  payload: Record<string, unknown> = {},
): MissionEvent {
  return {
    id: `event-${job.id}-${type.replaceAll(".", "-")}`,
    mission_id: job.missionId,
    type,
    message,
    payload: { workerType: job.workerType, mode: job.mode, ...payload },
    created_at: createdAt,
  };
}
