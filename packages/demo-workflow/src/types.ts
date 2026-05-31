export interface DemoBoundary {
  dryRun: true;
  realCodexExecuted: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
}

export interface DemoWorkflowOptions {
  cwd?: string;
  withSampleBug?: boolean;
  resetDemo?: boolean;
  skipDb?: boolean;
  apiUrl?: string;
  hubUrl?: string;
  now?: string;
}

export interface DemoWorkflowResult {
  missionId: string;
  projectId: string;
  apiUrl: string;
  hubUrl: string;
  missionDetailUrl: string;
  generatedArtifacts: string[];
  workerRunIds: string[];
  qaRunIds: string[];
  bugIds: string[];
  eventIds: string[];
  dbSynced: boolean;
  boundary: DemoBoundary;
  message: string;
}

export type DoctorStatus = "ok" | "warning" | "failed";

export interface DoctorCheck {
  key: string;
  status: DoctorStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorResult {
  status: DoctorStatus;
  checks: DoctorCheck[];
}
