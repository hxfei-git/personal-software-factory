import type {
  Approval,
  Artifact,
  BugReport,
  CreateMissionRequest,
  DashboardResponse,
  DryRunActionResponse,
  ExternalIntegrationName,
  IntegrationDryRunResult,
  IntegrationStatus,
  Mission,
  MissionActionKind,
  MissionSummaryResponse,
  Project,
  QueueStatus,
  WorkerRun,
} from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<ResponseLike>;

interface ResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

type ApprovalDecisionRequest = {
  status: "approved" | "rejected" | "cancelled";
  decidedBy?: string;
  decision?: string;
};

interface SyncProjectsResponse {
  projects: Project[];
}

export interface OrchestratorClientOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: FetchLike;
}

export class OrchestratorApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "OrchestratorApiError";
    this.status = status;
    if (code !== undefined) {
      this.code = code;
    }
  }
}

export interface OrchestratorClient {
  getDashboard: () => Promise<DashboardResponse>;
  listProjects: () => Promise<Project[]>;
  getProject: (projectId: string) => Promise<Project>;
  syncProjects: () => Promise<Project[]>;
  listMissions: () => Promise<Mission[]>;
  createMission: (input: CreateMissionRequest) => Promise<Mission>;
  listBugs: () => Promise<BugReport[]>;
  getBug: (bugId: string) => Promise<BugReport>;
  listArtifacts: () => Promise<Artifact[]>;
  getArtifact: (artifactId: string) => Promise<Artifact>;
  listApprovals: () => Promise<Approval[]>;
  getApproval: (approvalId: string) => Promise<Approval>;
  decideApproval: (approvalId: string, input: ApprovalDecisionRequest) => Promise<Approval>;
  getMissionSummary: (missionId: string) => Promise<MissionSummaryResponse>;
  getQueueStatus: () => Promise<QueueStatus>;
  listWorkerRuns: () => Promise<WorkerRun[]>;
  getWorkerRun: (id: string) => Promise<WorkerRun>;
  cancelWorkerRun: (id: string) => Promise<unknown>;
  retryWorkerRun: (id: string) => Promise<unknown>;
  listIntegrations: () => Promise<IntegrationStatus[]>;
  runIntegrationDryRun: (name: ExternalIntegrationName, payload?: Record<string, unknown>) => Promise<IntegrationDryRunResult>;
  runMissionAction: (missionId: string, action: MissionActionKind, payload?: Record<string, unknown>) => Promise<DryRunActionResponse>;
  runAiNovelistDemo: (payload?: Record<string, unknown>) => Promise<DryRunActionResponse>;
}

const defaultApiUrl = import.meta.env.VITE_ORCHESTRATOR_API_URL || "http://127.0.0.1:3000";
const defaultToken = import.meta.env.VITE_PSF_API_TOKEN || "";

export function createOrchestratorClient(options: OrchestratorClientOptions = {}): OrchestratorClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultApiUrl);
  const token = options.token ?? defaultToken;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {};
    const initHeaders = init.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init.headers as Record<string, string> | undefined) ?? {};
    Object.assign(headers, initHeaders);
    const method = (init.method ?? "GET").toUpperCase();
    const trimmedToken = token.trim();
    if (isWriteMethod(method)) {
      if (trimmedToken === "") {
        throw new OrchestratorApiError(
          401,
          "Set VITE_PSF_API_TOKEN to a local Orchestrator bearer token before running protected dry-run actions.",
          "TOKEN_REQUIRED",
        );
      }
      headers.authorization = `Bearer ${trimmedToken}`;
    }

    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    const payload = await readJson(response);
    if (!response.ok) {
      const errorPayload = isRecord(payload) ? payload : {};
      const rawMessage = typeof errorPayload.message === "string" ? errorPayload.message : `Request failed with status ${response.status}`;
      const code = typeof errorPayload.code === "string" ? errorPayload.code : undefined;
      throw new OrchestratorApiError(response.status, redactToken(rawMessage, token), code);
    }
    return payload as T;
  }

  return {
    getDashboard: () => request<DashboardResponse>("/dashboard"),
    listProjects: () => request<Project[]>("/projects"),
    getProject: (projectId: string) => request<Project>(`/projects/${encodeURIComponent(projectId)}`),
    syncProjects: async () => (await request<SyncProjectsResponse>("/projects/sync", { method: "POST" })).projects,
    listMissions: () => request<Mission[]>("/missions"),
    createMission: (input: CreateMissionRequest) => request<Mission>("/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toCreateMissionApiBody(input)),
    }),
    listBugs: () => request<BugReport[]>("/bugs"),
    getBug: (bugId: string) => request<BugReport>(`/bugs/${encodeURIComponent(bugId)}`),
    listArtifacts: () => request<Artifact[]>("/artifacts"),
    getArtifact: (artifactId: string) => request<Artifact>(`/artifacts/${encodeURIComponent(artifactId)}`),
    listApprovals: () => request<Approval[]>("/approvals"),
    getApproval: (approvalId: string) => request<Approval>(`/approvals/${encodeURIComponent(approvalId)}`),
    decideApproval: (approvalId: string, input: ApprovalDecisionRequest) => request<Approval>(`/approvals/${encodeURIComponent(approvalId)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    getMissionSummary: (missionId: string) => request<MissionSummaryResponse>(`/missions/${encodeURIComponent(missionId)}/summary`),
    getQueueStatus: () => request<QueueStatus>("/queues/status"),
    listWorkerRuns: () => request<WorkerRun[]>("/worker-runs"),
    getWorkerRun: (id: string) => request<WorkerRun>(`/worker-runs/${encodeURIComponent(id)}`),
    cancelWorkerRun: (id: string) => request<unknown>(`/worker-runs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
    retryWorkerRun: (id: string) => request<unknown>(`/worker-runs/${encodeURIComponent(id)}/retry`, { method: "POST" }),
    listIntegrations: () => request<IntegrationStatus[]>("/integrations"),
    runIntegrationDryRun: (name: ExternalIntegrationName, payload: Record<string, unknown> = {}) => request<IntegrationDryRunResult>(
      `/integrations/${encodeURIComponent(name)}/dry-run`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
    runMissionAction: (missionId: string, action: MissionActionKind, payload: Record<string, unknown> = {}) => request<DryRunActionResponse>(
      `/missions/${encodeURIComponent(missionId)}/actions/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
    runAiNovelistDemo: (payload: Record<string, unknown> = {}) => request<DryRunActionResponse>(
      "/demo/ai-novelist",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  };
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function toCreateMissionApiBody(input: CreateMissionRequest): Record<string, unknown> {
  return {
    project_id: input.projectId,
    title: input.title,
    raw_request: input.rawRequest,
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.riskLevel === undefined ? {} : { risk_level: input.riskLevel }),
  };
}

function isWriteMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

async function readJson(response: ResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactToken(message: string, token: string): string {
  const trimmed = token.trim();
  if (trimmed === "") {
    return message;
  }
  return message.split(trimmed).join("[redacted]");
}
