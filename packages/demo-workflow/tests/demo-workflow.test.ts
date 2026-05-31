import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_REPORT_PATH,
  DEFAULT_DEMO_API_URL,
  DEFAULT_DEMO_HUB_URL,
  EXAMPLE_MISSION_ID,
  formatDoctorResult,
  getDemoBoundary,
  resetDemoData,
  runAiNovelistDemo,
  runDoctor,
  syncDemoResources,
} from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("@psf/demo-workflow scaffold", () => {
  it("exports fixed demo constants and dry-run boundary", () => {
    expect(EXAMPLE_MISSION_ID).toBe("mission-0001-ai-novelist-chapter-review");
    expect(DEFAULT_DEMO_API_URL).toBe("http://127.0.0.1:3000");
    expect(DEFAULT_DEMO_HUB_URL).toBe("http://127.0.0.1:5173");
    expect(getDemoBoundary()).toMatchObject({
      dryRun: true,
      realCodexExecuted: false,
      realExternalCall: false,
      realPush: false,
      realDeploy: false,
    });
  });
});

describe("ai-novelist local demo workflow", () => {
  it("runs the ai-novelist demo with sample bug and writes dry-run artifacts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-demo-workflow-"));
    await cp(resolve("../..", "projects"), join(cwd, "projects"), { recursive: true });

    const result = await runAiNovelistDemo({
      cwd,
      skipDb: true,
      withSampleBug: true,
      now: "2026-05-31T12:00:00.000Z",
    });

    expect(result.missionId).toBe(EXAMPLE_MISSION_ID);
    expect(result.dbSynced).toBe(false);
    expect(result.boundary).toMatchObject({
      realCodexExecuted: false,
      realExternalCall: false,
      realPush: false,
      realDeploy: false,
    });
    expect(result.workerRunIds).toEqual(expect.arrayContaining([
      `worker-run-${EXAMPLE_MISSION_ID}-planner`,
      `worker-run-${EXAMPLE_MISSION_ID}-codex-dry-run`,
      `worker-run-${EXAMPLE_MISSION_ID}-qa-dry-run`,
      `worker-run-${EXAMPLE_MISSION_ID}-auto-fix-dry-run`,
      `worker-run-${EXAMPLE_MISSION_ID}-codex-fix-dry-run`,
    ]));
    expect(result.qaRunIds).toEqual([`qa-run-${EXAMPLE_MISSION_ID}-dry-run`]);
    expect(result.bugIds).toEqual([`bug-${EXAMPLE_MISSION_ID}-sample-duplicate-generate`]);
    expect(result.eventIds.length).toBeGreaterThan(0);
    expect(result.missionDetailUrl).toBe(`${DEFAULT_DEMO_HUB_URL}/missions/${EXAMPLE_MISSION_ID}`);
    expect(result.generatedArtifacts).toEqual(expect.arrayContaining([
      `missions/${EXAMPLE_MISSION_ID}/mission.md`,
      `missions/${EXAMPLE_MISSION_ID}/codex-command.sh`,
      `missions/${EXAMPLE_MISSION_ID}/qa-report.md`,
      `missions/${EXAMPLE_MISSION_ID}/bugs.json`,
      `missions/${EXAMPLE_MISSION_ID}/fix-mission.md`,
      `missions/${EXAMPLE_MISSION_ID}/fix-codex-command.sh`,
      DEMO_REPORT_PATH,
    ]));

    await expect(stat(join(cwd, "missions", EXAMPLE_MISSION_ID, "qa-report.md"))).resolves.toBeTruthy();
    const codexCommandPath = join(cwd, "missions", EXAMPLE_MISSION_ID, "codex-command.sh");
    const fixCommandPath = join(cwd, "missions", EXAMPLE_MISSION_ID, "fix-codex-command.sh");
    expect(await readFile(codexCommandPath, "utf8")).toContain("DRY-RUN REVIEW ARTIFACT");
    expect(await readFile(fixCommandPath, "utf8")).toContain("DRY-RUN REVIEW ARTIFACT");
    expect((await stat(codexCommandPath)).mode & 0o777).toBe(0o644);
    expect((await stat(fixCommandPath)).mode & 0o777).toBe(0o644);
  });

  it("generates a repeatable demo acceptance report without secrets", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-demo-report-"));
    await cp(resolve("../..", "projects"), join(cwd, "projects"), { recursive: true });
    await runAiNovelistDemo({
      cwd,
      skipDb: true,
      withSampleBug: true,
      now: "2026-05-31T12:00:00.000Z",
    });

    const report = await readFile(join(cwd, DEMO_REPORT_PATH), "utf8");
    expect(report).toContain("# AI Novelist Demo Acceptance Report");
    expect(report).toContain("realCodexExecuted: false");
    expect(report).toContain(`missions/${EXAMPLE_MISSION_ID}/qa-report.md`);
    expect(report).not.toMatch(/TOKEN|PASSWORD|SECRET|ghp_/i);
  });

  it("redacts secret-bearing QA target URLs before writing dry-run artifacts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-demo-redacted-url-"));
    await cp(resolve("../..", "projects"), join(cwd, "projects"), { recursive: true });
    const previousQaTestUrl = process.env.QA_TEST_URL;
    const previousStagingUrl = process.env.STAGING_URL;
    process.env.QA_TEST_URL = "https://user:pass@example.test/path?token=abc&safe=ok";
    delete process.env.STAGING_URL;

    try {
      await runAiNovelistDemo({
        cwd,
        skipDb: true,
        withSampleBug: true,
        now: "2026-05-31T12:00:00.000Z",
      });
    } finally {
      if (previousQaTestUrl === undefined) {
        delete process.env.QA_TEST_URL;
      } else {
        process.env.QA_TEST_URL = previousQaTestUrl;
      }
      if (previousStagingUrl === undefined) {
        delete process.env.STAGING_URL;
      } else {
        process.env.STAGING_URL = previousStagingUrl;
      }
    }

    const qaReport = await readFile(join(cwd, "missions", EXAMPLE_MISSION_ID, "qa-report.md"), "utf8");
    const qaSummary = await readFile(join(cwd, "missions", EXAMPLE_MISSION_ID, "qa-summary.json"), "utf8");
    const bugs = await readFile(join(cwd, "missions", EXAMPLE_MISSION_ID, "bugs.json"), "utf8");
    const artifacts = [qaReport, qaSummary, bugs].join("\n");

    expect(qaReport).toContain("https://example.test/path?token=[redacted]&safe=ok");
    expect(artifacts).not.toContain("token=abc");
    expect(artifacts).not.toContain("user:pass");
    expect(artifacts).not.toContain(":pass@");
    expect(artifacts).not.toContain("pass@example");
    expect(artifacts).toContain("[redacted]");
  });

  it("redacts database sync error causes", async () => {
    const now = "2026-05-31T12:00:00.000Z";
    const resources = {
      project: {
        project: {
          id: "ai-novelist",
          slug: "ai-novelist",
          name: "AI Novelist",
          repo_url: "https://example.test/repo.git",
          default_branch: "main",
          status: "active" as const,
          created_at: now,
          updated_at: now,
        },
        passport: {
          id: "ai-novelist",
          name: "AI Novelist",
          repo: { url: "https://example.test/repo.git", default_branch: "main" },
          runtime: { kind: "node" },
          commands: { install: "pnpm install", test: "pnpm test", build: "pnpm build", run_staging: "pnpm dev" },
          urls: { production: "", staging: "" },
          quality_gates: {},
          core_flows: [{ id: "generate", name: "Generate", priority: "P1" as const }],
        },
        passportPath: "projects/ai-novelist/project.passport.yaml",
      },
      metadata: {
        id: EXAMPLE_MISSION_ID,
        projectId: "ai-novelist",
        title: "Demo",
        slug: "demo",
        rawRequest: "Demo",
        status: "planned" as const,
        priority: "P2" as const,
        riskLevel: "medium" as const,
        branchName: `psf/${EXAMPLE_MISSION_ID}`,
        missionDir: `missions/${EXAMPLE_MISSION_ID}`,
        dryRun: true as const,
        createdAt: now,
        updatedAt: now,
      },
      workerRuns: [],
      artifacts: [],
      events: [],
      qaRuns: [],
      bugs: [],
    };
    let message = "";

    try {
      await syncDemoResources({
        ...resources,
        prisma: {
          $connect: async () => {
            throw new Error("failed for postgresql://psf:secret@localhost:5432/psf?token=abc");
          },
          $disconnect: async () => undefined,
          project: { upsert: async () => undefined },
          mission: { upsert: async () => undefined },
          workerRun: { upsert: async () => undefined },
          artifact: { upsert: async () => undefined },
          missionEvent: { upsert: async () => undefined },
          qARun: { upsert: async () => undefined },
          bug: { upsert: async () => undefined },
        },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("Database sync failed");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("token=abc");
    expect(message).toContain("[redacted]");
  });

});


describe("demo doctor and reset", () => {
  it("doctor reports warnings without leaking token values", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-doctor-"));
    await mkdir(join(cwd, "projects", "ai-novelist"), { recursive: true });
    await mkdir(join(cwd, "apps", "hub"), { recursive: true });
    await mkdir(join(cwd, "apps", "orchestrator-api"), { recursive: true });
    await mkdir(join(cwd, "packages"), { recursive: true });
    await mkdir(join(cwd, "workers"), { recursive: true });
    await mkdir(join(cwd, "missions"), { recursive: true });
    await cp(
      resolve("../..", "projects", "ai-novelist", "project.passport.yaml"),
      join(cwd, "projects", "ai-novelist", "project.passport.yaml"),
    );
    await writeFile(join(cwd, ".env.example"), "PSF_API_TOKEN=example\n", "utf8");

    const result = await runDoctor({
      cwd,
      env: { PSF_API_TOKEN: "super-secret-token", ENABLE_REAL_CODEX: "1" },
      checkDatabase: false,
    });
    const human = formatDoctorResult(result);
    const json = formatDoctorResult(result, true);

    expect(result.status).toBe("warning");
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
    expect(human).not.toContain("super-secret-token");
    expect(json).not.toContain("super-secret-token");
    expect(result.checks.some((check) => check.key === "enable-real-codex")).toBe(true);
  });

  it("demo reset refuses to delete without confirmation and protects non-demo ids", async () => {
    await expect(resetDemoData({ cwd: "/tmp", confirm: false, missionId: EXAMPLE_MISSION_ID, skipDb: true })).resolves.toMatchObject({
      deleted: false,
      requiresConfirmation: true,
    });
    await expect(resetDemoData({ cwd: "/tmp", confirm: true, missionId: "mission-real-production", skipDb: true })).rejects.toThrow("Refusing to reset non-demo mission");
  });

  it("demo reset deletes only the scoped mission directory after confirmation", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-demo-reset-"));
    await mkdir(join(cwd, "missions", EXAMPLE_MISSION_ID), { recursive: true });
    await mkdir(join(cwd, "missions", "mission-real-production"), { recursive: true });
    await writeFile(join(cwd, "missions", EXAMPLE_MISSION_ID, "metadata.json"), "{}\n", "utf8");
    await writeFile(join(cwd, "missions", "mission-real-production", "metadata.json"), "{}\n", "utf8");

    const result = await resetDemoData({ cwd, confirm: true, missionId: EXAMPLE_MISSION_ID, skipDb: true });

    expect(result).toMatchObject({
      deleted: true,
      requiresConfirmation: false,
      missionId: EXAMPLE_MISSION_ID,
      deletedDatabaseRecords: [],
    });
    expect(result.deletedPaths).toEqual([`missions/${EXAMPLE_MISSION_ID}`]);
    await expect(stat(join(cwd, "missions", EXAMPLE_MISSION_ID))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(cwd, "missions", "mission-real-production"))).resolves.toBeTruthy();
  });
});

describe("demo doctor hardening", () => {
  it("doctor reports a failed required directory check when a required path is a file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-doctor-dir-file-"));
    await mkdir(join(cwd, "projects", "ai-novelist"), { recursive: true });
    await mkdir(join(cwd, "apps", "hub"), { recursive: true });
    await mkdir(join(cwd, "apps", "orchestrator-api"), { recursive: true });
    await writeFile(join(cwd, "packages"), "not a directory\n", "utf8");
    await mkdir(join(cwd, "workers"), { recursive: true });
    await mkdir(join(cwd, "missions"), { recursive: true });
    await cp(
      resolve("../..", "projects", "ai-novelist", "project.passport.yaml"),
      join(cwd, "projects", "ai-novelist", "project.passport.yaml"),
    );
    await writeFile(join(cwd, ".env.example"), "PSF_API_TOKEN=example\n", "utf8");

    const result = await runDoctor({ cwd, checkDatabase: false });
    const packagesCheck = result.checks.find((check) => check.key === "dir-packages");

    expect(packagesCheck).toMatchObject({
      status: "failed",
      message: expect.stringContaining("not a directory"),
    });
  });

  it("doctor does not fetch non-local API check URLs", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-doctor-nonlocal-api-"));
    await mkdir(join(cwd, "projects", "ai-novelist"), { recursive: true });
    await mkdir(join(cwd, "apps", "hub"), { recursive: true });
    await mkdir(join(cwd, "apps", "orchestrator-api"), { recursive: true });
    await mkdir(join(cwd, "packages"), { recursive: true });
    await mkdir(join(cwd, "workers"), { recursive: true });
    await mkdir(join(cwd, "missions"), { recursive: true });
    await cp(
      resolve("../..", "projects", "ai-novelist", "project.passport.yaml"),
      join(cwd, "projects", "ai-novelist", "project.passport.yaml"),
    );
    await writeFile(join(cwd, ".env.example"), "PSF_API_TOKEN=example\n", "utf8");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    const result = await runDoctor({
      cwd,
      checkApi: true,
      checkDatabase: false,
      env: { PSF_API_URL: "https://example.com/health" },
    });
    const apiCheck = result.checks.find((check) => check.key === "api");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(apiCheck).toMatchObject({
      status: "warning",
      message: expect.stringContaining("non-local URL not checked"),
    });
  });

  it("doctor formatting redacts username-only URL userinfo", () => {
    const result = {
      status: "warning" as const,
      checks: [{
        key: "api",
        status: "warning" as const,
        message: "API HTTP check failed for https://token-value@example.test/health?token=abc&safe=ok",
        details: { url: "https://token-value@example.test/health?token=abc&safe=ok" },
      }],
    };

    const human = formatDoctorResult(result);
    const json = formatDoctorResult(result, true);

    expect(human).not.toContain("token-value");
    expect(json).not.toContain("token-value");
    expect(human).not.toContain("token=abc");
    expect(json).not.toContain("token=abc");
    expect(human).toContain("[redacted]");
    expect(json).toContain("[redacted]");
  });
});
