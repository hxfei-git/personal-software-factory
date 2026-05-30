import type { MissionEvent, WorkerRun } from "@psf/mission-schema";

export type WorkerRuntimeType = "qa" | "auto_fix" | "codex" | "planner" | "integration";
export type WorkerRuntimeMode = "dry-run" | "mock" | "real";

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
}

export interface InProcessWorkerRuntimeOptions {
  now?: () => string;
}

export class InProcessWorkerRuntime implements WorkerRuntime {
  public lastFailure: WorkerRuntimeResult | null = null;
  private readonly now: () => string;

  constructor(options: InProcessWorkerRuntimeOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
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
