import { randomUUID } from "node:crypto";
import {
  MissionStatus,
  MissionStatusSchema,
  type Approval,
  type Artifact,
  type BugReport,
  type Mission,
  type MissionEvent,
  type QAReport,
  type WorkerRun,
} from "@psf/mission-schema";
import { transitionMission as buildTransition } from "@psf/mission-core";
import { ProjectRegistryError, findProjectById, scanProjectRegistry } from "@psf/project-registry";
import { z } from "zod";
import { badRequest, invalidTransition, notFound } from "./errors.js";
import { ApprovalDecisionConflictError, type MissionStorage } from "./storage.js";


const JsonObjectSchema = z.record(z.unknown());
const DateTimeStringSchema = z.string().datetime({ offset: true });

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
  payload: JsonObjectSchema.default({}),
});

const EventTypeSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Event type must be lower-case dotted format");

const AppendEventRequestSchema = z.object({
  type: EventTypeSchema,
  message: z.string().min(1),
  payload: JsonObjectSchema.default({}),
});

const ApprovalTypeSchema = z.enum([
  "PRODUCTION_DEPLOY",
  "DATABASE_MIGRATION",
  "SECRET_CHANGE",
  "DESTRUCTIVE_OPERATION",
  "EXTERNAL_COST_RISK",
  "SECURITY_RISK",
]);

const CreateApprovalRequestSchema = z.object({
  type: ApprovalTypeSchema,
  requestedBy: z.string().min(1).optional(),
  reason: z.string().min(1),
  payload: JsonObjectSchema.default({}),
});

const DecideApprovalRequestSchema = z.object({
  status: z.enum(["approved", "rejected", "cancelled"]),
  decidedBy: z.string().min(1).optional(),
  decision: z.string().optional(),
});

const WorkerRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled", "skipped"]);
const WorkerRunModeSchema = z.enum(["dry-run", "mock", "real"]);
const WorkerTypeSchema = z.enum(["codex", "qa", "deploy", "monitor", "planner", "integration", "orchestrator"]);

const CreateWorkerRunRequestSchema = z.object({
  workerType: WorkerTypeSchema,
  status: WorkerRunStatusSchema,
  mode: WorkerRunModeSchema.default("dry-run"),
  command: z.string().optional(),
  stdoutPath: z.string().optional(),
  stderrPath: z.string().optional(),
  startedAt: DateTimeStringSchema.optional(),
  finishedAt: DateTimeStringSchema.optional(),
  exitCode: z.number().int().optional(),
  input: JsonObjectSchema.default({}),
  output: JsonObjectSchema.default({}),
  error: z.string().optional(),
  logs: z.array(z.string()).default([]),
  metadata: JsonObjectSchema.default({}),
});

const UpdateWorkerRunRequestSchema = CreateWorkerRunRequestSchema.omit({ workerType: true }).partial().extend({
  workerType: WorkerTypeSchema.optional(),
});

const CreateArtifactRequestSchema = z.object({
  type: z.string().min(1),
  name: z.string().optional(),
  path: z.string().min(1),
  workerRunId: z.string().min(1).optional(),
  content: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  metadata: JsonObjectSchema.default({}),
});

const BugStatusSchema = z.enum(["open", "in_progress", "fixed", "accepted", "wont_fix"]);

const CreateBugRequestSchema = z.object({
  qaRunId: z.string().min(1).optional(),
  title: z.string().min(1),
  severity: z.enum(["P0", "P1", "P2", "P3"]),
  status: BugStatusSchema.default("open"),
  reproductionSteps: z.array(z.string().min(1)).min(1),
  expectedResult: z.string().min(1),
  actualResult: z.string().min(1),
  evidence: JsonObjectSchema.default({}),
  suggestedFix: z.string().optional(),
  regressionTestPath: z.string().optional(),
  suggestedFixDirection: z.string().optional(),
  source: z.string().optional(),
});

const UpdateBugRequestSchema = CreateBugRequestSchema.partial();

const QARunStatusSchema = z.enum(["queued", "passed", "failed", "running", "cancelled"]);
const QARunModeSchema = z.enum(["dry-run", "mock", "playwright", "playwright-mcp", "deterministic", "ai_exploratory", "regression", "smoke"]);

const CreateQARunRequestSchema = z.object({
  targetUrl: z.string().url().optional(),
  mode: QARunModeSchema,
  status: QARunStatusSchema,
  summary: z.string().min(1),
  reportPath: z.string().optional(),
  screenshotsDir: z.string().optional(),
  tracePath: z.string().optional(),
  bugsJsonPath: z.string().optional(),
  stagingUrl: z.string().url().optional(),
  passed: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  startedAt: DateTimeStringSchema.optional(),
  finishedAt: DateTimeStringSchema.optional(),
});

const UpdateQARunRequestSchema = CreateQARunRequestSchema.partial();

export interface MissionServiceOptions {
  registryRoot?: string;
}

export function createMissionServices(storage: MissionStorage, options: MissionServiceOptions = {}) {
  const registryRoot = options.registryRoot ?? "projects";
  async function getMission(id: string) {
    const mission = await storage.getMission(id);
    if (!mission) {
      throw notFound("Mission", id);
    }
    return mission;
  }

  async function validateWorkerRunBelongsToMission(workerRunId: string, missionId: string) {
    const workerRun = await storage.getWorkerRun(workerRunId);
    if (!workerRun) {
      throw notFound("WorkerRun", workerRunId);
    }
    if (workerRun.mission_id !== missionId) {
      throw badRequest("VALIDATION_ERROR", "WorkerRun does not belong to Mission", { worker_run_id: workerRunId, mission_id: missionId });
    }
  }

  async function validateQARunBelongsToMission(qaRunId: string, missionId: string) {
    const qaRun = await storage.getQARun(qaRunId);
    if (!qaRun) {
      throw notFound("QARun", qaRunId);
    }
    if (qaRun.mission_id !== missionId) {
      throw badRequest("VALIDATION_ERROR", "QARun does not belong to Mission", { qa_run_id: qaRunId, mission_id: missionId });
    }
  }

  async function scanRegistryOrValidationError(root: string) {
    try {
      return await scanProjectRegistry(root);
    } catch (error) {
      if (error instanceof ProjectRegistryError) {
        throw badRequest("VALIDATION_ERROR", error.message, { code: error.code, ...error.details });
      }
      throw error;
    }
  }

  return {
    listProjects: () => storage.listProjects(),
    async getProject(id: string) {
      const project = await storage.getProject(id);
      if (!project) {
        throw notFound("Project", id);
      }
      return project;
    },
    async syncProjectRegistry() {
      const registryProjects = await scanRegistryOrValidationError(registryRoot);
      const projects = await storage.syncProjects(registryProjects.map((entry) => entry.project));
      return { synced: projects.length, projects };
    },
    async getProjectPassport(projectId: string) {
      const project = await storage.getProject(projectId);
      if (!project) {
        throw notFound("Project", projectId);
      }
      const registryProjects = await scanRegistryOrValidationError(registryRoot);
      const registryProject = findProjectById(registryProjects, projectId);
      if (!registryProject) {
        throw notFound("ProjectPassport", projectId);
      }
      return registryProject.passport;
    },
    listMissions: () => storage.listMissions(),
    getMission,
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
      const event = buildEvent(mission.id, "mission.created", "Mission created", { status: MissionStatus.received }, now);

      return storage.createMission({ mission, event });
    },
    async transitionMission(id: string, body: unknown) {
      const input = parseRequest(TransitionRequestSchema, body);
      const mission = await getMission(id);
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
      await getMission(id);
      const input = parseRequest(AppendEventRequestSchema, body);
      const event = buildEvent(id, input.type, input.message, input.payload ?? {});
      return storage.appendMissionEvent(event);
    },
    async listMissionEvents(id: string) {
      await getMission(id);
      return storage.listMissionEvents(id);
    },

    async createApproval(missionId: string, body: unknown) {
      await getMission(missionId);
      const input = parseRequest(CreateApprovalRequestSchema, body);
      const now = new Date().toISOString();
      const approval: Approval = {
        id: "approval-" + randomUUID(),
        mission_id: missionId,
        type: input.type,
        status: "pending",
        reason: input.reason,
        payload: input.payload ?? {},
        ...(input.requestedBy === undefined ? {} : { requested_by: input.requestedBy }),
        created_at: now,
      };
      const event = buildEvent(missionId, "approval.created", "Approval requested", { approval_id: approval.id, type: approval.type }, now);
      return storage.createApproval({ resource: approval, event });
    },
    async listMissionApprovals(missionId: string) {
      await getMission(missionId);
      return storage.listMissionApprovals(missionId);
    },
    async getApproval(id: string) {
      const approval = await storage.getApproval(id);
      if (!approval) {
        throw notFound("Approval", id);
      }
      return approval;
    },
    async decideApproval(id: string, body: unknown) {
      const current = await this.getApproval(id);
      if (current.status !== "pending") {
        throw badRequest("VALIDATION_ERROR", "Approval decision can only be recorded while approval is pending", { approval_id: id, status: current.status });
      }
      const input = parseRequest(DecideApprovalRequestSchema, body);
      const now = new Date().toISOString();
      const approval: Approval = {
        ...current,
        status: input.status,
        ...(input.decidedBy === undefined ? {} : { decided_by: input.decidedBy }),
        ...(input.decision === undefined ? {} : { decision: input.decision }),
        decided_at: now,
        ...(input.status === "approved" ? { approved_at: now } : {}),
        ...(input.status === "rejected" ? { rejected_at: now } : {}),
      };
      const event = buildEvent(approval.mission_id, "approval.decided", "Approval decided", { approval_id: approval.id, status: approval.status }, now);
      try {
        return await storage.decideApproval({ resource: approval, event });
      } catch (error) {
        if (error instanceof ApprovalDecisionConflictError) {
          throw badRequest("VALIDATION_ERROR", "Approval decision can only be recorded while approval is pending", { approval_id: id });
        }
        throw error;
      }
    },

    async createWorkerRun(missionId: string, body: unknown) {
      await getMission(missionId);
      const input = parseRequest(CreateWorkerRunRequestSchema, body);
      const now = new Date().toISOString();
      const workerRun: WorkerRun = {
        id: "worker-run-" + randomUUID(),
        mission_id: missionId,
        worker_type: input.workerType,
        status: input.status,
        mode: input.mode,
        ...(input.command === undefined ? {} : { command: input.command }),
        ...(input.stdoutPath === undefined ? {} : { stdout_path: input.stdoutPath }),
        ...(input.stderrPath === undefined ? {} : { stderr_path: input.stderrPath }),
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        ...(input.exitCode === undefined ? {} : { exit_code: input.exitCode }),
        input: input.input ?? {},
        output: input.output ?? {},
        ...(input.error === undefined ? {} : { error: input.error }),
        logs: input.logs ?? [],
        metadata: input.metadata ?? {},
        created_at: now,
        updated_at: now,
      };
      const event = buildEvent(missionId, "worker_run.created", "Worker run created", { worker_run_id: workerRun.id, status: workerRun.status }, now);
      return storage.createWorkerRun({ resource: workerRun, event });
    },
    async listMissionWorkerRuns(missionId: string) {
      await getMission(missionId);
      return storage.listMissionWorkerRuns(missionId);
    },
    async getWorkerRun(id: string) {
      const workerRun = await storage.getWorkerRun(id);
      if (!workerRun) {
        throw notFound("WorkerRun", id);
      }
      return workerRun;
    },
    async updateWorkerRun(id: string, body: unknown) {
      const current = await this.getWorkerRun(id);
      const input = parseRequest(UpdateWorkerRunRequestSchema, body);
      const now = new Date().toISOString();
      const workerRun: WorkerRun = {
        ...current,
        ...(input.workerType === undefined ? {} : { worker_type: input.workerType }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.command === undefined ? {} : { command: input.command }),
        ...(input.stdoutPath === undefined ? {} : { stdout_path: input.stdoutPath }),
        ...(input.stderrPath === undefined ? {} : { stderr_path: input.stderrPath }),
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        ...(input.exitCode === undefined ? {} : { exit_code: input.exitCode }),
        ...(input.input === undefined ? {} : { input: input.input }),
        ...(input.output === undefined ? {} : { output: input.output }),
        ...(input.error === undefined ? {} : { error: input.error }),
        ...(input.logs === undefined ? {} : { logs: input.logs }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        updated_at: now,
      };
      const event = buildEvent(workerRun.mission_id, "worker_run.updated", "Worker run updated", { worker_run_id: workerRun.id, status: workerRun.status }, now);
      return storage.updateWorkerRun({ resource: workerRun, event });
    },

    async createArtifact(missionId: string, body: unknown) {
      await getMission(missionId);
      const input = parseRequest(CreateArtifactRequestSchema, body);
      if (input.workerRunId !== undefined) {
        await validateWorkerRunBelongsToMission(input.workerRunId, missionId);
      }
      const now = new Date().toISOString();
      const artifact: Artifact = {
        id: "artifact-" + randomUUID(),
        mission_id: missionId,
        type: input.type,
        path: input.path,
        ...(input.workerRunId === undefined ? {} : { worker_run_id: input.workerRunId }),
        ...(input.content === undefined ? {} : { content: input.content }),
        ...(input.mimeType === undefined ? {} : { mime_type: input.mimeType }),
        size: input.size ?? Buffer.byteLength(input.content ?? "", "utf8"),
        metadata: input.name === undefined ? input.metadata ?? {} : { ...(input.metadata ?? {}), name: input.name },
        created_at: now,
      };
      const event = buildEvent(missionId, "artifact.created", "Artifact created", { artifact_id: artifact.id, type: artifact.type, path: artifact.path }, now);
      return storage.createArtifact({ resource: artifact, event });
    },
    async listMissionArtifacts(missionId: string) {
      await getMission(missionId);
      return storage.listMissionArtifacts(missionId);
    },
    async getArtifact(id: string) {
      const artifact = await storage.getArtifact(id);
      if (!artifact) {
        throw notFound("Artifact", id);
      }
      return artifact;
    },

    async createBug(missionId: string, body: unknown) {
      await getMission(missionId);
      const input = parseRequest(CreateBugRequestSchema, body);
      if (input.qaRunId !== undefined) {
        await validateQARunBelongsToMission(input.qaRunId, missionId);
      }
      const now = new Date().toISOString();
      const bug: BugReport = {
        id: "bug-" + randomUUID(),
        mission_id: missionId,
        ...(input.qaRunId === undefined ? {} : { qa_run_id: input.qaRunId }),
        title: input.title,
        severity: input.severity,
        status: input.status ?? "open",
        reproduction_steps: input.reproductionSteps,
        expected_result: input.expectedResult,
        actual_result: input.actualResult,
        evidence: input.evidence ?? {},
        ...(input.suggestedFix === undefined ? {} : { suggested_fix: input.suggestedFix }),
        ...(input.regressionTestPath === undefined ? {} : { regression_test_path: input.regressionTestPath }),
        ...(input.suggestedFixDirection === undefined ? {} : { suggested_fix_direction: input.suggestedFixDirection }),
        ...(input.source === undefined ? {} : { source: input.source }),
        created_at: now,
        updated_at: now,
      };
      const event = buildEvent(missionId, "bug.created", "Bug report created", { bug_id: bug.id, severity: bug.severity, status: bug.status }, now);
      return storage.createBug({ resource: bug, event });
    },
    async listMissionBugs(missionId: string) {
      await getMission(missionId);
      return storage.listMissionBugs(missionId);
    },
    async getBug(id: string) {
      const bug = await storage.getBug(id);
      if (!bug) {
        throw notFound("BugReport", id);
      }
      return bug;
    },
    async updateBug(id: string, body: unknown) {
      const current = await this.getBug(id);
      const input = parseRequest(UpdateBugRequestSchema, body);
      if (input.qaRunId !== undefined) {
        await validateQARunBelongsToMission(input.qaRunId, current.mission_id);
      }
      const now = new Date().toISOString();
      const bug: BugReport = {
        ...current,
        ...(input.qaRunId === undefined ? {} : { qa_run_id: input.qaRunId }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.severity === undefined ? {} : { severity: input.severity }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.reproductionSteps === undefined ? {} : { reproduction_steps: input.reproductionSteps }),
        ...(input.expectedResult === undefined ? {} : { expected_result: input.expectedResult }),
        ...(input.actualResult === undefined ? {} : { actual_result: input.actualResult }),
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
        ...(input.suggestedFix === undefined ? {} : { suggested_fix: input.suggestedFix }),
        ...(input.regressionTestPath === undefined ? {} : { regression_test_path: input.regressionTestPath }),
        ...(input.suggestedFixDirection === undefined ? {} : { suggested_fix_direction: input.suggestedFixDirection }),
        ...(input.source === undefined ? {} : { source: input.source }),
        updated_at: now,
      };
      const event = buildEvent(bug.mission_id, "bug.updated", "Bug report updated", { bug_id: bug.id, status: bug.status }, now);
      return storage.updateBug({ resource: bug, event });
    },

    async createQARun(missionId: string, body: unknown) {
      await getMission(missionId);
      const input = parseRequest(CreateQARunRequestSchema, body);
      const now = new Date().toISOString();
      const qaRun: QAReport = {
        id: "qa-run-" + randomUUID(),
        mission_id: missionId,
        target_url: input.targetUrl ?? input.stagingUrl ?? "",
        mode: input.mode,
        status: input.status,
        summary: input.summary,
        ...(input.reportPath === undefined ? {} : { report_path: input.reportPath }),
        ...(input.screenshotsDir === undefined ? {} : { screenshots_dir: input.screenshotsDir }),
        ...(input.tracePath === undefined ? {} : { trace_path: input.tracePath }),
        ...(input.bugsJsonPath === undefined ? {} : { bugs_json_path: input.bugsJsonPath }),
        ...(input.stagingUrl === undefined ? {} : { staging_url: input.stagingUrl }),
        passed: input.passed ?? 0,
        failed: input.failed ?? 0,
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        bugs: [],
        created_at: now,
        updated_at: now,
      };
      const event = buildEvent(missionId, "qa_run.created", "QA run created", { qa_run_id: qaRun.id, status: qaRun.status }, now);
      return storage.createQARun({ resource: qaRun, event });
    },
    async listMissionQARuns(missionId: string) {
      await getMission(missionId);
      return storage.listMissionQARuns(missionId);
    },
    async getQARun(id: string) {
      const qaRun = await storage.getQARun(id);
      if (!qaRun) {
        throw notFound("QARun", id);
      }
      return qaRun;
    },
    async updateQARun(id: string, body: unknown) {
      const current = await this.getQARun(id);
      const input = parseRequest(UpdateQARunRequestSchema, body);
      const now = new Date().toISOString();
      const qaRun: QAReport = {
        ...current,
        ...(input.targetUrl === undefined ? {} : { target_url: input.targetUrl }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.reportPath === undefined ? {} : { report_path: input.reportPath }),
        ...(input.screenshotsDir === undefined ? {} : { screenshots_dir: input.screenshotsDir }),
        ...(input.tracePath === undefined ? {} : { trace_path: input.tracePath }),
        ...(input.bugsJsonPath === undefined ? {} : { bugs_json_path: input.bugsJsonPath }),
        ...(input.stagingUrl === undefined ? {} : { staging_url: input.stagingUrl }),
        ...(input.passed === undefined ? {} : { passed: input.passed }),
        ...(input.failed === undefined ? {} : { failed: input.failed }),
        ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
        ...(input.finishedAt === undefined ? {} : { finished_at: input.finishedAt }),
        updated_at: now,
      };
      const event = buildEvent(qaRun.mission_id, "qa_run.updated", "QA run updated", { qa_run_id: qaRun.id, status: qaRun.status }, now);
      return storage.updateQARun({ resource: qaRun, event });
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

function buildEvent(missionId: string, type: string, message: string, payload: Record<string, unknown>, createdAt = new Date().toISOString()): MissionEvent {
  return {
    id: randomUUID(),
    mission_id: missionId,
    type,
    message,
    payload,
    created_at: createdAt,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mission";
}
