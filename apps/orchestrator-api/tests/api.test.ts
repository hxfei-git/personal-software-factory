import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLE_MISSION_ID } from "@psf/demo-workflow";
import { MissionStatus, projectExample, projectPassportExample } from "@psf/mission-schema";
import { createDeterministicMissionPlan } from "@psf/mission-planner";
import { buildWorkerJob, InProcessWorkerRuntime, type QueuedJobRecord, type QueueStats, type QueueWorkerJob, type WorkerRuntime } from "@psf/worker-runtime";
import type { ApiAuthOptions } from "../src/auth.js";
import type { ActionExecutionMode } from "../src/actions.js";
import { buildServer } from "../src/server.js";
import { createInMemoryMissionStorage } from "../src/storage.js";

describe("orchestrator api", () => {
  async function createTestServer(options: {
    auth?: ApiAuthOptions;
    registryRoot?: string;
    actionExecutionMode?: ActionExecutionMode;
    workerRuntime?: WorkerRuntime;
  } = {}) {
    const storage = createInMemoryMissionStorage({ projects: [projectExample] });
    const server = buildServer({
      storage,
      ...(options.auth === undefined ? {} : { auth: options.auth }),
      ...(options.registryRoot === undefined ? {} : { registryRoot: options.registryRoot }),
      ...(options.actionExecutionMode === undefined ? {} : { actionExecutionMode: options.actionExecutionMode }),
      ...(options.workerRuntime === undefined ? {} : { workerRuntime: options.workerRuntime }),
    });
    await server.ready();
    return { server, storage };
  }


  class FailingEnqueueWorkerRuntime extends InProcessWorkerRuntime {
    override async enqueue(_job: QueueWorkerJob): Promise<QueuedJobRecord> {
      throw new Error("Redis token secret-value down");
    }
  }

  class SecretThrowingQueueRuntime extends InProcessWorkerRuntime {
    override async getQueueStats(): Promise<QueueStats> {
      throw new Error("Redis password queue-secret is unavailable");
    }

    override async cancelJob(_jobId: string): Promise<QueuedJobRecord> {
      throw new Error("Redis token cancel-secret is unavailable");
    }
  }

  class RetrySuccessWorkerRuntime extends InProcessWorkerRuntime {
    override async retryJob(jobId: string): Promise<QueuedJobRecord> {
      const job = buildWorkerJob({
        missionId: EXAMPLE_MISSION_ID,
        projectId: "ai-novelist",
        workerRunId: "worker-run-retry-failed",
        type: "qa.dry_run",
        payload: { withSampleBug: true },
      });
      return {
        job,
        status: "queued",
        attemptsMade: 0,
        createdAt: job.createdAt,
        updatedAt: job.createdAt,
        retryOfJobId: jobId,
        retryAttempt: 1,
      };
    }
  }

  class ActiveCancelWorkerRuntime extends InProcessWorkerRuntime {
    override async cancelJob(jobId: string): Promise<QueuedJobRecord> {
      const job = buildWorkerJob({
        id: jobId,
        missionId: EXAMPLE_MISSION_ID,
        projectId: "ai-novelist",
        workerRunId: "worker-run-active-cancel",
        type: "qa.dry_run",
        payload: {},
      });
      return {
        job,
        status: "active",
        attemptsMade: 1,
        createdAt: job.createdAt,
        updatedAt: job.createdAt,
        startedAt: job.createdAt,
        error: "Active job cancellation is cooperative; cancellation was requested but the job was not force-killed.",
      };
    }
  }

  async function createRegistryRoot() {
    const root = await mkdtemp(join(tmpdir(), "psf-api-registry-"));
    const projectDir = join(root, "sample");
    await mkdir(projectDir);
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: sample",
      "name: Sample",
      "description: Sample project.",
      "repo:",
      "  url: https://example.com/sample.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  staging: \"\"",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: smoke",
      "    name: Smoke",
      "    priority: P1",
      "",
    ].join("\n"));
    return root;
  }

  async function createAiNovelistRegistryRoot() {
    const root = await mkdtemp(join(tmpdir(), "psf-api-registry-"));
    const projectDir = join(root, "ai-novelist");
    await mkdir(projectDir);
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: ai-novelist",
      "name: AI 小说助手",
      "description: Sample ai-novelist passport for API tests.",
      "repo:",
      "  url: https://github.com/hxfei-git/ai-novelist.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  staging: \"\"",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: review_chapter",
      "    name: 自动审稿",
      "    priority: P0",
      "",
    ].join("\n"));
    await writeFile(join(projectDir, "qa-charter.md"), "# QA Charter\n- 打开首页\n- 导出小说\n");
    return root;
  }

  async function createAiNovelistDemoWorkspace() {
    const cwd = await mkdtemp(join(tmpdir(), "psf-api-demo-workspace-"));
    const projectsRoot = join(cwd, "projects");
    const projectDir = join(projectsRoot, "ai-novelist");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: ai-novelist",
      "name: AI 小说助手",
      "description: Sample ai-novelist passport for API demo action tests.",
      "repo:",
      "  url: https://github.com/hxfei-git/ai-novelist.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  staging: \"\"",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: review_chapter",
      "    name: 自动审稿",
      "    priority: P0",
      "",
    ].join("\n"));
    await writeFile(join(projectDir, "qa-charter.md"), "# QA Charter\n- 打开首页\n- 导出小说\n");
    await writeFile(join(projectDir, "AGENTS.md"), "# Demo Agents\nKeep all work local and dry-run only.\n");
    return cwd;
  }

  async function withWorkingDirectory<T>(cwd: string, callback: () => Promise<T>): Promise<T> {
    const previous = process.cwd();
    process.chdir(cwd);
    try {
      return await callback();
    } finally {
      process.chdir(previous);
    }
  }

  async function seedDemoMission(storage: ReturnType<typeof createInMemoryMissionStorage>) {
    const now = "2026-05-31T00:00:00.000Z";
    return storage.createMission({
      mission: {
        id: EXAMPLE_MISSION_ID,
        project_id: "ai-novelist",
        title: "增加章节审稿和自动修复流程",
        slug: "ai-novelist-chapter-review",
        raw_request: "增加章节审稿和自动修复流程",
        mission_markdown: "",
        acceptance_markdown: "",
        status: MissionStatus.received,
        priority: "P2",
        risk_level: "medium",
        branch_name: "",
        workspace_path: "",
        pr_url: "",
        current_attempt: 0,
        max_attempts: 3,
        created_at: now,
        updated_at: now,
      },
      event: {
        id: `event-${EXAMPLE_MISSION_ID}-created`,
        mission_id: EXAMPLE_MISSION_ID,
        type: "mission.created",
        message: "Mission created",
        payload: { status: MissionStatus.received },
        created_at: now,
      },
    });
  }

  async function createAiNovelistRegistryRootWithoutQaCharter() {
    const root = await mkdtemp(join(tmpdir(), "psf-api-registry-"));
    const projectDir = join(root, "ai-novelist");
    await mkdir(projectDir);
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: ai-novelist",
      "name: AI 小说助手",
      "description: Sample ai-novelist passport without QA charter.",
      "repo:",
      "  url: https://github.com/hxfei-git/ai-novelist.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  staging: \"\"",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: review_chapter",
      "    name: 自动审稿",
      "    priority: P0",
      "",
    ].join("\n"));
    return root;
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

  it("syncs projects from the configured registry root", async () => {
    const root = await createRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });

      const response = await server.inject({ method: "POST", url: "/projects/sync" });

      expect(response.statusCode).toBe(200);
      expect(response.json().synced).toBe(1);
      expect(response.json().projects).toHaveLength(1);
      expect(response.json().projects[0]).toMatchObject({
        id: "sample",
        repo_url: "https://example.com/sample.git",
        default_branch: "main",
        status: "active",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns a normalized project passport for a registered project", async () => {
    const root = await createRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      await server.inject({ method: "POST", url: "/projects/sync" });

      const response = await server.inject({ method: "GET", url: "/projects/sample/passport" });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe("sample");
      expect(response.json().commands.install).toEqual(["pnpm install"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("redacts secrets from project and passport endpoints", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-api-sensitive-registry-"));
    const projectDir = join(root, "sample");
    await mkdir(projectDir);
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: sample",
      "name: Sensitive Sample",
      "description: Sample project with sensitive URL values.",
      "repo:",
      "  url: https://x-access-token:passport-repo-token@example.com/sample.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: https://prod.example.test?api_key=passport-prod-key",
      '  staging: "https://user:passport-stage-password@staging.example.test"',
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: smoke",
      "    name: Smoke",
      "    priority: P1",
      "",
    ].join("\n"));
    try {
      const { server, storage } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      await storage.syncProjects([{
        ...projectExample,
        id: "secret-project",
        slug: "secret-project",
        repo_url: "https://user:stored-repo-token@example.com/repo.git",
        production_url: "https://prod.example.test?token=stored-prod-token",
        staging_url: "https://user:stored-stage-password@staging.example.test",
      }]);

      const sync = await server.inject({ method: "POST", url: "/projects/sync" });
      const responses = await Promise.all([
        server.inject({ method: "GET", url: "/projects" }),
        server.inject({ method: "GET", url: "/projects/secret-project" }),
        server.inject({ method: "GET", url: "/projects/sample/passport" }),
      ]);

      for (const response of [sync, ...responses]) {
        expect(response.statusCode).toBe(200);
        const body = JSON.stringify(response.json());
        expect(body).not.toContain("stored-repo-token");
        expect(body).not.toContain("stored-prod-token");
        expect(body).not.toContain("stored-stage-password");
        expect(body).not.toContain("passport-repo-token");
        expect(body).not.toContain("passport-prod-key");
        expect(body).not.toContain("passport-stage-password");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("protects project registry sync when auth is enabled", async () => {
    const root = await createRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { token: "secret", disabled: false }, registryRoot: root });

      const response = await server.inject({ method: "POST", url: "/projects/sync" });

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("UNAUTHORIZED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns validation error details when registry sync finds an invalid passport", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-api-registry-"));
    try {
      const projectDir = join(root, "broken");
      await mkdir(projectDir);
      const passportPath = join(projectDir, "project.passport.yaml");
      await writeFile(passportPath, ["id: broken", "name: Broken", ""].join("\n"));
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });

      const response = await server.inject({ method: "POST", url: "/projects/sync" });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
      expect(response.json().details.passportPath).toBe(passportPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

  it("protects mission dry-run action routes", async () => {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
    const response = await server.inject({ method: "POST", url: "/missions/mission-missing/actions/qa-dry-run" });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHORIZED");
  });

  it("runs demo ai-novelist action without real Codex or external calls", async () => {
    const cwd = await createAiNovelistDemoWorkspace();
    try {
      await withWorkingDirectory(cwd, async () => {
        const { server } = await createTestServer({ auth: { token: "secret", disabled: false }, registryRoot: join(cwd, "projects") });
        await server.inject({
          method: "POST",
          url: "/projects/sync",
          headers: { authorization: "Bearer secret" },
        });

        const response = await server.inject({
          method: "POST",
          url: "/demo/ai-novelist",
          headers: { authorization: "Bearer secret" },
          payload: { withSampleBug: true },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          accepted: true,
          executionMode: "inline",
          missionId: EXAMPLE_MISSION_ID,
          projectId: "ai-novelist",
          mode: "dry-run",
          dryRun: true,
          realCodexExecuted: false,
          realExternalCall: false,
          realPush: false,
          realDeploy: false,
        });
        expect(response.json().generatedArtifacts).toEqual(expect.arrayContaining([
          `missions/${EXAMPLE_MISSION_ID}/mission.md`,
          `missions/${EXAMPLE_MISSION_ID}/qa-report.md`,
        ]));
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects reset requests for the demo ai-novelist action", async () => {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
    const response = await server.inject({
      method: "POST",
      url: "/demo/ai-novelist",
      headers: { authorization: "Bearer secret" },
      payload: { resetDemo: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });

  it("returns not found for mission dry-run actions when the Mission is missing", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const response = await server.inject({ method: "POST", url: "/missions/mission-missing/actions/qa-dry-run", payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("NOT_FOUND");
  });

  it("runs mission qa dry-run action with a sample bug and no real execution", async () => {
    const cwd = await createAiNovelistDemoWorkspace();
    try {
      await withWorkingDirectory(cwd, async () => {
        const { server, storage } = await createTestServer({ auth: { disabled: true }, registryRoot: join(cwd, "projects") });
        await server.inject({ method: "POST", url: "/projects/sync" });
        await seedDemoMission(storage);
        const plan = await server.inject({ method: "POST", url: `/missions/${EXAMPLE_MISSION_ID}/plan`, payload: {} });
        expect(plan.statusCode).toBe(200);

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-dry-run`,
          payload: { withSampleBug: true },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          accepted: true,
          executionMode: "inline",
          missionId: EXAMPLE_MISSION_ID,
          mode: "dry-run",
          dryRun: true,
          realCodexExecuted: false,
          realExternalCall: false,
        });
        expect(response.json().qaRunIds).toEqual([`qa-run-${EXAMPLE_MISSION_ID}-dry-run`]);
        expect(response.json().bugIds).toEqual([`bug-${EXAMPLE_MISSION_ID}-sample-duplicate-generate`]);
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("queues mission qa dry-run action without executing child workflow resources", async () => {
    const workerRuntime = new InProcessWorkerRuntime();
    const { server, storage } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime,
    });
    await seedDemoMission(storage);

    const response = await server.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-dry-run`,
      payload: { withSampleBug: true },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body).toMatchObject({
      accepted: true,
      executionMode: "queued",
      missionId: EXAMPLE_MISSION_ID,
      projectId: "ai-novelist",
      status: "queued",
      dryRun: true,
      realCodexExecuted: false,
      realExternalCall: false,
      realPush: false,
      realDeploy: false,
    });
    expect(body.workerRunId).toMatch(/^worker-run-/);
    expect(body.jobId).toMatch(/^job-/);

    const workerRuns = await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID);
    expect(workerRuns).toHaveLength(1);
    expect(workerRuns[0]).toMatchObject({
      id: body.workerRunId,
      mission_id: EXAMPLE_MISSION_ID,
      worker_type: "orchestrator",
      status: "queued",
      mode: "dry-run",
      metadata: {
        queueWrapper: true,
        jobId: body.jobId,
        jobType: "qa.dry_run_with_sample_bug",
      },
      output: {
        queueWrapper: true,
        jobId: body.jobId,
        jobType: "qa.dry_run_with_sample_bug",
        childWorkerRunIds: [],
        childQARunIds: [],
        childArtifactIds: [],
        childBugReportIds: [],
      },
    });

    expect(await storage.listMissionQARuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
    expect(await storage.listMissionBugs(EXAMPLE_MISSION_ID)).toHaveLength(0);
    expect(await storage.listMissionArtifacts(EXAMPLE_MISSION_ID)).toHaveLength(0);
    const events = await storage.listMissionEvents(EXAMPLE_MISSION_ID);
    expect(events.map((event) => event.type)).toEqual(["mission.created", "worker_run.queued"]);
    expect(await workerRuntime.getJob(body.jobId)).toMatchObject({
      status: "queued",
      job: {
        id: body.jobId,
        missionId: EXAMPLE_MISSION_ID,
        projectId: "ai-novelist",
        workerRunId: body.workerRunId,
        type: "qa.dry_run_with_sample_bug",
        payload: { withSampleBug: true },
      },
    });
  });

  it("rejects queued mission dry-run actions for non-demo missions without creating queue work", async () => {
    const workerRuntime = new InProcessWorkerRuntime();
    const { server, storage } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime,
    });
    const mission = await createMission(server, "Non-demo queued QA mission");

    const response = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/actions/qa-dry-run`,
      payload: { withSampleBug: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "This dry-run action currently supports the ai-novelist demo mission only.",
    });
    expect(await storage.listMissionWorkerRuns(mission.id)).toHaveLength(0);
    expect(await storage.listAllWorkerRuns()).toHaveLength(0);
    expect(await workerRuntime.listJobs()).toHaveLength(0);
  });

  it("returns not found for queued mission actions when the Mission is missing", async () => {
    const { server } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime: new InProcessWorkerRuntime(),
    });
    const response = await server.inject({ method: "POST", url: "/missions/mission-missing/actions/qa-dry-run", payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("NOT_FOUND");
  });


  it("marks the queue wrapper failed and returns a readable error when enqueue fails", async () => {
    const { server, storage } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime: new FailingEnqueueWorkerRuntime(),
    });
    await seedDemoMission(storage);

    const response = await server.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-dry-run`,
      payload: { withSampleBug: true },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "QUEUE_ENQUEUE_FAILED",
      message: "Queue enqueue failed. Check Redis and Worker Runtime configuration.",
    });
    const responseBody = JSON.stringify(response.json());
    expect(responseBody).not.toContain("secret-value");
    expect(responseBody).not.toContain("Redis token");

    const workerRuns = await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID);
    expect(workerRuns).toHaveLength(1);
    expect(workerRuns[0]).toMatchObject({
      status: "failed",
      error: "Queue enqueue failed. Check Redis and Worker Runtime configuration.",
      metadata: {
        queueWrapper: true,
        jobType: "qa.dry_run_with_sample_bug",
      },
    });
    expect(JSON.stringify(workerRuns[0])).not.toContain("secret-value");
    expect(JSON.stringify(workerRuns[0])).not.toContain("Redis token");

    const events = await storage.listMissionEvents(EXAMPLE_MISSION_ID);
    expect(events.map((event) => event.type)).toEqual(["mission.created", "worker_run.queued", "worker_run.failed"]);
    expect(events.at(-1)).toMatchObject({
      type: "worker_run.failed",
      message: "Worker run queue enqueue failed",
    });
  });

  it("returns a clear precondition error when queued ai-novelist demo mission is missing", async () => {
    const { server } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime: new InProcessWorkerRuntime(),
    });

    const response = await server.inject({
      method: "POST",
      url: "/demo/ai-novelist",
      payload: { withSampleBug: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "DEMO_MISSION_REQUIRED",
      message: "Demo mission must exist before queued demo action. Run pnpm psf demo:seed or run the inline demo first.",
    });
  });

  it("returns queue status and job lookup for queued actions", async () => {
    const workerRuntime = new InProcessWorkerRuntime();
    const { server, storage } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime,
    });
    await seedDemoMission(storage);

    const queued = await server.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-dry-run`,
      payload: {},
    });
    expect(queued.statusCode).toBe(202);
    const jobId = queued.json().jobId;

    const status = await server.inject({ method: "GET", url: "/queues/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      runtime: "in-process",
      redisConfigured: false,
      counts: { queued: 1 },
    });

    const job = await server.inject({ method: "GET", url: `/jobs/${jobId}` });
    expect(job.statusCode).toBe(200);
    expect(job.json()).toMatchObject({
      status: "queued",
      job: { id: jobId, type: "qa.dry_run", missionId: EXAMPLE_MISSION_ID },
    });

    const missing = await server.inject({ method: "GET", url: "/jobs/job-missing" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("NOT_FOUND");
  });

  it("lists worker runs with status, missionId, and workerType filters", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "WorkerRun filter mission");
    const otherMission = await createMission(server, "Other WorkerRun filter mission");
    const qaRun = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/worker-runs`,
      payload: { workerType: "qa", status: "failed", mode: "dry-run" },
    })).json();
    await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/worker-runs`,
      payload: { workerType: "codex", status: "succeeded", mode: "dry-run" },
    });
    await server.inject({
      method: "POST",
      url: `/missions/${otherMission.id}/worker-runs`,
      payload: { workerType: "qa", status: "failed", mode: "dry-run" },
    });

    const byStatus = await server.inject({ method: "GET", url: "/worker-runs?status=failed" });
    expect(byStatus.statusCode).toBe(200);
    expect(byStatus.json()).toHaveLength(2);

    const byMissionAndType = await server.inject({ method: "GET", url: `/worker-runs?missionId=${mission.id}&workerType=qa` });
    expect(byMissionAndType.statusCode).toBe(200);
    expect(byMissionAndType.json()).toHaveLength(1);
    expect(byMissionAndType.json()[0].id).toBe(qaRun.id);
  });

  it("cancels queued queue wrapper WorkerRuns and writes an event", async () => {
    const workerRuntime = new InProcessWorkerRuntime();
    const { server, storage } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime,
    });
    await seedDemoMission(storage);
    const queued = await server.inject({ method: "POST", url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-dry-run`, payload: {} });
    const { workerRunId, jobId } = queued.json();

    const cancelled = await server.inject({ method: "POST", url: `/worker-runs/${workerRunId}/cancel` });

    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({
      id: workerRunId,
      status: "cancelled",
      output: { jobId, jobType: "qa.dry_run" },
    });
    expect(cancelled.json().output.cancelledAt).toEqual(expect.any(String));
    expect(await workerRuntime.getJobStatus(jobId)).toBe("cancelled");
    const events = await storage.listMissionEvents(EXAMPLE_MISSION_ID);
    expect(events.map((event) => event.type)).toContain("worker_run.cancelled");
  });

  it("records cooperative cancellation request without marking active jobs cancelled", async () => {
    const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime: new ActiveCancelWorkerRuntime() });
    await seedDemoMission(storage);
    const wrapper = (await server.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/worker-runs`,
      payload: {
        workerType: "orchestrator",
        status: "running",
        mode: "dry-run",
        metadata: { queueWrapper: true, jobId: "job-active-cancel", jobType: "qa.dry_run" },
        output: { queueWrapper: true, jobId: "job-active-cancel", jobType: "qa.dry_run" },
      },
    })).json();

    const response = await server.inject({ method: "POST", url: `/worker-runs/${wrapper.id}/cancel` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: wrapper.id,
      status: "running",
      metadata: {
        queueWrapper: true,
        jobId: "job-active-cancel",
        jobType: "qa.dry_run",
        cancellationRequested: true,
        jobStatus: "active",
      },
      output: {
        jobId: "job-active-cancel",
        jobType: "qa.dry_run",
        cancellationRequested: true,
        jobStatus: "active",
      },
    });
    expect(response.json().output.cancellationRequestedAt).toEqual(expect.any(String));
    expect(response.json().output.cancelledAt).toBeUndefined();

    const events = await storage.listMissionEvents(EXAMPLE_MISSION_ID);
    expect(events.map((event) => event.type)).toContain("worker_run.cancellation_requested");
    expect(events.at(-1)).toMatchObject({
      type: "worker_run.cancellation_requested",
      message: "Queue wrapper worker run cancellation requested",
      payload: { jobStatus: "active", cancellationRequested: true },
    });
  });

  it("rejects cancel for non-wrapper and completed-history WorkerRuns", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Cancel validation mission");
    const nonWrapper = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/worker-runs`,
      payload: { workerType: "qa", status: "queued", mode: "dry-run" },
    })).json();

    const nonWrapperCancel = await server.inject({ method: "POST", url: `/worker-runs/${nonWrapper.id}/cancel` });
    expect(nonWrapperCancel.statusCode).toBe(400);
    expect(nonWrapperCancel.json().code).toBe("QUEUE_WRAPPER_REQUIRED");

    for (const status of ["succeeded", "failed"] as const) {
      const wrapper = (await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/worker-runs`,
        payload: {
          workerType: "orchestrator",
          status,
          mode: "dry-run",
          metadata: { queueWrapper: true, jobId: `job-${status}`, jobType: "qa.dry_run" },
          output: { queueWrapper: true, jobId: `job-${status}`, jobType: "qa.dry_run" },
        },
      })).json();
      const response = await server.inject({ method: "POST", url: `/worker-runs/${wrapper.id}/cancel` });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("WORKER_RUN_NOT_CANCELLABLE");
    }
  });

  it("retries failed and cancelled queue wrapper WorkerRuns with a new job id", async () => {
    const workerRuntime = new InProcessWorkerRuntime();
    const { server, storage } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime,
    });
    await seedDemoMission(storage);
    const queued = await server.inject({ method: "POST", url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-dry-run`, payload: {} });
    const cancelled = await server.inject({ method: "POST", url: `/worker-runs/${queued.json().workerRunId}/cancel` });

    const retryCancelled = await server.inject({ method: "POST", url: `/worker-runs/${queued.json().workerRunId}/retry` });
    expect(retryCancelled.statusCode).toBe(200);
    expect(retryCancelled.json()).toMatchObject({
      id: queued.json().workerRunId,
      status: "queued",
      metadata: {
        queueWrapper: true,
        previousJobId: queued.json().jobId,
        jobType: "qa.dry_run",
        retryAttempt: 1,
      },
      output: {
        previousJobId: queued.json().jobId,
        jobType: "qa.dry_run",
        retryAttempt: 1,
      },
    });
    expect(retryCancelled.json().metadata.jobId).not.toBe(queued.json().jobId);
    expect(cancelled.json().status).toBe("cancelled");

    const failedStorage = createInMemoryMissionStorage({ projects: [projectExample] });
    const failedServer = buildServer({ storage: failedStorage, auth: { disabled: true }, workerRuntime: new RetrySuccessWorkerRuntime() });
    await failedServer.ready();
    await seedDemoMission(failedStorage);
    const failedWrapper = (await failedServer.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/worker-runs`,
      payload: {
        workerType: "orchestrator",
        status: "failed",
        mode: "dry-run",
        metadata: { queueWrapper: true, jobId: "job-failed-original", jobType: "qa.dry_run" },
        output: { queueWrapper: true, jobId: "job-failed-original", jobType: "qa.dry_run" },
        error: "Queue failed safely.",
      },
    })).json();
    const retryFailed = await failedServer.inject({ method: "POST", url: `/worker-runs/${failedWrapper.id}/retry` });
    expect(retryFailed.statusCode).toBe(200);
    expect(retryFailed.json()).toMatchObject({
      status: "queued",
      metadata: { previousJobId: "job-failed-original", retryAttempt: 1 },
      output: { previousJobId: "job-failed-original", retryAttempt: 1 },
    });
    expect(retryFailed.json().metadata.jobId).not.toBe("job-failed-original");

    const events = await storage.listMissionEvents(EXAMPLE_MISSION_ID);
    expect(events.map((event) => event.type)).toContain("worker_run.retried");
  });

  it("rejects retry for running, succeeded, and queued wrapper WorkerRuns", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Retry validation mission");

    for (const status of ["running", "succeeded", "queued"] as const) {
      const wrapper = (await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/worker-runs`,
        payload: {
          workerType: "orchestrator",
          status,
          mode: "dry-run",
          metadata: { queueWrapper: true, jobId: `job-${status}`, jobType: "qa.dry_run" },
          output: { queueWrapper: true, jobId: `job-${status}`, jobType: "qa.dry_run" },
        },
      })).json();
      const response = await server.inject({ method: "POST", url: `/worker-runs/${wrapper.id}/retry` });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("WORKER_RUN_NOT_RETRYABLE");
    }
  });

  it("protects worker-run cancel and retry writes when auth is enabled", async () => {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });

    const cancel = await server.inject({ method: "POST", url: "/worker-runs/worker-run-missing/cancel" });
    const retry = await server.inject({ method: "POST", url: "/worker-runs/worker-run-missing/retry" });

    expect(cancel.statusCode).toBe(401);
    expect(retry.statusCode).toBe(401);
    expect(cancel.json().code).toBe("UNAUTHORIZED");
    expect(retry.json().code).toBe("UNAUTHORIZED");
  });

  it("does not leak runtime secret details from queue API errors", async () => {
    const { server, storage } = await createTestServer({
      auth: { disabled: true },
      actionExecutionMode: "queued",
      workerRuntime: new SecretThrowingQueueRuntime(),
    });
    await seedDemoMission(storage);

    const status = await server.inject({ method: "GET", url: "/queues/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      runtime: "unavailable",
      redisReachable: false,
      errorCode: "QUEUE_RUNTIME_UNAVAILABLE",
    });

    const wrapper = (await server.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/worker-runs`,
      payload: {
        workerType: "orchestrator",
        status: "queued",
        mode: "dry-run",
        metadata: { queueWrapper: true, jobId: "job-secret-error", jobType: "qa.dry_run" },
        output: { queueWrapper: true, jobId: "job-secret-error", jobType: "qa.dry_run" },
      },
    })).json();
    const cancel = await server.inject({ method: "POST", url: `/worker-runs/${wrapper.id}/cancel` });
    expect(cancel.statusCode).toBe(503);
    expect(cancel.json()).toMatchObject({
      code: "QUEUE_RUNTIME_UNAVAILABLE",
      message: "Queue runtime is unavailable. Check Redis and Worker Runtime configuration.",
    });

    for (const body of [JSON.stringify(status.json()), JSON.stringify(cancel.json())]) {
      expect(body).not.toContain("queue-secret");
      expect(body).not.toContain("cancel-secret");
      expect(body).not.toContain("password");
      expect(body).not.toContain("token");
    }
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

  it("plans a mission and records planner resources", async () => {
    const root = await createAiNovelistRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      const mission = await createMission(server, "Plan ai-novelist chapter review");
      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/plan`,
        payload: {
          userRequirement: "增加章节审稿和自动修复流程 token=planner-user-token",
          qaCharter: "# QA Charter\n- 打开首页\n- 导出小说\npassword: planner-charter-password",
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().files).toHaveLength(4);
      expect(response.json().workerRun.worker_type).toBe("planner");
      const planBody = JSON.stringify(response.json());
      expect(planBody).not.toContain("planner-user-token");
      expect(planBody).not.toContain("planner-charter-password");

      const artifacts = await server.inject({ method: "GET", url: `/missions/${mission.id}/artifacts` });
      expect(artifacts.json().map((artifact: { type: string }) => artifact.type)).toEqual([
        "mission",
        "acceptance",
        "technical_notes",
        "risk_notes",
      ]);

      const runs = await server.inject({ method: "GET", url: `/missions/${mission.id}/worker-runs` });
      expect(runs.json().at(-1).worker_type).toBe("planner");

      const events = await server.inject({ method: "GET", url: `/missions/${mission.id}/events` });
      expect(events.json().map((event: { type: string }) => event.type)).toEqual(
        expect.arrayContaining(["mission.planning.started", "mission.planning.completed"]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("plans with empty body defaults and missing qa charter fallback", async () => {
    const root = await createAiNovelistRegistryRootWithoutQaCharter();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      const mission = await createMission(server, "Default planner inputs");

      const response = await server.inject({ method: "POST", url: `/missions/${mission.id}/plan`, payload: {} });

      expect(response.statusCode).toBe(200);
      expect(response.json().title).toBe(mission.title);
      expect(response.json().workerRun.input).toMatchObject({
        userRequirement: mission.raw_request,
        title: mission.title,
        priority: mission.priority,
        qaCharter: "",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("planning advances a received mission through planning to planned", async () => {
    const root = await createAiNovelistRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      const mission = await createMission(server, "Stateful planner mission");

      const response = await server.inject({ method: "POST", url: `/missions/${mission.id}/plan`, payload: {} });

      expect(response.statusCode).toBe(200);
      const detail = await server.inject({ method: "GET", url: `/missions/${mission.id}` });
      expect(detail.json().status).toBe(MissionStatus.planned);

      const events = await server.inject({ method: "GET", url: `/missions/${mission.id}/events` });
      expect(events.json().map((event: { type: string }) => event.type)).toEqual([
        "mission.created",
        "mission.transition.received.planning",
        "mission.planning.started",
        "mission.planning.completed",
        "mission.transition.planning.planned",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("repeated planning is idempotent and does not duplicate planner events", async () => {
    const root = await createAiNovelistRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      const mission = await createMission(server, "Idempotent planner mission");

      const first = await server.inject({ method: "POST", url: `/missions/${mission.id}/plan`, payload: {} });
      const second = await server.inject({ method: "POST", url: `/missions/${mission.id}/plan`, payload: {} });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json().workerRun.id).toBe(first.json().workerRun.id);
      expect(second.json().artifacts.map((artifact: { id: string }) => artifact.id)).toEqual(
        first.json().artifacts.map((artifact: { id: string }) => artifact.id),
      );

      const events = await server.inject({ method: "GET", url: `/missions/${mission.id}/events` });
      const eventTypes = events.json().map((event: { type: string }) => event.type);
      expect(eventTypes.filter((type: string) => type === "mission.planning.started")).toHaveLength(1);
      expect(eventTypes.filter((type: string) => type === "mission.planning.completed")).toHaveLength(1);
      expect(eventTypes.filter((type: string) => type === "mission.transition.received.planning")).toHaveLength(1);
      expect(eventTypes.filter((type: string) => type === "mission.transition.planning.planned")).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("repeated planning with different input returns persisted planner result", async () => {
    const root = await createAiNovelistRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      const mission = await createMission(server, "Original planner title");

      const first = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/plan`,
        payload: {
          title: "Original planner title",
          userRequirement: "第一次规划需求",
          qaCharter: "# QA Charter\n- 原始路径",
        },
      });
      const second = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/plan`,
        payload: {
          title: "Different planner title",
          userRequirement: "第二次规划需求",
          qaCharter: "# QA Charter\n- 不同路径",
        },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json().title).toBe(first.json().title);
      expect(second.json().workerRun.input).toMatchObject({
        title: "Original planner title",
        userRequirement: "第一次规划需求",
        qaCharter: "# QA Charter\n- 原始路径",
      });
      expect(second.json().files).toEqual(first.json().files);
      expect(second.json().artifacts).toEqual(first.json().artifacts);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("repeated planning while status is planning returns persisted planner result", async () => {
    const root = await createAiNovelistRegistryRoot();
    try {
      const { server, storage } = await createTestServer({ auth: { disabled: true }, registryRoot: root });
      const mission = await createMission(server, "Planning retry original title");
      const toPlanning = await server.inject({ method: "POST", url: `/missions/${mission.id}/transition`, payload: { to: MissionStatus.planning } });
      expect(toPlanning.statusCode).toBe(200);

      const planned = createDeterministicMissionPlan({
        projectId: mission.project_id,
        userRequirement: "第一次 planning 规划需求",
        passport: projectPassportExample,
        qaCharter: "# QA Charter\n- 原始 planning 路径",
        title: "Planning retry original title",
        priority: mission.priority,
        missionId: mission.id,
      });
      const plannerEventBaseTime = Date.now() + 10_000;
      await storage.recordPlannerResult({
        workerRun: planned.workerRun,
        artifacts: planned.artifacts,
        events: planned.events.map((event, index) => ({
          ...event,
          created_at: new Date(plannerEventBaseTime + index).toISOString(),
        })),
      });

      const second = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/plan`,
        payload: {
          title: "Planning retry different title",
          userRequirement: "第二次 planning 规划需求",
          qaCharter: "# QA Charter\n- 不同 planning 路径",
        },
      });

      expect(second.statusCode).toBe(200);
      expect(second.json().title).toBe("Planning retry original title");
      expect(second.json().workerRun.input).toMatchObject({
        title: "Planning retry original title",
        userRequirement: "第一次 planning 规划需求",
        qaCharter: "# QA Charter\n- 原始 planning 路径",
      });
      expect(second.json().files.map((file: { name: string }) => file.name)).toEqual(planned.files.map((file) => file.name));
      expect(second.json().artifacts.map((artifact: { id: string }) => artifact.id)).toEqual(planned.artifacts.map((artifact) => artifact.id));

      const detail = await server.inject({ method: "GET", url: `/missions/${mission.id}` });
      expect(detail.json().status).toBe(MissionStatus.planned);

      const events = await server.inject({ method: "GET", url: `/missions/${mission.id}/events` });
      const eventTypes = events.json().map((event: { type: string }) => event.type);
      expect(eventTypes.filter((type: string) => type === "mission.planning.started")).toHaveLength(1);
      expect(eventTypes.filter((type: string) => type === "mission.planning.completed")).toHaveLength(1);
      expect(eventTypes.filter((type: string) => type === "mission.transition.planning.planned")).toHaveLength(1);
      const suffix = eventTypes.slice(eventTypes.indexOf("mission.planning.started"));
      expect(suffix).toEqual([
        "mission.planning.started",
        "mission.planning.completed",
        "mission.transition.planning.planned",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects planning from invalid states before registry reads", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Invalid state planner mission");

    for (const to of [MissionStatus.planning, MissionStatus.planned, MissionStatus.dev_queued]) {
      const transition = await server.inject({ method: "POST", url: `/missions/${mission.id}/transition`, payload: { to } });
      expect(transition.statusCode).toBe(200);
    }

    const response = await server.inject({ method: "POST", url: `/missions/${mission.id}/plan`, payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_MISSION_TRANSITION");
  });

  it("orders in-memory mission events by created_at and id", async () => {
    const now = "2026-05-30T00:00:00.000Z";
    const mission = {
      id: "mission-ordering",
      project_id: "ai-novelist",
      title: "Ordering mission",
      slug: "ordering-mission",
      raw_request: "Check ordering.",
      mission_markdown: "",
      acceptance_markdown: "",
      status: MissionStatus.received,
      priority: "P2" as const,
      risk_level: "medium" as const,
      branch_name: "",
      workspace_path: "",
      pr_url: "",
      current_attempt: 0,
      max_attempts: 3,
      created_at: now,
      updated_at: now,
    };
    const storage = createInMemoryMissionStorage({
      projects: [projectExample],
      missions: [mission],
      events: [
        { id: "event-b", mission_id: mission.id, type: "mission.beta", message: "Beta", payload: {}, created_at: now },
        { id: "event-a", mission_id: mission.id, type: "mission.alpha", message: "Alpha", payload: {}, created_at: now },
      ],
    });

    await expect(storage.listMissionEvents(mission.id)).resolves.toEqual([
      expect.objectContaining({ id: "event-a" }),
      expect.objectContaining({ id: "event-b" }),
    ]);
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

    const events = await server.inject({ method: "GET", url: `/missions/${mission.id}/events` });
    expect(events.statusCode).toBe(200);
    expect(events.json().filter((event: { type: string }) => event.type === "approval.decided")).toHaveLength(1);
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

  it("returns dashboard metrics and recent operational resources", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Dashboard mission");
    await server.inject({ method: "POST", url: "/missions/" + mission.id + "/transition", payload: { to: MissionStatus.planning } });
    const workerRun = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/worker-runs",
      payload: { workerType: "codex", status: "failed", mode: "dry-run", error: "Unit test failed" },
    })).json();
    await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: { type: "qa_report", path: "missions/" + mission.id + "/qa-report.md", workerRunId: workerRun.id, content: "# QA" },
    });
    const qaRun = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/qa-runs",
      payload: { status: "failed", mode: "mock", stagingUrl: "http://127.0.0.1:8300", summary: "Failed QA.", failed: 1 },
    })).json();
    await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/bugs",
      payload: {
        qaRunId: qaRun.id,
        title: "Dashboard P1 bug",
        severity: "P1",
        reproductionSteps: ["Open app"],
        expectedResult: "Dashboard has data.",
        actualResult: "Dashboard failed.",
      },
    });
    await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/approvals",
      payload: { type: "SECURITY_RISK", reason: "Needs review." },
    });

    const response = await server.inject({ method: "GET", url: "/dashboard" });

    expect(response.statusCode).toBe(200);
    expect(response.json().metrics).toMatchObject({
      projectCount: 1,
      missionCount: 1,
      runningMissionCount: 1,
      failedMissionCount: 0,
      readyForReviewMissionCount: 0,
      qaRunCount: 1,
      qaFailedCount: 1,
      bugCount: 1,
      openBugCount: 1,
      p0p1BugCount: 1,
      pendingApprovalCount: 1,
      workerRunCount: 1,
      artifactCount: 1,
    });
    expect(response.json().recentMissions[0].id).toBe(mission.id);
    expect(response.json().recentBugs).toHaveLength(1);
    expect(response.json().recentWorkerRuns[0].id).toBe(workerRun.id);
    expect(response.json().recentFailedWorkerRuns[0].status).toBe("failed");
    expect(response.json().recentQaRuns[0].id).toBe(qaRun.id);
    expect(response.json().recentArtifacts).toHaveLength(1);
    expect(response.json().integrationStatuses[0]).toMatchObject({
      realNetworkCall: false,
      safeToRun: true,
    });
    expect(response.json().recommendedNextActions.length).toBeGreaterThan(0);
    expect(response.json().healthSignals.length).toBeGreaterThan(0);
  });

  it("returns a mission summary with related resources and highlighted artifacts", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Summary mission");
    const workerRun = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/worker-runs",
      payload: { workerType: "codex", status: "succeeded", mode: "dry-run", output: { summary: "Implemented." } },
    })).json();
    const qaReportArtifact = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: { type: "qa_report", path: "missions/" + mission.id + "/qa-report.md", workerRunId: workerRun.id, content: "# QA Report" },
    })).json();
    const bugsJsonArtifact = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: { type: "bugs_json", path: "missions/" + mission.id + "/bugs.json", content: "[]" },
    })).json();
    const codexPromptArtifact = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: { type: "codex_prompt", path: "missions/" + mission.id + "/codex-prompt.md", content: "Prompt" },
    })).json();
    const codexCommandArtifact = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: { type: "codex_command", path: "missions/" + mission.id + "/codex-command.sh", content: "pnpm test" },
    })).json();
    const fixMissionArtifact = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: { type: "fix_mission", path: "missions/" + mission.id + "/fix-mission.md", content: "Fix" },
    })).json();
    const fixCodexCommandArtifact = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: { type: "fix_codex_command", path: "missions/" + mission.id + "/fix-codex-command.sh", content: "pnpm test" },
    })).json();
    const qaRun = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/qa-runs",
      payload: { status: "passed", mode: "mock", stagingUrl: "http://127.0.0.1:8400", summary: "Passed QA.", passed: 3 },
    })).json();
    const bug = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/bugs",
      payload: {
        qaRunId: qaRun.id,
        title: "Summary linked bug",
        severity: "P2",
        status: "fixed",
        reproductionSteps: ["Open app"],
        expectedResult: "Summary links bugs.",
        actualResult: "Summary omitted bug.",
      },
    })).json();
    const approval = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/approvals",
      payload: { type: "PRODUCTION_DEPLOY", reason: "Release review." },
    })).json();

    const response = await server.inject({ method: "GET", url: "/missions/" + mission.id + "/summary" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mission: { id: mission.id },
      project: { id: "ai-novelist" },
      currentStatus: mission.status,
      qaReportArtifact: { id: qaReportArtifact.id },
      bugsJsonArtifact: { id: bugsJsonArtifact.id },
      codexPromptArtifact: { id: codexPromptArtifact.id },
      codexCommandArtifact: { id: codexCommandArtifact.id },
      fixMissionArtifact: { id: fixMissionArtifact.id },
      fixCodexCommandArtifact: { id: fixCodexCommandArtifact.id },
    });
    expect(response.json().events.map((event: { type: string }) => event.type)).toContain("mission.created");
    expect(response.json().artifacts).toHaveLength(6);
    expect(response.json().workerRuns[0].id).toBe(workerRun.id);
    expect(response.json().qaRuns[0].bugs[0].id).toBe(bug.id);
    expect(response.json().bugs[0].id).toBe(bug.id);
    expect(response.json().approvals[0].id).toBe(approval.id);
    expect(response.json().recommendedNextAction).toEqual(expect.any(String));
  });

  it("redacts token and password values from dashboard, summary, and resource GET responses", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const missionResponse = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        project_id: "ai-novelist",
        title: "Secret redaction mission",
        raw_request: "token=mission-raw-token",
        mission_markdown: "password: mission-md-password",
        acceptance_markdown: "secret=mission-acceptance-secret",
      },
    });
    expect(missionResponse.statusCode).toBe(201);
    const mission = missionResponse.json();
    expect(JSON.stringify(mission)).not.toContain("mission-raw-token");
    expect(JSON.stringify(mission)).not.toContain("mission-md-password");
    expect(JSON.stringify(mission)).not.toContain("mission-acceptance-secret");
    const workerRun = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/worker-runs",
      payload: {
        workerType: "qa",
        status: "failed",
        mode: "dry-run",
        input: { apiToken: "worker-input-token", nested: { password: "worker-input-password" } },
        output: { secret: "worker-output-secret", url: "https://example.test/result?token=worker-output-query" },
        logs: ["authorization=worker-log-auth", "password: worker-log-password"],
        error: "token=worker-error-token",
      },
    })).json();
    const artifact = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/artifacts",
      payload: {
        type: "qa_report",
        path: "missions/" + mission.id + "/qa-report.md",
        workerRunId: workerRun.id,
        content: "token=artifact-token password=artifact-password",
        metadata: { accessKey: "artifact-access-key" },
      },
    })).json();
    const qaRun = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/qa-runs",
      payload: {
        status: "failed",
        mode: "mock",
        stagingUrl: "http://127.0.0.1:8500",
        summary: "secret=qa-summary-secret",
        failed: 1,
      },
    })).json();
    const bug = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/bugs",
      payload: {
        qaRunId: qaRun.id,
        title: "Sensitive evidence bug",
        severity: "P1",
        reproductionSteps: ["Open app"],
        expectedResult: "Sensitive evidence is not returned.",
        actualResult: "Sensitive evidence was captured.",
        evidence: {
          token: "bug-evidence-token",
          url: "https://example.test/evidence?password=bug-query-password",
          nested: { apiKey: "bug-api-key" },
        },
      },
    })).json();
    const approval = (await server.inject({
      method: "POST",
      url: "/missions/" + mission.id + "/approvals",
      payload: {
        type: "SECURITY_RISK",
        reason: "secret=approval-reason-secret",
        payload: { password: "approval-payload-password" },
      },
    })).json();

    const responses = await Promise.all([
      server.inject({ method: "GET", url: "/dashboard" }),
      server.inject({ method: "GET", url: "/missions" }),
      server.inject({ method: "GET", url: "/missions/" + mission.id }),
      server.inject({ method: "GET", url: "/missions/" + mission.id + "/summary" }),
      server.inject({ method: "GET", url: "/missions/" + mission.id + "/artifacts" }),
      server.inject({ method: "GET", url: "/artifacts/" + artifact.id }),
      server.inject({ method: "GET", url: "/missions/" + mission.id + "/worker-runs" }),
      server.inject({ method: "GET", url: "/worker-runs/" + workerRun.id }),
      server.inject({ method: "GET", url: "/missions/" + mission.id + "/bugs" }),
      server.inject({ method: "GET", url: "/bugs/" + bug.id }),
      server.inject({ method: "GET", url: "/missions/" + mission.id + "/approvals" }),
      server.inject({ method: "GET", url: "/approvals/" + approval.id }),
      server.inject({ method: "GET", url: "/missions/" + mission.id + "/qa-runs" }),
      server.inject({ method: "GET", url: "/qa-runs/" + qaRun.id }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      const body = JSON.stringify(response.json());
      expect(body).not.toContain("mission-raw-token");
      expect(body).not.toContain("mission-md-password");
      expect(body).not.toContain("mission-acceptance-secret");
      expect(body).not.toContain("artifact-token");
      expect(body).not.toContain("artifact-password");
      expect(body).not.toContain("artifact-access-key");
      expect(body).not.toContain("worker-input-token");
      expect(body).not.toContain("worker-input-password");
      expect(body).not.toContain("worker-output-secret");
      expect(body).not.toContain("worker-output-query");
      expect(body).not.toContain("worker-log-auth");
      expect(body).not.toContain("worker-log-password");
      expect(body).not.toContain("worker-error-token");
      expect(body).not.toContain("qa-summary-secret");
      expect(body).not.toContain("bug-evidence-token");
      expect(body).not.toContain("bug-query-password");
      expect(body).not.toContain("bug-api-key");
      expect(body).not.toContain("approval-reason-secret");
      expect(body).not.toContain("approval-payload-password");
    }
  });

  it("returns integration statuses with mandatory safety fields", async () => {
    const { server } = await createTestServer();

    const response = await server.inject({ method: "GET", url: "/integrations" });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((status: { name: string }) => status.name)).toEqual(["github", "coolify", "uptime_kuma", "plane"]);
    expect(response.json()[0]).toMatchObject({
      configured: false,
      realNetworkCall: false,
      safeToRun: true,
      realEnabled: false,
    });
    expect(response.json()[0].missingEnv.length).toBeGreaterThan(0);
  });

  it("runs integration dry-runs locally without provider credentials", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });

    const response = await server.inject({
      method: "POST",
      url: "/integrations/github/dry-run",
      payload: { mission: { missionId: "mission-001", missionTitle: "Dry run API" } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "github",
      configured: false,
      realNetworkCall: false,
      safeToRun: true,
      status: {
        realNetworkCall: false,
        safeToRun: true,
      },
    });
    expect(response.json().missingEnv).toContain("GITHUB_TOKEN");
  });

  it("protects integration dry-run writes when auth is enabled", async () => {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });

    const response = await server.inject({ method: "POST", url: "/integrations/github/dry-run", payload: {} });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHORIZED");
  });

  it("supports the uptime-kuma dry-run path", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });

    const response = await server.inject({
      method: "POST",
      url: "/integrations/uptime-kuma/dry-run",
      payload: { monitor: { project: "psf", stagingUrl: "https://staging.example.test" } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "uptime_kuma",
      externalName: "uptime-kuma",
      realNetworkCall: false,
      safeToRun: true,
      outputs: {
        monitorConfig: {
          type: "http",
          dryRun: true,
          url: "https://staging.example.test/",
        },
      },
    });
  });

});
