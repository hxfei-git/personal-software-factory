export type IntegrationName = "github" | "coolify" | "uptime_kuma" | "plane";
export type ExternalIntegrationName = IntegrationName | "uptime-kuma";
export type IntegrationMode = "mock" | "dry-run" | "real";

export interface IntegrationStatus {
  name: IntegrationName;
  externalName: string;
  mode: IntegrationMode;
  enabled: boolean;
  configured: boolean;
  healthy: boolean;
  realEnabled: boolean;
  realNetworkCall: false;
  safeToRun: boolean;
  requiredEnv: string[];
  missingEnv: string[];
  lastCheckedAt: string;
  message: string;
}

export interface IntegrationDryRunResult {
  name: IntegrationName;
  externalName: string;
  mode: IntegrationMode;
  realEnabled: boolean;
  realNetworkCall: false;
  configured: boolean;
  missingEnv: string[];
  safeToRun: boolean;
  message: string;
  status: IntegrationStatus;
  outputs: Record<string, unknown>;
  createdAt: string;
}

export type IntegrationEnv = Readonly<Record<string, string | undefined>>;

export interface IntegrationRuntimeOptions {
  env?: IntegrationEnv;
  now?: string | (() => string);
  mode?: Exclude<IntegrationMode, "real">;
}

export interface IntegrationDefinition {
  name: IntegrationName;
  externalName: string;
  requiredEnv: string[];
  enableRealEnv: string;
}

export interface IntegrationAdapter {
  name: IntegrationName;
  externalName: string;
  requiredEnv: string[];
  getStatus(options?: IntegrationRuntimeOptions): IntegrationStatus;
  dryRun(input?: Record<string, unknown> & IntegrationRuntimeOptions): IntegrationDryRunResult;
}

export interface MissionIntegrationInput {
  missionId?: string;
  missionTitle?: string;
  missionSummary?: string;
  project?: string;
  branchName?: string;
  acceptanceCriteria?: string[];
  devSummary?: string;
  qaReport?: string;
  bugFixSummary?: string;
  artifacts?: string[];
  workerRuns?: WorkerRunSummary[];
  risks?: string[];
  requiresHumanApproval?: boolean;
}

export interface WorkerRunSummary {
  id?: string;
  worker?: string;
  status?: string;
  summary?: string;
}

export interface BugReportInput {
  id?: string;
  title?: string;
  severity?: string;
  status?: string;
  reproductionSteps?: string[];
  reproduction_steps?: string[];
  expectedResult?: string;
  expected_result?: string;
  actualResult?: string;
  actual_result?: string;
  evidence?: unknown;
}

export interface GitHubDryRunInput extends IntegrationRuntimeOptions {
  mission?: MissionIntegrationInput;
}

export interface CoolifyDeploymentInput {
  project?: string;
  environment?: "staging" | "production";
  stagingUrl?: string;
  productionUrl?: string;
}

export interface CoolifyDryRunInput extends IntegrationRuntimeOptions {
  deployment?: CoolifyDeploymentInput;
}

export interface UptimeKumaMonitorInput {
  project?: string;
  stagingUrl?: string;
  productionUrl?: string;
}

export interface UptimeKumaDryRunInput extends IntegrationRuntimeOptions {
  monitor?: UptimeKumaMonitorInput;
}

export interface PlaneDryRunInput extends IntegrationRuntimeOptions {
  mission?: MissionIntegrationInput;
  bugs?: BugReportInput[];
}
