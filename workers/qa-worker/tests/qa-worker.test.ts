import { describe, expect, it } from "vitest";
import { BugReportSchema, QAReportSchema, type ProjectPassport } from "@psf/mission-schema";
import {
  createQaDryRun,
  createSkippedPlaywrightSummary,
  runDeterministicPlaywrightQa,
} from "../src/index.js";

const passport: ProjectPassport = {
  id: "ai-novelist",
  name: "AI 小说助手",
  repo: { url: "https://github.com/hxfei-git/ai-novelist.git", default_branch: "main" },
  runtime: { kind: "web" },
  commands: {
    install: ["pnpm install"],
    test: ["pytest -q"],
    build: ["pnpm build"],
    run_staging: ["ai-novelist web"],
  },
  urls: { production: "", staging: "" },
  quality_gates: { require_ai_qa: true },
  core_flows: [{ id: "open_home", name: "打开首页", priority: "P0" }],
};

const input = {
  missionId: "mission-0001-ai-novelist-chapter-review",
  projectId: "ai-novelist",
  passport,
  qaCharter: "# QA Charter\n\n## Normal Paths\n1. 打开首页\n\n## Abnormal Paths\n1. 空输入提交\n",
  missionFiles: {
    "mission.md": "# Mission\n增加章节审稿和自动修复流程\n",
    "acceptance.md": "# Acceptance\n必须覆盖正常和异常路径。\n",
  },
  now: "2026-05-31T10:00:00.000Z",
};

describe("QA Worker dry-run", () => {
  it("generates complete QA artifacts without browser execution", () => {
    const result = createQaDryRun(input);

    expect(result.files["qa-report.md"]).toContain("## 测试模式");
    expect(result.files["qa-report.md"]).toContain("dry-run");
    expect(result.files["bugs.json"]).toContain('"bugs": []');
    expect(result.files["generated-regression.spec.ts"]).toContain("AI 小说助手");
    expect(result.qaRun.status).toBe("passed");
    expect(result.workerRun.worker_type).toBe("qa");
    expect(result.artifacts.map((artifact) => artifact.type)).toContain("qa_report");
    expect(result.events.map((event) => event.type)).toContain("qa.completed");
    expect(QAReportSchema.parse(result.qaRun).status).toBe("passed");
  });

  it("generates a schema-valid sample BugReport when requested", () => {
    const result = createQaDryRun({ ...input, withSampleBug: true });
    const bug = result.bugs[0]!;

    expect(result.qaRun.status).toBe("failed");
    expect(result.files["bugs.json"]).toContain("连续点击生成按钮");
    expect(BugReportSchema.parse(bug).severity).toBe("P1");
    expect(result.events.map((event) => event.type)).toContain("bug.created");
  });

  it("skips optional Playwright when no URL is configured", () => {
    expect(createSkippedPlaywrightSummary({ missionId: input.missionId, now: input.now })).toMatchObject({
      status: "skipped",
      browserOpened: false,
      stagingVisited: false,
    });
  });
});


describe("Deterministic Playwright QA runner", () => {
  it("returns blocked manual action without opening a browser when no target URL is configured", async () => {
    const result = await runDeterministicPlaywrightQa({
      missionId: input.missionId,
      projectId: input.projectId,
      now: input.now,
      env: {},
    });

    expect(result.status).toBe("blocked");
    expect(result.manualActionRequired).toBe(true);
    expect(result.browserOpened).toBe(false);
    expect(result.stagingVisited).toBe(false);
    expect(result.workerRun.status).toBe("skipped");
    expect(result.qaRun.status).toBe("skipped");
    expect(QAReportSchema.parse(result.qaRun).mode).toBe("deterministic");
  });

  it("creates a QARun, QA report, summary, and artifacts for a passing injected run", async () => {
    const result = await runDeterministicPlaywrightQa({
      missionId: input.missionId,
      projectId: input.projectId,
      targetUrl: "http://127.0.0.1:4173",
      now: input.now,
      execute: async () => ({
        status: "passed",
        passed: 3,
        failed: 0,
        logs: ["loaded simple-app fixture", "token=secret_fixture_token"],
        evidence: {
          fixture: "workers/qa-worker/tests/fixtures/simple-app.html",
          screenshotPath: "artifacts/missions/mission-0001-ai-novelist-chapter-review/worker-run-mission-0001-ai-novelist-chapter-review-qa-deterministic/qa/home.png",
        },
      }),
    });

    expect(result.status).toBe("passed");
    expect(result.browserOpened).toBe(false);
    expect(result.files["qa-report.md"]).toContain("deterministic");
    expect(result.files["qa-summary.json"]).toContain('"status": "passed"');
    expect(result.files["qa-summary.json"]).not.toContain("secret_fixture_token");
    expect(result.qaRun.status).toBe("passed");
    expect(result.qaRun.passed).toBe(3);
    expect(result.bugs).toEqual([]);
    expect(result.artifacts.map((artifact) => artifact.type)).toEqual(expect.arrayContaining(["qa_report", "bugs_json", "other", "screenshot", "playwright_trace", "log"]));
    expect(result.artifacts.every((artifact) => artifact.path.startsWith("artifacts/missions/"))).toBe(true);
    expect(QAReportSchema.parse(result.qaRun).status).toBe("passed");
  });

  it("turns a failing injected assertion into schema-valid bugs.json and BugReport evidence", async () => {
    const result = await runDeterministicPlaywrightQa({
      missionId: input.missionId,
      projectId: input.projectId,
      targetUrl: "http://127.0.0.1:4173",
      now: input.now,
      execute: async () => ({
        status: "failed",
        passed: 2,
        failed: 1,
        logs: ["expected title to contain Dashboard", "password=hunter2"],
        failures: [
          {
            title: "Home page title mismatch",
            severity: "P1",
            reproductionSteps: ["Open the fixture app", "Read the page heading"],
            expectedResult: "The heading shows Dashboard.",
            actualResult: "The heading shows Simple App.",
            evidence: {
              assertion: "expected heading text",
              screenshotPath: "artifacts/missions/mission-0001-ai-novelist-chapter-review/worker-run-mission-0001-ai-novelist-chapter-review-qa-deterministic/qa/title-mismatch.png",
              tracePath: "artifacts/missions/mission-0001-ai-novelist-chapter-review/worker-run-mission-0001-ai-novelist-chapter-review-qa-deterministic/qa/trace.zip",
              token: "raw_secret_token",
            },
          },
        ],
      }),
    });

    const bug = result.bugs[0]!;
    const bugsJson = JSON.parse(result.files["bugs.json"]);

    expect(result.status).toBe("failed");
    expect(result.qaRun.status).toBe("failed");
    expect(bugsJson.bugs).toHaveLength(1);
    expect(result.files["bugs.json"]).not.toContain("hunter2");
    expect(result.files["bugs.json"]).not.toContain("raw_secret_token");
    expect(BugReportSchema.parse(bug)).toMatchObject({
      title: "Home page title mismatch",
      expected_result: "The heading shows Dashboard.",
      actual_result: "The heading shows Simple App.",
    });
    expect(bug.reproduction_steps).toEqual(["Open the fixture app", "Read the page heading"]);
    expect(bug.evidence).toMatchObject({
      source: "deterministic-playwright",
      browserOpened: false,
      stagingVisited: true,
    });
  });
});
