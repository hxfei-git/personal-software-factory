import { INTEGRATION_DEFINITIONS, buildDryRunResult, formatList } from "./base.js";
import { redactValue } from "./redaction.js";
import type { BugReportInput, IntegrationEnv, MissionIntegrationInput, PlaneDryRunInput, PlaneDryRunResult } from "./types.js";

const definition = INTEGRATION_DEFINITIONS.plane;

function missionTitle(mission: MissionIntegrationInput | undefined): string {
  return mission?.missionTitle?.trim() || mission?.missionId?.trim() || "Mission dry-run";
}

function bugSteps(bug: BugReportInput): string[] {
  return bug.reproductionSteps ?? bug.reproduction_steps ?? [];
}

function bugExpected(bug: BugReportInput): string {
  return bug.expectedResult ?? bug.expected_result ?? "未提供 expected result。";
}

function bugActual(bug: BugReportInput): string {
  return bug.actualResult ?? bug.actual_result ?? "未提供 actual result。";
}

function evidenceSummary(bug: BugReportInput, env: IntegrationEnv = {}): string {
  if (bug.evidence === undefined) {
    return "未提供 evidence。";
  }

  const scrubbedEvidence = redactValue(bug.evidence, env);

  if (typeof scrubbedEvidence === "string") {
    return scrubbedEvidence;
  }

  try {
    return JSON.stringify(scrubbedEvidence, null, 2);
  } catch {
    return "Evidence could not be serialized.";
  }
}

function issueUrl(id: string): string {
  return `https://plane.example.invalid/issues/${id}`;
}

export function runPlaneDryRun(input: PlaneDryRunInput = {}): PlaneDryRunResult {
  const mission = input.mission;
  const bugs = input.bugs ?? [];
  const missionIssueId = `dry-run-plane-${mission?.missionId ?? "mission"}`;

  return buildDryRunResult(definition, {
    ...input,
    message: "Plane dry-run completed locally; no issue API was called.",
    outputs: {
      missionIssue: {
        id: missionIssueId,
        url: issueUrl(missionIssueId),
        title: `[Mission] ${missionTitle(mission)}`,
        description: [
          mission?.missionSummary ?? "未提供 Mission 摘要。",
          "",
          "验收标准:",
          formatList(mission?.acceptanceCriteria, "未提供验收标准。"),
        ].join("\n"),
        status: "simulated",
      },
      bugIssues: bugs.map((bug, index) => {
        const id = `dry-run-plane-bug-${bug.id ?? index + 1}`;
        const summary = evidenceSummary(bug, input.env);
        return {
          id,
          url: issueUrl(id),
          title: `[Bug] ${bug.title ?? "未命名 Bug"}`,
          severity: bug.severity ?? "unknown",
          status: "simulated",
          description: [
            "复现步骤:",
            formatList(bugSteps(bug), "未提供复现步骤。"),
            "",
            `Expected: ${bugExpected(bug)}`,
            `Actual: ${bugActual(bug)}`,
            "",
            "Evidence:",
            summary,
          ].join("\n"),
          evidenceSummary: summary,
        };
      }),
      summary: `Plane simulated 1 mission issue and ${bugs.length} bug issue(s).`,
    },
  });
}
