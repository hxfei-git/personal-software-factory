import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listIntegrationStatuses,
  runIntegrationDryRun,
  runGitHubDryRun,
  isSecretLikeName,
  redactValue,
  type ExternalIntegrationName,
  type GitHubDryRunInput,
  type CoolifyDryRunInput,
  type UptimeKumaDryRunInput,
  type PlaneDryRunInput,
} from "@psf/integrations";
import { EXAMPLE_MISSION_ID } from "@psf/demo-workflow";
import type { QueueWorkerJob, QueuedJobRecord, QueueStats, WorkerRuntime } from "@psf/worker-runtime";
import {
  MissionStatus,
  MissionStatusSchema,
  type Approval,
  type Artifact,
  type BugReport,
  type Mission,
  type MissionEvent,
  type QAReport,
  type WorkerRun,
} from "@psf/mission-schema";
import { canTransition, transitionMission as buildTransition } from "@psf/mission-core";
import { createDeterministicMissionPlan } from "@psf/mission-planner";
import { ProjectRegistryError, findProjectById, scanProjectRegistry, type RegistryProject } from "@psf/project-registry";
import { z } from "zod";
import {
  assertMissionActionWhitelisted,
  buildQueuedActionJob,
  gatedRealActionContracts,
  buildQueuedRealActionJob,
  isGatedRealActionEnabled,
  RealActionRequestSchema,
  runAiNovelistDemoAction as runAiNovelistDemoDryRunAction,
  runCodexDryRunAction as runCodexDryRunDryRunAction,
  runFixDryRunAction as runFixDryRunDryRunAction,
  runLoopDryRunAction as runLoopDryRunDryRunAction,
  runMissionPlanAction as runMissionPlanDryRunAction,
  runQaDryRunAction as runQaDryRunDryRunAction,
  toBlockedRealActionResponse,
  toGenericInlineDryRunActionResponse,
  toQueuedActionResponse,
  toQueuedRealActionResponse,
  type ActionExecutionMode,
  type GatedRealActionKind,
  type QueuedActionKind,
} from "./actions.js";
import { buildReadinessBlocker, deriveReadinessState, type ReadinessBlocker } from "./readiness.js";
import { badRequest, invalidTransition, notFound, serviceUnavailable } from "./errors.js";
import { ApprovalDecisionConflictError, type MissionStorage } from "./storage.js";


const JsonObjectSchema = z.record(z.unknown());
const DateTimeStringSchema = z.string().datetime({ offset: true });

const CreateMissionRequestSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1),
  raw_request: z.string().min(1),
  mission_markdown: z.string().optional(),
  acceptance_markdown: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
  risk_level: z.enum(["low", "medium", "high"]).default("medium"),
});

const PlanMissionRequestSchema = z.object({
  userRequirement: z.string().min(1).optional(),
  qaCharter: z.string().optional(),
  title: z.string().min(1).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
});

const TransitionRequestSchema = z.object({
  to: MissionStatusSchema,
  actor: z.string().min(1).optional(),
  payload: JsonObjectSchema.default({}),
});

const EventTypeSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Event type must be lower-case dotted format");

const AppendEventRequestSchema = z.object({
  type: EventTypeSchema,
  message: z.string().min(1),
  payload: JsonObjectSchema.default({}),
});

const ApprovalTypeSchema = z.enum([
  "PRODUCTION_DEPLOY",
  "DATABASE_MIGRATION",
  "SECRET_CHANGE",
  "DESTRUCTIVE_OPERATION",
  "EXTERNAL_COST_RISK",
  "SECURITY_RISK",
]);

const CreateApprovalRequestSchema = z.object({
  type: ApprovalTypeSchema,
  requestedBy: z.string().min(1).optional(),
  reason: z.string().min(1),
  payload: JsonObjectSchema.default({}),
});

const DecideApprovalRequestSchema = z.object({
  status: z.enum(["approved", "rejected", "cancelled"]),
  decidedBy: z.string().min(1).optional(),
  decision: z.string().optional(),
});

const WorkerRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled", "skipped"]);
const WorkerRunModeSchema = z.enum(["dry-run", "mock", "real"]);
const WorkerTypeSchema = z.enum(["codex", "qa", "deploy", "monitor", "planner", "integration", "orchestrator", "auto_fix"]);
const ListWorkerRunsQuerySchema = z.object({
  status: WorkerRunStatusSchema.optional(),
  missionId: z.string().min(1).optional(),
  workerType: WorkerTypeSchema.optional(),
});

const CreateWorkerRunRequestSchema = z.object({
  workerType: WorkerTypeSchema,
  status: WorkerRunStatusSchema,
  mode: WorkerRunModeSchema.default("dry-run"),
  command: z.string().optional(),
  stdoutPath: z.string().optional(),
  stderrPath: z.string().optional(),
  startedAt: DateTimeStringSchema.optional(),
  finishedAt: DateTimeStringSchema.optional(),
  exitCode: z.number().int().optional(),
  input: JsonObjectSchema.default({}),
  output: JsonObjectSchema.default({}),
  error: z.string().optional(),
  logs: z.array(z.string()).default([]),
  metadata: JsonObjectSchema.default({}),
});

const UpdateWorkerRunRequestSchema = CreateWorkerRunRequestSchema.omit({ workerType: true }).partial().extend({
  workerType: WorkerTypeSchema.optional(),
});

const CreateArtifactRequestSchema = z.object({
  type: z.string().min(1),
  name: z.string().optional(),
  path: z.string().min(1),
  workerRunId: z.string().min(1).optional(),
  content: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  metadata: JsonObjectSchema.default({}),
});

const BugStatusSchema = z.enum(["open", "in_progress", "fixed", "accepted", "wont_fix"]);

const CreateBugRequestSchema = z.object({
  qaRunId: z.string().min(1).optional(),
  title: z.string().min(1),
  severity: z.enum(["P0", "P1", "P2", "P3"]),
  status: BugStatusSchema.default("open"),
  reproductionSteps: z.array(z.string().min(1)).min(1),
  expectedResult: z.string().min(1),
  actualResult: z.string().min(1),
  evidence: JsonObjectSchema.default({}),
  suggestedFix: z.string().optional(),
  regressionTestPath: z.string().optional(),
  suggestedFixDirection: z.string().optional(),
  source: z.string().optional(),
});

const UpdateBugRequestSchema = CreateBugRequestSchema.partial();

const QARunStatusSchema = z.enum(["queued", "passed", "failed", "running", "cancelled"]);
const QARunModeSchema = z.enum(["dry-run", "mock", "playwright", "playwright-mcp", "deterministic", "ai_exploratory", "regression", "smoke"]);

const CreateQARunRequestSchema = z.object({
  targetUrl: z.string().url().optional(),
  mode: QARunModeSchema,
  status: QARunStatusSchema,
  summary: z.string().min(1),
  reportPath: z.string().optional(),
  screenshotsDir: z.string().optional(),
  tracePath: z.string().optional(),
  bugsJsonPath: z.string().optional(),
  stagingUrl: z.string().url().optional(),
  passed: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  startedAt: DateTimeStringSchema.optional(),
  finishedAt: DateTimeStringSchema.optional(),
});

const UpdateQARunRequestSchema = CreateQARunRequestSchema.partial();
const IntegrationNameParamSchema = z.enum(["github", "coolify", "uptime_kuma", "uptime-kuma", "plane"]);
const IntegrationDryRunRequestSchema = z.record(z.unknown());

type IntegrationDryRunInput = GitHubDryRunInput | CoolifyDryRunInput | UptimeKumaDryRunInput | PlaneDryRunInput;

const QUEUE_ENQUEUE_FAILED_MESSAGE = "Queue enqueue failed. Check Redis and Worker Runtime configuration.";
const DEMO_MISSION_REQUIRED_MESSAGE = "Demo mission must exist before queued demo action. Run pnpm psf demo:seed or run the inline demo first.";
const QUEUE_RUNTIME_UNAVAILABLE_MESSAGE = "Queue runtime is unavailable. Check Redis and Worker Runtime configuration.";

export interface MissionServiceOptions {
  registryRoot?: string;
  actionExecutionMode?: ActionExecutionMode;
  workerRuntime?: WorkerRuntime;
}

export function createMissionServices(storage: MissionStorage, options: MissionServiceOptions = {}) {
  const registryRoot = options.registryRoot ?? "projects";
  const shouldTryPackageRelativeRegistryRoot = options.registryRoot === undefined && registryRoot === "projects";
  const actionExecutionMode = options.actionExecutionMode ?? "inline";
  const workerRuntime = options.workerRuntime;
  async function getRawMission(id: string) {
    const mission = await storage.getMission(id);
    if (!mission) {
      throw notFound("Mission", id);
    }
    return mission;
  }

  async function validateWorkerRunBelongsToMission(workerRunId: string, missionId: string) {
    const workerRun = await storage.getWorkerRun(workerRunId);
    if (!workerRun) {
      throw notFound("WorkerRun", workerRunId);
    }
    if (workerRun.mission_id !== missionId) {
      throw badRequest("VALIDATION_ERROR", "WorkerRun does not belong to Mission", { worker_run_id: workerRunId, mission_id: missionId });
    }
  }

  async function validateQARunBelongsToMission(qaRunId: string, missionId: string) {
    const qaRun = await storage.getQARun(qaRunId);
    if (!qaRun) {
      throw notFound("QARun", qaRunId);
    }
    if (qaRun.mission_id !== missionId) {
      throw badRequest("VALIDATION_ERROR", "QARun does not belong to Mission", { qa_run_id: qaRunId, mission_id: missionId });
    }
  }

  async function scanRegistryOrValidationError(root: string) {
    try {
      return await scanProjectRegistry(root);
    } catch (error) {
      if (error instanceof ProjectRegistryError) {
        throw badRequest("VALIDATION_ERROR", error.message, { code: error.code, ...error.details });
      }
      throw error;
    }
  }

  async function getRegistryProject(projectId: string) {
    const registryProjects = await scanRegistryOrValidationError(registryRoot);
    const registryProject = findProjectById(registryProjects, projectId);
    if (registryProject) {
      return registryProject;
    }

    if (shouldTryPackageRelativeRegistryRoot) {
      const packageRelativeRoot = join(process.cwd(), "..", "..", "projects");
      const fallbackProjects = await scanRegistryOrValidationError(packageRelativeRoot);
      const fallbackProject = findProjectById(fallbackProjects, projectId);
      if (fallbackProject) {
        return fallbackProject;
      }
    }

    throw notFound("ProjectPassport", projectId);
  }

  async function readQaCharterNextToPassport(passportPath: string) {
    const qaCharterPath = join(dirname(passportPath), "qa-charter.md");
    try {
      return await readFile(qaCharterPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return "";
      }
      throw badRequest("VALIDATION_ERROR", "Unable to read QA charter", { path: qaCharterPath, cause: errorMessage(error) });
    }
  }

  async function getExistingPlannerResult(missionId: string) {
    return getExistingPlannerResultFromStorage(storage, missionId);
  }

  function sanitizeApiResponse<T>(value: T): T {
    return sanitizeApiValue(value) as T;
  }

  function sanitizeApiValue(value: unknown, keyName?: string): unknown {
    if (typeof keyName === "string" && isSecretLikeName(keyName)) {
      return (redactValue({ [keyName]: value }, process.env) as Record<string, unknown>)[keyName];
    }

    if (typeof value === "string") {
      return isPlainSafeUrl(value) ? value : redactValue(value, process.env);
    }

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeApiValue(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeApiValue(entryValue, entryKey)]),
      );
    }

    return value;
  }

  function isPlainSafeUrl(value: string): boolean {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return false;
      }
      if (url.username || url.password) {
        return false;
      }
      return [...url.searchParams.keys()].every((key) => !isSecretLikeName(key));
    } catch {
      return false;
    }
  }

  function sanitizeApiList<T>(values: T[]): T[] {
    return values.map((value) => sanitizeApiResponse(value));
  }

  async function getRawApproval(id: string) {
    const approval = await storage.getApproval(id);
    if (!approval) {
      throw notFound("Approval", id);
    }
    return approval;
  }

  async function getRawWorkerRun(id: string) {
    const workerRun = await storage.getWorkerRun(id);
    if (!workerRun) {
      throw notFound("WorkerRun", id);
    }
    return workerRun;
  }

  async function getRawBug(id: string) {
    const bug = await storage.getBug(id);
    if (!bug) {
      throw notFound("BugReport", id);
    }
    return bug;
  }

  async function getRawQARun(id: string) {
    const qaRun = await storage.getQARun(id);
    if (!qaRun) {
      throw notFound("QARun", id);
    }
    return qaRun;
  }


  async function preflightMissionAction(id: string, action: QueuedActionKind) {
    const mission = await getRawMission(id);
    const project = await storage.getProject(mission.project_id);
    if (!project) {
      throw notFound("Project", mission.project_id);
    }
    const registryProject = await getRegistryProject(mission.project_id);
    assertMissionActionWhitelisted(action);
    assertMissionActionStatusAllowed(mission, action);
    assertRequiredPassportCommands(registryProject, action);
    assertActionTargetUrlAvailable(project, registryProject, action);
    return { mission, registryProject };
  }

  async function preflightGatedRealAction(id: string, action: GatedRealActionKind, requestedTargetUrl?: string) {
    const mission = await getRawMission(id);
    const project = await storage.getProject(mission.project_id);
    if (!project) {
      throw notFound("Project", mission.project_id);
    }
    const registryProject = await getRegistryProject(mission.project_id);
    assertGatedRealActionStatusAllowed(mission, action);
    assertRequiredGatedRealPassportCommands(registryProject, action);
    assertGatedRealTargetUrlAvailable(project, registryProject, action, requestedTargetUrl);
    return { mission, project, registryProject };
  }

  function assertMissionActionStatusAllowed(mission: Mission, action: QueuedActionKind) {
    if (isTerminalOrManualStatus(mission.status)) {
      throw actionPreflightBlocked(action, mission, `Mission status ${mission.status} does not allow ${action} dry-run actions.`);
    }
  }

  function assertGatedRealActionStatusAllowed(mission: Mission, action: GatedRealActionKind) {
    if (isTerminalOrManualStatus(mission.status)) {
      throw actionPreflightBlocked(action, mission, `Mission status ${mission.status} does not allow ${action} actions.`);
    }
  }

  function isTerminalOrManualStatus(status: Mission["status"]): boolean {
    return status === MissionStatus.released
      || status === MissionStatus.failed
      || status === MissionStatus.cancelled
      || status === MissionStatus.blocked
      || status === MissionStatus.needs_human;
  }

  function assertRequiredPassportCommands(registryProject: RegistryProject, action: QueuedActionKind) {
    const requiredCommands = requiredPassportCommandsForAction(action);
    const missingCommands = requiredCommands.filter((command) => !passportCommandAvailable(registryProject, command));
    if (missingCommands.length > 0) {
      throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", `Project Passport is missing required command(s) for ${action}: ${missingCommands.join(", ")}.`, {
        projectId: registryProject.project.id,
        passportPath: registryProject.passportPath,
        action,
        missingCommands,
        recommendedNextAction: "Update project.passport.yaml or use an action that does not require those project commands.",
      });
    }
  }

  function assertRequiredGatedRealPassportCommands(registryProject: RegistryProject, action: GatedRealActionKind) {
    const requiredCommands = requiredPassportCommandsForGatedRealAction(action);
    const missingCommands = requiredCommands.filter((command) => !passportCommandAvailable(registryProject, command));
    if (missingCommands.length > 0) {
      throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", `Project Passport is missing required command(s) for ${action}: ${missingCommands.join(", ")}.`, {
        projectId: registryProject.project.id,
        passportPath: registryProject.passportPath,
        action,
        missingCommands,
        recommendedNextAction: "Update project.passport.yaml before enabling gated real execution.",
      });
    }
  }

  function assertActionTargetUrlAvailable(project: MissionProjectLike, registryProject: RegistryProject, action: QueuedActionKind) {
    if (action !== "qa" && action !== "loop") {
      return;
    }
    if (!hasQaTargetUrl(project, registryProject)) {
      throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", `QA action ${action} requires a local or staging target URL.`, {
        projectId: registryProject.project.id,
        passportPath: registryProject.passportPath,
        action,
        missingTargetUrl: true,
        recommendedNextAction: "Add urls.local or urls.staging to project.passport.yaml, or provide a staging URL before running QA.",
      });
    }
  }

  function assertGatedRealTargetUrlAvailable(project: MissionProjectLike, registryProject: RegistryProject, action: GatedRealActionKind, requestedTargetUrl?: string) {
    const needsQaTarget = action === "qa-playwright" || action === "qa-ai-exploratory" || action === "fix-real" || action === "monitor-sync";
    if (!needsQaTarget) {
      return;
    }
    if (!isNonEmptyString(requestedTargetUrl) && !hasQaTargetUrl(project, registryProject)) {
      throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", `${action} requires a local, staging, or production target URL.`, blockedPreflightDetails(buildReadinessBlocker({
        category: "configuration",
        key: "configuration.target_url.missing",
        message: action + " requires a local, staging, or production target URL.",
        recommendedNextAction: "Add urls.local, urls.staging, or urls.production to project.passport.yaml before enabling this action.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action, missingTargetUrl: true },
      }), {
        projectId: registryProject.project.id,
        passportPath: registryProject.passportPath,
        action,
        missingTargetUrl: true,
      }));
    }
  }

  type PassportCommandName = keyof RegistryProject["passport"]["commands"];
  type MissionProjectLike = Awaited<ReturnType<MissionStorage["getProject"]>> extends infer ProjectOrNull ? NonNullable<ProjectOrNull> : never;

  function requiredPassportCommandsForAction(action: QueuedActionKind): PassportCommandName[] {
    switch (action) {
      case "codex":
        return ["test", "build"];
      case "qa":
        return ["e2e"];
      case "fix":
        return ["test"];
      case "loop":
        return ["test", "e2e"];
      case "plan":
      case "demo":
        return [];
    }
  }

  function requiredPassportCommandsForGatedRealAction(action: GatedRealActionKind): PassportCommandName[] {
    switch (action) {
      case "codex-real":
        return ["test", "build"];
      case "qa-playwright":
      case "qa-ai-exploratory":
        return ["e2e"];
      case "fix-real":
        return ["test", "e2e"];
      case "deploy-staging":
        return ["run_staging"];
      case "github-pr":
      case "monitor-sync":
      case "plane-sync":
        return [];
    }
  }

  function passportCommandAvailable(registryProject: RegistryProject, command: PassportCommandName): boolean {
    const value = registryProject.passport.commands[command];
    if (Array.isArray(value)) {
      return value.some((entry) => isNonEmptyString(entry));
    }
    return isNonEmptyString(value);
  }

  function hasQaTargetUrl(project: MissionProjectLike, registryProject: RegistryProject): boolean {
    return [
      project.production_url,
      project.staging_url,
      registryProject.passport.urls.local,
      registryProject.passport.urls.staging,
      registryProject.passport.urls.production,
    ].some(isNonEmptyString);
  }

  function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
  }

  function blockedPreflightDetails(blocker: ReadinessBlocker, extra: Record<string, unknown>) {
    const readinessState = deriveReadinessState([blocker], blocker.recommendedNextAction);
    return {
      ...extra,
      canQueue: readinessState.canQueue,
      canExecute: readinessState.canExecute,
      blockers: readinessState.blockers,
      recommendedNextAction: readinessState.recommendedNextAction,
      realNetworkCall: false,
      realExternalCall: false,
      realPush: false,
      realDeploy: false,
    };
  }

  function actionPreflightBlocked(action: QueuedActionKind | GatedRealActionKind, mission: Mission, message: string) {
    return badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", message, {
      missionId: mission.id,
      projectId: mission.project_id,
      action,
      status: mission.status,
      recommendedNextAction: "Move the Mission to an allowed active workflow status before running this action.",
    });
  }

  async function buildGatedRealActionContext(
    action: GatedRealActionKind,
    mission: Mission,
    project: MissionProjectLike,
    registryProject: RegistryProject,
    input: z.infer<typeof RealActionRequestSchema>,
  ): Promise<Record<string, unknown>> {
    const missionFiles = await buildMissionFilesContext(mission);
    if (action === "qa-playwright") {
      return sanitizeApiResponse({
        passport: registryProject.passport,
        qaCharter: await readQaCharterNextToPassport(registryProject.passportPath),
        missionFiles,
        targetUrl: resolveRealActionTargetUrl(input, project, registryProject),
        e2eCommandMetadata: {
          commands: normalizeCommandValues(registryProject.passport.commands.e2e),
          executionPolicy: "review-only",
        },
      });
    }
    if (action === "codex-real") {
      const repoUrl = resolveCodexLocalRepoUrl(input, registryProject);
      assertCodexLocalRepoUrlAvailable(mission, registryProject, repoUrl);
      const branchName = resolveCodexBranchName(input, mission, registryProject);
      assertCodexBranchNameAllowed(mission, branchName);
      return sanitizeApiResponse({
        passport: registryProject.passport,
        missionFiles,
        projectAgents: await readProjectAgentsContext(registryProject.passportPath),
        repoUrl,
        defaultBranch: registryProject.passport.repo.default_branch,
        branchName,
        workspaceRoot: resolveCodexWorkspaceRoot(input, registryProject),
        commands: buildSafeCodexCommands(registryProject),
      });
    }
    if (action === "fix-real") {
      const branchName = resolveCodexBranchName(input, mission, registryProject);
      assertCodexBranchNameAllowed(mission, branchName);
      const openBugs = (await storage.listMissionBugs(mission.id)).filter((bug) => !isResolvedBugForFixContext(bug.status));
      return sanitizeApiResponse({
        missionStatus: mission.status,
        currentAttempt: mission.current_attempt,
        maxAttempts: mission.max_attempts,
        bugs: openBugs,
        perBugAttempts: buildPerBugAttempts(openBugs),
        maxBugAttempts: 2,
        passport: registryProject.passport,
        projectAgents: await readProjectAgentsContext(registryProject.passportPath),
        missionFiles,
        verificationCommands: buildFixVerificationCommands(registryProject),
        regressionEvidence: await buildRegressionEvidenceContext(mission.id, openBugs),
        branchName,
        currentBranch: nonEmptyStringOrUndefined(mission.branch_name) ?? branchName,
        workspaceRoot: resolveCodexWorkspaceRoot(input, registryProject),
        targetUrl: resolveRealActionTargetUrl(input, project, registryProject),
        safetyNotes: "No push, PR creation, deploy, or external provider call is allowed by fix-real default context.",
      });
    }
    if (action === "github-pr") {
      return sanitizeApiResponse(await buildGithubPrActionContext(mission, project, registryProject, input, missionFiles));
    }
    return {};
  }

  async function buildMissionFilesContext(mission: Mission): Promise<Record<typeof plannerFileNames[number], string>> {
    const artifacts = (await getExistingPlannerResult(mission.id))?.artifacts ?? [];
    return {
      "mission.md": findPlannerArtifactContent(artifacts, "mission.md") ?? nonEmptyStringOrUndefined(mission.mission_markdown) ?? `# Mission

${mission.title}

${mission.raw_request}
`,
      "acceptance.md": findPlannerArtifactContent(artifacts, "acceptance.md") ?? nonEmptyStringOrUndefined(mission.acceptance_markdown) ?? `# Acceptance

No acceptance notes have been planned yet.
`,
      "technical-notes.md": findPlannerArtifactContent(artifacts, "technical-notes.md") ?? `# Technical Notes

No planner technical notes are available yet.
`,
      "risk-notes.md": findPlannerArtifactContent(artifacts, "risk-notes.md") ?? `# Risk Notes

Risk level: ${mission.risk_level}.
`,
    };
  }

  function findPlannerArtifactContent(artifacts: Artifact[], fileName: typeof plannerFileNames[number]): string | undefined {
    const artifact = artifacts.find((candidate) => candidate.path === `missions/${candidate.mission_id}/${fileName}`);
    return nonEmptyStringOrUndefined(artifact?.content);
  }

  function resolveRealActionTargetUrl(input: z.infer<typeof RealActionRequestSchema>, project: MissionProjectLike, registryProject: RegistryProject): string | undefined {
    return [
      input.targetUrl,
      project.staging_url,
      project.production_url,
      registryProject.passport.urls.local,
      registryProject.passport.urls.staging,
      registryProject.passport.urls.production,
    ].find(isNonEmptyString);
  }

  function resolveCodexLocalRepoUrl(input: z.infer<typeof RealActionRequestSchema>, registryProject: RegistryProject): string | undefined {
    return [
      input.repoUrl,
      process.env[localRepoEnvName(registryProject.project.id)],
      process.env[localRepoEnvName(registryProject.project.id).toUpperCase()],
    ].find(isNonEmptyString);
  }

  function localRepoEnvName(projectId: string): string {
    return `PSF_LOCAL_REPO_${projectId.replace(/[^A-Za-z0-9]+/g, "_")}`;
  }

  function assertCodexLocalRepoUrlAvailable(mission: Mission, registryProject: RegistryProject, repoUrl: string | undefined) {
    if (repoUrl && isLocalRepoUrl(repoUrl)) {
      return;
    }
    throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", "codex-real requires an explicitly provided local repository mirror; GitHub HTTPS/SSH remotes are not accepted as real Codex repoUrl values.", {
      missionId: mission.id,
      projectId: mission.project_id,
      passportPath: registryProject.passportPath,
      action: "codex-real",
      missingLocalMirror: true,
      recommendedNextAction: `Provide repoUrl in the request body, or set ${localRepoEnvName(registryProject.project.id)} to a local mirror path under operator control.`,
    });
  }

  function isLocalRepoUrl(repoUrl: string): boolean {
    return repoUrl.startsWith("file://") || !/^(?:[a-z][a-z0-9+.-]*:|[^@\s]+@[^:]+:)/i.test(repoUrl);
  }

  function resolveCodexBranchName(input: z.infer<typeof RealActionRequestSchema>, mission: Mission, registryProject: RegistryProject): string {
    return nonEmptyStringOrUndefined(input.branchName)
      ?? nonEmptyStringOrUndefined(mission.branch_name)
      ?? `agent/${slugForCodexBranch(registryProject.project.id)}-${slugForCodexBranch(mission.id)}`;
  }

  function assertCodexBranchNameAllowed(mission: Mission, branchName: string) {
    if (branchName === "main" || branchName === "master" || !branchName.startsWith("agent/")) {
      throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", "codex-real branchName must be under agent/ and cannot be main or master.", {
        missionId: mission.id,
        projectId: mission.project_id,
        action: "codex-real",
        invalidBranchName: branchName,
        recommendedNextAction: "Use a branch name such as agent/<project>-<mission> for real Codex work.",
      });
    }
  }

  function resolveCodexWorkspaceRoot(input: z.infer<typeof RealActionRequestSchema>, registryProject: RegistryProject): string {
    return nonEmptyStringOrUndefined(input.workspaceRoot)
      ?? nonEmptyStringOrUndefined(process.env.PSF_WORKSPACE_ROOT)
      ?? `./workspaces/${registryProject.project.id}`;
  }

  async function readProjectAgentsContext(passportPath: string): Promise<string> {
    const projectAgentsPath = join(dirname(passportPath), "AGENTS.md");
    const rootAgentsPath = join(process.cwd(), "AGENTS.md");
    for (const candidatePath of [projectAgentsPath, rootAgentsPath]) {
      try {
        return await readFile(candidatePath, "utf8");
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          continue;
        }
        throw badRequest("VALIDATION_ERROR", "Unable to read project AGENTS.md", { path: candidatePath, cause: errorMessage(error) });
      }
    }
    return "# AGENTS.md\nNo project AGENTS.md content was found during Orchestrator preflight.\n";
  }

  function buildSafeCodexCommands(registryProject: RegistryProject): string[] {
    const commands = uniqueNonEmptyStrings([
      ...normalizeCommandValues(registryProject.passport.commands.test),
      ...normalizeCommandValues(registryProject.passport.commands.build),
      ...normalizeCommandValues(registryProject.passport.commands.lint),
      ...normalizeCommandValues(registryProject.passport.commands.e2e),
    ]).filter(isSafeCodexPayloadCommand);
    return commands.length > 0 ? commands : ["pnpm test"];
  }

  async function buildGithubPrActionContext(
    mission: Mission,
    project: MissionProjectLike,
    registryProject: RegistryProject,
    input: z.infer<typeof RealActionRequestSchema>,
    missionFiles: Record<typeof plannerFileNames[number], string>,
  ): Promise<Record<string, unknown>> {
    const branchName = resolveCodexBranchName(input, mission, registryProject);
    assertCodexBranchNameAllowed(mission, branchName);
    const [artifacts, workerRuns, qaRuns, bugs, approvals] = await Promise.all([
      storage.listMissionArtifacts(mission.id),
      storage.listMissionWorkerRuns(mission.id),
      storage.listMissionQARuns(mission.id),
      storage.listMissionBugs(mission.id),
      storage.listMissionApprovals(mission.id),
    ]);
    const baseBranch = nonEmptyStringOrUndefined(input.baseBranch) ?? registryProject.passport.repo.default_branch ?? "main";
    const missionInput = buildGithubMissionInput({ mission, project, branchName, missionFiles, artifacts, workerRuns, qaRuns, bugs, approvals });
    const preview = runGitHubDryRun({ env: {}, mission: missionInput });
    return {
      mission: missionInput,
      branchName,
      baseBranch,
      ...(nonEmptyStringOrUndefined(input.sourceSha) ? { sourceSha: input.sourceSha } : {}),
      qaComment: buildGithubQaCommentPreview(missionInput),
      prPreview: preview.outputs.pullRequest,
      simulatedPullRequest: preview.outputs.simulatedPullRequest,
      approvalRecordIds: approvedApprovalRecordIdsForAction("github-pr", approvals),
      operationGates: {
        allowNetwork: false,
        allowPushBranch: false,
        allowCreatePullRequest: false,
        allowUpdatePullRequestBody: false,
        allowPostQaComment: false,
      },
      operationGateSummary: {
        realNetworkCall: false,
        allowNetwork: false,
        allowPushBranch: false,
        allowCreatePullRequest: false,
        allowPostQaComment: false,
        message: "GitHub PR preview is safe; real push/PR creation remains blocked until operation gates and injected transport are provided.",
      },
    };
  }

  function buildGithubMissionInput(input: {
    mission: Mission;
    project: MissionProjectLike;
    branchName: string;
    missionFiles: Record<typeof plannerFileNames[number], string>;
    artifacts: Artifact[];
    workerRuns: WorkerRun[];
    qaRuns: QAReport[];
    bugs: BugReport[];
    approvals: Approval[];
  }) {
    const qaReport = findLatestArtifactContent(input.artifacts, ["qa_report"]);
    const devSummary = findLatestArtifactContent(input.artifacts, ["dev_summary"]);
    const fixSummary = findLatestArtifactContent(input.artifacts, ["dev_summary", "technical_notes"], "fix");
    const riskNotes = input.missionFiles["risk-notes.md"];
    return {
      missionId: input.mission.id,
      missionTitle: input.mission.title,
      missionSummary: input.mission.mission_markdown || input.mission.raw_request,
      project: input.project.id,
      branchName: input.branchName,
      acceptanceCriteria: extractAcceptanceCriteria(input.missionFiles["acceptance.md"]),
      devSummary: devSummary ?? "Dev summary is not available yet.",
      qaReport: qaReport ?? latestQaSummary(input.qaRuns),
      bugFixSummary: fixSummary ?? summarizeBugsForPr(input.bugs),
      artifacts: input.artifacts.map((artifact) => artifact.path),
      workerRuns: input.workerRuns.map((run) => ({
        id: run.id,
        worker: run.worker_type,
        status: run.status,
        summary: stringFromJson(run.output, "summary") ?? run.error ?? run.logs.at(0) ?? "No summary.",
      })),
      risks: extractRiskList(riskNotes),
      requiresHumanApproval: input.approvals.some((approval) => approval.status === "pending") || input.bugs.some((bug) => !isResolvedBugForFixContext(bug.status)),
    };
  }

  function buildGithubQaCommentPreview(mission: ReturnType<typeof buildGithubMissionInput>): string {
    return [
      "## QA / Regression Preview",
      mission.qaReport,
      "",
      "## Bug / Fix Summary",
      mission.bugFixSummary,
      "",
      "Dry-run preview only; no GitHub network call has been made.",
    ].join("\n");
  }

  function findLatestArtifactContent(artifacts: Artifact[], types: string[], pathHint?: string): string | undefined {
    return [...artifacts].reverse().find((artifact) => {
      const typeMatches = types.includes(artifact.type);
      const pathMatches = pathHint === undefined || artifact.path.toLowerCase().includes(pathHint.toLowerCase());
      return typeMatches && pathMatches && isNonEmptyString(artifact.content);
    })?.content;
  }

  function extractAcceptanceCriteria(content: string): string[] {
    const items = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[-*]\s+/.test(line)).map((line) => line.replace(/^[-*]\s+/, ""));
    return items.length > 0 ? items.slice(0, 12) : ["Review acceptance.md before creating a PR."];
  }

  function latestQaSummary(qaRuns: QAReport[]): string {
    return [...qaRuns].reverse().find((qaRun) => isNonEmptyString(qaRun.summary))?.summary ?? "QA report is not available yet.";
  }

  function summarizeBugsForPr(bugs: BugReport[]): string {
    if (bugs.length === 0) {
      return "No BugReport is recorded for this Mission.";
    }
    return bugs.map((bug) => `- ${bug.id} [${bug.severity}/${bug.status}]: ${bug.title}`).join("\n");
  }

  function extractRiskList(content: string): string[] {
    const items = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[-*]\s+/.test(line)).map((line) => line.replace(/^[-*]\s+/, ""));
    return items.length > 0 ? items.slice(0, 12) : [content.trim() || "Review risk-notes.md before PR creation."];
  }

  function stringFromJson(value: unknown, key: string): string | undefined {
    return isRecord(value) && isNonEmptyString(value[key]) ? value[key] : undefined;
  }

  async function buildRegressionEvidenceContext(missionId: string, bugs: BugReport[]) {
    const artifacts = await storage.listMissionArtifacts(missionId);
    const candidate = findRegressionArtifactForBugs(artifacts, bugs);
    if (candidate?.content) {
      return { existingSpecPath: candidate.path, existingSpecContent: candidate.content };
    }
    const explicitPath = bugs.map((bug) => bug.regression_test_path).find(isNonEmptyString);
    if (explicitPath) {
      return { generatedSpec: { path: explicitPath, content: "", valid: false, errors: ["Regression artifact content is missing."] } };
    }
    return { generatedSpec: { valid: false, errors: ["Regression evidence is missing for open bugs."] } };
  }

  function findRegressionArtifactForBugs(artifacts: Artifact[], bugs: BugReport[]): Artifact | undefined {
    return artifacts.find((artifact) => {
      if (!isNonEmptyString(artifact.content)) {
        return false;
      }
      if (artifact.type !== "generated_test" && !artifact.path.toLowerCase().includes("regression")) {
        return false;
      }
      const content = artifact.content.toLowerCase();
      return bugs.length === 0 || bugs.some((bug) => [bug.id, bug.title, ...bug.reproduction_steps].some((signal) => content.includes(signal.toLowerCase())));
    });
  }

  function buildPerBugAttempts(bugs: BugReport[]): Record<string, number> {
    return Object.fromEntries(bugs.map((bug) => [bug.id, numberFromEvidence(bug.evidence, ["fixAttempts", "attempts", "currentAttempt"])]));
  }

  function numberFromEvidence(evidence: unknown, keys: string[]): number {
    if (!isRecord(evidence)) {
      return 0;
    }
    for (const key of keys) {
      const value = evidence[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
      }
    }
    return 0;
  }

  function buildFixVerificationCommands(registryProject: RegistryProject) {
    const test = normalizeCommandValues(registryProject.passport.commands.test);
    const e2e = normalizeCommandValues(registryProject.passport.commands.e2e);
    return {
      regression: e2e.length > 0 ? e2e : test,
      unit: test,
      e2e,
    };
  }

  function isResolvedBugForFixContext(status: BugReport["status"]): boolean {
    return status === "accepted" || status === "wont_fix";
  }

  function isSafeCodexPayloadCommand(command: string): boolean {
    if (/\b(?:push|deploy|curl|wget|ssh|scp|rsync|coolify|uptime|plane|gh)\b/i.test(command)) {
      return false;
    }
    return /^(?:pnpm (?:test|build|typecheck|check)|npm run (?:test|build|typecheck|check)|pytest(?: -q)?)$/.test(command);
  }

  function slugForCodexBranch(value: string): string {
    const slug = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.length > 0 ? slug : "mission";
  }

  function normalizeCommandValues(value: unknown): string[] {
    return uniqueNonEmptyStrings(Array.isArray(value) ? value : [value]);
  }

  function uniqueNonEmptyStrings(values: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      if (!isNonEmptyString(value)) {
        continue;
      }
      const normalized = value.trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
    return result;
  }

  function nonEmptyStringOrUndefined(value: unknown): string | undefined {
    return isNonEmptyString(value) ? value : undefined;
  }

  async function runMissionAction(
    id: string,
    body: unknown,
    action: QueuedActionKind,
    inlineRunner: (missionId: string, body: unknown) => Promise<unknown>,
  ) {
    const { mission } = await preflightMissionAction(id, action);
    if (actionExecutionMode === "queued") {
      return sanitizeApiResponse(await queueAction(mission, body, action));
    }
    if (mission.id === EXAMPLE_MISSION_ID) {
      return sanitizeApiResponse(await inlineRunner(id, body));
    }
    return sanitizeApiResponse(toGenericInlineDryRunActionResponse({
      action,
      missionId: mission.id,
      projectId: mission.project_id,
      body,
    }));
  }

  async function runGatedRealAction(id: string, body: unknown, action: GatedRealActionKind) {
    const input = parseRequest(RealActionRequestSchema, body ?? {});
    const { mission, project, registryProject } = await preflightGatedRealAction(id, action, input.targetUrl);
    const approvals = await storage.listMissionApprovals(mission.id);
    const approvalCoverage = buildActionApprovalCoverage(action, approvals);
    const realEnabled = isGatedRealActionEnabled(action);
    const approvalBlockers = approvalCoverage.missingApprovalTypes.map((approvalType) => buildReadinessBlocker({
      category: "approval",
      key: "approval." + approvalType + ".missing",
      message: action + " is missing approved Mission approval " + approvalType + ".",
      recommendedNextAction: "Create and approve a Mission approval of type " + approvalType + " before queueing this action.",
      severity: "blocking",
      blocks: ["queue", "execute"],
      source: "orchestrator",
      details: { action, approvalType },
    }));
    if (actionExecutionMode !== "queued" || !realEnabled || approvalCoverage.missingApprovalTypes.length > 0) {
      const blocked = toBlockedRealActionResponse({
        action,
        missionId: mission.id,
        projectId: mission.project_id,
        executionMode: actionExecutionMode,
        realEnabled,
        ...(approvalBlockers.length > 0 ? { blockers: approvalBlockers } : {}),
      });
      return sanitizeApiResponse({
        ...blocked,
        realEnabled,
        requiredApprovalTypes: approvalCoverage.requiredApprovalTypes,
        approvedApprovalTypes: approvalCoverage.approvedApprovalTypes,
        missingApprovalTypes: approvalCoverage.missingApprovalTypes,
        recommendedNextAction: approvalCoverage.missingApprovalTypes.length > 0
          ? blocked.recommendedNextAction + " Missing approved mission approvals: " + approvalCoverage.missingApprovalTypes.join(", ") + "."
          : blocked.recommendedNextAction,
      });
    }
    const context = await buildGatedRealActionContext(action, mission, project, registryProject, input);
    return sanitizeApiResponse(await queueAction(mission, {
      ...sanitizeApiResponse(input),
      approvalRecordIds: approvedApprovalRecordIdsForAction(action, approvals),
      approvalIds: approvalGrantIdsForAction(action),
    }, action, "real", context));
  }

  async function queueAction(mission: Mission, body: unknown, action: QueuedActionKind | GatedRealActionKind, mode: "dry-run" | "real" = "dry-run", context: Record<string, unknown> = {}) {
    if (!workerRuntime) {
      throw badRequest("QUEUE_RUNTIME_UNAVAILABLE", "Worker runtime is not configured for queued actions");
    }
    const now = new Date().toISOString();
    const workerRunId = "worker-run-" + randomUUID();
    const job = mode === "real"
      ? buildQueuedRealActionJob({
        action: action as GatedRealActionKind,
        missionId: mission.id,
        projectId: mission.project_id,
        workerRunId,
        body,
        context,
        approvalRecordIds: isRecord(body) && Array.isArray(body.approvalRecordIds)
          ? body.approvalRecordIds.filter((value): value is string => typeof value === "string")
          : [],
        approvalGrantIds: isRecord(body) && Array.isArray(body.approvalIds)
          ? body.approvalIds.filter((value): value is string => typeof value === "string")
          : [],
      })
      : buildQueuedActionJob({
        action: action as QueuedActionKind,
        missionId: mission.id,
        projectId: mission.project_id,
        workerRunId,
        body,
      });
    const wrapperOutput = buildQueueWrapperOutput(job);
    const wrapperWorkerRun: WorkerRun = {
      id: workerRunId,
      mission_id: mission.id,
      worker_type: "orchestrator",
      status: "queued",
      mode: job.mode,
      input: {
        action,
        jobType: job.type,
        payload: job.payload,
      },
      output: wrapperOutput,
      logs: [],
      metadata: {
        queueWrapper: true,
        jobId: job.id,
        jobType: job.type,
        ...(mode === "real" ? { realEnabled: true, realNetworkCall: false, realExternalCall: false } : {}),
      },
      created_at: now,
      updated_at: now,
    };
    const event = buildEvent(mission.id, "worker_run.queued", "Worker run queued", {
      worker_run_id: wrapperWorkerRun.id,
      status: wrapperWorkerRun.status,
      queueWrapper: true,
      jobId: job.id,
      jobType: job.type,
    }, now);
    await storage.createWorkerRun({ resource: wrapperWorkerRun, event });
    try {
      await workerRuntime.enqueue(job);
    } catch {
      const failedAt = nextTimestamp(now);
      const failedWorkerRun: WorkerRun = {
        ...wrapperWorkerRun,
        status: "failed",
        error: QUEUE_ENQUEUE_FAILED_MESSAGE,
        output: {
          ...wrapperOutput,
          summary: "Queue enqueue failed before Worker Runner could consume the job.",
          recommendedNextAction: "Check Redis and Worker Runtime configuration, then retry the dry-run action.",
          errorCode: "QUEUE_ENQUEUE_FAILED",
        },
        updated_at: failedAt,
      };
      await storage.updateWorkerRun({
        resource: failedWorkerRun,
        event: buildEvent(mission.id, "worker_run.failed", "Worker run queue enqueue failed", {
          worker_run_id: failedWorkerRun.id,
          status: failedWorkerRun.status,
          queueWrapper: true,
          jobId: job.id,
          jobType: job.type,
          errorCode: "QUEUE_ENQUEUE_FAILED",
        }, failedAt),
      });
      throw serviceUnavailable("QUEUE_ENQUEUE_FAILED", QUEUE_ENQUEUE_FAILED_MESSAGE, {
        workerRunId: wrapperWorkerRun.id,
        jobId: job.id,
        jobType: job.type,
      });
    }
    if (mode === "real") {
      return toQueuedRealActionResponse({
        action: action as GatedRealActionKind,
        missionId: mission.id,
        projectId: mission.project_id,
        executionMode: actionExecutionMode,
        workerRunId: wrapperWorkerRun.id,
        job,
      });
    }
    return toQueuedActionResponse({
      missionId: mission.id,
      projectId: mission.project_id,
      workerRunId: wrapperWorkerRun.id,
      job,
    });
  }

  return {
    async getDashboard() {
      const [projects, missions, approvals, workerRuns, artifacts, bugs, qaRuns] = await Promise.all([
        storage.listProjects(),
        storage.listMissions(),
        storage.listApprovals(),
        storage.listAllWorkerRuns(),
        storage.listArtifacts(),
        storage.listBugs(),
        storage.listAllQARuns(),
      ]);
      const metrics = {
        projectCount: projects.length,
        missionCount: missions.length,
        runningMissionCount: missions.filter(isRunningMission).length,
        failedMissionCount: missions.filter((mission) => mission.status === MissionStatus.failed).length,
        readyForReviewMissionCount: missions.filter((mission) => mission.status === MissionStatus.ready_for_review).length,
        qaRunCount: qaRuns.length,
        qaFailedCount: qaRuns.filter((qaRun) => qaRun.status === "failed" || (qaRun.failed ?? 0) > 0).length,
        bugCount: bugs.length,
        openBugCount: bugs.filter(isOpenBug).length,
        p0p1BugCount: bugs.filter((bug) => bug.severity === "P0" || bug.severity === "P1").length,
        pendingApprovalCount: approvals.filter((approval) => approval.status === "pending").length,
        workerRunCount: workerRuns.length,
        artifactCount: artifacts.length,
      };
      const integrationStatuses = listIntegrationStatuses({ env: process.env });
      const realModeReadiness = buildRealModeReadiness({
        integrationStatuses,
        actionExecutionMode,
        workerRuntimeConfigured: workerRuntime !== undefined,
        env: process.env,
        approvals: [],
      });

      return {
        metrics,
        recentMissions: sanitizeApiList(recentByCreatedAt(missions)),
        recentBugs: sanitizeApiList(recentByCreatedAt(bugs)),
        recentWorkerRuns: sanitizeApiList(recentByCreatedAt(workerRuns)),
        recentFailedWorkerRuns: sanitizeApiList(recentByCreatedAt(workerRuns.filter((workerRun) => workerRun.status === "failed"))),
        recentQaRuns: sanitizeApiList(recentByCreatedAt(qaRuns)),
        recentArtifacts: sanitizeApiList(recentByCreatedAt(artifacts)),
        integrationStatuses,
        realModeReadiness,
        policyFailures: buildPolicyFailures(realModeReadiness),
        recommendedNextActions: buildDashboardRecommendedNextActions(metrics),
        healthSignals: buildDashboardHealthSignals(metrics),
      };
    },
    listProjects: async () => sanitizeApiList(await storage.listProjects()),
    async getProject(id: string) {
      const project = await storage.getProject(id);
      if (!project) {
        throw notFound("Project", id);
      }
      return sanitizeApiResponse(project);
    },
    async syncProjectRegistry() {
      const registryProjects = await scanRegistryOrValidationError(registryRoot);
      const projects = await storage.syncProjects(registryProjects.map((entry) => entry.project));
      return sanitizeApiResponse({ synced: projects.length, projects });
    },
    async getProjectPassport(projectId: string) {
      const project = await storage.getProject(projectId);
      if (!project) {
        throw notFound("Project", projectId);
      }
      return sanitizeApiResponse((await getRegistryProject(projectId)).passport);
    },
    listMissions: async () => sanitizeApiList(await storage.listMissions()),
    async getMission(id: string) {
      return sanitizeApiResponse(await getRawMission(id));
    },
    async getMissionSummary(id: string) {
      const mission = await getRawMission(id);
      const project = await storage.getProject(mission.project_id);
      if (!project) {
        throw notFound("Project", mission.project_id);
      }
      const [events, artifacts, workerRuns, qaRuns, bugs, approvals] = await Promise.all([
        storage.listMissionEvents(id),
        storage.listMissionArtifacts(id),
        storage.listMissionWorkerRuns(id),
        storage.listMissionQARuns(id),
        storage.listMissionBugs(id),
        storage.listMissionApprovals(id),
      ]);

      const safeEvents = sanitizeApiList(events);
      const safeArtifacts = sanitizeApiList(artifacts);
      const safeWorkerRuns = sanitizeApiList(workerRuns);
      const safeQARuns = sanitizeApiList(qaRuns);
      const safeBugs = sanitizeApiList(bugs);
      const safeApprovals = sanitizeApiList(approvals);

      const integrationStatuses = listIntegrationStatuses({ env: process.env });
      const realModeReadiness = buildRealModeReadiness({
        integrationStatuses,
        actionExecutionMode,
        workerRuntimeConfigured: workerRuntime !== undefined,
        env: process.env,
        approvals,
      });

      return {
        mission: sanitizeApiResponse(mission),
        project: sanitizeApiResponse(project),
        currentStatus: mission.status,
        events: safeEvents,
        artifacts: safeArtifacts,
        workerRuns: safeWorkerRuns,
        qaRuns: safeQARuns,
        bugs: safeBugs,
        approvals: safeApprovals,
        qaReportArtifact: findArtifactByType(safeArtifacts, "qa_report"),
        bugsJsonArtifact: findArtifactByType(safeArtifacts, "bugs_json"),
        codexPromptArtifact: findArtifactByType(safeArtifacts, "codex_prompt"),
        codexCommandArtifact: findArtifactByType(safeArtifacts, "codex_command"),
        fixMissionArtifact: findArtifactByType(safeArtifacts, "fix_mission"),
        fixCodexCommandArtifact: findArtifactByType(safeArtifacts, "fix_codex_command"),
        realModeReadiness,
        policyFailures: buildPolicyFailures(realModeReadiness),
        externalLinks: buildExternalLinks(sanitizeApiResponse(mission), safeWorkerRuns, safeArtifacts, safeApprovals),
        deploymentStatus: buildExternalStatus("deployment", safeWorkerRuns),
        monitorStatus: buildExternalStatus("monitor", safeWorkerRuns),
        planeStatus: buildExternalStatus("plane", safeWorkerRuns),
        artifactRetention: buildArtifactRetention(safeArtifacts),
        recommendedNextAction: buildMissionRecommendedNextAction(mission, bugs, approvals, qaRuns, workerRuns),
      };
    },
    listIntegrations() {
      return listIntegrationStatuses({ env: process.env });
    },
    runIntegrationDryRun(name: string, body: unknown) {
      const integrationName = parseRequest(IntegrationNameParamSchema, name) as ExternalIntegrationName;
      const input = parseRequest(IntegrationDryRunRequestSchema, body ?? {});
      return runIntegrationDryRun(integrationName, { ...input, env: process.env } as IntegrationDryRunInput);
    },
    async runMissionPlanAction(id: string, body: unknown) {
      return runMissionAction(id, body, "plan", runMissionPlanDryRunAction);
    },
    async runCodexDryRunAction(id: string, body: unknown) {
      return runMissionAction(id, body, "codex", runCodexDryRunDryRunAction);
    },
    async runQaDryRunAction(id: string, body: unknown) {
      return runMissionAction(id, body, "qa", runQaDryRunDryRunAction);
    },
    async runFixDryRunAction(id: string, body: unknown) {
      return runMissionAction(id, body, "fix", runFixDryRunDryRunAction);
    },
    async runLoopDryRunAction(id: string, body: unknown) {
      return runMissionAction(id, body, "loop", runLoopDryRunDryRunAction);
    },
    async runCodexRealAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "codex-real");
    },
    async runQaPlaywrightAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "qa-playwright");
    },
    async runQaAiExploratoryAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "qa-ai-exploratory");
    },
    async runFixRealAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "fix-real");
    },
    async runGithubPrAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "github-pr");
    },
    async runDeployStagingAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "deploy-staging");
    },
    async runMonitorSyncAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "monitor-sync");
    },
    async runPlaneSyncAction(id: string, body: unknown) {
      return runGatedRealAction(id, body, "plane-sync");
    },
    async runAiNovelistDemoAction(body: unknown) {
      if (actionExecutionMode === "queued") {
        const mission = await storage.getMission(EXAMPLE_MISSION_ID);
        if (!mission) {
          throw badRequest("DEMO_MISSION_REQUIRED", DEMO_MISSION_REQUIRED_MESSAGE, {
            missionId: EXAMPLE_MISSION_ID,
            suggestedCommands: ["pnpm psf demo:seed", "pnpm psf demo:ai-novelist"],
          });
        }
        return sanitizeApiResponse(await queueAction(mission, body, "demo"));
      }
      return sanitizeApiResponse(await runAiNovelistDemoDryRunAction(body));
    },
    async createMission(body: unknown) {
      const input = parseRequest(CreateMissionRequestSchema, body);
      const project = await storage.getProject(input.project_id);
      if (!project) {
        throw notFound("Project", input.project_id);
      }

      const now = new Date().toISOString();
      const id = "mission-" + randomUUID();
      const mission: Mission = {
        id,
        project_id: input.project_id,
        title: input.title,
        slug: slugify(input.title) + "-" + id.slice(-8),
        raw_request: input.raw_request,
        mission_markdown: input.mission_markdown ?? "",
        acceptance_markdown: input.acceptance_markdown ?? "",
        status: MissionStatus.received,
        priority: input.priority ?? "P2",
        risk_level: input.risk_level ?? "medium",
        branch_name: "",
        workspace_path: "",
        pr_url: "",
        current_attempt: 0,
        max_attempts: 3,
        created_at: now,
        updated_at: now,
      };
      const event = buildEvent(mission.id, "mission.created", "Mission created", { status: MissionStatus.received }, now);

      return sanitizeApiResponse(await storage.createMission({ mission, event }));
    },
    async planMission(id: string, body: unknown) {
      const input = parseRequest(PlanMissionRequestSchema, body ?? {});
      const mission = await getRawMission(id);
      if (mission.status !== MissionStatus.received && mission.status !== MissionStatus.planning && mission.status !== MissionStatus.planned) {
        throw invalidTransition(`Mission planning is not valid while status is ${mission.status}`);
      }

      const existing = await getExistingPlannerResult(mission.id);
      if (existing && mission.status === MissionStatus.planned) {
        return sanitizeApiResponse(buildPersistedPlanResponse(mission, existing));
      }
      if (existing && mission.status === MissionStatus.planning) {
        const completed = buildPlanningTransition(
          mission.id,
          MissionStatus.planning,
          MissionStatus.planned,
          nextTimestamp(existing.events.at(-1)?.created_at ?? new Date().toISOString()),
        );
        await storage.transitionMission(mission.id, completed.status, completed.event);
        return sanitizeApiResponse(buildPersistedPlanResponse(mission, existing));
      }
      if (mission.status === MissionStatus.planned) {
        throw invalidTransition("Mission is already planned but planner resources are missing");
      }

      const project = await storage.getProject(mission.project_id);
      if (!project) {
        throw notFound("Project", mission.project_id);
      }
      const registryProject = await getRegistryProject(project.id);
      const qaCharter = input.qaCharter ?? await readQaCharterNextToPassport(registryProject.passportPath);
      const plan = createDeterministicMissionPlan({
        projectId: project.id,
        userRequirement: input.userRequirement ?? mission.raw_request,
        passport: registryProject.passport,
        qaCharter,
        title: input.title ?? mission.title,
        priority: input.priority ?? mission.priority,
        missionId: mission.id,
      });

      let currentStatus: Mission["status"] = mission.status;
      let plannerEventBaseTimestamp = new Date().toISOString();
      if (currentStatus === MissionStatus.received) {
        const started = buildPlanningTransition(mission.id, MissionStatus.received, MissionStatus.planning);
        await storage.transitionMission(mission.id, started.status, started.event);
        currentStatus = started.status;
        plannerEventBaseTimestamp = started.event.created_at;
      }

      const plannerEvents = normalizePlannerEventTimestamps(plan.events, mission.id, plannerEventBaseTimestamp);
      const persisted = existing ?? await storage.recordPlannerResult({
        workerRun: plan.workerRun,
        artifacts: plan.artifacts,
        events: plannerEvents,
      });

      if (currentStatus === MissionStatus.planning) {
        const completed = buildPlanningTransition(
          mission.id,
          MissionStatus.planning,
          MissionStatus.planned,
          nextTimestamp(plannerEvents.at(-1)?.created_at ?? new Date().toISOString()),
        );
        await storage.transitionMission(mission.id, completed.status, completed.event);
      }

      return sanitizeApiResponse(buildPlanResponse(plan, persisted));
    },
    async transitionMission(id: string, body: unknown) {
      const input = parseRequest(TransitionRequestSchema, body);
      const mission = await getRawMission(id);
      try {
        const result = buildTransition({
          mission_id: id,
          from: mission.status,
          to: input.to,
          ...(input.actor === undefined ? {} : { actor: input.actor }),
          payload: input.payload ?? {},
        });
        return storage.transitionMission(id, result.status, result.event);
      } catch (error) {
        if (error instanceof Error) {
          throw invalidTransition(error.message);
        }
        throw error;
      }
    },
    async appendMissionEvent(id: string, body: unknown) {
      await getRawMission(id);
      const input = parseRequest(AppendEventRequestSchema, body);
      const event = buildEvent(id, input.type, input.message, input.payload ?? {});
      return sanitizeApiResponse(await storage.appendMissionEvent(event));
    },
    async listMissionEvents(id: string) {
      await getRawMission(id);
      return sanitizeApiList(await storage.listMissionEvents(id));
    },

    async createApproval(missionId: string, body: unknown) {
      await getRawMission(missionId);
      const input = parseRequest(CreateApprovalRequestSchema, body);
      const now = new Date().toISOString();
      const approval: Approval = {
        id: "approval-" + randomUUID(),
        mission_id: missionId,
        type: input.type,
        status: "pending",
        reason: input.reason,
        payload: input.payload ?? {},
        ...(input.requestedBy === undefined ? {} : { requested_by: input.requestedBy }),
        created_at: now,
      };
      const event = buildEvent(missionId, "approval.created", "Approval requested", { approval_id: approval.id, type: approval.type }, now);
      return sanitizeApiResponse(await storage.createApproval({ resource: approval, event }));
    },
    async listMissionApprovals(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionApprovals(missionId));
    },
    async listApprovals() {
      return sanitizeApiList(await storage.listApprovals());
    },
    async getApproval(id: string) {
      return sanitizeApiResponse(await getRawApproval(id));
    },
    async decideApproval(id: string, body: unknown) {
      const current = await getRawApproval(id);
      if (current.status !== "pending") {
        throw badRequest("VALIDATION_ERROR", "Approval decision can only be recorded while approval is pending", { approval_id: id, status: current.status });
      }
      const input = parseRequest(DecideApprovalRequestSchema, body);
      const now = new Date().toISOString();
      const approval: Approval = {
        ...current,
        status: input.status,
        ...(input.decidedBy === undefined ? {} : { decided_by: input.decidedBy }),
        ...(input.decision === undefined ? {} : { decision: input.decision }),
        decided_at: now,
        ...(input.status === "approved" ? { approved_at: now } : {}),
        ...(input.status === "rejected" ? { rejected_at: now } : {}),
      };
      const event = buildEvent(approval.mission_id, "approval.decided", "Approval decided", { approval_id: approval.id, status: approval.status }, now);
      try {
        return sanitizeApiResponse(await storage.decideApproval({ resource: approval, event }));
      } catch (error) {
        if (error instanceof ApprovalDecisionConflictError) {
          throw badRequest("VALIDATION_ERROR", "Approval decision can only be recorded while approval is pending", { approval_id: id });
        }
        throw error;
      }
    },

    async createWorkerRun(missionId: string, body: unknown) {
      await getRawMission(missionId);
      const input = parseRequest(CreateWorkerRunRequestSchema, body);
      const now = new Date().toISOString();
      const workerRun: WorkerRun = {
        id: "worker-run-" + randomUUID(),
        mission_id: missionId,
        worker_type: input.workerType,
        status: input.status,
        mode: input.mode,
        ...(input.command === undefined ? {} : { command: input.command }),
        ...(input.stdoutPath === undefined ? {} : { stdout_path: input.stdoutPath }),
        ...(input.stderrPath === undefined ? {} : { stderr_path: input.stderrPath }),
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        ...(input.exitCode === undefined ? {} : { exit_code: input.exitCode }),
        input: input.input ?? {},
        output: input.output ?? {},
        ...(input.error === undefined ? {} : { error: input.error }),
        logs: input.logs ?? [],
        metadata: input.metadata ?? {},
        created_at: now,
        updated_at: now,
      };
      const event = buildEvent(missionId, "worker_run.created", "Worker run created", { worker_run_id: workerRun.id, status: workerRun.status }, now);
      return sanitizeApiResponse(await storage.createWorkerRun({ resource: workerRun, event }));
    },
    async listMissionWorkerRuns(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionWorkerRuns(missionId));
    },
    async getWorkerRun(id: string) {
      return sanitizeApiResponse(await getRawWorkerRun(id));
    },
    async listWorkerRuns(query: unknown) {
      const filter = parseRequest(ListWorkerRunsQuerySchema, query ?? {});
      const workerRuns = await storage.listAllWorkerRuns();
      return sanitizeApiList(workerRuns.filter((workerRun) => {
        if (filter.status && workerRun.status !== filter.status) return false;
        if (filter.missionId && workerRun.mission_id !== filter.missionId) return false;
        if (filter.workerType && workerRun.worker_type !== filter.workerType) return false;
        return true;
      }));
    },
    async getQueueStatus() {
      if (!workerRuntime) {
        return buildUnavailableQueueStats("QUEUE_RUNTIME_UNAVAILABLE");
      }
      try {
        return sanitizeApiResponse(await workerRuntime.getQueueStats());
      } catch {
        return buildUnavailableQueueStats("QUEUE_RUNTIME_UNAVAILABLE");
      }
    },
    async getQueueJob(jobId: string) {
      const runtime = requireWorkerRuntime(workerRuntime);
      let job: QueuedJobRecord | null;
      try {
        job = await runtime.getJob(jobId);
      } catch {
        throw serviceUnavailable("QUEUE_RUNTIME_UNAVAILABLE", QUEUE_RUNTIME_UNAVAILABLE_MESSAGE);
      }
      if (!job) {
        throw notFound("QueueJob", jobId);
      }
      return sanitizeApiResponse(job);
    },
    async cancelWorkerRun(id: string) {
      const runtime = requireWorkerRuntime(workerRuntime);
      const current = await getRawWorkerRun(id);
      const wrapper = getQueueWrapperMetadata(current);
      if (!wrapper) {
        throw badRequest("QUEUE_WRAPPER_REQUIRED", "Only queue wrapper WorkerRuns can be cancelled", { workerRunId: id });
      }
      if (current.status !== "queued" && current.status !== "running") {
        throw badRequest("WORKER_RUN_NOT_CANCELLABLE", "Only queued or running queue wrapper WorkerRuns can be cancelled", { workerRunId: id, status: current.status });
      }

      let cancellationResult: QueuedJobRecord;
      try {
        cancellationResult = await runtime.cancelJob(wrapper.jobId);
      } catch {
        throw serviceUnavailable("QUEUE_RUNTIME_UNAVAILABLE", QUEUE_RUNTIME_UNAVAILABLE_MESSAGE, { workerRunId: id, jobId: wrapper.jobId, jobType: wrapper.jobType });
      }

      const now = new Date().toISOString();
      if (cancellationResult.status !== "cancelled") {
        const metadata = mergeJsonObject(current.metadata, {
          queueWrapper: true,
          jobId: wrapper.jobId,
          jobType: wrapper.jobType,
          cancellationRequested: true,
          cancellationRequestedAt: now,
          jobStatus: cancellationResult.status,
        });
        const output = mergeJsonObject(current.output, {
          jobId: wrapper.jobId,
          jobType: wrapper.jobType,
          cancellationRequested: true,
          cancellationRequestedAt: now,
          jobStatus: cancellationResult.status,
          summary: "Queue wrapper WorkerRun cancellation was requested; active jobs stop cooperatively.",
          recommendedNextAction: "Refresh WorkerRun status after the Worker Runner observes the cancellation request.",
        });
        const workerRun: WorkerRun = {
          ...current,
          metadata,
          output,
          updated_at: now,
        };
        return sanitizeApiResponse(await storage.updateWorkerRun({
          resource: workerRun,
          event: buildEvent(current.mission_id, "worker_run.cancellation_requested", "Queue wrapper worker run cancellation requested", {
            worker_run_id: id,
            status: workerRun.status,
            queueWrapper: true,
            jobId: wrapper.jobId,
            jobType: wrapper.jobType,
            jobStatus: cancellationResult.status,
            cancellationRequested: true,
          }, now),
        }));
      }

      const output = mergeJsonObject(current.output, {
        jobId: wrapper.jobId,
        jobType: wrapper.jobType,
        cancelledAt: now,
        summary: "Queue wrapper WorkerRun cancellation was requested.",
        recommendedNextAction: "Refresh the Mission summary and inspect WorkerRun state before retrying.",
      });
      const workerRun: WorkerRun = {
        ...current,
        status: "cancelled",
        output,
        updated_at: now,
        finished_at: current.finished_at ?? now,
      };
      return sanitizeApiResponse(await storage.updateWorkerRun({
        resource: workerRun,
        event: buildEvent(current.mission_id, "worker_run.cancelled", "Queue wrapper worker run cancelled", {
          worker_run_id: id,
          status: workerRun.status,
          queueWrapper: true,
          jobId: wrapper.jobId,
          jobType: wrapper.jobType,
        }, now),
      }));
    },
    async retryWorkerRun(id: string) {
      const runtime = requireWorkerRuntime(workerRuntime);
      const current = await getRawWorkerRun(id);
      const wrapper = getQueueWrapperMetadata(current);
      if (!wrapper) {
        throw badRequest("QUEUE_WRAPPER_REQUIRED", "Only queue wrapper WorkerRuns can be retried", { workerRunId: id });
      }
      if (current.status !== "failed" && current.status !== "cancelled") {
        throw badRequest("WORKER_RUN_NOT_RETRYABLE", "Only failed or cancelled queue wrapper WorkerRuns can be retried", { workerRunId: id, status: current.status });
      }

      let retryJob: QueuedJobRecord;
      try {
        retryJob = await runtime.retryJob(wrapper.jobId);
      } catch {
        throw serviceUnavailable("QUEUE_RUNTIME_UNAVAILABLE", QUEUE_RUNTIME_UNAVAILABLE_MESSAGE, { workerRunId: id, jobId: wrapper.jobId, jobType: wrapper.jobType });
      }

      const now = new Date().toISOString();
      const retryAttempt = retryJob.retryAttempt ?? nextRetryAttempt(current.output);
      const metadata = mergeJsonObject(current.metadata, {
        queueWrapper: true,
        jobId: retryJob.job.id,
        previousJobId: wrapper.jobId,
        jobType: wrapper.jobType,
        retryAttempt,
      });
      const output = mergeJsonObject(current.output, {
        jobId: retryJob.job.id,
        previousJobId: wrapper.jobId,
        jobType: wrapper.jobType,
        retryAttempt,
        summary: "Queue wrapper WorkerRun retry was queued.",
        recommendedNextAction: "Start or refresh the Worker Runner, then refresh Mission Summary.",
      });
      const workerRun: WorkerRun = {
        ...current,
        status: "queued",
        error: undefined,
        metadata,
        output,
        updated_at: now,
      };
      return sanitizeApiResponse(await storage.updateWorkerRun({
        resource: workerRun,
        event: buildEvent(current.mission_id, "worker_run.retried", "Queue wrapper worker run retried", {
          worker_run_id: id,
          status: workerRun.status,
          queueWrapper: true,
          jobId: retryJob.job.id,
          previousJobId: wrapper.jobId,
          jobType: wrapper.jobType,
          retryAttempt,
        }, now),
      }));
    },
    async updateWorkerRun(id: string, body: unknown) {
      const current = await getRawWorkerRun(id);
      const input = parseRequest(UpdateWorkerRunRequestSchema, body);
      const now = new Date().toISOString();
      const workerRun: WorkerRun = {
        ...current,
        ...(input.workerType === undefined ? {} : { worker_type: input.workerType }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.command === undefined ? {} : { command: input.command }),
        ...(input.stdoutPath === undefined ? {} : { stdout_path: input.stdoutPath }),
        ...(input.stderrPath === undefined ? {} : { stderr_path: input.stderrPath }),
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        ...(input.exitCode === undefined ? {} : { exit_code: input.exitCode }),
        ...(input.input === undefined ? {} : { input: input.input }),
        ...(input.output === undefined ? {} : { output: input.output }),
        ...(input.error === undefined ? {} : { error: input.error }),
        ...(input.logs === undefined ? {} : { logs: input.logs }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        updated_at: now,
      };
      const event = buildEvent(workerRun.mission_id, "worker_run.updated", "Worker run updated", { worker_run_id: workerRun.id, status: workerRun.status }, now);
      return sanitizeApiResponse(await storage.updateWorkerRun({ resource: workerRun, event }));
    },

    async createArtifact(missionId: string, body: unknown) {
      await getRawMission(missionId);
      const input = parseRequest(CreateArtifactRequestSchema, body);
      if (input.workerRunId !== undefined) {
        await validateWorkerRunBelongsToMission(input.workerRunId, missionId);
      }
      const now = new Date().toISOString();
      const artifact: Artifact = {
        id: "artifact-" + randomUUID(),
        mission_id: missionId,
        type: input.type,
        path: input.path,
        ...(input.workerRunId === undefined ? {} : { worker_run_id: input.workerRunId }),
        ...(input.content === undefined ? {} : { content: input.content }),
        ...(input.mimeType === undefined ? {} : { mime_type: input.mimeType }),
        size: input.size ?? Buffer.byteLength(input.content ?? "", "utf8"),
        metadata: input.name === undefined ? input.metadata ?? {} : { ...(input.metadata ?? {}), name: input.name },
        created_at: now,
      };
      const event = buildEvent(missionId, "artifact.created", "Artifact created", { artifact_id: artifact.id, type: artifact.type, path: artifact.path }, now);
      return sanitizeApiResponse(await storage.createArtifact({ resource: artifact, event }));
    },
    async listMissionArtifacts(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionArtifacts(missionId));
    },
    async listArtifacts() {
      return sanitizeApiList(await storage.listArtifacts());
    },
    async getArtifact(id: string) {
      const artifact = await storage.getArtifact(id);
      if (!artifact) {
        throw notFound("Artifact", id);
      }
      return sanitizeApiResponse(artifact);
    },

    async createBug(missionId: string, body: unknown) {
      await getRawMission(missionId);
      const input = parseRequest(CreateBugRequestSchema, body);
      if (input.qaRunId !== undefined) {
        await validateQARunBelongsToMission(input.qaRunId, missionId);
      }
      const now = new Date().toISOString();
      const bug: BugReport = {
        id: "bug-" + randomUUID(),
        mission_id: missionId,
        ...(input.qaRunId === undefined ? {} : { qa_run_id: input.qaRunId }),
        title: input.title,
        severity: input.severity,
        status: input.status ?? "open",
        reproduction_steps: input.reproductionSteps,
        expected_result: input.expectedResult,
        actual_result: input.actualResult,
        evidence: input.evidence ?? {},
        ...(input.suggestedFix === undefined ? {} : { suggested_fix: input.suggestedFix }),
        ...(input.regressionTestPath === undefined ? {} : { regression_test_path: input.regressionTestPath }),
        ...(input.suggestedFixDirection === undefined ? {} : { suggested_fix_direction: input.suggestedFixDirection }),
        ...(input.source === undefined ? {} : { source: input.source }),
        created_at: now,
        updated_at: now,
      };
      const event = buildEvent(missionId, "bug.created", "Bug report created", { bug_id: bug.id, severity: bug.severity, status: bug.status }, now);
      return sanitizeApiResponse(await storage.createBug({ resource: bug, event }));
    },
    async listMissionBugs(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionBugs(missionId));
    },
    async listBugs() {
      return sanitizeApiList(await storage.listBugs());
    },
    async getBug(id: string) {
      return sanitizeApiResponse(await getRawBug(id));
    },
    async updateBug(id: string, body: unknown) {
      const current = await getRawBug(id);
      const input = parseRequest(UpdateBugRequestSchema, body);
      if (input.qaRunId !== undefined) {
        await validateQARunBelongsToMission(input.qaRunId, current.mission_id);
      }
      const now = new Date().toISOString();
      const bug: BugReport = {
        ...current,
        ...(input.qaRunId === undefined ? {} : { qa_run_id: input.qaRunId }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.severity === undefined ? {} : { severity: input.severity }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.reproductionSteps === undefined ? {} : { reproduction_steps: input.reproductionSteps }),
        ...(input.expectedResult === undefined ? {} : { expected_result: input.expectedResult }),
        ...(input.actualResult === undefined ? {} : { actual_result: input.actualResult }),
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
        ...(input.suggestedFix === undefined ? {} : { suggested_fix: input.suggestedFix }),
        ...(input.regressionTestPath === undefined ? {} : { regression_test_path: input.regressionTestPath }),
        ...(input.suggestedFixDirection === undefined ? {} : { suggested_fix_direction: input.suggestedFixDirection }),
        ...(input.source === undefined ? {} : { source: input.source }),
        updated_at: now,
      };
      const event = buildEvent(bug.mission_id, "bug.updated", "Bug report updated", { bug_id: bug.id, status: bug.status }, now);
      return sanitizeApiResponse(await storage.updateBug({ resource: bug, event }));
    },

    async createQARun(missionId: string, body: unknown) {
      await getRawMission(missionId);
      const input = parseRequest(CreateQARunRequestSchema, body);
      const now = new Date().toISOString();
      const qaRun: QAReport = {
        id: "qa-run-" + randomUUID(),
        mission_id: missionId,
        target_url: input.targetUrl ?? input.stagingUrl ?? "",
        mode: input.mode,
        status: input.status,
        summary: input.summary,
        ...(input.reportPath === undefined ? {} : { report_path: input.reportPath }),
        ...(input.screenshotsDir === undefined ? {} : { screenshots_dir: input.screenshotsDir }),
        ...(input.tracePath === undefined ? {} : { trace_path: input.tracePath }),
        ...(input.bugsJsonPath === undefined ? {} : { bugs_json_path: input.bugsJsonPath }),
        ...(input.stagingUrl === undefined ? {} : { staging_url: input.stagingUrl }),
        passed: input.passed ?? 0,
        failed: input.failed ?? 0,
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        bugs: [],
        created_at: now,
        updated_at: now,
      };
      const event = buildEvent(missionId, "qa_run.created", "QA run created", { qa_run_id: qaRun.id, status: qaRun.status }, now);
      return sanitizeApiResponse(await storage.createQARun({ resource: qaRun, event }));
    },
    async listMissionQARuns(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionQARuns(missionId));
    },
    async getQARun(id: string) {
      return sanitizeApiResponse(await getRawQARun(id));
    },
    async updateQARun(id: string, body: unknown) {
      const current = await getRawQARun(id);
      const input = parseRequest(UpdateQARunRequestSchema, body);
      const now = new Date().toISOString();
      const qaRun: QAReport = {
        ...current,
        ...(input.targetUrl === undefined ? {} : { target_url: input.targetUrl }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.reportPath === undefined ? {} : { report_path: input.reportPath }),
        ...(input.screenshotsDir === undefined ? {} : { screenshots_dir: input.screenshotsDir }),
        ...(input.tracePath === undefined ? {} : { trace_path: input.tracePath }),
        ...(input.bugsJsonPath === undefined ? {} : { bugs_json_path: input.bugsJsonPath }),
        ...(input.stagingUrl === undefined ? {} : { staging_url: input.stagingUrl }),
        ...(input.passed === undefined ? {} : { passed: input.passed }),
        ...(input.failed === undefined ? {} : { failed: input.failed }),
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        updated_at: now,
      };
      const event = buildEvent(qaRun.mission_id, "qa_run.updated", "QA run updated", { qa_run_id: qaRun.id, status: qaRun.status }, now);
      return sanitizeApiResponse(await storage.updateQARun({ resource: qaRun, event }));
    },
  };
}


function requireWorkerRuntime(runtime?: WorkerRuntime): WorkerRuntime {
  if (!runtime) {
    throw badRequest("QUEUE_RUNTIME_UNAVAILABLE", "Worker runtime is not configured");
  }
  return runtime;
}

function buildUnavailableQueueStats(reason: string): QueueStats & { redisReachable: false; errorCode: string; message: string } {
  return {
    runtime: "unavailable",
    redisConfigured: false,
    redisReachable: false,
    counts: { queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0, delayed: 0 },
    errorCode: reason,
    message: QUEUE_RUNTIME_UNAVAILABLE_MESSAGE,
  };
}

type QueueWrapperMetadata = { jobId: string; jobType: string };

function getQueueWrapperMetadata(workerRun: WorkerRun): QueueWrapperMetadata | null {
  const metadata = isRecord(workerRun.metadata) ? workerRun.metadata : {};
  const output = isRecord(workerRun.output) ? workerRun.output : {};
  const queueWrapper = metadata.queueWrapper === true || output.queueWrapper === true;
  const jobId = typeof metadata.jobId === "string" ? metadata.jobId : typeof output.jobId === "string" ? output.jobId : undefined;
  const jobType = typeof metadata.jobType === "string" ? metadata.jobType : typeof output.jobType === "string" ? output.jobType : undefined;
  if (!queueWrapper || !jobId || !jobType) {
    return null;
  }
  return { jobId, jobType };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeJsonObject(value: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(isRecord(value) ? value : {}), ...patch };
}

function nextRetryAttempt(output: unknown): number {
  const current = isRecord(output) && typeof output.retryAttempt === "number" ? output.retryAttempt : 0;
  return current + 1;
}


function buildQueueWrapperOutput(job: QueueWorkerJob): Record<string, unknown> {
  const realMode = job.mode === "real";
  return {
    queueWrapper: true,
    jobId: job.id,
    jobType: job.type,
    childWorkerRunIds: [],
    childQARunIds: [],
    childArtifactIds: [],
    childBugReportIds: [],
    summary: realMode
      ? "Queued gated real-mode action; waiting for Worker Runner support."
      : "Queued dry-run action; waiting for Worker Runner consumption.",
    recommendedNextAction: realMode
      ? "Worker Runner real handlers land in Task 9; the API has not made any external call."
      : "Start or refresh the Worker Runner, then refresh Mission Summary.",
    ...(realMode ? { realEnabled: true, realNetworkCall: false, realExternalCall: false } : {}),
  };
}

type ZodSchema<T> = z.ZodType<T>;

function parseRequest<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest("VALIDATION_ERROR", "Request validation failed", result.error.flatten());
  }
  return result.data;
}

type PlannerResultResources = {
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
};

type PlannerResponsePlan = {
  missionId: string;
  title: string;
  files: Array<{ name: string; content: string }>;
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
};

const plannerFileNames = ["mission.md", "acceptance.md", "technical-notes.md", "risk-notes.md"] as const;
const plannerEventIds = ["planning-started", "planning-completed"] as const;

async function getExistingPlannerResultFromStorage(storage: MissionStorage, missionId: string): Promise<PlannerResultResources | null> {
  const workerRun = await storage.getWorkerRun(`worker-run-${missionId}-planner`);
  if (!workerRun || workerRun.mission_id !== missionId) {
    return null;
  }

  const missionArtifacts = await storage.listMissionArtifacts(missionId);
  const artifacts = [];
  for (const fileName of plannerFileNames) {
    const existing = missionArtifacts.find((artifact) => artifact.path === `missions/${missionId}/${fileName}`);
    if (!existing) {
      return null;
    }
    artifacts.push(existing);
  }

  const missionEvents = await storage.listMissionEvents(missionId);
  const events = [];
  for (const idSuffix of plannerEventIds) {
    const existing = missionEvents.find((candidate) => candidate.id === `event-${missionId}-${idSuffix}`);
    if (!existing) {
      return null;
    }
    events.push(existing);
  }

  return { workerRun, artifacts, events };
}

function buildPlanResponse(plan: PlannerResponsePlan, persisted: PlannerResultResources) {
  return {
    missionId: plan.missionId,
    title: plan.title,
    files: plan.files.map((file) => ({
      name: file.name,
      path: `missions/${plan.missionId}/${file.name}`,
      size: Buffer.byteLength(file.content, "utf8"),
    })),
    workerRun: persisted.workerRun,
    artifacts: persisted.artifacts.map(compactArtifact),
    events: persisted.events,
  };
}

function buildPersistedPlanResponse(mission: Mission, persisted: PlannerResultResources) {
  return {
    missionId: mission.id,
    title: typeof persisted.workerRun.input.title === "string" ? persisted.workerRun.input.title : mission.title,
    files: persisted.artifacts.map((artifact) => ({
      name: fileNameFromPath(artifact.path),
      path: artifact.path,
      size: artifact.size,
    })),
    workerRun: persisted.workerRun,
    artifacts: persisted.artifacts.map(compactArtifact),
    events: persisted.events,
  };
}

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function normalizePlannerEventTimestamps(events: MissionEvent[], missionId: string, afterTimestamp: string): MissionEvent[] {
  const base = new Date(afterTimestamp).getTime();
  return events.map((event, index) => ({
    ...event,
    mission_id: missionId,
    created_at: new Date(base + index + 1).toISOString(),
  }));
}

function nextTimestamp(value: string): string {
  return new Date(new Date(value).getTime() + 1).toISOString();
}

function buildPlanningTransition(missionId: string, from: Mission["status"], to: Mission["status"], createdAt?: string) {
  if (!canTransition(from, to)) {
    throw invalidTransition(`Invalid Mission transition from ${from} to ${to}`);
  }
  const result = buildTransition({
    mission_id: missionId,
    from,
    to,
    actor: "mission-planner",
    payload: { source: "mission-planner" },
  });
  return createdAt === undefined ? result : { ...result, event: { ...result.event, created_at: createdAt } };
}

function buildEvent(missionId: string, type: string, message: string, payload: Record<string, unknown>, createdAt = new Date().toISOString()): MissionEvent {
  return {
    id: randomUUID(),
    mission_id: missionId,
    type,
    message,
    payload,
    created_at: createdAt,
  };
}

const runningMissionStatuses = new Set<Mission["status"]>([
  MissionStatus.planning,
  MissionStatus.dev_queued,
  MissionStatus.dev_running,
  MissionStatus.build_running,
  MissionStatus.test_running,
  MissionStatus.staging_deploying,
  MissionStatus.qa_running,
  MissionStatus.fixing,
  MissionStatus.regression_running,
  MissionStatus.production_deploying,
]);

const openBugStatuses = new Set<BugReport["status"]>(["open", "in_progress"]);

type DashboardMetrics = {
  projectCount: number;
  missionCount: number;
  runningMissionCount: number;
  failedMissionCount: number;
  readyForReviewMissionCount: number;
  qaRunCount: number;
  qaFailedCount: number;
  bugCount: number;
  openBugCount: number;
  p0p1BugCount: number;
  pendingApprovalCount: number;
  workerRunCount: number;
  artifactCount: number;
};

function isRunningMission(mission: Mission): boolean {
  return runningMissionStatuses.has(mission.status);
}

function isOpenBug(bug: BugReport): boolean {
  return openBugStatuses.has(bug.status);
}

function recentByCreatedAt<T extends { id: string; created_at?: string | undefined }>(items: T[], limit = 5): T[] {
  return [...items].sort(compareCreatedAtDesc).slice(0, limit);
}

function compareCreatedAtDesc(left: { id: string; created_at?: string | undefined }, right: { id: string; created_at?: string | undefined }): number {
  const byCreatedAt = (right.created_at ?? "").localeCompare(left.created_at ?? "");
  return byCreatedAt === 0 ? right.id.localeCompare(left.id) : byCreatedAt;
}

function buildDashboardRecommendedNextActions(metrics: DashboardMetrics): string[] {
  const actions = [];
  if (metrics.pendingApprovalCount > 0) {
    actions.push("Review pending approvals before continuing gated work.");
  }
  if (metrics.p0p1BugCount > 0) {
    actions.push("Triage P0/P1 bugs and schedule fixes before release review.");
  }
  if (metrics.failedMissionCount > 0 || metrics.qaFailedCount > 0) {
    actions.push("Inspect failed missions or QA runs and collect evidence.");
  }
  if (metrics.readyForReviewMissionCount > 0) {
    actions.push("Open ready-for-review missions and prepare PR review notes.");
  }
  return actions.length === 0 ? ["No urgent action detected; continue with the next planned mission."] : actions;
}

function buildDashboardHealthSignals(metrics: DashboardMetrics) {
  return [
    {
      key: "mission_failures",
      status: metrics.failedMissionCount > 0 ? "warning" : "ok",
      count: metrics.failedMissionCount,
      message: metrics.failedMissionCount > 0 ? "Some missions are failed." : "No failed missions.",
    },
    {
      key: "qa_failures",
      status: metrics.qaFailedCount > 0 ? "warning" : "ok",
      count: metrics.qaFailedCount,
      message: metrics.qaFailedCount > 0 ? "Some QA runs failed." : "No failed QA runs.",
    },
    {
      key: "pending_approvals",
      status: metrics.pendingApprovalCount > 0 ? "attention" : "ok",
      count: metrics.pendingApprovalCount,
      message: metrics.pendingApprovalCount > 0 ? "Approvals are waiting for a decision." : "No pending approvals.",
    },
  ];
}

function findArtifactByType(artifacts: Artifact[], type: Artifact["type"]): Artifact | null {
  return artifacts.find((artifact) => artifact.type === type) ?? null;
}

type ReadinessKey = "codex" | "qaPlaywright" | "qaAiExploratory" | "fix" | "github" | "coolify" | "uptimeKuma" | "plane";

type ReadinessEntry = {
  key: ReadinessKey;
  label: string;
  action: GatedRealActionKind;
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  safeToRun: boolean;
  canQueue: boolean;
  canExecute: boolean;
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;
  realNetworkCall: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
  missingEnv: string[];
  requiredApprovalTypes: string[];
  approvedApprovalTypes: string[];
  missingApprovalTypes: string[];
  message: string;
};

type RealModeReadiness = Record<ReadinessKey, ReadinessEntry>;

type IntegrationStatusLike = ReturnType<typeof listIntegrationStatuses>[number];

type ReadinessBuildInput = {
  integrationStatuses: IntegrationStatusLike[];
  actionExecutionMode: ActionExecutionMode;
  workerRuntimeConfigured: boolean;
  env: Record<string, string | undefined>;
  approvals: Approval[];
};

const readinessDefinitions: Record<ReadinessKey, {
  action: GatedRealActionKind;
  integrationName?: ExternalIntegrationName;
  requiredApprovalTypes: string[];
}> = {
  codex: { action: "codex-real", requiredApprovalTypes: ["SECURITY_RISK"] },
  qaPlaywright: { action: "qa-playwright", requiredApprovalTypes: [] },
  qaAiExploratory: { action: "qa-ai-exploratory", requiredApprovalTypes: ["EXTERNAL_COST_RISK"] },
  fix: { action: "fix-real", requiredApprovalTypes: ["SECURITY_RISK"] },
  github: { action: "github-pr", integrationName: "github", requiredApprovalTypes: ["EXTERNAL_COST_RISK"] },
  coolify: { action: "deploy-staging", integrationName: "coolify", requiredApprovalTypes: ["PRODUCTION_DEPLOY"] },
  uptimeKuma: { action: "monitor-sync", integrationName: "uptime_kuma", requiredApprovalTypes: [] },
  plane: { action: "plane-sync", integrationName: "plane", requiredApprovalTypes: [] },
};

function buildActionApprovalCoverage(action: GatedRealActionKind, approvals: Approval[]) {
  return buildApprovalCoverage(requiredApprovalTypesForAction(action), approvals);
}

function approvedApprovalRecordIdsForAction(action: GatedRealActionKind, approvals: Approval[]): string[] {
  const required = new Set(requiredApprovalTypesForAction(action));
  return approvals
    .filter((approval) => approval.status === "approved" && required.has(approval.type))
    .map((approval) => approval.id);
}

function approvalGrantIdsForAction(action: GatedRealActionKind): string[] {
  switch (action) {
    case "codex-real":
    case "fix-real":
      return ["real_codex_execution"];
    case "qa-ai-exploratory":
      return ["external_cost_risk"];
    case "deploy-staging":
      return ["production_deploy"];
    case "github-pr":
      return ["external_cost_risk"];
    case "qa-playwright":
    case "monitor-sync":
    case "plane-sync":
      return [];
  }
}

function requiredApprovalTypesForAction(action: GatedRealActionKind): string[] {
  return Object.values(readinessDefinitions).find((definition) => definition.action === action)?.requiredApprovalTypes ?? [];
}

function buildApprovalCoverage(requiredApprovalTypes: string[], approvals: Approval[]) {
  const approvedTypes = new Set<string>(approvals
    .filter((approval) => approval.status === "approved")
    .map((approval) => approval.type));
  return {
    requiredApprovalTypes,
    approvedApprovalTypes: requiredApprovalTypes.filter((type) => approvedTypes.has(type)),
    missingApprovalTypes: requiredApprovalTypes.filter((type) => !approvedTypes.has(type)),
  };
}

function knownStaticExecutionBlockers(key: ReadinessKey, action: GatedRealActionKind): ReadinessBlocker[] {
  switch (action) {
    case "codex-real":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.codex.injected_runner_missing",
        message: "Default Worker Runner has no injected Codex runner configured for codex.real.",
        recommendedNextAction: "Inject an approved local Codex runner for codex.real, or expect manual-action Worker Runner output.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
    case "fix-real":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.fix.injected_runner_missing",
        message: "Default Worker Runner has no injected Codex runner configured for fix.real.",
        recommendedNextAction: "Inject approved local fix and verification runners, or expect manual-action Worker Runner output.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
    case "github-pr":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.github.injected_transport_missing",
        message: "No injected GitHub transport is configured and operation gates are disabled; no push or PR creation will occur.",
        recommendedNextAction: "Review the GitHub PR preview/manual-action output; do not expect push or PR creation until an approved injected transport and operation gates are configured.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static", realPush: false },
      })];
    case "qa-playwright":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.qa.selector_verification_required",
        message: "Playwright QA selectors and target runtime require verification before real browser execution.",
        recommendedNextAction: "Verify the target URL, deterministic selectors, and approved Playwright runner before treating execution as ready.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
    case "qa-ai-exploratory":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.qa_ai.executor_missing",
        message: "No approved AI exploratory QA executor is configured.",
        recommendedNextAction: "Keep AI exploratory QA as manual-action until an approved executor path is configured in a later task.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
    case "deploy-staging":
    case "monitor-sync":
    case "plane-sync":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.integration.injected_transport_missing." + action,
        message: "No injected integration transport is configured for " + action + "; no external provider call will occur.",
        recommendedNextAction: "Review the manual-action output and configure an approved injected transport only in a later approved task.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
  }
}

function buildRealModeReadiness(input: ReadinessBuildInput): RealModeReadiness {
  return Object.fromEntries(Object.entries(readinessDefinitions).map(([rawKey, definition]) => {
    const key = rawKey as ReadinessKey;
    const contract = gatedRealActionContracts[definition.action];
    const integration = definition.integrationName
      ? input.integrationStatuses.find((status) => status.name === definition.integrationName || status.externalName === definition.integrationName)
      : undefined;
    const missingEnv = integration?.missingEnv ?? [];
    const configured = integration ? integration.configured : true;
    const enabled = input.env[contract.gateEnv] === "true";
    const queueReady = input.actionExecutionMode === "queued";
    const ready = enabled && configured && queueReady && input.workerRuntimeConfigured;
    const approvalCoverage = buildApprovalCoverage(definition.requiredApprovalTypes, input.approvals);
    const safeToRun = ready && approvalCoverage.missingApprovalTypes.length === 0;
    const blockers: ReadinessBlocker[] = [];

    if (!queueReady) {
      blockers.push(buildReadinessBlocker({
        category: "queue_acceptance",
        key: "queue_acceptance.action_execution_mode",
        message: contract.label + " requires PSF_ACTION_EXECUTION_MODE=queued before queueing.",
        recommendedNextAction: "Set PSF_ACTION_EXECUTION_MODE=queued before queueing " + definition.action + ".",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, required: "queued", actual: input.actionExecutionMode },
      }));
    }

    if (!input.workerRuntimeConfigured) {
      blockers.push(buildReadinessBlocker({
        category: "queue_acceptance",
        key: "queue_acceptance.worker_runtime_missing",
        message: contract.label + " requires a configured Worker Runtime before queueing.",
        recommendedNextAction: "Configure PSF_WORKER_RUNTIME for queued execution before queueing " + definition.action + ".",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action },
      }));
    }

    if (!enabled) {
      blockers.push(buildReadinessBlocker({
        category: "queue_acceptance",
        key: "queue_acceptance.route_gate." + contract.gateEnv,
        message: contract.label + " requires " + contract.gateEnv + "=true before queueing.",
        recommendedNextAction: "Set " + contract.gateEnv + "=true only after approving the gated real-action route for " + definition.action + ".",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, gateEnv: contract.gateEnv },
      }));
    }

    for (const envName of missingEnv) {
      blockers.push(buildReadinessBlocker({
        category: "configuration",
        key: "configuration.env." + envName + ".missing",
        message: contract.label + " is missing required environment variable " + envName + ".",
        recommendedNextAction: "Set " + envName + " in the local environment before queueing " + definition.action + ".",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, envName },
      }));
    }

    for (const approvalType of approvalCoverage.missingApprovalTypes) {
      blockers.push(buildReadinessBlocker({
        category: "approval",
        key: "approval." + approvalType + ".missing",
        message: contract.label + " is missing approved Mission approval " + approvalType + ".",
        recommendedNextAction: "Approve Mission approval type " + approvalType + " before queueing " + definition.action + ".",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, approvalType },
      }));
    }

    blockers.push(...knownStaticExecutionBlockers(key, definition.action));

    const readinessState = deriveReadinessState(
      blockers,
      contract.label + " has no known blockers; review Worker Runner output before advancing the Mission.",
    );
    const message = safeToRun
      ? contract.label + " is ready to queue at the legacy route level; execution readiness is represented by canExecute and blockers."
      : contract.label + " blocked/manual-action: " + readinessState.blockers.map((blocker) => blocker.message).join("; ") + ".";
    return [key, {
      key,
      label: contract.label,
      action: definition.action,
      enabled,
      configured,
      ready,
      safeToRun,
      canQueue: readinessState.canQueue,
      canExecute: readinessState.canExecute,
      blockers: readinessState.blockers,
      recommendedNextAction: readinessState.recommendedNextAction,
      realNetworkCall: false as const,
      realExternalCall: false as const,
      realPush: false as const,
      realDeploy: false as const,
      missingEnv,
      requiredApprovalTypes: approvalCoverage.requiredApprovalTypes,
      approvedApprovalTypes: approvalCoverage.approvedApprovalTypes,
      missingApprovalTypes: approvalCoverage.missingApprovalTypes,
      message,
    } satisfies ReadinessEntry];
  })) as RealModeReadiness;
}

function buildPolicyFailures(readiness: RealModeReadiness): string[] {
  return Object.values(readiness)
    .filter((entry) => !entry.safeToRun)
    .flatMap((entry) => {
      const contract = gatedRealActionContracts[entry.action];
      const failures: string[] = [];
      if (entry.message.includes("PSF_ACTION_EXECUTION_MODE=queued")) {
        failures.push(entry.label + " requires PSF_ACTION_EXECUTION_MODE=queued.");
      }
      if (!entry.enabled) {
        failures.push(entry.label + " requires " + contract.gateEnv + "=true.");
      }
      if (entry.missingEnv.length > 0) {
        failures.push(entry.label + " missing env: " + entry.missingEnv.join(", ") + ".");
      }
      if (entry.blockers.some((blocker) => blocker.key === "queue_acceptance.worker_runtime_missing")) {
        failures.push(entry.label + " requires a configured Worker Runtime.");
      }
      if (entry.missingApprovalTypes.length > 0) {
        failures.push(entry.label + " missing approvals: " + entry.missingApprovalTypes.join(", ") + ".");
      }
      return failures;
    });
}

function buildExternalLinks(
  mission: Mission,
  workerRuns: WorkerRun[],
  artifacts: Artifact[],
  approvals: Approval[],
): Partial<Record<string, string>> {
  return compactUndefined({
    githubPrUrl: firstString([mission.pr_url, ...readResourceStrings(workerRuns, artifacts, approvals, ["githubPrUrl", "prUrl", "pullRequestUrl"])]),
    deploymentUrl: firstString(readResourceStrings(workerRuns, artifacts, approvals, ["deploymentUrl", "deployUrl", "stagingUrl"])),
    monitorUrl: firstString(readResourceStrings(workerRuns, artifacts, approvals, ["monitorUrl", "uptimeKumaUrl"])),
    planeIssueUrl: firstString(readResourceStrings(workerRuns, artifacts, approvals, ["planeIssueUrl", "planeUrl", "issueUrl"])),
  });
}

function buildExternalStatus(kind: "deployment" | "monitor" | "plane", workerRuns: WorkerRun[]) {
  const run = [...workerRuns].reverse().find((candidate) => workerRunMatchesExternalKind(candidate, kind));
  if (!run) {
    return null;
  }
  const source = mergeJsonObject(run.metadata, run.output);
  const urlKeys = kind === "deployment"
    ? ["deploymentUrl", "deployUrl", "stagingUrl"]
    : kind === "monitor"
      ? ["monitorUrl", "uptimeKumaUrl"]
      : ["planeIssueUrl", "planeUrl", "issueUrl"];
  const statusKeys = kind === "deployment"
    ? ["deploymentStatus", "deployStatus", "status"]
    : kind === "monitor"
      ? ["monitorStatus", "uptimeKumaStatus", "status"]
      : ["planeStatus", "issueStatus", "status"];
  return compactUndefined({
    status: firstString(statusKeys.map((key) => source[key])) ?? run.status,
    workerRunId: run.id,
    url: firstString(urlKeys.map((key) => source[key])),
    mode: run.mode,
    realNetworkCall: false,
  });
}

function workerRunMatchesExternalKind(workerRun: WorkerRun, kind: "deployment" | "monitor" | "plane"): boolean {
  const source = mergeJsonObject(workerRun.metadata, workerRun.output);
  const jobType = firstString([source.jobType, source.type]);
  if (kind === "deployment") {
    return workerRun.worker_type === "deploy" || jobType === "deploy.coolify" || hasAnyKey(source, ["deploymentUrl", "deployUrl", "deploymentStatus"]);
  }
  if (kind === "monitor") {
    return workerRun.worker_type === "monitor" || jobType === "monitor.uptime_kuma" || hasAnyKey(source, ["monitorUrl", "uptimeKumaUrl", "monitorStatus"]);
  }
  return jobType === "plane.sync" || hasAnyKey(source, ["planeIssueUrl", "planeUrl", "planeStatus"]);
}

function buildArtifactRetention(artifacts: Artifact[]) {
  return artifacts.flatMap((artifact) => {
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
    if (metadata.retentionClass === undefined && metadata.path === undefined && metadata.missing === undefined) {
      return [];
    }
    return [compactUndefined({
      artifactId: artifact.id,
      type: artifact.type,
      path: artifact.path,
      retentionClass: typeof metadata.retentionClass === "string" ? metadata.retentionClass : undefined,
      retentionPath: typeof metadata.path === "string" ? metadata.path : undefined,
      missing: typeof metadata.missing === "boolean" ? metadata.missing : undefined,
    })];
  });
}

function readResourceStrings(
  workerRuns: WorkerRun[],
  artifacts: Artifact[],
  approvals: Approval[],
  keys: string[],
): unknown[] {
  return [
    ...workerRuns.flatMap((run) => readStringsFromRecords([run.output, run.metadata, run.input], keys)),
    ...artifacts.flatMap((artifact) => readStringsFromRecords([artifact.metadata], keys)),
    ...approvals.flatMap((approval) => readStringsFromRecords([approval.payload], keys)),
  ];
}

function readStringsFromRecords(records: unknown[], keys: string[]): unknown[] {
  return records.flatMap((record) => {
    if (!isRecord(record)) return [];
    return keys.map((key) => record[key]);
  });
}

function firstString(values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim() !== "");
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => typeof record[key] === "string");
}

function compactUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as Partial<T>;
}

function buildMissionRecommendedNextAction(
  mission: Mission,
  bugs: BugReport[],
  approvals: Approval[],
  qaRuns: QAReport[],
  workerRuns: WorkerRun[],
): string {
  if (approvals.some((approval) => approval.status === "pending")) {
    return "Review pending approval requests for this mission.";
  }
  if (bugs.some(isOpenBug)) {
    return "Fix or triage open QA bugs before advancing the mission.";
  }
  if (qaRuns.some((qaRun) => qaRun.status === "failed" || (qaRun.failed ?? 0) > 0)) {
    return "Review failed QA evidence and decide whether a fix mission is needed.";
  }
  if (workerRuns.some((workerRun) => workerRun.status === "failed")) {
    return "Inspect failed worker run logs and retry after addressing the error.";
  }
  if (mission.status === MissionStatus.ready_for_review) {
    return "Prepare human review and PR handoff for this mission.";
  }
  return "Continue the mission according to its current status.";
}

function compactArtifact(artifact: Artifact) {
  return {
    id: artifact.id,
    mission_id: artifact.mission_id,
    type: artifact.type,
    path: artifact.path,
    ...(artifact.worker_run_id === undefined ? {} : { worker_run_id: artifact.worker_run_id }),
    ...(artifact.mime_type === undefined ? {} : { mime_type: artifact.mime_type }),
    size: artifact.size,
    metadata: artifact.metadata,
    created_at: artifact.created_at,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mission";
}
