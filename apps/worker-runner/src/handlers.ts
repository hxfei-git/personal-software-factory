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
  type CoolifyRealInput,
  type CoolifyRealResult,
  type PlaneRealInput,
  type PlaneRealResult,
  type UptimeKumaRealInput,
  type UptimeKumaRealResult,
  type PlaneDryRunInput,
  type UptimeKumaDryRunInput,
} from "@psf/integrations";
import { RealCodexRunner, type CodexExecutionResult, type CodexRunner } from "@psf/codex-worker";
import {
  AiExploratoryQaRunner,
  runDeterministicPlaywrightQa,
  type AiExploratoryQaExecutor,
  type AiExploratoryQaResult,
  type DeterministicQaInput,
  type DeterministicQaResult,
} from "@psf/qa-worker";
import { runGatedRealAutoFixLoop, type GatedRealAutoFixLoopInput, type GatedRealAutoFixLoopResult } from "@psf/auto-fix-loop";
import type { Artifact, BugReport, MissionEvent, MissionStatusValue, ProjectPassport, QAReport, WorkerRun } from "@psf/mission-schema";
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

export interface WorkerJobHandlerDependencies {
  codexRunner?: CodexRunner;
  deterministicQaExecute?: DeterministicQaInput["execute"];
  aiExploratoryQaExecute?: AiExploratoryQaExecutor;
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
      case "qa.playwright":
        return toDeterministicQaHandlerResult(await runDeterministicPlaywrightQa(buildDeterministicQaInput(job, deps)));
      case "qa.ai_exploratory":
        return toAiExploratoryQaHandlerResult(await AiExploratoryQaRunner.real({
          env: buildAiExploratoryEnv(job),
          ...(deps.aiExploratoryQaExecute ? { execute: deps.aiExploratoryQaExecute } : {}),
        }).run(buildAiExploratoryQaInput(job)));
      case "fix.real":
        return toAutoFixHandlerResult(await runGatedRealAutoFixLoop(buildAutoFixInput(cwd, job)));
      case "github.pr":
        return toIntegrationRealHandlerResult(await runGitHubReal(buildGitHubRealInput(job)));
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
  const runner = deps.codexRunner ?? new RealCodexRunner({ env: buildCodexEnv(job) });
  return runner.run(buildCodexRealInput(cwd, job));
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
  return {
    childWorkerRunIds: [result.workerRun.id],
    childQARunIds: [],
    childArtifactIds: result.artifacts.map((artifact) => artifact.id),
    childBugReportIds: [],
    summary: result.reason,
    recommendedNextAction: codexRecommendedNextAction(result),
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
    childBugReportIds: [],
    summary: result.recommendedNextAction,
    recommendedNextAction: result.recommendedNextAction,
    childWorkerRuns: result.workerRuns,
    childArtifacts: result.artifacts,
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
    repoUrl: stringValue(payload.repoUrl) ?? passport.repo.url,
    defaultBranch: stringValue(payload.defaultBranch) ?? passport.repo.default_branch,
    missionFiles: buildMissionFiles(job),
    approvalIds: stringArray(payload.approvalIds),
    commands: stringArray(payload.commands),
    branchName: stringValue(payload.branchName) ?? `agent/${job.missionId}`,
    workspaceRoot: stringValue(payload.workspaceRoot) ?? path.join(cwd, "workspaces", job.projectId),
    timeoutMs: job.timeoutMs,
    mode: "real" as const,
  };
}

function buildDeterministicQaInput(job: QueueWorkerJob, deps: WorkerJobHandlerDependencies): DeterministicQaInput {
  const targetUrl = stringValue(job.payload.targetUrl) ?? stringValue(job.payload.stagingUrl);
  return {
    missionId: job.missionId,
    projectId: job.projectId,
    ...(targetUrl ? { targetUrl } : {}),
    env: buildPlaywrightEnv(job),
    ...(deps.deterministicQaExecute ? { execute: deps.deterministicQaExecute } : {}),
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

function buildAutoFixInput(cwd: string, job: QueueWorkerJob): GatedRealAutoFixLoopInput {
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
  };
}

function buildGitHubRealInput(job: QueueWorkerJob): GitHubRealInput {
  const mission = safeRecord(job.payload.mission);
  const baseBranch = stringValue(job.payload.baseBranch);
  const qaComment = stringValue(job.payload.qaComment);
  return {
    env: {},
    now: job.createdAt,
    ...(mission === undefined ? {} : { mission }),
    ...(baseBranch === undefined ? {} : { baseBranch }),
    ...(qaComment === undefined ? {} : { qaComment }),
    gates: { allowNetwork: false, allowPushBranch: false, allowCreatePullRequest: false },
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

function buildCodexEnv(job: QueueWorkerJob): Record<string, string | undefined> {
  return {
    ...process.env,
    ENABLE_REAL_CODEX: job.payload.enableRealMode === true && process.env.ENABLE_REAL_CODEX === "1" ? "1" : "0",
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

function safeRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
