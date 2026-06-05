import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { redactJson, redactText, assertInsideWorkspace, assertNotForbiddenPath } from "@psf/security";

export type A1BlockTarget = "queue" | "execute";
export type A1BlockerSeverity = "blocking" | "manual_action" | "warning" | "info";
export type A1ProofStatus = "succeeded" | "manual_action" | "blocked";
export type A1TargetAppProviderCall = true | false | "not_observed";

export interface A1ProofBlocker {
  category: "mirror" | "target" | "observation" | "evidence" | "cleanup" | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: A1BlockerSeverity;
  blocks: A1BlockTarget[];
  source: "a1-proof";
  details?: Record<string, unknown>;
}

export interface A1ReadinessState {
  canQueue: boolean;
  canExecute: boolean;
  blockers: A1ProofBlocker[];
  recommendedNextAction: string;
}

export interface A1ProofEvidence {
  sourcePath?: string;
  sourceBranch?: string;
  sourceHead?: string;
  sourceStatusShort?: string;
  mirrorPath?: string;
  mirrorBranch?: string;
  mirrorHead?: string;
  mirrorStatusShort?: string;
  commandTemplate?: string;
  targetUrl?: string;
  targetHttpStatus?: number;
  targetResponseType?: string;
  targetProvider?: "deepseek";
  targetProviderBoundary?: "ai-novelist-web";
  targetAppProviderCall?: A1TargetAppProviderCall;
  webProcessStarted?: boolean;
  webProcessStopped?: boolean;
  artifactPath?: string;
  logSummary?: string;
}

export interface A1ProofResult extends A1ReadinessState {
  status: A1ProofStatus;
  evidence: A1ProofEvidence;
  realNetworkCall: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
}

const severityOrder: Record<A1BlockerSeverity, number> = {
  blocking: 0,
  manual_action: 1,
  warning: 2,
  info: 3,
};

const categoryOrder: Record<A1ProofBlocker["category"], number> = {
  mirror: 0,
  target: 1,
  observation: 2,
  evidence: 3,
  cleanup: 4,
  safety: 5,
};

export function sortA1Blockers(blockers: A1ProofBlocker[]): A1ProofBlocker[] {
  return [...blockers].sort((left, right) => {
    const severity = severityOrder[left.severity] - severityOrder[right.severity];
    if (severity !== 0) return severity;
    const leftQueue = left.blocks.includes("queue") ? 0 : 1;
    const rightQueue = right.blocks.includes("queue") ? 0 : 1;
    if (leftQueue !== rightQueue) return leftQueue - rightQueue;
    const category = categoryOrder[left.category] - categoryOrder[right.category];
    if (category !== 0) return category;
    return left.key.localeCompare(right.key);
  });
}

export function deriveA1Readiness(blockers: A1ProofBlocker[]): A1ReadinessState {
  const sorted = sortA1Blockers(blockers.map((blocker) => {
    if (!blocker.details) {
      return { ...blocker };
    }
    return {
      ...blocker,
      details: sanitizeA1Metadata(blocker.details) as Record<string, unknown>,
    };
  }));
  const canQueue = !sorted.some((blocker) => blocker.blocks.includes("queue"));
  const canExecute = canQueue && !sorted.some((blocker) => blocker.blocks.includes("execute"));
  return {
    canQueue,
    canExecute,
    blockers: sorted,
    recommendedNextAction: sorted[0]?.recommendedNextAction ?? "Review A1 proof evidence before treating the local mirror as observed.",
  };
}

export function sanitizeA1Metadata<T>(metadata: T, extraSecrets: string[] = []): T {
  return redactJson(metadata, extraSecrets);
}

export function buildA1ManualActionResult(input: { blocker: A1ProofBlocker; evidence?: A1ProofEvidence }): A1ProofResult {
  const readiness = deriveA1Readiness([input.blocker]);
  return {
    status: input.blocker.blocks.includes("queue") ? "blocked" : "manual_action",
    ...readiness,
    evidence: sanitizeA1Metadata(input.evidence ?? {}),
    realNetworkCall: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
  };
}

export function safeRelativePath(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).split("\\").join("/");
}

export async function writeA1ProofArtifact(cwd: string, result: A1ProofResult): Promise<string> {
  const artifactPath = resolve(cwd, "artifacts", "a1", "ai-novelist-local-mirror-deepseek-proof.json");
  assertNotForbiddenPath("artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json");
  assertInsideWorkspace(artifactPath, cwd);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(sanitizeA1Metadata(result), null, 2) + "\n", "utf8");
  return join("artifacts", "a1", "ai-novelist-local-mirror-deepseek-proof.json");
}

export function sanitizeA1Text(input: string, extraSecrets: string[] = []): string {
  return redactText(input, extraSecrets);
}
