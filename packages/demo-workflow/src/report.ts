import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEMO_REPORT_PATH } from "./constants.js";
import { relativeToCwd, resolveInside } from "./paths.js";
import type { DemoWorkflowResult } from "./types.js";

export interface DemoReportInput {
  result: DemoWorkflowResult;
  generatedAt: string;
}

export async function writeDemoReport(cwd: string, input: DemoReportInput): Promise<string> {
  const reportPath = resolveInside(cwd, ...DEMO_REPORT_PATH.split("/"));
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderDemoReport(input), "utf8");
  return relativeToCwd(cwd, reportPath);
}

export function renderDemoReport(input: DemoReportInput): string {
  const { result, generatedAt } = input;
  return [
    "# AI Novelist Demo Acceptance Report",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "## Mission",
    `- Mission ID: ${result.missionId}`,
    `- Project ID: ${result.projectId}`,
    `- API URL: ${result.apiUrl}`,
    `- Hub URL: ${result.hubUrl}`,
    `- Mission URL: ${result.missionDetailUrl}`,
    `- DB synced: ${result.dbSynced}`,
    "",
    "## Dry-run Boundary",
    `- dryRun: ${result.boundary.dryRun}`,
    `- realCodexExecuted: ${result.boundary.realCodexExecuted}`,
    `- realExternalCall: ${result.boundary.realExternalCall}`,
    `- realPush: ${result.boundary.realPush}`,
    `- realDeploy: ${result.boundary.realDeploy}`,
    "",
    "## Worker Runs",
    ...formatList(result.workerRunIds),
    "",
    "## QA Runs",
    ...formatList(result.qaRunIds),
    "",
    "## Bugs",
    ...formatList(result.bugIds),
    "",
    "## Generated Artifacts",
    ...formatList(result.generatedArtifacts),
    "",
    "## Acceptance",
    "- Mission planning artifacts generated.",
    "- Codex command files are review-only and non-executable.",
    "- QA dry-run artifacts generated without browser or staging access.",
    "- Auto-fix dry-run artifacts generated without invoking Codex.",
    "- No push, deployment, or external provider action was performed.",
    "",
  ].join("\n");
}

function formatList(items: string[]): string[] {
  return items.length === 0 ? ["- none"] : items.map((item) => `- ${item}`);
}
