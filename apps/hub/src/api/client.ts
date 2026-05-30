import type {
  DashboardResponse,
  ExternalIntegrationName,
  IntegrationDryRunResult,
  IntegrationStatus,
  MissionSummaryResponse,
} from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<ResponseLike>;

interface ResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
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
  getMissionSummary: (missionId: string) => Promise<MissionSummaryResponse>;
  listIntegrations: () => Promise<IntegrationStatus[]>;
  runIntegrationDryRun: (name: ExternalIntegrationName, payload?: Record<string, unknown>) => Promise<IntegrationDryRunResult>;
}

const defaultApiUrl = import.meta.env.VITE_ORCHESTRATOR_API_URL || "http://127.0.0.1:3000";
const defaultToken = import.meta.env.VITE_PSF_API_TOKEN || "";

export function createOrchestratorClient(options: OrchestratorClientOptions = {}): OrchestratorClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultApiUrl);
  const token = options.token ?? defaultToken;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: RequestInit = {}, protectedCall = false): Promise<T> {
    const headers: Record<string, string> = {};
    const initHeaders = init.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init.headers as Record<string, string> | undefined) ?? {};
    Object.assign(headers, initHeaders);
    if (protectedCall && token.trim() !== "") {
      headers.authorization = `Bearer ${token}`;
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
    getMissionSummary: (missionId: string) => request<MissionSummaryResponse>(`/missions/${encodeURIComponent(missionId)}/summary`),
    listIntegrations: () => request<IntegrationStatus[]>("/integrations"),
    runIntegrationDryRun: (name: ExternalIntegrationName, payload: Record<string, unknown> = {}) => request<IntegrationDryRunResult>(
      `/integrations/${encodeURIComponent(name)}/dry-run`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      true,
    ),
  };
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
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
