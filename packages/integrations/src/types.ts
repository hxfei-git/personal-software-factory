export type IntegrationName = "github" | "coolify" | "uptime_kuma" | "plane";
export type ExternalIntegrationName = IntegrationName | "uptime-kuma";
export type IntegrationMode = "mock" | "dry-run" | "real";

export interface IntegrationStatus<TName extends IntegrationName = IntegrationName> {
  name: TName;
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

export interface IntegrationDryRunResult<TName extends IntegrationName = IntegrationName, TOutputs extends object = Record<string, unknown>> {
  name: TName;
  externalName: string;
  mode: IntegrationMode;
  realEnabled: boolean;
  realNetworkCall: false;
  configured: boolean;
  missingEnv: string[];
  safeToRun: boolean;
  message: string;
  status: IntegrationStatus<TName>;
  outputs: TOutputs;
  createdAt: string;
}

export type IntegrationEnv = Readonly<Record<string, string | undefined>>;

export interface IntegrationRuntimeOptions {
  env?: IntegrationEnv;
  now?: string | (() => string);
  mode?: Exclude<IntegrationMode, "real">;
}

export interface IntegrationDefinition<TName extends IntegrationName = IntegrationName> {
  name: TName;
  externalName: string;
  requiredEnv: string[];
  enableRealEnv: string;
}

export interface IntegrationAdapter<
  TName extends IntegrationName = IntegrationName,
  TInput extends IntegrationRuntimeOptions = IntegrationRuntimeOptions,
  TOutputs extends object = Record<string, unknown>,
> {
  name: TName;
  externalName: string;
  requiredEnv: string[];
  getStatus(options?: IntegrationRuntimeOptions): IntegrationStatus<TName>;
  dryRun(input?: TInput): IntegrationDryRunResult<TName, TOutputs>;
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

export interface GitHubPullRequestOutput {
  title: string;
  body: string;
  base: string;
  head: string;
}

export interface GitHubIssueOutput {
  title: string;
  body: string;
}

export interface SimulatedGitHubRecordOutput {
  id: string;
  number: number;
  url: string;
  status: "simulated";
}

export interface GitHubDryRunOutputs {
  branchName: string;
  commitMessage: string;
  pullRequest: GitHubPullRequestOutput;
  issue: GitHubIssueOutput;
  simulatedPullRequest: SimulatedGitHubRecordOutput;
  simulatedIssue: SimulatedGitHubRecordOutput;
}

export type GitHubDryRunResult = IntegrationDryRunResult<"github", GitHubDryRunOutputs>;

export interface CoolifyDeploymentInput {
  project?: string;
  environment?: "staging" | "production";
  stagingUrl?: string;
  productionUrl?: string;
}

export interface CoolifyDryRunInput extends IntegrationRuntimeOptions {
  deployment?: CoolifyDeploymentInput;
}

export interface CoolifyDeployRequestOutput {
  project: string;
  environment: "staging" | "production";
  targetUrl: string | undefined;
  requiresApproval: boolean;
  dryRun: true;
}

export interface CoolifySimulatedDeploymentOutput {
  id: string;
  status: "pending_approval" | "queued";
  realNetworkCall: false;
}

export interface CoolifyDryRunOutputs {
  deployRequest: CoolifyDeployRequestOutput;
  simulatedDeployment: CoolifySimulatedDeploymentOutput;
  summary: string;
}

export type CoolifyDryRunResult = IntegrationDryRunResult<"coolify", CoolifyDryRunOutputs>;

export interface UptimeKumaMonitorInput {
  project?: string;
  stagingUrl?: string;
  productionUrl?: string;
}

export interface UptimeKumaDryRunInput extends IntegrationRuntimeOptions {
  monitor?: UptimeKumaMonitorInput;
}

export interface UptimeKumaMonitorConfigOutput {
  name: string;
  type: "http";
  url: string;
  intervalSeconds: number;
  retryIntervalSeconds: number;
  dryRun: true;
}

export interface UptimeKumaSimulatedMonitorOutput {
  id: string;
  status: "active_simulated";
  realNetworkCall: false;
}

export interface UptimeKumaDryRunOutputs {
  monitorConfig: UptimeKumaMonitorConfigOutput;
  simulatedMonitor: UptimeKumaSimulatedMonitorOutput;
  uptimeSummary: string;
}

export type UptimeKumaDryRunResult = IntegrationDryRunResult<"uptime_kuma", UptimeKumaDryRunOutputs>;

export interface PlaneDryRunInput extends IntegrationRuntimeOptions {
  mission?: MissionIntegrationInput;
  bugs?: BugReportInput[];
}

export interface PlaneMissionIssueOutput {
  id: string;
  url: string;
  title: string;
  description: string;
  status: "simulated";
}

export interface PlaneBugIssueOutput {
  id: string;
  url: string;
  title: string;
  severity: string;
  status: "simulated";
  description: string;
  evidenceSummary: string;
}

export interface PlaneDryRunOutputs {
  missionIssue: PlaneMissionIssueOutput;
  bugIssues: PlaneBugIssueOutput[];
  summary: string;
}

export type PlaneDryRunResult = IntegrationDryRunResult<"plane", PlaneDryRunOutputs>;

export interface IntegrationInputByName {
  github: GitHubDryRunInput;
  coolify: CoolifyDryRunInput;
  uptime_kuma: UptimeKumaDryRunInput;
  plane: PlaneDryRunInput;
}

export interface IntegrationOutputsByName {
  github: GitHubDryRunOutputs;
  coolify: CoolifyDryRunOutputs;
  uptime_kuma: UptimeKumaDryRunOutputs;
  plane: PlaneDryRunOutputs;
}

export interface IntegrationResultByName {
  github: GitHubDryRunResult;
  coolify: CoolifyDryRunResult;
  uptime_kuma: UptimeKumaDryRunResult;
  plane: PlaneDryRunResult;
}

export type AnyIntegrationDryRunResult = IntegrationResultByName[IntegrationName];
export type GitHubAdapter = IntegrationAdapter<"github", GitHubDryRunInput, GitHubDryRunOutputs>;
export type CoolifyAdapter = IntegrationAdapter<"coolify", CoolifyDryRunInput, CoolifyDryRunOutputs>;
export type UptimeKumaAdapter = IntegrationAdapter<"uptime_kuma", UptimeKumaDryRunInput, UptimeKumaDryRunOutputs>;
export type PlaneAdapter = IntegrationAdapter<"plane", PlaneDryRunInput, PlaneDryRunOutputs>;
export type AnyIntegrationAdapter = GitHubAdapter | CoolifyAdapter | UptimeKumaAdapter | PlaneAdapter;
