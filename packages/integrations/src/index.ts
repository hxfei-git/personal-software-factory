import { buildIntegrationStatus, INTEGRATION_DEFINITIONS, INTEGRATION_ORDER, normalizeIntegrationName } from "./base.js";
import { runCoolifyDryRun } from "./coolify.js";
import { runGitHubDryRun } from "./github.js";
import { runPlaneDryRun } from "./plane.js";
import { runUptimeKumaDryRun } from "./uptime-kuma.js";
import type {
  AnyIntegrationAdapter,
  AnyIntegrationDryRunResult,
  CoolifyAdapter,
  CoolifyDryRunInput,
  CoolifyDryRunResult,
  ExternalIntegrationName,
  GitHubAdapter,
  GitHubDryRunInput,
  GitHubDryRunResult,
  IntegrationName,
  IntegrationRuntimeOptions,
  IntegrationStatus,
  PlaneAdapter,
  PlaneDryRunInput,
  PlaneDryRunResult,
  UptimeKumaAdapter,
  UptimeKumaDryRunInput,
  UptimeKumaDryRunResult,
} from "./types.js";

export type {
  AnyIntegrationAdapter,
  AnyIntegrationDryRunResult,
  BugReportInput,
  CoolifyAdapter,
  CoolifyDeploymentInput,
  CoolifyDeployRequestOutput,
  CoolifyDryRunInput,
  CoolifyDryRunOutputs,
  CoolifyDryRunResult,
  CoolifySimulatedDeploymentOutput,
  ExternalIntegrationName,
  GitHubAdapter,
  GitHubDryRunInput,
  GitHubDryRunOutputs,
  GitHubDryRunResult,
  GitHubIssueOutput,
  GitHubPullRequestOutput,
  IntegrationAdapter,
  IntegrationDryRunResult,
  IntegrationEnv,
  IntegrationInputByName,
  IntegrationMode,
  IntegrationName,
  IntegrationOutputsByName,
  IntegrationResultByName,
  IntegrationRuntimeOptions,
  IntegrationStatus,
  MissionIntegrationInput,
  PlaneAdapter,
  PlaneBugIssueOutput,
  PlaneDryRunInput,
  PlaneDryRunOutputs,
  PlaneDryRunResult,
  PlaneMissionIssueOutput,
  SimulatedGitHubRecordOutput,
  UptimeKumaAdapter,
  UptimeKumaDryRunInput,
  UptimeKumaDryRunOutputs,
  UptimeKumaDryRunResult,
  UptimeKumaMonitorConfigOutput,
  UptimeKumaMonitorInput,
  UptimeKumaSimulatedMonitorOutput,
  WorkerRunSummary,
} from "./types.js";

export { isSecretLikeName, redactText, redactValue } from "./redaction.js";
export { buildGitHubPullRequestBody, runGitHubDryRun } from "./github.js";
export { runCoolifyDryRun } from "./coolify.js";
export { runUptimeKumaDryRun } from "./uptime-kuma.js";
export { runPlaneDryRun } from "./plane.js";

export function createGithubAdapter(): GitHubAdapter {
  return {
    name: "github",
    externalName: "github",
    requiredEnv: INTEGRATION_DEFINITIONS.github.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.github, options),
    dryRun: (input?: GitHubDryRunInput) => runGitHubDryRun(input),
  };
}

export function createCoolifyAdapter(): CoolifyAdapter {
  return {
    name: "coolify",
    externalName: "coolify",
    requiredEnv: INTEGRATION_DEFINITIONS.coolify.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.coolify, options),
    dryRun: (input?: CoolifyDryRunInput) => runCoolifyDryRun(input),
  };
}

export function createUptimeKumaAdapter(): UptimeKumaAdapter {
  return {
    name: "uptime_kuma",
    externalName: "uptime-kuma",
    requiredEnv: INTEGRATION_DEFINITIONS.uptime_kuma.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.uptime_kuma, options),
    dryRun: (input?: UptimeKumaDryRunInput) => runUptimeKumaDryRun(input),
  };
}

export function createPlaneAdapter(): PlaneAdapter {
  return {
    name: "plane",
    externalName: "plane",
    requiredEnv: INTEGRATION_DEFINITIONS.plane.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.plane, options),
    dryRun: (input?: PlaneDryRunInput) => runPlaneDryRun(input),
  };
}

const adapters: { [Name in IntegrationName]: AnyIntegrationAdapter } = {
  github: createGithubAdapter(),
  coolify: createCoolifyAdapter(),
  uptime_kuma: createUptimeKumaAdapter(),
  plane: createPlaneAdapter(),
};

export function getIntegrationAdapter(name: "github"): GitHubAdapter;
export function getIntegrationAdapter(name: "coolify"): CoolifyAdapter;
export function getIntegrationAdapter(name: "uptime_kuma" | "uptime-kuma"): UptimeKumaAdapter;
export function getIntegrationAdapter(name: "plane"): PlaneAdapter;
export function getIntegrationAdapter(name: ExternalIntegrationName): AnyIntegrationAdapter;
export function getIntegrationAdapter(name: ExternalIntegrationName): AnyIntegrationAdapter {
  return adapters[normalizeIntegrationName(name)];
}

export function runIntegrationDryRun(name: "github", input?: GitHubDryRunInput): GitHubDryRunResult;
export function runIntegrationDryRun(name: "coolify", input?: CoolifyDryRunInput): CoolifyDryRunResult;
export function runIntegrationDryRun(name: "uptime_kuma" | "uptime-kuma", input?: UptimeKumaDryRunInput): UptimeKumaDryRunResult;
export function runIntegrationDryRun(name: "plane", input?: PlaneDryRunInput): PlaneDryRunResult;
export function runIntegrationDryRun(name: ExternalIntegrationName, input?: GitHubDryRunInput | CoolifyDryRunInput | UptimeKumaDryRunInput | PlaneDryRunInput): AnyIntegrationDryRunResult;
export function runIntegrationDryRun(name: ExternalIntegrationName, input: GitHubDryRunInput | CoolifyDryRunInput | UptimeKumaDryRunInput | PlaneDryRunInput = {}): AnyIntegrationDryRunResult {
  switch (normalizeIntegrationName(name)) {
    case "github":
      return runGitHubDryRun(input as GitHubDryRunInput);
    case "coolify":
      return runCoolifyDryRun(input as CoolifyDryRunInput);
    case "uptime_kuma":
      return runUptimeKumaDryRun(input as UptimeKumaDryRunInput);
    case "plane":
      return runPlaneDryRun(input as PlaneDryRunInput);
  }
}

export function listIntegrationStatuses(options: IntegrationRuntimeOptions = {}): IntegrationStatus[] {
  return INTEGRATION_ORDER.map((name) => buildIntegrationStatus(INTEGRATION_DEFINITIONS[name], options));
}
