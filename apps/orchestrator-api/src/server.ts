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

  return server;
}
