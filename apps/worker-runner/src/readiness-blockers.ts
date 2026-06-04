import type { GitHubRealResult } from "@psf/integrations";

export interface WorkerReadinessBlocker {
  category: "queue_acceptance" | "approval" | "configuration" | "policy" | "execution" | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: "blocking" | "manual_action" | "warning" | "info";
  blocks: Array<"queue" | "execute">;
  source: "worker_runner" | "integration" | "worker";
  details?: Record<string, unknown>;
}

export function deriveWorkerReadiness(blockers: WorkerReadinessBlocker[], fallbackRecommendedNextAction: string) {
  const sorted = sortWorkerBlockers(blockers);
  const canQueue = true;
  const canExecute = canQueue && sorted.every((blocker) => !blocker.blocks.includes("execute"));
  return {
    canQueue,
    canExecute,
    blockers: sorted,
    recommendedNextAction: sorted[0]?.recommendedNextAction ?? fallbackRecommendedNextAction,
  };
}

export function codexManualActionBlocker(reason: string): WorkerReadinessBlocker {
  const key = reason.includes("repoUrl")
    ? "policy.codex.local_mirror_required"
    : reason.includes("branchName")
      ? "policy.codex.branch_policy"
      : "execution.codex.injected_runner_missing";
  return {
    category: key.startsWith("policy.") ? "policy" : "execution",
    key,
    message: reason,
    recommendedNextAction: key === "execution.codex.injected_runner_missing"
      ? "Inject an approved local Codex runner or handle this action manually."
      : "Review route preflight and Worker Runner defense-in-depth policy before retrying.",
    severity: key.startsWith("policy.") ? "blocking" : "manual_action",
    blocks: ["execute"],
    source: "worker_runner",
    details: { jobType: "codex.real", defenseInDepth: key.startsWith("policy.") },
  };
}

export function githubResultBlockers(result: GitHubRealResult): WorkerReadinessBlocker[] {
  const blockers: WorkerReadinessBlocker[] = [];
  const manualActions = result.outputs.manualActions.map((action) => action.toLowerCase());
  const defaultManualAction = result.decision !== "succeeded"
    && result.realNetworkCall === false
    && result.outputs.requests.length === 0
    && manualActions.length > 0;

  if (manualActions.some((action) => action.includes("transport")) || defaultManualAction) {
    blockers.push({
      category: "execution",
      key: "execution.integration.injected_transport_missing",
      message: "GitHub PR requires an injected transport before any provider request.",
      recommendedNextAction: "Review PR preview/manual-action output; no push or PR creation occurred.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github" },
    });
  }
  if (manualActions.some((action) => action.includes("operation gate") || action.includes("allowpushbranch") || action.includes("allowcreatepullrequest")) || defaultManualAction) {
    blockers.push({
      category: "policy",
      key: "policy.integration.operation_gate_disabled",
      message: "GitHub PR operation gates are disabled by default.",
      recommendedNextAction: "Keep the PR preview in manual-action mode until operation gates and transport are explicitly approved.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github", realPush: false },
    });
  }
  if (result.decision !== "succeeded" && blockers.length === 0) {
    blockers.push({
      category: "execution",
      key: "execution.integration.unclassified_execution_blocker",
      message: result.message,
      recommendedNextAction: "Inspect the integration adapter output before retrying.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github" },
    });
  }
  return sortWorkerBlockers(blockers);
}

export function sortWorkerBlockers(blockers: WorkerReadinessBlocker[]): WorkerReadinessBlocker[] {
  const severityOrder: Record<WorkerReadinessBlocker["severity"], number> = {
    blocking: 0,
    manual_action: 1,
    warning: 2,
    info: 3,
  };
  const categoryOrder: Record<WorkerReadinessBlocker["category"], number> = {
    queue_acceptance: 0,
    approval: 1,
    configuration: 2,
    policy: 3,
    execution: 4,
    safety: 5,
  };
  return [...blockers].sort((left, right) => {
    const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDiff !== 0) return severityDiff;

    const blockDiff = queueBlockRank(left) - queueBlockRank(right);
    if (blockDiff !== 0) return blockDiff;

    const categoryDiff = categoryOrder[left.category] - categoryOrder[right.category];
    if (categoryDiff !== 0) return categoryDiff;

    return left.key.localeCompare(right.key);
  });
}

function queueBlockRank(blocker: WorkerReadinessBlocker): number {
  return blocker.blocks.includes("queue") ? 0 : 1;
}
