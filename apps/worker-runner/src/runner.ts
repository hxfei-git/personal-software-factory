import { randomUUID } from "node:crypto";
import { canTransition } from "@psf/mission-core";
import {
  MissionStatus,
  type Artifact,
  type BugReport,
  type MissionEvent,
  type MissionStatusValue,
  type QAReport,
  type WorkerRun,
} from "@psf/mission-schema";
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
    const result = sanitizeWorkerJobHandlerResult(await input.handler(input.job));
    const succeededAt = now();
    await persistChildResources(input.storage, input.job, result, succeededAt);
    const latest = await input.storage.getWorkerRun(input.job.workerRunId) ?? running;
    const succeeded = await updateWrapper(input.storage, latest, "succeeded", input.job, succeededAt, buildSafeOutput(input.job, result));
    await recordMissionActionResult(input.storage, input.job, result, succeededAt);
    await applyAutomaticMissionTransitions(input.storage, input.job, result, succeededAt);
    return succeeded;
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


async function recordMissionActionResult(
  storage: MissionStorage,
  job: QueueWorkerJob,
  result: WorkerJobHandlerResult,
  timestamp: string,
): Promise<void> {
  await storage.appendMissionEvent({
    id: `event-${job.workerRunId}-mission-action-result-${job.id}-${randomUUID()}`,
    mission_id: job.missionId,
    type: "mission.action_result",
    message: `Queue job ${job.type} completed successfully.`,
    payload: {
      jobId: job.id,
      jobType: job.type,
      workerRunId: job.workerRunId,
      wrapperWorkerRunId: job.workerRunId,
      childWorkerRunIds: result.childWorkerRunIds,
      childQARunIds: result.childQARunIds,
      childArtifactIds: result.childArtifactIds,
      childBugReportIds: result.childBugReportIds,
      summary: result.summary,
      recommendedNextAction: result.recommendedNextAction,
      ...(result.status === undefined ? {} : { status: result.status }),
      ...(result.manualActionRequired === undefined ? {} : { manualActionRequired: result.manualActionRequired }),
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    },
    created_at: timestamp,
  });
}

async function applyAutomaticMissionTransitions(
  storage: MissionStorage,
  job: QueueWorkerJob,
  result: WorkerJobHandlerResult,
  timestamp: string,
): Promise<void> {
  const mission = await storage.getMission(job.missionId);
  if (!mission) {
    return;
  }

  let currentStatus = mission.status;
  const hasBugs = hasBugReports(result) || await hasOpenMissionBugs(storage, job.missionId);
  const transitionPath = automaticTransitionPath(currentStatus, job.type, hasBugs, result);

  for (const nextStatus of transitionPath) {
    if (!canTransition(currentStatus, nextStatus)) {
      return;
    }
    const transitioned = await storage.transitionMission(
      job.missionId,
      nextStatus,
      buildAutoTransitionEvent(job, currentStatus, nextStatus, hasBugs, result.recommendedNextAction, timestamp),
    );
    currentStatus = transitioned.status;
  }
}

function automaticTransitionPath(
  currentStatus: MissionStatusValue,
  jobType: string,
  hasBugs: boolean,
  result: WorkerJobHandlerResult,
): MissionStatusValue[] {
  if (jobType === "mission.plan") {
    if (
      currentStatus === MissionStatus.received
      && canTransition(MissionStatus.received, MissionStatus.planning)
      && canTransition(MissionStatus.planning, MissionStatus.planned)
    ) {
      return [MissionStatus.planning, MissionStatus.planned];
    }
    if (currentStatus === MissionStatus.planning && canTransition(currentStatus, MissionStatus.planned)) {
      return [MissionStatus.planned];
    }
    return [];
  }

  if (jobType.startsWith("qa.") && currentStatus === MissionStatus.qa_running) {
    if (isBlockedQaResult(jobType, result)) {
      return [];
    }
    const nextStatus = hasBugs ? MissionStatus.bugs_found : MissionStatus.ready_for_review;
    return canTransition(currentStatus, nextStatus) ? [nextStatus] : [];
  }

  if (jobType === "fix.dry_run" && currentStatus === MissionStatus.fixing) {
    return canTransition(currentStatus, MissionStatus.regression_running) ? [MissionStatus.regression_running] : [];
  }

  if (jobType === "fix.real") {
    return fixRealTransitionPath(currentStatus, hasBugs, result);
  }

  if (!hasBugs && jobType === "loop.dry_run" && currentStatus !== MissionStatus.ready_for_review) {
    return canTransition(currentStatus, MissionStatus.ready_for_review) ? [MissionStatus.ready_for_review] : [];
  }

  return [];
}

function isBlockedQaResult(jobType: string, result: WorkerJobHandlerResult): boolean {
  return jobType.startsWith("qa.")
    && (result.manualActionRequired === true || result.status === "blocked" || result.status === "manual_action");
}

function fixRealTransitionPath(
  currentStatus: MissionStatusValue,
  hasBugs: boolean,
  result: WorkerJobHandlerResult,
): MissionStatusValue[] {
  if (result.status === "paused" || result.status === "needs_human") {
    return legalTransitionPath(currentStatus, [MissionStatus.paused]);
  }

  if (result.status === "fixed" && !hasBugs) {
    if (currentStatus === MissionStatus.bugs_found) {
      return legalTransitionPath(currentStatus, [MissionStatus.fixing, MissionStatus.regression_running, MissionStatus.qa_running, MissionStatus.ready_for_review]);
    }
    if (currentStatus === MissionStatus.fixing) {
      return legalTransitionPath(currentStatus, [MissionStatus.regression_running, MissionStatus.qa_running, MissionStatus.ready_for_review]);
    }
    if (currentStatus === MissionStatus.regression_running) {
      return legalTransitionPath(currentStatus, [MissionStatus.qa_running, MissionStatus.ready_for_review]);
    }
    if (currentStatus === MissionStatus.qa_running) {
      return legalTransitionPath(currentStatus, [MissionStatus.ready_for_review]);
    }
  }

  if (result.status === "test_failed" || result.status === "fix_failed") {
    if (currentStatus === MissionStatus.fixing) {
      return legalTransitionPath(currentStatus, [MissionStatus.regression_running, MissionStatus.qa_running, MissionStatus.bugs_found]);
    }
    if (currentStatus === MissionStatus.regression_running) {
      return legalTransitionPath(currentStatus, [MissionStatus.qa_running, MissionStatus.bugs_found]);
    }
    if (currentStatus === MissionStatus.qa_running) {
      return legalTransitionPath(currentStatus, [MissionStatus.bugs_found]);
    }
  }

  return [];
}

function legalTransitionPath(currentStatus: MissionStatusValue, desiredPath: MissionStatusValue[]): MissionStatusValue[] {
  const path: MissionStatusValue[] = [];
  let current = currentStatus;
  for (const next of desiredPath) {
    if (current === next) {
      continue;
    }
    if (!canTransition(current, next)) {
      return [];
    }
    path.push(next);
    current = next;
  }
  return path;
}

function hasBugReports(result: WorkerJobHandlerResult): boolean {
  if ((result.childBugReports?.length ?? 0) > 0) {
    return result.childBugReports!.some((bug) => !isResolvedBugStatus(bug.status));
  }
  return result.childBugReportIds.length > 0;
}

async function hasOpenMissionBugs(storage: MissionStorage, missionId: string): Promise<boolean> {
  const bugs = await storage.listMissionBugs(missionId);
  return bugs.some((bug) => !isResolvedBugStatus(bug.status));
}

const resolvedBugStatuses = new Set<string>(["fixed", "accepted", "verified", "closed", "wont_fix", "duplicate"]);

function isResolvedBugStatus(status: BugReport["status"]): boolean {
  return resolvedBugStatuses.has(status);
}

function buildAutoTransitionEvent(
  job: QueueWorkerJob,
  from: MissionStatusValue,
  to: MissionStatusValue,
  hasBugs: boolean,
  recommendedNextAction: string,
  timestamp: string,
): MissionEvent {
  return {
    id: `event-${job.workerRunId}-mission-status-auto-transition-${from}-${to}-${randomUUID()}`,
    mission_id: job.missionId,
    type: "mission.status.auto_transition",
    message: `Mission automatically transitioned from ${from} to ${to} after ${job.type} succeeded.`,
    payload: {
      from,
      to,
      jobId: job.id,
      jobType: job.type,
      workerRunId: job.workerRunId,
      wrapperWorkerRunId: job.workerRunId,
      hasBugs,
      recommendedNextAction,
    },
    created_at: timestamp,
  };
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
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(result.manualActionRequired === undefined ? {} : { manualActionRequired: result.manualActionRequired }),
    ...(result.reason === undefined ? {} : { reason: result.reason }),
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
    } else {
      await storage.updateBug({
        resource: bug,
        event: buildChildEvent(job, bug.id, "bug.child_updated", "Child BugReport updated by queue runner.", timestamp),
      });
    }
  }
  if ((result.childEvents?.length ?? 0) > 0) {
    const existingEventIds = new Set((await storage.listMissionEvents(job.missionId)).map((event) => event.id));
    for (const event of result.childEvents ?? []) {
      if (!existingEventIds.has(event.id)) {
        await storage.appendMissionEvent(event);
        existingEventIds.add(event.id);
      }
    }
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

function sanitizeWorkerJobHandlerResult(result: WorkerJobHandlerResult): WorkerJobHandlerResult {
  return sanitizeJsonValue(result) as WorkerJobHandlerResult;
}

const secretKeyPattern = /(?:token|password|passwd|pwd|secret|api[_-]?key|apikey|authorization|credential|session|jwt|bearer|cookie)/i;

function sanitizeJsonValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    return secretKeyPattern.test(key) ? "[REDACTED]" : redactSecretLikeText(value);
  }
  if (typeof value !== "object" || value === null) {
    return secretKeyPattern.test(key) && value !== undefined ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, key));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    sanitized[entryKey] = sanitizeJsonValue(entryValue, entryKey);
  }
  return sanitized;
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
