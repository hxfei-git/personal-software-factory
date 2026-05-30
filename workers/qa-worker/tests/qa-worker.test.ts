import { describe, expect, it } from "vitest";
import { BugReportSchema, QAReportSchema, type ProjectPassport } from "@psf/mission-schema";
import { createQaDryRun, createSkippedPlaywrightSummary } from "../src/index.js";

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
