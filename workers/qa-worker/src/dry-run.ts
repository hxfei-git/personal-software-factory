import type { Artifact, BugReport, MissionEvent, ProjectPassport, QAReport, WorkerRun } from "@psf/mission-schema";

type MissionFileName = "mission.md" | "acceptance.md";

export interface QaDryRunInput {
  missionId: string;
  projectId: string;
  passport: ProjectPassport;
  qaCharter: string;
  missionFiles: Record<MissionFileName, string>;
  stagingUrl?: string;
  withSampleBug?: boolean;
  now?: string;
}

export interface QaSummary {
  missionId: string;
  projectId: string;
  mode: "dry-run";
  status: "passed" | "failed";
  passed: number;
  failed: number;
  browserOpened: false;
  stagingVisited: false;
  generatedRegressionTemplate: true;
  bugCount: number;
  createdAt: string;
}

export interface QaDryRunResult {
  files: Record<"qa-report.md" | "bugs.json" | "qa-summary.json" | "generated-regression.spec.ts", string>;
  workerRun: WorkerRun;
  qaRun: QAReport;
  artifacts: Artifact[];
  bugs: BugReport[];
  events: MissionEvent[];
  directories: string[];
  summary: QaSummary;
}

const DEFAULT_NOW = "2026-05-31T10:00:00.000Z";
const GENERATED_BY = "qa-worker";

export function createQaDryRun(input: QaDryRunInput): QaDryRunResult {
  const now = input.now ?? DEFAULT_NOW;
  const workerRunId = `worker-run-${input.missionId}-qa-dry-run`;
  const qaRunId = `qa-run-${input.missionId}-dry-run`;
  const bugs = input.withSampleBug ? [createSampleBug(input, qaRunId, now)] : [];
  const status = bugs.length > 0 ? "failed" : "passed";
  const summary: QaSummary = {
    missionId: input.missionId,
    projectId: input.projectId,
    mode: "dry-run",
    status,
    passed: bugs.length > 0 ? 17 : 18,
    failed: bugs.length,
    browserOpened: false,
    stagingVisited: false,
    generatedRegressionTemplate: true,
    bugCount: bugs.length,
    createdAt: now,
  };

  const files = {
    "qa-report.md": renderQaReport(input, bugs, summary),
    "bugs.json": JSON.stringify({ bugs }, null, 2) + "\n",
    "qa-summary.json": JSON.stringify(summary, null, 2) + "\n",
    "generated-regression.spec.ts": renderRegressionSpec(input),
  };
  const directories = [
    `missions/${input.missionId}/artifacts/screenshots`,
    `missions/${input.missionId}/artifacts/traces`,
    `missions/${input.missionId}/artifacts/logs`,
  ];
  const qaRun: QAReport = {
    id: qaRunId,
    mission_id: input.missionId,
    target_url: input.stagingUrl ?? "",
    mode: "dry-run",
    status,
    summary: status === "passed" ? "QA dry-run passed without sample bugs." : "QA dry-run found sample bugs.",
    report_path: `missions/${input.missionId}/qa-report.md`,
    screenshots_dir: `missions/${input.missionId}/artifacts/screenshots`,
    trace_path: `missions/${input.missionId}/artifacts/traces`,
    bugs_json_path: `missions/${input.missionId}/bugs.json`,
    ...(input.stagingUrl === undefined || input.stagingUrl === "" ? {} : { staging_url: input.stagingUrl }),
    passed: summary.passed,
    failed: summary.failed,
    started_at: now,
    finished_at: now,
    bugs,
    created_at: now,
    updated_at: now,
  };
  const workerRun: WorkerRun = {
    id: workerRunId,
    mission_id: input.missionId,
    worker_type: "qa",
    status: "succeeded",
    mode: "dry-run",
    started_at: now,
    finished_at: now,
    exit_code: 0,
    input: {
      missionId: input.missionId,
      projectId: input.projectId,
      stagingUrl: input.stagingUrl ?? "",
      withSampleBug: input.withSampleBug ?? false,
    },
    output: {
      generatedFiles: Object.keys(files),
      bugCount: bugs.length,
      qaRunId,
      browserOpened: false,
      stagingVisited: false,
    },
    error: "",
    logs: ["qa dry-run started", "qa report generated", "regression template generated", "qa dry-run completed"],
    metadata: { generatedBy: GENERATED_BY, mode: "dry-run", browserOpened: false, stagingVisited: false },
    created_at: now,
    updated_at: now,
  };
  const artifacts = createArtifacts(input.missionId, workerRunId, files, directories, now);
  const events = createEvents(input.missionId, workerRunId, qaRunId, bugs, artifacts, now);

  return { files, workerRun, qaRun, artifacts, bugs, events, directories, summary };
}

function createSampleBug(input: QaDryRunInput, qaRunId: string, now: string): BugReport {
  return {
    id: `bug-${input.missionId}-sample-duplicate-generate`,
    mission_id: input.missionId,
    qa_run_id: qaRunId,
    title: "连续点击生成按钮会重复提交",
    severity: "P1",
    status: "open",
    reproduction_steps: [
      "打开首页",
      "新建小说项目",
      "输入小说题材",
      "连续点击生成按钮",
    ],
    expected_result: "生成按钮进入 pending 状态且只提交一次生成请求。",
    actual_result: "dry-run 示例 Bug：连续点击可能导致重复提交，需要真实页面验证。",
    evidence: {
      source: "qa-worker-dry-run",
      screenshot: `missions/${input.missionId}/artifacts/screenshots/sample-bug-placeholder.png`,
      trace: `missions/${input.missionId}/artifacts/traces/sample-bug-placeholder.zip`,
      browserOpened: false,
      stagingVisited: false,
    },
    suggested_fix: "为生成动作增加前端 pending 状态锁和后端幂等保护。",
    regression_test_path: `missions/${input.missionId}/generated-regression.spec.ts`,
    suggested_fix_direction: "优先检查生成按钮的 disabled 状态、请求幂等键和失败恢复路径。",
    source: "qa-worker",
    created_at: now,
    updated_at: now,
  };
}

function renderQaReport(input: QaDryRunInput, bugs: BugReport[], summary: QaSummary): string {
  return [
    "# QA Report",
    "",
    "## Mission 信息",
    `- Mission ID: ${input.missionId}`,
    `- Project ID: ${input.projectId}`,
    "",
    "## Project 信息",
    `- 名称: ${input.passport.name}`,
    `- 仓库: ${input.passport.repo.url}`,
    `- 默认分支: ${input.passport.repo.default_branch}`,
    "",
    "## 测试环境",
    "- 运行环境: local dry-run",
    `- stagingUrl: ${input.stagingUrl ?? "未配置"}`,
    "",
    "## 测试模式",
    "dry-run",
    "",
    "## 测试范围",
    "- Project Passport 核心流程",
    "- QA Charter 正常路径",
    "- QA Charter 异常路径",
    "- Mission acceptance.md",
    "",
    "## 执行摘要",
    `- 状态: ${summary.status}`,
    `- 通过项: ${summary.passed}`,
    `- 失败项: ${summary.failed}`,
    "",
    "## 通过项",
    "- 已读取 project.passport.yaml",
    "- 已读取 qa-charter.md",
    "- 已读取 mission.md 和 acceptance.md",
    "- 已生成回归测试模板",
    "",
    "## 失败项",
    bugs.length === 0 ? "- 无" : bugs.map((bug) => `- ${bug.severity}: ${bug.title}`).join("\n"),
    "",
    "## Bug 列表",
    bugs.length === 0 ? "- 无" : bugs.map((bug) => `- ${bug.id}: ${bug.title}`).join("\n"),
    "",
    "## 复现步骤",
    bugs.length === 0 ? "- 无需复现，dry-run 未发现 Bug。" : bugs.flatMap((bug) => bug.reproduction_steps.map((step, index) => `- ${bug.id} / Step ${index + 1}: ${step}`)).join("\n"),
    "",
    "## 证据链接或占位",
    bugs.length === 0 ? "- 无 Bug 证据。" : bugs.map((bug) => `- ${bug.id}: ${JSON.stringify(bug.evidence)}`).join("\n"),
    "",
    "## 风险评级",
    bugs.some((bug) => bug.severity === "P0" || bug.severity === "P1") ? "P1 - 核心流程风险，需要修复。" : "low - dry-run 未发现阻塞问题。",
    "",
    "## 是否允许进入 ready_for_review",
    bugs.length === 0 ? "允许。" : "不允许，需要先进入修复闭环。",
    "",
    "## 推荐下一步",
    bugs.length === 0 ? "进入人工 review 或后续真实 Playwright QA。" : "生成 fix-mission.md 并调用 Codex Worker dry-run。",
    "",
    "## 本次是否真实打开浏览器",
    "否。",
    "",
    "## 本次是否真实访问 staging",
    "否。",
    "",
    "## 本次是否生成回归测试模板",
    "是。",
    "",
  ].join("\n");
}

function renderRegressionSpec(input: QaDryRunInput): string {
  return [
    "import { test, expect } from '@playwright/test';",
    "",
    "test.describe.skip('AI 小说助手 dry-run regression template', () => {",
    "  test('normal path: create novel and export after review', async ({ page }) => {",
    "    await page.goto(process.env.QA_TEST_URL ?? process.env.STAGING_URL ?? 'http://127.0.0.1:8000');",
    "    await expect(page.locator('body')).toBeVisible();",
    "    // 打开首页",
    "    // 新建小说项目",
    "    // 输入小说题材",
    "    // 生成世界观",
    "    // 生成大纲",
    "    // 生成章节",
    "    // 自动审稿",
    "    // 查看审稿报告",
    "    // 修复章节",
    "    // 导出小说",
    "  });",
    "",
    "  test('abnormal paths: validation, refresh, multi-tab, failures', async ({ page, context }) => {",
    "    await page.goto(process.env.QA_TEST_URL ?? process.env.STAGING_URL ?? 'http://127.0.0.1:8000');",
    "    await expect(page.locator('body')).toBeVisible();",
    "    // 空输入提交",
    "    // 超长输入提交",
    "    // 连续点击生成按钮",
    "    // 生成过程中刷新页面",
    "    // 生成过程中后退",
    "    // 多标签页同时操作",
    "    // API 失败",
    "    // 审稿失败",
    "    // 修复失败",
    "    // 导出前跳过审稿",
    "    await context.newPage();",
    "  });",
    "});",
    "",
    `// Generated for mission ${input.missionId}. Replace selectors before enabling.`,
  ].join("\n");
}

function createArtifacts(
  missionId: string,
  workerRunId: string,
  files: QaDryRunResult["files"],
  directories: string[],
  now: string,
): Artifact[] {
  const textArtifacts: Artifact[] = [
    createTextArtifact(missionId, workerRunId, "qa_report", "qa-report.md", files["qa-report.md"], "text/markdown", now),
    createTextArtifact(missionId, workerRunId, "bugs_json", "bugs.json", files["bugs.json"], "application/json", now),
    createTextArtifact(missionId, workerRunId, "other", "qa-summary.json", files["qa-summary.json"], "application/json", now),
    createTextArtifact(missionId, workerRunId, "generated_test", "generated-regression.spec.ts", files["generated-regression.spec.ts"], "text/typescript", now),
  ];
  return [
    ...textArtifacts,
    createPathArtifact(missionId, workerRunId, "screenshot", directories[0]!, now),
    createPathArtifact(missionId, workerRunId, "playwright_trace", directories[1]!, now),
    createPathArtifact(missionId, workerRunId, "log", directories[2]!, now),
  ];
}

function createTextArtifact(
  missionId: string,
  workerRunId: string,
  type: Artifact["type"],
  name: string,
  content: string,
  mimeType: string,
  now: string,
): Artifact {
  return {
    id: `artifact-${missionId}-qa-${slugify(name)}`,
    mission_id: missionId,
    type,
    path: `missions/${missionId}/${name}`,
    worker_run_id: workerRunId,
    content,
    mime_type: mimeType,
    size: Buffer.byteLength(content, "utf8"),
    metadata: { generatedBy: GENERATED_BY, mode: "dry-run", storage: "inline-small-text" },
    created_at: now,
  };
}

function createPathArtifact(missionId: string, workerRunId: string, type: Artifact["type"], artifactPath: string, now: string): Artifact {
  return {
    id: `artifact-${missionId}-qa-${type}`,
    mission_id: missionId,
    type,
    path: artifactPath,
    worker_run_id: workerRunId,
    size: 0,
    metadata: { generatedBy: GENERATED_BY, mode: "dry-run", storage: "path-only", placeholder: true },
    created_at: now,
  };
}

function createEvents(
  missionId: string,
  workerRunId: string,
  qaRunId: string,
  bugs: BugReport[],
  artifacts: Artifact[],
  now: string,
): MissionEvent[] {
  return [
    buildEvent(missionId, "qa.started", "QA dry-run started.", { workerRunId, qaRunId }, now),
    buildEvent(missionId, "worker_run.created", "QA WorkerRun created.", { workerRunId, workerType: "qa", mode: "dry-run" }, now),
    buildEvent(missionId, "qa_run.created", "QA run created.", { qaRunId, status: bugs.length === 0 ? "passed" : "failed" }, now),
    ...artifacts.map((artifact) => buildEvent(missionId, "artifact.created", "QA artifact created.", { artifactId: artifact.id, type: artifact.type, path: artifact.path }, now)),
    ...bugs.map((bug) => buildEvent(missionId, "bug.created", "Bug report created from QA dry-run.", { bugId: bug.id, severity: bug.severity }, now)),
    buildEvent(missionId, "qa.completed", "QA dry-run completed.", { workerRunId, qaRunId, bugCount: bugs.length }, now),
  ];
}

function buildEvent(missionId: string, type: string, message: string, payload: Record<string, unknown>, now: string): MissionEvent {
  return {
    id: `event-${missionId}-${type.replaceAll(".", "-")}-${stableSuffix(payload)}`,
    mission_id: missionId,
    type,
    message,
    payload,
    created_at: now,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stableSuffix(payload: Record<string, unknown>): string {
  const source = String(payload.workerRunId ?? payload.qaRunId ?? payload.artifactId ?? payload.bugId ?? payload.bugCount ?? "root");
  return slugify(source).slice(0, 80) || "root";
}
