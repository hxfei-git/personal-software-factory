import Fastify, { type FastifyInstance } from "fastify";
import { registerApiAuth, type ApiAuthOptions } from "./auth.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { createMissionServices } from "./services.js";
import type { MissionStorage } from "./storage.js";

export interface BuildServerOptions {
  storage: MissionStorage;
  auth?: ApiAuthOptions;
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const server = Fastify({ logger: false });
  registerApiAuth(server, options.auth ?? {
    ...(process.env.PSF_API_TOKEN === undefined ? {} : { token: process.env.PSF_API_TOKEN }),
    disabled: process.env.PSF_AUTH_DISABLED === "true" || process.env.NODE_ENV === "test",
  });
  const services = createMissionServices(options.storage);

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send(toErrorResponse(error));
      return;
    }
    reply.status(500).send({ code: "INTERNAL_SERVER_ERROR", message: "Unexpected server error" });
  });

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/projects", async () => services.listProjects());
  server.get<{ Params: { id: string } }>("/projects/:id", async (request) => services.getProject(request.params.id));

  server.post("/missions", async (request, reply) => {
    const mission = await services.createMission(request.body);
    return reply.status(201).send(mission);
  });
  server.get("/missions", async () => services.listMissions());
  server.get<{ Params: { id: string } }>("/missions/:id", async (request) => services.getMission(request.params.id));

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
  server.get<{ Params: { approvalId: string } }>("/approvals/:approvalId", async (request) => {
    return services.getApproval(request.params.approvalId);
  });
  server.post<{ Params: { approvalId: string } }>("/approvals/:approvalId/decision", async (request) => {
    return services.decideApproval(request.params.approvalId, request.body);
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
