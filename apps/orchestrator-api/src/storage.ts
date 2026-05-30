import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@psf/db";
import type { Mission, MissionEvent, Project } from "@psf/mission-schema";

export interface CreateMissionRecordInput {
  mission: Mission;
  event: MissionEvent;
}

export interface MissionStorage {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createMission(input: CreateMissionRecordInput): Promise<Mission>;
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  transitionMission(id: string, status: Mission["status"], event: MissionEvent): Promise<Mission>;
  appendMissionEvent(event: MissionEvent): Promise<MissionEvent>;
  listMissionEvents(missionId: string): Promise<MissionEvent[]>;
}

export interface InMemoryMissionStorageSeed {
  projects?: Project[];
  missions?: Mission[];
  events?: MissionEvent[];
}

export function createInMemoryMissionStorage(seed: InMemoryMissionStorageSeed = {}): MissionStorage {
  const projects = new Map((seed.projects ?? []).map((project) => [project.id, project]));
  const missions = new Map((seed.missions ?? []).map((mission) => [mission.id, mission]));
  const events = [...(seed.events ?? [])];

  return {
    async listProjects() {
      return [...projects.values()];
    },
    async getProject(id) {
      return projects.get(id) ?? null;
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
  };
}

// Prisma model result shapes are inferred from the generated client methods.
type PrismaProject = Awaited<ReturnType<PrismaClient["project"]["findMany"]>>[number];
type PrismaMission = Awaited<ReturnType<PrismaClient["mission"]["findMany"]>>[number];
type PrismaMissionEvent = Awaited<ReturnType<PrismaClient["missionEvent"]["findMany"]>>[number];

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
