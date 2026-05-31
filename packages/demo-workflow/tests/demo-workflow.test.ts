import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_REPORT_PATH,
  DEFAULT_DEMO_API_URL,
  DEFAULT_DEMO_HUB_URL,
  EXAMPLE_MISSION_ID,
  getDemoBoundary,
  runAiNovelistDemo,
} from "../src/index.js";

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
});
