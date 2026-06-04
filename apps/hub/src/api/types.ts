export type MissionStatus =
  | "received"
  | "planning"
  | "planned"
  | "approval_required"
  | "dev_queued"
  | "dev_running"
  | "build_running"
  | "test_running"
  | "staging_ready"
  | "qa_running"
  | "bugs_found"
  | "fixing"
  | "regression_running"
  | "ready_for_review"
  | "release_approval"
  | "released"
  | "paused"
  | "blocked"
  | "failed"
  | "cancelled"
  | string;

export type Priority = "P0" | "P1" | "P2" | "P3";
export type RiskLevel = "low" | "medium" | "high";
export type JsonRecord = Record<string, unknown>;

export interface Project {
  id: string;
  slug: string;
  name: string;
  description?: string;
  repo_url: string;
  default_branch: string;
  local_path?: string;
  passport_path?: string;
  production_url?: string;
  staging_url?: string;
  status: "active" | "inactive" | "archived" | string;
  created_at: string;
  updated_at: string;
}

export interface CreateMissionRequest {
  projectId: string;
  title: string;
  rawRequest: string;
  priority?: Priority;
  riskLevel?: RiskLevel;
}

export interface Mission {
  id: string;
  project_id: string;
  title: string;
  slug: string;
  raw_request: string;
  mission_markdown?: string;
  acceptance_markdown?: string;
  status: MissionStatus;
  priority: Priority;
  risk_level: RiskLevel;
  branch_name?: string;
  workspace_path?: string;
  pr_url?: string;
  current_attempt: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface MissionEvent {
  id: string;
  mission_id: string;
  type: string;
  message: string;
  payload: JsonRecord;
  created_at: string;
}

export interface BugReport {
  id: string;
  mission_id: string;
  qa_run_id?: string;
  title: string;
  severity: Priority;
  status: "open" | "in_progress" | "fixed" | "accepted" | "wont_fix" | string;
  reproduction_steps: string[];
  expected_result: string;
  actual_result: string;
  evidence: JsonRecord;
  suggested_fix?: string;
  regression_test_path?: string;
  suggested_fix_direction?: string;
  source?: string;
  created_at: string;
  updated_at: string;
}

export interface QAReport {
  id: string;
  mission_id: string;
  target_url: string;
  mode: string;
  status: "queued" | "passed" | "failed" | "running" | "cancelled" | "skipped" | string;
  summary: string;
  report_path?: string;
  screenshots_dir?: string;
  trace_path?: string;
  bugs_json_path?: string;
  staging_url?: string;
  passed?: number;
  failed?: number;
  bugs: BugReport[];
  created_at: string;
  updated_at: string;
}

export interface Artifact {
  id: string;
  mission_id: string;
  type: string;
  path: string;
  worker_run_id?: string;
  content?: string;
  mime_type?: string;
  size: number;
  metadata: JsonRecord;
  created_at: string;
}

export interface Approval {
  id: string;
  mission_id: string;
  type: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | string;
  reason: string;
  payload: JsonRecord;
  requested_by?: string;
  decided_by?: string;
  decision?: string;
  decided_at?: string;
  created_at: string;
  approved_at?: string;
  rejected_at?: string;
}

export interface WorkerRun {
  id: string;
  mission_id: string;
  worker_type: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "skipped" | string;
  mode?: string;
  command?: string;
  stdout_path?: string;
  stderr_path?: string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  input: JsonRecord;
  output: JsonRecord;
  error?: string;
  logs: string[];
  metadata: JsonRecord;
  created_at?: string;
  updated_at?: string;
}

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
  outputs: JsonRecord;
  createdAt: string;
}

export type MissionDryRunAction = "plan" | "codex-dry-run" | "qa-dry-run" | "fix-dry-run" | "loop-dry-run";

export interface InlineDryRunActionResponse {
  accepted?: true;
  executionMode?: "inline";
  missionId: string;
  projectId?: string;
  mode: "dry-run";
  dryRun: true;
  realCodexExecuted: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
  generatedArtifacts: string[];
  workerRunIds: string[];
  qaRunIds: string[];
  bugIds: string[];
  eventIds: string[];
  missionDetailUrl?: string;
  recommendedNextAction: string;
}

export interface QueuedDryRunActionResponse {
  accepted: true;
  executionMode: "queued";
  workerRunId: string;
  jobId: string;
  missionId: string;
  projectId?: string;
  status: "queued";
  recommendedNextAction: string;
}

export type DryRunActionResponse = InlineDryRunActionResponse | QueuedDryRunActionResponse;

export interface QueueStatus {
  runtime: string;
  redisConfigured: boolean;
  redisReachable?: boolean;
  queueName: string;
  counts: {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    delayed: number;
  };
}

export interface DashboardMetrics {
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
}

export interface HealthSignal {
  key: string;
  status: "ok" | "warning" | "attention" | string;
  count: number;
  message: string;
}

export type RealModeReadinessKey = "codex" | "qaPlaywright" | "qaAiExploratory" | "fix" | "github" | "coolify" | "uptimeKuma" | "plane";

export type ReadinessBlockerScope = "queue" | "execution";

export type ReadinessBlockerKind =
  | "queue_mode"
  | "worker_runtime"
  | "route_gate"
  | "provider_env"
  | "approval"
  | "injected_runner"
  | "injected_transport"
  | "local_mirror"
  | "target_url"
  | "selector_verification"
  | "command_policy"
  | "workspace_guard"
  | "operation_gate";

export interface ReadinessBlocker {
  scope: ReadinessBlockerScope;
  kind: ReadinessBlockerKind;
  message: string;
  nextAction: string;
  missing?: string[];
}

export interface RealModeReadinessEntry {
  key: RealModeReadinessKey;
  label: string;
  action: string;
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  safeToRun: boolean;
  canQueue: boolean;
  canExecute: boolean;
  realNetworkCall: false;
  missingEnv: string[];
  requiredApprovalTypes?: string[];
  approvedApprovalTypes?: string[];
  missingApprovalTypes?: string[];
  queueBlockers: ReadinessBlocker[];
  executionBlockers: ReadinessBlocker[];
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;
  message: string;
}

export type RealModeReadiness = Record<RealModeReadinessKey, RealModeReadinessEntry>;

export interface ExternalLinks {
  githubPrUrl?: string;
  planeIssueUrl?: string;
  deploymentUrl?: string;
  monitorUrl?: string;
}

export interface ExternalResourceStatus {
  status: string;
  workerRunId?: string;
  url?: string;
  mode?: string;
  realNetworkCall?: false;
}

export interface ArtifactRetentionSummary {
  artifactId: string;
  type: string;
  path: string;
  retentionClass?: string;
  retentionPath?: string;
  missing?: boolean;
}

export interface DashboardResponse {
  metrics: DashboardMetrics;
  recentMissions: Mission[];
  recentBugs: BugReport[];
  recentWorkerRuns: WorkerRun[];
  recentFailedWorkerRuns: WorkerRun[];
  recentQaRuns: QAReport[];
  recentArtifacts: Artifact[];
  integrationStatuses: IntegrationStatus[];
  realModeReadiness?: RealModeReadiness;
  policyFailures?: string[];
  recommendedNextActions: string[];
  healthSignals: HealthSignal[];
  queueStatus?: QueueStatus;
}

export interface MissionSummaryResponse {
  mission: Mission;
  project: Project;
  currentStatus: MissionStatus;
  events: MissionEvent[];
  artifacts: Artifact[];
  workerRuns: WorkerRun[];
  qaRuns: QAReport[];
  bugs: BugReport[];
  approvals: Approval[];
  qaReportArtifact?: Artifact;
  bugsJsonArtifact?: Artifact;
  codexPromptArtifact?: Artifact;
  codexCommandArtifact?: Artifact;
  fixMissionArtifact?: Artifact;
  fixCodexCommandArtifact?: Artifact;
  realModeReadiness?: RealModeReadiness;
  policyFailures?: string[];
  externalLinks?: ExternalLinks;
  deploymentStatus?: ExternalResourceStatus | null;
  monitorStatus?: ExternalResourceStatus | null;
  planeStatus?: ExternalResourceStatus | null;
  artifactRetention?: ArtifactRetentionSummary[];
  recommendedNextAction: string;
}
