import {
  INTEGRATION_DEFINITIONS,
  getMissingEnv,
  isRealEnabled,
  resolveNow,
} from "./base.js";
import { buildGitHubPullRequestBody } from "./github.js";
import { isSecretLikeName, redactText, redactValue } from "./redaction.js";
import type { IntegrationDefinition, IntegrationEnv, IntegrationName, IntegrationStatus, MissionIntegrationInput } from "./types.js";

const definition = INTEGRATION_DEFINITIONS.github;
const REDACTED = "[REDACTED]";

export type IntegrationTransportMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface IntegrationTransportRequest {
  method: IntegrationTransportMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number | undefined;
}

export interface IntegrationTransportResponse {
  status: number;
  ok?: boolean;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export type IntegrationTransport = (request: IntegrationTransportRequest) => Promise<IntegrationTransportResponse>;
export type RealIntegrationDecision = "manual_action" | "succeeded" | "failed" | "degraded";

export interface IntegrationReadinessBlocker {
  category: "queue_acceptance" | "approval" | "configuration" | "policy" | "execution" | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: "blocking" | "manual_action" | "warning" | "info";
  blocks: Array<"queue" | "execute">;
  source: "integration";
  details?: Record<string, unknown>;
}

export type IntegrationRealStatus<TName extends IntegrationName = IntegrationName> = Omit<IntegrationStatus<TName>, "mode" | "realNetworkCall" | "safeToRun" | "healthy"> & {
  mode: "real";
  realNetworkCall: boolean;
  safeToRun: boolean;
  healthy: boolean;
};

export interface IntegrationRealResult<TName extends IntegrationName, TOutputs extends object> {
  name: TName;
  externalName: string;
  mode: "real";
  realEnabled: boolean;
  realNetworkCall: boolean;
  configured: boolean;
  missingEnv: string[];
  safeToRun: boolean;
  blockers: IntegrationReadinessBlocker[];
  message: string;
  decision: RealIntegrationDecision;
  status: IntegrationRealStatus<TName>;
  outputs: TOutputs;
  logs: string[];
  errors: string[];
  createdAt: string;
}

export interface GitHubRealGates {
  allowNetwork?: boolean;
  allowPushBranch?: boolean;
  allowCreatePullRequest?: boolean;
  allowUpdatePullRequestBody?: boolean;
  allowPostQaComment?: boolean;
}

export interface GitHubRealInput {
  env?: IntegrationEnv;
  now?: string | (() => string);
  mission?: MissionIntegrationInput;
  transport?: IntegrationTransport;
  gates?: GitHubRealGates;
  baseBranch?: string;
  sourceSha?: string;
  qaComment?: string;
  timeoutMs?: number | undefined;
}

export interface SafeRequestSummary {
  method: IntegrationTransportMethod;
  url: string;
}

export interface GitHubRealOutputs {
  branchName: string;
  baseBranch: string;
  pullRequestNumber?: number | undefined;
  pullRequestUrl?: string | undefined;
  qaCommentUrl?: string | undefined;
  requests: SafeRequestSummary[];
  manualActions: string[];
}

export type GitHubRealResult = IntegrationRealResult<"github", GitHubRealOutputs>;

function integrationBlockersFromResult(input: {
  integrationName: IntegrationName;
  decision: RealIntegrationDecision;
  message: string;
  missingEnv: string[];
  outputs: object;
  safeToRun: boolean;
}): IntegrationReadinessBlocker[] {
  const blockers: IntegrationReadinessBlocker[] = [];

  for (const envName of input.missingEnv) {
    blockers.push({
      category: "configuration",
      key: `configuration.env.${envName}.missing`,
      message: `${input.integrationName} is missing required environment variable ${envName}.`,
      recommendedNextAction: `Configure ${envName} for ${input.integrationName} or keep the adapter in manual-action mode.`,
      severity: "blocking",
      blocks: ["execute"],
      source: "integration",
      details: { provider: input.integrationName, envName },
    });
  }

  for (const manualAction of manualActionsFromOutputs(input.outputs)) {
    blockers.push(...blockersFromManualAction(input.integrationName, manualAction));
  }

  if ((input.decision !== "succeeded" || input.safeToRun === false) && blockers.length === 0) {
    blockers.push(unclassifiedIntegrationBlocker(input.integrationName, input.message));
  }

  return blockers;
}

function unclassifiedIntegrationBlocker(provider: IntegrationName, message: string): IntegrationReadinessBlocker {
  return {
    category: "execution",
    key: "execution.integration.unclassified_execution_blocker",
    message,
    recommendedNextAction: "Inspect the integration adapter output before retrying.",
    severity: "manual_action",
    blocks: ["execute"],
    source: "integration",
    details: { provider },
  };
}

function manualActionsFromOutputs(outputs: object): string[] {
  const manualActions = (outputs as { manualActions?: unknown }).manualActions;

  if (!Array.isArray(manualActions) || !manualActions.every((value) => typeof value === "string")) {
    return [];
  }

  return manualActions;
}

function blockersFromManualAction(provider: IntegrationName, manualAction: string): IntegrationReadinessBlocker[] {
  const normalized = manualAction.toLowerCase();
  const blockers: IntegrationReadinessBlocker[] = [];

  if (normalized.includes("transport")) {
    blockers.push({
      category: "execution",
      key: "execution.integration.injected_transport_missing",
      message: "Integration requires an injected transport before any provider request.",
      recommendedNextAction: "Inject an approved transport only after explicit approval, or keep the adapter in manual-action mode.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { provider },
    });
  }

  if (normalized.includes("allownetwork") || normalized.includes("network gate")) {
    blockers.push({
      category: "policy",
      key: "policy.integration.network_gate_disabled",
      message: "Integration network gate is disabled by policy.",
      recommendedNextAction: "Set gates.allowNetwork=true only after explicit approval, or keep the adapter in manual-action mode.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { provider },
    });
  }

  if (blockers.length > 0) {
    return blockers;
  }

  if (
    normalized.includes("operation gate") ||
    normalized.includes("allowpushbranch") ||
    normalized.includes("allowcreatepullrequest") ||
    normalized.includes("allowupdatepullrequestbody") ||
    normalized.includes("allowpostqacomment") ||
    normalized.includes("approveproductiondeploy") ||
    normalized.includes("approve production") ||
    normalized.includes("requires approval") ||
    (normalized.includes("production") && normalized.includes("approval"))
  ) {
    return [{
      category: "policy",
      key: "policy.integration.operation_gate_disabled",
      message: "Integration operation gate is disabled by policy.",
      recommendedNextAction: "Keep the adapter in manual-action mode until operation gates are explicitly approved.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { provider },
    }];
  }

  return [{
    category: "execution",
    key: "execution.integration.manual_action",
    message: manualAction,
    recommendedNextAction: "Inspect the integration adapter output before retrying.",
    severity: "manual_action",
    blocks: ["execute"],
    source: "integration",
    details: { provider },
  }];
}

function sanitizeIntegrationBlockers(blockers: IntegrationReadinessBlocker[], env: IntegrationEnv): IntegrationReadinessBlocker[] {
  return blockers.map((blocker) => {
    const details = sanitizeBlockerDetails(blocker.details, env);
    const sanitized: IntegrationReadinessBlocker = {
      ...blocker,
      blocks: ["execute"],
      source: "integration",
    };

    if (details) {
      sanitized.details = details;
    } else {
      delete sanitized.details;
    }

    return sanitized;
  });
}

function sanitizeBlockerDetails(details: Record<string, unknown> | undefined, env: IntegrationEnv): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const sanitized = sanitizeBlockerDetailValue(details, env);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return undefined;
  return sanitized as Record<string, unknown>;
}

function sanitizeBlockerDetailValue(value: unknown, env: IntegrationEnv): unknown {
  const redacted = redactValue(value, env);

  if (Array.isArray(redacted)) {
    return redacted.map((entry) => sanitizeBlockerDetailValue(entry, env));
  }

  if (redacted && typeof redacted === "object") {
    return Object.fromEntries(
      Object.entries(redacted as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [
          key,
          isUnsafeBlockerDetailName(key) ? REDACTED : sanitizeBlockerDetailValue(entry, env),
        ]),
    );
  }

  return redacted;
}

function isUnsafeBlockerDetailName(name: string): boolean {
  const normalized = name.replace(/[\s_.-]/g, "").toLowerCase();
  return isSecretLikeName(name) || ["jwt", "bearer", "session", "payload", "headers"].some((secretName) => normalized.includes(secretName));
}

function sortIntegrationBlockers(blockers: IntegrationReadinessBlocker[]): IntegrationReadinessBlocker[] {
  const severityOrder: Record<IntegrationReadinessBlocker["severity"], number> = {
    blocking: 0,
    manual_action: 1,
    warning: 2,
    info: 3,
  };
  const categoryOrder: Record<IntegrationReadinessBlocker["category"], number> = {
    queue_acceptance: 0,
    approval: 1,
    configuration: 2,
    policy: 3,
    execution: 4,
    safety: 5,
  };

  return [...blockers].sort((left, right) => {
    const severityDelta = severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDelta !== 0) return severityDelta;

    const queueDelta = queueBlockRank(left) - queueBlockRank(right);
    if (queueDelta !== 0) return queueDelta;

    const categoryDelta = categoryOrder[left.category] - categoryOrder[right.category];
    if (categoryDelta !== 0) return categoryDelta;

    return left.key.localeCompare(right.key);
  });
}

function queueBlockRank(blocker: IntegrationReadinessBlocker): number {
  return blocker.blocks.includes("queue") ? 0 : 1;
}

export function buildRealResult<TName extends IntegrationName, TOutputs extends object>(
  integrationDefinition: IntegrationDefinition<TName>,
  input: { env?: IntegrationEnv; now?: string | (() => string) },
  fields: {
    decision: RealIntegrationDecision;
    message: string;
    outputs: TOutputs;
    realNetworkCall?: boolean;
    safeToRun?: boolean;
    logs?: string[];
    errors?: string[];
    blockers?: IntegrationReadinessBlocker[];
  },
): IntegrationRealResult<TName, TOutputs> {
  const env = input.env ?? {};
  const createdAt = resolveNow(input.now);
  const missingEnv = getMissingEnv(integrationDefinition, env);
  const configured = missingEnv.length === 0;
  const realEnabled = isRealEnabled(integrationDefinition, env);
  const safeToRun = fields.safeToRun ?? fields.decision === "succeeded";
  const realNetworkCall = fields.realNetworkCall ?? false;
  let blockers = sanitizeIntegrationBlockers(fields.blockers ?? integrationBlockersFromResult({
    integrationName: integrationDefinition.name,
    decision: fields.decision,
    message: fields.message,
    missingEnv,
    outputs: fields.outputs,
    safeToRun,
  }), env);
  if ((fields.decision !== "succeeded" || safeToRun === false) && blockers.length === 0) {
    blockers = sanitizeIntegrationBlockers([unclassifiedIntegrationBlocker(integrationDefinition.name, fields.message)], env);
  }
  blockers = sortIntegrationBlockers(blockers);
  const status: IntegrationRealStatus<TName> = {
    name: integrationDefinition.name,
    externalName: integrationDefinition.externalName,
    mode: "real",
    enabled: true,
    configured,
    healthy: fields.decision === "succeeded",
    realEnabled,
    realNetworkCall,
    safeToRun,
    requiredEnv: [...integrationDefinition.requiredEnv],
    missingEnv,
    lastCheckedAt: createdAt,
    message: fields.message,
  };
  const result: IntegrationRealResult<TName, TOutputs> = {
    name: integrationDefinition.name,
    externalName: integrationDefinition.externalName,
    mode: "real",
    realEnabled,
    realNetworkCall,
    configured,
    missingEnv,
    safeToRun,
    blockers,
    message: fields.message,
    decision: fields.decision,
    status,
    outputs: fields.outputs,
    logs: fields.logs ?? [],
    errors: fields.errors ?? [],
    createdAt,
  };

  return redactValue(result, env);
}

export function disabledRealResult<TName extends IntegrationName, TOutputs extends object>(
  integrationDefinition: IntegrationDefinition<TName>,
  input: { env?: IntegrationEnv; now?: string | (() => string) },
  outputs: TOutputs,
): IntegrationRealResult<TName, TOutputs> {
  return buildRealResult(integrationDefinition, input, {
    decision: "manual_action",
    message: `Manual action required: ${integrationDefinition.externalName} real mode is disabled or not fully configured; no network call was made.`,
    outputs,
    safeToRun: false,
  });
}

export function missingTransportResult<TName extends IntegrationName, TOutputs extends object>(
  integrationDefinition: IntegrationDefinition<TName>,
  input: { env?: IntegrationEnv; now?: string | (() => string) },
  outputs: TOutputs,
): IntegrationRealResult<TName, TOutputs> {
  return buildRealResult(integrationDefinition, input, {
    decision: "manual_action",
    message: `Manual action required: ${integrationDefinition.externalName} real mode needs an injected transport and allowNetwork gate; no network call was made.`,
    outputs,
    safeToRun: false,
  });
}

export function responseMessage(response: IntegrationTransportResponse): string {
  if (response.json && typeof response.json === "object" && "message" in response.json) {
    const value = (response.json as { message?: unknown }).message;
    if (typeof value === "string") {
      return value;
    }
  }

  if (typeof response.text === "string" && response.text.trim()) {
    return response.text;
  }

  return `HTTP ${response.status}`;
}

export function isSuccessResponse(response: IntegrationTransportResponse): boolean {
  return response.ok === true || (response.status >= 200 && response.status < 300);
}

export function failureDecision(response: IntegrationTransportResponse): "failed" | "degraded" {
  return response.status >= 500 ? "degraded" : "failed";
}

export function failureMessage(provider: string, response: IntegrationTransportResponse): string {
  if (response.status === 401) {
    return `${provider} authentication failed: ${responseMessage(response)}`;
  }

  if (response.status === 403) {
    return `${provider} permission denied: ${responseMessage(response)}`;
  }

  if (response.status >= 500) {
    return `${provider} provider unavailable: ${responseMessage(response)}`;
  }

  return `${provider} request failed: ${responseMessage(response)}`;
}

export function thrownErrorMessage(provider: string, error: unknown): string {
  return `${provider} network unavailable: ${error instanceof Error ? error.message : String(error)}`;
}

function missionValue(mission: MissionIntegrationInput | undefined, key: keyof MissionIntegrationInput, fallback: string): string {
  const value = mission?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function protectedBranch(branchName: string): boolean {
  return ["main", "master"].includes(branchName.trim().toLowerCase());
}

function jsonField(value: unknown, field: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[field] : undefined;
}

function safeText(value: string, env: IntegrationEnv): string {
  return redactText(value, env);
}

function outputs(mission: MissionIntegrationInput | undefined, requests: SafeRequestSummary[] = [], manualActions: string[] = []): GitHubRealOutputs {
  return {
    branchName: missionValue(mission, "branchName", `psf/${mission?.missionId ?? "real-mode"}`),
    baseBranch: "main",
    requests,
    manualActions,
  };
}

export async function runGitHubReal(input: GitHubRealInput = {}): Promise<GitHubRealResult> {
  const env = input.env ?? {};
  const realEnabled = isRealEnabled(definition, env);
  const missingEnv = getMissingEnv(definition, env);
  const requests: SafeRequestSummary[] = [];
  const manualActions: string[] = [];
  const branchName = missionValue(input.mission, "branchName", `psf/${input.mission?.missionId ?? "real-mode"}`);
  const baseBranch = input.baseBranch ?? "main";
  const initialOutputs = { ...outputs(input.mission, requests, manualActions), branchName, baseBranch };

  if (!realEnabled || missingEnv.length > 0) {
    manualActions.push("Enable ENABLE_REAL_GITHUB=1 and configure GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.");
    return disabledRealResult(definition, input, initialOutputs);
  }

  if (!input.transport || input.gates?.allowNetwork !== true) {
    if (!input.transport) {
      manualActions.push("Inject a transport before any GitHub request.");
    }
    if (input.gates?.allowNetwork !== true) {
      manualActions.push("Set gates.allowNetwork=true before any GitHub request.");
    }
    return missingTransportResult(definition, input, initialOutputs);
  }

  const usesBranchNameAsSource = input.gates.allowPushBranch === true || input.gates.allowCreatePullRequest === true;
  if (usesBranchNameAsSource && protectedBranch(branchName)) {
    manualActions.push("Choose a non-protected branch; main/master are refused by the real adapter.");
    return buildRealResult(definition, input, {
      decision: "manual_action",
      message: "Manual action required: refusing to push or open a PR from protected branch main/master.",
      outputs: initialOutputs,
      safeToRun: false,
    });
  }

  if (input.gates.allowPushBranch !== true && input.gates.allowCreatePullRequest !== true) {
    manualActions.push("Set an explicit GitHub operation gate such as allowPushBranch or allowCreatePullRequest.");
    return missingTransportResult(definition, input, initialOutputs);
  }

  const owner = env.GITHUB_OWNER as string;
  const repo = env.GITHUB_REPO as string;
  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
  };
  const request = async (method: IntegrationTransportMethod, url: string, body?: unknown): Promise<IntegrationTransportResponse> => {
    requests.push({ method, url });
    return input.transport!({ method, url, headers, body, timeoutMs: input.timeoutMs });
  };

  try {
    if (input.gates.allowPushBranch === true) {
      const pushResponse = await request("POST", `https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${branchName}`,
        sha: input.sourceSha ?? "HEAD",
      });
      if (!isSuccessResponse(pushResponse)) {
        return buildRealResult(definition, input, {
          decision: failureDecision(pushResponse),
          message: failureMessage("GitHub", pushResponse),
          outputs: initialOutputs,
          realNetworkCall: true,
          safeToRun: false,
          errors: [failureMessage("GitHub", pushResponse)],
        });
      }
    }

    let pullRequestNumber: number | undefined;
    let pullRequestUrl: string | undefined;
    if (input.gates.allowCreatePullRequest === true) {
      const prBody = safeText(buildGitHubPullRequestBody(input.mission), env);
      const prResponse = await request("POST", `https://api.github.com/repos/${owner}/${repo}/pulls`, {
        title: safeText(`完成 ${missionValue(input.mission, "missionTitle", "Mission")}`, env),
        body: prBody,
        base: baseBranch,
        head: branchName,
      });
      if (!isSuccessResponse(prResponse)) {
        return buildRealResult(definition, input, {
          decision: failureDecision(prResponse),
          message: failureMessage("GitHub", prResponse),
          outputs: initialOutputs,
          realNetworkCall: true,
          safeToRun: false,
          errors: [failureMessage("GitHub", prResponse)],
        });
      }
      const numberValue = jsonField(prResponse.json, "number");
      pullRequestNumber = typeof numberValue === "number" ? numberValue : undefined;
      const urlValue = jsonField(prResponse.json, "html_url");
      pullRequestUrl = typeof urlValue === "string" ? urlValue : undefined;
    }

    if (input.gates.allowUpdatePullRequestBody === true && pullRequestNumber !== undefined) {
      const updateResponse = await request("PATCH", `https://api.github.com/repos/${owner}/${repo}/pulls/${pullRequestNumber}`, {
        body: safeText(buildGitHubPullRequestBody(input.mission), env),
      });
      if (!isSuccessResponse(updateResponse)) {
        return buildRealResult(definition, input, {
          decision: failureDecision(updateResponse),
          message: failureMessage("GitHub", updateResponse),
          outputs: { ...initialOutputs, pullRequestNumber, pullRequestUrl },
          realNetworkCall: true,
          safeToRun: false,
          errors: [failureMessage("GitHub", updateResponse)],
        });
      }
    }

    let qaCommentUrl: string | undefined;
    if (input.gates.allowPostQaComment === true && pullRequestNumber !== undefined) {
      const commentResponse = await request("POST", `https://api.github.com/repos/${owner}/${repo}/issues/${pullRequestNumber}/comments`, {
        body: safeText(input.qaComment ?? input.mission?.qaReport ?? "QA completed.", env),
      });
      if (!isSuccessResponse(commentResponse)) {
        return buildRealResult(definition, input, {
          decision: failureDecision(commentResponse),
          message: failureMessage("GitHub", commentResponse),
          outputs: { ...initialOutputs, pullRequestNumber, pullRequestUrl },
          realNetworkCall: true,
          safeToRun: false,
          errors: [failureMessage("GitHub", commentResponse)],
        });
      }
      const commentUrlValue = jsonField(commentResponse.json, "html_url");
      qaCommentUrl = typeof commentUrlValue === "string" ? commentUrlValue : undefined;
    }

    return buildRealResult(definition, input, {
      decision: "succeeded",
      message: "GitHub real adapter completed through injected transport.",
      outputs: { ...initialOutputs, requests, pullRequestNumber, pullRequestUrl, qaCommentUrl },
      realNetworkCall: requests.length > 0,
      safeToRun: true,
    });
  } catch (error) {
    const message = thrownErrorMessage("GitHub", error);
    return buildRealResult(definition, input, {
      decision: "degraded",
      message,
      outputs: initialOutputs,
      realNetworkCall: requests.length > 0,
      safeToRun: false,
      errors: [message],
    });
  }
}
