import { INTEGRATION_DEFINITIONS, getMissingEnv, isRealEnabled } from "./base.js";
import type { CoolifyDeploymentInput, IntegrationEnv } from "./types.js";
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

const definition = INTEGRATION_DEFINITIONS.coolify;

export interface CoolifyRealGates {
  allowNetwork?: boolean;
  approveProductionDeploy?: boolean;
}

export interface CoolifyRealInput {
  env?: IntegrationEnv;
  now?: string | (() => string);
  deployment?: CoolifyDeploymentInput;
  transport?: IntegrationTransport;
  gates?: CoolifyRealGates;
  timeoutMs?: number;
}

export interface CoolifyRealOutputs {
  project: string;
  environment: "staging" | "production";
  deploymentId?: string | undefined;
  deploymentStatus?: string | undefined;
  stagingUrl?: string | undefined;
  productionUrl?: string | undefined;
  requests: SafeRequestSummary[];
  manualActions: string[];
}

export type CoolifyRealResult = IntegrationRealResult<"coolify", CoolifyRealOutputs>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function jsonField(value: unknown, field: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[field] : undefined;
}

function baseOutputs(deployment: CoolifyDeploymentInput | undefined, requests: SafeRequestSummary[], manualActions: string[]): CoolifyRealOutputs {
  return {
    project: deployment?.project ?? "unknown-project",
    environment: deployment?.environment ?? "staging",
    stagingUrl: deployment?.stagingUrl,
    productionUrl: deployment?.productionUrl,
    requests,
    manualActions,
  };
}

function idFrom(response: IntegrationTransportResponse): string | undefined {
  for (const key of ["id", "deployment_uuid", "uuid"]) {
    const value = jsonField(response.json, key);
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

export async function runCoolifyReal(input: CoolifyRealInput = {}): Promise<CoolifyRealResult> {
  const env = input.env ?? {};
  const requests: SafeRequestSummary[] = [];
  const manualActions: string[] = [];
  const outputs = baseOutputs(input.deployment, requests, manualActions);
  const realEnabled = isRealEnabled(definition, env);
  const missingEnv = getMissingEnv(definition, env);

  if (!realEnabled || missingEnv.length > 0) {
    manualActions.push("Enable ENABLE_REAL_COOLIFY=1 and configure COOLIFY_BASE_URL and COOLIFY_TOKEN.");
    return disabledRealResult(definition, input, outputs);
  }

  if (outputs.environment === "production" && input.gates?.approveProductionDeploy !== true) {
    manualActions.push("Approve production deployment before running the Coolify real adapter.");
    return buildRealResult(definition, input, {
      decision: "manual_action",
      message: "Manual action required: Production deployment requires approval; no deployment API was called.",
      outputs,
      safeToRun: false,
    });
  }

  if (!input.transport || input.gates?.allowNetwork !== true) {
    if (!input.transport) {
      manualActions.push("Inject a transport before any Coolify request.");
    }
    if (input.gates?.allowNetwork !== true) {
      manualActions.push("Set gates.allowNetwork=true before any Coolify request.");
    }
    return missingTransportResult(definition, input, outputs);
  }

  const baseUrl = trimTrailingSlash(env.COOLIFY_BASE_URL as string);
  const headers = { authorization: `Bearer ${env.COOLIFY_TOKEN}`, accept: "application/json" };
  const request = async (method: IntegrationTransportMethod, url: string, body?: unknown): Promise<IntegrationTransportResponse> => {
    requests.push({ method, url });
    return input.transport!({ method, url, headers, body, timeoutMs: input.timeoutMs });
  };

  try {
    const deployResponse = await request("POST", `${baseUrl}/api/v1/deployments`, {
      project: outputs.project,
      environment: outputs.environment,
      targetUrl: outputs.environment === "production" ? outputs.productionUrl : outputs.stagingUrl,
    });
    if (!isSuccessResponse(deployResponse)) {
      const message = failureMessage("Coolify", deployResponse);
      return buildRealResult(definition, input, {
        decision: failureDecision(deployResponse),
        message,
        outputs,
        realNetworkCall: true,
        safeToRun: false,
        errors: [message],
      });
    }

    const deploymentId = idFrom(deployResponse) ?? "unknown-deployment";
    const statusResponse = await request("GET", `${baseUrl}/api/v1/deployments/${deploymentId}`);
    if (!isSuccessResponse(statusResponse)) {
      const message = failureMessage("Coolify", statusResponse);
      return buildRealResult(definition, input, {
        decision: failureDecision(statusResponse),
        message,
        outputs: { ...outputs, deploymentId },
        realNetworkCall: true,
        safeToRun: false,
        errors: [message],
      });
    }

    const statusValue = jsonField(statusResponse.json, "status");
    const urlValue = jsonField(statusResponse.json, "deployment_url") ?? jsonField(deployResponse.json, "url");
    return buildRealResult(definition, input, {
      decision: "succeeded",
      message: "Coolify real adapter completed staging deployment request through injected transport.",
      outputs: {
        ...outputs,
        deploymentId,
        deploymentStatus: typeof statusValue === "string" ? statusValue : "unknown",
        stagingUrl: outputs.environment === "staging" && typeof urlValue === "string" ? urlValue : outputs.stagingUrl,
        productionUrl: outputs.environment === "production" && typeof urlValue === "string" ? urlValue : outputs.productionUrl,
      },
      realNetworkCall: true,
      safeToRun: true,
    });
  } catch (error) {
    const message = thrownErrorMessage("Coolify", error);
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
