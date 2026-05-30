import { describe, expect, it } from "vitest";
import { MissionStatus, type ProjectPassport } from "@psf/mission-schema";
import { createAutoFixDryRun } from "../src/index.js";

const passport: ProjectPassport = {
  id: "ai-novelist",
  name: "AI 小说助手",
  repo: { url: "https://github.com/hxfei-git/ai-novelist.git", default_branch: "main" },
  runtime: { kind: "web" },
  commands: { install: ["pnpm install"], test: ["pytest -q"], build: ["pnpm build"], run_staging: ["ai-novelist web"] },
  urls: { production: "", staging: "" },
  quality_gates: { require_ai_qa: true },
  core_flows: [{ id: "review_chapter", name: "自动审稿", priority: "P0" }],
};

const baseInput = {
  missionId: "mission-0001-ai-novelist-chapter-review",
  projectId: "ai-novelist",
  missionStatus: MissionStatus.qa_running,
  branchName: "psf/mission-0001-ai-novelist-chapter-review",
  currentBranch: "dry-run/no-worktree",
  passport,
  projectAgents: "# AGENTS\nDo not push remote branches.\n",
  missionFiles: {
    "mission.md": "# Mission\n",
    "acceptance.md": "# Acceptance\n",
    "technical-notes.md": "# Technical Notes\n",
    "risk-notes.md": "# Risk Notes\n",
  },
  bugs: [],
  now: "2026-05-31T10:00:00.000Z",
};

describe("auto-fix loop dry-run", () => {
  it("moves passing QA toward ready_for_review", () => {
    const result = createAutoFixDryRun(baseInput);

    expect(result.decision).toBe("qa_passed");
    expect(result.nextStatus).toBe(MissionStatus.ready_for_review);
    expect(result.files).toEqual({});
    expect(result.events.map((event) => event.type)).toContain("auto_fix.qa_passed");
  });

  it("generates fix mission and Codex dry-run artifacts for bugs", () => {
    const result = createAutoFixDryRun({
      ...baseInput,
      bugs: [{
        id: "bug-sample",
        mission_id: baseInput.missionId,
        title: "连续点击生成按钮会重复提交",
        severity: "P1",
        status: "open",
        reproduction_steps: ["打开首页", "连续点击生成按钮"],
        expected_result: "只提交一次。",
        actual_result: "提交多次。",
        evidence: { source: "qa-worker" },
        suggested_fix_direction: "加入 pending 状态锁。",
        source: "qa-worker",
        created_at: baseInput.now,
        updated_at: baseInput.now,
      }],
    });

    expect(result.decision).toBe("bugs_found");
    expect(result.files["fix-mission.md"]).toContain("连续点击生成按钮会重复提交");
    expect(result.files["fix-acceptance.md"]).toContain("Regression Acceptance");
    expect(result.files["fix-codex-prompt.md"]).toContain("Codex Mission Prompt");
    expect(result.files["fix-codex-command.sh"]).toContain("DRY-RUN REVIEW ARTIFACT");
    expect(result.codexDryRun?.executed).toBe(false);
  });

  it("pauses when max attempts are exhausted", () => {
    const result = createAutoFixDryRun({
      ...baseInput,
      currentAttempt: 3,
      maxAttempts: 3,
      bugs: [{
        id: "bug-sample",
        mission_id: baseInput.missionId,
        title: "仍然失败",
        severity: "P1",
        status: "open",
        reproduction_steps: ["重复执行失败路径"],
        expected_result: "通过。",
        actual_result: "失败。",
        evidence: {},
        created_at: baseInput.now,
        updated_at: baseInput.now,
      }],
    });

    expect(result.decision).toBe("max_attempts_exceeded");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(result.codexDryRun).toBeUndefined();
  });
});
