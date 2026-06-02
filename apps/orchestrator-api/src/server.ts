import { createWorkerRuntimeFromEnv, type WorkerRuntime } from "@psf/worker-runtime";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { registerApiAuth, type ApiAuthOptions } from "./auth.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { createMissionServices } from "./services.js";
import type { ActionExecutionMode } from "./actions.js";
import type { MissionStorage } from "./storage.js";

export interface BuildServerOptions {
  storage: MissionStorage;
  auth?: ApiAuthOptions;
  registryRoot?: string;
  actionExecutionMode?: ActionExecutionMode;
  workerRuntime?: WorkerRuntime;
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const server = Fastify({ logger: false });
  server.addHook("onRequest", async (request, reply) => {
    applyCorsHeaders(reply);
    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  registerApiAuth(server, options.auth ?? {
    ...(process.env.PSF_API_TOKEN === undefined ? {} : { token: process.env.PSF_API_TOKEN }),
    disabled: process.env.PSF_AUTH_DISABLED === "true" || process.env.NODE_ENV === "test",
  });
  const registryRoot = options.registryRoot ?? process.env.PSF_PROJECTS_ROOT;
  const actionExecutionMode = options.actionExecutionMode ?? readActionExecutionMode(process.env.PSF_ACTION_EXECUTION_MODE);
  const workerRuntime = options.workerRuntime ?? createWorkerRuntimeFromEnv();
  const services = createMissionServices(options.storage, {
    ...(registryRoot === undefined ? {} : { registryRoot }),
    actionExecutionMode,
    workerRuntime,
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send(toErrorResponse(error));
      return;
    }
    reply.status(500).send({ code: "INTERNAL_SERVER_ERROR", message: "Unexpected server error" });
  });

  server.get("/health", async () => ({ status: "ok" }));
  server.get("/dashboard", async () => services.getDashboard());

  server.get("/queues/status", async () => services.getQueueStatus());
  server.get<{ Params: { jobId: string } }>("/jobs/:jobId", async (request) => services.getQueueJob(request.params.jobId));

  server.get("/integrations", async () => services.listIntegrations());
  server.post<{ Params: { name: string } }>("/integrations/:name/dry-run", async (request) => {
    return services.runIntegrationDryRun(request.params.name, request.body);
  });

  server.get("/projects", async () => services.listProjects());
  server.post("/projects/sync", async () => services.syncProjectRegistry());
  server.get<{ Params: { projectId: string } }>("/projects/:projectId/passport", async (request) => {
    return services.getProjectPassport(request.params.projectId);
  });
  server.get<{ Params: { id: string } }>("/projects/:id", async (request) => services.getProject(request.params.id));

  server.post("/missions", async (request, reply) => {
    const mission = await services.createMission(request.body);
    return reply.status(201).send(mission);
  });
  server.get("/missions", async () => services.listMissions());
  server.get<{ Params: { id: string } }>("/missions/:id/summary", async (request) => services.getMissionSummary(request.params.id));
  server.get<{ Params: { id: string } }>("/missions/:id", async (request) => services.getMission(request.params.id));

  server.post<{ Params: { id: string } }>("/missions/:id/plan", async (request) => {
    return services.planMission(request.params.id, request.body);
  });

  server.post<{ Params: { id: string } }>("/missions/:id/actions/plan", async (request, reply) => {
    return sendActionResponse(reply, await services.runMissionPlanAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/codex-dry-run", async (request, reply) => {
    return sendActionResponse(reply, await services.runCodexDryRunAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/qa-dry-run", async (request, reply) => {
    return sendActionResponse(reply, await services.runQaDryRunAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/fix-dry-run", async (request, reply) => {
    return sendActionResponse(reply, await services.runFixDryRunAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/loop-dry-run", async (request, reply) => {
    return sendActionResponse(reply, await services.runLoopDryRunAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/codex-real", async (request, reply) => {
    return sendActionResponse(reply, await services.runCodexRealAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/qa-playwright", async (request, reply) => {
    return sendActionResponse(reply, await services.runQaPlaywrightAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/qa-ai-exploratory", async (request, reply) => {
    return sendActionResponse(reply, await services.runQaAiExploratoryAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/fix-real", async (request, reply) => {
    return sendActionResponse(reply, await services.runFixRealAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/github-pr", async (request, reply) => {
    return sendActionResponse(reply, await services.runGithubPrAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/deploy-staging", async (request, reply) => {
    return sendActionResponse(reply, await services.runDeployStagingAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/monitor-sync", async (request, reply) => {
    return sendActionResponse(reply, await services.runMonitorSyncAction(request.params.id, request.body));
  });
  server.post<{ Params: { id: string } }>("/missions/:id/actions/plane-sync", async (request, reply) => {
    return sendActionResponse(reply, await services.runPlaneSyncAction(request.params.id, request.body));
  });
  server.post("/demo/ai-novelist", async (request, reply) => {
    return sendActionResponse(reply, await services.runAiNovelistDemoAction(request.body));
  });

  server.post<{ Params: { id: string } }>("/missions/:id/transition", async (request) => {
    return services.transitionMission(request.params.id, request.body);
  });

  server.post<{ Params: { id: string } }>("/missions/:id/events", async (request, reply) => {
    const event = await services.appendMissionEvent(request.params.id, request.body);
    return reply.status(201).send(event);
  });

  server.get<{ Params: { id: string } }>("/missions/:id/events", async (request) => {
    return services.listMissionEvents(request.params.id);
  });

  server.post<{ Params: { missionId: string } }>("/missions/:missionId/approvals", async (request, reply) => {
    const approval = await services.createApproval(request.params.missionId, request.body);
    return reply.status(201).send(approval);
  });
  server.get<{ Params: { missionId: string } }>("/missions/:missionId/approvals", async (request) => {
    return services.listMissionApprovals(request.params.missionId);
  });
  server.get("/approvals", async () => services.listApprovals());
  server.get<{ Params: { approvalId: string } }>("/approvals/:approvalId", async (request) => {
    return services.getApproval(request.params.approvalId);
  });
  server.post<{ Params: { approvalId: string } }>("/approvals/:approvalId/decision", async (request) => {
    return services.decideApproval(request.params.approvalId, request.body);
  });

  server.get<{ Querystring: { status?: string; missionId?: string; workerType?: string } }>("/worker-runs", async (request) => {
    return services.listWorkerRuns(request.query);
  });
  server.post<{ Params: { id: string } }>("/worker-runs/:id/cancel", async (request) => {
    return services.cancelWorkerRun(request.params.id);
  });
  server.post<{ Params: { id: string } }>("/worker-runs/:id/retry", async (request) => {
    return services.retryWorkerRun(request.params.id);
  });

  server.post<{ Params: { missionId: string } }>("/missions/:missionId/worker-runs", async (request, reply) => {
    const workerRun = await services.createWorkerRun(request.params.missionId, request.body);
    return reply.status(201).send(workerRun);
  });
  server.get<{ Params: { missionId: string } }>("/missions/:missionId/worker-runs", async (request) => {
    return services.listMissionWorkerRuns(request.params.missionId);
  });
  server.get<{ Params: { workerRunId: string } }>("/worker-runs/:workerRunId", async (request) => {
    return services.getWorkerRun(request.params.workerRunId);
  });
  server.patch<{ Params: { workerRunId: string } }>("/worker-runs/:workerRunId", async (request) => {
    return services.updateWorkerRun(request.params.workerRunId, request.body);
  });

  server.post<{ Params: { missionId: string } }>("/missions/:missionId/artifacts", async (request, reply) => {
    const artifact = await services.createArtifact(request.params.missionId, request.body);
    return reply.status(201).send(artifact);
  });
  server.get<{ Params: { missionId: string } }>("/missions/:missionId/artifacts", async (request) => {
    return services.listMissionArtifacts(request.params.missionId);
  });
  server.get("/artifacts", async () => services.listArtifacts());
  server.get<{ Params: { artifactId: string } }>("/artifacts/:artifactId", async (request) => {
    return services.getArtifact(request.params.artifactId);
  });

  server.post<{ Params: { missionId: string } }>("/missions/:missionId/bugs", async (request, reply) => {
    const bug = await services.createBug(request.params.missionId, request.body);
    return reply.status(201).send(bug);
  });
  server.get<{ Params: { missionId: string } }>("/missions/:missionId/bugs", async (request) => {
    return services.listMissionBugs(request.params.missionId);
  });
  server.get("/bugs", async () => services.listBugs());
  server.get<{ Params: { bugId: string } }>("/bugs/:bugId", async (request) => {
    return services.getBug(request.params.bugId);
  });
  server.patch<{ Params: { bugId: string } }>("/bugs/:bugId", async (request) => {
    return services.updateBug(request.params.bugId, request.body);
  });

  server.post<{ Params: { missionId: string } }>("/missions/:missionId/qa-runs", async (request, reply) => {
    const qaRun = await services.createQARun(request.params.missionId, request.body);
    return reply.status(201).send(qaRun);
  });
  server.get<{ Params: { missionId: string } }>("/missions/:missionId/qa-runs", async (request) => {
    return services.listMissionQARuns(request.params.missionId);
  });
  server.get<{ Params: { qaRunId: string } }>("/qa-runs/:qaRunId", async (request) => {
    return services.getQARun(request.params.qaRunId);
  });
  server.patch<{ Params: { qaRunId: string } }>("/qa-runs/:qaRunId", async (request) => {
    return services.updateQARun(request.params.qaRunId, request.body);
  });

  return server;
}

function applyCorsHeaders(reply: FastifyReply): void {
  reply.header("Access-Control-Allow-Origin", readCorsOrigin());
  reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "authorization,content-type");
  reply.header("Access-Control-Max-Age", "600");
}

function readCorsOrigin(): string {
  const configured = process.env.PSF_CORS_ORIGIN?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "http://127.0.0.1:5173" : "*";
}

function readActionExecutionMode(value: string | undefined): ActionExecutionMode {
  return value === "queued" ? "queued" : "inline";
}

function sendActionResponse(reply: FastifyReply, response: unknown) {
  if (isQueuedActionResponse(response)) {
    return reply.status(202).send(response);
  }
  return response;
}

function isQueuedActionResponse(value: unknown): value is { accepted: true; executionMode: "queued"; status: "queued" } {
  if (!value || typeof value !== "object") return false;
  const response = value as { accepted?: unknown; executionMode?: unknown; status?: unknown };
  return response.accepted === true && response.executionMode === "queued" && response.status === "queued";
}
