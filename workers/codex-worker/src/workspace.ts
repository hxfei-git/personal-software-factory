import { access, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertInsideWorkspace,
  assertNotForbiddenPath,
  resolveSafeWorkspacePath,
  redactText,
} from "@psf/security";
import { CodexExecutionRequestSchema, type CodexExecutionRequest } from "./execution-request.js";
import { isProtectedExecutionBranch } from "./safety.js";

const execFileAsync = promisify(execFile);

export interface CodexWorkspaceLeaseReady {
  status: "ready";
  repoPath: string;
  workspaceRoot: string;
  workspacePath: string;
  branchName: string;
  remoteUrl: string;
}

export interface CodexWorkspaceLeaseManualAction {
  status: "manual_action";
  reason: string;
}

export type CodexWorkspaceLeaseResult = CodexWorkspaceLeaseReady | CodexWorkspaceLeaseManualAction;

function manualAction(reason: string): CodexWorkspaceLeaseManualAction {
  return { status: "manual_action", reason: redactText(reason) };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "mission";
}

function hasTraversal(value: string): boolean {
  return value.split(/[\\/]+/).includes("..");
}

function isLocalRepoUrl(repoUrl: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(repoUrl) || repoUrl.startsWith("file://");
}

function localPathFromRepoUrl(repoUrl: string): string {
  if (repoUrl.startsWith("file://")) {
    return new URL(repoUrl).pathname;
  }
  return repoUrl;
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function assertGitRepository(repoPath: string): Promise<void> {
  await access(path.join(repoPath, ".git"));
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    await git(repoPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

export function buildCodexBranchName(input: Pick<CodexExecutionRequest, "branchName" | "projectId" | "missionId">): string {
  return input.branchName ?? `agent/${slugify(input.projectId)}-${slugify(input.missionId)}`;
}

export function buildCodexWorkspaceRelativePath(input: Pick<CodexExecutionRequest, "projectId" | "missionId">): string {
  return path.join(slugify(input.projectId), slugify(input.missionId));
}

export async function leaseCodexWorkspace(rawInput: CodexExecutionRequest): Promise<CodexWorkspaceLeaseResult> {
  const input = CodexExecutionRequestSchema.parse(rawInput);
  const workspaceRoot = path.resolve(input.workspaceRoot ?? process.env.PSF_WORKSPACE_ROOT ?? "workspaces");
  const branchName = buildCodexBranchName(input);

  try {
    if (isProtectedExecutionBranch(branchName)) {
      return manualAction("Real Codex execution branch cannot be main or master.");
    }

    if (!branchName.startsWith("agent/")) {
      return manualAction("Real Codex execution branch must be under agent/.");
    }

    if (hasTraversal(input.repoUrl) || hasTraversal(input.workspaceRoot ?? "") || hasTraversal(branchName)) {
      return manualAction("Path traversal is not allowed for Codex workspace leasing.");
    }

    assertNotForbiddenPath(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });

    if (!isLocalRepoUrl(input.repoUrl)) {
      return manualAction("Remote repository clone/update is not enabled; prepare a local repository mirror under operator control.");
    }

    const repoPath = path.resolve(localPathFromRepoUrl(input.repoUrl));
    assertNotForbiddenPath(repoPath);
    const mirrorRoot = path.join(workspaceRoot, "mirrors");
    try {
      const realWorkspaceRoot = await realpath(workspaceRoot);
      const realMirrorRoot = await realpath(mirrorRoot);
      const realRepoPath = await realpath(repoPath);
      assertInsideWorkspace(realMirrorRoot, realWorkspaceRoot);
      assertInsideWorkspace(realRepoPath, realMirrorRoot);
    } catch {
      return manualAction("Local repository mirror must be inside the Codex workspace mirrors directory.");
    }
    await assertGitRepository(repoPath);

    const remoteUrl = await git(repoPath, ["remote", "get-url", "origin"]).catch(() => "");
    if (!remoteUrl) {
      return manualAction("Repository is missing git remote origin; manual operator action is required before real Codex execution.");
    }

    const workspacePath = resolveSafeWorkspacePath(workspaceRoot, buildCodexWorkspaceRelativePath(input));
    assertInsideWorkspace(workspacePath, workspaceRoot);

    if (await branchExists(repoPath, branchName)) {
      return manualAction("Target Codex agent branch already exists; use a new attempt branch or resolve the existing branch manually.");
    }

    if (await pathExists(workspacePath)) {
      return manualAction("Target Codex workspace path already exists; use a new attempt workspace or resolve it manually.");
    }

    await mkdir(path.dirname(workspacePath), { recursive: true });

    await git(repoPath, ["worktree", "add", "-b", branchName, workspacePath, input.defaultBranch]);

    return {
      status: "ready",
      repoPath,
      workspaceRoot,
      workspacePath,
      branchName,
      remoteUrl: redactText(remoteUrl),
    };
  } catch (error) {
    return manualAction(error instanceof Error ? error.message : String(error));
  }
}
