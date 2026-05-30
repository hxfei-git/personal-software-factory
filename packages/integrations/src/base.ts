import { redactValue } from "./redaction.js";
import type {
  ExternalIntegrationName,
  IntegrationDefinition,
  IntegrationDryRunResult,
  IntegrationEnv,
  IntegrationMode,
  IntegrationName,
  IntegrationRuntimeOptions,
  IntegrationStatus,
} from "./types.js";

export const INTEGRATION_DEFINITIONS: Record<IntegrationName, IntegrationDefinition> = {
  github: {
    name: "github",
    externalName: "github",
    requiredEnv: ["GITHUB_TOKEN"],
    enableRealEnv: "ENABLE_REAL_GITHUB",
  },
  coolify: {
    name: "coolify",
    externalName: "coolify",
    requiredEnv: ["COOLIFY_API_URL", "COOLIFY_TOKEN"],
    enableRealEnv: "ENABLE_REAL_COOLIFY",
  },
  uptime_kuma: {
    name: "uptime_kuma",
    externalName: "uptime-kuma",
    requiredEnv: ["UPTIME_KUMA_URL", "UPTIME_KUMA_USERNAME", "UPTIME_KUMA_PASSWORD"],
    enableRealEnv: "ENABLE_REAL_UPTIME_KUMA",
  },
  plane: {
    name: "plane",
    externalName: "plane",
    requiredEnv: ["PLANE_API_URL", "PLANE_TOKEN", "PLANE_WORKSPACE_SLUG", "PLANE_PROJECT_ID"],
    enableRealEnv: "ENABLE_REAL_PLANE",
  },
};

export const INTEGRATION_ORDER: IntegrationName[] = ["github", "coolify", "uptime_kuma", "plane"];

export function normalizeIntegrationName(name: ExternalIntegrationName): IntegrationName {
  return name === "uptime-kuma" ? "uptime_kuma" : name;
}

export function resolveNow(now: IntegrationRuntimeOptions["now"]): string {
  if (typeof now === "function") {
    return now();
  }

  return now ?? new Date().toISOString();
}

export function resolveMode(mode: IntegrationRuntimeOptions["mode"]): IntegrationMode {
  return mode ?? "dry-run";
}

export function getMissingEnv(definition: IntegrationDefinition, env: IntegrationEnv = {}): string[] {
  return definition.requiredEnv.filter((name) => !env[name]?.trim());
}

export function isRealEnabled(definition: IntegrationDefinition, env: IntegrationEnv = {}): boolean {
  return env[definition.enableRealEnv] === "1";
}

export function buildIntegrationStatus(
  definition: IntegrationDefinition,
  options: IntegrationRuntimeOptions = {},
): IntegrationStatus {
  const env = options.env ?? {};
  const missingEnv = getMissingEnv(definition, env);
  const configured = missingEnv.length === 0;
  const realEnabled = isRealEnabled(definition, env);
  const mode = resolveMode(options.mode);

  return {
    name: definition.name,
    externalName: definition.externalName,
    mode,
    enabled: true,
    configured,
    healthy: configured,
    realEnabled,
    realNetworkCall: false,
    safeToRun: true,
    requiredEnv: [...definition.requiredEnv],
    missingEnv,
    lastCheckedAt: resolveNow(options.now),
    message: configured
      ? `${definition.externalName} is configured for ${mode}; real network calls are disabled.`
      : `${definition.externalName} is not fully configured; dry-run remains safe and local.`,
  };
}

export function buildDryRunResult(
  definition: IntegrationDefinition,
  options: IntegrationRuntimeOptions & { message: string; outputs: Record<string, unknown> },
): IntegrationDryRunResult {
  const createdAt = resolveNow(options.now);
  const status = buildIntegrationStatus(definition, { env: options.env ?? {}, now: createdAt, mode: options.mode ?? "dry-run" });
  const outputs = redactValue(options.outputs, options.env);

  return {
    name: definition.name,
    externalName: definition.externalName,
    mode: status.mode,
    realEnabled: status.realEnabled,
    realNetworkCall: false,
    configured: status.configured,
    missingEnv: [...status.missingEnv],
    safeToRun: true,
    message: options.message,
    status,
    outputs,
    createdAt,
  };
}

export function formatList(items: readonly string[] | undefined, fallback: string): string {
  if (!items?.length) {
    return `- ${fallback}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}
