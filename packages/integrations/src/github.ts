import { INTEGRATION_DEFINITIONS, buildDryRunResult, formatList } from "./base.js";
import type { GitHubDryRunInput, GitHubDryRunResult, MissionIntegrationInput } from "./types.js";

const definition = INTEGRATION_DEFINITIONS.github;

function missionValue(mission: MissionIntegrationInput | undefined, key: keyof MissionIntegrationInput, fallback: string): string {
  const value = mission?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatWorkerRuns(mission: MissionIntegrationInput | undefined): string {
  if (!mission?.workerRuns?.length) {
    return "- 未提供 WorkerRun 摘要。";
  }

  return mission.workerRuns
    .map((run) => `- ${run.id ?? "worker-run"} (${run.worker ?? "worker"} / ${run.status ?? "unknown"}): ${run.summary ?? "无摘要。"}`)
    .join("\n");
}

export function buildGitHubPullRequestBody(mission: MissionIntegrationInput | undefined): string {
  const project = missionValue(mission, "project", "unknown-project");
  const branchName = missionValue(mission, "branchName", "psf/dry-run-branch");

  return [
    "## Mission 摘要",
    missionValue(mission, "missionSummary", "未提供 Mission 摘要。"),
    "",
    "## Project",
    project,
    "",
    "## Branch",
    branchName,
    "",
    "## 验收标准",
    formatList(mission?.acceptanceCriteria, "未提供验收标准。"),
    "",
    "## Dev Summary 摘要",
    missionValue(mission, "devSummary", "未提供 Dev Summary。"),
    "",
    "## QA Report 摘要",
    missionValue(mission, "qaReport", "未提供 QA Report。"),
    "",
    "## Bug 修复摘要",
    missionValue(mission, "bugFixSummary", "未提供 Bug 修复摘要。"),
    "",
    "## Artifact 列表",
    formatList(mission?.artifacts, "未提供 artifacts。"),
    "",
    "## WorkerRun 摘要",
    formatWorkerRuns(mission),
    "",
    "## 风险点",
    formatList(mission?.risks, "未提供风险点。"),
    "",
    "## 是否需要人工确认",
    mission?.requiresHumanApproval ? "是" : "否",
    "",
    "## Dry-run 标记",
    "此 PR 为 dry-run 模拟结果，未 push 分支、未创建 PR、未访问 GitHub 网络 API。",
  ].join("\n");
}

export function runGitHubDryRun(input: GitHubDryRunInput = {}): GitHubDryRunResult {
  const mission = input.mission;
  const branchName = missionValue(mission, "branchName", `psf/${mission?.missionId ?? "dry-run"}`);
  const missionTitle = missionValue(mission, "missionTitle", "Mission dry-run");
  const project = missionValue(mission, "project", "unknown-project");
  const prBody = buildGitHubPullRequestBody(mission);
  const issueBody = [
    "## Mission",
    missionValue(mission, "missionSummary", "未提供 Mission 摘要。"),
    "",
    "## Dry-run",
    "此 Issue 为 dry-run 模拟结果，未访问 GitHub 网络 API。",
  ].join("\n");

  return buildDryRunResult(definition, {
    ...input,
    message: "GitHub dry-run completed locally; no branch, commit, PR, or Issue was created remotely.",
    outputs: {
      branchName,
      commitMessage: `实现 ${missionTitle} 的任务交付`,
      pullRequest: {
        title: `完成 ${missionTitle}`,
        body: prBody,
        base: "main",
        head: branchName,
      },
      issue: {
        title: `[Mission] ${missionTitle}`,
        body: issueBody,
      },
      simulatedPullRequest: {
        id: "dry-run-github-pr",
        number: 1,
        url: `https://github.example.invalid/${project}/pull/1`,
        status: "simulated",
      },
      simulatedIssue: {
        id: "dry-run-github-issue",
        number: 1,
        url: `https://github.example.invalid/${project}/issues/1`,
        status: "simulated",
      },
    },
  });
}
