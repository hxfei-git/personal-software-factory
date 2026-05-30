import { describe, expect, it } from "vitest";
import { MissionStatus, projectExample } from "@psf/mission-schema";
import type { ApiAuthOptions } from "../src/auth.js";
import { buildServer } from "../src/server.js";
import { createInMemoryMissionStorage } from "../src/storage.js";

describe("orchestrator api", () => {
  async function createTestServer(options: { auth?: ApiAuthOptions } = {}) {
    const storage = createInMemoryMissionStorage({ projects: [projectExample] });
    const server = buildServer({ storage, ...(options.auth === undefined ? {} : { auth: options.auth }) });
    await server.ready();
    return { server, storage };
  }

  it("returns health", async () => {
    const { server } = await createTestServer();
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("lists and reads projects", async () => {
    const { server } = await createTestServer();

    const list = await server.inject({ method: "GET", url: "/projects" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const detail = await server.inject({ method: "GET", url: "/projects/ai-novelist" });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe("ai-novelist");
  });

  it("creates and reads a mission with initial received status", async () => {
    const { server } = await createTestServer();
    const create = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        project_id: "ai-novelist",
        title: "Add smoke test",
        raw_request: "Add a smoke test for the app.",
        acceptance_markdown: "# Acceptance\nSmoke test exists.",
      },
    });

    expect(create.statusCode).toBe(201);
    const mission = create.json();
    expect(mission.status).toBe(MissionStatus.received);

    const detail = await server.inject({ method: "GET", url: "/missions/" + mission.id });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().title).toBe("Add smoke test");

    const list = await server.inject({ method: "GET", url: "/missions" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
  });

  it("rejects write requests without token when auth is enabled", async () => {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { project_id: "ai-novelist", title: "Auth check", raw_request: "Check auth." },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHORIZED");
  });

  it("allows write requests with a valid bearer token", async () => {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      headers: { authorization: "Bearer secret" },
      payload: { project_id: "ai-novelist", title: "Auth pass", raw_request: "Check auth pass." },
    });
    expect(response.statusCode).toBe(201);
  });

  it("allows write requests when auth is explicitly disabled", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { project_id: "ai-novelist", title: "Auth disabled", raw_request: "Local test." },
    });
    expect(response.statusCode).toBe(201);
  });

  it("transitions a mission and records an event", async () => {
    const { server } = await createTestServer();
    const mission = (await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        project_id: "ai-novelist",
        title: "Plan mission",
        raw_request: "Plan this work.",
      },
    })).json();

    const transition = await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/transition",
      payload: { to: MissionStatus.planning, actor: "test" },
    });

    expect(transition.statusCode).toBe(200);
    expect(transition.json().status).toBe(MissionStatus.planning);

    const events = await server.inject({ method: "GET", url: "/missions/" + mission.id + "/events" });
    expect(events.statusCode).toBe(200);
    expect(events.json().map((event: { type: string }) => event.type)).toEqual([
      "mission.created",
      "mission.transition.received.planning",
    ]);
  });

  it("rejects illegal transitions with a stable error", async () => {
    const { server } = await createTestServer();
    const mission = (await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        project_id: "ai-novelist",
        title: "Bad transition",
        raw_request: "Try an invalid transition.",
      },
    })).json();

    const response = await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/transition",
      payload: { to: MissionStatus.released },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_MISSION_TRANSITION");
  });

  it("appends and lists custom mission events", async () => {
    const { server } = await createTestServer();
    const mission = (await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        project_id: "ai-novelist",
        title: "Append event",
        raw_request: "Append an event.",
      },
    })).json();

    const append = await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/events",
      payload: {
        type: "mission.note",
        message: "A manual note.",
        payload: { source: "test" },
      },
    });

    expect(append.statusCode).toBe(201);

    const events = await server.inject({ method: "GET", url: "/missions/" + mission.id + "/events" });
    expect(events.statusCode).toBe(200);
    expect(events.json().at(-1)).toMatchObject({ type: "mission.note", message: "A manual note." });
  });
});
