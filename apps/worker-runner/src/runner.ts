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

  const runningAt = now();
  const running = await updateWrapper(input.storage, wrapper, "running", input.job, runningAt, {
    queueWrapper: true,
    jobId: input.job.id,
    jobType: input.job.type,
    summary: "Queue job is running.",
    recommendedNextAction: "Wait for Worker Runner completion, then refresh Mission Summary.",
  });

  try {
    const result = await input.handler(input.job);
    return updateWrapper(input.storage, running, "succeeded", input.job, now(), buildSafeOutput(input.job, result));
  } catch (error) {
    const message = safeErrorSummary(error);
    await updateWrapper(input.storage, running, "failed", input.job, now(), {
      queueWrapper: true,
      jobId: input.job.id,
      jobType: input.job.type,
      childWorkerRunIds: [],
      childQARunIds: [],
      childArtifactIds: [],
      childBugReportIds: [],
      summary: "Queue job failed.",
      recommendedNextAction: "Inspect WorkerRun error and retry after fixing the cause.",
    }, message);
    throw error;
  }
}

function buildSafeOutput(job: QueueWorkerJob, result: WorkerJobHandlerResult): Record<string, unknown> {
  return {
    queueWrapper: true,
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
  error?: string,
): Promise<WorkerRun> {
  const updated: WorkerRun = {
    ...current,
    status,
    output: { ...current.output, ...output },
    metadata: { ...current.metadata, queueWrapper: true, jobId: job.id, jobType: job.type },
    ...(error === undefined ? {} : { error }),
    ...(status === "running" ? { started_at: current.started_at ?? timestamp } : {}),
    ...(status === "succeeded" || status === "failed" || status === "cancelled" ? { finished_at: timestamp } : {}),
    updated_at: timestamp,
  };
  const event: MissionEvent = {
    id: `event-${current.id}-${status}-${randomUUID()}`,
    mission_id: current.mission_id,
    type: `worker_run.${status}`,
    message: `Queue wrapper WorkerRun ${status}`,
    payload: {
      worker_run_id: current.id,
      status,
      queueWrapper: true,
      jobId: job.id,
      jobType: job.type,
    },
    created_at: timestamp,
  };
  return storage.updateWorkerRun({ resource: updated, event });
}

function safeErrorSummary(error: unknown): string {
  return redactSecretLikeText(error instanceof Error ? error.message : String(error));
}

function redactSecretLikeText(value: string): string {
  return value
    .replace(/(token\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(password\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(secret\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(authorization\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/([?&][^=&#\s]*(?:token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer)[^=&#\s]*=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/secret-value/gi, "[REDACTED]");
}
