import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { runPsfCli } from "./psf";

const execFileAsync = promisify(execFile);

describe("psf CLI", () => {
  test("creates the ai-novelist example mission metadata without external execution", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-cli-"));

    const result = await runPsfCli(
      ["mission:create", "ai-novelist", "增加章节审稿和自动修复流程"],
      {
        cwd,
        syncDatabase: false,
      },
    );

    const missionDir = join(cwd, "missions", "mission-0001-ai-novelist-chapter-review");
    const metadata = JSON.parse(await readFile(join(missionDir, "metadata.json"), "utf8")) as {
      id: string;
      projectId: string;
      rawRequest: string;
      status: string;
      dryRun: boolean;
    };

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mission-0001-ai-novelist-chapter-review");
    expect(metadata).toMatchObject({
      id: "mission-0001-ai-novelist-chapter-review",
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

    await expect(runPsfCli(["mission:create", "ai-novelist", "增加章节审稿和自动修复流程"], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["mission:plan", "mission-0001-ai-novelist-chapter-review"], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(runPsfCli(["codex:dry-run", "mission-0001-ai-novelist-chapter-review"], { cwd, prisma })).resolves.toMatchObject({
      exitCode: 0,
    });

    const codexMissionUpdate = missionUpdates.at(-1);
    expect(codexMissionUpdate).toBeDefined();
    expect(codexMissionUpdate).not.toHaveProperty("missionMarkdown");
    expect(codexMissionUpdate).not.toHaveProperty("acceptanceMarkdown");
  });

});

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
  };
}
