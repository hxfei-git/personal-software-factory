#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createCodexDryRun } from "@psf/codex-worker";
import { createDeterministicMissionPlan } from "@psf/mission-planner";
import { findProjectById, scanProjectRegistry, type RegistryProject } from "@psf/project-registry";

const DEFAULT_DATABASE_URL = "postgresql://psf:psf_dev_password@localhost:5432/psf?schema=public";
const EXAMPLE_PROJECT_ID = "ai-novelist";
const EXAMPLE_REQUEST = "增加章节审稿和自动修复流程";
const EXAMPLE_MISSION_ID = "mission-0001-ai-novelist-chapter-review";
const EXAMPLE_TITLE = "增加章节审稿和自动修复流程";
const EXAMPLE_SLUG = "ai-novelist-chapter-review";
const EXAMPLE_BRANCH = `psf/${EXAMPLE_MISSION_ID}`;

type CliCommand = "projects:sync" | "mission:create" | "mission:plan" | "codex:dry-run";

type JsonObject = Record<string, unknown>;

interface PsfCliOptions {
  cwd?: string;
  syncDatabase?: boolean;
}

export interface PsfCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface CliContext {
  cwd: string;
  syncDatabase: boolean;
  stdout: string[];
  stderr: string[];
}

interface MissionMetadata {
  id: string;
  projectId: string;
  title: string;
  slug: string;
  rawRequest: string;
  status: "received" | "planned";
  priority: "P0" | "P1" | "P2" | "P3";
  riskLevel: "low" | "medium" | "high";
  branchName: string;
  missionDir: string;
  dryRun: true;
  createdAt: string;
  updatedAt: string;
  plannedAt?: string;
  codexDryRunAt?: string;
}

interface WorkerRunRecord {
  id: string;
  mission_id: string;
  worker_type: string;
  status: string;
  mode?: string;
  command?: string;
  stdout_path?: string;
  stderr_path?: string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  input?: JsonObject;
  output?: JsonObject;
  error?: string;
  logs?: string[];
  metadata?: JsonObject;
  created_at?: string;
  updated_at?: string;
}

interface ArtifactRecord {
  id: string;
  mission_id: string;
  type: string;
  path: string;
  worker_run_id?: string;
  content?: string;
  mime_type?: string;
  size: number;
  metadata?: JsonObject;
  created_at: string;
}

interface MissionEventRecord {
  id: string;
  mission_id: string;
  type: string;
  message: string;
  payload?: JsonObject;
  created_at: string;
}

interface PrismaLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  project: { upsert(args: unknown): Promise<unknown> };
  mission: { upsert(args: unknown): Promise<unknown> };
  workerRun: { upsert(args: unknown): Promise<unknown> };
  artifact: { upsert(args: unknown): Promise<unknown> };
  missionEvent: { upsert(args: unknown): Promise<unknown> };
}

class PsfCliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = "PsfCliError";
  }
}

export async function runPsfCli(argv: string[], options: PsfCliOptions = {}): Promise<PsfCliResult> {
  const context: CliContext = {
    cwd: resolve(options.cwd ?? process.cwd()),
    syncDatabase: options.syncDatabase ?? process.env.PSF_SKIP_DB !== "1",
    stdout: [],
    stderr: [],
  };

  try {
    const [command, ...args] = argv;
    switch (command as CliCommand | undefined) {
      case "projects:sync":
        await syncProjectsCommand(context);
        break;
      case "mission:create":
        await createMissionCommand(context, args);
        break;
      case "mission:plan":
        await planMissionCommand(context, args);
        break;
      case "codex:dry-run":
        await codexDryRunCommand(context, args);
        break;
      default:
        throw new PsfCliError("USAGE", usage(), command ? 1 : 0);
    }

    return formatResult(0, context);
  } catch (error) {
    const exitCode = error instanceof PsfCliError ? error.exitCode : 1;
    context.stderr.push(formatError(error));
    return formatResult(exitCode, context);
  }
}

async function syncProjectsCommand(context: CliContext): Promise<void> {
  const projects = await loadRegistry(context);
  const aiNovelist = findProjectById(projects, EXAMPLE_PROJECT_ID);
  if (!aiNovelist) {
    throw new PsfCliError(
      "PROJECT_NOT_FOUND",
      `Project ${EXAMPLE_PROJECT_ID} was not found under ${join(context.cwd, "projects")}.`,
    );
  }

  await syncDatabase(context, async (prisma) => {
    for (const project of projects) {
      await upsertProject(prisma, project);
    }
  });

  context.stdout.push(`Validated ${EXAMPLE_PROJECT_ID} from ${relativeToCwd(context, aiNovelist.passportPath)}.`);
  context.stdout.push(`Synchronized ${projects.length} project(s).`);
}

async function createMissionCommand(context: CliContext, args: string[]): Promise<void> {
  const [projectId, ...requestParts] = args;
  const rawRequest = requestParts.join(" ").trim();
  if (!projectId || !rawRequest) {
    throw new PsfCliError("USAGE", "Usage: pnpm psf mission:create <project-id> <requirement>");
  }

  const metadata = buildMissionMetadata(projectId, rawRequest);
  await writeMissionMetadata(context, metadata);

  await syncDatabase(context, async (prisma) => {
    const project = await loadProject(context, metadata.projectId);
    await upsertProject(prisma, project);
    await upsertMission(prisma, metadata);
    await upsertMissionEvent(prisma, {
      id: `event-${metadata.id}-received`,
      mission_id: metadata.id,
      type: "mission.received",
      message: "Mission received from local PSF CLI.",
      payload: { projectId: metadata.projectId, dryRun: true },
      created_at: metadata.createdAt,
    });
  });

  context.stdout.push(`Created mission ${metadata.id} at ${metadata.missionDir}.`);
}

async function planMissionCommand(context: CliContext, args: string[]): Promise<void> {
  const missionId = requireMissionId(args);
  const metadata = await readMissionMetadata(context, missionId);
  const project = await loadProject(context, metadata.projectId);
  const qaCharter = await readText(context, "projects", metadata.projectId, "qa-charter.md");

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
    await writeText(context, "missions", metadata.id, file.name, file.content);
  }

  const plannedAt = new Date().toISOString();
  const updatedMetadata: MissionMetadata = { ...metadata, status: "planned", plannedAt, updatedAt: plannedAt };
  await writeMissionMetadata(context, updatedMetadata);

  await syncDatabase(context, async (prisma) => {
    await upsertProject(prisma, project);
    await upsertMission(prisma, updatedMetadata, {
      missionMarkdown: getPlanFile(plan.files, "mission.md"),
      acceptanceMarkdown: getPlanFile(plan.files, "acceptance.md"),
    });
    await upsertWorkerRun(prisma, plan.workerRun);
    for (const artifact of plan.artifacts) {
      await upsertArtifact(prisma, artifact);
    }
    for (const event of plan.events) {
      await upsertMissionEvent(prisma, event);
    }
  });

  context.stdout.push(`Planned mission ${metadata.id}.`);
  context.stdout.push("Generated mission.md, acceptance.md, technical-notes.md, and risk-notes.md.");
}

async function codexDryRunCommand(context: CliContext, args: string[]): Promise<void> {
  const missionId = requireMissionId(args);
  const metadata = await readMissionMetadata(context, missionId);
  const project = await loadProject(context, metadata.projectId);
  const projectAgents = await readText(context, "projects", metadata.projectId, "AGENTS.md");
  const missionFiles = {
    "mission.md": await readText(context, "missions", metadata.id, "mission.md"),
    "acceptance.md": await readText(context, "missions", metadata.id, "acceptance.md"),
    "technical-notes.md": await readText(context, "missions", metadata.id, "technical-notes.md"),
    "risk-notes.md": await readText(context, "missions", metadata.id, "risk-notes.md"),
  };

  const dryRun = createCodexDryRun({
    missionId: metadata.id,
    projectId: metadata.projectId,
    branchName: metadata.branchName,
    currentBranch: "dry-run/no-worktree",
    passport: project.passport,
    projectAgents,
    missionFiles,
    mode: "dry-run",
    enableRealCodex: false,
    hasApproval: false,
  });

  for (const [name, content] of Object.entries(dryRun.files)) {
    await writeText(context, "missions", metadata.id, name, content);
  }
  await chmod(join(context.cwd, "missions", metadata.id, "codex-command.sh"), 0o755);

  const codexDryRunAt = new Date().toISOString();
  await writeMissionMetadata(context, { ...metadata, codexDryRunAt, updatedAt: codexDryRunAt });

  await syncDatabase(context, async (prisma) => {
    await upsertProject(prisma, project);
    await upsertMission(prisma, metadata);
    await upsertWorkerRun(prisma, dryRun.workerRun);
    for (const artifact of dryRun.artifacts.map((artifact) => rebaseArtifactPath(artifact, metadata.id))) {
      await upsertArtifact(prisma, artifact);
    }
    for (const event of dryRun.events) {
      await upsertMissionEvent(prisma, event);
    }
  });

  context.stdout.push(`Generated Codex dry-run artifacts for ${metadata.id}.`);
  context.stdout.push("Codex was not executed.");
}

function buildMissionMetadata(projectId: string, rawRequest: string): MissionMetadata {
  if (projectId !== EXAMPLE_PROJECT_ID || rawRequest !== EXAMPLE_REQUEST) {
    throw new PsfCliError(
      "UNSUPPORTED_MISSION",
      `This Phase 1 CLI only supports the ${EXAMPLE_PROJECT_ID} example request: ${EXAMPLE_REQUEST}`,
    );
  }

  const now = new Date().toISOString();
  return {
    id: EXAMPLE_MISSION_ID,
    projectId,
    title: EXAMPLE_TITLE,
    slug: EXAMPLE_SLUG,
    rawRequest,
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

async function loadRegistry(context: CliContext): Promise<RegistryProject[]> {
  const projectsRoot = join(context.cwd, "projects");
  const projects = await scanProjectRegistry(projectsRoot);
  return projects;
}

async function loadProject(context: CliContext, projectId: string): Promise<RegistryProject> {
  const projects = await loadRegistry(context);
  const project = findProjectById(projects, projectId);
  if (!project) {
    throw new PsfCliError("PROJECT_NOT_FOUND", `Project ${projectId} was not found under ${join(context.cwd, "projects")}.`);
  }
  return project;
}

async function syncDatabase(context: CliContext, operation: (prisma: PrismaLike) => Promise<void>): Promise<void> {
  if (!context.syncDatabase) {
    context.stdout.push("Database sync skipped because PSF_SKIP_DB=1 or syncDatabase=false was set.");
    return;
  }

  process.env.DATABASE_URL ||= DEFAULT_DATABASE_URL;

  let prisma: PrismaLike | undefined;
  try {
    const db = await import("@psf/db");
    prisma = db.prisma as PrismaLike;
    await prisma.$connect();
    await operation(prisma);
  } catch (error) {
    throw new PsfCliError(
      "DATABASE_SYNC_FAILED",
      [
        "Database sync failed.",
        `DATABASE_URL=${redactDatabaseUrl(process.env.DATABASE_URL)}`,
        "Start the local Postgres service or set PSF_SKIP_DB=1 for explicit local artifact-only dry-runs.",
        `Cause: ${errorMessage(error)}`,
      ].join(" "),
    );
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
  }
}

async function upsertProject(prisma: PrismaLike, registryProject: RegistryProject): Promise<void> {
  const project = registryProject.project;
  const data = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? null,
    repoUrl: project.repo_url,
    defaultBranch: project.default_branch,
    localPath: project.local_path ?? null,
    passportPath: project.passport_path ?? registryProject.passportPath,
    productionUrl: project.production_url ?? null,
    stagingUrl: project.staging_url ?? null,
    status: project.status,
  };

  await prisma.project.upsert({ where: { id: project.id }, create: data, update: data });
}

async function upsertMission(
  prisma: PrismaLike,
  metadata: MissionMetadata,
  documents: { missionMarkdown?: string; acceptanceMarkdown?: string } = {},
): Promise<void> {
  const data = {
    id: metadata.id,
    projectId: metadata.projectId,
    title: metadata.title,
    slug: metadata.slug,
    rawRequest: metadata.rawRequest,
    missionMarkdown: documents.missionMarkdown ?? null,
    acceptanceMarkdown: documents.acceptanceMarkdown ?? null,
    status: metadata.status,
    priority: metadata.priority,
    riskLevel: metadata.riskLevel,
    branchName: metadata.branchName,
    workspacePath: `workspaces/${metadata.projectId}`,
    prUrl: null,
    currentAttempt: 0,
    maxAttempts: 3,
  };

  await prisma.mission.upsert({ where: { id: metadata.id }, create: data, update: data });
}

async function upsertWorkerRun(prisma: PrismaLike, workerRun: WorkerRunRecord): Promise<void> {
  const data = {
    id: workerRun.id,
    missionId: workerRun.mission_id,
    workerType: workerRun.worker_type,
    status: workerRun.status,
    mode: workerRun.mode ?? "dry-run",
    command: workerRun.command ?? null,
    stdoutPath: workerRun.stdout_path ?? null,
    stderrPath: workerRun.stderr_path ?? null,
    startedAt: toDateOrNull(workerRun.started_at),
    finishedAt: toDateOrNull(workerRun.finished_at),
    exitCode: workerRun.exit_code ?? null,
    input: workerRun.input ?? {},
    output: workerRun.output ?? {},
    error: workerRun.error ?? null,
    logs: workerRun.logs ?? [],
    metadata: workerRun.metadata ?? {},
  };

  await prisma.workerRun.upsert({ where: { id: workerRun.id }, create: data, update: data });
}

async function upsertArtifact(prisma: PrismaLike, artifact: ArtifactRecord): Promise<void> {
  const data = {
    id: artifact.id,
    missionId: artifact.mission_id,
    type: artifact.type,
    path: artifact.path,
    workerRunId: artifact.worker_run_id ?? null,
    content: artifact.content ?? null,
    mimeType: artifact.mime_type ?? null,
    size: artifact.size,
    metadata: artifact.metadata ?? {},
    createdAt: new Date(artifact.created_at),
  };

  await prisma.artifact.upsert({ where: { id: artifact.id }, create: data, update: data });
}

async function upsertMissionEvent(prisma: PrismaLike, event: MissionEventRecord): Promise<void> {
  const data = {
    id: event.id,
    missionId: event.mission_id,
    type: event.type,
    message: event.message,
    payload: event.payload ?? {},
    createdAt: new Date(event.created_at),
  };

  await prisma.missionEvent.upsert({ where: { id: event.id }, create: data, update: data });
}

function rebaseArtifactPath(artifact: ArtifactRecord, missionId: string): ArtifactRecord {
  const fileName = artifact.path.split("/").at(-1) ?? artifact.path;
  return { ...artifact, path: `missions/${missionId}/${fileName}` };
}

async function writeMissionMetadata(context: CliContext, metadata: MissionMetadata): Promise<void> {
  await writeJson(context, "missions", metadata.id, "metadata.json", metadata);
}

async function readMissionMetadata(context: CliContext, missionId: string): Promise<MissionMetadata> {
  return readJson<MissionMetadata>(context, "missions", missionId, "metadata.json");
}

async function writeText(context: CliContext, ...partsAndContent: string[]): Promise<void> {
  const content = partsAndContent.at(-1);
  const parts = partsAndContent.slice(0, -1);
  if (content === undefined || parts.length === 0) {
    throw new PsfCliError("INTERNAL_ERROR", "writeText requires a path and content.");
  }
  const filePath = join(context.cwd, ...parts);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function writeJsonFile(context: CliContext, parts: string[], value: unknown): Promise<void> {
  const filePath = join(context.cwd, ...parts);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function readJson<T>(context: CliContext, ...parts: string[]): Promise<T> {
  return JSON.parse(await readText(context, ...parts)) as T;
}

async function readText(context: CliContext, ...parts: string[]): Promise<string> {
  return readFile(join(context.cwd, ...parts), "utf8");
}

function requireMissionId(args: string[]): string {
  const [missionId] = args;
  if (!missionId) {
    throw new PsfCliError("USAGE", "Usage: pnpm psf mission:plan <mission-id> or pnpm psf codex:dry-run <mission-id>");
  }
  return missionId;
}

function getPlanFile(files: Array<{ name: string; content: string }>, name: string): string {
  const file = files.find((item) => item.name === name);
  if (!file) {
    throw new PsfCliError("INTERNAL_ERROR", `Planner did not return ${name}.`);
  }
  return file.content;
}

function toDateOrNull(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

function formatResult(exitCode: number, context: CliContext): PsfCliResult {
  return {
    exitCode,
    stdout: context.stdout.length > 0 ? context.stdout.join("\n") + "\n" : "",
    stderr: context.stderr.length > 0 ? context.stderr.join("\n") + "\n" : "",
  };
}

function formatError(error: unknown): string {
  if (error instanceof PsfCliError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactDatabaseUrl(value: string | undefined): string {
  if (!value) {
    return "<unset>";
  }
  return value.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:<redacted>@");
}

function relativeToCwd(context: CliContext, path: string): string {
  return path.startsWith(context.cwd) ? path.slice(context.cwd.length + 1) : path;
}

function usage(): string {
  return [
    "Usage:",
    "  pnpm psf projects:sync",
    `  pnpm psf mission:create ${EXAMPLE_PROJECT_ID} \"${EXAMPLE_REQUEST}\"`,
    `  pnpm psf mission:plan ${EXAMPLE_MISSION_ID}`,
    `  pnpm psf codex:dry-run ${EXAMPLE_MISSION_ID}`,
    "",
    "All commands are local dry-runs. codex:dry-run writes a command artifact but never executes Codex.",
  ].join("\n");
}

async function main(): Promise<void> {
  const result = await runPsfCli(process.argv.slice(2));
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.exitCode;
}

if (isCliEntrypoint()) {
  void main().catch((error: unknown) => {
    process.stderr.write(formatError(error) + "\n");
    process.exitCode = 1;
  });
}

function isCliEntrypoint(): boolean {
  const invokedPath = process.argv[1]?.replaceAll("\\", "/") ?? "";
  return invokedPath === "scripts/psf.ts" || invokedPath.endsWith("/scripts/psf.ts");
}

// Preserve the intended writeJson API after TypeScript catches accidental call-site drift.
async function writeJson(context: CliContext, ...partsAndValue: [...string[], unknown]): Promise<void> {
  const value = partsAndValue.at(-1);
  const parts = partsAndValue.slice(0, -1) as string[];
  await writeJsonFile(context, parts, value);
}
