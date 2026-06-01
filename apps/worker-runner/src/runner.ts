import { randomUUID } from "node:crypto";
import type { Artifact, BugReport, MissionEvent, QAReport, WorkerRun } from "@psf/mission-schema";
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
    ...buildHeartbeatMetadata(input.job, runningAt),
    summary: "Queue job is running.",
    recommendedNextAction: "Wait for Worker Runner completion, then refresh Mission Summary.",
  });

  try {
    const result = await input.handler(input.job);
    const succeededAt = now();
    await persistChildResources(input.storage, input.job, result, succeededAt);
    const latest = await input.storage.getWorkerRun(input.job.workerRunId) ?? running;
    return updateWrapper(input.storage, latest, "succeeded", input.job, succeededAt, buildSafeOutput(input.job, result));
  } catch (error) {
    const message = safeErrorSummary(error);
    const failedAt = now();
    const latest = await input.storage.getWorkerRun(input.job.workerRunId) ?? running;
    await updateWrapper(input.storage, latest, "failed", input.job, failedAt, {
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
    throw new Error(message);
  }
}

function buildHeartbeatMetadata(job: QueueWorkerJob, timestamp: string): Record<string, unknown> {
  return {
    jobId: job.id,
    jobType: job.type,
    workerRunId: job.workerRunId,
    missionId: job.missionId,
    correlationId: correlationIdForJob(job),
    heartbeatAt: timestamp,
    workerRunnerHeartbeatAt: timestamp,
  };
}

function correlationIdForJob(job: QueueWorkerJob): string {
  return `${job.workerRunId}:${job.id}`;
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
    metadata: {
      ...current.metadata,
      queueWrapper: true,
      jobId: job.id,
      jobType: job.type,
      workerRunId: job.workerRunId,
      missionId: job.missionId,
      correlationId: correlationIdForJob(job),
      ...(status === "running" ? { heartbeatAt: timestamp, workerRunnerHeartbeatAt: timestamp } : {}),
    },
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

async function persistChildResources(
  storage: MissionStorage,
  job: QueueWorkerJob,
  result: WorkerJobHandlerResult,
  timestamp: string,
): Promise<void> {
  for (const workerRun of result.childWorkerRuns ?? []) {
    if (!await storage.getWorkerRun(workerRun.id)) {
      await storage.createWorkerRun({
        resource: workerRun,
        event: buildChildEvent(job, workerRun.id, "worker_run.child_recorded", "Child WorkerRun recorded by queue runner.", timestamp),
      });
    }
  }
  for (const qaRun of result.childQARuns ?? []) {
    if (!await storage.getQARun(qaRun.id)) {
      await storage.createQARun({
        resource: qaRun,
        event: buildChildEvent(job, qaRun.id, "qa_run.child_recorded", "Child QARun recorded by queue runner.", timestamp),
      });
    }
  }
  for (const artifact of result.childArtifacts ?? []) {
    if (!await storage.getArtifact(artifact.id)) {
      await storage.createArtifact({
        resource: artifact,
        event: buildChildEvent(job, artifact.id, "artifact.child_recorded", "Child Artifact recorded by queue runner.", timestamp),
      });
    }
  }
  for (const bug of result.childBugReports ?? []) {
    if (!await storage.getBug(bug.id)) {
      await storage.createBug({
        resource: bug,
        event: buildChildEvent(job, bug.id, "bug.child_recorded", "Child BugReport recorded by queue runner.", timestamp),
      });
    }
  }
  for (const event of result.childEvents ?? []) {
    await storage.appendMissionEvent(event).catch(() => undefined);
  }
}

function buildChildEvent(
  job: QueueWorkerJob,
  resourceId: string,
  type: string,
  message: string,
  timestamp: string,
): MissionEvent {
  return {
    id: `event-${job.workerRunId}-${type.replaceAll(".", "-")}-${resourceId}-${randomUUID()}`,
    mission_id: job.missionId,
    type,
    message,
    payload: {
      queueWrapperWorkerRunId: job.workerRunId,
      jobId: job.id,
      jobType: job.type,
      resourceId,
    },
    created_at: timestamp,
  };
}

function safeErrorSummary(error: unknown): string {
  return redactSecretLikeText(error instanceof Error ? error.message : String(error));
}

function redactSecretLikeText(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\/@\s]+:)([^@\s]+)(@)/gi, "$1[REDACTED]$3")
    .replace(/([?&][^=&#\s]*(?:token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer)[^=&#\s]*=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/(\b(?:token|password|passwd|pwd|secret|api[_-]?key|authorization)\b\s*[:=]\s*)["']?[^"'\s,}]+["']?/gi, "$1[REDACTED]")
    .replace(/("(?:token|password|passwd|pwd|secret|api[_-]?key|authorization)"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/(\b(?:token|password|secret|authorization)\b\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/secret-value/gi, "[REDACTED]");
}
