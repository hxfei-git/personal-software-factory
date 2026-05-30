import { buildIntegrationStatus, INTEGRATION_DEFINITIONS, INTEGRATION_ORDER, normalizeIntegrationName } from "./base.js";
import { runCoolifyDryRun } from "./coolify.js";
import { runGitHubDryRun } from "./github.js";
import { runPlaneDryRun } from "./plane.js";
import { runUptimeKumaDryRun } from "./uptime-kuma.js";
import type {
  CoolifyDryRunInput,
  ExternalIntegrationName,
  GitHubDryRunInput,
  IntegrationAdapter,
  IntegrationName,
  IntegrationRuntimeOptions,
  IntegrationStatus,
  PlaneDryRunInput,
  UptimeKumaDryRunInput,
} from "./types.js";

export type {
  BugReportInput,
  CoolifyDeploymentInput,
  CoolifyDryRunInput,
  ExternalIntegrationName,
  GitHubDryRunInput,
  IntegrationAdapter,
  IntegrationDryRunResult,
  IntegrationEnv,
  IntegrationMode,
  IntegrationName,
  IntegrationRuntimeOptions,
  IntegrationStatus,
  MissionIntegrationInput,
  PlaneDryRunInput,
  UptimeKumaDryRunInput,
  UptimeKumaMonitorInput,
  WorkerRunSummary,
} from "./types.js";

export { redactText, redactValue } from "./redaction.js";
export { buildGitHubPullRequestBody, runGitHubDryRun } from "./github.js";
export { runCoolifyDryRun } from "./coolify.js";
export { runUptimeKumaDryRun } from "./uptime-kuma.js";
export { runPlaneDryRun } from "./plane.js";

const adapters: Record<IntegrationName, IntegrationAdapter> = {
  github: {
    name: "github",
    externalName: "github",
    requiredEnv: INTEGRATION_DEFINITIONS.github.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.github, options),
    dryRun: (input = {}) => runGitHubDryRun(input as GitHubDryRunInput),
  },
  coolify: {
    name: "coolify",
    externalName: "coolify",
    requiredEnv: INTEGRATION_DEFINITIONS.coolify.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.coolify, options),
    dryRun: (input = {}) => runCoolifyDryRun(input as CoolifyDryRunInput),
  },
  uptime_kuma: {
    name: "uptime_kuma",
    externalName: "uptime-kuma",
    requiredEnv: INTEGRATION_DEFINITIONS.uptime_kuma.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.uptime_kuma, options),
    dryRun: (input = {}) => runUptimeKumaDryRun(input as UptimeKumaDryRunInput),
  },
  plane: {
    name: "plane",
    externalName: "plane",
    requiredEnv: INTEGRATION_DEFINITIONS.plane.requiredEnv,
    getStatus: (options?: IntegrationRuntimeOptions) => buildIntegrationStatus(INTEGRATION_DEFINITIONS.plane, options),
    dryRun: (input = {}) => runPlaneDryRun(input as PlaneDryRunInput),
  },
};

export function getIntegrationAdapter(name: ExternalIntegrationName): IntegrationAdapter {
  return adapters[normalizeIntegrationName(name)];
}

export function listIntegrationStatuses(options: IntegrationRuntimeOptions = {}): IntegrationStatus[] {
  return INTEGRATION_ORDER.map((name) => buildIntegrationStatus(INTEGRATION_DEFINITIONS[name], options));
}
