import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
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
  });

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
