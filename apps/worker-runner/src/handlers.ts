import {
  runAiNovelistDemo,
  runCodexDryRun,
  runFixDryRun,
  runLoopDryRun,
  runMissionPlan,
  runQaDryRun,
} from "@psf/demo-workflow";
import {
  runIntegrationDryRun,
  type AnyIntegrationDryRunResult,
  type ExternalIntegrationName,
  type GitHubDryRunInput,
  type CoolifyDryRunInput,
  type UptimeKumaDryRunInput,
  type PlaneDryRunInput,
} from "@psf/integrations";
import type { Artifact, BugReport, MissionEvent, QAReport, WorkerRun } from "@psf/mission-schema";
import type { QueueWorkerJob } from "@psf/worker-runtime";

export interface WorkerJobHandlerResult {
  childWorkerRunIds: string[];
  childQARunIds: string[];
  childArtifactIds: string[];
  childBugReportIds: string[];
  summary: string;
  recommendedNextAction: string;
  childWorkerRuns?: WorkerRun[];
  childQARuns?: QAReport[];
  childArtifacts?: Artifact[];
  childBugReports?: BugReport[];
  childEvents?: MissionEvent[];
}

export type WorkerJobHandler = (job: QueueWorkerJob) => Promise<WorkerJobHandlerResult>;

export function createDefaultJobHandler(cwd = process.cwd()): WorkerJobHandler {
  return async (job) => {
    switch (job.type) {
      case "mission.plan":
        return toWorkflowHandlerResult(await runMissionPlan(buildWorkflowOptions(cwd, job)));
      case "codex.dry_run":
        return toWorkflowHandlerResult(await runCodexDryRun(buildWorkflowOptions(cwd, job)));
      case "qa.dry_run":
        return toWorkflowHandlerResult(await runQaDryRun(buildWorkflowOptions(cwd, job)));
      case "qa.dry_run_with_sample_bug":
        return toWorkflowHandlerResult(await runQaDryRun({ ...buildWorkflowOptions(cwd, job), withSampleBug: true }));
      case "fix.dry_run":
        return toWorkflowHandlerResult(await runFixDryRun(buildWorkflowOptions(cwd, job)));
      case "loop.dry_run":
        return toWorkflowHandlerResult(await runLoopDryRun(buildWorkflowOptions(cwd, job)));
      case "demo.ai_novelist":
        return toWorkflowHandlerResult(await runAiNovelistDemo(buildWorkflowOptions(cwd, job)));
      case "integration.dry_run":
        return toIntegrationHandlerResult(runIntegrationDryRun(resolveIntegrationName(job), buildIntegrationInput(job)));
    }
  };
}

function buildWorkflowOptions(cwd: string, job: QueueWorkerJob) {
  return {
    cwd,
    skipDb: false,
    withSampleBug: job.type === "qa.dry_run_with_sample_bug" || job.payload.withSampleBug === true,
  };
}

function toWorkflowHandlerResult(result: {
  workerRunIds: string[];
  qaRunIds: string[];
  generatedArtifacts: string[];
  bugIds: string[];
  message: string;
  resources?: {
    workerRuns: WorkerRun[];
    qaRuns: QAReport[];
    artifacts: Artifact[];
    bugs: BugReport[];
    events: MissionEvent[];
  };
}): WorkerJobHandlerResult {
  return {
    childWorkerRunIds: result.workerRunIds,
    childQARunIds: result.qaRunIds,
    childArtifactIds: result.generatedArtifacts,
    childBugReportIds: result.bugIds,
    summary: result.message,
    recommendedNextAction: result.message,
    ...(result.resources ? {
      childWorkerRuns: result.resources.workerRuns,
      childQARuns: result.resources.qaRuns,
      childArtifacts: result.resources.artifacts,
      childBugReports: result.resources.bugs,
      childEvents: result.resources.events,
    } : {}),
  };
}

function toIntegrationHandlerResult(result: AnyIntegrationDryRunResult): WorkerJobHandlerResult {
  return {
    childWorkerRunIds: [],
    childQARunIds: [],
    childArtifactIds: [],
    childBugReportIds: [],
    summary: result.message,
    recommendedNextAction: "Review integration dry-run output.",
  };
}

function resolveIntegrationName(job: QueueWorkerJob): ExternalIntegrationName {
  const name = typeof job.payload.name === "string" ? job.payload.name : "github";
  if (name === "github" || name === "coolify" || name === "uptime_kuma" || name === "uptime-kuma" || name === "plane") {
    return name;
  }
  throw new Error(`Unsupported integration dry-run name: ${name}`);
}

function buildIntegrationInput(job: QueueWorkerJob): GitHubDryRunInput | CoolifyDryRunInput | UptimeKumaDryRunInput | PlaneDryRunInput {
  const base = { env: process.env, mode: "dry-run" as const };
  const payload = job.payload;
  switch (resolveIntegrationName(job)) {
    case "github":
      return { ...base, mission: safeRecord(payload.mission) };
    case "coolify":
      return { ...base, deployment: safeRecord(payload.deployment) };
    case "uptime_kuma":
    case "uptime-kuma":
      return { ...base, monitor: safeRecord(payload.monitor) };
    case "plane":
      return {
        ...base,
        mission: safeRecord(payload.mission),
        bugs: Array.isArray(payload.bugs) ? payload.bugs.filter(isRecord) : [],
      };
  }
}

function safeRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
