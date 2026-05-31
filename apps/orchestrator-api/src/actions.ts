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
import { z } from "zod";
import { badRequest } from "./errors.js";

export const MissionActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
}).strict();

export const DemoActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
  resetDemo: z.literal(false).default(false),
}).strict();

const demoOnlyMessage = "This dry-run action currently supports the ai-novelist demo mission only.";

type MissionActionRunner = (options?: DemoWorkflowOptions) => Promise<DemoWorkflowResult>;

export function toActionResponse(result: DemoWorkflowResult) {
  return {
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
  if (missionId !== EXAMPLE_MISSION_ID) {
    throw badRequest("VALIDATION_ERROR", demoOnlyMessage, { missionId, supportedMissionId: EXAMPLE_MISSION_ID });
  }

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

function parseActionRequest<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest("VALIDATION_ERROR", "Request validation failed", result.error.flatten());
  }
  return result.data;
}
