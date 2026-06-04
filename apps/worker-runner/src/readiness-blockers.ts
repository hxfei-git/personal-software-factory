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
  const key = codexBlockerKey(reason);
  const policyBlocker = key.startsWith("policy.");
  return {
    category: policyBlocker ? "policy" : "execution",
    key,
    message: reason,
    recommendedNextAction: codexRecommendedNextActionForKey(key),
    severity: policyBlocker ? "blocking" : "manual_action",
    blocks: ["execute"],
    source: "worker_runner",
    details: { jobType: "codex.real", defenseInDepth: policyBlocker },
  };
}

export function githubResultBlockers(result: GitHubRealResult): WorkerReadinessBlocker[] {
  const blockers: WorkerReadinessBlocker[] = [];
  const manualActions = result.outputs.manualActions.map((action) => action.toLowerCase());
  const reasonTexts = [...manualActions, result.message.toLowerCase()];

  if (reasonTexts.some((reason) => reason.includes("enable_real_github") || reason.includes("github_token") || reason.includes("not fully configured"))) {
    blockers.push({
      category: "configuration",
      key: "configuration.env.github.missing_or_disabled",
      message: "GitHub real mode is disabled or required environment is missing.",
      recommendedNextAction: "Configure ENABLE_REAL_GITHUB, GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO before retrying.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github" },
    });
  }
  if (manualActions.some((action) => action.includes("transport") || action.includes("allownetwork"))) {
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
  if (reasonTexts.some((reason) => reason.includes("non-protected branch") || reason.includes("protected branch"))) {
    blockers.push({
      category: "policy",
      key: "policy.integration.protected_branch_refused",
      message: "GitHub PR refused a protected branch operation.",
      recommendedNextAction: "Choose an approved non-protected source branch before retrying GitHub PR handling.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github", protectedBranchRefused: true },
    });
  }
  if (manualActions.some((action) => action.includes("operation gate") || action.includes("allowpushbranch") || action.includes("allowcreatepullrequest"))) {
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

function codexBlockerKey(reason: string): WorkerReadinessBlocker["key"] {
  const lowerReason = reason.toLowerCase();
  if (reason.includes("repoUrl")) {
    return "policy.codex.local_mirror_required";
  }
  if (reason.includes("branchName")) {
    return "policy.codex.branch_policy";
  }
  if (lowerReason.includes("injected codex runner") || lowerReason.includes("no injected codex runner")) {
    return "execution.codex.injected_runner_missing";
  }
  return "execution.codex.unclassified_execution_blocker";
}

function codexRecommendedNextActionForKey(key: WorkerReadinessBlocker["key"]): string {
  if (key === "execution.codex.injected_runner_missing") {
    return "Inject an approved local Codex runner or handle this action manually.";
  }
  if (key.startsWith("policy.")) {
    return "Review route preflight and Worker Runner defense-in-depth policy before retrying.";
  }
  return "Inspect Codex worker output and Worker Runner logs before retrying.";
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
