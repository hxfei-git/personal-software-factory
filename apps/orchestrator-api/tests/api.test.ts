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




  it("rejects custom mission events without lower-case dotted types", async () => {
    const { server } = await createTestServer();
    const mission = await createMission(server, "Invalid event type mission");

    for (const type of ["MISSION_NOTE", "mission", ".mission.note", "mission."]) {
      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/events`,
        payload: {
          type,
          message: "Invalid event type.",
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    }
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



  it("rejects repeated approval decisions without changing the approval", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Repeated approval mission");
    const approval = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/approvals`,
      payload: { type: "PRODUCTION_DEPLOY", requestedBy: "planner", reason: "Release requires approval." },
    })).json();

    const first = await server.inject({
      method: "POST",
      url: `/approvals/${approval.id}/decision`,
      payload: { status: "approved", decidedBy: "local-user", decision: "Approved once." },
    });
    expect(first.statusCode).toBe(200);

    const second = await server.inject({
      method: "POST",
      url: `/approvals/${approval.id}/decision`,
      payload: { status: "rejected", decidedBy: "local-user", decision: "Reject after approval." },
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().code).toBe("VALIDATION_ERROR");

    const detail = await server.inject({ method: "GET", url: `/approvals/${approval.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().status).toBe("approved");
    expect(detail.json().decision).toBe("Approved once.");
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
    expect(artifact.metadata.name).toBe("mission.md");
    expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/artifacts` })).json()).toHaveLength(1);
    expect((await server.inject({ method: "GET", url: `/artifacts/${artifact.id}` })).json().id).toBe(artifact.id);

    const events = await server.inject({ method: "GET", url: `/missions/${mission.id}/events` });
    expect(events.json().map((event: { type: string }) => event.type)).toContain("artifact.created");
  });



  it("validates artifact workerRunId references", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Artifact reference mission");
    const otherMission = await createMission(server, "Other worker mission");
    const otherWorkerRun = (await server.inject({
      method: "POST",
      url: `/missions/${otherMission.id}/worker-runs`,
      payload: { workerType: "planner", status: "queued", mode: "dry-run" },
    })).json();

    const missing = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/artifacts`,
      payload: { type: "log", path: `missions/${mission.id}/missing-worker.log`, workerRunId: "worker-run-missing" },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("NOT_FOUND");

    const wrongMission = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/artifacts`,
      payload: { type: "log", path: `missions/${mission.id}/wrong-worker.log`, workerRunId: otherWorkerRun.id },
    });
    expect(wrongMission.statusCode).toBe(400);
    expect(wrongMission.json().code).toBe("VALIDATION_ERROR");
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



  it("validates bug qaRunId mission ownership on create and update", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Bug reference mission");
    const otherMission = await createMission(server, "Other QA mission");
    const otherQaRun = (await server.inject({
      method: "POST",
      url: `/missions/${otherMission.id}/qa-runs`,
      payload: { status: "queued", mode: "mock", stagingUrl: "http://127.0.0.1:8100", summary: "Other QA." },
    })).json();

    const create = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/bugs`,
      payload: {
        qaRunId: otherQaRun.id,
        title: "Wrong QA run",
        severity: "P2",
        reproductionSteps: ["Open app"],
        expectedResult: "QA run belongs to this mission.",
        actualResult: "QA run belongs to another mission.",
      },
    });
    expect(create.statusCode).toBe(400);
    expect(create.json().code).toBe("VALIDATION_ERROR");

    const bug = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/bugs`,
      payload: {
        title: "Unlinked bug",
        severity: "P2",
        reproductionSteps: ["Open app"],
        expectedResult: "One issue is reported.",
        actualResult: "One issue is reported.",
      },
    })).json();

    const update = await server.inject({ method: "PATCH", url: `/bugs/${bug.id}`, payload: { qaRunId: otherQaRun.id } });
    expect(update.statusCode).toBe(400);
    expect(update.json().code).toBe("VALIDATION_ERROR");
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


  it("keeps target_url unchanged when only stagingUrl is patched", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "QA staging patch mission");
    const created = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/qa-runs`,
      payload: { status: "queued", mode: "mock", targetUrl: "http://target.local", stagingUrl: "http://stage-a.local", summary: "Queued mock QA." },
    });
    expect(created.statusCode).toBe(201);
    const qaRun = created.json();

    const updated = await server.inject({ method: "PATCH", url: `/qa-runs/${qaRun.id}`, payload: { stagingUrl: "http://stage-b.local" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().target_url).toBe("http://target.local");
    expect(updated.json().staging_url).toBe("http://stage-b.local");
  });

  it("returns linked bugs on QA run detail", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "QA linked bugs mission");
    const qaRun = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/qa-runs`,
      payload: { status: "queued", mode: "mock", stagingUrl: "http://127.0.0.1:8200", summary: "Queued mock QA." },
    })).json();
    const bug = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/bugs`,
      payload: {
        qaRunId: qaRun.id,
        title: "Linked QA bug",
        severity: "P1",
        reproductionSteps: ["Open app"],
        expectedResult: "QA detail includes linked bugs.",
        actualResult: "QA detail omitted linked bugs.",
      },
    })).json();

    const detail = await server.inject({ method: "GET", url: `/qa-runs/${qaRun.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().bugs).toHaveLength(1);
    expect(detail.json().bugs[0].id).toBe(bug.id);
  });

});
