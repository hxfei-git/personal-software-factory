import { INTEGRATION_DEFINITIONS, getMissingEnv, isRealEnabled } from "./base.js";
import { redactText } from "./redaction.js";
import type { IntegrationEnv, UptimeKumaMonitorInput } from "./types.js";
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

const definition = INTEGRATION_DEFINITIONS.uptime_kuma;

export interface UptimeKumaRealGates {
  allowNetwork?: boolean;
}

export interface UptimeKumaRealInput {
  env?: IntegrationEnv;
  now?: string | (() => string);
  monitor?: UptimeKumaMonitorInput;
  transport?: IntegrationTransport;
  gates?: UptimeKumaRealGates;
  timeoutMs?: number;
}

export interface UptimeKumaRealOutputs {
  monitorName: string;
  monitorUrl: string;
  monitorId?: string | undefined;
  monitorStatus?: string | undefined;
  downEvent?: boolean | undefined;
  requests: SafeRequestSummary[];
  manualActions: string[];
}

export type UptimeKumaRealResult = IntegrationRealResult<"uptime_kuma", UptimeKumaRealOutputs>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function jsonField(value: unknown, field: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[field] : undefined;
}

function target(monitor: UptimeKumaMonitorInput | undefined): { name: string; url: string } {
  const project = monitor?.project ?? "unknown-project";
  const url = monitor?.stagingUrl || monitor?.productionUrl || "https://example.invalid";
  const environment = monitor?.stagingUrl ? "staging" : monitor?.productionUrl ? "production" : "placeholder";
  return { name: `${project}-${environment}`, url };
}

function providerFailure(response: IntegrationTransportResponse): "failed" | "degraded" {
  return response.status >= 500 ? "degraded" : failureDecision(response);
}

function sessionRedactionEnv(env: IntegrationEnv, sessionToken: string | undefined): IntegrationEnv {
  return sessionToken ? { ...env, UPTIME_KUMA_SESSION_TOKEN: sessionToken } : env;
}

function redactSessionText(value: string, env: IntegrationEnv, sessionToken: string | undefined): string {
  return redactText(value, sessionRedactionEnv(env, sessionToken));
}

export async function runUptimeKumaReal(input: UptimeKumaRealInput = {}): Promise<UptimeKumaRealResult> {
  const env = input.env ?? {};
  const requests: SafeRequestSummary[] = [];
  const manualActions: string[] = [];
  const monitorTarget = target(input.monitor);
  const outputs: UptimeKumaRealOutputs = { monitorName: monitorTarget.name, monitorUrl: monitorTarget.url, requests, manualActions };
  const realEnabled = isRealEnabled(definition, env);
  const missingEnv = getMissingEnv(definition, env);

  if (!realEnabled || missingEnv.length > 0) {
    manualActions.push("Enable ENABLE_REAL_UPTIME_KUMA=1 and configure Uptime Kuma credentials.");
    return disabledRealResult(definition, input, outputs);
  }

  if (!input.transport || input.gates?.allowNetwork !== true) {
    manualActions.push("Inject a transport and set gates.allowNetwork=true before any Uptime Kuma request.");
    return missingTransportResult(definition, input, outputs);
  }

  const baseUrl = trimTrailingSlash(env.UPTIME_KUMA_BASE_URL as string);
  let sessionToken: string | undefined;
  const request = async (method: IntegrationTransportMethod, url: string, body?: unknown): Promise<IntegrationTransportResponse> => {
    requests.push({ method, url });
    const headers = sessionToken ? { authorization: `Bearer ${sessionToken}`, accept: "application/json" } : { accept: "application/json" };
    return input.transport!({ method, url, headers, body, timeoutMs: input.timeoutMs });
  };

  try {
    const loginResponse = await request("POST", `${baseUrl}/api/login`, {
      username: env.UPTIME_KUMA_USERNAME,
      password: env.UPTIME_KUMA_PASSWORD,
    });
    if (!isSuccessResponse(loginResponse)) {
      const message = failureMessage("Uptime Kuma", loginResponse);
      return buildRealResult(definition, input, {
        decision: providerFailure(loginResponse),
        message,
        outputs,
        realNetworkCall: true,
        safeToRun: false,
        errors: [message],
      });
    }

    const tokenValue = jsonField(loginResponse.json, "token");
    sessionToken = typeof tokenValue === "string" ? tokenValue : undefined;
    const monitorResponse = await request("POST", `${baseUrl}/api/monitor`, {
      name: monitorTarget.name,
      type: "http",
      url: monitorTarget.url,
      interval: 60,
      retryInterval: 30,
    });
    if (!isSuccessResponse(monitorResponse)) {
      const message = redactSessionText(failureMessage("Uptime Kuma", monitorResponse), env, sessionToken);
      return buildRealResult(definition, input, {
        decision: providerFailure(monitorResponse),
        message,
        outputs,
        realNetworkCall: true,
        safeToRun: false,
        errors: [message],
      });
    }

    const idValue = jsonField(monitorResponse.json, "monitorID") ?? jsonField(monitorResponse.json, "id");
    const monitorId = String(idValue ?? "unknown-monitor");
    const statusResponse = await request("GET", `${baseUrl}/api/monitor/${monitorId}/status`);
    if (!isSuccessResponse(statusResponse)) {
      const message = redactSessionText(failureMessage("Uptime Kuma", statusResponse), env, sessionToken);
      return buildRealResult(definition, input, {
        decision: providerFailure(statusResponse),
        message,
        outputs: { ...outputs, monitorId },
        realNetworkCall: true,
        safeToRun: false,
        errors: [message],
      });
    }

    const statusValue = jsonField(statusResponse.json, "status");
    const downValue = jsonField(statusResponse.json, "down");
    return buildRealResult(definition, input, {
      decision: "succeeded",
      message: "Uptime Kuma real adapter created monitor and fetched status through injected transport.",
      outputs: {
        ...outputs,
        monitorId,
        monitorStatus: typeof statusValue === "string" ? statusValue : "unknown",
        downEvent: downValue === true || statusValue === "down",
      },
      realNetworkCall: true,
      safeToRun: true,
    });
  } catch (error) {
    const message = redactSessionText(thrownErrorMessage("Uptime Kuma", error), env, sessionToken);
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
