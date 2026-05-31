import {
  EXAMPLE_MISSION_ID,
  runCodexDryRun,
  runFixDryRun,
  runLoopDryRun,
  runMissionPlan,
  runQaDryRun,
  type DemoWorkflowOptions,
  type DemoWorkflowResult,
} from "@psf/demo-workflow";
import { buildWorkerJob, type QueueWorkerJob, type WorkerJobType } from "@psf/worker-runtime";
import { z } from "zod";
import { badRequest } from "./errors.js";

export type ActionExecutionMode = "inline" | "queued";
export type QueuedActionKind = "plan" | "codex" | "qa" | "fix" | "loop" | "demo";

export const MissionActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
}).strict();

export const DemoActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
  resetDemo: z.literal(false).default(false),
}).strict();

const demoOnlyMessage = "This dry-run action currently supports the ai-novelist demo mission only.";

type MissionActionRunner = (options?: DemoWorkflowOptions) => Promise<DemoWorkflowResult>;

export interface BuildQueuedActionJobInput {
  action: QueuedActionKind;
  missionId: string;
  projectId: string;
  workerRunId: string;
  body: unknown;
}

export interface QueuedActionResponseInput {
  missionId: string;
  projectId: string;
  workerRunId: string;
  job: QueueWorkerJob;
}

export function toActionResponse(result: DemoWorkflowResult) {
  return {
    accepted: true,
    executionMode: "inline" as const,
    missionId: result.missionId,
    projectId: result.projectId,
    mode: "dry-run",
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    generatedArtifacts: result.generatedArtifacts,
    workerRunIds: result.workerRunIds,
    qaRunIds: result.qaRunIds,
    bugIds: result.bugIds,
    eventIds: result.eventIds,
    missionDetailUrl: result.missionDetailUrl,
    recommendedNextAction: result.message,
  };
}

export function buildQueuedActionJob(input: BuildQueuedActionJobInput): QueueWorkerJob {
  const parsedBody = input.action === "demo"
    ? parseActionRequest(DemoActionRequestSchema, input.body ?? {})
    : parseActionRequest(MissionActionRequestSchema, input.body ?? {});
  const jobType = resolveJobType(input.action, parsedBody.withSampleBug ?? false);
  const payload = parsedBody.withSampleBug ? { withSampleBug: true } : {};

  return buildWorkerJob({
    missionId: input.missionId,
    projectId: input.projectId,
    workerRunId: input.workerRunId,
    type: jobType,
    mode: "dry-run",
    payload,
  });
}

export function toQueuedActionResponse(input: QueuedActionResponseInput) {
  return {
    accepted: true,
    executionMode: "queued" as const,
    workerRunId: input.workerRunId,
    jobId: input.job.id,
    missionId: input.missionId,
    projectId: input.projectId,
    status: "queued" as const,
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    recommendedNextAction: "WorkerRun queued. Start or refresh the Worker Runner, then refresh Mission Summary.",
  };
}

export function assertDemoMissionActionSupported(missionId: string) {
  if (missionId !== EXAMPLE_MISSION_ID) {
    throw badRequest("VALIDATION_ERROR", demoOnlyMessage, { missionId, supportedMissionId: EXAMPLE_MISSION_ID });
  }
}

export async function runMissionPlanAction(missionId: string, body: unknown) {
  return runDemoMissionAction(missionId, body, runMissionPlan);
}

export async function runCodexDryRunAction(missionId: string, body: unknown) {
  return runDemoMissionAction(missionId, body, runCodexDryRun);
}

export async function runQaDryRunAction(missionId: string, body: unknown) {
  return runDemoMissionAction(missionId, body, runQaDryRun);
}

export async function runFixDryRunAction(missionId: string, body: unknown) {
  return runDemoMissionAction(missionId, body, runFixDryRun);
}

export async function runLoopDryRunAction(missionId: string, body: unknown) {
  return runDemoMissionAction(missionId, body, runLoopDryRun);
}

export async function runAiNovelistDemoAction(body: unknown) {
  const input = parseActionRequest(DemoActionRequestSchema, body ?? {});
  const result = await runLoopDryRun(buildOptions(input));
  return toActionResponse(result);
}

async function runDemoMissionAction(missionId: string, body: unknown, runner: MissionActionRunner) {
  assertDemoMissionActionSupported(missionId);

  const input = parseActionRequest(MissionActionRequestSchema, body ?? {});
  const result = await runner(buildOptions(input));
  return toActionResponse(result);
}

function buildOptions(input: { withSampleBug?: boolean | undefined }): DemoWorkflowOptions {
  return {
    cwd: process.cwd(),
    skipDb: false,
    withSampleBug: input.withSampleBug ?? false,
  };
}

function resolveJobType(action: QueuedActionKind, withSampleBug: boolean): WorkerJobType {
  switch (action) {
    case "plan":
      return "mission.plan";
    case "codex":
      return "codex.dry_run";
    case "qa":
      return withSampleBug ? "qa.dry_run_with_sample_bug" : "qa.dry_run";
    case "fix":
      return "fix.dry_run";
    case "loop":
      return "loop.dry_run";
    case "demo":
      return "demo.ai_novelist";
  }
}

function parseActionRequest<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest("VALIDATION_ERROR", "Request validation failed", result.error.flatten());
  }
  return result.data;
}
