import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLE_MISSION_ID } from "@psf/demo-workflow";
import { MissionStatus, projectExample, projectPassportExample } from "@psf/mission-schema";
import { createDeterministicMissionPlan } from "@psf/mission-planner";
import { buildWorkerJob, InProcessWorkerRuntime, type QueuedJobRecord, type QueueStats, type QueueWorkerJob, type WorkerRuntime } from "@psf/worker-runtime";
import type { ApiAuthOptions } from "../src/auth.js";
import { buildQueuedRealActionJob, type ActionExecutionMode } from "../src/actions.js";
import { buildServer } from "../src/server.js";
import { createMissionServices } from "../src/services.js";
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

  const realActionRoutes = [
    { path: "codex-real", jobType: "codex.real", gate: "PSF_ENABLE_REAL_CODEX" },
    { path: "qa-playwright", jobType: "qa.playwright", gate: "PSF_ENABLE_REAL_QA_PLAYWRIGHT" },
    { path: "qa-ai-exploratory", jobType: "qa.ai_exploratory", gate: "PSF_ENABLE_REAL_QA_AI_EXPLORATORY" },
    { path: "fix-real", jobType: "fix.real", gate: "PSF_ENABLE_REAL_FIX" },
    { path: "github-pr", jobType: "github.pr", gate: "PSF_ENABLE_REAL_GITHUB_PR" },
    { path: "deploy-staging", jobType: "deploy.coolify", gate: "PSF_ENABLE_REAL_COOLIFY_DEPLOY" },
    { path: "monitor-sync", jobType: "monitor.uptime_kuma", gate: "PSF_ENABLE_REAL_UPTIME_KUMA_SYNC" },
    { path: "plane-sync", jobType: "plane.sync", gate: "PSF_ENABLE_REAL_PLANE_SYNC" },
  ] as const;

  const requiredApprovalTypesByRealAction: Record<typeof realActionRoutes[number]["path"], string[]> = {
    "codex-real": ["SECURITY_RISK"],
    "qa-playwright": [],
    "qa-ai-exploratory": ["EXTERNAL_COST_RISK"],
    "fix-real": ["SECURITY_RISK"],
    "github-pr": ["EXTERNAL_COST_RISK"],
    "deploy-staging": ["PRODUCTION_DEPLOY"],
    "monitor-sync": [],
    "plane-sync": [],
  };

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
      "  e2e: pnpm test:e2e",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  local: http://127.0.0.1:8000",
      "  staging: http://127.0.0.1:8000",
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
      "  e2e: pnpm test:e2e",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  local: http://127.0.0.1:8000",
      "  staging: http://127.0.0.1:8000",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: open_home",
      "    name: 打开首页",
      "    priority: P0",
      "",
    ].join("\n"));
    await writeFile(join(projectDir, "qa-charter.md"), "# QA Charter\n- 打开首页\n- 导出小说\n");
    return root;
  }

  async function createAiNovelistRegistryRootWithoutQaTarget() {
    const root = await mkdtemp(join(tmpdir(), "psf-api-registry-"));
    const projectDir = join(root, "ai-novelist");
    await mkdir(projectDir);
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: ai-novelist",
      "name: AI 小说助手",
      "description: Passport with e2e command but no QA target URL.",
      "repo:",
      "  url: https://github.com/hxfei-git/ai-novelist.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  e2e: pnpm test:e2e",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  local: \"\"",
      "  staging: \"\"",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: open_home",
      "    name: 打开首页",
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
      "  e2e: pnpm test:e2e",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  local: http://127.0.0.1:8000",
      "  staging: http://127.0.0.1:8000",
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

  async function withEnv<T>(patch: Record<string, string | undefined>, callback: () => Promise<T>): Promise<T> {
    const previous: Record<string, string | undefined> = {};
    for (const key of Object.keys(patch)) {
      previous[key] = process.env[key];
      if (patch[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = patch[key];
      }
    }
    try {
      return await callback();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
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

  async function createApprovedApproval(server: ReturnType<typeof buildServer>, missionId: string, type: string) {
    const approval = (await server.inject({
      method: "POST",
      url: "/missions/" + missionId + "/approvals",
      payload: { type, reason: type + " approval for real action." },
    })).json();
    const decision = await server.inject({
      method: "POST",
      url: "/approvals/" + approval.id + "/decision",
      payload: { status: "approved", decidedBy: "local-user", decision: "Approved for queued real action." },
    });
    expect(decision.statusCode).toBe(200);
    return approval;
  }

  it("returns health", async () => {
    const { server } = await createTestServer();
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("adds CORS headers for Hub browser requests", async () => {
    const { server } = await createTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/dashboard",
      headers: { origin: "http://127.0.0.1:5173" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toContain("authorization");
  });

  it("handles CORS preflight requests for Hub browser requests", async () => {
    const { server } = await createTestServer();
    const response = await server.inject({
      method: "OPTIONS",
      url: "/dashboard",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toContain("authorization");
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

  it("returns a non-demo inline dry-run response for mission actions/plan when the Project exists", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot });
      const mission = await createMission(server, "Non-demo inline plan action mission");

      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/actions/plan`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        accepted: true,
        executionMode: "inline",
        missionId: mission.id,
        projectId: "ai-novelist",
        mode: "dry-run",
        dryRun: true,
        realCodexExecuted: false,
        realExternalCall: false,
        realPush: false,
        realDeploy: false,
        generatedArtifacts: [],
        workerRunIds: [],
        qaRunIds: [],
        bugIds: [],
        eventIds: [],
      });
      expect(response.json().recommendedNextAction).toContain("queued");
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("returns a readable preflight error for non-demo mission actions when the Project is missing", async () => {
    const { server, storage } = await createTestServer({ auth: { disabled: true } });
    const now = "2026-05-31T00:00:00.000Z";
    await storage.createMission({
      mission: {
        id: "mission-non-demo-missing-project",
        project_id: "missing-project",
        title: "Missing project action mission",
        slug: "missing-project-action-mission",
        raw_request: "Exercise action preflight for a missing project.",
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
        id: "event-mission-non-demo-missing-project-created",
        mission_id: "mission-non-demo-missing-project",
        type: "mission.created",
        message: "Mission created",
        payload: { status: MissionStatus.received },
        created_at: now,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/missions/mission-non-demo-missing-project/actions/plan",
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "NOT_FOUND",
      message: "Project not found: missing-project",
    });
  });

  it("returns a readable preflight error when the Project Passport is missing", async () => {
    const registryRoot = await createRegistryRoot();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot });
      const mission = await createMission(server, "Missing passport action mission");

      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/actions/plan`,
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: "NOT_FOUND",
        message: "ProjectPassport not found: ai-novelist",
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("returns a readable preflight error when Mission status does not allow dry-run actions", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    try {
      const { server, storage } = await createTestServer({ auth: { disabled: true }, registryRoot });
      const mission = await createMission(server, "Failed action preflight mission");
      await storage.transitionMission(mission.id, MissionStatus.failed, {
        id: `event-${mission.id}-failed`,
        mission_id: mission.id,
        type: "mission.status.changed",
        message: "Mark mission failed for preflight regression.",
        payload: { to: MissionStatus.failed },
        created_at: mission.created_at,
      });

      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/actions/qa-dry-run`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
        details: expect.objectContaining({ action: "qa", status: MissionStatus.failed }),
      });
      expect(response.json().message).toContain("does not allow qa dry-run actions");
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("returns a readable preflight error when QA action has no target URL", async () => {
    const registryRoot = await createAiNovelistRegistryRootWithoutQaTarget();
    try {
      const { server } = await createTestServer({ auth: { disabled: true }, registryRoot });
      const mission = await createMission(server, "Missing QA target URL mission");

      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/actions/qa-dry-run`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
        details: expect.objectContaining({ action: "qa", missingTargetUrl: true }),
      });
      expect(response.json().message).toContain("requires a local or staging target URL");
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("applies Project Passport preflight before gated real actions are queued", async () => {
    const registryRoot = await createRegistryRoot();
    try {
      await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_CODEX: "true" }, async () => {
        const { server, storage } = await createTestServer({
          auth: { disabled: true },
          workerRuntime: new InProcessWorkerRuntime(),
          registryRoot,
        });
        await seedDemoMission(storage);

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: {},
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({
          code: "NOT_FOUND",
          message: "ProjectPassport not found: ai-novelist",
        });
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("queues qa-playwright with Project Passport, QA charter, targetUrl, mission files, and e2e command metadata", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const injectedSecret = "qa-playwright-api-secret-value";
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_QA_PLAYWRIGHT: "true",
        PSF_API_TOKEN: injectedSecret,
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-playwright`,
          payload: { targetUrl: "http://127.0.0.1:8999/app" },
        });

        expect(response.statusCode).toBe(202);
        const jobs = await workerRuntime.listJobs();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]?.job).toMatchObject({
          missionId: EXAMPLE_MISSION_ID,
          projectId: "ai-novelist",
          type: "qa.playwright",
          mode: "real",
          payload: expect.objectContaining({
            enableRealMode: true,
            targetUrl: "http://127.0.0.1:8999/app",
            qaCharter: expect.stringContaining("QA Charter"),
            passport: expect.objectContaining({
              id: "ai-novelist",
              core_flows: expect.arrayContaining([expect.objectContaining({ id: "open_home" })]),
            }),
            missionFiles: expect.objectContaining({
              "mission.md": expect.stringContaining("Mission"),
              "acceptance.md": expect.stringContaining("Acceptance"),
              "technical-notes.md": expect.any(String),
              "risk-notes.md": expect.any(String),
            }),
            e2eCommandMetadata: expect.objectContaining({
              commands: expect.any(Array),
              executionPolicy: "review-only",
            }),
          }),
        });
        expect(JSON.stringify(response.json())).not.toContain(injectedSecret);
        expect(JSON.stringify(jobs[0]?.job.payload)).not.toContain(injectedSecret);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("blocks qa-playwright preflight when request and passport target URLs are absent", async () => {
    const registryRoot = await createAiNovelistRegistryRootWithoutQaTarget();
    try {
      await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_QA_PLAYWRIGHT: "true" }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        const mission = await createMission(server, "QA missing target URL");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${mission.id}/actions/qa-playwright`,
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({ action: "qa-playwright", missingTargetUrl: true }),
        });
        const details = response.json().details;
        expect(details).toMatchObject({
          canQueue: false,
          canExecute: false,
        });
        expect(details.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({
            category: "configuration",
            key: "configuration.target_url.missing",
            severity: "blocking",
            blocks: ["queue", "execute"],
            source: "orchestrator",
            details: expect.objectContaining({ action: "qa-playwright", missingTargetUrl: true }),
          }),
        ]));
        expect(response.json().message).toContain("target URL");
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("queues codex-real with safe local Codex project context and approval records", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "psf-codex-workspaces-"));
    const localMirror = join(workspaceRoot, "mirrors", "ai-novelist.git");
    await mkdir(localMirror, { recursive: true });
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
        PSF_API_TOKEN: "codex-real-secret-token",
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: {
            approvalId: approval.id,
            repoUrl: localMirror,
            branchName: "agent/ai-novelist-task-7",
            workspaceRoot,
          },
        });

        expect(response.statusCode).toBe(202);
        const jobs = await workerRuntime.listJobs();
        expect(jobs).toHaveLength(1);
        const payload = jobs[0]?.job.payload;
        expect(payload).toMatchObject({
          enableRealMode: true,
          repoUrl: localMirror,
          defaultBranch: "main",
          branchName: "agent/ai-novelist-task-7",
          workspaceRoot,
          approvalRecordIds: [approval.id],
          approvalIds: ["real_codex_execution"],
          requestedApprovalId: approval.id,
          passport: expect.objectContaining({
            id: "ai-novelist",
            repo: expect.objectContaining({ url: "https://github.com/hxfei-git/ai-novelist.git" }),
          }),
          missionFiles: expect.objectContaining({
            "mission.md": expect.stringContaining("Mission"),
            "acceptance.md": expect.stringContaining("Acceptance"),
            "technical-notes.md": expect.any(String),
            "risk-notes.md": expect.any(String),
          }),
          projectAgents: expect.stringContaining("AGENTS"),
          commands: expect.arrayContaining(["pnpm test", "pnpm build"]),
        });
        expect(String(payload?.branchName)).toMatch(/^agent\//);
        expect(payload?.repoUrl).not.toMatch(/^https:\/\/github\.com\//);
        expect(JSON.stringify(payload)).not.toMatch(/codex-real-secret-token|password|api[_-]?key/i);
        expect(JSON.stringify(response.json())).not.toMatch(/codex-real-secret-token|password|api[_-]?key/i);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("queues fix-real with bugs, attempts, passport, mission files, verification commands, and regression evidence", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_FIX: "true",
        PSF_API_TOKEN: "fix-real-secret-token",
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");
        await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/bugs`,
          payload: {
            title: "连续点击生成按钮会重复提交",
            severity: "P1",
            status: "open",
            reproductionSteps: ["打开首页", "连续点击生成按钮"],
            expectedResult: "只提交一次。",
            actualResult: "提交多次。",
            evidence: { scenarioId: "duplicate_click_or_loading_guard", fixAttempts: 1 },
            regressionTestPath: "tests/e2e/generated/bug-duplicate-click.spec.ts",
            suggestedFixDirection: "加入 pending 状态锁。",
            source: "qa-worker",
          },
        });
        await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/artifacts`,
          payload: {
            type: "generated_test",
            path: "tests/e2e/generated/bug-duplicate-click.spec.ts",
            content: "import { test } from '@playwright/test';\ntest('连续点击生成按钮会重复提交 regression', async () => {});",
            metadata: { scenarioId: "duplicate_click_or_loading_guard" },
          },
        });

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/fix-real`,
          payload: { approvalId: approval.id, branchName: "agent/ai-novelist-fix-loop" },
        });

        expect(response.statusCode).toBe(202);
        const jobs = await workerRuntime.listJobs();
        expect(jobs).toHaveLength(1);
        const payload = jobs[0]?.job.payload;
        expect(payload).toMatchObject({
          enableRealMode: true,
          missionStatus: MissionStatus.received,
          currentAttempt: 0,
          maxAttempts: 3,
          maxBugAttempts: 2,
          branchName: "agent/ai-novelist-fix-loop",
          currentBranch: "agent/ai-novelist-fix-loop",
          approvalRecordIds: [approval.id],
          approvalIds: ["real_codex_execution"],
          passport: expect.objectContaining({ id: "ai-novelist" }),
          projectAgents: expect.stringContaining("AGENTS"),
          missionFiles: expect.objectContaining({
            "mission.md": expect.stringContaining("Mission"),
            "acceptance.md": expect.stringContaining("Acceptance"),
          }),
          verificationCommands: expect.objectContaining({
            regression: expect.arrayContaining(["pnpm test:e2e"]),
            unit: expect.arrayContaining(["pnpm test"]),
          }),
          regressionEvidence: expect.objectContaining({
            existingSpecPath: "tests/e2e/generated/bug-duplicate-click.spec.ts",
            existingSpecContent: expect.stringContaining("连续点击生成按钮会重复提交"),
          }),
        });
        expect(payload?.bugs).toEqual([expect.objectContaining({
          title: "连续点击生成按钮会重复提交",
          status: "open",
          severity: "P1",
        })]);
        expect(payload?.perBugAttempts).toEqual(expect.any(Object));
        expect(JSON.stringify(payload)).not.toMatch(/fix-real-secret-token|password|api[_-]?key/i);
        expect(JSON.stringify(response.json())).not.toMatch(/fix-real-secret-token|password|api[_-]?key/i);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("blocks github-pr without required approval and queues safe PR preview context when approved", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_GITHUB_PR: "true",
        GITHUB_TOKEN: "github-pr-secret-token",
        GITHUB_OWNER: "hxfei-git",
        GITHUB_REPO: "personal-software-factory",
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);

        const blocked = await server.inject({ method: "POST", url: `/missions/${EXAMPLE_MISSION_ID}/actions/github-pr`, payload: {} });
        expect(blocked.statusCode).toBe(200);
        expect(blocked.json()).toMatchObject({
          accepted: false,
          action: "github-pr",
          missingApprovalTypes: ["EXTERNAL_COST_RISK"],
          realNetworkCall: false,
        });
        expect(await workerRuntime.listJobs()).toHaveLength(0);

        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "EXTERNAL_COST_RISK");
        const queued = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/github-pr`,
          payload: { branchName: "agent/ai-novelist-pr-preview", baseBranch: "main", sourceSha: "abc123" },
        });

        expect(queued.statusCode).toBe(202);
        const jobs = await workerRuntime.listJobs();
        expect(jobs).toHaveLength(1);
        const payload = jobs[0]?.job.payload;
        expect(payload).toMatchObject({
          enableRealMode: true,
          branchName: "agent/ai-novelist-pr-preview",
          baseBranch: "main",
          sourceSha: "abc123",
          approvalRecordIds: [approval.id],
          approvalIds: ["external_cost_risk"],
          operationGates: {
            allowNetwork: false,
            allowPushBranch: false,
            allowCreatePullRequest: false,
            allowPostQaComment: false,
          },
          mission: expect.objectContaining({
            missionId: EXAMPLE_MISSION_ID,
            branchName: "agent/ai-novelist-pr-preview",
          }),
          prPreview: expect.objectContaining({
            title: expect.stringContaining("完成"),
            body: expect.stringContaining("Dry-run 标记"),
          }),
          operationGateSummary: expect.objectContaining({
            realNetworkCall: false,
            allowCreatePullRequest: false,
          }),
        });
        expect(JSON.stringify(payload)).not.toMatch(/github-pr-secret-token|authorization|bearer/i);
        expect(JSON.stringify(queued.json())).not.toMatch(/github-pr-secret-token|authorization|bearer/i);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("blocks codex-real preflight instead of using a GitHub HTTPS repo URL when no local mirror is provided", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
        PSF_LOCAL_REPO_ai_novelist: undefined,
        PSF_LOCAL_REPO_AI_NOVELIST: undefined,
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: { approvalId: approval.id },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({
            action: "codex-real",
            missingLocalMirror: true,
          }),
        });
        expect(response.json().message).toContain("local repository mirror");
        expect(await workerRuntime.listJobs()).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("blocks codex-real local mirror preflight with canonical blockers, redaction, and safety flags", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const fakeSecret = "codex-local-mirror-preflight-secret";
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
        PSF_API_TOKEN: fakeSecret,
        PSF_LOCAL_REPO_ai_novelist: undefined,
        PSF_LOCAL_REPO_AI_NOVELIST: undefined,
        PSF_WORKSPACE_ROOT: join(tmpdir(), fakeSecret, "env-workspaces"),
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: {
            approvalId: approval.id,
            repoUrl: `https://user:${fakeSecret}@github.com/hxfei-git/ai-novelist.git`,
            branchName: "agent/ai-novelist-task-7",
            workspaceRoot: join(tmpdir(), fakeSecret, "request-workspaces"),
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({
            action: "codex-real",
            missingLocalMirror: true,
            canQueue: false,
            canExecute: false,
            realNetworkCall: false,
            realExternalCall: false,
            realPush: false,
            realDeploy: false,
            recommendedNextAction: expect.any(String),
          }),
        });
        expect(body.details.blockers).toEqual([
          expect.objectContaining({
            category: "policy",
            key: "policy.codex.local_mirror_required",
            severity: "blocking",
            blocks: ["queue", "execute"],
            source: "orchestrator",
            details: {
              action: "codex-real",
              missingLocalMirror: true,
              localRepoEnvName: "PSF_LOCAL_REPO_ai_novelist",
              repoUrlKind: "remote",
            },
          }),
        ]);
        expect(JSON.stringify(body)).not.toContain(fakeSecret);
        expect(await workerRuntime.listJobs()).toHaveLength(0);
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });

  it("blocks whitespace-wrapped remote codex-real repoUrl before enqueueing", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "psf-codex-workspaces-"));
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: {
            approvalId: approval.id,
            repoUrl: " https://github.com/example/ai-novelist.git ",
            branchName: "agent/ai-novelist-task-7",
            workspaceRoot,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({
            action: "codex-real",
            missingLocalMirror: true,
            canQueue: false,
            canExecute: false,
          }),
        });
        expect(body.details.blockers).toEqual([
          expect.objectContaining({
            key: "policy.codex.local_mirror_required",
            blocks: ["queue", "execute"],
            source: "orchestrator",
          }),
        ]);
        expect(await workerRuntime.listJobs()).toHaveLength(0);
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("blocks codex-real unsafe branch preflight with canonical branch policy blocker", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "psf-codex-workspaces-"));
    const localMirror = join(workspaceRoot, "mirrors", "ai-novelist.git");
    await mkdir(localMirror, { recursive: true });
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: {
            approvalId: approval.id,
            repoUrl: localMirror,
            branchName: "main",
            workspaceRoot,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({
            action: "codex-real",
            invalidBranchName: "main",
            canQueue: false,
            canExecute: false,
            realNetworkCall: false,
            realExternalCall: false,
            realPush: false,
            realDeploy: false,
            recommendedNextAction: expect.any(String),
          }),
        });
        expect(body.details.blockers).toEqual([
          expect.objectContaining({
            category: "policy",
            key: "policy.codex.branch_policy",
            severity: "blocking",
            blocks: ["queue", "execute"],
            source: "orchestrator",
            details: {
              action: "codex-real",
              invalidBranchName: "main",
            },
          }),
        ]);
        expect(await workerRuntime.listJobs()).toHaveLength(0);
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("redacts secret-like unsafe branch preflight details", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "psf-codex-workspaces-"));
    const localMirror = join(workspaceRoot, "mirrors", "ai-novelist.git");
    const branchSecret = "branch-secret-value";
    await mkdir(localMirror, { recursive: true });
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: {
            approvalId: approval.id,
            repoUrl: localMirror,
            branchName: `feature/token=${branchSecret}`,
            workspaceRoot,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(JSON.stringify(body)).not.toContain(branchSecret);
        expect(body).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({
            action: "codex-real",
            invalidBranchName: "feature/token=[REDACTED]",
            canQueue: false,
            canExecute: false,
          }),
        });
        expect(body.details.blockers).toEqual([
          expect.objectContaining({
            key: "policy.codex.branch_policy",
            details: expect.objectContaining({ invalidBranchName: "feature/token=[REDACTED]" }),
          }),
        ]);
        expect(await workerRuntime.listJobs()).toHaveLength(0);
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
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

  it("blocks gated real action routes when their explicit real gates are disabled", async () => {
    await withEnv({
      PSF_ACTION_EXECUTION_MODE: "queued",
      ...Object.fromEntries(realActionRoutes.map((route) => [route.gate, undefined])),
    }, async () => {
      const workerRuntime = new InProcessWorkerRuntime();
      const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime });
      await seedDemoMission(storage);

      for (const route of realActionRoutes) {
        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/${route.path}`,
          payload: { approvalId: "approval-real-mode" },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body).toMatchObject({
          accepted: false,
          executionMode: "queued",
          missionId: EXAMPLE_MISSION_ID,
          projectId: "ai-novelist",
          status: "blocked",
          jobType: route.jobType,
          realEnabled: false,
          realNetworkCall: false,
          realExternalCall: false,
        });
        expect(body).toMatchObject({
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          realExternalCall: false,
          realPush: false,
          realDeploy: false,
        });
        expect(body.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({
            category: "queue_acceptance",
            key: "queue_acceptance.route_gate." + route.gate,
            severity: "blocking",
            blocks: ["queue", "execute"],
            source: "orchestrator",
          }),
        ]));
        expect(body.recommendedNextAction).toContain(route.gate);
      }

      expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      expect(await workerRuntime.listJobs()).toHaveLength(0);
    });
  });

  it("blocks gated real actions when required mission approvals are missing", async () => {
    await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_CODEX: "true" }, async () => {
      const workerRuntime = new InProcessWorkerRuntime();
      const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime });
      await seedDemoMission(storage);

      const response = await server.inject({
        method: "POST",
        url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
        payload: { approvalId: "approval-arbitrary" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        accepted: false,
        executionMode: "queued",
        missionId: EXAMPLE_MISSION_ID,
        projectId: "ai-novelist",
        status: "blocked",
        jobType: "codex.real",
        realEnabled: true,
        realNetworkCall: false,
        realExternalCall: false,
        missingApprovalTypes: ["SECURITY_RISK"],
      });
      expect(body.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "approval",
          key: "approval.SECURITY_RISK.missing",
          severity: "blocking",
          blocks: ["queue", "execute"],
          source: "orchestrator",
          details: { action: "codex-real", approvalType: "SECURITY_RISK" },
        }),
      ]));
      expect(body.recommendedNextAction).toContain("SECURITY_RISK");
      expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      expect(await workerRuntime.listJobs()).toHaveLength(0);
    });
  });

  it("reports missing approval types in real-mode readiness", async () => {
    await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_CODEX: "true" }, async () => {
      const { server, storage } = await createTestServer({
        auth: { disabled: true },
        workerRuntime: new InProcessWorkerRuntime(),
      });
      await seedDemoMission(storage);

      const response = await server.inject({ method: "GET", url: `/missions/${EXAMPLE_MISSION_ID}/summary` });

      expect(response.statusCode).toBe(200);
      expect(response.json().realModeReadiness.codex).toMatchObject({
        enabled: true,
        ready: true,
        safeToRun: false,
        requiredApprovalTypes: ["SECURITY_RISK"],
        approvedApprovalTypes: [],
        missingApprovalTypes: ["SECURITY_RISK"],
      });
      const codexReadiness = response.json().realModeReadiness.codex;
      expect(codexReadiness).toMatchObject({
        canQueue: false,
        canExecute: false,
        realNetworkCall: false,
        realExternalCall: false,
        realPush: false,
        realDeploy: false,
        recommendedNextAction: expect.stringContaining("SECURITY_RISK"),
      });
      expect(codexReadiness.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "approval",
          key: "approval.SECURITY_RISK.missing",
          severity: "blocking",
          blocks: ["queue", "execute"],
          source: "orchestrator",
          details: { action: "codex-real", approvalType: "SECURITY_RISK" },
        }),
        expect.objectContaining({
          category: "execution",
          key: "execution.codex.injected_runner_missing",
          severity: "manual_action",
          blocks: ["execute"],
          source: "orchestrator",
          details: expect.objectContaining({ action: "codex-real", evidence: "known_static" }),
        }),
      ]));
      expect(response.json().policyFailures).toContain("Codex real execution missing approvals: SECURITY_RISK.");
    });
  });

  it("reports missing Worker Runtime in real-mode readiness policy failures", async () => {
    await withEnv({ PSF_ENABLE_REAL_CODEX: "true" }, async () => {
      const storage = createInMemoryMissionStorage({ projects: [projectExample] });
      const services = createMissionServices(storage, { actionExecutionMode: "queued" });
      await seedDemoMission(storage);
      const approval = await services.createApproval(EXAMPLE_MISSION_ID, {
        type: "SECURITY_RISK",
        reason: "SECURITY_RISK approval for real action.",
      });
      await services.decideApproval(approval.id, {
        status: "approved",
        decidedBy: "local-user",
        decision: "Approved for queued real action.",
      });

      const response = await services.getMissionSummary(EXAMPLE_MISSION_ID);

      const codexReadiness = response.realModeReadiness.codex;
      expect(codexReadiness).toMatchObject({
        enabled: true,
        ready: false,
        safeToRun: false,
        requiredApprovalTypes: ["SECURITY_RISK"],
        approvedApprovalTypes: ["SECURITY_RISK"],
        missingApprovalTypes: [],
      });
      expect(codexReadiness.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "queue_acceptance",
          key: "queue_acceptance.worker_runtime_missing",
          severity: "blocking",
          blocks: ["queue", "execute"],
          source: "orchestrator",
          details: { action: "codex-real" },
        }),
      ]));
      expect(response.policyFailures).toContain("Codex real execution requires a configured Worker Runtime.");
    });
  });

  it("protects real action reserved payload fields from queued context", () => {
    const job = buildQueuedRealActionJob({
      action: "codex-real",
      missionId: EXAMPLE_MISSION_ID,
      projectId: "ai-novelist",
      workerRunId: "worker-run-reserved-context",
      body: { approvalId: "approval-approved" },
      context: {
        enableRealMode: false,
        approvalIds: ["bad"],
        approvalRecordIds: ["bad"],
        requestedApprovalId: "bad",
        missionFiles: { "mission.md": "# Mission" },
      },
      approvalRecordIds: ["approval-approved"],
      approvalGrantIds: ["real_codex_execution"],
    });

    expect(job.payload).toMatchObject({
      enableRealMode: true,
      approvalRecordIds: ["approval-approved"],
      approvalIds: ["real_codex_execution"],
      requestedApprovalId: "approval-approved",
      missionFiles: { "mission.md": "# Mission" },
    });
  });

  it("queues gated real actions when matching mission approvals are approved", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "psf-codex-workspaces-"));
    const localMirror = join(workspaceRoot, "mirrors", "ai-novelist.git");
    await mkdir(localMirror, { recursive: true });
    try {
      await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_CODEX: "true" }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: { approvalId: approval.id, repoUrl: localMirror, workspaceRoot },
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toMatchObject({
          accepted: true,
          executionMode: "queued",
          missionId: EXAMPLE_MISSION_ID,
          projectId: "ai-novelist",
          status: "queued",
          jobType: "codex.real",
          realEnabled: true,
          realNetworkCall: false,
        });
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(1);
        const jobs = await workerRuntime.listJobs();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]?.job.payload).toMatchObject({
          enableRealMode: true,
          repoUrl: localMirror,
          workspaceRoot,
          approvalRecordIds: [approval.id],
          approvalIds: ["real_codex_execution"],
          requestedApprovalId: approval.id,
        });
      });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("queues only whitelisted gated real action jobs when queued mode and route gates are enabled", async () => {
    for (const route of realActionRoutes) {
      await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", [route.gate]: "true" }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime });
        await seedDemoMission(storage);
        const approvals = [];
        for (const type of requiredApprovalTypesByRealAction[route.path]) {
          approvals.push(await createApprovedApproval(server, EXAMPLE_MISSION_ID, type));
        }

        const codexWorkspaceRoot = route.path === "codex-real" ? await mkdtemp(join(tmpdir(), "psf-codex-workspaces-")) : "";
        const codexLocalMirror = codexWorkspaceRoot === "" ? "" : join(codexWorkspaceRoot, "mirrors", "ai-novelist.git");
        if (codexLocalMirror !== "") {
          await mkdir(codexLocalMirror, { recursive: true });
        }
        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/${route.path}`,
          payload: {
            approvalId: approvals[0]?.id ?? "approval-real-mode",
            ...(route.path === "codex-real" ? { repoUrl: codexLocalMirror, workspaceRoot: codexWorkspaceRoot } : {}),
          },
        });

        expect(response.statusCode).toBe(202);
        const body = response.json();
        expect(body).toMatchObject({
          accepted: true,
          executionMode: "queued",
          missionId: EXAMPLE_MISSION_ID,
          projectId: "ai-novelist",
          status: "queued",
          jobType: route.jobType,
          dryRun: false,
          realEnabled: true,
          realNetworkCall: false,
          realExternalCall: false,
          realPush: false,
          realDeploy: false,
        });

        const workerRuns = await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID);
        expect(workerRuns).toHaveLength(1);
        expect(workerRuns[0]).toMatchObject({
          id: body.workerRunId,
          mission_id: EXAMPLE_MISSION_ID,
          worker_type: "orchestrator",
          status: "queued",
          mode: "real",
          metadata: {
            queueWrapper: true,
            jobId: body.jobId,
            jobType: route.jobType,
            realNetworkCall: false,
          },
        });

        expect(await workerRuntime.getJob(body.jobId)).toMatchObject({
          status: "queued",
          job: {
            id: body.jobId,
            missionId: EXAMPLE_MISSION_ID,
            projectId: "ai-novelist",
            workerRunId: body.workerRunId,
            type: route.jobType,
            mode: "real",
            payload: {
              enableRealMode: true,
              ...(route.path === "codex-real" ? { repoUrl: codexLocalMirror, workspaceRoot: codexWorkspaceRoot } : {}),
              approvalRecordIds: approvals.map((approval) => approval.id),
              approvalIds: route.path === "codex-real" || route.path === "fix-real"
                ? ["real_codex_execution"]
                : route.path === "qa-ai-exploratory" || route.path === "github-pr"
                  ? ["external_cost_risk"]
                  : route.path === "deploy-staging"
                    ? ["production_deploy"]
                    : [],
              requestedApprovalId: approvals[0]?.id ?? "approval-real-mode",
            },
          },
        });
        if (codexWorkspaceRoot !== "") {
          await rm(codexWorkspaceRoot, { recursive: true, force: true });
        }
      });
    }
  });

  it("protects gated real action routes when auth is enabled", async () => {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
    const response = await server.inject({ method: "POST", url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real` });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHORIZED");
  });

  it("queues non-demo mission dry-run actions when the Project exists", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    try {
      const workerRuntime = new InProcessWorkerRuntime();
      const { server, storage } = await createTestServer({
        auth: { disabled: true },
        actionExecutionMode: "queued",
        workerRuntime,
        registryRoot,
      });
      const mission = await createMission(server, "Non-demo queued QA mission");

      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/actions/qa-dry-run`,
        payload: { withSampleBug: true },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        accepted: true,
        executionMode: "queued",
        missionId: mission.id,
        projectId: "ai-novelist",
        status: "queued",
        dryRun: true,
        realCodexExecuted: false,
        realExternalCall: false,
        realPush: false,
        realDeploy: false,
      });
      expect(await storage.listMissionWorkerRuns(mission.id)).toHaveLength(1);
      expect(await workerRuntime.listJobs()).toHaveLength(1);
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
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



  it("lists all approvals and includes a created approval", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Global approval list mission");
    const otherMission = await createMission(server, "Other global approval list mission");
    const approval = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/approvals`,
      payload: { type: "PRODUCTION_DEPLOY", requestedBy: "planner", reason: "Release requires approval." },
    })).json();
    await server.inject({
      method: "POST",
      url: `/missions/${otherMission.id}/approvals`,
      payload: { type: "SECURITY_RISK", requestedBy: "planner", reason: "Security review requires approval." },
    });

    const response = await server.inject({ method: "GET", url: "/approvals" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    expect(response.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: approval.id, mission_id: mission.id, type: "PRODUCTION_DEPLOY" }),
    ]));
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

  it("accepts auto_fix worker runs", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Auto fix WorkerRun mission");
    const created = await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/worker-runs`,
      payload: { workerType: "auto_fix", status: "queued", mode: "dry-run" },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().worker_type).toBe("auto_fix");
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



  it("lists all artifacts and includes a created artifact", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Global artifact list mission");
    const otherMission = await createMission(server, "Other global artifact list mission");
    const artifact = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/artifacts`,
      payload: { type: "mission", name: "mission.md", path: `missions/${mission.id}/mission.md`, content: "# Mission" },
    })).json();
    await server.inject({
      method: "POST",
      url: `/missions/${otherMission.id}/artifacts`,
      payload: { type: "qa_report", path: `missions/${otherMission.id}/qa-report.md`, content: "# QA" },
    });

    const response = await server.inject({ method: "GET", url: "/artifacts" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    expect(response.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: artifact.id, mission_id: mission.id, type: "mission" }),
    ]));
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



  it("lists all bugs and includes a created bug", async () => {
    const { server } = await createTestServer({ auth: { disabled: true } });
    const mission = await createMission(server, "Global bug list mission");
    const otherMission = await createMission(server, "Other global bug list mission");
    const bug = (await server.inject({
      method: "POST",
      url: `/missions/${mission.id}/bugs`,
      payload: {
        title: "Repeated generate clicks",
        severity: "P1",
        reproductionSteps: ["Open editor", "Click generate twice"],
        expectedResult: "One request is submitted.",
        actualResult: "Two requests are submitted.",
      },
    })).json();
    await server.inject({
      method: "POST",
      url: `/missions/${otherMission.id}/bugs`,
      payload: {
        title: "Missing export confirmation",
        severity: "P2",
        reproductionSteps: ["Open export dialog", "Click export"],
        expectedResult: "Confirmation is shown.",
        actualResult: "No confirmation is shown.",
      },
    });

    const response = await server.inject({ method: "GET", url: "/bugs" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    expect(response.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bug.id, mission_id: mission.id, title: "Repeated generate clicks" }),
    ]));
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

  it("returns real-mode visibility, external statuses, and retention metadata in mission summaries without secrets", async () => {
    await withEnv({
      PSF_ENABLE_REAL_GITHUB_PR: undefined,
      GITHUB_TOKEN: "github-summary-secret",
      GITHUB_OWNER: "psf",
      GITHUB_REPO: "factory",
      COOLIFY_TOKEN: "coolify-summary-secret",
      PLANE_API_TOKEN: "plane-summary-secret",
      UPTIME_KUMA_PASSWORD: "monitor-summary-secret",
    }, async () => {
      const { server } = await createTestServer({ auth: { disabled: true }, actionExecutionMode: "inline" });
      const mission = await createMission(server, "Real visibility summary mission");
      const githubRun = (await server.inject({
        method: "POST",
        url: "/missions/" + mission.id + "/worker-runs",
        payload: {
          workerType: "integration",
          status: "succeeded",
          mode: "real",
          output: {
            jobType: "github.pr",
            githubPrUrl: "https://github.example/psf/factory/pull/17",
            status: "pr-ready",
            token: "worker-output-secret",
          },
          metadata: { realNetworkCall: false },
          logs: ["created PR without token github-summary-secret"],
        },
      })).json();
      await server.inject({
        method: "POST",
        url: "/missions/" + mission.id + "/worker-runs",
        payload: {
          workerType: "deploy",
          status: "failed",
          mode: "real",
          output: {
            jobType: "deploy.coolify",
            deploymentUrl: "https://deploy.example/apps/factory",
            deploymentStatus: "blocked",
            password: "deploy-output-secret",
          },
          metadata: { realNetworkCall: false },
        },
      });
      await server.inject({
        method: "POST",
        url: "/missions/" + mission.id + "/worker-runs",
        payload: {
          workerType: "monitor",
          status: "succeeded",
          mode: "real",
          output: {
            jobType: "monitor.uptime_kuma",
            monitorUrl: "https://monitor.example/status/factory",
            monitorStatus: "synced",
          },
          metadata: { realNetworkCall: false },
        },
      });
      await server.inject({
        method: "POST",
        url: "/missions/" + mission.id + "/worker-runs",
        payload: {
          workerType: "integration",
          status: "succeeded",
          mode: "real",
          output: {
            jobType: "plane.sync",
            planeIssueUrl: "https://plane.example/issues/PSF-17",
            planeStatus: "linked",
          },
          metadata: { realNetworkCall: false },
        },
      });
      await server.inject({
        method: "POST",
        url: "/missions/" + mission.id + "/artifacts",
        payload: {
          type: "worker_log",
          path: "artifacts/" + mission.id + "/worker.log",
          workerRunId: githubRun.id,
          metadata: {
            retentionClass: "ephemeral",
            path: "artifacts/" + mission.id + "/worker.log",
            missing: false,
            secret: "artifact-metadata-secret",
          },
        },
      });

      const response = await server.inject({ method: "GET", url: "/missions/" + mission.id + "/summary" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        realModeReadiness: {
          codex: { enabled: false, configured: true, ready: false, safeToRun: false, realNetworkCall: false },
          github: { enabled: false, configured: true, ready: false, safeToRun: false, realNetworkCall: false },
          coolify: { enabled: false, configured: false, ready: false, safeToRun: false, realNetworkCall: false },
          uptimeKuma: { enabled: false, configured: false, ready: false, safeToRun: false, realNetworkCall: false },
          plane: { enabled: false, configured: false, ready: false, safeToRun: false, realNetworkCall: false },
        },
        externalLinks: {
          githubPrUrl: "https://github.example/psf/factory/pull/17",
          deploymentUrl: "https://deploy.example/apps/factory",
          monitorUrl: "https://monitor.example/status/factory",
          planeIssueUrl: "https://plane.example/issues/PSF-17",
        },
        deploymentStatus: { status: "blocked", workerRunId: expect.any(String), url: "https://deploy.example/apps/factory" },
        monitorStatus: { status: "synced", workerRunId: expect.any(String), url: "https://monitor.example/status/factory" },
        planeStatus: { status: "linked", workerRunId: expect.any(String), url: "https://plane.example/issues/PSF-17" },
        artifactRetention: [
          {
            artifactId: expect.any(String),
            type: "worker_log",
            path: "artifacts/" + mission.id + "/worker.log",
            retentionClass: "ephemeral",
            retentionPath: "artifacts/" + mission.id + "/worker.log",
            missing: false,
          },
        ],
      });
      expect(response.json().policyFailures).toEqual(expect.arrayContaining([
        expect.stringContaining("PSF_ACTION_EXECUTION_MODE=queued"),
        expect.stringContaining("PSF_ENABLE_REAL_GITHUB_PR=true"),
      ]));
      const body = JSON.stringify(response.json());
      expect(body).not.toContain("github-summary-secret");
      expect(body).not.toContain("worker-output-secret");
      expect(body).not.toContain("deploy-output-secret");
      expect(body).not.toContain("artifact-metadata-secret");
    });
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
