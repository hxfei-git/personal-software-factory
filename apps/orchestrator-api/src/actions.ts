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
export type GatedRealActionKind = "codex-real" | "qa-playwright" | "qa-ai-exploratory" | "fix-real" | "github-pr" | "deploy-staging" | "monitor-sync" | "plane-sync";


export const MissionActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
}).strict();

export const DemoActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
  resetDemo: z.literal(false).default(false),
}).strict();

export const RealActionRequestSchema = z.object({
  approvalId: z.string().min(1).optional(),
  targetUrl: z.string().url().optional(),
  repoUrl: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  workspaceRoot: z.string().min(1).optional(),
}).strict();

const queuedActionKinds = new Set<QueuedActionKind>(["plan", "codex", "qa", "fix", "loop", "demo"]);

export const gatedRealActionContracts: Record<GatedRealActionKind, { jobType: WorkerJobType; gateEnv: string; label: string }> = {
  "codex-real": { jobType: "codex.real", gateEnv: "PSF_ENABLE_REAL_CODEX", label: "Codex real execution" },
  "qa-playwright": { jobType: "qa.playwright", gateEnv: "PSF_ENABLE_REAL_QA_PLAYWRIGHT", label: "Playwright QA" },
  "qa-ai-exploratory": { jobType: "qa.ai_exploratory", gateEnv: "PSF_ENABLE_REAL_QA_AI_EXPLORATORY", label: "AI exploratory QA" },
  "fix-real": { jobType: "fix.real", gateEnv: "PSF_ENABLE_REAL_FIX", label: "real fix loop" },
  "github-pr": { jobType: "github.pr", gateEnv: "PSF_ENABLE_REAL_GITHUB_PR", label: "GitHub PR" },
  "deploy-staging": { jobType: "deploy.coolify", gateEnv: "PSF_ENABLE_REAL_COOLIFY_DEPLOY", label: "Coolify staging deploy" },
  "monitor-sync": { jobType: "monitor.uptime_kuma", gateEnv: "PSF_ENABLE_REAL_UPTIME_KUMA_SYNC", label: "Uptime Kuma monitor sync" },
  "plane-sync": { jobType: "plane.sync", gateEnv: "PSF_ENABLE_REAL_PLANE_SYNC", label: "Plane sync" },
};

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

export interface BuildQueuedRealActionJobInput {
  action: GatedRealActionKind;
  missionId: string;
  projectId: string;
  workerRunId: string;
  body: unknown;
  context?: Record<string, unknown>;
  approvalRecordIds?: string[];
  approvalGrantIds?: string[];
}

export interface GatedRealActionResponseInput {
  action: GatedRealActionKind;
  missionId: string;
  projectId: string;
  executionMode: ActionExecutionMode;
}

export interface QueuedRealActionResponseInput extends GatedRealActionResponseInput {
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

export function toGenericInlineDryRunActionResponse(input: { action: QueuedActionKind; missionId: string; projectId: string; body: unknown }) {
  parseActionRequest(MissionActionRequestSchema, input.body ?? {});

  return {
    accepted: true,
    executionMode: "inline" as const,
    missionId: input.missionId,
    projectId: input.projectId,
    mode: "dry-run",
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    generatedArtifacts: [],
    workerRunIds: [],
    qaRunIds: [],
    bugIds: [],
    eventIds: [],
    recommendedNextAction: "Generic " + input.action + " dry-run preflight passed. Switch to PSF_ACTION_EXECUTION_MODE=queued to create a WorkerRun for project-specific execution when worker support is available.",
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

export function buildQueuedRealActionJob(input: BuildQueuedRealActionJobInput): QueueWorkerJob {
  const bodyRecord = input.body && typeof input.body === "object" && !Array.isArray(input.body)
    ? input.body as Record<string, unknown>
    : {};
  const parsedBody = parseActionRequest(RealActionRequestSchema, {
    approvalId: bodyRecord.approvalId,
    targetUrl: bodyRecord.targetUrl,
    repoUrl: bodyRecord.repoUrl,
    branchName: bodyRecord.branchName,
    workspaceRoot: bodyRecord.workspaceRoot,
  });
  const contract = gatedRealActionContracts[input.action];
  const payload = {
    ...(input.context ?? {}),
    ...(parsedBody.targetUrl ? { targetUrl: parsedBody.targetUrl } : {}),
    ...(parsedBody.repoUrl ? { repoUrl: parsedBody.repoUrl } : {}),
    ...(parsedBody.branchName ? { branchName: parsedBody.branchName } : {}),
    ...(parsedBody.workspaceRoot ? { workspaceRoot: parsedBody.workspaceRoot } : {}),
    enableRealMode: true,
    approvalRecordIds: input.approvalRecordIds ?? [],
    approvalIds: input.approvalGrantIds ?? [],
    ...(parsedBody.approvalId ? { requestedApprovalId: parsedBody.approvalId } : {}),
  };

  return buildWorkerJob({
    missionId: input.missionId,
    projectId: input.projectId,
    workerRunId: input.workerRunId,
    type: contract.jobType,
    mode: "real",
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

export function toBlockedRealActionResponse(input: GatedRealActionResponseInput) {
  const contract = gatedRealActionContracts[input.action];
  return {
    accepted: false,
    executionMode: input.executionMode,
    missionId: input.missionId,
    projectId: input.projectId,
    action: input.action,
    jobType: contract.jobType,
    status: "blocked" as const,
    dryRun: false,
    realEnabled: false,
    realNetworkCall: false,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    recommendedNextAction: "Set " + contract.gateEnv + "=true and PSF_ACTION_EXECUTION_MODE=queued after approvals and worker support are ready.",
  };
}

export function toQueuedRealActionResponse(input: QueuedRealActionResponseInput) {
  const contract = gatedRealActionContracts[input.action];
  return {
    accepted: true,
    executionMode: "queued" as const,
    workerRunId: input.workerRunId,
    jobId: input.job.id,
    missionId: input.missionId,
    projectId: input.projectId,
    action: input.action,
    jobType: contract.jobType,
    status: "queued" as const,
    dryRun: false,
    realEnabled: true,
    realNetworkCall: false,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    recommendedNextAction: "Gated real-mode WorkerRun queued. Worker Runner real handlers are scheduled for Task 9; no external call has been made by the API.",
  };
}

export function isGatedRealActionEnabled(action: GatedRealActionKind, env: Record<string, string | undefined> = process.env): boolean {
  return env[gatedRealActionContracts[action].gateEnv] === "true";
}

export function assertMissionActionWhitelisted(action: QueuedActionKind) {
  if (!queuedActionKinds.has(action)) {
    throw badRequest("VALIDATION_ERROR", "Mission action is not supported", { action, supportedActions: [...queuedActionKinds] });
  }
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
