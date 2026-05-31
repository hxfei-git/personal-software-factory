import { chmod, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createAutoFixDryRun } from "@psf/auto-fix-loop";
import { createCodexDryRun, type CodexDryRunResult } from "@psf/codex-worker";
import { createDeterministicMissionPlan } from "@psf/mission-planner";
import type { Artifact, BugReport, MissionEvent, QAReport, WorkerRun } from "@psf/mission-schema";
import { createQaDryRun } from "@psf/qa-worker";
import { findProjectById, scanProjectRegistry, type RegistryProject } from "@psf/project-registry";
import {
  DEFAULT_DEMO_API_URL,
  DEFAULT_DEMO_HUB_URL,
  DEMO_REPORT_PATH,
  EXAMPLE_BRANCH,
  EXAMPLE_MISSION_ID,
  EXAMPLE_PROJECT_ID,
  EXAMPLE_REQUEST,
  EXAMPLE_SLUG,
  EXAMPLE_TITLE,
} from "./constants.js";
import { syncDemoResources } from "./db.js";
import {
  ensureArtifactDirs,
  readMissionFile,
  readMissionMetadataIfExists,
  writeMissionFile,
  writeMissionMetadata,
  type MissionMetadata,
} from "./files.js";
import { missionFile, resolveInside } from "./paths.js";
import { writeDemoReport } from "./report.js";
import type { DemoBoundary, DemoWorkflowOptions, DemoWorkflowResult } from "./types.js";

type MissionFileName = "mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md";

interface WorkflowContext {
  cwd: string;
  now: string;
  apiUrl: string;
  hubUrl: string;
  skipDb: boolean;
  withSampleBug: boolean;
  generatedArtifacts: Set<string>;
  workerRuns: WorkerRun[];
  artifacts: Artifact[];
  events: MissionEvent[];
  qaRuns: QAReport[];
  bugs: BugReport[];
  metadata?: MissionMetadata;
  project?: RegistryProject;
}

export async function runAiNovelistDemo(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult> {
  const context = createContext(options);
  await ensureDemoMissionInContext(context);
  await planMissionInContext(context);
  await codexDryRunInContext(context);
  await qaDryRunInContext(context);
  await fixDryRunInContext(context);

  const metadata = requireMetadata(context);
  const project = requireProject(context);
  const missionMarkdown = await readMissionFile(context.cwd, metadata.id, "mission.md");
  const acceptanceMarkdown = await readMissionFile(context.cwd, metadata.id, "acceptance.md");
  const dbSynced = await syncDemoResources({
    skipDb: context.skipDb,
    project,
    metadata,
    missionMarkdown,
    acceptanceMarkdown,
    workerRuns: uniqueById(context.workerRuns),
    artifacts: uniqueById(context.artifacts),
    events: uniqueById(context.events),
    qaRuns: uniqueById(context.qaRuns),
    bugs: uniqueById(context.bugs),
  });

  const result = buildResult(context, dbSynced);
  const reportPath = await writeDemoReport(context.cwd, { result: { ...result, generatedArtifacts: [...result.generatedArtifacts, DEMO_REPORT_PATH] }, generatedAt: context.now });
  context.generatedArtifacts.add(reportPath);
  return buildResult(context, dbSynced);
}

export async function ensureDemoMission(options: DemoWorkflowOptions = {}): Promise<{ metadata: MissionMetadata; created: boolean }> {
  const context = createContext(options);
  return ensureDemoMissionInContext(context);
}

export async function runMissionPlan(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult> {
  const context = createContext(options);
  await ensureDemoMissionInContext(context);
  await planMissionInContext(context);
  return buildResult(context, false);
}

export async function runCodexDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult> {
  const context = createContext(options);
  await ensureDemoMissionInContext(context);
  await planMissionInContext(context);
  await codexDryRunInContext(context);
  return buildResult(context, false);
}

export async function runQaDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult> {
  const context = createContext(options);
  await ensureDemoMissionInContext(context);
  await planMissionInContext(context);
  await qaDryRunInContext(context);
  return buildResult(context, false);
}

export async function runFixDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult> {
  const context = createContext(options);
  await ensureDemoMissionInContext(context);
  await planMissionInContext(context);
  await qaDryRunInContext(context);
  await fixDryRunInContext(context);
  return buildResult(context, false);
}

export async function runLoopDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult> {
  const context = createContext(options);
  await ensureDemoMissionInContext(context);
  await planMissionInContext(context);
  await qaDryRunInContext(context);
  await fixDryRunInContext(context);
  return buildResult(context, false);
}

function createContext(options: DemoWorkflowOptions): WorkflowContext {
  return {
    cwd: resolve(options.cwd ?? process.cwd()),
    now: options.now ?? new Date().toISOString(),
    apiUrl: trimTrailingSlash(options.apiUrl ?? DEFAULT_DEMO_API_URL),
    hubUrl: trimTrailingSlash(options.hubUrl ?? DEFAULT_DEMO_HUB_URL),
    skipDb: options.skipDb ?? false,
    withSampleBug: options.withSampleBug ?? false,
    generatedArtifacts: new Set<string>(),
    workerRuns: [],
    artifacts: [],
    events: [],
    qaRuns: [],
    bugs: [],
  };
}

async function ensureDemoMissionInContext(context: WorkflowContext): Promise<{ metadata: MissionMetadata; created: boolean }> {
  const project = await loadDemoProject(context.cwd);
  context.project = project;

  const next = buildMissionMetadata(context.now);
  const existing = await readMissionMetadataIfExists(context.cwd, next.id);
  const metadata = existing ? mergeExistingMissionMetadata(existing, next) : next;
  await ensureArtifactDirs(context.cwd, metadata.id);
  await writeMissionMetadata(context.cwd, metadata);
  context.generatedArtifacts.add(`missions/${metadata.id}/metadata.json`);
  context.metadata = metadata;
  context.events.push({
    id: `event-${metadata.id}-received`,
    mission_id: metadata.id,
    type: "mission.received",
    message: "Mission received from local demo workflow.",
    payload: { projectId: metadata.projectId, dryRun: true },
    created_at: metadata.createdAt,
  });
  return { metadata, created: existing === null };
}

async function planMissionInContext(context: WorkflowContext): Promise<void> {
  const metadata = requireMetadata(context);
  const project = requireProject(context);
  const qaCharter = await readProjectFile(context.cwd, metadata.projectId, "qa-charter.md");
  const plan = createDeterministicMissionPlan({
    projectId: metadata.projectId,
    userRequirement: metadata.rawRequest,
    passport: project.passport,
    qaCharter,
    title: metadata.title,
    priority: metadata.priority,
    missionId: metadata.id,
  });

  for (const file of plan.files) {
    context.generatedArtifacts.add(await writeMissionFile(context.cwd, metadata.id, file.name, file.content));
  }
  context.workerRuns.push(plan.workerRun);
  context.artifacts.push(...plan.artifacts);
  context.events.push(...plan.events);
  await updateMetadata(context, { status: "planned", plannedAt: context.now });
}

async function codexDryRunInContext(context: WorkflowContext): Promise<void> {
  const metadata = requireMetadata(context);
  const project = requireProject(context);
  const projectAgents = await readProjectFile(context.cwd, metadata.projectId, "AGENTS.md");
  const dryRun = createCodexDryRun({
    missionId: metadata.id,
    projectId: metadata.projectId,
    branchName: metadata.branchName,
    currentBranch: "dry-run/no-worktree",
    passport: project.passport,
    projectAgents,
    missionFiles: await readMissionFiles(context.cwd, metadata.id),
    mode: "dry-run",
    enableRealCodex: false,
    hasApproval: false,
    now: context.now,
  });
  const files = {
    ...dryRun.files,
    "codex-command.sh": renderCodexCommandReviewArtifact(dryRun.files["codex-command.sh"], "Codex was not executed by the PSF demo workflow."),
  };

  for (const [name, content] of Object.entries(files)) {
    context.generatedArtifacts.add(await writeMissionFile(context.cwd, metadata.id, name, content));
  }
  await chmod(missionFile(context.cwd, metadata.id, "codex-command.sh"), 0o644);
  context.workerRuns.push(dryRun.workerRun);
  context.artifacts.push(...syncCodexArtifactsWithFiles(dryRun.artifacts, files, metadata.id));
  context.events.push(...dryRun.events);
  await updateMetadata(context, { codexDryRunAt: context.now });
}

async function qaDryRunInContext(context: WorkflowContext): Promise<void> {
  const metadata = requireMetadata(context);
  const project = requireProject(context);
  const qaCharter = await readProjectFile(context.cwd, metadata.projectId, "qa-charter.md");
  const qaTargetUrl = sanitizeUrlForArtifact(process.env.QA_TEST_URL || process.env.STAGING_URL);
  const result = createQaDryRun({
    missionId: metadata.id,
    projectId: metadata.projectId,
    passport: project.passport,
    qaCharter,
    missionFiles: {
      "mission.md": await readMissionFile(context.cwd, metadata.id, "mission.md"),
      "acceptance.md": await readMissionFile(context.cwd, metadata.id, "acceptance.md"),
    },
    withSampleBug: context.withSampleBug,
    ...(qaTargetUrl ? { stagingUrl: qaTargetUrl } : {}),
    now: context.now,
  });

  for (const [name, content] of Object.entries(result.files)) {
    context.generatedArtifacts.add(await writeMissionFile(context.cwd, metadata.id, name, content));
  }
  for (const name of ["artifacts/screenshots/.gitkeep", "artifacts/traces/.gitkeep", "artifacts/logs/.gitkeep"]) {
    context.generatedArtifacts.add(await writeMissionFile(context.cwd, metadata.id, name, ""));
  }
  context.workerRuns.push(result.workerRun);
  context.qaRuns.push(result.qaRun);
  context.artifacts.push(...result.artifacts);
  context.bugs.push(...result.bugs);
  context.events.push(...result.events);
  await updateMetadata(context, { qaDryRunAt: context.now });
}

async function fixDryRunInContext(context: WorkflowContext): Promise<void> {
  const metadata = requireMetadata(context);
  const project = requireProject(context);
  const projectAgents = await readProjectFile(context.cwd, metadata.projectId, "AGENTS.md");
  const result = createAutoFixDryRun({
    missionId: metadata.id,
    projectId: metadata.projectId,
    missionStatus: "qa_running",
    branchName: metadata.branchName,
    currentBranch: "dry-run/no-worktree",
    passport: project.passport,
    projectAgents,
    missionFiles: await readMissionFiles(context.cwd, metadata.id),
    bugs: context.bugs,
    currentAttempt: 0,
    maxAttempts: Number(process.env.PSF_MAX_MISSION_FIX_ATTEMPTS ?? 3),
    maxBugAttempts: Number(process.env.PSF_MAX_BUG_FIX_ATTEMPTS ?? 2),
    now: context.now,
  });

  for (const [name, content] of Object.entries(result.files)) {
    if (content !== undefined) {
      context.generatedArtifacts.add(await writeMissionFile(context.cwd, metadata.id, name, content));
    }
  }
  if (result.files["fix-codex-command.sh"] !== undefined) {
    await chmod(missionFile(context.cwd, metadata.id, "fix-codex-command.sh"), 0o644);
  }
  context.workerRuns.push(...result.workerRuns);
  context.artifacts.push(...result.artifacts);
  context.events.push(...result.events);
  await updateMetadata(context, { fixDryRunAt: context.now });
}

async function loadDemoProject(cwd: string): Promise<RegistryProject> {
  const projects = await scanProjectRegistry(join(cwd, "projects"));
  const project = findProjectById(projects, EXAMPLE_PROJECT_ID);
  if (!project) {
    throw new Error(`Project ${EXAMPLE_PROJECT_ID} was not found under ${join(cwd, "projects")}.`);
  }
  return project;
}

async function readProjectFile(cwd: string, projectId: string, name: string): Promise<string> {
  return readFile(resolveInside(cwd, "projects", projectId, name), "utf8");
}

async function readMissionFiles(cwd: string, missionId: string): Promise<Record<MissionFileName, string>> {
  return {
    "mission.md": await readMissionFile(cwd, missionId, "mission.md"),
    "acceptance.md": await readMissionFile(cwd, missionId, "acceptance.md"),
    "technical-notes.md": await readMissionFile(cwd, missionId, "technical-notes.md"),
    "risk-notes.md": await readMissionFile(cwd, missionId, "risk-notes.md"),
  };
}

function buildMissionMetadata(now: string): MissionMetadata {
  return {
    id: EXAMPLE_MISSION_ID,
    projectId: EXAMPLE_PROJECT_ID,
    title: EXAMPLE_TITLE,
    slug: EXAMPLE_SLUG,
    rawRequest: EXAMPLE_REQUEST,
    status: "received",
    priority: "P2",
    riskLevel: "medium",
    branchName: EXAMPLE_BRANCH,
    missionDir: `missions/${EXAMPLE_MISSION_ID}`,
    dryRun: true,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeExistingMissionMetadata(existing: MissionMetadata, next: MissionMetadata): MissionMetadata {
  if (existing.projectId !== next.projectId || existing.rawRequest !== next.rawRequest) {
    throw new Error(`Existing metadata for ${next.id} does not match the demo mission.`);
  }
  return {
    ...next,
    status: existing.status,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
    ...(existing.plannedAt === undefined ? {} : { plannedAt: existing.plannedAt }),
    ...(existing.codexDryRunAt === undefined ? {} : { codexDryRunAt: existing.codexDryRunAt }),
    ...(existing.qaDryRunAt === undefined ? {} : { qaDryRunAt: existing.qaDryRunAt }),
    ...(existing.fixDryRunAt === undefined ? {} : { fixDryRunAt: existing.fixDryRunAt }),
  };
}

async function updateMetadata(context: WorkflowContext, updates: Partial<MissionMetadata>): Promise<void> {
  const metadata = { ...requireMetadata(context), ...updates, updatedAt: context.now };
  context.metadata = metadata;
  await writeMissionMetadata(context.cwd, metadata);
  context.generatedArtifacts.add(`missions/${metadata.id}/metadata.json`);
}

function syncCodexArtifactsWithFiles(
  artifacts: Artifact[],
  files: CodexDryRunResult["files"],
  missionId: string,
): Artifact[] {
  return artifacts.map((artifact) => {
    const fileName = artifact.path.split("/").at(-1) as keyof CodexDryRunResult["files"] | undefined;
    if (!fileName || !(fileName in files)) {
      return artifact;
    }
    const content = files[fileName];
    return {
      ...artifact,
      path: `missions/${missionId}/${fileName}`,
      content,
      size: Buffer.byteLength(content, "utf8"),
      metadata: { ...artifact.metadata, reviewOnly: fileName === "codex-command.sh" },
    };
  });
}

function renderCodexCommandReviewArtifact(command: string, sourceLine: string): string {
  return [
    "#!/usr/bin/env sh",
    "# DRY-RUN REVIEW ARTIFACT",
    `# ${sourceLine}`,
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

function buildResult(context: WorkflowContext, dbSynced: boolean): DemoWorkflowResult {
  const metadata = requireMetadata(context);
  return {
    missionId: metadata.id,
    projectId: metadata.projectId,
    apiUrl: context.apiUrl,
    hubUrl: context.hubUrl,
    missionDetailUrl: `${context.hubUrl}/missions/${metadata.id}`,
    generatedArtifacts: [...context.generatedArtifacts].sort(),
    workerRunIds: uniqueStrings(context.workerRuns.map((workerRun) => workerRun.id)),
    qaRunIds: uniqueStrings(context.qaRuns.map((qaRun) => qaRun.id)),
    bugIds: uniqueStrings(context.bugs.map((bug) => bug.id)),
    eventIds: uniqueStrings(context.events.map((event) => event.id)),
    dbSynced,
    boundary: getDemoBoundary(),
    message: "AI Novelist demo dry-run completed. Codex, external providers, pushes, and deployments were not executed.",
  };
}

function getDemoBoundary(): DemoBoundary {
  return {
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
  };
}

function requireMetadata(context: WorkflowContext): MissionMetadata {
  if (!context.metadata) {
    throw new Error("Demo mission metadata has not been created.");
  }
  return context.metadata;
}

function requireProject(context: WorkflowContext): RegistryProject {
  if (!context.project) {
    throw new Error("Demo project has not been loaded.");
  }
  return context.project;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function sanitizeUrlForArtifact(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSecretLikeKey(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString().replaceAll("%5Bredacted%5D", "[redacted]");
  } catch {
    return redactSecretLikeText(value);
  }
}

function redactSecretLikeText(value: string): string {
  return value
    .replace(/:\/\/([^:@/\s]+):([^@/\s]+)@/g, "://$1:[redacted]@")
    .replace(/([?&][^=&#\s]*(?:token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer)[^=&#\s]*=)[^&#\s]*/gi, "$1[redacted]");
}

function isSecretLikeKey(key: string): boolean {
  return /token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer/i.test(key);
}
