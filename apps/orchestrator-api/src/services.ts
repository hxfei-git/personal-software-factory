import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listIntegrationStatuses,
  runIntegrationDryRun,
  isSecretLikeName,
  redactValue,
  type ExternalIntegrationName,
  type GitHubDryRunInput,
  type CoolifyDryRunInput,
  type UptimeKumaDryRunInput,
  type PlaneDryRunInput,
} from "@psf/integrations";
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
import { canTransition, transitionMission as buildTransition } from "@psf/mission-core";
import { createDeterministicMissionPlan } from "@psf/mission-planner";
import { ProjectRegistryError, findProjectById, scanProjectRegistry } from "@psf/project-registry";
import { z } from "zod";
import {
  runAiNovelistDemoAction as runAiNovelistDemoDryRunAction,
  runCodexDryRunAction as runCodexDryRunDryRunAction,
  runFixDryRunAction as runFixDryRunDryRunAction,
  runLoopDryRunAction as runLoopDryRunDryRunAction,
  runMissionPlanAction as runMissionPlanDryRunAction,
  runQaDryRunAction as runQaDryRunDryRunAction,
} from "./actions.js";
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

const PlanMissionRequestSchema = z.object({
  userRequirement: z.string().min(1).optional(),
  qaCharter: z.string().optional(),
  title: z.string().min(1).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
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
const IntegrationNameParamSchema = z.enum(["github", "coolify", "uptime_kuma", "uptime-kuma", "plane"]);
const IntegrationDryRunRequestSchema = z.record(z.unknown());

type IntegrationDryRunInput = GitHubDryRunInput | CoolifyDryRunInput | UptimeKumaDryRunInput | PlaneDryRunInput;

export interface MissionServiceOptions {
  registryRoot?: string;
}

export function createMissionServices(storage: MissionStorage, options: MissionServiceOptions = {}) {
  const registryRoot = options.registryRoot ?? "projects";
  async function getRawMission(id: string) {
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

  async function getRegistryProject(projectId: string) {
    const registryProjects = await scanRegistryOrValidationError(registryRoot);
    const registryProject = findProjectById(registryProjects, projectId);
    if (!registryProject) {
      throw notFound("ProjectPassport", projectId);
    }
    return registryProject;
  }

  async function readQaCharterNextToPassport(passportPath: string) {
    const qaCharterPath = join(dirname(passportPath), "qa-charter.md");
    try {
      return await readFile(qaCharterPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return "";
      }
      throw badRequest("VALIDATION_ERROR", "Unable to read QA charter", { path: qaCharterPath, cause: errorMessage(error) });
    }
  }

  async function getExistingPlannerResult(missionId: string) {
    return getExistingPlannerResultFromStorage(storage, missionId);
  }

  function sanitizeApiResponse<T>(value: T): T {
    return sanitizeApiValue(value) as T;
  }

  function sanitizeApiValue(value: unknown, keyName?: string): unknown {
    if (typeof keyName === "string" && isSecretLikeName(keyName)) {
      return (redactValue({ [keyName]: value }, process.env) as Record<string, unknown>)[keyName];
    }

    if (typeof value === "string") {
      return isPlainSafeUrl(value) ? value : redactValue(value, process.env);
    }

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeApiValue(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeApiValue(entryValue, entryKey)]),
      );
    }

    return value;
  }

  function isPlainSafeUrl(value: string): boolean {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return false;
      }
      if (url.username || url.password) {
        return false;
      }
      return [...url.searchParams.keys()].every((key) => !isSecretLikeName(key));
    } catch {
      return false;
    }
  }

  function sanitizeApiList<T>(values: T[]): T[] {
    return values.map((value) => sanitizeApiResponse(value));
  }

  async function getRawApproval(id: string) {
    const approval = await storage.getApproval(id);
    if (!approval) {
      throw notFound("Approval", id);
    }
    return approval;
  }

  async function getRawWorkerRun(id: string) {
    const workerRun = await storage.getWorkerRun(id);
    if (!workerRun) {
      throw notFound("WorkerRun", id);
    }
    return workerRun;
  }

  async function getRawBug(id: string) {
    const bug = await storage.getBug(id);
    if (!bug) {
      throw notFound("BugReport", id);
    }
    return bug;
  }

  async function getRawQARun(id: string) {
    const qaRun = await storage.getQARun(id);
    if (!qaRun) {
      throw notFound("QARun", id);
    }
    return qaRun;
  }

  return {
    async getDashboard() {
      const [projects, missions, approvals, workerRuns, artifacts, bugs, qaRuns] = await Promise.all([
        storage.listProjects(),
        storage.listMissions(),
        storage.listAllApprovals(),
        storage.listAllWorkerRuns(),
        storage.listAllArtifacts(),
        storage.listAllBugs(),
        storage.listAllQARuns(),
      ]);
      const metrics = {
        projectCount: projects.length,
        missionCount: missions.length,
        runningMissionCount: missions.filter(isRunningMission).length,
        failedMissionCount: missions.filter((mission) => mission.status === MissionStatus.failed).length,
        readyForReviewMissionCount: missions.filter((mission) => mission.status === MissionStatus.ready_for_review).length,
        qaRunCount: qaRuns.length,
        qaFailedCount: qaRuns.filter((qaRun) => qaRun.status === "failed" || (qaRun.failed ?? 0) > 0).length,
        bugCount: bugs.length,
        openBugCount: bugs.filter(isOpenBug).length,
        p0p1BugCount: bugs.filter((bug) => bug.severity === "P0" || bug.severity === "P1").length,
        pendingApprovalCount: approvals.filter((approval) => approval.status === "pending").length,
        workerRunCount: workerRuns.length,
        artifactCount: artifacts.length,
      };

      return {
        metrics,
        recentMissions: sanitizeApiList(recentByCreatedAt(missions)),
        recentBugs: sanitizeApiList(recentByCreatedAt(bugs)),
        recentWorkerRuns: sanitizeApiList(recentByCreatedAt(workerRuns)),
        recentFailedWorkerRuns: sanitizeApiList(recentByCreatedAt(workerRuns.filter((workerRun) => workerRun.status === "failed"))),
        recentQaRuns: sanitizeApiList(recentByCreatedAt(qaRuns)),
        recentArtifacts: sanitizeApiList(recentByCreatedAt(artifacts)),
        integrationStatuses: listIntegrationStatuses({ env: process.env }),
        recommendedNextActions: buildDashboardRecommendedNextActions(metrics),
        healthSignals: buildDashboardHealthSignals(metrics),
      };
    },
    listProjects: async () => sanitizeApiList(await storage.listProjects()),
    async getProject(id: string) {
      const project = await storage.getProject(id);
      if (!project) {
        throw notFound("Project", id);
      }
      return sanitizeApiResponse(project);
    },
    async syncProjectRegistry() {
      const registryProjects = await scanRegistryOrValidationError(registryRoot);
      const projects = await storage.syncProjects(registryProjects.map((entry) => entry.project));
      return sanitizeApiResponse({ synced: projects.length, projects });
    },
    async getProjectPassport(projectId: string) {
      const project = await storage.getProject(projectId);
      if (!project) {
        throw notFound("Project", projectId);
      }
      return sanitizeApiResponse((await getRegistryProject(projectId)).passport);
    },
    listMissions: async () => sanitizeApiList(await storage.listMissions()),
    async getMission(id: string) {
      return sanitizeApiResponse(await getRawMission(id));
    },
    async getMissionSummary(id: string) {
      const mission = await getRawMission(id);
      const project = await storage.getProject(mission.project_id);
      if (!project) {
        throw notFound("Project", mission.project_id);
      }
      const [events, artifacts, workerRuns, qaRuns, bugs, approvals] = await Promise.all([
        storage.listMissionEvents(id),
        storage.listMissionArtifacts(id),
        storage.listMissionWorkerRuns(id),
        storage.listMissionQARuns(id),
        storage.listMissionBugs(id),
        storage.listMissionApprovals(id),
      ]);

      const safeEvents = sanitizeApiList(events);
      const safeArtifacts = sanitizeApiList(artifacts);
      const safeWorkerRuns = sanitizeApiList(workerRuns);
      const safeQARuns = sanitizeApiList(qaRuns);
      const safeBugs = sanitizeApiList(bugs);
      const safeApprovals = sanitizeApiList(approvals);

      return {
        mission: sanitizeApiResponse(mission),
        project: sanitizeApiResponse(project),
        currentStatus: mission.status,
        events: safeEvents,
        artifacts: safeArtifacts,
        workerRuns: safeWorkerRuns,
        qaRuns: safeQARuns,
        bugs: safeBugs,
        approvals: safeApprovals,
        qaReportArtifact: findArtifactByType(safeArtifacts, "qa_report"),
        bugsJsonArtifact: findArtifactByType(safeArtifacts, "bugs_json"),
        codexPromptArtifact: findArtifactByType(safeArtifacts, "codex_prompt"),
        codexCommandArtifact: findArtifactByType(safeArtifacts, "codex_command"),
        fixMissionArtifact: findArtifactByType(safeArtifacts, "fix_mission"),
        fixCodexCommandArtifact: findArtifactByType(safeArtifacts, "fix_codex_command"),
        recommendedNextAction: buildMissionRecommendedNextAction(mission, bugs, approvals, qaRuns, workerRuns),
      };
    },
    listIntegrations() {
      return listIntegrationStatuses({ env: process.env });
    },
    runIntegrationDryRun(name: string, body: unknown) {
      const integrationName = parseRequest(IntegrationNameParamSchema, name) as ExternalIntegrationName;
      const input = parseRequest(IntegrationDryRunRequestSchema, body ?? {});
      return runIntegrationDryRun(integrationName, { ...input, env: process.env } as IntegrationDryRunInput);
    },
    async runMissionPlanAction(id: string, body: unknown) {
      await getRawMission(id);
      return sanitizeApiResponse(await runMissionPlanDryRunAction(id, body));
    },
    async runCodexDryRunAction(id: string, body: unknown) {
      await getRawMission(id);
      return sanitizeApiResponse(await runCodexDryRunDryRunAction(id, body));
    },
    async runQaDryRunAction(id: string, body: unknown) {
      await getRawMission(id);
      return sanitizeApiResponse(await runQaDryRunDryRunAction(id, body));
    },
    async runFixDryRunAction(id: string, body: unknown) {
      await getRawMission(id);
      return sanitizeApiResponse(await runFixDryRunDryRunAction(id, body));
    },
    async runLoopDryRunAction(id: string, body: unknown) {
      await getRawMission(id);
      return sanitizeApiResponse(await runLoopDryRunDryRunAction(id, body));
    },
    async runAiNovelistDemoAction(body: unknown) {
      return sanitizeApiResponse(await runAiNovelistDemoDryRunAction(body));
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
      const event = buildEvent(mission.id, "mission.created", "Mission created", { status: MissionStatus.received }, now);

      return sanitizeApiResponse(await storage.createMission({ mission, event }));
    },
    async planMission(id: string, body: unknown) {
      const input = parseRequest(PlanMissionRequestSchema, body ?? {});
      const mission = await getRawMission(id);
      if (mission.status !== MissionStatus.received && mission.status !== MissionStatus.planning && mission.status !== MissionStatus.planned) {
        throw invalidTransition(`Mission planning is not valid while status is ${mission.status}`);
      }

      const existing = await getExistingPlannerResult(mission.id);
      if (existing && mission.status === MissionStatus.planned) {
        return sanitizeApiResponse(buildPersistedPlanResponse(mission, existing));
      }
      if (existing && mission.status === MissionStatus.planning) {
        const completed = buildPlanningTransition(
          mission.id,
          MissionStatus.planning,
          MissionStatus.planned,
          nextTimestamp(existing.events.at(-1)?.created_at ?? new Date().toISOString()),
        );
        await storage.transitionMission(mission.id, completed.status, completed.event);
        return sanitizeApiResponse(buildPersistedPlanResponse(mission, existing));
      }
      if (mission.status === MissionStatus.planned) {
        throw invalidTransition("Mission is already planned but planner resources are missing");
      }

      const project = await storage.getProject(mission.project_id);
      if (!project) {
        throw notFound("Project", mission.project_id);
      }
      const registryProject = await getRegistryProject(project.id);
      const qaCharter = input.qaCharter ?? await readQaCharterNextToPassport(registryProject.passportPath);
      const plan = createDeterministicMissionPlan({
        projectId: project.id,
        userRequirement: input.userRequirement ?? mission.raw_request,
        passport: registryProject.passport,
        qaCharter,
        title: input.title ?? mission.title,
        priority: input.priority ?? mission.priority,
        missionId: mission.id,
      });

      let currentStatus: Mission["status"] = mission.status;
      let plannerEventBaseTimestamp = new Date().toISOString();
      if (currentStatus === MissionStatus.received) {
        const started = buildPlanningTransition(mission.id, MissionStatus.received, MissionStatus.planning);
        await storage.transitionMission(mission.id, started.status, started.event);
        currentStatus = started.status;
        plannerEventBaseTimestamp = started.event.created_at;
      }

      const plannerEvents = normalizePlannerEventTimestamps(plan.events, mission.id, plannerEventBaseTimestamp);
      const persisted = existing ?? await storage.recordPlannerResult({
        workerRun: plan.workerRun,
        artifacts: plan.artifacts,
        events: plannerEvents,
      });

      if (currentStatus === MissionStatus.planning) {
        const completed = buildPlanningTransition(
          mission.id,
          MissionStatus.planning,
          MissionStatus.planned,
          nextTimestamp(plannerEvents.at(-1)?.created_at ?? new Date().toISOString()),
        );
        await storage.transitionMission(mission.id, completed.status, completed.event);
      }

      return sanitizeApiResponse(buildPlanResponse(plan, persisted));
    },
    async transitionMission(id: string, body: unknown) {
      const input = parseRequest(TransitionRequestSchema, body);
      const mission = await getRawMission(id);
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
      await getRawMission(id);
      const input = parseRequest(AppendEventRequestSchema, body);
      const event = buildEvent(id, input.type, input.message, input.payload ?? {});
      return sanitizeApiResponse(await storage.appendMissionEvent(event));
    },
    async listMissionEvents(id: string) {
      await getRawMission(id);
      return sanitizeApiList(await storage.listMissionEvents(id));
    },

    async createApproval(missionId: string, body: unknown) {
      await getRawMission(missionId);
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
      return sanitizeApiResponse(await storage.createApproval({ resource: approval, event }));
    },
    async listMissionApprovals(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionApprovals(missionId));
    },
    async getApproval(id: string) {
      return sanitizeApiResponse(await getRawApproval(id));
    },
    async decideApproval(id: string, body: unknown) {
      const current = await getRawApproval(id);
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
        return sanitizeApiResponse(await storage.decideApproval({ resource: approval, event }));
      } catch (error) {
        if (error instanceof ApprovalDecisionConflictError) {
          throw badRequest("VALIDATION_ERROR", "Approval decision can only be recorded while approval is pending", { approval_id: id });
        }
        throw error;
      }
    },

    async createWorkerRun(missionId: string, body: unknown) {
      await getRawMission(missionId);
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
      return sanitizeApiResponse(await storage.createWorkerRun({ resource: workerRun, event }));
    },
    async listMissionWorkerRuns(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionWorkerRuns(missionId));
    },
    async getWorkerRun(id: string) {
      return sanitizeApiResponse(await getRawWorkerRun(id));
    },
    async updateWorkerRun(id: string, body: unknown) {
      const current = await getRawWorkerRun(id);
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
      return sanitizeApiResponse(await storage.updateWorkerRun({ resource: workerRun, event }));
    },

    async createArtifact(missionId: string, body: unknown) {
      await getRawMission(missionId);
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
      return sanitizeApiResponse(await storage.createArtifact({ resource: artifact, event }));
    },
    async listMissionArtifacts(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionArtifacts(missionId));
    },
    async getArtifact(id: string) {
      const artifact = await storage.getArtifact(id);
      if (!artifact) {
        throw notFound("Artifact", id);
      }
      return sanitizeApiResponse(artifact);
    },

    async createBug(missionId: string, body: unknown) {
      await getRawMission(missionId);
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
      return sanitizeApiResponse(await storage.createBug({ resource: bug, event }));
    },
    async listMissionBugs(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionBugs(missionId));
    },
    async getBug(id: string) {
      return sanitizeApiResponse(await getRawBug(id));
    },
    async updateBug(id: string, body: unknown) {
      const current = await getRawBug(id);
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
      return sanitizeApiResponse(await storage.updateBug({ resource: bug, event }));
    },

    async createQARun(missionId: string, body: unknown) {
      await getRawMission(missionId);
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
      return sanitizeApiResponse(await storage.createQARun({ resource: qaRun, event }));
    },
    async listMissionQARuns(missionId: string) {
      await getRawMission(missionId);
      return sanitizeApiList(await storage.listMissionQARuns(missionId));
    },
    async getQARun(id: string) {
      return sanitizeApiResponse(await getRawQARun(id));
    },
    async updateQARun(id: string, body: unknown) {
      const current = await getRawQARun(id);
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
      return sanitizeApiResponse(await storage.updateQARun({ resource: qaRun, event }));
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

type PlannerResultResources = {
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
};

type PlannerResponsePlan = {
  missionId: string;
  title: string;
  files: Array<{ name: string; content: string }>;
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
};

const plannerFileNames = ["mission.md", "acceptance.md", "technical-notes.md", "risk-notes.md"] as const;
const plannerEventIds = ["planning-started", "planning-completed"] as const;

async function getExistingPlannerResultFromStorage(storage: MissionStorage, missionId: string): Promise<PlannerResultResources | null> {
  const workerRun = await storage.getWorkerRun(`worker-run-${missionId}-planner`);
  if (!workerRun || workerRun.mission_id !== missionId) {
    return null;
  }

  const missionArtifacts = await storage.listMissionArtifacts(missionId);
  const artifacts = [];
  for (const fileName of plannerFileNames) {
    const existing = missionArtifacts.find((artifact) => artifact.path === `missions/${missionId}/${fileName}`);
    if (!existing) {
      return null;
    }
    artifacts.push(existing);
  }

  const missionEvents = await storage.listMissionEvents(missionId);
  const events = [];
  for (const idSuffix of plannerEventIds) {
    const existing = missionEvents.find((candidate) => candidate.id === `event-${missionId}-${idSuffix}`);
    if (!existing) {
      return null;
    }
    events.push(existing);
  }

  return { workerRun, artifacts, events };
}

function buildPlanResponse(plan: PlannerResponsePlan, persisted: PlannerResultResources) {
  return {
    missionId: plan.missionId,
    title: plan.title,
    files: plan.files.map((file) => ({
      name: file.name,
      path: `missions/${plan.missionId}/${file.name}`,
      size: Buffer.byteLength(file.content, "utf8"),
    })),
    workerRun: persisted.workerRun,
    artifacts: persisted.artifacts.map(compactArtifact),
    events: persisted.events,
  };
}

function buildPersistedPlanResponse(mission: Mission, persisted: PlannerResultResources) {
  return {
    missionId: mission.id,
    title: typeof persisted.workerRun.input.title === "string" ? persisted.workerRun.input.title : mission.title,
    files: persisted.artifacts.map((artifact) => ({
      name: fileNameFromPath(artifact.path),
      path: artifact.path,
      size: artifact.size,
    })),
    workerRun: persisted.workerRun,
    artifacts: persisted.artifacts.map(compactArtifact),
    events: persisted.events,
  };
}

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function normalizePlannerEventTimestamps(events: MissionEvent[], missionId: string, afterTimestamp: string): MissionEvent[] {
  const base = new Date(afterTimestamp).getTime();
  return events.map((event, index) => ({
    ...event,
    mission_id: missionId,
    created_at: new Date(base + index + 1).toISOString(),
  }));
}

function nextTimestamp(value: string): string {
  return new Date(new Date(value).getTime() + 1).toISOString();
}

function buildPlanningTransition(missionId: string, from: Mission["status"], to: Mission["status"], createdAt?: string) {
  if (!canTransition(from, to)) {
    throw invalidTransition(`Invalid Mission transition from ${from} to ${to}`);
  }
  const result = buildTransition({
    mission_id: missionId,
    from,
    to,
    actor: "mission-planner",
    payload: { source: "mission-planner" },
  });
  return createdAt === undefined ? result : { ...result, event: { ...result.event, created_at: createdAt } };
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

const runningMissionStatuses = new Set<Mission["status"]>([
  MissionStatus.planning,
  MissionStatus.dev_queued,
  MissionStatus.dev_running,
  MissionStatus.build_running,
  MissionStatus.test_running,
  MissionStatus.staging_deploying,
  MissionStatus.qa_running,
  MissionStatus.fixing,
  MissionStatus.regression_running,
  MissionStatus.production_deploying,
]);

const openBugStatuses = new Set<BugReport["status"]>(["open", "in_progress"]);

type DashboardMetrics = {
  projectCount: number;
  missionCount: number;
  runningMissionCount: number;
  failedMissionCount: number;
  readyForReviewMissionCount: number;
  qaRunCount: number;
  qaFailedCount: number;
  bugCount: number;
  openBugCount: number;
  p0p1BugCount: number;
  pendingApprovalCount: number;
  workerRunCount: number;
  artifactCount: number;
};

function isRunningMission(mission: Mission): boolean {
  return runningMissionStatuses.has(mission.status);
}

function isOpenBug(bug: BugReport): boolean {
  return openBugStatuses.has(bug.status);
}

function recentByCreatedAt<T extends { id: string; created_at?: string | undefined }>(items: T[], limit = 5): T[] {
  return [...items].sort(compareCreatedAtDesc).slice(0, limit);
}

function compareCreatedAtDesc(left: { id: string; created_at?: string | undefined }, right: { id: string; created_at?: string | undefined }): number {
  const byCreatedAt = (right.created_at ?? "").localeCompare(left.created_at ?? "");
  return byCreatedAt === 0 ? right.id.localeCompare(left.id) : byCreatedAt;
}

function buildDashboardRecommendedNextActions(metrics: DashboardMetrics): string[] {
  const actions = [];
  if (metrics.pendingApprovalCount > 0) {
    actions.push("Review pending approvals before continuing gated work.");
  }
  if (metrics.p0p1BugCount > 0) {
    actions.push("Triage P0/P1 bugs and schedule fixes before release review.");
  }
  if (metrics.failedMissionCount > 0 || metrics.qaFailedCount > 0) {
    actions.push("Inspect failed missions or QA runs and collect evidence.");
  }
  if (metrics.readyForReviewMissionCount > 0) {
    actions.push("Open ready-for-review missions and prepare PR review notes.");
  }
  return actions.length === 0 ? ["No urgent action detected; continue with the next planned mission."] : actions;
}

function buildDashboardHealthSignals(metrics: DashboardMetrics) {
  return [
    {
      key: "mission_failures",
      status: metrics.failedMissionCount > 0 ? "warning" : "ok",
      count: metrics.failedMissionCount,
      message: metrics.failedMissionCount > 0 ? "Some missions are failed." : "No failed missions.",
    },
    {
      key: "qa_failures",
      status: metrics.qaFailedCount > 0 ? "warning" : "ok",
      count: metrics.qaFailedCount,
      message: metrics.qaFailedCount > 0 ? "Some QA runs failed." : "No failed QA runs.",
    },
    {
      key: "pending_approvals",
      status: metrics.pendingApprovalCount > 0 ? "attention" : "ok",
      count: metrics.pendingApprovalCount,
      message: metrics.pendingApprovalCount > 0 ? "Approvals are waiting for a decision." : "No pending approvals.",
    },
  ];
}

function findArtifactByType(artifacts: Artifact[], type: Artifact["type"]): Artifact | null {
  return artifacts.find((artifact) => artifact.type === type) ?? null;
}

function buildMissionRecommendedNextAction(
  mission: Mission,
  bugs: BugReport[],
  approvals: Approval[],
  qaRuns: QAReport[],
  workerRuns: WorkerRun[],
): string {
  if (approvals.some((approval) => approval.status === "pending")) {
    return "Review pending approval requests for this mission.";
  }
  if (bugs.some(isOpenBug)) {
    return "Fix or triage open QA bugs before advancing the mission.";
  }
  if (qaRuns.some((qaRun) => qaRun.status === "failed" || (qaRun.failed ?? 0) > 0)) {
    return "Review failed QA evidence and decide whether a fix mission is needed.";
  }
  if (workerRuns.some((workerRun) => workerRun.status === "failed")) {
    return "Inspect failed worker run logs and retry after addressing the error.";
  }
  if (mission.status === MissionStatus.ready_for_review) {
    return "Prepare human review and PR handoff for this mission.";
  }
  return "Continue the mission according to its current status.";
}

function compactArtifact(artifact: Artifact) {
  return {
    id: artifact.id,
    mission_id: artifact.mission_id,
    type: artifact.type,
    path: artifact.path,
    ...(artifact.worker_run_id === undefined ? {} : { worker_run_id: artifact.worker_run_id }),
    ...(artifact.mime_type === undefined ? {} : { mime_type: artifact.mime_type }),
    size: artifact.size,
    metadata: artifact.metadata,
    created_at: artifact.created_at,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mission";
}
