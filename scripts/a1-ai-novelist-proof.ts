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
  createdAt?: string;
}

export interface A1ProofResult extends A1ReadinessState {
  status: A1ProofStatus;
  evidence: A1ProofEvidence;
  realNetworkCall: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
}

export interface GitSnapshot {
  branch: string;
  head: string;
  statusShort: string;
}

export interface A1ProofInput {
  cwd: string;
  sourcePath: string;
  mirrorPath: string;
  provider: "deepseek";
  webCommandConfirmed: boolean;
  targetUrl: string;
  host?: string;
  port?: number;
}

export interface A1ProofDeps {
  pathExists(path: string): Promise<boolean>;
  isGitRepo(path: string): Promise<boolean>;
  isExpectedAiNovelistRepo(path: string): Promise<boolean>;
  cloneLocalRepo(sourcePath: string, mirrorPath: string): Promise<void>;
  gitSnapshot(path: string): Promise<GitSnapshot>;
  deepseekConfigured(): boolean;
  startWeb(input: { cwd: string; host: string; port: number; provider: "deepseek" }): Promise<{ pid: number }>;
  observeTarget(input: { targetUrl: string }): Promise<{ httpStatus: number; responseType: string }>;
  stopWeb(process: { pid: number }): Promise<boolean>;
  writeArtifact(cwd: string, result: A1ProofResult): Promise<string>;
  now(): string;
}

const EXPECTED_A1_MIRROR_PATH = "workspaces/mirrors/ai-novelist";

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

export async function runA1AiNovelistProof(input: A1ProofInput, deps: A1ProofDeps): Promise<A1ProofResult> {
  const cwd = resolve(input.cwd);
  const sourcePath = resolve(cwd, input.sourcePath);
  const mirrorPath = resolve(cwd, input.mirrorPath);
  const evidence: A1ProofEvidence = {
    createdAt: deps.now(),
    sourcePath,
    mirrorPath,
    targetUrl: input.targetUrl,
    targetProvider: input.provider,
    targetProviderBoundary: "ai-novelist-web",
    targetAppProviderCall: "not_observed",
  };

  if (!isExpectedA1MirrorPathInput(input.mirrorPath)) {
    return withArtifact(cwd, deps, buildA1ProofResult({
      blockers: [blocker({
        category: "mirror",
        key: "mirror.path_unexpected",
        message: "A1 mirror path must be the expected local ai-novelist mirror path.",
        recommendedNextAction: `Use ${EXPECTED_A1_MIRROR_PATH} as the A1 mirror path before preparing the proof.`,
        severity: "blocking",
        blocks: ["queue", "execute"],
        details: { mirrorPath: input.mirrorPath, expectedMirrorPath: EXPECTED_A1_MIRROR_PATH, resolvedMirrorPath: mirrorPath },
      })],
      evidence,
    }));
  }

  if (sourcePath === mirrorPath) {
    return withArtifact(cwd, deps, sourcePathUnexpectedResult(evidence, sourcePath, "Source path resolves to the configured mirror path."));
  }

  const sourceExists = await deps.pathExists(sourcePath);
  const sourceIsGitRepo = sourceExists ? await deps.isGitRepo(sourcePath) : false;
  const sourceIsExpectedRepo = sourceIsGitRepo ? await deps.isExpectedAiNovelistRepo(sourcePath) : false;
  if (!sourceExists || !sourceIsGitRepo || !sourceIsExpectedRepo) {
    return withArtifact(cwd, deps, sourcePathUnexpectedResult(evidence, sourcePath, "Source path is not the expected ai-novelist git repo.", {
      sourceExists,
      sourceIsGitRepo,
      sourceIsExpectedRepo,
    }));
  }

  let sourceGit: GitSnapshot;
  try {
    sourceGit = await deps.gitSnapshot(sourcePath);
  } catch (error) {
    return withArtifact(cwd, deps, buildA1ProofResult({
      blockers: [blocker({
        category: "mirror",
        key: "mirror.source_status_unreadable",
        message: "A1 could not read source git status before mirror preparation.",
        recommendedNextAction: "Inspect the ai-novelist source repository and retry after git status is readable.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        details: { sourcePath, error: error instanceof Error ? error.message : String(error) },
      })],
      evidence,
    }));
  }

  const sourceEvidence: A1ProofEvidence = {
    ...evidence,
    sourceBranch: sourceGit.branch,
    sourceHead: sourceGit.head,
    sourceStatusShort: sourceGit.statusShort,
  };

  if (isProtectedSourceBranch(sourceGit.branch) && sourceGit.statusShort.trim().length > 0) {
    return withArtifact(cwd, deps, buildA1ProofResult({
      blockers: [blocker({
        category: "mirror",
        key: "mirror.source_main_polluted",
        message: "Source main/master branch has uncommitted changes, so A1 will not prepare a mirror.",
        recommendedNextAction: "Commit or stash source changes, or retry from a clean non-main source branch.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        details: { sourcePath, branch: sourceGit.branch, statusShort: sourceGit.statusShort },
      })],
      evidence: sourceEvidence,
    }));
  }

  const mirrorExists = await deps.pathExists(mirrorPath);
  if (mirrorExists) {
    const mirrorIsGitRepo = await deps.isGitRepo(mirrorPath);
    const mirrorIsExpectedRepo = mirrorIsGitRepo ? await deps.isExpectedAiNovelistRepo(mirrorPath) : false;
    if (!mirrorIsGitRepo || !mirrorIsExpectedRepo) {
      return withArtifact(cwd, deps, buildA1ProofResult({
        blockers: [blocker({
          category: "mirror",
          key: "mirror.existing_path_unexpected",
          message: "Mirror path exists but is not the expected ai-novelist repo.",
          recommendedNextAction: "Inspect workspaces/mirrors/ai-novelist and either remove it manually or point A1 at a verified mirror.",
          severity: "blocking",
          blocks: ["queue", "execute"],
          details: { mirrorPath, mirrorIsGitRepo, mirrorIsExpectedRepo },
        })],
        evidence: sourceEvidence,
      }));
    }
  } else {
    await deps.cloneLocalRepo(sourcePath, mirrorPath);
  }

  const mirrorGit = await deps.gitSnapshot(mirrorPath);
  return continueTargetProof({
    cwd,
    provider: input.provider,
    webCommandConfirmed: input.webCommandConfirmed,
    targetUrl: input.targetUrl,
    host: input.host,
    port: input.port,
  }, deps, {
    ...sourceEvidence,
    mirrorBranch: mirrorGit.branch,
    mirrorHead: mirrorGit.head,
    mirrorStatusShort: mirrorGit.statusShort,
  });
}

function isExpectedA1MirrorPathInput(mirrorPath: string): boolean {
  return mirrorPath.split("\\").join("/") === EXPECTED_A1_MIRROR_PATH;
}

function sourcePathUnexpectedResult(
  evidence: A1ProofEvidence,
  sourcePath: string,
  reason: string,
  details: Record<string, unknown> = {},
): A1ProofResult {
  return buildA1ProofResult({
    blockers: [blocker({
      category: "mirror",
      key: "mirror.source_path_unexpected",
      message: "Source path is not the expected ai-novelist repository for A1 mirror preparation.",
      recommendedNextAction: "Point A1 at the verified ai-novelist source repository before preparing a mirror.",
      severity: "blocking",
      blocks: ["queue", "execute"],
      details: { sourcePath, reason, ...details },
    })],
    evidence,
  });
}

function isProtectedSourceBranch(branch: string): boolean {
  return branch === "main" || branch === "master";
}

function blocker(input: {
  category: A1ProofBlocker["category"];
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: A1BlockerSeverity;
  blocks: A1BlockTarget[];
  details?: Record<string, unknown>;
}): A1ProofBlocker {
  return {
    category: input.category,
    key: input.key,
    message: input.message,
    recommendedNextAction: input.recommendedNextAction,
    severity: input.severity,
    blocks: input.blocks,
    source: "a1-proof",
    ...(input.details ? { details: sanitizeA1Metadata(input.details) as Record<string, unknown> } : {}),
  };
}

async function withArtifact(cwd: string, deps: A1ProofDeps, result: A1ProofResult): Promise<A1ProofResult> {
  const sanitized = sanitizeA1Metadata(result);
  const artifactPath = await deps.writeArtifact(cwd, sanitized);
  return {
    ...sanitized,
    evidence: sanitizeA1Metadata({
      ...sanitized.evidence,
      artifactPath,
    }),
  };
}

async function continueTargetProof(input: {
  cwd: string;
  provider: "deepseek";
  webCommandConfirmed: boolean;
  targetUrl: string;
  host?: string | undefined;
  port?: number | undefined;
}, deps: A1ProofDeps, evidence: A1ProofEvidence): Promise<A1ProofResult> {
  const host = input.host ?? "127.0.0.1";
  const port = input.port ?? 8000;
  const targetEvidence: A1ProofEvidence = {
    ...evidence,
    commandTemplate: `.venv/bin/ai-novelist web --host ${host} --port ${port} --provider ${input.provider}`,
    targetUrl: input.targetUrl,
    targetProvider: input.provider,
    targetProviderBoundary: "ai-novelist-web",
    targetAppProviderCall: "not_observed",
    webProcessStarted: false,
    webProcessStopped: false,
  };

  if (!input.webCommandConfirmed) {
    return withArtifact(input.cwd, deps, buildA1ProofResult({
      blockers: [blocker({
        category: "target",
        key: "target.web_command_unconfirmed",
        message: "The ai-novelist Web start command is not operator-confirmed.",
        recommendedNextAction: "Confirm the exact Web command before starting the target app.",
        severity: "manual_action",
        blocks: ["execute"],
      })],
      evidence: targetEvidence,
    }));
  }

  if (!deps.deepseekConfigured()) {
    return withArtifact(input.cwd, deps, buildA1ProofResult({
      blockers: [blocker({
        category: "target",
        key: "target.deepseek_env_missing",
        message: "DeepSeek provider mode was requested, but the target app environment is not configured.",
        recommendedNextAction: "Configure the DeepSeek credential in the operator environment before retrying A1.",
        severity: "blocking",
        blocks: ["execute"],
      })],
      evidence: targetEvidence,
    }));
  }

  return withArtifact(input.cwd, deps, buildA1ProofResult({
    blockers: [blocker({
      category: "target",
      key: "target.web_lifecycle_required",
      message: "A1 Task 2 stops before starting or observing the ai-novelist Web process.",
      recommendedNextAction: "Run the Task 3 lifecycle proof before treating the DeepSeek target path as observed.",
      severity: "manual_action",
      blocks: ["execute"],
    })],
    evidence: targetEvidence,
  }));
}

function buildA1ProofResult(input: { blockers: A1ProofBlocker[]; evidence: A1ProofEvidence }): A1ProofResult {
  const readiness = deriveA1Readiness(input.blockers);
  return {
    status: input.blockers.length === 0 ? "succeeded" : readiness.canQueue ? "manual_action" : "blocked",
    ...readiness,
    evidence: sanitizeA1Metadata(input.evidence),
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
