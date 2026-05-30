import { describe, expect, it } from "vitest";
import {
  getIntegrationAdapter,
  listIntegrationStatuses,
  runCoolifyDryRun,
  runGitHubDryRun,
  runPlaneDryRun,
  runUptimeKumaDryRun,
} from "../src/index.js";

const fixedNow = "2026-05-31T12:00:00.000Z";

const missionInput = {
  missionId: "mission-001",
  missionTitle: "发布任务看板",
  missionSummary: "为 Hub 增加任务看板的只读视图。",
  project: "personal-software-factory",
  branchName: "psf/mission-001-hub-board",
  acceptanceCriteria: ["展示任务列表", "失败任务可查看 QA 证据"],
  devSummary: "新增 Hub board 页面骨架和数据映射。",
  qaReport: "Playwright smoke 通过，覆盖任务列表加载。",
  bugFixSummary: "修复空任务列表渲染。",
  artifacts: ["artifacts/mission-001/dev-summary.md", "artifacts/mission-001/qa-report.md"],
  workerRuns: [
    { id: "worker-run-1", worker: "codex", status: "succeeded", summary: "完成开发 dry-run。" },
    { id: "worker-run-2", worker: "qa", status: "succeeded", summary: "完成 QA dry-run。" },
  ],
  risks: ["真实发布前需要人工复核部署环境。"],
  requiresHumanApproval: true,
};

function textOf(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe("integration dry-run adapters", () => {
  it("returns all statuses as safe dry-run entries when no tokens are configured", () => {
    const statuses = listIntegrationStatuses({ env: {}, now: fixedNow });

    expect(statuses.map((status) => status.name)).toEqual(["github", "coolify", "uptime_kuma", "plane"]);
    expect(statuses.map((status) => status.externalName)).toEqual(["github", "coolify", "uptime-kuma", "plane"]);
    expect(statuses.every((status) => status.configured === false)).toBe(true);
    expect(statuses.every((status) => status.realNetworkCall === false)).toBe(true);
    expect(statuses.every((status) => status.safeToRun === true)).toBe(true);
  });

  it("keeps dry-runs successful and marks missing env without tokens", () => {
    const results = [
      runGitHubDryRun({ env: {}, now: fixedNow, mission: missionInput }),
      runCoolifyDryRun({ env: {}, now: fixedNow, deployment: { project: "psf", environment: "production" } }),
      runUptimeKumaDryRun({ env: {}, now: fixedNow, monitor: { project: "psf" } }),
      runPlaneDryRun({ env: {}, now: fixedNow, mission: missionInput, bugs: [] }),
    ];

    for (const result of results) {
      expect(result.configured).toBe(false);
      expect(result.missingEnv.length).toBeGreaterThan(0);
      expect(result.safeToRun).toBe(true);
      expect(result.realNetworkCall).toBe(false);
      expect(result.status.configured).toBe(false);
    }
  });

  it("does not enable real network calls when ENABLE_REAL flags are 0", () => {
    const env = {
      ENABLE_REAL_GITHUB: "0",
      ENABLE_REAL_COOLIFY: "0",
      ENABLE_REAL_UPTIME_KUMA: "0",
      ENABLE_REAL_PLANE: "0",
      GITHUB_TOKEN: "github-secret",
      COOLIFY_TOKEN: "coolify-secret",
      COOLIFY_API_URL: "https://coolify.example.test",
      UPTIME_KUMA_URL: "https://uptime.example.test",
      UPTIME_KUMA_USERNAME: "ops",
      UPTIME_KUMA_PASSWORD: "kuma-secret",
      PLANE_API_URL: "https://plane.example.test",
      PLANE_TOKEN: "plane-secret",
      PLANE_WORKSPACE_SLUG: "factory",
      PLANE_PROJECT_ID: "hub",
    };

    const statuses = listIntegrationStatuses({ env, now: fixedNow });

    expect(statuses.every((status) => status.realEnabled === false)).toBe(true);
    expect(statuses.every((status) => status.realNetworkCall === false)).toBe(true);
  });

  it("records realEnabled but still never performs real network calls when ENABLE_REAL flags are 1", () => {
    const env = {
      ENABLE_REAL_GITHUB: "1",
      ENABLE_REAL_COOLIFY: "1",
      ENABLE_REAL_UPTIME_KUMA: "1",
      ENABLE_REAL_PLANE: "1",
      GITHUB_TOKEN: "github-secret",
      COOLIFY_TOKEN: "coolify-secret",
      COOLIFY_API_URL: "https://coolify.example.test",
      UPTIME_KUMA_URL: "https://uptime.example.test",
      UPTIME_KUMA_USERNAME: "ops",
      UPTIME_KUMA_PASSWORD: "kuma-secret",
      PLANE_API_URL: "https://plane.example.test",
      PLANE_TOKEN: "plane-secret",
      PLANE_WORKSPACE_SLUG: "factory",
      PLANE_PROJECT_ID: "hub",
    };

    const results = [
      runGitHubDryRun({ env, now: fixedNow, mission: missionInput }),
      runCoolifyDryRun({ env, now: fixedNow, deployment: { project: "psf", environment: "staging" } }),
      runUptimeKumaDryRun({ env, now: fixedNow, monitor: { project: "psf", stagingUrl: "https://staging.example.test" } }),
      runPlaneDryRun({ env, now: fixedNow, mission: missionInput, bugs: [] }),
    ];

    expect(results.every((result) => result.realEnabled === true)).toBe(true);
    expect(results.every((result) => result.realNetworkCall === false)).toBe(true);
    expect(results.every((result) => result.configured === true)).toBe(true);
  });

  it("does not leak GitHub tokens in statuses or dry-run outputs", () => {
    const env = { ENABLE_REAL_GITHUB: "1", GITHUB_TOKEN: "ghp_top_secret" };

    const result = runGitHubDryRun({ env, now: fixedNow, mission: missionInput });

    expect(textOf(result)).not.toContain("ghp_top_secret");
  });

  it("does not leak Coolify tokens in statuses or dry-run outputs", () => {
    const env = {
      ENABLE_REAL_COOLIFY: "1",
      COOLIFY_TOKEN: "coolify_top_secret",
      COOLIFY_API_URL: "https://coolify.example.test",
    };

    const result = runCoolifyDryRun({ env, now: fixedNow, deployment: { project: "psf", environment: "production" } });

    expect(textOf(result)).not.toContain("coolify_top_secret");
  });

  it("does not leak Uptime Kuma passwords in statuses or dry-run outputs", () => {
    const env = {
      ENABLE_REAL_UPTIME_KUMA: "1",
      UPTIME_KUMA_URL: "https://uptime.example.test",
      UPTIME_KUMA_USERNAME: "ops",
      UPTIME_KUMA_PASSWORD: "kuma_top_secret",
    };

    const result = runUptimeKumaDryRun({ env, now: fixedNow, monitor: { project: "psf", productionUrl: "https://prod.example.test" } });

    expect(textOf(result)).not.toContain("kuma_top_secret");
  });

  it("does not leak Plane tokens in statuses or dry-run outputs", () => {
    const env = {
      ENABLE_REAL_PLANE: "1",
      PLANE_API_URL: "https://plane.example.test",
      PLANE_TOKEN: "plane_top_secret",
      PLANE_WORKSPACE_SLUG: "factory",
      PLANE_PROJECT_ID: "hub",
    };

    const result = runPlaneDryRun({ env, now: fixedNow, mission: missionInput, bugs: [] });

    expect(textOf(result)).not.toContain("plane_top_secret");
  });

  it("builds a complete GitHub PR body for human review", () => {
    const result = runGitHubDryRun({ env: {}, now: fixedNow, mission: missionInput });
    const pr = result.outputs.pullRequest as { body: string };

    expect(pr.body).toContain("Mission 摘要");
    expect(pr.body).toContain("Project");
    expect(pr.body).toContain("Branch");
    expect(pr.body).toContain("验收标准");
    expect(pr.body).toContain("Dev Summary 摘要");
    expect(pr.body).toContain("QA Report 摘要");
    expect(pr.body).toContain("Bug 修复摘要");
    expect(pr.body).toContain("Artifact 列表");
    expect(pr.body).toContain("WorkerRun 摘要");
    expect(pr.body).toContain("风险点");
    expect(pr.body).toContain("是否需要人工确认");
    expect(pr.body).toContain("Dry-run 标记");
  });

  it("maps uptime-kuma external names to the uptime_kuma adapter", () => {
    expect(getIntegrationAdapter("uptime-kuma").name).toBe("uptime_kuma");
    expect(getIntegrationAdapter("uptime_kuma").name).toBe("uptime_kuma");
  });
});
