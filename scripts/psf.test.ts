import { cp, mkdir, mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import type { A1ProofDeps } from "./a1-ai-novelist-proof";
import { runPsfCli } from "./psf";

const execFileAsync = promisify(execFile);
const exampleMissionId = "mission-0001-ai-novelist-chapter-review";
const exampleRequest = "增加章节审稿和自动修复流程";

describe("psf CLI", () => {
  test("creates the ai-novelist example mission metadata without external execution", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-cli-"));

    const result = await runPsfCli(
      ["mission:create", "ai-novelist", exampleRequest],
      {
        cwd,
        syncDatabase: false,
      },
    );

    const missionDir = join(cwd, "missions", exampleMissionId);
    const metadata = JSON.parse(await readFile(join(missionDir, "metadata.json"), "utf8")) as {
      id: string;
      projectId: string;
      rawRequest: string;
      status: string;
      dryRun: boolean;
    };

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(exampleMissionId);
    expect(metadata).toMatchObject({
      id: exampleMissionId,
      projectId: "ai-novelist",
      rawRequest: "增加章节审稿和自动修复流程",
      status: "received",
      dryRun: true,
    });
    await expect(stat(join(missionDir, "metadata.json"))).resolves.toBeTruthy();
  });

  test("runs through tsx as a pnpm script entrypoint", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-cli-entrypoint-"));
    const scriptPath = resolve("scripts/psf.ts");
    const tsxBin = resolve("node_modules/.bin/tsx");

    const result = await execFileAsync(
      tsxBin,
      [
        scriptPath,
        "mission:create",
        "ai-novelist",
        "增加章节审稿和自动修复流程",
      ],
      {
        cwd,
        env: { ...process.env, PSF_SKIP_DB: "1" },
      },
    );

    expect(result.stdout).toContain("Created mission mission-0001-ai-novelist-chapter-review");
  }, 15_000);

  test("codex dry-run does not clear planned mission markdown during database sync", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-cli-db-"));
    await cp(resolve("projects"), join(cwd, "projects"), { recursive: true });

    const missionUpdates: Array<Record<string, unknown>> = [];
    const prisma = createPrismaStub(missionUpdates);

    await expect(runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["mission:plan", exampleMissionId], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["codex:dry-run", exampleMissionId], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });

    const codexMissionUpdate = missionUpdates.at(-1);
    expect(codexMissionUpdate).toBeDefined();
    expect(codexMissionUpdate).not.toHaveProperty("missionMarkdown");
    expect(codexMissionUpdate).not.toHaveProperty("acceptanceMarkdown");
  });


  test("codex dry-run writes a non-executable review artifact instead of an executable command", async () => {
    const cwd = await createExampleWorkspace("psf-cli-command-");

    await expect(runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, syncDatabase: false })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["mission:plan", exampleMissionId], { cwd, syncDatabase: false })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["codex:dry-run", exampleMissionId], { cwd, syncDatabase: false })).resolves.toMatchObject({
      exitCode: 0,
    });

    const commandPath = join(cwd, "missions", exampleMissionId, "codex-command.sh");
    const commandFile = await readFile(commandPath, "utf8");
    const commandStat = await stat(commandPath);

    expect(commandStat.mode & 0o111).toBe(0);
    expect(commandFile).toContain("DRY-RUN REVIEW ARTIFACT");
    expect(commandFile).toContain("Codex was not executed by the PSF CLI");
    expect(commandFile).not.toMatch(/^codex exec /m);
  });

  test("mission database updates do not reset runtime fields", async () => {
    const cwd = await createExampleWorkspace("psf-cli-runtime-");
    const missionUpdates: Array<Record<string, unknown>> = [];
    const prisma = createPrismaStub(missionUpdates);

    await expect(runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["mission:plan", exampleMissionId], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });

    const planMissionUpdate = missionUpdates.at(-1);
    expect(planMissionUpdate).toBeDefined();
    expect(planMissionUpdate).not.toHaveProperty("prUrl");
    expect(planMissionUpdate).not.toHaveProperty("currentAttempt");
    expect(planMissionUpdate).not.toHaveProperty("maxAttempts");
    expect(planMissionUpdate).not.toHaveProperty("workspacePath");
  });

  test("mission create is idempotent for existing local metadata", async () => {
    const cwd = await createExampleWorkspace("psf-cli-idempotent-");

    await expect(runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, syncDatabase: false })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["mission:plan", exampleMissionId], { cwd, syncDatabase: false })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["codex:dry-run", exampleMissionId], { cwd, syncDatabase: false })).resolves.toMatchObject({
      exitCode: 0,
    });

    const metadataPath = join(cwd, "missions", exampleMissionId, "metadata.json");
    const before = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;

    await expect(runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, syncDatabase: false })).resolves.toMatchObject({
      exitCode: 0,
    });

    const after = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    expect(after.status).toBe("planned");
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.plannedAt).toBe(before.plannedAt);
    expect(after.codexDryRunAt).toBe(before.codexDryRunAt);
  });


  test("qa dry-run writes report, bugs, summary, regression template, and artifact dirs", async () => {
    const cwd = await createExampleWorkspace("psf-cli-qa-");
    await runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, syncDatabase: false });
    await runPsfCli(["mission:plan", exampleMissionId], { cwd, syncDatabase: false });

    const result = await runPsfCli(["qa:dry-run", exampleMissionId], { cwd, syncDatabase: false });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(cwd, "missions", exampleMissionId, "qa-report.md"), "utf8")).toContain("dry-run");
    expect(await readFile(join(cwd, "missions", exampleMissionId, "bugs.json"), "utf8")).toContain('"bugs": []');
    expect(await readFile(join(cwd, "missions", exampleMissionId, "qa-summary.json"), "utf8")).toContain('"browserOpened": false');
    expect(await readFile(join(cwd, "missions", exampleMissionId, "generated-regression.spec.ts"), "utf8")).toContain("AI 小说助手");
    await expect(stat(join(cwd, "missions", exampleMissionId, "artifacts", "screenshots", ".gitkeep"))).resolves.toBeTruthy();
  });

  test("loop dry-run with sample bug generates fix artifacts without executing Codex", async () => {
    const cwd = await createExampleWorkspace("psf-cli-loop-");
    await runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, syncDatabase: false });
    await runPsfCli(["mission:plan", exampleMissionId], { cwd, syncDatabase: false });

    const result = await runPsfCli(["loop:dry-run", exampleMissionId, "--with-sample-bug"], { cwd, syncDatabase: false });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(cwd, "missions", exampleMissionId, "fix-mission.md"), "utf8")).toContain("Bug");
    expect(await readFile(join(cwd, "missions", exampleMissionId, "fix-codex-command.sh"), "utf8")).toContain("DRY-RUN REVIEW ARTIFACT");
    expect(result.stdout).toContain("Codex was not executed");
  });

  test("integrations status lists configured state for supported providers", async () => {
    const result = await withIntegrationEnv({}, () => runPsfCli(["integrations:status"], { syncDatabase: false }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"externalName": "github"');
    expect(result.stdout).toContain('"externalName": "coolify"');
    expect(result.stdout).toContain('"externalName": "uptime-kuma"');
    expect(result.stdout).toContain('"externalName": "plane"');
    expect(result.stdout).toContain('"mode": "dry-run"');
    expect(result.stdout).toContain('"configured": false');
    expect(result.stdout).toContain('"realEnabled": false');
    expect(result.stdout).toContain('"realNetworkCall": false');
    expect(result.stdout).toContain('"safeToRun": true');
    expect(result.stdout).toContain('"missingEnv"');
  });

  test("integrations status rejects extra arguments", async () => {
    const result = await withIntegrationEnv({}, () => runPsfCli(["integrations:status", "extra"], { syncDatabase: false }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("USAGE");
    expect(result.stderr).toContain("Usage: pnpm psf integrations:status");
  });

  test("integrations dry-run supports the uptime-kuma external provider name", async () => {
    const result = await withIntegrationEnv({}, () =>
      runPsfCli(["integrations:dry-run", "uptime-kuma"], { syncDatabase: false }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"externalName": "uptime-kuma"');
    expect(result.stdout).toContain('"mode": "dry-run"');
    expect(result.stdout).toContain('"configured": false');
    expect(result.stdout).toContain('"realEnabled": false');
    expect(result.stdout).toContain('"realNetworkCall": false');
    expect(result.stdout).toContain('"safeToRun": true');
  });

  test("integrations dry-run does not leak provider tokens to stdout or stderr", async () => {
    const secret = "ghp_cli_secret_token";

    const result = await withIntegrationEnv({ GITHUB_TOKEN: secret }, () =>
      runPsfCli(["integrations:dry-run", "github"], { syncDatabase: false }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });

  test("queues status prints in-process runtime stats without leaking env secrets", async () => {
    const result = await runPsfCli(["queues:status"], {
      syncDatabase: false,
      env: {
        ...process.env,
        PSF_WORKER_RUNTIME: "in-process",
        PSF_API_TOKEN: "secret-token",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain('"runtime": "in-process"');
    expect(result.stdout).toContain('"redisConfigured": false');
    expect(result.stdout).toContain('"counts"');
    expect(result.stdout).not.toContain("secret-token");
  });

  test("worker start and once commands print safe runner guidance", async () => {
    const start = await runPsfCli(["worker:start"], { syncDatabase: false });
    const once = await runPsfCli(["worker:once"], { syncDatabase: false });

    expect(start.exitCode).toBe(0);
    expect(start.stdout).toContain("pnpm worker:dev");
    expect(start.stdout).not.toContain("token");
    expect(once.exitCode).toBe(0);
    expect(once.stdout).toContain("pnpm worker:once");
    expect(once.stdout).not.toContain("token");
  });

  test("worker-run cancel and retry require an explicit WorkerRun id", async () => {
    const cancel = await runPsfCli(["worker-runs:cancel"], { syncDatabase: false });
    const retry = await runPsfCli(["worker-runs:retry"], { syncDatabase: false });

    expect(cancel.exitCode).toBe(1);
    expect(cancel.stderr).toContain("Usage: pnpm psf worker-runs:cancel <workerRunId>");
    expect(retry.exitCode).toBe(1);
    expect(retry.stderr).toContain("Usage: pnpm psf worker-runs:retry <workerRunId>");
  });

  test("doctor json output redacts secret-bearing URLs", async () => {
    const cwd = await createDoctorWorkspace("psf-cli-doctor-");
    const secretUrl = "https://token-value@example.test/health?token=abc&safe=ok";

    const result = await withEnv({ PSF_API_URL: secretUrl }, () =>
      runPsfCli(["doctor", "--json", "--check-api"], { cwd, syncDatabase: false }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"checks"');
    expect(result.stdout).toContain("[redacted]");
    expect(result.stdout).not.toContain("token-value");
    expect(result.stdout).not.toContain("token=abc");
    expect(result.stderr).toBe("");
  });

  test("doctor reports queue and newer real-mode warnings without leaking secrets", async () => {
    const cwd = await createDoctorWorkspace("psf-cli-doctor-ops-");
    const secret = "ghp_doctor_secret";

    const result = await runPsfCli(["doctor", "--json"], {
      cwd,
      syncDatabase: false,
      env: {
        ...process.env,
        PSF_WORKER_RUNTIME: "bullmq",
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_REDIS_URL: undefined,
        PSF_ENABLE_REAL_GITHUB_PR: "true",
        GITHUB_TOKEN: secret,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"PSF_REDIS_URL"');
    expect(result.stdout).toContain("PSF_REDIS_URL is required when PSF_WORKER_RUNTIME=bullmq");
    expect(result.stdout).toContain('"psf-enable-real-github-pr"');
    expect(result.stdout).toContain("realNetworkCall");
    expect(result.stdout).toContain("Worker Runner");
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).toBe("");
  });

  test("artifact cleanup dry-run previews expired artifacts and preserves files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-cli-artifact-cleanup-"));
    const expiredFile = join(cwd, "artifacts", "missions", "mission-123", "run-456", "logs", "old.log");
    await mkdir(join(expiredFile, ".."), { recursive: true });
    await writeFile(expiredFile, "old safe log\n", "utf8");
    await utimes(expiredFile, new Date("2026-05-01T00:00:00.000Z"), new Date("2026-05-01T00:00:00.000Z"));

    const result = await runPsfCli(["artifacts:cleanup", "--dry-run"], {
      cwd,
      syncDatabase: false,
      env: {
        ...process.env,
        PSF_ARTIFACT_CLEANUP_NOW: "2026-06-01T00:00:00.000Z",
        PSF_API_TOKEN: "secret-token",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"dryRun": true');
    expect(result.stdout).toContain('"artifacts/missions/mission-123/run-456/logs/old.log"');
    expect(result.stdout).not.toContain("secret-token");
    expect(result.stderr).toBe("");
    await expect(stat(expiredFile)).resolves.toBeTruthy();
  });

  test("demo reset previews without DEMO_RESET_CONFIRM=1 and does not delete files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-cli-demo-reset-"));
    const missionDir = join(cwd, "missions", exampleMissionId);
    await mkdir(missionDir, { recursive: true });
    await writeFile(join(missionDir, "metadata.json"), "{}\n", "utf8");

    const result = await withEnv({ DEMO_RESET_CONFIRM: undefined }, () =>
      runPsfCli(["demo:reset", "--skip-db"], { cwd, syncDatabase: false }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Demo reset preview only. Set DEMO_RESET_CONFIRM=1 to delete demo data.");
    expect(result.stdout).toContain('"deleted": false');
    expect(result.stdout).toContain('"requiresConfirmation": true');
    await expect(stat(join(missionDir, "metadata.json"))).resolves.toBeTruthy();
  });

  test("demo ai-novelist dry-run prints mission URLs and boundary fields", async () => {
    const cwd = await createExampleWorkspace("psf-cli-demo-ai-");

    const result = await runPsfCli(["demo:ai-novelist", "--with-sample-bug", "--skip-db"], {
      cwd,
      syncDatabase: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Mission ID: ${exampleMissionId}`);
    expect(result.stdout).toContain("API URL: http://127.0.0.1:3000");
    expect(result.stdout).toContain("Hub URL: http://127.0.0.1:5173");
    expect(result.stdout).toContain(`Mission Detail URL: http://127.0.0.1:5173/#mission-detail?id=${exampleMissionId}`);
    expect(result.stdout).toContain("dryRun: true");
    expect(result.stdout).toContain("realCodexExecuted=false realExternalCall=false realPush=false realDeploy=false");
    expect(result.stdout).not.toContain("realCodexExecuted: false");
    expect(result.stdout).not.toContain("realExternalCall: false");
    expect(result.stdout).not.toContain("realPush: false");
    expect(result.stdout).not.toContain("realDeploy: false");
    expect(await readFile(join(cwd, "missions", exampleMissionId, "bugs.json"), "utf8")).toContain("sample-duplicate-generate");
    expect(await readFile(join(cwd, "docs", "reports", "demo-ai-novelist-report.md"), "utf8")).toContain("AI Novelist Demo Acceptance Report");
  });

  test("a1 proof command requires explicit operator confirmation", async () => {
    const cwd = await createExampleWorkspace("psf-cli-a1-usage-");
    const result = await runPsfCli(["a1:ai-novelist-proof", "--skip-db"], { cwd, syncDatabase: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage: pnpm psf a1:ai-novelist-proof");
    expect(result.stderr).toContain("--confirm-web-command");
  });

  test("a1 proof command redacts DeepSeek key and keeps PSF safety flags false", async () => {
    const cwd = await createExampleWorkspace("psf-cli-a1-redaction-");
    const secret = "sk-deepseek-cli-secret";
    const a1ProofDeps = createFakeA1ProofDepsForCli();

    const result = await runPsfCli([
      "a1:ai-novelist-proof",
      "--confirm-web-command",
      "--source", "/home/ubuntu/1.project/ai-novelist",
      "--target-url", "http://127.0.0.1:8000/api/projects",
      "--json",
      "--skip-db",
    ], {
      cwd,
      syncDatabase: false,
      env: { ...process.env, DEEPSEEK_API_KEY: secret },
      a1ProofDeps,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
    expect(result.stdout).toContain('"realNetworkCall": false');
    expect(result.stdout).toContain('"realExternalCall": false');
    expect(result.stdout).toContain('"realPush": false');
    expect(result.stdout).toContain('"realDeploy": false');
    expect(result.stdout).toContain('"targetProvider": "deepseek"');
  });

  test("a1 proof command does not construct default deps without operator confirmation", async () => {
    const cwd = await createExampleWorkspace("psf-cli-a1-no-confirm-");
    const a1ProofDeps = createThrowingA1ProofDeps();

    const result = await runPsfCli(["a1:ai-novelist-proof", "--source", "/home/ubuntu/1.project/ai-novelist", "--target-url", "http://127.0.0.1:8000/api/projects", "--skip-db"], {
      cwd,
      syncDatabase: false,
      a1ProofDeps,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--confirm-web-command");
  });

  test("mission commands reject unsafe mission ids", async () => {
    const cwd = await createExampleWorkspace("psf-cli-path-");

    const planResult = await runPsfCli(["mission:plan", "../escape"], { cwd, syncDatabase: false });
    const codexResult = await runPsfCli(["codex:dry-run", "mission-../escape"], { cwd, syncDatabase: false });

    expect(planResult.exitCode).toBe(1);
    expect(planResult.stderr).toContain("INVALID_MISSION_ID");
    expect(codexResult.exitCode).toBe(1);
    expect(codexResult.stderr).toContain("INVALID_MISSION_ID");
  });

});

async function createExampleWorkspace(prefix: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  await cp(resolve("projects"), join(cwd, "projects"), { recursive: true });
  return cwd;
}

async function createDoctorWorkspace(prefix: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(cwd, "projects", "ai-novelist"), { recursive: true });
  await mkdir(join(cwd, "apps", "hub"), { recursive: true });
  await mkdir(join(cwd, "apps", "orchestrator-api"), { recursive: true });
  await mkdir(join(cwd, "packages"), { recursive: true });
  await mkdir(join(cwd, "workers"), { recursive: true });
  await mkdir(join(cwd, "missions"), { recursive: true });
  await cp(resolve("projects", "ai-novelist", "project.passport.yaml"), join(cwd, "projects", "ai-novelist", "project.passport.yaml"));
  await writeFile(join(cwd, ".env.example"), "PSF_API_TOKEN=example\n", "utf8");
  return cwd;
}

const integrationEnvDefaults: Record<string, string | undefined> = {
  ENABLE_REAL_GITHUB: undefined,
  ENABLE_REAL_COOLIFY: undefined,
  ENABLE_REAL_UPTIME_KUMA: undefined,
  ENABLE_REAL_PLANE: undefined,
  GITHUB_TOKEN: undefined,
  GITHUB_OWNER: undefined,
  GITHUB_REPO: undefined,
  COOLIFY_BASE_URL: undefined,
  COOLIFY_TOKEN: undefined,
  UPTIME_KUMA_BASE_URL: undefined,
  UPTIME_KUMA_USERNAME: undefined,
  UPTIME_KUMA_PASSWORD: undefined,
  PLANE_BASE_URL: undefined,
  PLANE_API_TOKEN: undefined,
  PLANE_WORKSPACE_ID: undefined,
  PLANE_PROJECT_ID: undefined,
};

async function withIntegrationEnv<T>(env: Record<string, string | undefined>, callback: () => Promise<T>): Promise<T> {
  return withEnv({ ...integrationEnvDefaults, ...env }, callback);
}

async function withEnv<T>(env: Record<string, string | undefined>, callback: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createPrismaStub(missionUpdates: Array<Record<string, unknown>>) {
  const upsert = async () => ({});

  return {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    project: { upsert },
    mission: {
      upsert: async (args: unknown) => {
        const update = (args as { update: Record<string, unknown> }).update;
        missionUpdates.push(update);
        return {};
      },
    },
    workerRun: { upsert },
    artifact: { upsert },
    missionEvent: { upsert },
    qARun: { upsert },
    bug: { upsert },
  };
}

function createFakeA1ProofDepsForCli(): A1ProofDeps {
  return {
    pathExists: async () => true,
    isGitRepo: async () => true,
    isExpectedAiNovelistRepo: async () => true,
    cloneLocalRepo: async () => {
      throw new Error("Fake A1 CLI deps must not clone a mirror.");
    },
    gitSnapshot: async (path) => ({
      branch: path.includes("mirrors/ai-novelist") ? "agent/a1-local-mirror-deepseek-proof" : "feature/a1-source",
      head: "abc1234",
      statusShort: "",
    }),
    deepseekConfigured: () => true,
    startWeb: async () => ({ pid: 4242 }),
    observeTarget: async () => ({ httpStatus: 200, responseType: "application/json" }),
    stopWeb: async () => true,
    writeArtifact: async () => "artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json",
    now: () => "2026-06-05T00:00:00.000Z",
  };
}

function createThrowingA1ProofDeps(): A1ProofDeps {
  const fail = (): never => {
    throw new Error("A1 proof deps should not be used without confirmation.");
  };

  return {
    pathExists: async () => fail(),
    isGitRepo: async () => fail(),
    isExpectedAiNovelistRepo: async () => fail(),
    cloneLocalRepo: async () => fail(),
    gitSnapshot: async () => fail(),
    deepseekConfigured: () => fail(),
    startWeb: async () => fail(),
    observeTarget: async () => fail(),
    stopWeb: async () => fail(),
    writeArtifact: async () => fail(),
    now: () => fail(),
  };
}
