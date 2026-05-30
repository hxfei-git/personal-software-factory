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

  async function createMission(server: ReturnType<typeof buildServer>, title: string) {
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        project_id: "ai-novelist",
        title,
        raw_request: title + " request.",
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json();
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


  it("creates, lists, reads, approves, and rejects approvals", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Approval mission");
    const created = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/approvals`,
      payload: { type: "PRODUCTION_DEPLOY", requestedBy: "planner", reason: "Release requires approval." },
    });
    expect(created.statusCode).toBe(201);
    const approval = created.json();
    expect(approval.status).toBe("pending");

    expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/approvals` })).json()).toHaveLength(1);
    expect((await server.inject({ method: "GET", url: `/approvals/${approval.id}` })).json().id).toBe(approval.id);

    const decision = await server.inject({
      method: "POST",
      url: `/approvals/${approval.id}/decision`,
      payload: { status: "approved", decidedBy: "local-user", decision: "Approved for dry-run." },
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().status).toBe("approved");
  });

  it("creates, lists, reads, and updates worker runs", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "WorkerRun mission");
    const created = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/worker-runs`,
      payload: { workerType: "planner", status: "queued", mode: "dry-run", input: { missionId: mission.id } },
    });
    expect(created.statusCode).toBe(201);
    const workerRun = created.json();
    expect(workerRun.mode).toBe("dry-run");
    expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/worker-runs` })).json()).toHaveLength(1);
    expect((await server.inject({ method: "GET", url: `/worker-runs/${workerRun.id}` })).json().id).toBe(workerRun.id);
    const updated = await server.inject({ method: "PATCH", url: `/worker-runs/${workerRun.id}`, payload: { status: "succeeded", output: { files: ["mission.md"] }, logs: ["done"] } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().status).toBe("succeeded");
  });

  it("creates, lists, and reads artifacts", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Artifact mission");
    const created = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/artifacts`,
      payload: { type: "mission", name: "mission.md", path: `missions/${mission.id}/mission.md`, content: "# Mission", metadata: { storage: "inline" } },
    });
    expect(created.statusCode).toBe(201);
    const artifact = created.json();
    expect(artifact.type).toBe("mission");
    expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/artifacts` })).json()).toHaveLength(1);
    expect((await server.inject({ method: "GET", url: `/artifacts/${artifact.id}` })).json().id).toBe(artifact.id);

    const events = await server.inject({ method: "GET", url: `/missions/${mission.id}/events` });
    expect(events.json().map((event: { type: string }) => event.type)).toContain("artifact.created");
  });

  it("creates, lists, reads, and updates bugs", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Bug mission");
    const created = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/bugs`,
      payload: {
        title: "Repeated generate clicks",
        severity: "P1",
        reproductionSteps: ["Open editor", "Click generate twice"],
        expectedResult: "One request is submitted.",
        actualResult: "Two requests are submitted.",
        evidence: { source: "api-test" },
        suggestedFixDirection: "Disable the button while running.",
        source: "qa-worker",
      },
    });
    expect(created.statusCode).toBe(201);
    const bug = created.json();
    expect(bug.status).toBe("open");
    expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/bugs` })).json()).toHaveLength(1);
    expect((await server.inject({ method: "GET", url: `/bugs/${bug.id}` })).json().id).toBe(bug.id);
    const updated = await server.inject({ method: "PATCH", url: `/bugs/${bug.id}`, payload: { status: "in_progress" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().status).toBe("in_progress");
  });

  it("creates, lists, reads, and updates QA runs", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "QA mission");
    const created = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/qa-runs`,
      payload: { status: "queued", mode: "mock", stagingUrl: "http://127.0.0.1:8000", summary: "Queued mock QA." },
    });
    expect(created.statusCode).toBe(201);
    const qaRun = created.json();
    expect(qaRun.mode).toBe("mock");
    expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/qa-runs` })).json()).toHaveLength(1);
    expect((await server.inject({ method: "GET", url: `/qa-runs/${qaRun.id}` })).json().id).toBe(qaRun.id);
    const updated = await server.inject({ method: "PATCH", url: `/qa-runs/${qaRun.id}`, payload: { status: "passed", passed: 8, failed: 0 } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().status).toBe("passed");
  });

});
