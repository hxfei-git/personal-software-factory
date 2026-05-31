import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Artifact, MissionEvent, WorkerRun } from "@psf/mission-schema";
import { saveTextArtifact } from "@psf/artifact-store";
import {
  assertCommandAllowed,
  assertNotForbiddenPath,
  evaluateApprovalPolicy,
  redactText,
} from "@psf/security";
import { CodexExecutionRequestSchema, type CodexExecutionRequest } from "./execution-request.js";
import { assertSafeCodexExecution } from "./safety.js";
import { leaseCodexWorkspace, type CodexWorkspaceLeaseReady } from "./workspace.js";

const execFileAsync = promisify(execFile);
const DEFAULT_NOW = "2026-05-30T10:00:00.000Z";
const SAFE_CODEX_SANDBOXES = new Set(["workspace-write", "read-only"]);
const SAFE_CODEX_APPROVAL_MODE = "on-request";
const SECRET_ENV_KEY_PATTERN = /(?:token|password|secret|authorization|credential|cookie|session|jwt|api[_-]?key|apikey)/i;

function collectEnvSecretValues(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([key, value]) => SECRET_ENV_KEY_PATTERN.test(key) && typeof value === "string" && value.length > 0)
    .map(([, value]) => value as string);
}

function redactOutput(input: string, extraSecrets: string[]): string {
  return redactText(input, extraSecrets);
}

function configuredSandbox(env: Record<string, string | undefined>): string {
  return env.CODEX_SANDBOX ?? "workspace-write";
}

function configuredApprovalMode(env: Record<string, string | undefined>): string {
  return env.CODEX_APPROVAL_MODE ?? SAFE_CODEX_APPROVAL_MODE;
}

function validateCodexCliPolicy(env: Record<string, string | undefined>): string | undefined {
  const sandbox = configuredSandbox(env);
  if (!SAFE_CODEX_SANDBOXES.has(sandbox)) {
    return `CODEX_SANDBOX=${sandbox} is blocked; allowed values are workspace-write or read-only.`;
  }

  const approvalMode = configuredApprovalMode(env);
  if (approvalMode !== SAFE_CODEX_APPROVAL_MODE) {
    return `CODEX_APPROVAL_MODE=${approvalMode} is blocked; only on-request is allowed.`;
  }

  return undefined;
}

function workspaceRootFor(input: CodexExecutionRequest, env: Record<string, string | undefined>): string {
  return path.resolve(input.workspaceRoot ?? env.PSF_WORKSPACE_ROOT ?? "workspaces");
}

function preflightCommands(input: CodexExecutionRequest, workspaceRoot: string): string | undefined {
  for (const command of input.commands) {
    try {
      assertCommandAllowed({
        command,
        cwd: workspaceRoot,
        workspaceRoot,
        allowNetwork: false,
        allowGitPush: false,
        timeoutMs: input.timeoutMs,
      });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return undefined;
}

export type CodexExecutionStatus = "blocked" | "manual_action" | "succeeded" | "failed";

export interface CodexExecutionResult {
  status: CodexExecutionStatus;
  executed: boolean;
  reason: string;
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  workspacePath?: string | undefined;
  branchName?: string | undefined;
}

export interface CodexRunner {
  run(input: CodexExecutionRequest): Promise<CodexExecutionResult>;
}

export interface SpawnCodexInput {
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env: Record<string, string | undefined>;
}

export interface SpawnCodexResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CodexRunnerOptions {
  env?: Record<string, string | undefined>;
  spawnCodex?: (input: SpawnCodexInput) => Promise<SpawnCodexResult>;
  now?: () => string;
}

function now(options: CodexRunnerOptions): string {
  return options.now?.() ?? new Date().toISOString();
}

function workerRunId(input: CodexExecutionRequest, suffix: string): string {
  return `worker-run-${input.missionId}-codex-${suffix}`;
}

function createWorkerRun(input: CodexExecutionRequest, fields: Partial<WorkerRun>): WorkerRun {
  const timestamp = typeof fields.created_at === "string" ? fields.created_at : DEFAULT_NOW;
  return {
    id: fields.id ?? workerRunId(input, input.mode),
    mission_id: input.missionId,
    worker_type: "codex",
    status: fields.status ?? "skipped",
    mode: input.mode,
    input: fields.input ?? {
      missionId: input.missionId,
      projectId: input.projectId,
      mode: input.mode,
      branchName: input.branchName,
    },
    output: fields.output ?? {},
    logs: fields.logs ?? [],
    metadata: fields.metadata ?? {},
    created_at: timestamp,
    updated_at: fields.updated_at ?? timestamp,
    ...fields,
  };
}

function createEvent(input: CodexExecutionRequest, type: string, message: string, payload: Record<string, unknown>, createdAt: string): MissionEvent {
  return {
    id: `event-${input.missionId}-${type.replaceAll(".", "-")}-${createdAt.replace(/[^0-9]/g, "")}`,
    mission_id: input.missionId,
    type,
    message,
    payload,
    created_at: createdAt,
  };
}

function resultFor(
  input: CodexExecutionRequest,
  status: CodexExecutionStatus,
  reason: string,
  options: CodexRunnerOptions,
  fields: Partial<CodexExecutionResult> = {},
  extraSecrets: string[] = [],
): CodexExecutionResult {
  const createdAt = now(options);
  const workerStatus: WorkerRun["status"] = status === "succeeded" ? "succeeded" : status === "failed" ? "failed" : "skipped";
  const workerRun = fields.workerRun ?? createWorkerRun(input, {
    status: workerStatus,
    error: status === "succeeded" ? "" : redactOutput(reason, extraSecrets),
    output: {
      executed: fields.executed ?? false,
      status,
      reason: redactOutput(reason, extraSecrets),
    },
    metadata: {
      realNetworkCall: false,
      pushed: false,
      realCodexRunner: input.mode === "real",
    },
    created_at: createdAt,
    updated_at: createdAt,
  });

  return {
    status,
    executed: fields.executed ?? false,
    reason: redactOutput(reason, extraSecrets),
    workerRun,
    artifacts: fields.artifacts ?? [],
    events: fields.events ?? [createEvent(input, `codex.${status}`, redactOutput(reason, extraSecrets), { workerRunId: workerRun.id }, createdAt)],
    stdout: redactOutput(fields.stdout ?? "", extraSecrets),
    stderr: redactOutput(fields.stderr ?? "", extraSecrets),
    exitCode: fields.exitCode,
    workspacePath: fields.workspacePath,
    branchName: fields.branchName,
  };
}

function renderPrompt(input: CodexExecutionRequest, lease: CodexWorkspaceLeaseReady): string {
  return [
    "# Codex Real Execution Prompt",
    "",
    `- Mission ID: ${input.missionId}`,
    `- Project ID: ${input.projectId}`,
    `- Repository: ${input.repoUrl}`,
    `- Default branch: ${input.defaultBranch}`,
    `- Execution branch: ${lease.branchName}`,
    `- Workspace: ${lease.workspacePath}`,
    "- Push: disabled",
    "- External provider calls: disabled",
    "",
    "## Mission Files",
    "",
    "### mission.md",
    input.missionFiles["mission.md"],
    "",
    "### acceptance.md",
    input.missionFiles["acceptance.md"],
    "",
    "### technical-notes.md",
    input.missionFiles["technical-notes.md"],
    "",
    "### risk-notes.md",
    input.missionFiles["risk-notes.md"],
    "",
  ].join("\n");
}

function renderCommand(executable: string, args: string[]): string {
  return [executable, ...args].map((part) => `'${part.replaceAll("'", "'\"'\"'")}'`).join(" ");
}

async function saveCodexArtifacts(input: CodexExecutionRequest, runId: string, artifacts: Array<[string, string, string]>, extraSecrets: string[]): Promise<Artifact[]> {
  const saved: Artifact[] = [];
  for (const [type, name, content] of artifacts) {
    saved.push(await saveTextArtifact({
      missionId: input.missionId,
      workerRunId: runId,
      type,
      name,
      content: redactOutput(content, extraSecrets),
      metadata: { generatedBy: "codex-worker", mode: input.mode, realNetworkCall: false },
    }));
  }
  return saved;
}

async function gitSummary(cwd: string, args: string[], extraSecrets: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 });
    return redactOutput([stdout.trim(), stderr.trim()].filter(Boolean).join("\n"), extraSecrets);
  } catch (error) {
    return redactOutput(error instanceof Error ? error.message : String(error), extraSecrets);
  }
}

async function defaultSpawnCodex(input: SpawnCodexInput): Promise<SpawnCodexResult> {
  return new Promise((resolve, reject) => {
    const useProcessGroup = process.platform !== "win32";
    const child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: useProcessGroup,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let sigkillTimer: NodeJS.Timeout | undefined;
    let hardFallbackTimer: NodeJS.Timeout | undefined;

    function clearTimers(): void {
      clearTimeout(timeoutTimer);
      if (sigkillTimer) {
        clearTimeout(sigkillTimer);
      }
      if (hardFallbackTimer) {
        clearTimeout(hardFallbackTimer);
      }
    }

    function killChild(signal: NodeJS.Signals): void {
      try {
        if (useProcessGroup && child.pid) {
          process.kill(-child.pid, signal);
          return;
        }
        child.kill(signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // Process may already be gone; close/hard fallback will settle the promise.
        }
      }
    }

    function finish(result: SpawnCodexResult): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(result);
    }

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killChild("SIGTERM");
      sigkillTimer = setTimeout(() => {
        killChild("SIGKILL");
      }, 100);
      hardFallbackTimer = setTimeout(() => {
        finish({
          exitCode: 124,
          stdout,
          stderr: `${stderr}
Process timed out after ${input.timeoutMs}ms and did not exit after SIGTERM/SIGKILL escalation.`,
        });
      }, 500);
    }, input.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      clearTimers();
      settled = true;
      reject(error);
    });
    child.on("close", (code) => {
      finish({
        exitCode: timedOut ? 124 : code ?? 1,
        stdout,
        stderr: timedOut ? `${stderr}
Process timed out after ${input.timeoutMs}ms.` : stderr,
      });
    });
  });
}

export class DryRunCodexRunner implements CodexRunner {
  async run(rawInput: CodexExecutionRequest): Promise<CodexExecutionResult> {
    const input = CodexExecutionRequestSchema.parse({ ...rawInput, mode: "dry-run" });
    return resultFor(input, "succeeded", "Codex dry-run runner did not execute a process.", {}, { executed: false });
  }
}

export class MockCodexRunner implements CodexRunner {
  async run(rawInput: CodexExecutionRequest): Promise<CodexExecutionResult> {
    const input = CodexExecutionRequestSchema.parse({ ...rawInput, mode: "mock" });
    return resultFor(input, "succeeded", "Mock Codex runner completed without spawning Codex.", {}, { executed: false });
  }
}

export class RealCodexRunner implements CodexRunner {
  private readonly env: Record<string, string | undefined>;
  private readonly spawnCodex: (input: SpawnCodexInput) => Promise<SpawnCodexResult>;
  private readonly options: CodexRunnerOptions;

  constructor(options: CodexRunnerOptions = {}) {
    this.env = options.env ?? process.env;
    this.spawnCodex = options.spawnCodex ?? defaultSpawnCodex;
    this.options = options;
  }

  async run(rawInput: CodexExecutionRequest): Promise<CodexExecutionResult> {
    const input = CodexExecutionRequestSchema.parse(rawInput);
    const extraSecrets = collectEnvSecretValues(this.env);

    if (input.mode !== "real") {
      return resultFor(input, "blocked", "RealCodexRunner only accepts mode=real requests.", this.options, {}, extraSecrets);
    }

    if (this.env.ENABLE_REAL_CODEX !== "1") {
      return resultFor(input, "blocked", "Real Codex execution requires ENABLE_REAL_CODEX=1.", this.options, {}, extraSecrets);
    }

    const approval = evaluateApprovalPolicy("real_codex_execution", input.approvalIds);
    if (!approval.allowed) {
      return resultFor(input, "blocked", approval.reason, this.options, {}, extraSecrets);
    }

    try {
      assertSafeCodexExecution({
        mode: "real",
        enableRealCodex: true,
        currentBranch: input.branchName ?? "",
        hasApproval: approval.allowed,
      });
    } catch (error) {
      return resultFor(input, "blocked", error instanceof Error ? error.message : String(error), this.options, {}, extraSecrets);
    }

    const maxRuntimeMs = Number.parseInt(this.env.PSF_REAL_CODEX_MAX_RUNTIME_MS ?? "300000", 10);
    if (input.timeoutMs > maxRuntimeMs) {
      return resultFor(input, "blocked", `Requested timeout ${input.timeoutMs}ms exceeds PSF_REAL_CODEX_MAX_RUNTIME_MS=${maxRuntimeMs}.`, this.options, {}, extraSecrets);
    }

    const cliPolicyFailure = validateCodexCliPolicy(this.env);
    if (cliPolicyFailure) {
      return resultFor(input, "blocked", cliPolicyFailure, this.options, {}, extraSecrets);
    }

    const requestedWorkspaceRoot = workspaceRootFor(input, this.env);
    const commandPolicyFailure = preflightCommands(input, requestedWorkspaceRoot);
    if (commandPolicyFailure) {
      return resultFor(input, "manual_action", commandPolicyFailure, this.options, {}, extraSecrets);
    }

    const executable = this.env.CODEX_EXECUTABLE;
    if (!executable) {
      return resultFor(input, "manual_action", "CODEX_EXECUTABLE must point to an explicit executable path; PATH lookup is disabled.", this.options, {}, extraSecrets);
    }
    if (!path.isAbsolute(executable)) {
      return resultFor(input, "manual_action", "CODEX_EXECUTABLE must be an absolute executable path; PATH lookup is disabled.", this.options, {}, extraSecrets);
    }

    try {
      assertNotForbiddenPath(executable);
      await access(executable);
    } catch (error) {
      return resultFor(input, "manual_action", error instanceof Error ? error.message : String(error), this.options, {}, extraSecrets);
    }

    const lease = await leaseCodexWorkspace({
      ...input,
      workspaceRoot: requestedWorkspaceRoot,
    });
    if (lease.status !== "ready") {
      return resultFor(input, "manual_action", lease.reason, this.options, {}, extraSecrets);
    }

    for (const command of input.commands) {
      try {
        assertCommandAllowed({
          command,
          cwd: lease.workspacePath,
          workspaceRoot: lease.workspaceRoot,
          allowNetwork: false,
          allowGitPush: false,
          timeoutMs: input.timeoutMs,
        });
      } catch (error) {
        return resultFor(input, "manual_action", error instanceof Error ? error.message : String(error), this.options, {
          workspacePath: lease.workspacePath,
          branchName: lease.branchName,
        }, extraSecrets);
      }
    }

    const runId = workerRunId(input, "real");
    const prompt = redactOutput(renderPrompt(input, lease), extraSecrets);
    const args = [
      "exec",
      "--sandbox",
      configuredSandbox(this.env),
      "--ask-for-approval",
      configuredApprovalMode(this.env),
      prompt,
    ];
    const command = redactOutput(renderCommand(executable, args), extraSecrets);
    const startedAt = now(this.options);

    let spawned: SpawnCodexResult;
    try {
      spawned = await this.spawnCodex({
        executable,
        args,
        cwd: lease.workspacePath,
        timeoutMs: input.timeoutMs,
        env: this.env,
      });
    } catch (error) {
      spawned = {
        exitCode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }

    const stdout = redactOutput(spawned.stdout, extraSecrets);
    const stderr = redactOutput(spawned.stderr, extraSecrets);
    const diffSummary = await gitSummary(lease.workspacePath, ["diff", "--stat"], extraSecrets);
    const statusSummary = await gitSummary(lease.workspacePath, ["status", "--short"], extraSecrets);
    const commitSummary = await gitSummary(lease.workspacePath, ["log", "-1", "--pretty=format:%H %s"], extraSecrets);
    const devSummary = [
      "# Codex Worker Real Runner Summary",
      "",
      `- Mission ID: ${input.missionId}`,
      `- Project ID: ${input.projectId}`,
      `- Mode: ${input.mode}`,
      `- Branch: ${lease.branchName}`,
      `- Workspace: ${lease.workspacePath}`,
      `- Exit code: ${spawned.exitCode}`,
      "- Push: disabled",
      "- External provider calls: disabled",
      "",
    ].join("\n");

    const artifacts = await saveCodexArtifacts(input, runId, [
      ["codex_prompt", "codex-prompt.md", prompt],
      ["codex_command", "codex-command.sh", command],
      ["codex_stdout", "stdout.txt", stdout],
      ["codex_stderr", "stderr.txt", stderr],
      ["dev_summary", "dev-summary.md", devSummary],
      ["codex_diff_summary", "diff-summary.txt", [diffSummary, statusSummary].filter(Boolean).join("\n") || "No local diff."],
      ["codex_local_commit_summary", "local-commit-summary.txt", commitSummary || "No local commit summary available."],
    ], extraSecrets);

    const finishedAt = now(this.options);
    const status: CodexExecutionStatus = spawned.exitCode === 0 ? "succeeded" : "failed";
    const workerRun = createWorkerRun(input, {
      id: runId,
      status: status === "succeeded" ? "succeeded" : "failed",
      command,
      stdout_path: artifacts.find((artifact) => artifact.type === "codex_stdout")?.path,
      stderr_path: artifacts.find((artifact) => artifact.type === "codex_stderr")?.path,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: spawned.exitCode,
      output: {
        executed: true,
        status,
        artifactTypes: artifacts.map((artifact) => artifact.type),
        workspacePath: lease.workspacePath,
        branchName: lease.branchName,
      },
      error: status === "succeeded" ? "" : stderr,
      logs: ["real Codex runner gates passed", "Codex executable process completed", "remote push disabled"],
      metadata: {
        realNetworkCall: false,
        pushed: false,
        executableConfigured: true,
        sandbox: configuredSandbox(this.env),
        approvalMode: configuredApprovalMode(this.env),
      },
      created_at: startedAt,
      updated_at: finishedAt,
    });

    return {
      status,
      executed: true,
      reason: status === "succeeded" ? "Codex executable completed successfully." : "Codex executable failed.",
      workerRun,
      artifacts,
      events: [
        createEvent(input, "worker_run.created", "Codex real runner created a WorkerRun record.", { workerRunId: runId, mode: "real" }, startedAt),
        createEvent(input, `codex.real.${status}`, "Codex real runner completed without push or external provider calls.", {
          workerRunId: runId,
          exitCode: spawned.exitCode,
          realNetworkCall: false,
        }, finishedAt),
      ],
      stdout,
      stderr,
      exitCode: spawned.exitCode,
      workspacePath: lease.workspacePath,
      branchName: lease.branchName,
    };
  }
}
