import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@psf/db";
import type { Approval, Artifact, BugReport, Mission, MissionEvent, Project, QAReport, WorkerRun } from "@psf/mission-schema";


export class ApprovalDecisionConflictError extends Error {
  constructor(id: string) {
    super("Approval decision can only be recorded while approval is pending: " + id);
  }
}

export interface CreateMissionRecordInput {
  mission: Mission;
  event: MissionEvent;
}

export interface ResourceWriteInput<T> {
  resource: T;
  event: MissionEvent;
}

export interface MissionStorage {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  syncProjects(projects: Project[]): Promise<Project[]>;
  createMission(input: CreateMissionRecordInput): Promise<Mission>;
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  transitionMission(id: string, status: Mission["status"], event: MissionEvent): Promise<Mission>;
  appendMissionEvent(event: MissionEvent): Promise<MissionEvent>;
  listMissionEvents(missionId: string): Promise<MissionEvent[]>;

  createApproval(input: ResourceWriteInput<Approval>): Promise<Approval>;
  listMissionApprovals(missionId: string): Promise<Approval[]>;
  getApproval(id: string): Promise<Approval | null>;
  decideApproval(input: ResourceWriteInput<Approval>): Promise<Approval>;

  createWorkerRun(input: ResourceWriteInput<WorkerRun>): Promise<WorkerRun>;
  listMissionWorkerRuns(missionId: string): Promise<WorkerRun[]>;
  getWorkerRun(id: string): Promise<WorkerRun | null>;
  updateWorkerRun(input: ResourceWriteInput<WorkerRun>): Promise<WorkerRun>;

  createArtifact(input: ResourceWriteInput<Artifact>): Promise<Artifact>;
  listMissionArtifacts(missionId: string): Promise<Artifact[]>;
  getArtifact(id: string): Promise<Artifact | null>;

  createBug(input: ResourceWriteInput<BugReport>): Promise<BugReport>;
  listMissionBugs(missionId: string): Promise<BugReport[]>;
  getBug(id: string): Promise<BugReport | null>;
  updateBug(input: ResourceWriteInput<BugReport>): Promise<BugReport>;

  createQARun(input: ResourceWriteInput<QAReport>): Promise<QAReport>;
  listMissionQARuns(missionId: string): Promise<QAReport[]>;
  getQARun(id: string): Promise<QAReport | null>;
  updateQARun(input: ResourceWriteInput<QAReport>): Promise<QAReport>;
}

export interface InMemoryMissionStorageSeed {
  projects?: Project[];
  missions?: Mission[];
  events?: MissionEvent[];
  approvals?: Approval[];
  workerRuns?: WorkerRun[];
  artifacts?: Artifact[];
  bugs?: BugReport[];
  qaRuns?: QAReport[];
}

export function createInMemoryMissionStorage(seed: InMemoryMissionStorageSeed = {}): MissionStorage {
  const projects = new Map((seed.projects ?? []).map((project) => [project.id, project]));
  const missions = new Map((seed.missions ?? []).map((mission) => [mission.id, mission]));
  const events = [...(seed.events ?? [])];
  const approvals = new Map((seed.approvals ?? []).map((approval) => [approval.id, approval]));
  const workerRuns = new Map((seed.workerRuns ?? []).map((workerRun) => [workerRun.id, workerRun]));
  const artifacts = new Map((seed.artifacts ?? []).map((artifact) => [artifact.id, artifact]));
  const bugs = new Map((seed.bugs ?? []).map((bug) => [bug.id, bug]));
  const qaRuns = new Map((seed.qaRuns ?? []).map((qaRun) => [qaRun.id, qaRun]));
  const withQARunBugs = (qaRun: QAReport): QAReport => ({
    ...qaRun,
    bugs: [...bugs.values()].filter((bug) => bug.qa_run_id === qaRun.id),
  });

  return {
    async listProjects() {
      return [...projects.values()];
    },
    async getProject(id) {
      return projects.get(id) ?? null;
    },
    async syncProjects(inputProjects) {
      for (const project of inputProjects) {
        const current = projects.get(project.id);
        projects.set(project.id, current ? { ...project, created_at: current.created_at } : project);
      }
      return inputProjects.map((project) => projects.get(project.id) ?? project);
    },
    async createMission(input) {
      missions.set(input.mission.id, input.mission);
      events.push(input.event);
      return input.mission;
    },
    async listMissions() {
      return [...missions.values()];
    },
    async getMission(id) {
      return missions.get(id) ?? null;
    },
    async transitionMission(id, status, event) {
      const current = missions.get(id);
      if (!current) {
        return Promise.reject(new Error("Mission not found: " + id));
      }
      const updated = { ...current, status, updated_at: event.created_at };
      missions.set(id, updated);
      events.push(event);
      return updated;
    },
    async appendMissionEvent(event) {
      events.push(event);
      return event;
    },
    async listMissionEvents(missionId) {
      return events.filter((event) => event.mission_id === missionId);
    },

    async createApproval(input) {
      approvals.set(input.resource.id, input.resource);
      events.push(input.event);
      return input.resource;
    },
    async listMissionApprovals(missionId) {
      return [...approvals.values()].filter((approval) => approval.mission_id === missionId);
    },
    async getApproval(id) {
      return approvals.get(id) ?? null;
    },
    async decideApproval(input) {
      const current = approvals.get(input.resource.id);
      if (!current || current.status !== "pending") {
        throw new ApprovalDecisionConflictError(input.resource.id);
      }
      approvals.set(input.resource.id, input.resource);
      events.push(input.event);
      return input.resource;
    },

    async createWorkerRun(input) {
      workerRuns.set(input.resource.id, input.resource);
      events.push(input.event);
      return input.resource;
    },
    async listMissionWorkerRuns(missionId) {
      return [...workerRuns.values()].filter((workerRun) => workerRun.mission_id === missionId);
    },
    async getWorkerRun(id) {
      return workerRuns.get(id) ?? null;
    },
    async updateWorkerRun(input) {
      workerRuns.set(input.resource.id, input.resource);
      events.push(input.event);
      return input.resource;
    },

    async createArtifact(input) {
      artifacts.set(input.resource.id, input.resource);
      events.push(input.event);
      return input.resource;
    },
    async listMissionArtifacts(missionId) {
      return [...artifacts.values()].filter((artifact) => artifact.mission_id === missionId);
    },
    async getArtifact(id) {
      return artifacts.get(id) ?? null;
    },

    async createBug(input) {
      bugs.set(input.resource.id, input.resource);
      events.push(input.event);
      return input.resource;
    },
    async listMissionBugs(missionId) {
      return [...bugs.values()].filter((bug) => bug.mission_id === missionId);
    },
    async getBug(id) {
      return bugs.get(id) ?? null;
    },
    async updateBug(input) {
      bugs.set(input.resource.id, input.resource);
      events.push(input.event);
      return input.resource;
    },

    async createQARun(input) {
      qaRuns.set(input.resource.id, input.resource);
      events.push(input.event);
      return withQARunBugs(input.resource);
    },
    async listMissionQARuns(missionId) {
      return [...qaRuns.values()].filter((qaRun) => qaRun.mission_id === missionId).map(withQARunBugs);
    },
    async getQARun(id) {
      const qaRun = qaRuns.get(id);
      return qaRun ? withQARunBugs(qaRun) : null;
    },
    async updateQARun(input) {
      qaRuns.set(input.resource.id, input.resource);
      events.push(input.event);
      return withQARunBugs(input.resource);
    },
  };
}

export function createPrismaMissionStorage(prisma: PrismaClient): MissionStorage {
  return {
    async listProjects() {
      const projects = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
      return projects.map(mapProject);
    },
    async getProject(id) {
      const project = await prisma.project.findUnique({ where: { id } });
      return project ? mapProject(project) : null;
    },
    async syncProjects(projects) {
      const synced = [];
      for (const project of projects) {
        const upserted = await prisma.project.upsert({
          where: { id: project.id },
          create: toPrismaProjectCreate(project),
          update: toPrismaProjectUpdate(project),
        });
        synced.push(mapProject(upserted));
      }
      return synced;
    },
    async createMission(input) {
      const mission = await prisma.$transaction(async (tx) => {
        const created = await tx.mission.create({ data: toPrismaMissionCreate(input.mission) });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return created;
      });
      return mapMission(mission);
    },
    async listMissions() {
      const missions = await prisma.mission.findMany({ orderBy: { createdAt: "asc" } });
      return missions.map(mapMission);
    },
    async getMission(id) {
      const mission = await prisma.mission.findUnique({ where: { id } });
      return mission ? mapMission(mission) : null;
    },
    async transitionMission(id, status, event) {
      const mission = await prisma.$transaction(async (tx) => {
        const updated = await tx.mission.update({ where: { id }, data: { status } });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(event) });
        return updated;
      });
      return mapMission(mission);
    },
    async appendMissionEvent(event) {
      const created = await prisma.missionEvent.create({ data: toPrismaMissionEventCreate(event) });
      return mapMissionEvent(created);
    },
    async listMissionEvents(missionId) {
      const events = await prisma.missionEvent.findMany({ where: { missionId }, orderBy: { createdAt: "asc" } });
      return events.map(mapMissionEvent);
    },

    async createApproval(input) {
      const approval = await prisma.$transaction(async (tx) => {
        const created = await tx.approval.create({ data: toPrismaApprovalCreate(input.resource) });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return created;
      });
      return mapApproval(approval);
    },
    async listMissionApprovals(missionId) {
      const approvals = await prisma.approval.findMany({ where: { missionId }, orderBy: { createdAt: "asc" } });
      return approvals.map(mapApproval);
    },
    async getApproval(id) {
      const approval = await prisma.approval.findUnique({ where: { id } });
      return approval ? mapApproval(approval) : null;
    },
    async decideApproval(input) {
      const approval = await prisma.$transaction(async (tx) => {
        const updated = await tx.approval.updateMany({
          where: { id: input.resource.id, status: "pending" },
          data: toPrismaApprovalUpdate(input.resource),
        });
        if (updated.count !== 1) {
          throw new ApprovalDecisionConflictError(input.resource.id);
        }
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        const decided = await tx.approval.findUnique({ where: { id: input.resource.id } });
        if (!decided) {
          throw new ApprovalDecisionConflictError(input.resource.id);
        }
        return decided;
      });
      return mapApproval(approval);
    },

    async createWorkerRun(input) {
      const workerRun = await prisma.$transaction(async (tx) => {
        const created = await tx.workerRun.create({ data: toPrismaWorkerRunCreate(input.resource) });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return created;
      });
      return mapWorkerRun(workerRun);
    },
    async listMissionWorkerRuns(missionId) {
      const workerRuns = await prisma.workerRun.findMany({ where: { missionId }, orderBy: { createdAt: "asc" } });
      return workerRuns.map(mapWorkerRun);
    },
    async getWorkerRun(id) {
      const workerRun = await prisma.workerRun.findUnique({ where: { id } });
      return workerRun ? mapWorkerRun(workerRun) : null;
    },
    async updateWorkerRun(input) {
      const workerRun = await prisma.$transaction(async (tx) => {
        const updated = await tx.workerRun.update({ where: { id: input.resource.id }, data: toPrismaWorkerRunUpdate(input.resource) });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return updated;
      });
      return mapWorkerRun(workerRun);
    },

    async createArtifact(input) {
      const artifact = await prisma.$transaction(async (tx) => {
        const created = await tx.artifact.create({ data: toPrismaArtifactCreate(input.resource) });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return created;
      });
      return mapArtifact(artifact);
    },
    async listMissionArtifacts(missionId) {
      const artifacts = await prisma.artifact.findMany({ where: { missionId }, orderBy: { createdAt: "asc" } });
      return artifacts.map(mapArtifact);
    },
    async getArtifact(id) {
      const artifact = await prisma.artifact.findUnique({ where: { id } });
      return artifact ? mapArtifact(artifact) : null;
    },

    async createBug(input) {
      const bug = await prisma.$transaction(async (tx) => {
        const created = await tx.bug.create({ data: toPrismaBugCreate(input.resource) });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return created;
      });
      return mapBug(bug);
    },
    async listMissionBugs(missionId) {
      const bugs = await prisma.bug.findMany({ where: { missionId }, orderBy: { createdAt: "asc" } });
      return bugs.map(mapBug);
    },
    async getBug(id) {
      const bug = await prisma.bug.findUnique({ where: { id } });
      return bug ? mapBug(bug) : null;
    },
    async updateBug(input) {
      const bug = await prisma.$transaction(async (tx) => {
        const updated = await tx.bug.update({ where: { id: input.resource.id }, data: toPrismaBugUpdate(input.resource) });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return updated;
      });
      return mapBug(bug);
    },

    async createQARun(input) {
      const qaRun = await prisma.$transaction(async (tx) => {
        const created = await tx.qARun.create({ data: toPrismaQARunCreate(input.resource), include: { bugs: { orderBy: { createdAt: "asc" } } } });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return created;
      });
      return mapQARun(qaRun);
    },
    async listMissionQARuns(missionId) {
      const qaRuns = await prisma.qARun.findMany({ where: { missionId }, orderBy: { createdAt: "asc" }, include: { bugs: { orderBy: { createdAt: "asc" } } } });
      return qaRuns.map(mapQARun);
    },
    async getQARun(id) {
      const qaRun = await prisma.qARun.findUnique({ where: { id }, include: { bugs: { orderBy: { createdAt: "asc" } } } });
      return qaRun ? mapQARun(qaRun) : null;
    },
    async updateQARun(input) {
      const qaRun = await prisma.$transaction(async (tx) => {
        const updated = await tx.qARun.update({ where: { id: input.resource.id }, data: toPrismaQARunUpdate(input.resource), include: { bugs: { orderBy: { createdAt: "asc" } } } });
        await tx.missionEvent.create({ data: toPrismaMissionEventCreate(input.event) });
        return updated;
      });
      return mapQARun(qaRun);
    },
  };
}

// Prisma model result shapes are inferred from the generated client methods.
type PrismaProject = Awaited<ReturnType<PrismaClient["project"]["findMany"]>>[number];
type PrismaMission = Awaited<ReturnType<PrismaClient["mission"]["findMany"]>>[number];
type PrismaMissionEvent = Awaited<ReturnType<PrismaClient["missionEvent"]["findMany"]>>[number];
type PrismaApproval = Awaited<ReturnType<PrismaClient["approval"]["findMany"]>>[number];
type PrismaWorkerRun = Awaited<ReturnType<PrismaClient["workerRun"]["findMany"]>>[number];
type PrismaArtifact = Awaited<ReturnType<PrismaClient["artifact"]["findMany"]>>[number];
type PrismaBug = Awaited<ReturnType<PrismaClient["bug"]["findMany"]>>[number];
type PrismaQARun = Awaited<ReturnType<PrismaClient["qARun"]["findMany"]>>[number];
type PrismaQARunWithBugs = PrismaQARun & { bugs?: PrismaBug[] };

function mapProject(project: PrismaProject): Project {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? "",
    repo_url: project.repoUrl,
    default_branch: project.defaultBranch,
    local_path: project.localPath ?? "",
    passport_path: project.passportPath ?? "",
    production_url: project.productionUrl ?? "",
    staging_url: project.stagingUrl ?? "",
    status: project.status as Project["status"],
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}

function mapMission(mission: PrismaMission): Mission {
  return {
    id: mission.id,
    project_id: mission.projectId,
    title: mission.title,
    slug: mission.slug,
    raw_request: mission.rawRequest,
    mission_markdown: mission.missionMarkdown ?? "",
    acceptance_markdown: mission.acceptanceMarkdown ?? "",
    status: mission.status as Mission["status"],
    priority: mission.priority as Mission["priority"],
    risk_level: mission.riskLevel as Mission["risk_level"],
    branch_name: mission.branchName ?? "",
    workspace_path: mission.workspacePath ?? "",
    pr_url: mission.prUrl ?? "",
    current_attempt: mission.currentAttempt,
    max_attempts: mission.maxAttempts,
    created_at: mission.createdAt.toISOString(),
    updated_at: mission.updatedAt.toISOString(),
  };
}

function mapMissionEvent(event: PrismaMissionEvent): MissionEvent {
  return {
    id: event.id,
    mission_id: event.missionId,
    type: event.type,
    message: event.message,
    payload: event.payload as Record<string, unknown>,
    created_at: event.createdAt.toISOString(),
  };
}

function mapApproval(approval: PrismaApproval): Approval {
  return {
    id: approval.id,
    mission_id: approval.missionId,
    type: approval.type as Approval["type"],
    status: approval.status as Approval["status"],
    reason: approval.reason,
    payload: approval.payload as Record<string, unknown>,
    ...(approval.requestedBy === null ? {} : { requested_by: approval.requestedBy }),
    ...(approval.decidedBy === null ? {} : { decided_by: approval.decidedBy }),
    ...(approval.decision === null ? {} : { decision: approval.decision }),
    ...(approval.decidedAt === null ? {} : { decided_at: approval.decidedAt.toISOString() }),
    created_at: approval.createdAt.toISOString(),
    ...(approval.approvedAt === null ? {} : { approved_at: approval.approvedAt.toISOString() }),
    ...(approval.rejectedAt === null ? {} : { rejected_at: approval.rejectedAt.toISOString() }),
  };
}

function mapWorkerRun(workerRun: PrismaWorkerRun): WorkerRun {
  return {
    id: workerRun.id,
    mission_id: workerRun.missionId,
    worker_type: workerRun.workerType as WorkerRun["worker_type"],
    status: workerRun.status as WorkerRun["status"],
    mode: workerRun.mode as WorkerRun["mode"],
    ...(workerRun.command === null ? {} : { command: workerRun.command }),
    ...(workerRun.stdoutPath === null ? {} : { stdout_path: workerRun.stdoutPath }),
    ...(workerRun.stderrPath === null ? {} : { stderr_path: workerRun.stderrPath }),
    ...(workerRun.startedAt === null ? {} : { started_at: workerRun.startedAt.toISOString() }),
    ...(workerRun.finishedAt === null ? {} : { finished_at: workerRun.finishedAt.toISOString() }),
    ...(workerRun.exitCode === null ? {} : { exit_code: workerRun.exitCode }),
    input: workerRun.input as Record<string, unknown>,
    output: workerRun.output as Record<string, unknown>,
    ...(workerRun.error === null ? {} : { error: workerRun.error }),
    logs: workerRun.logs,
    metadata: workerRun.metadata as Record<string, unknown>,
    created_at: workerRun.createdAt.toISOString(),
    updated_at: workerRun.updatedAt.toISOString(),
  };
}

function mapArtifact(artifact: PrismaArtifact): Artifact {
  return {
    id: artifact.id,
    mission_id: artifact.missionId,
    type: artifact.type,
    path: artifact.path,
    ...(artifact.workerRunId === null ? {} : { worker_run_id: artifact.workerRunId }),
    ...(artifact.content === null ? {} : { content: artifact.content }),
    ...(artifact.mimeType === null ? {} : { mime_type: artifact.mimeType }),
    size: artifact.size,
    metadata: artifact.metadata as Record<string, unknown>,
    created_at: artifact.createdAt.toISOString(),
  };
}

function mapBug(bug: PrismaBug): BugReport {
  return {
    id: bug.id,
    mission_id: bug.missionId,
    ...(bug.qaRunId === null ? {} : { qa_run_id: bug.qaRunId }),
    title: bug.title,
    severity: bug.severity as BugReport["severity"],
    status: bug.status as BugReport["status"],
    reproduction_steps: bug.reproductionSteps,
    expected_result: bug.expectedResult,
    actual_result: bug.actualResult,
    evidence: bug.evidence as Record<string, unknown>,
    ...(bug.suggestedFix === null ? {} : { suggested_fix: bug.suggestedFix }),
    ...(bug.regressionTestPath === null ? {} : { regression_test_path: bug.regressionTestPath }),
    ...(bug.suggestedFixDirection === null ? {} : { suggested_fix_direction: bug.suggestedFixDirection }),
    source: bug.source,
    created_at: bug.createdAt.toISOString(),
    updated_at: bug.updatedAt.toISOString(),
  };
}

function mapQARun(qaRun: PrismaQARunWithBugs): QAReport {
  return {
    id: qaRun.id,
    mission_id: qaRun.missionId,
    target_url: qaRun.targetUrl,
    mode: qaRun.mode as QAReport["mode"],
    status: qaRun.status as QAReport["status"],
    summary: qaRun.summary,
    ...(qaRun.reportPath === null ? {} : { report_path: qaRun.reportPath }),
    ...(qaRun.screenshotsDir === null ? {} : { screenshots_dir: qaRun.screenshotsDir }),
    ...(qaRun.tracePath === null ? {} : { trace_path: qaRun.tracePath }),
    ...(qaRun.bugsJsonPath === null ? {} : { bugs_json_path: qaRun.bugsJsonPath }),
    ...(qaRun.stagingUrl === null ? {} : { staging_url: qaRun.stagingUrl }),
    passed: qaRun.passed,
    failed: qaRun.failed,
    ...(qaRun.startedAt === null ? {} : { started_at: qaRun.startedAt.toISOString() }),
    ...(qaRun.finishedAt === null ? {} : { finished_at: qaRun.finishedAt.toISOString() }),
    bugs: (qaRun.bugs ?? []).map(mapBug),
    created_at: qaRun.createdAt.toISOString(),
    updated_at: qaRun.updatedAt.toISOString(),
  };
}

function toPrismaProjectCreate(project: Project) {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? null,
    repoUrl: project.repo_url,
    defaultBranch: project.default_branch,
    localPath: project.local_path ?? null,
    passportPath: project.passport_path ?? null,
    productionUrl: project.production_url ?? null,
    stagingUrl: project.staging_url ?? null,
    status: project.status,
    createdAt: new Date(project.created_at),
    updatedAt: new Date(project.updated_at),
  };
}

function toPrismaProjectUpdate(project: Project) {
  return {
    slug: project.slug,
    name: project.name,
    description: project.description ?? null,
    repoUrl: project.repo_url,
    defaultBranch: project.default_branch,
    localPath: project.local_path ?? null,
    passportPath: project.passport_path ?? null,
    productionUrl: project.production_url ?? null,
    stagingUrl: project.staging_url ?? null,
    status: project.status,
    updatedAt: new Date(project.updated_at),
  };
}

function toPrismaMissionCreate(mission: Mission) {
  return {
    id: mission.id,
    projectId: mission.project_id,
    title: mission.title,
    slug: mission.slug,
    rawRequest: mission.raw_request,
    missionMarkdown: mission.mission_markdown ?? null,
    acceptanceMarkdown: mission.acceptance_markdown ?? null,
    status: mission.status,
    priority: mission.priority,
    riskLevel: mission.risk_level,
    branchName: mission.branch_name ?? null,
    workspacePath: mission.workspace_path ?? null,
    prUrl: mission.pr_url ?? null,
    currentAttempt: mission.current_attempt,
    maxAttempts: mission.max_attempts,
  };
}

function toPrismaMissionEventCreate(event: MissionEvent) {
  return {
    id: event.id || randomUUID(),
    missionId: event.mission_id,
    type: event.type,
    message: event.message,
    payload: event.payload as never,
  };
}

function toPrismaApprovalCreate(approval: Approval) {
  return {
    id: approval.id,
    missionId: approval.mission_id,
    type: approval.type,
    status: approval.status,
    reason: approval.reason,
    payload: approval.payload as never,
    requestedBy: approval.requested_by ?? null,
    decidedBy: approval.decided_by ?? null,
    decision: approval.decision ?? null,
    decidedAt: dateOrNull(approval.decided_at),
    approvedAt: dateOrNull(approval.approved_at),
    rejectedAt: dateOrNull(approval.rejected_at),
  };
}

function toPrismaApprovalUpdate(approval: Approval) {
  return {
    status: approval.status,
    requestedBy: approval.requested_by ?? null,
    decidedBy: approval.decided_by ?? null,
    decision: approval.decision ?? null,
    decidedAt: dateOrNull(approval.decided_at),
    approvedAt: dateOrNull(approval.approved_at),
    rejectedAt: dateOrNull(approval.rejected_at),
  };
}

function toPrismaWorkerRunCreate(workerRun: WorkerRun) {
  return {
    id: workerRun.id,
    missionId: workerRun.mission_id,
    workerType: workerRun.worker_type,
    status: workerRun.status,
    mode: workerRun.mode ?? "dry-run",
    command: workerRun.command ?? null,
    stdoutPath: workerRun.stdout_path ?? null,
    stderrPath: workerRun.stderr_path ?? null,
    startedAt: dateOrNull(workerRun.started_at),
    finishedAt: dateOrNull(workerRun.finished_at),
    exitCode: workerRun.exit_code ?? null,
    input: workerRun.input as never,
    output: workerRun.output as never,
    error: workerRun.error ?? null,
    logs: workerRun.logs,
    metadata: workerRun.metadata as never,
  };
}

function toPrismaWorkerRunUpdate(workerRun: WorkerRun) {
  return {
    workerType: workerRun.worker_type,
    status: workerRun.status,
    mode: workerRun.mode ?? "dry-run",
    command: workerRun.command ?? null,
    stdoutPath: workerRun.stdout_path ?? null,
    stderrPath: workerRun.stderr_path ?? null,
    startedAt: dateOrNull(workerRun.started_at),
    finishedAt: dateOrNull(workerRun.finished_at),
    exitCode: workerRun.exit_code ?? null,
    input: workerRun.input as never,
    output: workerRun.output as never,
    error: workerRun.error ?? null,
    logs: workerRun.logs,
    metadata: workerRun.metadata as never,
  };
}

function toPrismaArtifactCreate(artifact: Artifact) {
  return {
    id: artifact.id,
    missionId: artifact.mission_id,
    type: artifact.type,
    path: artifact.path,
    workerRunId: artifact.worker_run_id ?? null,
    content: artifact.content ?? null,
    mimeType: artifact.mime_type ?? null,
    size: artifact.size,
    metadata: artifact.metadata as never,
  };
}

function toPrismaBugCreate(bug: BugReport) {
  return {
    id: bug.id,
    missionId: bug.mission_id,
    qaRunId: bug.qa_run_id ?? null,
    title: bug.title,
    severity: bug.severity,
    status: bug.status,
    reproductionSteps: bug.reproduction_steps,
    expectedResult: bug.expected_result,
    actualResult: bug.actual_result,
    evidence: bug.evidence as never,
    suggestedFix: bug.suggested_fix ?? null,
    regressionTestPath: bug.regression_test_path ?? null,
    suggestedFixDirection: bug.suggested_fix_direction ?? null,
    source: bug.source ?? "manual",
  };
}

function toPrismaBugUpdate(bug: BugReport) {
  return {
    qaRunId: bug.qa_run_id ?? null,
    title: bug.title,
    severity: bug.severity,
    status: bug.status,
    reproductionSteps: bug.reproduction_steps,
    expectedResult: bug.expected_result,
    actualResult: bug.actual_result,
    evidence: bug.evidence as never,
    suggestedFix: bug.suggested_fix ?? null,
    regressionTestPath: bug.regression_test_path ?? null,
    suggestedFixDirection: bug.suggested_fix_direction ?? null,
    source: bug.source ?? "manual",
  };
}

function toPrismaQARunCreate(qaRun: QAReport) {
  return {
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
    startedAt: dateOrNull(qaRun.started_at),
    finishedAt: dateOrNull(qaRun.finished_at),
  };
}

function toPrismaQARunUpdate(qaRun: QAReport) {
  return {
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
    startedAt: dateOrNull(qaRun.started_at),
    finishedAt: dateOrNull(qaRun.finished_at),
  };
}

function dateOrNull(value: string | undefined): Date | null {
  return value === undefined || value === "" ? null : new Date(value);
}
