import { describe, expect, it } from "vitest";
import {
  ArtifactSchema,
  MissionEventSchema,
  WorkerRunSchema,
  projectPassportExample,
} from "@psf/mission-schema";
import { createDeterministicMissionPlan } from "../src/index.js";

const requiredSections = {
  "mission.md": [
    "## Mission 标题",
    "## 背景",
    "## 目标",
    "## 用户故事",
    "## 范围",
    "## 非目标",
    "## 验收标准",
    "## 必须运行的测试",
    "## 禁止事项",
    "## 预期交付物",
    "## 风险点",
  ],
  "acceptance.md": [
    "## 功能验收",
    "## 交互验收",
    "## 错误处理验收",
    "## 数据一致性验收",
    "## 回归测试验收",
    "## 安全验收",
    "## 人工审批点",
  ],
  "technical-notes.md": [
    "## 相关项目命令",
    "## 相关核心流程",
    "## 推荐修改区域",
    "## 推荐测试策略",
  ],
  "risk-notes.md": [
    "## 技术风险",
    "## 数据风险",
    "## AI 输出风险",
    "## 部署风险",
    "## 需要人工确认的风险",
  ],
} as const;

describe("mission planner", () => {
  it("returns deeply equal output for identical input without explicit missionId", () => {
    const input = {
      projectId: "ai-novelist",
      title: "章节审稿与修复闭环",
      userRequirement: "增加章节审稿和自动修复流程",
      passport: projectPassportExample,
      qaCharter: "# QA Charter\n- 打开首页\n- 新建小说项目",
      priority: "P1" as const,
    };

    const firstPlan = createDeterministicMissionPlan(input);
    const secondPlan = createDeterministicMissionPlan(input);

    expect(firstPlan).toEqual(secondPlan);
  });

  it("derives different mission IDs and artifact paths when passport commands or core flows change", () => {
    const baseInput = {
      projectId: "ai-novelist",
      title: "章节审稿与修复闭环",
      userRequirement: "增加章节审稿和自动修复流程",
      passport: projectPassportExample,
      qaCharter: "# QA Charter\n- 打开首页\n- 新建小说项目",
      priority: "P1" as const,
    };
    const changedPassport = {
      ...projectPassportExample,
      commands: {
        ...projectPassportExample.commands,
        test: ["pytest -q", "npm --prefix web/frontend test"],
      },
      core_flows: [
        ...projectPassportExample.core_flows,
        { id: "review_chapter", name: "Review chapter", priority: "P1" as const },
      ],
    };

    const basePlan = createDeterministicMissionPlan(baseInput);
    const changedPlan = createDeterministicMissionPlan({
      ...baseInput,
      passport: changedPassport,
    });

    expect(changedPlan.missionId).not.toBe(basePlan.missionId);
    expect(changedPlan.artifacts.map((artifact) => artifact.path)).not.toEqual(
      basePlan.artifacts.map((artifact) => artifact.path),
    );
  });

  it("generates all required planning documents", () => {
    const plan = createDeterministicMissionPlan({
      projectId: "ai-novelist",
      title: "章节审稿与修复闭环",
      userRequirement: "增加章节审稿和自动修复流程",
      passport: projectPassportExample,
      qaCharter: "# QA Charter\n- 打开首页\n- 新建小说项目",
      priority: "P1",
      missionId: "mission-test-001",
    });

    expect(plan.files.map((file) => file.name)).toEqual([
      "mission.md",
      "acceptance.md",
      "technical-notes.md",
      "risk-notes.md",
    ]);
    expect(plan.files.find((file) => file.name === "mission.md")?.content).toContain("## 验收标准");
    expect(plan.workerRun.worker_type).toBe("planner");
    expect(plan.workerRun.mode).toBe("dry-run");
    expect(plan.events.map((event) => event.type)).toContain("mission.planning.completed");

    for (const file of plan.files) {
      for (const section of requiredSections[file.name]) {
        expect(file.content).toContain(section);
      }
    }

    expect(plan.artifacts.map((artifact) => artifact.type)).toEqual([
      "mission",
      "acceptance",
      "technical_notes",
      "risk_notes",
    ]);
    expect(plan.artifacts.map((artifact) => artifact.path)).toEqual([
      "missions/mission-test-001/mission.md",
      "missions/mission-test-001/acceptance.md",
      "missions/mission-test-001/technical-notes.md",
      "missions/mission-test-001/risk-notes.md",
    ]);
    expect(plan.artifacts.every((artifact) => artifact.metadata.generatedBy === "mission-planner")).toBe(true);
    expect(plan.artifacts.every((artifact) => artifact.content && artifact.size > 0)).toBe(true);

    expect(WorkerRunSchema.parse(plan.workerRun).status).toBe("succeeded");
    for (const artifact of plan.artifacts) {
      expect(ArtifactSchema.parse(artifact).mission_id).toBe("mission-test-001");
    }
    for (const event of plan.events) {
      expect(MissionEventSchema.parse(event).mission_id).toBe("mission-test-001");
    }
  });
});
