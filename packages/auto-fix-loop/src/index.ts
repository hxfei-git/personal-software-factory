import { createCodexDryRun, type CodexDryRunResult } from "@psf/codex-worker";
import { canTransition } from "@psf/mission-core";
import { MissionStatus, type Artifact, type BugReport, type MissionEvent, type MissionStatusValue, type ProjectPassport, type WorkerRun } from "@psf/mission-schema";

type MissionFileName = "mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md";

export interface AutoFixDryRunInput {
  missionId: string;
  projectId: string;
  missionStatus: MissionStatusValue;
  branchName: string;
  currentBranch: string;
  passport: ProjectPassport;
  projectAgents: string;
  missionFiles: Record<MissionFileName, string>;
  bugs: BugReport[];
  currentAttempt?: number;
  maxAttempts?: number;
  perBugAttempts?: Record<string, number>;
  maxBugAttempts?: number;
  now?: string;
}

export type AutoFixDecision = "qa_passed" | "bugs_found" | "max_attempts_exceeded";

export interface AutoFixDryRunResult {
  decision: AutoFixDecision;
  nextStatus?: MissionStatusValue;
  files: Partial<Record<"fix-mission.md" | "fix-acceptance.md" | "fix-codex-prompt.md" | "fix-codex-command.sh", string>>;
  workerRuns: WorkerRun[];
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
  codexDryRun?: CodexDryRunResult;
}

const DEFAULT_NOW = "2026-05-31T10:00:00.000Z";

export function createAutoFixDryRun(input: AutoFixDryRunInput): AutoFixDryRunResult {
  const now = input.now ?? DEFAULT_NOW;
  const currentAttempt = input.currentAttempt ?? 0;
  const maxAttempts = input.maxAttempts ?? 3;
  const maxBugAttempts = input.maxBugAttempts ?? 2;
  const workerRunId = `worker-run-${input.missionId}-auto-fix-dry-run`;

  if (input.bugs.length === 0) {
    const nextStatus = canTransition(input.missionStatus, MissionStatus.ready_for_review) ? MissionStatus.ready_for_review : undefined;
    const workerRun = buildWorkerRun(input, workerRunId, "succeeded", now, { decision: "qa_passed", nextStatus });
    return {
      decision: "qa_passed",
      ...(nextStatus === undefined ? {} : { nextStatus }),
      files: {},
      workerRuns: [workerRun],
      workerRun,
      artifacts: [],
      events: [
        buildEvent(input.missionId, "auto_fix.started", "Auto-fix dry-run started.", { workerRunId }, now),
        buildEvent(input.missionId, "auto_fix.qa_passed", "QA passed; no fix mission was generated.", { workerRunId, nextStatus: nextStatus ?? "unchanged" }, now),
      ],
    };
  }

  if (currentAttempt >= maxAttempts || hasExhaustedBug(input.bugs, input.perBugAttempts ?? {}, maxBugAttempts)) {
    const nextStatus = canTransition(input.missionStatus, MissionStatus.paused) ? MissionStatus.paused : undefined;
    const workerRun = buildWorkerRun(input, workerRunId, "skipped", now, { decision: "max_attempts_exceeded", nextStatus });
    return {
      decision: "max_attempts_exceeded",
      ...(nextStatus === undefined ? {} : { nextStatus }),
      files: {},
      workerRuns: [workerRun],
      workerRun,
      artifacts: [],
      events: [
        buildEvent(input.missionId, "auto_fix.started", "Auto-fix dry-run started.", { workerRunId }, now),
        buildEvent(input.missionId, "auto_fix.max_attempts_exceeded", "Auto-fix attempts were exhausted; Mission should pause.", { workerRunId, currentAttempt, maxAttempts, maxBugAttempts }, now),
      ],
    };
  }

  const fixMission = renderFixMission(input);
  const fixAcceptance = renderFixAcceptance(input);
  const codexDryRun = createCodexDryRun({
    missionId: input.missionId,
    projectId: input.projectId,
    branchName: input.branchName,
    currentBranch: input.currentBranch,
    passport: input.passport,
    projectAgents: input.projectAgents,
    missionFiles: {
      "mission.md": fixMission,
      "acceptance.md": fixAcceptance,
      "technical-notes.md": input.missionFiles["technical-notes.md"],
      "risk-notes.md": input.missionFiles["risk-notes.md"],
    },
    mode: "dry-run",
    enableRealCodex: false,
    hasApproval: false,
    now,
  });
  const fixCodexWorkerRunId = `worker-run-${input.missionId}-codex-fix-dry-run`;
  const fixCodexWorkerRun: WorkerRun = {
    ...codexDryRun.workerRun,
    id: fixCodexWorkerRunId,
    output: { ...codexDryRun.workerRun.output, fixMode: true },
    metadata: { ...codexDryRun.workerRun.metadata, generatedBy: "auto-fix-loop", fixMode: true },
  };
  const files = {
    "fix-mission.md": fixMission,
    "fix-acceptance.md": fixAcceptance,
    "fix-codex-prompt.md": codexDryRun.files["codex-prompt.md"],
    "fix-codex-command.sh": renderCodexCommandReviewArtifact(codexDryRun.files["codex-command.sh"]),
  };
  const nextStatus = canTransition(input.missionStatus, MissionStatus.bugs_found) ? MissionStatus.bugs_found : undefined;
  const workerRun = buildWorkerRun(input, workerRunId, "succeeded", now, { decision: "bugs_found", bugCount: input.bugs.length, nextStatus });
  const artifacts = createArtifacts(input.missionId, workerRunId, fixCodexWorkerRunId, files, now);

  return {
    decision: "bugs_found",
    ...(nextStatus === undefined ? {} : { nextStatus }),
    files,
    workerRuns: [workerRun, fixCodexWorkerRun],
    workerRun,
    artifacts,
    events: [
      buildEvent(input.missionId, "auto_fix.started", "Auto-fix dry-run started.", { workerRunId }, now),
      buildEvent(input.missionId, "auto_fix.bugs_found", "Auto-fix dry-run generated fix mission files.", { workerRunId, bugCount: input.bugs.length, nextStatus: nextStatus ?? "unchanged" }, now),
      buildEvent(input.missionId, "codex.dry_run.created", "Codex fix dry-run artifacts were generated without executing Codex.", { workerRunId: fixCodexWorkerRunId, executed: false }, now),
      ...artifacts.map((artifact) => buildEvent(input.missionId, "artifact.created", "Auto-fix artifact created.", { artifactId: artifact.id, type: artifact.type, path: artifact.path }, now)),
    ],
    codexDryRun: { ...codexDryRun, workerRun: fixCodexWorkerRun },
  };
}

function hasExhaustedBug(bugs: BugReport[], attempts: Record<string, number>, maxBugAttempts: number): boolean {
  return bugs.some((bug) => (attempts[bug.id] ?? 0) >= maxBugAttempts);
}

function renderFixMission(input: AutoFixDryRunInput): string {
  return [
    "# Fix Mission",
    "",
    `## Mission`,
    input.missionId,
    "",
    "## Goal",
    "Fix the QA-reported bugs without changing production, pushing remote branches, or bypassing review.",
    "",
    "## Bugs",
    ...input.bugs.flatMap((bug, index) => [
      `### Bug ${index + 1}: ${bug.title}`,
      `- ID: ${bug.id}`,
      `- Severity: ${bug.severity}`,
      `- Status: ${bug.status}`,
      `- Expected: ${bug.expected_result}`,
      `- Actual: ${bug.actual_result}`,
      "- Reproduction steps:",
      ...bug.reproduction_steps.map((step) => `  - ${step}`),
      `- Suggested direction: ${bug.suggested_fix_direction ?? bug.suggested_fix ?? "Add a regression test, reproduce the bug, and fix the root cause."}`,
      "",
    ]),
    "## Required Safety",
    "- Do not modify main/master.",
    "- Do not push remote branches.",
    "- Do not deploy production.",
    "- Do not store secrets in logs, prompts, reports, or artifacts.",
    "",
  ].join("\n");
}

function renderFixAcceptance(input: AutoFixDryRunInput): string {
  return [
    "# Fix Acceptance",
    "",
    "## Functional Acceptance",
    "- Every listed Bug has a concrete code-level fix or documented reason for human review.",
    "",
    "## Regression Acceptance",
    ...input.bugs.map((bug) => `- Add or update a regression test for ${bug.id}: ${bug.title}`),
    "",
    "## Verification",
    ...toCommandList(input.passport.commands.test).map((command) => `- Run: ${command}`),
    "",
    "## Manual Approval",
    "- Stop for approval before production deploy, destructive operations, secret changes, or real external service calls.",
    "",
  ].join("\n");
}

function buildWorkerRun(input: AutoFixDryRunInput, workerRunId: string, status: WorkerRun["status"], now: string, output: Record<string, unknown>): WorkerRun {
  return {
    id: workerRunId,
    mission_id: input.missionId,
    worker_type: "auto_fix",
    status,
    mode: "dry-run",
    started_at: now,
    finished_at: now,
    exit_code: status === "succeeded" ? 0 : undefined,
    input: { missionId: input.missionId, projectId: input.projectId, bugCount: input.bugs.length },
    output,
    error: "",
    logs: ["auto-fix dry-run started", `auto-fix decision: ${output.decision}`, "real Codex was not executed"],
    metadata: { generatedBy: "auto-fix-loop", dryRun: true, externalServicesCalled: false },
    created_at: now,
    updated_at: now,
  };
}

function createArtifacts(
  missionId: string,
  autoFixWorkerRunId: string,
  codexWorkerRunId: string,
  files: Required<AutoFixDryRunResult["files"]>,
  now: string,
): Artifact[] {
  return [
    createArtifact(missionId, autoFixWorkerRunId, "fix_mission", "fix-mission.md", files["fix-mission.md"], "text/markdown", now),
    createArtifact(missionId, autoFixWorkerRunId, "acceptance", "fix-acceptance.md", files["fix-acceptance.md"], "text/markdown", now),
    createArtifact(missionId, codexWorkerRunId, "codex_prompt", "fix-codex-prompt.md", files["fix-codex-prompt.md"], "text/markdown", now),
    createArtifact(missionId, codexWorkerRunId, "codex_command", "fix-codex-command.sh", files["fix-codex-command.sh"], "text/x-shellscript", now),
  ];
}

function createArtifact(missionId: string, workerRunId: string, type: Artifact["type"], name: string, content: string, mimeType: string, now: string): Artifact {
  return {
    id: `artifact-${missionId}-${slugify(name)}`,
    mission_id: missionId,
    type,
    path: `missions/${missionId}/${name}`,
    worker_run_id: workerRunId,
    content,
    mime_type: mimeType,
    size: Buffer.byteLength(content, "utf8"),
    metadata: { generatedBy: "auto-fix-loop", mode: "dry-run", reviewOnly: name.endsWith(".sh") },
    created_at: now,
  };
}

function renderCodexCommandReviewArtifact(command: string): string {
  return [
    "#!/usr/bin/env sh",
    "# DRY-RUN REVIEW ARTIFACT",
    "# Codex was not executed by the PSF auto-fix loop.",
    "# This file is intentionally written without executable permissions.",
    "# Running this file exits without invoking Codex.",
    "#",
    "# Reviewed command, kept as comments only:",
    ...command.trimEnd().split("\n").map((line) => {
      const trimmed = line.trimEnd();
      return trimmed === "" ? "#" : `# ${trimmed}`;
    }),
    "exit 1",
    "",
  ].join("\n");
}

function buildEvent(missionId: string, type: string, message: string, payload: Record<string, unknown>, now: string): MissionEvent {
  return {
    id: `event-${missionId}-${type.replaceAll(".", "-")}-${stableSuffix(payload)}`,
    mission_id: missionId,
    type,
    message,
    payload,
    created_at: now,
  };
}

function toCommandList(command: string | string[]): string[] {
  return Array.isArray(command) ? command : [command];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stableSuffix(payload: Record<string, unknown>): string {
  const source = String(payload.workerRunId ?? payload.artifactId ?? payload.bugCount ?? payload.nextStatus ?? "root");
  return slugify(source).slice(0, 80) || "root";
}
