import path from "node:path";
import {
  runAiNovelistDemo,
  runCodexDryRun,
  runFixDryRun,
  runLoopDryRun,
  runMissionPlan,
  runQaDryRun,
} from "@psf/demo-workflow";
import {
  runCoolifyReal,
  runGitHubReal,
  runIntegrationDryRun,
  runPlaneReal,
  runUptimeKumaReal,
  type AnyIntegrationDryRunResult,
  type CoolifyDryRunInput,
  type ExternalIntegrationName,
  type GitHubDryRunInput,
  type GitHubRealInput,
  type GitHubRealResult,
  type GitHubRealGates,
  type IntegrationEnv,
  type IntegrationTransport,
  type CoolifyRealInput,
  type CoolifyRealResult,
  type PlaneRealInput,
  type PlaneRealResult,
  type UptimeKumaRealInput,
  type UptimeKumaRealResult,
  type PlaneDryRunInput,
  type UptimeKumaDryRunInput,
} from "@psf/integrations";
import type { CodexExecutionResult, CodexExecutionStatus, CodexRunner } from "@psf/codex-worker";
import {
  codexManualActionBlocker,
  deriveWorkerReadiness,
  githubResultBlockers,
  type WorkerReadinessBlocker,
} from "./readiness-blockers.js";
import {
  AiExploratoryQaRunner,
  runDeterministicPlaywrightQa,
  type AiExploratoryQaExecutor,
  type AiExploratoryQaResult,
  type DeterministicQaInput,
  type DeterministicQaResult,
} from "@psf/qa-worker";
import {
  runGatedRealAutoFixLoop,
  type GatedRealAutoFixLoopInput,
  type GatedRealAutoFixLoopResult,
  type GatedRealCodexRunner,
  type GatedRealTestRunner,
} from "@psf/auto-fix-loop";
import type { Artifact, BugReport, MissionEvent, MissionStatusValue, ProjectPassport, QAReport, WorkerRun } from "@psf/mission-schema";
import type { QueueWorkerJob } from "@psf/worker-runtime";

export interface WorkerJobHandlerResult {
  childWorkerRunIds: string[];
  childQARunIds: string[];
  childArtifactIds: string[];
  childBugReportIds: string[];
  summary: string;
  recommendedNextAction: string;
  status?: string;
  manualActionRequired?: boolean;
  reason?: string;
  canQueue?: boolean;
  canExecute?: boolean;
  blockers?: WorkerReadinessBlocker[];
  childWorkerRuns?: WorkerRun[];
  childQARuns?: QAReport[];
  childArtifacts?: Artifact[];
  childBugReports?: BugReport[];
  childEvents?: MissionEvent[];
}

export interface WorkerJobHandlerDependencies {
  codexRunner?: CodexRunner;
  deterministicQaExecute?: DeterministicQaInput["execute"];
  deterministicQaRunner?: (input: DeterministicQaInput) => Promise<DeterministicQaResult>;
  aiExploratoryQaExecute?: AiExploratoryQaExecutor;
  autoFixCodexRunner?: GatedRealCodexRunner;
  autoFixTestRunner?: GatedRealTestRunner;
  githubTransport?: IntegrationTransport;
  githubEnv?: IntegrationEnv;
}

export type WorkerJobHandler = (job: QueueWorkerJob) => Promise<WorkerJobHandlerResult>;

type IntegrationRealHandlerResult = GitHubRealResult | CoolifyRealResult | UptimeKumaRealResult | PlaneRealResult;
type MissionFileName = "mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md";

export function createDefaultJobHandler(cwd = process.cwd(), deps: WorkerJobHandlerDependencies = {}): WorkerJobHandler {
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
      case "codex.real":
        return toCodexRealHandlerResult(await runCodexRealJob(cwd, job, deps));
      case "qa.playwright": {
        const deterministicQaInput = buildDeterministicQaInput(job, deps);
        if (!hasQueuedQaProjectContext(job.payload)) {
          return toDeterministicQaHandlerResult(await runDeterministicPlaywrightQa(withFallbackQaProjectContext(deterministicQaInput)));
        }
        const deterministicQaRunner = deps.deterministicQaRunner ?? runDeterministicPlaywrightQa;
        return toDeterministicQaHandlerResult(await deterministicQaRunner(deterministicQaInput));
      }
      case "qa.ai_exploratory":
        return toAiExploratoryQaHandlerResult(await AiExploratoryQaRunner.real({
          env: buildAiExploratoryEnv(job),
          ...(deps.aiExploratoryQaExecute ? { execute: deps.aiExploratoryQaExecute } : {}),
        }).run(buildAiExploratoryQaInput(job)));
      case "fix.real":
        return toAutoFixHandlerResult(await runGatedRealAutoFixLoop(buildAutoFixInput(cwd, job, deps)));
      case "github.pr":
        return toGitHubPrHandlerResult(await runGitHubReal(buildGitHubRealInput(job, deps)), job);
      case "deploy.coolify":
        return toIntegrationRealHandlerResult(await runCoolifyReal(buildCoolifyRealInput(job)));
      case "monitor.uptime_kuma":
        return toIntegrationRealHandlerResult(await runUptimeKumaReal(buildUptimeKumaRealInput(job)));
      case "plane.sync":
        return toIntegrationRealHandlerResult(await runPlaneReal(buildPlaneRealInput(job)));
    }
  };
}

async function runCodexRealJob(cwd: string, job: QueueWorkerJob, deps: WorkerJobHandlerDependencies): Promise<CodexExecutionResult> {
  const preflightFailure = validateCodexRealQueuedJob(job);
  if (preflightFailure) {
    return buildCodexManualActionResult(job, preflightFailure.reason);
  }
  if (!deps.codexRunner) {
    return buildCodexManualActionResult(job, "Worker Runner codex.real requires an injected Codex runner; real execution is not enabled in this phase.");
  }
  return deps.codexRunner.run(buildCodexRealInput(cwd, job));
}

function validateCodexRealQueuedJob(job: QueueWorkerJob): { reason: string } | undefined {
  const repoUrl = stringValue(job.payload.repoUrl);
  if (!repoUrl || !isLocalRepoUrl(repoUrl)) {
    return { reason: "codex.real queued job requires local repoUrl as a local path or file:// URL; remote repository URLs are blocked at Worker Runner." };
  }

  const branchName = stringValue(job.payload.branchName) ?? `agent/${job.missionId}`;
  if (!isSafeCodexBranchName(branchName)) {
    return { reason: "codex.real branchName must be under agent/ and cannot be main or master." };
  }

  return undefined;
}

function buildCodexManualActionResult(job: QueueWorkerJob, reason: string): CodexExecutionResult {
  const timestamp = job.createdAt;
  const workerRunId = `worker-run-${job.missionId}-codex-worker-runner-manual-action`;
  const workerRun: WorkerRun = {
    id: workerRunId,
    mission_id: job.missionId,
    worker_type: "codex",
    status: "skipped",
    mode: "real",
    input: {
      missionId: job.missionId,
      projectId: job.projectId,
      mode: "real",
      branchName: stringValue(job.payload.branchName) ?? `agent/${job.missionId}`,
    },
    output: {
      executed: false,
      status: "manual_action",
      reason,
    },
    logs: [reason],
    metadata: {
      realNetworkCall: false,
      pushed: false,
      workerRunnerPreflight: true,
    },
    error: reason,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return {
    status: "manual_action",
    executed: false,
    reason,
    workerRun,
    artifacts: [],
    events: [buildCodexResultEvent(job, "manual_action", reason, workerRunId, timestamp)],
    stdout: "",
    stderr: "",
  };
}

function buildCodexResultEvent(
  job: QueueWorkerJob,
  status: CodexExecutionStatus,
  reason: string,
  workerRunId: string,
  timestamp: string,
): MissionEvent {
  return {
    id: `event-${job.workerRunId}-codex-real-${status}-${job.id}`,
    mission_id: job.missionId,
    type: `codex.real.${status}`,
    message: reason,
    payload: {
      workerRunId,
      jobId: job.id,
      jobType: job.type,
      realNetworkCall: false,
      pushed: false,
    },
    created_at: timestamp,
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

function toCodexRealHandlerResult(result: CodexExecutionResult): WorkerJobHandlerResult {
  const recommendedNextAction = codexRecommendedNextAction(result);
  const readiness = result.status === "blocked" || result.status === "manual_action"
    ? deriveWorkerReadiness([codexManualActionBlocker(result.reason)], recommendedNextAction)
    : deriveWorkerReadiness([], recommendedNextAction);
  return {
    childWorkerRunIds: [result.workerRun.id],
    childQARunIds: [],
    childArtifactIds: result.artifacts.map((artifact) => artifact.id),
    childBugReportIds: [],
    summary: result.reason,
    recommendedNextAction,
    status: result.status,
    reason: result.reason,
    canQueue: readiness.canQueue,
    canExecute: readiness.canExecute,
    blockers: readiness.blockers,
    ...(result.status === "blocked" || result.status === "manual_action" ? { manualActionRequired: true } : {}),
    childWorkerRuns: [result.workerRun],
    childArtifacts: result.artifacts,
    childEvents: result.events,
  };
}

function toDeterministicQaHandlerResult(result: DeterministicQaResult): WorkerJobHandlerResult {
  return {
    childWorkerRunIds: [result.workerRun.id],
    childQARunIds: [result.qaRun.id],
    childArtifactIds: result.artifacts.map((artifact) => artifact.id),
    childBugReportIds: result.bugs.map((bug) => bug.id),
    summary: result.summary.logs[0] ?? result.qaRun.summary,
    recommendedNextAction: result.manualActionRequired
      ? "Configure a target URL and an approved Playwright runner before retrying deterministic QA."
      : result.status === "failed"
        ? "Inspect QA bugs and enqueue a fix job after reviewing evidence."
        : "Review deterministic QA artifacts and continue the Mission.",
    status: result.status,
    manualActionRequired: result.manualActionRequired,
    reason: result.summary.logs[0] ?? result.qaRun.summary,
    childWorkerRuns: [result.workerRun],
    childQARuns: [result.qaRun],
    childArtifacts: result.artifacts,
    childBugReports: result.bugs,
    childEvents: result.events,
  };
}

function toAiExploratoryQaHandlerResult(result: AiExploratoryQaResult): WorkerJobHandlerResult {
  return {
    childWorkerRunIds: [result.workerRun.id],
    childQARunIds: [result.qaRun.id],
    childArtifactIds: result.artifacts.map((artifact) => artifact.id),
    childBugReportIds: result.bugs.map((bug) => bug.id),
    summary: result.summary.logs[0] ?? result.qaRun.summary,
    recommendedNextAction: result.manualActionRequired
      ? "Review AI exploratory QA manual-action artifacts; MCP/browser execution remains gated."
      : result.status === "failed"
        ? "Review AI exploratory findings and convert reproducible bugs into deterministic regressions."
        : "Review AI exploratory QA artifacts and continue the Mission.",
    status: result.status,
    manualActionRequired: result.manualActionRequired,
    reason: result.summary.logs[0] ?? result.qaRun.summary,
    childWorkerRuns: [result.workerRun],
    childQARuns: [result.qaRun],
    childArtifacts: result.artifacts,
    childBugReports: result.bugs,
    childEvents: result.events,
  };
}

function toAutoFixHandlerResult(result: GatedRealAutoFixLoopResult): WorkerJobHandlerResult {
  return {
    childWorkerRunIds: result.workerRuns.map((workerRun) => workerRun.id),
    childQARunIds: [],
    childArtifactIds: result.artifacts.map((artifact) => artifact.id),
    childBugReportIds: result.bugReports.map((bug) => bug.id),
    summary: result.recommendedNextAction,
    recommendedNextAction: result.recommendedNextAction,
    status: result.decision,
    manualActionRequired: result.decision === "manual_action" || result.decision === "needs_human" || result.decision === "paused" || result.decision === "blocked",
    reason: result.errors[0] ?? result.recommendedNextAction,
    childWorkerRuns: result.workerRuns,
    childArtifacts: result.artifacts,
    childBugReports: result.bugReports,
    childEvents: result.events,
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

function toIntegrationRealHandlerResult(result: IntegrationRealHandlerResult): WorkerJobHandlerResult {
  return {
    childWorkerRunIds: [],
    childQARunIds: [],
    childArtifactIds: [],
    childBugReportIds: [],
    summary: result.message,
    recommendedNextAction: result.safeToRun
      ? "Review real integration result before advancing the Mission."
      : "Complete the listed manual actions before enabling this real integration.",
  };
}

function toGitHubPrHandlerResult(result: GitHubRealResult, job: QueueWorkerJob): WorkerJobHandlerResult {
  const workerRun = createGitHubPrWorkerRun(job, result);
  const artifact = createGitHubPrPreviewArtifact(job, result);
  const event = createGitHubPrEvent(job, result, workerRun.id, artifact.id);
  const readiness = deriveWorkerReadiness(githubResultBlockers(result), result.safeToRun
    ? "Review GitHub PR result and PR URL before advancing the Mission."
    : "Review PR preview and complete missing GitHub approval, env, route, operation, or transport gates.");
  return {
    childWorkerRunIds: [workerRun.id],
    childQARunIds: [],
    childArtifactIds: [artifact.id],
    childBugReportIds: [],
    summary: result.message,
    recommendedNextAction: result.safeToRun
      ? "Review GitHub PR result and PR URL before advancing the Mission."
      : "Review PR preview and complete missing GitHub approval, env, route, operation, or transport gates.",
    status: result.decision,
    manualActionRequired: result.decision !== "succeeded",
    reason: result.message,
    canQueue: readiness.canQueue,
    canExecute: readiness.canExecute,
    blockers: readiness.blockers,
    childWorkerRuns: [workerRun],
    childArtifacts: [artifact],
    childEvents: [event],
  };
}

function createGitHubPrWorkerRun(job: QueueWorkerJob, result: GitHubRealResult): WorkerRun {
  return {
    id: `worker-run-${job.missionId}-github-pr`,
    mission_id: job.missionId,
    worker_type: "integration",
    status: result.decision === "succeeded" ? "succeeded" : result.decision === "failed" || result.decision === "degraded" ? "failed" : "skipped",
    mode: "real",
    input: {
      missionId: job.missionId,
      projectId: job.projectId,
      jobId: job.id,
      jobType: job.type,
      branchName: result.outputs.branchName,
      baseBranch: result.outputs.baseBranch,
      operationGates: safeRecord(job.payload.operationGates) ?? {},
    },
    output: {
      decision: result.decision,
      message: result.message,
      status: result.decision,
      githubPrUrl: result.outputs.pullRequestUrl,
      pullRequestUrl: result.outputs.pullRequestUrl,
      pullRequestNumber: result.outputs.pullRequestNumber,
      qaCommentUrl: result.outputs.qaCommentUrl,
      branchName: result.outputs.branchName,
      baseBranch: result.outputs.baseBranch,
      realNetworkCall: result.realNetworkCall,
      safeToRun: result.safeToRun,
      configured: result.configured,
      missingEnv: result.missingEnv,
      requests: result.outputs.requests,
      manualActions: result.outputs.manualActions,
      pushed: false,
      realExternalCall: result.realNetworkCall,
    },
    logs: [result.message, ...result.logs],
    metadata: {
      generatedBy: "worker-runner",
      provider: "github",
      jobId: job.id,
      jobType: job.type,
      realNetworkCall: result.realNetworkCall,
      pushed: false,
    },
    error: result.errors.join("\n") || undefined,
    created_at: job.createdAt,
    updated_at: job.createdAt,
    ...(result.decision === "succeeded" || result.decision === "failed" || result.decision === "degraded" ? { finished_at: job.createdAt } : {}),
  };
}

function createGitHubPrPreviewArtifact(job: QueueWorkerJob, result: GitHubRealResult): Artifact {
  const preview = safeRecord(job.payload.prPreview);
  const title = stringValue(preview?.title) ?? `GitHub PR preview for ${job.missionId}`;
  const body = stringValue(preview?.body) ?? result.message;
  const content = [
    "# GitHub PR Preview",
    "",
    `- Title: ${title}`,
    `- Branch: ${result.outputs.branchName}`,
    `- Base: ${result.outputs.baseBranch}`,
    `- Decision: ${result.decision}`,
    `- Real network call: ${result.realNetworkCall}`,
    `- Pushed: false`,
    "",
    body,
  ].join("\n");
  return {
    id: `artifact-${job.missionId}-github-pr-preview`,
    mission_id: job.missionId,
    worker_run_id: `worker-run-${job.missionId}-github-pr`,
    type: "technical_notes",
    path: `missions/${job.missionId}/github-pr-preview.md`,
    content,
    mime_type: "text/markdown",
    size: Buffer.byteLength(content, "utf8"),
    metadata: { generatedBy: "worker-runner", provider: "github", realNetworkCall: result.realNetworkCall, pushed: false },
    created_at: job.createdAt,
  };
}

function createGitHubPrEvent(job: QueueWorkerJob, result: GitHubRealResult, workerRunId: string, artifactId: string): MissionEvent {
  return {
    id: `event-${job.missionId}-github-pr-${result.decision}-${job.id}`,
    mission_id: job.missionId,
    type: `github.pr.${result.decision}`,
    message: result.message,
    payload: {
      workerRunId,
      artifactId,
      jobId: job.id,
      jobType: job.type,
      decision: result.decision,
      githubPrUrl: result.outputs.pullRequestUrl,
      realNetworkCall: result.realNetworkCall,
      pushed: false,
    },
    created_at: job.createdAt,
  };
}

function codexRecommendedNextAction(result: CodexExecutionResult): string {
  switch (result.status) {
    case "succeeded":
      return "Review Codex real runner artifacts; remote push remains disabled."
    case "failed":
      return "Inspect Codex worker stderr and artifacts before retrying."
    case "manual_action":
    case "blocked":
      return "Resolve Codex real-mode gates or run the manual action outside Worker Runner."
  }
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

function buildCodexRealInput(cwd: string, job: QueueWorkerJob) {
  const payload = job.payload;
  const passport = buildProjectPassport(job);
  return {
    missionId: job.missionId,
    projectId: job.projectId,
    repoUrl: stringValue(payload.repoUrl) as string,
    defaultBranch: stringValue(payload.defaultBranch) ?? passport.repo.default_branch,
    missionFiles: buildMissionFiles(job),
    ...(safeRecord(payload.passport) ? { passport: safeRecord(payload.passport) as ProjectPassport } : {}),
    ...(stringValue(payload.projectAgents) ? { projectAgents: stringValue(payload.projectAgents) } : {}),
    approvalIds: stringArray(payload.approvalIds),
    approvalRecordIds: stringArray(payload.approvalRecordIds),
    commands: stringArray(payload.commands),
    branchName: stringValue(payload.branchName) ?? `agent/${job.missionId}`,
    workspaceRoot: stringValue(payload.workspaceRoot) ?? path.join(cwd, "workspaces", job.projectId),
    timeoutMs: job.timeoutMs,
    mode: "real" as const,
  };
}

function buildDeterministicQaInput(job: QueueWorkerJob, deps: WorkerJobHandlerDependencies): DeterministicQaInput {
  const targetUrl = stringValue(job.payload.targetUrl) ?? stringValue(job.payload.stagingUrl);
  const passport = safeRecord(job.payload.passport);
  const missionFiles = stringRecord(job.payload.missionFiles);
  const qaCharter = stringValue(job.payload.qaCharter);
  const e2eCommandMetadata = safeRecord(job.payload.e2eCommandMetadata);
  return {
    missionId: job.missionId,
    projectId: job.projectId,
    ...(targetUrl ? { targetUrl } : {}),
    ...(passport ? { passport: passport as ProjectPassport } : {}),
    ...(qaCharter ? { qaCharter } : {}),
    ...(missionFiles ? { missionFiles } : {}),
    ...(e2eCommandMetadata ? { e2eCommandMetadata } : {}),
    env: buildPlaywrightEnv(job),
    ...(deps.deterministicQaExecute ? { execute: deps.deterministicQaExecute } : {}),
  };
}

function hasQueuedQaProjectContext(payload: Record<string, unknown>): boolean {
  return safeRecord(payload.passport) !== undefined
    || stringValue(payload.qaCharter) !== undefined
    || stringRecord(payload.missionFiles) !== undefined;
}

function withFallbackQaProjectContext(input: DeterministicQaInput): DeterministicQaInput {
  return {
    ...input,
    missionFiles: input.missionFiles ?? {
      "mission.md": `# ${input.missionId}\n\nQueue QA job did not include project mission context.`,
      "acceptance.md": "# Acceptance\n\n- Manual selector verification is required before deterministic QA can pass.",
      "technical-notes.md": "# Technical Notes\n\n- Orchestrator must enqueue qa.playwright with passport, qaCharter, and missionFiles.",
      "risk-notes.md": "# Risk Notes\n\n- Do not mark QA passed without project QA context and verified selectors.",
    },
  };
}

function buildAiExploratoryQaInput(job: QueueWorkerJob) {
  const targetUrl = stringValue(job.payload.targetUrl) ?? stringValue(job.payload.stagingUrl);
  const missionFiles = buildMissionFiles(job);
  return {
    missionId: job.missionId,
    projectId: job.projectId,
    passport: buildProjectPassport(job),
    qaCharter: stringValue(job.payload.qaCharter) ?? "Manual exploratory QA remains gated until explicitly approved.",
    missionFiles: {
      "mission.md": missionFiles["mission.md"],
      "acceptance.md": missionFiles["acceptance.md"],
    },
    ...(targetUrl ? { targetUrl } : {}),
    mode: "real" as const,
  };
}

function buildAutoFixInput(cwd: string, job: QueueWorkerJob, deps: WorkerJobHandlerDependencies = {}): GatedRealAutoFixLoopInput {
  const payload = job.payload;
  const passport = buildProjectPassport(job);
  const currentAttempt = numberValue(payload.currentAttempt);
  const maxAttempts = numberValue(payload.maxAttempts);
  const perBugAttempts = safeRecord(payload.perBugAttempts) as Record<string, number> | undefined;
  const maxBugAttempts = numberValue(payload.maxBugAttempts);
  const verificationCommands = buildVerificationCommands(payload);
  const regressionEvidence = safeRecord(payload.regressionEvidence);
  return {
    missionId: job.missionId,
    projectId: job.projectId,
    missionStatus: (stringValue(payload.missionStatus) ?? "bugs_found") as MissionStatusValue,
    branchName: stringValue(payload.branchName) ?? `agent/${job.missionId}`,
    currentBranch: stringValue(payload.currentBranch) ?? `agent/${job.missionId}`,
    passport,
    projectAgents: stringValue(payload.projectAgents) ?? "Follow project AGENTS instructions and stop for manual approval on risky actions.",
    missionFiles: buildMissionFiles(job),
    bugs: Array.isArray(payload.bugs) ? payload.bugs.filter(isRecord) as BugReport[] : [],
    ...(currentAttempt === undefined ? {} : { currentAttempt }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(perBugAttempts === undefined ? {} : { perBugAttempts }),
    ...(maxBugAttempts === undefined ? {} : { maxBugAttempts }),
    enableRealMode: payload.enableRealMode === true && process.env.ENABLE_REAL_CODEX === "1",
    approvalIds: stringArray(payload.approvalIds),
    workspaceRoot: stringValue(payload.workspaceRoot) ?? path.join(cwd, "workspaces", job.projectId),
    timeoutMs: job.timeoutMs,
    ...(verificationCommands === undefined ? {} : { verificationCommands }),
    ...(regressionEvidence === undefined ? {} : { regressionEvidence }),
    ...(deps.autoFixCodexRunner ? { codexRunner: deps.autoFixCodexRunner } : {}),
    ...(deps.autoFixTestRunner ? { testRunner: deps.autoFixTestRunner } : {}),
  };
}

function buildGitHubRealInput(job: QueueWorkerJob, deps: WorkerJobHandlerDependencies = {}): GitHubRealInput {
  const mission = safeRecord(job.payload.mission);
  const baseBranch = stringValue(job.payload.baseBranch);
  const sourceSha = stringValue(job.payload.sourceSha);
  const qaComment = stringValue(job.payload.qaComment);
  return {
    env: deps.githubEnv ?? {},
    now: job.createdAt,
    ...(mission === undefined ? {} : { mission }),
    ...(baseBranch === undefined ? {} : { baseBranch }),
    ...(sourceSha === undefined ? {} : { sourceSha }),
    ...(qaComment === undefined ? {} : { qaComment }),
    ...(deps.githubTransport ? { transport: deps.githubTransport } : {}),
    gates: buildGitHubGates(job.payload),
  };
}

function buildGitHubGates(payload: Record<string, unknown>): GitHubRealGates {
  const gates = safeRecord(payload.operationGates);
  return {
    allowNetwork: gates?.allowNetwork === true,
    allowPushBranch: gates?.allowPushBranch === true,
    allowCreatePullRequest: gates?.allowCreatePullRequest === true,
    allowUpdatePullRequestBody: gates?.allowUpdatePullRequestBody === true,
    allowPostQaComment: gates?.allowPostQaComment === true,
  };
}

function buildCoolifyRealInput(job: QueueWorkerJob): CoolifyRealInput {
  const deployment = safeRecord(job.payload.deployment);
  return {
    env: {},
    now: job.createdAt,
    ...(deployment === undefined ? {} : { deployment }),
    gates: { allowNetwork: false, approveProductionDeploy: false },
  };
}

function buildUptimeKumaRealInput(job: QueueWorkerJob): UptimeKumaRealInput {
  const monitor = safeRecord(job.payload.monitor);
  return {
    env: {},
    now: job.createdAt,
    ...(monitor === undefined ? {} : { monitor }),
    gates: { allowNetwork: false },
  };
}

function buildPlaneRealInput(job: QueueWorkerJob): PlaneRealInput {
  const mission = safeRecord(job.payload.mission);
  return {
    env: {},
    now: job.createdAt,
    ...(mission === undefined ? {} : { mission }),
    bugs: Array.isArray(job.payload.bugs) ? job.payload.bugs.filter(isRecord) : [],
    gates: { allowNetwork: false },
  };
}

function buildPlaywrightEnv(job: QueueWorkerJob): Record<string, string | undefined> {
  return {
    QA_TEST_URL: stringValue(job.payload.targetUrl) ?? process.env.QA_TEST_URL,
    STAGING_URL: stringValue(job.payload.stagingUrl) ?? process.env.STAGING_URL,
    ENABLE_REAL_PLAYWRIGHT: job.payload.enableRealMode === true && process.env.ENABLE_REAL_PLAYWRIGHT === "1" ? "1" : "0",
  };
}

function buildAiExploratoryEnv(job: QueueWorkerJob): Record<string, string | undefined> {
  return {
    QA_TEST_URL: stringValue(job.payload.targetUrl) ?? process.env.QA_TEST_URL,
    STAGING_URL: stringValue(job.payload.stagingUrl) ?? process.env.STAGING_URL,
    ENABLE_AI_EXPLORATORY_QA: job.payload.enableRealMode === true && process.env.ENABLE_AI_EXPLORATORY_QA === "1" ? "1" : "0",
  };
}

function buildProjectPassport(job: QueueWorkerJob): ProjectPassport {
  const passport = safeRecord(job.payload.passport);
  if (passport) {
    return passport as ProjectPassport;
  }
  return {
    id: job.projectId,
    name: job.projectId,
    description: "Generated safe default passport for gated Worker Runner handling.",
    repo: {
      url: stringValue(job.payload.repoUrl) ?? "https://example.invalid/manual-action.git",
      default_branch: stringValue(job.payload.defaultBranch) ?? "main",
    },
    runtime: { kind: "web" },
    commands: {
      install: "pnpm install --lockfile-only",
      test: "pnpm test",
      build: "pnpm build",
      run_staging: "pnpm dev",
    },
    urls: {
      production: "",
      staging: stringValue(job.payload.stagingUrl) ?? stringValue(job.payload.targetUrl) ?? "",
    },
    quality_gates: {
      require_build: true,
      require_unit_tests: true,
      require_e2e_tests: true,
      require_pr_review: true,
    },
    core_flows: [{ id: "manual_review", name: "Manual review", priority: "P1" }],
  };
}

function buildMissionFiles(job: QueueWorkerJob): Record<MissionFileName, string> {
  const missionFiles = safeRecord(job.payload.missionFiles);
  return {
    "mission.md": stringValue(missionFiles?.["mission.md"]) ?? `# Mission\n\n${job.missionId}\n`,
    "acceptance.md": stringValue(missionFiles?.["acceptance.md"]) ?? "# Acceptance\n\n- Stop for manual action unless gates are explicitly satisfied.\n",
    "technical-notes.md": stringValue(missionFiles?.["technical-notes.md"]) ?? "# Technical Notes\n\nGated real-mode queue job.\n",
    "risk-notes.md": stringValue(missionFiles?.["risk-notes.md"]) ?? "# Risk Notes\n\nNo push, deploy, shell, browser, or network call is allowed by default.\n",
  };
}

function buildVerificationCommands(payload: Record<string, unknown>) {
  const commands = safeRecord(payload.verificationCommands);
  if (!commands) {
    return undefined;
  }
  return {
    regression: stringArray(commands.regression),
    unit: stringArray(commands.unit),
    e2e: stringArray(commands.e2e),
  };
}

function isLocalRepoUrl(repoUrl: string): boolean {
  return repoUrl.startsWith("file://") || !/^(?:[a-z][a-z0-9+.-]*:|[^@\s]+@[^:]+:)/i.test(repoUrl);
}

function isSafeCodexBranchName(branchName: string): boolean {
  return branchName.startsWith("agent/") && branchName !== "main" && branchName !== "master";
}

function safeRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
