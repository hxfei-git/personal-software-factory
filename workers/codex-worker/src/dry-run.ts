import type { Artifact, MissionEvent, ProjectPassport, WorkerRun } from "@psf/mission-schema";
import { assertSafeCodexExecution } from "./safety.js";
import type { CodexExecutionSafetyInput } from "./safety.js";

type MissionFileName = "mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md";
type CodexWorkerMode = CodexExecutionSafetyInput["mode"];

export interface CodexDryRunInput {
  missionId: string;
  projectId: string;
  branchName: string;
  currentBranch: string;
  passport: ProjectPassport;
  projectAgents: string;
  missionFiles: Record<MissionFileName, string>;
  mode?: CodexWorkerMode;
  enableRealCodex?: boolean;
  hasApproval?: boolean;
  now?: string;
}

export interface CodexDryRunResult {
  executed: false;
  files: Record<"codex-prompt.md" | "codex-command.sh" | "dev-summary.md", string>;
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
}

const DEFAULT_NOW = "2026-05-30T10:00:00.000Z";
const GENERATED_BY = "codex-worker";

export function createCodexDryRun(input: CodexDryRunInput): CodexDryRunResult {
  const requestedMode = input.mode ?? "dry-run";
  assertSafeCodexExecution({
    mode: requestedMode,
    enableRealCodex: input.enableRealCodex ?? false,
    currentBranch: input.currentBranch,
    hasApproval: input.hasApproval ?? false,
  });

  const now = input.now ?? DEFAULT_NOW;
  const workerRunId = `worker-run-${input.missionId}-codex-dry-run`;
  const prompt = renderCodexPrompt(input);
  const command = renderCodexCommand(prompt);
  const summary = renderDevSummary(input, requestedMode, now);
  const files = {
    "codex-prompt.md": prompt,
    "codex-command.sh": command,
    "dev-summary.md": summary,
  };

  const workerRun: WorkerRun = {
    id: workerRunId,
    mission_id: input.missionId,
    worker_type: "codex",
    status: "succeeded",
    mode: "dry-run",
    command,
    started_at: now,
    finished_at: now,
    exit_code: 0,
    input: {
      missionId: input.missionId,
      projectId: input.projectId,
      branchName: input.branchName,
      currentBranch: input.currentBranch,
      requestedMode,
    },
    output: {
      executed: false,
      generatedFiles: Object.keys(files),
      artifactTypes: ["codex_prompt", "codex_command", "dev_summary"],
    },
    error: "",
    logs: ["codex dry-run prompt generated", "codex command artifact generated", "codex was not executed"],
    metadata: {
      generatedBy: GENERATED_BY,
      requestedMode,
      dryRun: true,
      externalServicesCalled: false,
      workspaceModified: false,
    },
    created_at: now,
    updated_at: now,
  };

  return {
    executed: false,
    files,
    workerRun,
    artifacts: createArtifacts(input.missionId, workerRunId, files, now),
    events: createEvents(input.missionId, workerRunId, requestedMode, now),
  };
}

function renderCodexPrompt(input: CodexDryRunInput): string {
  const testCommands = toCommandList(input.passport.commands.test);

  return [
    "# Codex Mission Prompt",
    "",
    "## Mission Context",
    `- Mission ID: ${input.missionId}`,
    `- Project ID: ${input.projectId}`,
    `- Required branch: ${input.branchName}`,
    `- Current branch: ${input.currentBranch}`,
    `- Repository: ${input.passport.repo.url}`,
    `- Default branch: ${input.passport.repo.default_branch}`,
    "",
    "## Required Instructions",
    "1. Read mission.md.",
    "2. Read acceptance.md.",
    "3. Read technical-notes.md.",
    "4. Read risk-notes.md.",
    "5. Read project AGENTS.md.",
    "6. Do not modify main/master.",
    `7. Create independent branch ${input.branchName}.`,
    "8. Implement requirement.",
    `9. Run project-required tests: ${testCommands.join('; ')}.`,
    "10. Generate dev-summary.md.",
    "11. Do not directly publish production.",
    "12. Do not push remote unless explicitly authorized.",
    "",
    "## Project Passport",
    codeBlock("json", JSON.stringify(input.passport, null, 2)),
    "",
    "## Project AGENTS.md",
    codeBlock("markdown", input.projectAgents),
    "",
    "## mission.md",
    codeBlock("markdown", input.missionFiles["mission.md"]),
    "",
    "## acceptance.md",
    codeBlock("markdown", input.missionFiles["acceptance.md"]),
    "",
    "## technical-notes.md",
    codeBlock("markdown", input.missionFiles["technical-notes.md"]),
    "",
    "## risk-notes.md",
    codeBlock("markdown", input.missionFiles["risk-notes.md"]),
    "",
  ].join("\n");
}

function renderCodexCommand(prompt: string): string {
  return `codex exec --sandbox workspace-write --ask-for-approval on-request ${shellQuote(prompt)}\n`;
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function renderDevSummary(input: CodexDryRunInput, requestedMode: CodexWorkerMode, now: string): string {
  return [
    "# Codex Worker Dry Run Summary",
    "",
    `- Mission ID: ${input.missionId}`,
    `- Project ID: ${input.projectId}`,
    `- Requested mode: ${requestedMode}`,
    "- Worker mode: dry-run",
    `- Branch: ${input.branchName}`,
    `- Current branch: ${input.currentBranch}`,
    `- Generated at: ${now}`,
    "- Executed: false",
    "",
    "## Generated Artifacts",
    "- codex-prompt.md",
    "- codex-command.sh",
    "- dev-summary.md",
    "",
    "## Safety Boundary",
    "Codex was not executed. No repositories were cloned, no workspaces were modified, no remotes were pushed, and no external services were called.",
    "",
  ].join("\n");
}

function createArtifacts(
  missionId: string,
  workerRunId: string,
  files: CodexDryRunResult["files"],
  now: string,
): Artifact[] {
  return [
    createArtifact(missionId, workerRunId, "codex_prompt", "codex-prompt.md", files["codex-prompt.md"], now),
    createArtifact(missionId, workerRunId, "codex_command", "codex-command.sh", files["codex-command.sh"], now),
    createArtifact(missionId, workerRunId, "dev_summary", "dev-summary.md", files["dev-summary.md"], now),
  ];
}

function createArtifact(
  missionId: string,
  workerRunId: string,
  type: Artifact["type"],
  name: keyof CodexDryRunResult["files"],
  content: string,
  now: string,
): Artifact {
  return {
    id: `artifact-${missionId}-${type}`,
    mission_id: missionId,
    type,
    path: `artifacts/missions/${missionId}/codex-worker/${name}`,
    worker_run_id: workerRunId,
    content,
    mime_type: name.endsWith(".sh") ? "text/x-shellscript" : "text/markdown",
    size: content.length,
    metadata: { generatedBy: GENERATED_BY, mode: "dry-run" },
    created_at: now,
  };
}

function createEvents(missionId: string, workerRunId: string, requestedMode: CodexWorkerMode, now: string): MissionEvent[] {
  return [
    {
      id: `event-${missionId}-worker-run-created`,
      mission_id: missionId,
      type: "worker_run.created",
      message: "Codex worker dry-run created a WorkerRun record.",
      payload: { workerRunId, workerType: "codex", mode: "dry-run", requestedMode },
      created_at: now,
    },
    {
      id: `event-${missionId}-codex-dry-run-created`,
      mission_id: missionId,
      type: "codex.dry_run.created",
      message: "Codex dry-run artifacts were generated without executing Codex.",
      payload: { workerRunId, executed: false },
      created_at: now,
    },
  ];
}

function toCommandList(command: string | string[]): string[] {
  return Array.isArray(command) ? command : [command];
}

function codeBlock(language: string, content: string): string {
  return '```' + language + "\n" + content + "\n" + '```';
}
