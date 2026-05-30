import { randomUUID } from "node:crypto";
import {
  MissionStatus,
  MissionStatusSchema,
  type Mission,
  type MissionEvent,
} from "@psf/mission-schema";
import { transitionMission as buildTransition } from "@psf/mission-core";
import { z } from "zod";
import { badRequest, invalidTransition, notFound } from "./errors.js";
import type { MissionStorage } from "./storage.js";

const CreateMissionRequestSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1),
  raw_request: z.string().min(1),
  mission_markdown: z.string().optional(),
  acceptance_markdown: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
  risk_level: z.enum(["low", "medium", "high"]).default("medium"),
});

const TransitionRequestSchema = z.object({
  to: MissionStatusSchema,
  actor: z.string().min(1).optional(),
  payload: z.record(z.unknown()).default({}),
});

const AppendEventRequestSchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

export function createMissionServices(storage: MissionStorage) {
  return {
    listProjects: () => storage.listProjects(),
    async getProject(id: string) {
      const project = await storage.getProject(id);
      if (!project) {
        throw notFound("Project", id);
      }
      return project;
    },
    listMissions: () => storage.listMissions(),
    async getMission(id: string) {
      const mission = await storage.getMission(id);
      if (!mission) {
        throw notFound("Mission", id);
      }
      return mission;
    },
    async createMission(body: unknown) {
      const input = parseRequest(CreateMissionRequestSchema, body);
      const project = await storage.getProject(input.project_id);
      if (!project) {
        throw notFound("Project", input.project_id);
      }

      const now = new Date().toISOString();
      const id = "mission-" + randomUUID();
      const mission: Mission = {
        id,
        project_id: input.project_id,
        title: input.title,
        slug: slugify(input.title) + "-" + id.slice(-8),
        raw_request: input.raw_request,
        mission_markdown: input.mission_markdown ?? "",
        acceptance_markdown: input.acceptance_markdown ?? "",
        status: MissionStatus.received,
        priority: input.priority ?? "P2",
        risk_level: input.risk_level ?? "medium",
        branch_name: "",
        workspace_path: "",
        pr_url: "",
        current_attempt: 0,
        max_attempts: 3,
        created_at: now,
        updated_at: now,
      };
      const event: MissionEvent = {
        id: randomUUID(),
        mission_id: mission.id,
        type: "mission.created",
        message: "Mission created",
        payload: { status: MissionStatus.received },
        created_at: now,
      };

      return storage.createMission({ mission, event });
    },
    async transitionMission(id: string, body: unknown) {
      const input = parseRequest(TransitionRequestSchema, body);
      const mission = await this.getMission(id);
      try {
        const result = buildTransition({
          mission_id: id,
          from: mission.status,
          to: input.to,
          ...(input.actor === undefined ? {} : { actor: input.actor }),
          payload: input.payload ?? {},
        });
        return storage.transitionMission(id, result.status, result.event);
      } catch (error) {
        if (error instanceof Error) {
          throw invalidTransition(error.message);
        }
        throw error;
      }
    },
    async appendMissionEvent(id: string, body: unknown) {
      await this.getMission(id);
      const input = parseRequest(AppendEventRequestSchema, body);
      const event: MissionEvent = {
        id: randomUUID(),
        mission_id: id,
        type: input.type,
        message: input.message,
        payload: input.payload ?? {},
        created_at: new Date().toISOString(),
      };
      return storage.appendMissionEvent(event);
    },
    async listMissionEvents(id: string) {
      await this.getMission(id);
      return storage.listMissionEvents(id);
    },
  };
}

type ZodSchema<T> = z.ZodType<T>;

function parseRequest<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest("VALIDATION_ERROR", "Request validation failed", result.error.flatten());
  }
  return result.data;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mission";
}
