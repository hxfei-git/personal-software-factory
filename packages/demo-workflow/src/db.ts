import { rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Artifact, BugReport, MissionEvent, QAReport, WorkerRun } from "@psf/mission-schema";
import type { RegistryProject } from "@psf/project-registry";
import { DEFAULT_DATABASE_URL, EXAMPLE_MISSION_ID } from "./constants.js";
import { relativeToCwd, resolveInside } from "./paths.js";
import type { MissionMetadata } from "./files.js";

export interface PrismaLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  project: { upsert(args: unknown): Promise<unknown> };
  mission: { upsert(args: unknown): Promise<unknown> };
  workerRun: { upsert(args: unknown): Promise<unknown> };
  artifact: { upsert(args: unknown): Promise<unknown> };
  missionEvent: { upsert(args: unknown): Promise<unknown> };
  qARun: { upsert(args: unknown): Promise<unknown> };
  bug: { upsert(args: unknown): Promise<unknown> };
}

export interface SyncDemoResourcesInput {
  skipDb?: boolean;
  prisma?: PrismaLike;
  project: RegistryProject;
  metadata: MissionMetadata;
  missionMarkdown?: string;
  acceptanceMarkdown?: string;
  workerRuns: WorkerRun[];
  artifacts: Artifact[];
  events: MissionEvent[];
  qaRuns: QAReport[];
  bugs: BugReport[];
}

export async function syncDemoResources(input: SyncDemoResourcesInput): Promise<boolean> {
  if (input.skipDb) {
    return false;
  }

  process.env.DATABASE_URL ||= DEFAULT_DATABASE_URL;
  let prisma: PrismaLike | undefined = input.prisma;

  try {
    if (!prisma) {
      const db = await import("@psf/db");
      prisma = db.prisma as PrismaLike;
    }

    await prisma.$connect();
    await upsertProject(prisma, input.project);
    await upsertMission(prisma, input.metadata, {
      ...(input.missionMarkdown === undefined ? {} : { missionMarkdown: input.missionMarkdown }),
      ...(input.acceptanceMarkdown === undefined ? {} : { acceptanceMarkdown: input.acceptanceMarkdown }),
    });
    for (const workerRun of input.workerRuns) {
      await upsertWorkerRun(prisma, workerRun);
    }
    for (const qaRun of input.qaRuns) {
      await upsertQARun(prisma, qaRun);
    }
    for (const artifact of input.artifacts) {
      await upsertArtifact(prisma, artifact);
    }
    for (const bug of input.bugs) {
      await upsertBug(prisma, bug);
    }
    for (const event of input.events) {
      await upsertMissionEvent(prisma, event);
    }
    return true;
  } catch (error) {
    throw new Error([
      "Database sync failed. Start the local Postgres service or use PSF_SKIP_DB=1 / --skip-db for artifact-only dry-runs.",
      `DATABASE_URL=${redactDatabaseUrl(process.env.DATABASE_URL)}`,
      `Cause: ${redactSecretText(errorMessage(error))}`,
    ].join(" "));
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
  documents: { missionMarkdown?: string; acceptanceMarkdown?: string },
): Promise<void> {
  const writableData = {
    projectId: metadata.projectId,
    title: metadata.title,
    slug: metadata.slug,
    rawRequest: metadata.rawRequest,
    status: metadata.status,
    priority: metadata.priority,
    riskLevel: metadata.riskLevel,
    branchName: metadata.branchName,
  };
  const documentUpdate = {
    ...(documents.missionMarkdown === undefined ? {} : { missionMarkdown: documents.missionMarkdown }),
    ...(documents.acceptanceMarkdown === undefined ? {} : { acceptanceMarkdown: documents.acceptanceMarkdown }),
  };

  await prisma.mission.upsert({
    where: { id: metadata.id },
    create: {
      id: metadata.id,
      ...writableData,
      workspacePath: `workspaces/${metadata.projectId}`,
      prUrl: null,
      currentAttempt: 0,
      maxAttempts: 3,
      missionMarkdown: documents.missionMarkdown ?? null,
      acceptanceMarkdown: documents.acceptanceMarkdown ?? null,
    },
    update: { ...writableData, ...documentUpdate },
  });
}

async function upsertWorkerRun(prisma: PrismaLike, workerRun: WorkerRun): Promise<void> {
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

async function upsertArtifact(prisma: PrismaLike, artifact: Artifact): Promise<void> {
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

async function upsertMissionEvent(prisma: PrismaLike, event: MissionEvent): Promise<void> {
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

async function upsertQARun(prisma: PrismaLike, qaRun: QAReport): Promise<void> {
  const data = {
    id: qaRun.id,
    missionId: qaRun.mission_id,
    targetUrl: qaRun.target_url,
    mode: qaRun.mode,
    status: qaRun.status,
    summary: qaRun.summary,
    reportPath: qaRun.report_path ?? null,
    screenshotsDir: qaRun.screenshots_dir ?? null,
    tracePath: qaRun.trace_path ?? null,
    bugsJsonPath: qaRun.bugs_json_path ?? null,
    stagingUrl: qaRun.staging_url ?? null,
    passed: qaRun.passed ?? 0,
    failed: qaRun.failed ?? 0,
    startedAt: toDateOrNull(qaRun.started_at),
    finishedAt: toDateOrNull(qaRun.finished_at),
  };
  await prisma.qARun.upsert({ where: { id: qaRun.id }, create: data, update: data });
}

async function upsertBug(prisma: PrismaLike, bug: BugReport): Promise<void> {
  const data = {
    id: bug.id,
    missionId: bug.mission_id,
    qaRunId: bug.qa_run_id ?? null,
    title: bug.title,
    severity: bug.severity,
    status: bug.status,
    reproductionSteps: bug.reproduction_steps,
    expectedResult: bug.expected_result,
    actualResult: bug.actual_result,
    evidence: bug.evidence ?? {},
    suggestedFix: bug.suggested_fix ?? null,
    regressionTestPath: bug.regression_test_path ?? null,
    suggestedFixDirection: bug.suggested_fix_direction ?? null,
    source: bug.source ?? "qa-worker",
  };
  await prisma.bug.upsert({ where: { id: bug.id }, create: data, update: data });
}

function toDateOrNull(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function redactDatabaseUrl(value: string | undefined): string {
  if (!value) {
    return "<unset>";
  }
  return redactSecretText(value).replace(/:\/\/([^:@/]+):\[redacted\]@/, "://$1:<redacted>@");
}

function redactSecretText(value: string): string {
  return value
    .replace(/:\/\/([^:@/\s]+):([^@/\s]+)@/g, "://$1:[redacted]@")
    .replace(/([?&][^=&#\s]*(?:token|password|passwd|pwd|secret|key|auth|credential|session|jwt|bearer)[^=&#\s]*=)[^&#\s]*/gi, "$1[redacted]");
}


export interface DemoResetOptions {
  cwd?: string;
  missionId?: string;
  confirm?: boolean;
  skipDb?: boolean;
}

export interface DemoResetResult {
  deleted: boolean;
  requiresConfirmation: boolean;
  missionId: string;
  deletedPaths: string[];
  deletedDatabaseRecords: string[];
  message: string;
}

interface DeleteManyDelegate {
  deleteMany(args: { where: { missionId: string } }): Promise<{ count: number }>;
}

interface MissionDeleteManyDelegate {
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
}

interface ResetPrismaLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  bug: DeleteManyDelegate;
  qARun: DeleteManyDelegate;
  artifact: DeleteManyDelegate;
  workerRun: DeleteManyDelegate;
  missionEvent: DeleteManyDelegate;
  approval: DeleteManyDelegate;
  deployment: DeleteManyDelegate;
  mission: MissionDeleteManyDelegate;
}

export async function resetDemoData(options: DemoResetOptions = {}): Promise<DemoResetResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const missionId = options.missionId ?? EXAMPLE_MISSION_ID;
  assertResettableMissionId(missionId);

  if (!options.confirm) {
    return {
      deleted: false,
      requiresConfirmation: true,
      missionId,
      deletedPaths: [],
      deletedDatabaseRecords: [],
      message: `Confirmation required before deleting demo mission data for ${missionId}.`,
    };
  }

  const missionPath = resolveInside(resolve(cwd, "missions"), missionId);
  const deletedPaths: string[] = [];
  if (await pathExists(missionPath)) {
    await rm(missionPath, { recursive: true, force: true });
    deletedPaths.push(relativeToCwd(cwd, missionPath));
  }

  const deletedDatabaseRecords = options.skipDb ? [] : await deleteScopedDemoRecords(missionId);
  const deleted = deletedPaths.length > 0 || deletedDatabaseRecords.length > 0;

  return {
    deleted,
    requiresConfirmation: false,
    missionId,
    deletedPaths,
    deletedDatabaseRecords,
    message: deleted
      ? `Deleted scoped demo data for ${missionId}.`
      : `No scoped demo data found for ${missionId}.`,
  };
}

async function deleteScopedDemoRecords(missionId: string): Promise<string[]> {
  process.env.DATABASE_URL ||= DEFAULT_DATABASE_URL;
  let prisma: ResetPrismaLike | undefined;
  const deleted: string[] = [];

  try {
    const db = await import("@psf/db");
    prisma = db.prisma as unknown as ResetPrismaLike;
    await prisma.$connect();

    for (const [name, action] of [
      ["bugs", () => prisma?.bug.deleteMany({ where: { missionId } })],
      ["qaRuns", () => prisma?.qARun.deleteMany({ where: { missionId } })],
      ["artifacts", () => prisma?.artifact.deleteMany({ where: { missionId } })],
      ["workerRuns", () => prisma?.workerRun.deleteMany({ where: { missionId } })],
      ["missionEvents", () => prisma?.missionEvent.deleteMany({ where: { missionId } })],
      ["approvals", () => prisma?.approval.deleteMany({ where: { missionId } })],
      ["deployments", () => prisma?.deployment.deleteMany({ where: { missionId } })],
      ["missions", () => prisma?.mission.deleteMany({ where: { id: missionId } })],
    ] as const) {
      const result = await action();
      if (result && result.count > 0) {
        deleted.push(`${name}:${result.count}`);
      }
    }

    return deleted;
  } catch (error) {
    throw new Error([
      `Database reset failed for ${missionId}. Use --skip-db for file-only demo reset if local Postgres is unavailable.`,
      `DATABASE_URL=${redactDatabaseUrl(process.env.DATABASE_URL)}`,
      `Cause: ${redactSecretText(errorMessage(error))}`,
    ].join(" "));
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function assertResettableMissionId(missionId: string): void {
  if (missionId === EXAMPLE_MISSION_ID || /^demo-[a-z0-9][a-z0-9-]*$/.test(missionId)) {
    return;
  }
  throw new Error(`Refusing to reset non-demo mission: ${missionId}`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
