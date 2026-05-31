import { INTEGRATION_DEFINITIONS, formatList, getMissingEnv, isRealEnabled } from "./base.js";
import { redactText, redactValue } from "./redaction.js";
import type { BugReportInput, IntegrationEnv, MissionIntegrationInput } from "./types.js";
import {
  buildRealResult,
  disabledRealResult,
  failureDecision,
  failureMessage,
  isSuccessResponse,
  missingTransportResult,
  thrownErrorMessage,
  type IntegrationRealResult,
  type IntegrationTransport,
  type IntegrationTransportMethod,
  type IntegrationTransportResponse,
  type SafeRequestSummary,
} from "./github-real.js";

const definition = INTEGRATION_DEFINITIONS.plane;

export interface PlaneRealGates {
  allowNetwork?: boolean;
}

export interface PlaneRealInput {
  env?: IntegrationEnv;
  now?: string | (() => string);
  mission?: MissionIntegrationInput;
  bugs?: BugReportInput[];
  transport?: IntegrationTransport;
  gates?: PlaneRealGates;
  timeoutMs?: number;
}

export interface PlaneRealOutputs {
  missionIssueId?: string | undefined;
  missionIssueUrl?: string | undefined;
  bugIssueIds: string[];
  bugIssueUrls: string[];
  statusMapping: Record<string, string>;
  requests: SafeRequestSummary[];
  manualActions: string[];
}

export type PlaneRealResult = IntegrationRealResult<"plane", PlaneRealOutputs>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function jsonField(value: unknown, field: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[field] : undefined;
}

function missionTitle(mission: MissionIntegrationInput | undefined): string {
  return mission?.missionTitle?.trim() || mission?.missionId?.trim() || "Mission real mode";
}

function bugSteps(bug: BugReportInput): string[] {
  return bug.reproductionSteps ?? bug.reproduction_steps ?? [];
}

function bugExpected(bug: BugReportInput): string {
  return bug.expectedResult ?? bug.expected_result ?? "未提供 expected result。";
}

function bugActual(bug: BugReportInput): string {
  return bug.actualResult ?? bug.actual_result ?? "未提供 actual result。";
}

function evidenceSummary(bug: BugReportInput, env: IntegrationEnv): string {
  if (bug.evidence === undefined) {
    return "未提供 evidence。";
  }

  const scrubbedEvidence = redactValue(bug.evidence, env);
  if (typeof scrubbedEvidence === "string") {
    return redactText(scrubbedEvidence, env);
  }

  try {
    return redactText(JSON.stringify(scrubbedEvidence, null, 2), env);
  } catch {
    return "Evidence could not be serialized.";
  }
}

function missionDescription(mission: MissionIntegrationInput | undefined, env: IntegrationEnv): string {
  return redactText([
    mission?.missionSummary ?? "未提供 Mission 摘要。",
    "",
    "验收标准:",
    formatList(mission?.acceptanceCriteria, "未提供验收标准。"),
  ].join("\n"), env);
}

function bugDescription(bug: BugReportInput, env: IntegrationEnv): string {
  return redactText([
    "复现步骤:",
    formatList(bugSteps(bug), "未提供复现步骤。"),
    "",
    `Expected: ${bugExpected(bug)}`,
    `Actual: ${bugActual(bug)}`,
    "",
    "Evidence:",
    evidenceSummary(bug, env),
  ].join("\n"), env);
}

function issueUrl(baseUrl: string, response: IntegrationTransportResponse, id: string): string {
  const urlValue = jsonField(response.json, "url") ?? jsonField(response.json, "html_url");
  return typeof urlValue === "string" ? urlValue : `${baseUrl}/issues/${id}`;
}

function issueId(response: IntegrationTransportResponse, fallback: string): string {
  const value = jsonField(response.json, "id") ?? jsonField(response.json, "identifier");
  return typeof value === "string" && value.trim() ? value : fallback;
}

export async function runPlaneReal(input: PlaneRealInput = {}): Promise<PlaneRealResult> {
  const env = input.env ?? {};
  const bugs = input.bugs ?? [];
  const requests: SafeRequestSummary[] = [];
  const manualActions: string[] = [];
  const outputs: PlaneRealOutputs = {
    bugIssueIds: [],
    bugIssueUrls: [],
    statusMapping: { mission: "ready_for_review", bug: "open" },
    requests,
    manualActions,
  };
  const realEnabled = isRealEnabled(definition, env);
  const missingEnv = getMissingEnv(definition, env);

  if (!realEnabled || missingEnv.length > 0) {
    manualActions.push("Enable ENABLE_REAL_PLANE=1 and configure Plane API env vars.");
    return disabledRealResult(definition, input, outputs);
  }

  if (!input.transport || input.gates?.allowNetwork !== true) {
    manualActions.push("Inject a transport and set gates.allowNetwork=true before any Plane request.");
    return missingTransportResult(definition, input, outputs);
  }

  const baseUrl = trimTrailingSlash(env.PLANE_BASE_URL as string);
  const workspaceId = env.PLANE_WORKSPACE_ID as string;
  const projectId = env.PLANE_PROJECT_ID as string;
  const apiBase = `${baseUrl}/api/v1/workspaces/${workspaceId}/projects/${projectId}/issues`;
  const headers = { authorization: `Bearer ${env.PLANE_API_TOKEN}`, accept: "application/json" };
  const request = async (method: IntegrationTransportMethod, url: string, body?: unknown): Promise<IntegrationTransportResponse> => {
    requests.push({ method, url });
    return input.transport!({ method, url, headers, body, timeoutMs: input.timeoutMs });
  };

  try {
    const missionResponse = await request("POST", apiBase, {
      name: redactText(`[Mission] ${missionTitle(input.mission)}`, env),
      description: missionDescription(input.mission, env),
      external_id: input.mission?.missionId,
    });
    if (!isSuccessResponse(missionResponse)) {
      const message = failureMessage("Plane", missionResponse);
      return buildRealResult(definition, input, {
        decision: failureDecision(missionResponse),
        message,
        outputs,
        realNetworkCall: true,
        safeToRun: false,
        errors: [message],
      });
    }

    const missionIssueId = issueId(missionResponse, "mission-issue");
    const missionIssueUrl = issueUrl(baseUrl, missionResponse, missionIssueId);
    const missionUpdate = await request("PATCH", `${apiBase}/${missionIssueId}`, { state: outputs.statusMapping.mission });
    if (!isSuccessResponse(missionUpdate)) {
      const message = failureMessage("Plane", missionUpdate);
      return buildRealResult(definition, input, {
        decision: failureDecision(missionUpdate),
        message,
        outputs: { ...outputs, missionIssueId, missionIssueUrl },
        realNetworkCall: true,
        safeToRun: false,
        errors: [message],
      });
    }

    for (const [index, bug] of bugs.entries()) {
      const bugResponse = await request("POST", apiBase, {
        name: redactText(`[Bug] ${bug.title ?? "未命名 Bug"}`, env),
        description: bugDescription(bug, env),
        external_id: bug.id,
        priority: bug.severity ?? "unknown",
      });
      if (!isSuccessResponse(bugResponse)) {
        const message = failureMessage("Plane", bugResponse);
        return buildRealResult(definition, input, {
          decision: failureDecision(bugResponse),
          message,
          outputs: { ...outputs, missionIssueId, missionIssueUrl },
          realNetworkCall: true,
          safeToRun: false,
          errors: [message],
        });
      }

      const bugIssueId = issueId(bugResponse, `bug-${index + 1}`);
      const bugIssueUrl = issueUrl(baseUrl, bugResponse, bugIssueId);
      outputs.bugIssueIds.push(bugIssueId);
      outputs.bugIssueUrls.push(bugIssueUrl);
      const bugUpdate = await request("PATCH", `${apiBase}/${bugIssueId}`, { state: outputs.statusMapping.bug });
      if (!isSuccessResponse(bugUpdate)) {
        const message = failureMessage("Plane", bugUpdate);
        return buildRealResult(definition, input, {
          decision: failureDecision(bugUpdate),
          message,
          outputs: { ...outputs, missionIssueId, missionIssueUrl },
          realNetworkCall: true,
          safeToRun: false,
          errors: [message],
        });
      }
    }

    return buildRealResult(definition, input, {
      decision: "succeeded",
      message: "Plane real adapter created and updated issues through injected transport.",
      outputs: { ...outputs, missionIssueId, missionIssueUrl },
      realNetworkCall: true,
      safeToRun: true,
    });
  } catch (error) {
    const message = thrownErrorMessage("Plane", error);
    return buildRealResult(definition, input, {
      decision: "degraded",
      message,
      outputs,
      realNetworkCall: requests.length > 0,
      safeToRun: false,
      errors: [message],
    });
  }
}
