import type { MissionEvent, WorkerRun } from "@psf/mission-schema";
import { Queue, type Job, type JobsOptions, type JobType } from "bullmq";
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
  queueName?: string;
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

export interface BullMQWorkerRuntimeOptions {
  redisUrl?: string;
  queueName?: string;
  prefix?: string;
  connectTimeoutMs?: number;
}

interface WorkerRuntimeFromEnvOptions {
  env?: Record<string, string | undefined>;
}

interface BullMQJobData {
  job: QueueWorkerJob;
  retryOfJobId?: string;
  retryAttempt?: number;
  cancellationRequested?: boolean;
}

export class BullMQWorkerRuntime implements WorkerRuntime {
  private readonly queue: Queue<BullMQJobData, QueuedJobRecord, string>;
  private readonly queueName: string;
  private readonly connectTimeoutMs: number;
  private readonly inProcessRunner = new InProcessWorkerRuntime();
  private readonly cancelledJobs = new Map<string, QueuedJobRecord>();

  constructor(options: BullMQWorkerRuntimeOptions = {}) {
    const redisUrl = options.redisUrl ?? "redis://127.0.0.1:6379";
    const prefix = options.prefix ?? "psf";
    this.queueName = options.queueName ?? `${prefix}-worker-jobs`;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 500;
    this.queue = new Queue<BullMQJobData, QueuedJobRecord, string>(this.queueName, {
      connection: buildRedisConnection(redisUrl, this.connectTimeoutMs),
      prefix,
    });
    this.queue.on("error", () => {
      // Errors are converted into readable operation-level messages.
    });
  }

  async enqueue(job: QueueWorkerJob): Promise<QueuedJobRecord> {
    const parsedJob = QueueWorkerJobSchema.parse(job);
    assertSafePayload(parsedJob.payload);
    try {
      const options = buildBullMQJobOptions(parsedJob);
      const bullJob = await this.queue.add(parsedJob.type, { job: parsedJob }, options);
      return this.toRecord(bullJob, "queued");
    } catch (error) {
      throw readableRedisError(error);
    }
  }

  async getJob(jobId: string): Promise<QueuedJobRecord | null> {
    const cancelled = this.cancelledJobs.get(jobId);
    if (cancelled) return cancelled;

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return null;
      return this.toRecord(job);
    } catch (error) {
      throw readableRedisError(error);
    }
  }

  async getJobStatus(jobId: string): Promise<WorkerJobStatus | null> {
    return (await this.getJob(jobId))?.status ?? null;
  }

  async cancelJob(jobId: string): Promise<QueuedJobRecord> {
    const existingCancelled = this.cancelledJobs.get(jobId);
    if (existingCancelled) return existingCancelled;

    try {
      const job = await this.requireBullMQJob(jobId);
      const status = mapBullMQState(await job.getState());
      if (status === "completed" || status === "failed") {
        throw new Error("Cannot cancel failed or completed jobs");
      }
      if (status === "active") {
        await job.updateData({ ...job.data, cancellationRequested: true });
        return this.toRecord(job, "active", "Active job cancellation is cooperative; cancellation was requested but the job was not force-killed.");
      }

      const cancelled = await this.toRecord(job, "cancelled");
      await job.remove();
      this.cancelledJobs.set(jobId, cancelled);
      return cancelled;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Cannot cancel")) throw error;
      throw readableRedisError(error);
    }
  }

  async retryJob(jobId: string): Promise<QueuedJobRecord> {
    const source = await this.getJob(jobId);
    if (!source) {
      throw new Error(`Queue job not found: ${jobId}`);
    }
    if (source.status !== "failed" && source.status !== "cancelled") {
      throw new Error("Only failed or cancelled jobs can be retried");
    }

    const retryAttempt = (source.retryAttempt ?? 0) + 1;
    const retryJob = buildWorkerJob({
      missionId: source.job.missionId,
      projectId: source.job.projectId,
      workerRunId: source.job.workerRunId,
      type: source.job.type,
      mode: source.job.mode,
      payload: source.job.payload,
      idempotencyKey: `${source.job.idempotencyKey ?? source.job.id}:retry:${retryAttempt}`,
      priority: source.job.priority,
      attempts: source.job.attempts,
      timeoutMs: source.job.timeoutMs,
    });

    try {
      const options = buildBullMQJobOptions(retryJob);
      const bullJob = await this.queue.add(retryJob.type, {
        job: retryJob,
        retryOfJobId: source.job.id,
        retryAttempt,
      }, options);
      return this.toRecord(bullJob, "queued");
    } catch (error) {
      throw readableRedisError(error);
    }
  }

  async listJobs(filter: ListJobsFilter = {}): Promise<QueuedJobRecord[]> {
    if (filter.status === "cancelled") {
      return Array.from(this.cancelledJobs.values()).filter((record) => matchesJobFilter(record, filter));
    }

    try {
      const bullStatuses: JobType[] = filter.status ? bullMQStatusesFor(filter.status) : ["waiting", "delayed", "active", "completed", "failed", "prioritized", "waiting-children"];
      const jobs = await this.queue.getJobs(bullStatuses, 0, -1, false);
      const records = await Promise.all(jobs.map((job) => this.toRecord(job)));
      const allRecords = filter.status ? records : [...records, ...this.cancelledJobs.values()];
      return allRecords.filter((record) => matchesJobFilter(record, filter));
    } catch (error) {
      throw readableRedisError(error);
    }
  }

  async getQueueStats(): Promise<QueueStats> {
    try {
      const counts = await withTimeout(
        this.queue.getJobCounts("waiting", "delayed", "active", "completed", "failed", "prioritized", "waiting-children"),
        this.connectTimeoutMs + 150,
      );
      return {
        runtime: "bullmq",
        redisConfigured: true,
        redisReachable: true,
        queueName: this.queueName,
        counts: {
          queued: (counts.waiting ?? 0) + (counts.prioritized ?? 0) + (counts["waiting-children"] ?? 0),
          delayed: counts.delayed ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          cancelled: this.cancelledJobs.size,
        },
      };
    } catch (error) {
      throw readableRedisError(error);
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  async run(job: WorkerJob, handler: (job: WorkerJob) => Promise<WorkerHandlerResult>): Promise<WorkerRuntimeResult> {
    return this.inProcessRunner.run(job, handler);
  }

  private async requireBullMQJob(jobId: string): Promise<Job<BullMQJobData, QueuedJobRecord, string>> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Queue job not found: ${jobId}`);
    }
    return job;
  }

  private async toRecord(
    bullJob: Job<BullMQJobData, QueuedJobRecord, string>,
    overrideStatus?: WorkerJobStatus,
    error?: string,
  ): Promise<QueuedJobRecord> {
    const parsedJob = QueueWorkerJobSchema.parse(bullJob.data.job);
    assertSafePayload(parsedJob.payload);
    const state = overrideStatus ?? mapBullMQState(await bullJob.getState());
    const updatedAtMs = bullJob.finishedOn ?? bullJob.processedOn ?? bullJob.timestamp;
    const record: QueuedJobRecord = {
      job: parsedJob,
      status: state,
      attemptsMade: bullJob.attemptsMade,
      createdAt: parsedJob.createdAt,
      updatedAt: new Date(updatedAtMs).toISOString(),
    };
    if (bullJob.processedOn) record.startedAt = new Date(bullJob.processedOn).toISOString();
    if (bullJob.finishedOn) record.finishedAt = new Date(bullJob.finishedOn).toISOString();
    if (error ?? bullJob.failedReason) record.error = error ?? bullJob.failedReason;
    if (bullJob.data.retryOfJobId) record.retryOfJobId = bullJob.data.retryOfJobId;
    if (bullJob.data.retryAttempt) record.retryAttempt = bullJob.data.retryAttempt;
    return record;
  }
}

export function createWorkerRuntimeFromEnv(options: WorkerRuntimeFromEnvOptions = {}): WorkerRuntime {
  const env = options.env ?? process.env;
  if ((env.PSF_WORKER_RUNTIME ?? "in-process").toLowerCase() === "bullmq") {
    const prefix = env.PSF_QUEUE_PREFIX ?? "psf";
    return new BullMQWorkerRuntime({
      redisUrl: env.PSF_REDIS_URL ?? "redis://127.0.0.1:6379",
      queueName: `${prefix}-worker-jobs`,
      prefix,
    });
  }
  return new InProcessWorkerRuntime();
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


function buildBullMQJobOptions(job: QueueWorkerJob): JobsOptions & { timeout: number } {
  return {
    jobId: job.id,
    priority: job.priority,
    attempts: job.attempts,
    timeout: job.timeoutMs,
    removeOnComplete: false,
    removeOnFail: false,
  } as JobsOptions & { timeout: number };
}


function buildRedisConnection(redisUrl: string, connectTimeoutMs: number): Record<string, unknown> {
  const parsed = new URL(redisUrl);
  const dbText = parsed.pathname.replace("/", "");
  const connection: Record<string, unknown> = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    connectTimeout: connectTimeoutMs,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  };
  if (parsed.username) connection.username = decodeURIComponent(parsed.username);
  if (parsed.password) connection.password = decodeURIComponent(parsed.password);
  if (dbText) connection.db = Number(dbText);
  return connection;
}

function mapBullMQState(state: string): WorkerJobStatus {
  if (state === "waiting" || state === "prioritized" || state === "waiting-children") return "queued";
  if (state === "active") return "active";
  if (state === "completed") return "completed";
  if (state === "failed") return "failed";
  if (state === "delayed") return "delayed";
  return "queued";
}

function bullMQStatusesFor(status: WorkerJobStatus): JobType[] {
  switch (status) {
    case "queued":
      return ["waiting", "prioritized", "waiting-children"];
    case "active":
      return ["active"];
    case "completed":
      return ["completed"];
    case "failed":
      return ["failed"];
    case "delayed":
      return ["delayed"];
    case "cancelled":
      return [];
  }
}

function matchesJobFilter(record: QueuedJobRecord, filter: ListJobsFilter): boolean {
  if (filter.status && record.status !== filter.status) return false;
  if (filter.missionId && record.job.missionId !== filter.missionId) return false;
  if (filter.workerRunId && record.job.workerRunId !== filter.workerRunId) return false;
  if (filter.type && record.job.type !== filter.type) return false;
  return true;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Redis is not reachable: operation timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readableRedisError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Redis is not reachable")) {
    return error;
  }
  if (error instanceof Error && (error.message.startsWith("Cannot cancel") || error.message.startsWith("Only failed") || error.message.startsWith("Queue job not found"))) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Redis is not reachable: ${message}`);
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
