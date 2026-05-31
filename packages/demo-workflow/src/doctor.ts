import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { listIntegrationStatuses } from "@psf/integrations";
import { findProjectById, scanProjectRegistry } from "@psf/project-registry";
import { DEFAULT_DEMO_API_URL, DEFAULT_DEMO_HUB_URL, EXAMPLE_PROJECT_ID } from "./constants.js";
import { relativeToCwd } from "./paths.js";
import type { DoctorCheck, DoctorResult, DoctorStatus } from "./types.js";

export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  json?: boolean;
  checkDatabase?: boolean;
  checkApi?: boolean;
  checkHub?: boolean;
}

const REQUIRED_DIRECTORIES = [
  "projects",
  "packages",
  "apps",
  "apps/hub",
  "apps/orchestrator-api",
  "workers",
  "missions",
] as const;

const REAL_MODE_ENV_NAMES = [
  "ENABLE_REAL_CODEX",
  "ENABLE_REAL_GITHUB",
  "ENABLE_REAL_COOLIFY",
  "ENABLE_REAL_UPTIME_KUMA",
  "ENABLE_REAL_PLANE",
] as const;

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = { ...process.env, ...(options.env ?? {}) };
  const checks: DoctorCheck[] = [];

  checks.push(checkNode());
  checks.push(checkPnpm(env));
  checks.push(...await checkRequiredDirectories(cwd));
  checks.push(...await checkEnvFiles(cwd));
  checks.push(await checkPassport(cwd));
  checks.push(await checkDatabase(options.checkDatabase ?? false));
  checks.push(await checkHttp("api", options.checkApi ?? false, env.PSF_API_URL ?? DEFAULT_DEMO_API_URL));
  checks.push(await checkHttp("hub", options.checkHub ?? false, env.PSF_HUB_URL ?? DEFAULT_DEMO_HUB_URL));
  checks.push(checkIntegrations(env));
  checks.push(...checkRealModeWarnings(env));

  return sanitizeDoctorResult({ status: aggregateStatus(checks), checks });
}

export function formatDoctorResult(result: DoctorResult, json = false): string {
  const safeResult = sanitizeDoctorResult(result);
  if (json) {
    return JSON.stringify(safeResult, null, 2) + "\n";
  }

  const lines = [`PSF doctor: ${safeResult.status}`];
  for (const check of safeResult.checks) {
    lines.push(`${statusLabel(check.status)} ${check.key}: ${check.message}`);
    if (check.details && Object.keys(check.details).length > 0) {
      lines.push(`  details: ${JSON.stringify(check.details)}`);
    }
  }
  return redactSecretText(lines.join("\n")) + "\n";
}

function checkNode(): DoctorCheck {
  return {
    key: "node",
    status: "ok",
    message: `Node ${process.version} is available.`,
  };
}

function checkPnpm(env: NodeJS.ProcessEnv): DoctorCheck {
  const npmExecPath = env.npm_execpath ?? env.NPM_EXEC_PATH;
  const isPnpm = npmExecPath?.includes("pnpm") ?? false;
  return {
    key: "pnpm",
    status: isPnpm ? "ok" : "warning",
    message: isPnpm ? "pnpm appears to be the active package runner." : "pnpm was not detected from npm_execpath; run package checks with pnpm.",
    details: { detected: isPnpm },
  };
}

async function checkRequiredDirectories(cwd: string): Promise<DoctorCheck[]> {
  return Promise.all(REQUIRED_DIRECTORIES.map(async (dir) => {
    const path = join(cwd, dir);
    if (await readable(path)) {
      return { key: `dir-${dir.replaceAll("/", "-")}`, status: "ok", message: `Required directory exists: ${dir}.` } satisfies DoctorCheck;
    }
    return { key: `dir-${dir.replaceAll("/", "-")}`, status: "failed", message: `Required directory is missing: ${dir}.` } satisfies DoctorCheck;
  }));
}

async function checkEnvFiles(cwd: string): Promise<DoctorCheck[]> {
  const envPath = join(cwd, ".env");
  const envExamplePath = join(cwd, ".env.example");
  return [
    await readable(envExamplePath)
      ? { key: "env-example", status: "ok", message: ".env.example is present." }
      : { key: "env-example", status: "failed", message: ".env.example is missing." },
    await readable(envPath)
      ? { key: "env-local", status: "ok", message: ".env is present." }
      : { key: "env-local", status: "warning", message: ".env is not present; local services may need explicit environment variables." },
  ];
}

async function checkPassport(cwd: string): Promise<DoctorCheck> {
  try {
    const projects = await scanProjectRegistry(join(cwd, "projects"));
    const project = findProjectById(projects, EXAMPLE_PROJECT_ID);
    if (!project) {
      return {
        key: "passport",
        status: "failed",
        message: `Project passport for ${EXAMPLE_PROJECT_ID} was not found or did not parse.`,
        details: { projects: projects.map((entry) => entry.project.id) },
      };
    }
    return {
      key: "passport",
      status: "ok",
      message: `Project passport parsed for ${project.project.id}.`,
      details: { passportPath: relativeToCwd(cwd, project.passportPath) },
    };
  } catch (error) {
    return {
      key: "passport",
      status: "failed",
      message: `Project passport parse failed: ${redactSecretText(errorMessage(error))}`,
    };
  }
}

async function checkDatabase(enabled: boolean): Promise<DoctorCheck> {
  if (!enabled) {
    return { key: "database", status: "ok", message: "Database connection check skipped.", details: { checked: false } };
  }

  try {
    const db = await import("@psf/db");
    const prisma = db.prisma as { $connect(): Promise<void>; $disconnect(): Promise<void> };
    await prisma.$connect();
    await prisma.$disconnect();
    return { key: "database", status: "ok", message: "Database connection succeeded.", details: { checked: true } };
  } catch (error) {
    return { key: "database", status: "failed", message: `Database connection failed: ${redactSecretText(errorMessage(error))}`, details: { checked: true } };
  }
}

async function checkHttp(key: "api" | "hub", enabled: boolean, url: string): Promise<DoctorCheck> {
  if (!enabled) {
    return { key, status: "ok", message: `${key.toUpperCase()} HTTP check skipped.`, details: { checked: false } };
  }

  try {
    const response = await fetch(url, { method: "GET" });
    return {
      key,
      status: response.ok ? "ok" : "failed",
      message: response.ok ? `${key.toUpperCase()} responded successfully.` : `${key.toUpperCase()} responded with HTTP ${response.status}.`,
      details: { checked: true, url: redactSecretText(url), status: response.status },
    };
  } catch (error) {
    return { key, status: "failed", message: `${key.toUpperCase()} HTTP check failed: ${redactSecretText(errorMessage(error))}`, details: { checked: true, url: redactSecretText(url) } };
  }
}

function checkIntegrations(env: NodeJS.ProcessEnv): DoctorCheck {
  const statuses = listIntegrationStatuses({ env, mode: "dry-run" });
  const unsafe = statuses.filter((status) => status.realNetworkCall || !status.safeToRun);
  const missing = statuses.filter((status) => status.missingEnv.length > 0);
  return {
    key: "integrations-dry-run",
    status: unsafe.length > 0 ? "failed" : missing.length > 0 ? "warning" : "ok",
    message: unsafe.length > 0
      ? "One or more integrations are not safe for dry-run."
      : missing.length > 0
        ? "Integrations remain dry-run safe; some optional provider env is missing."
        : "All integrations are configured for dry-run without real network calls.",
    details: {
      realNetworkCall: false,
      integrations: statuses.map((status) => ({
        name: status.externalName,
        configured: status.configured,
        realEnabled: status.realEnabled,
        realNetworkCall: status.realNetworkCall,
        safeToRun: status.safeToRun,
        missingEnv: status.missingEnv,
      })),
    },
  };
}

function checkRealModeWarnings(env: NodeJS.ProcessEnv): DoctorCheck[] {
  return REAL_MODE_ENV_NAMES
    .filter((name) => env[name] === "1")
    .map((name) => ({
      key: name.toLowerCase().replaceAll("_", "-"),
      status: "warning",
      message: `${name} is enabled; demo workflow still keeps real external calls disabled unless a later approved task changes that boundary.`,
      details: { envName: name },
    }));
}

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    return false;
  }
}

function aggregateStatus(checks: DoctorCheck[]): DoctorStatus {
  if (checks.some((check) => check.status === "failed")) {
    return "failed";
  }
  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }
  return "ok";
}

function statusLabel(status: DoctorStatus): string {
  switch (status) {
    case "ok":
      return "[ok]";
    case "warning":
      return "[warning]";
    case "failed":
      return "[failed]";
  }
}

function sanitizeDoctorResult(result: DoctorResult): DoctorResult {
  return redactValue(result) as DoctorResult;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSecretText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key !== "key" && isSecretLikeName(key) ? "[redacted]" : redactValue(entry)]));
  }
  return value;
}

function redactSecretText(value: string): string {
  return value
    .replace(/:\/\/([^:@/\s]+):([^@/\s]+)@/g, "://$1:[redacted]@")
    .replace(/([?&][^=&#\s]*(?:token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer)[^=&#\s]*=)[^&#\s]*/gi, "$1[redacted]")
    .replace(/(\b[^=\s]*(?:token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer)[^=\s]*=)[^\s]+/gi, "$1[redacted]");
}

function isSecretLikeName(name: string): boolean {
  return /token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer/i.test(name);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
