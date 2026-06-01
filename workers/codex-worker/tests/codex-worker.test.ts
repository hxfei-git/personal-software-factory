import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ArtifactSchema,
  MissionEventSchema,
  WorkerRunSchema,
  projectPassportExample,
} from "@psf/mission-schema";
import {
  CodexExecutionRequestSchema,
  RealCodexRunner,
  assertSafeCodexExecution,
  createCodexDryRun,
  leaseCodexWorkspace,
} from "../src/index.js";

const input = {
  missionId: "mission-0001",
  projectId: "ai-novelist",
  branchName: "agent/mission-0001",
  currentBranch: "agent/mission-0001",
  passport: projectPassportExample,
  projectAgents: "# AGENTS\n- Do not push.",
  missionFiles: {
    "mission.md": "# Mission\nBuild feature.",
    "acceptance.md": "# Acceptance\nPass tests.",
    "technical-notes.md": "# Technical Notes\nUse existing commands.",
    "risk-notes.md": "# Risk Notes\nNo production deploy.",
  },
  mode: "dry-run",
} as const;

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function gitOutput(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function createTempGitRepo(name = "repo", root?: string): Promise<string> {
  const repoRoot = root ?? await mkdtemp(path.join(os.tmpdir(), "psf-codex-worker-"));
  const repo = path.join(repoRoot, name);

  git(repoRoot, ["init", repo]);
  git(repo, ["config", "user.email", "codex-worker-test@example.com"]);
  git(repo, ["config", "user.name", "Codex Worker Test"]);
  await writeFile(path.join(repo, "README.md"), "# Fixture\n", "utf8");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "initial"]);
  git(repo, ["branch", "-M", "main"]);
  git(repo, ["remote", "add", "origin", repo]);

  return repo;
}

async function createWorkspaceMirrorRepo(workspaceRoot: string, name = "repo"): Promise<string> {
  const mirrorRoot = path.join(workspaceRoot, "mirrors");
  await mkdir(mirrorRoot, { recursive: true });
  return createTempGitRepo(name, mirrorRoot);
}

async function createFakeCodexExecutable(exitCode: 0 | 1): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "psf-fake-codex-"));
  const executable = path.join(root, "fake-codex.sh");

  await writeFile(
    executable,
    [
      "#!/usr/bin/env bash",
      "echo 'stdout token=stdout_secret'",
      "echo 'stderr Authorization: Bearer stderr_secret' >&2",
      `exit ${exitCode}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(executable, 0o755);

  return executable;
}

async function createShellExecutable(lines: string[]): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "psf-fake-codex-"));
  const executable = path.join(root, "fake-codex.sh");
  await writeFile(executable, ["#!/usr/bin/env bash", ...lines, ""].join("\n"), "utf8");
  await chmod(executable, 0o755);
  return executable;
}

function gitBranchExists(cwd: string, branchName: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", branchName], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function realRequest(overrides: Partial<Parameters<typeof CodexExecutionRequestSchema.parse>[0]> = {}) {
  return CodexExecutionRequestSchema.parse({
    missionId: "mission-0001",
    projectId: "ai-novelist",
    repoUrl: "/tmp/repo",
    defaultBranch: "main",
    missionFiles: input.missionFiles,
    approvalIds: ["real_codex_execution"],
    commands: ["pnpm test"],
    branchName: "agent/ai-novelist-mission-0001",
    workspaceRoot: path.join(os.tmpdir(), "psf-workspaces"),
    timeoutMs: 10_000,
    mode: "real",
    ...overrides,
  });
}

function monorepoRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "codex-worker" && path.basename(path.dirname(cwd)) === "workers") {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

async function runFromMonorepoRoot<T>(callback: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  process.chdir(monorepoRoot());
  try {
    return await callback();
  } finally {
    process.chdir(originalCwd);
  }
}

describe("codex worker dry-run", () => {
  it("generates prompt, command, summary, worker run, and artifacts without execution", () => {
    const result = createCodexDryRun(input);

    expect(result.executed).toBe(false);
    expect(result.files["codex-command.sh"]).toContain("codex exec --sandbox workspace-write");
    expect(result.files["codex-prompt.md"]).toContain("Do not modify main/master");
    expect(result.workerRun.worker_type).toBe("codex");
    expect(result.workerRun.mode).toBe("dry-run");
    expect(result.artifacts.map((artifact) => artifact.type)).toContain("codex_prompt");
    expect(result.events.map((event) => event.type)).toContain("codex.dry_run.created");

    expect(WorkerRunSchema.parse(result.workerRun).status).toBe("succeeded");
    for (const artifact of result.artifacts) {
      expect(ArtifactSchema.parse(artifact).mission_id).toBe("mission-0001");
    }
    for (const event of result.events) {
      expect(MissionEventSchema.parse(event).mission_id).toBe("mission-0001");
    }
  });

  it("single-quotes adversarial prompt content in the generated shell command", () => {
    const result = createCodexDryRun({
      ...input,
      projectAgents: `# AGENTS\n- Do not run $(touch /tmp/agents-pwned).\n- Do not run \`touch /tmp/backtick-pwned\`.\n- Quote "double" and 'single'.`,
      missionFiles: {
        ...input.missionFiles,
        "mission.md": `# Mission\nHandle $(touch /tmp/mission-pwned), \`touch /tmp/tick-pwned\`, "double", and 'single'.`,
      },
    });

    const command = result.files["codex-command.sh"];

    expect(command).toMatch(/^codex exec --sandbox workspace-write --ask-for-approval on-request '/);
    expect(command).toContain(`'"'"'`);
    expect(command).toContain("$(touch /tmp/mission-pwned)");
    expect(command).toContain("`touch /tmp/tick-pwned`");
    expect(command).not.toMatch(/on-request "/);
  });

  it("blocks real mode at the public dry-run API boundary when real Codex is disabled", () => {
    expect(() =>
      createCodexDryRun({
        ...input,
        mode: "real",
        enableRealCodex: false,
        hasApproval: true,
        currentBranch: "agent/test",
      }),
    ).toThrow(/ENABLE_REAL_CODEX=1/);
  });

  it("blocks real execution on main and master", () => {
    expect(() =>
      assertSafeCodexExecution({ mode: "real", enableRealCodex: true, currentBranch: "main", hasApproval: true }),
    ).toThrow(/main\/master/);
    expect(() =>
      assertSafeCodexExecution({ mode: "real", enableRealCodex: true, currentBranch: "master", hasApproval: true }),
    ).toThrow(/main\/master/);
  });

  it("blocks real execution unless enabled and approved", () => {
    expect(() =>
      assertSafeCodexExecution({
        mode: "real",
        enableRealCodex: false,
        currentBranch: "agent/mission-0001",
        hasApproval: true,
      }),
    ).toThrow(/ENABLE_REAL_CODEX=1/);
    expect(() =>
      assertSafeCodexExecution({
        mode: "real",
        enableRealCodex: true,
        currentBranch: "agent/mission-0001",
        hasApproval: false,
      }),
    ).toThrow(/approved Approval record/);
  });

  it("allows dry-run on protected branches and still does not execute", () => {
    const result = createCodexDryRun({
      ...input,
      currentBranch: "main",
      branchName: "agent/mission-0001",
    });

    expect(result.executed).toBe(false);
    expect(result.workerRun.output.executed).toBe(false);
  });
});


describe("real Codex runner gated mode", () => {
  it("returns a blocked result before spawning when real Codex is disabled", async () => {
    let spawned = false;
    const runner = new RealCodexRunner({
      env: {
        ENABLE_REAL_CODEX: "0",
        CODEX_EXECUTABLE: "/tmp/should-not-run",
        PSF_WORKSPACE_ROOT: path.join(os.tmpdir(), "psf-workspaces"),
      },
      spawnCodex: async () => {
        spawned = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const result = await runner.run(realRequest());

    expect(result.status).toBe("blocked");
    expect(result.executed).toBe(false);
    expect(result.reason).toMatch(/ENABLE_REAL_CODEX=1/);
    expect(spawned).toBe(false);
  });

  it("leases a git worktree under PSF_WORKSPACE_ROOT using an agent branch", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(root);

    const lease = await leaseCodexWorkspace(realRequest({
      repoUrl: repo,
      workspaceRoot: root,
      branchName: "agent/ai-novelist-mission-0001",
    }));

    expect(lease.status).toBe("ready");
    if (lease.status !== "ready") {
      throw new Error(lease.reason);
    }
    expect(lease.workspacePath).toContain(root);
    expect(lease.branchName).toBe("agent/ai-novelist-mission-0001");
    expect(lease.workspacePath).toContain("ai-novelist");
    expect(lease.workspacePath).toContain("mission-0001");
  });

  it("refuses an existing agent branch without resetting its tip", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(root);
    const branchName = "agent/ai-novelist-existing-branch";

    git(repo, ["checkout", "-b", branchName]);
    await writeFile(path.join(repo, "branch-work.txt"), "existing mission work\n", "utf8");
    git(repo, ["add", "branch-work.txt"]);
    git(repo, ["commit", "-m", "existing mission work"]);
    const existingBranchTip = gitOutput(repo, ["rev-parse", branchName]);
    git(repo, ["checkout", "main"]);

    const lease = await leaseCodexWorkspace(realRequest({
      repoUrl: repo,
      workspaceRoot: root,
      branchName,
      missionId: "existing-branch",
    }));

    expect(lease.status).toBe("manual_action");
    expect(gitOutput(repo, ["rev-parse", branchName])).toBe(existingBranchTip);
  });

  it("refuses an existing target worktree path without deleting or overwriting it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(root);
    const missionId = "existing-worktree-path";
    const workspacePath = path.join(root, "ai-novelist", missionId);
    const sentinel = path.join(workspacePath, "sentinel.txt");
    await mkdir(workspacePath, { recursive: true });
    await writeFile(sentinel, "do not overwrite\n", "utf8");

    const lease = await leaseCodexWorkspace(realRequest({
      repoUrl: repo,
      workspaceRoot: root,
      missionId,
      branchName: "agent/ai-novelist-existing-worktree-path",
    }));

    expect(lease.status).toBe("manual_action");
    expect(await readFile(sentinel, "utf8")).toBe("do not overwrite\n");
  });

  it("refuses protected execution branches and repositories without git remotes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const mirrorRoot = path.join(root, "mirrors");
    await mkdir(mirrorRoot, { recursive: true });
    const repoWithoutRemote = await mkdtemp(path.join(mirrorRoot, "psf-codex-no-remote-"));
    git(repoWithoutRemote, ["init"]);

    await expect(leaseCodexWorkspace(realRequest({
      repoUrl: repoWithoutRemote,
      workspaceRoot: root,
      branchName: "main",
    }))).resolves.toMatchObject({ status: "manual_action" });

    await expect(leaseCodexWorkspace(realRequest({
      repoUrl: repoWithoutRemote,
      workspaceRoot: root,
      branchName: "agent/no-remote-mission-0001",
    }))).resolves.toMatchObject({
      status: "manual_action",
      reason: expect.stringMatching(/remote/i),
    });
  });

  it.each([0, 1] as const)("runs an explicit mock executable with exit code %i and stores redacted output artifacts", async (exitCode) => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(workspaceRoot);
    const executable = await createFakeCodexExecutable(exitCode);
    const runner = new RealCodexRunner({
      env: {
        ENABLE_REAL_CODEX: "1",
        CODEX_EXECUTABLE: executable,
        PSF_WORKSPACE_ROOT: workspaceRoot,
        PSF_REAL_CODEX_MAX_RUNTIME_MS: "10000",
      },
    });

    await runFromMonorepoRoot(async () => {
      const result = await runner.run(realRequest({
        repoUrl: repo,
        workspaceRoot,
        timeoutMs: 10_000,
        branchName: `agent/ai-novelist-mission-${exitCode}`,
      }));

      expect(result.status).toBe(exitCode === 0 ? "succeeded" : "failed");
      expect(result.executed).toBe(true);
      expect(result.stdout).toContain("[REDACTED]");
      expect(result.stderr).toContain("[REDACTED]");
      expect(result.stdout).not.toContain("stdout_secret");
      expect(result.stderr).not.toContain("stderr_secret");

      const stdoutArtifact = result.artifacts.find((artifact) => artifact.type === "codex_stdout");
      const stderrArtifact = result.artifacts.find((artifact) => artifact.type === "codex_stderr");
      expect(stdoutArtifact?.content).toContain("[REDACTED]");
      expect(stderrArtifact?.content).toContain("[REDACTED]");
      expect(await readFile(stdoutArtifact?.path ?? "", "utf8")).toContain("[REDACTED]");
      expect(await readFile(stderrArtifact?.path ?? "", "utf8")).toContain("[REDACTED]");
    });
  });

  it("redacts raw secret-like environment values from result output and artifact files", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(workspaceRoot);
    const executable = await createShellExecutable([
      "echo \"stdout $PSF_API_TOKEN\"",
      "echo \"stderr $PLANE_API_TOKEN\" >&2",
      "exit 0",
    ]);
    const rawApiSecret = "raw-env-secret-value";
    const rawPlaneSecret = "raw-plane-secret-value";
    const runner = new RealCodexRunner({
      env: {
        ENABLE_REAL_CODEX: "1",
        CODEX_EXECUTABLE: executable,
        PSF_WORKSPACE_ROOT: workspaceRoot,
        PSF_REAL_CODEX_MAX_RUNTIME_MS: "10000",
        PSF_API_TOKEN: rawApiSecret,
        PLANE_API_TOKEN: rawPlaneSecret,
      },
    });

    await runFromMonorepoRoot(async () => {
      const result = await runner.run(realRequest({
        repoUrl: repo,
        workspaceRoot,
        branchName: "agent/ai-novelist-env-redaction",
      }));

      expect(result.status).toBe("succeeded");
      expect(result.stdout).not.toContain(rawApiSecret);
      expect(result.stderr).not.toContain(rawPlaneSecret);
      expect(JSON.stringify(result)).not.toContain(rawApiSecret);
      expect(JSON.stringify(result)).not.toContain(rawPlaneSecret);

      for (const artifact of result.artifacts) {
        expect(artifact.content ?? "").not.toContain(rawApiSecret);
        expect(artifact.content ?? "").not.toContain(rawPlaneSecret);
        const fileContent = await readFile(artifact.path, "utf8");
        expect(fileContent).not.toContain(rawApiSecret);
        expect(fileContent).not.toContain(rawPlaneSecret);
      }
    });
  });


  it("passes only an allowlisted environment to the Codex child process", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(workspaceRoot);
    const executable = await createFakeCodexExecutable(0);
    let childEnv: Record<string, string | undefined> | undefined;
    const runner = new RealCodexRunner({
      env: {
        ENABLE_REAL_CODEX: "1",
        CODEX_EXECUTABLE: executable,
        CODEX_SANDBOX: "workspace-write",
        CODEX_APPROVAL_MODE: "on-request",
        PSF_WORKSPACE_ROOT: workspaceRoot,
        PSF_REAL_CODEX_MAX_RUNTIME_MS: "10000",
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PSF_API_TOKEN: "api-token-must-not-reach-child",
        DATABASE_URL: "postgres://user:db-secret@example.test/db",
        GITHUB_TOKEN: "github-token-must-not-reach-child",
      },
      spawnCodex: async (spawnInput) => {
        childEnv = spawnInput.env;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const result = await runner.run(realRequest({
      repoUrl: repo,
      workspaceRoot,
      branchName: "agent/ai-novelist-env-allowlist",
    }));

    expect(result.status).toBe("succeeded");
    expect(childEnv).toBeDefined();
    expect(childEnv?.CODEX_SANDBOX).toBe("workspace-write");
    expect(childEnv?.CODEX_APPROVAL_MODE).toBe("on-request");
    expect(childEnv?.PSF_API_TOKEN).toBeUndefined();
    expect(childEnv?.DATABASE_URL).toBeUndefined();
    expect(childEnv?.GITHUB_TOKEN).toBeUndefined();
    expect(JSON.stringify(childEnv)).not.toContain("api-token-must-not-reach-child");
    expect(JSON.stringify(childEnv)).not.toContain("db-secret");
    expect(JSON.stringify(childEnv)).not.toContain("github-token-must-not-reach-child");
  });

  it("refuses to create Codex worktrees from local repositories outside the workspace mirror root", async () => {
    const repo = await createTempGitRepo();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));

    const lease = await leaseCodexWorkspace(realRequest({
      repoUrl: repo,
      workspaceRoot,
      branchName: "agent/ai-novelist-outside-mirror",
    }));

    expect(lease.status).toBe("manual_action");
    if (lease.status !== "manual_action") {
      throw new Error("Expected manual action for repository outside workspace mirror root.");
    }
    expect(lease.reason).toMatch(/mirror/i);
    expect(gitBranchExists(repo, "agent/ai-novelist-outside-mirror")).toBe(false);
  });

  it("refuses workspace mirror symlinks that resolve outside the workspace root", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "psf-outside-mirror-"));
    const repo = await createTempGitRepo("repo", outsideRoot);
    await symlink(outsideRoot, path.join(workspaceRoot, "mirrors"));

    const lease = await leaseCodexWorkspace(realRequest({
      repoUrl: repo,
      workspaceRoot,
      branchName: "agent/ai-novelist-symlinked-mirror",
    }));

    expect(lease.status).toBe("manual_action");
    if (lease.status !== "manual_action") {
      throw new Error("Expected manual action for symlinked mirror outside workspace root.");
    }
    expect(lease.reason).toMatch(/mirror/i);
    expect(gitBranchExists(repo, "agent/ai-novelist-symlinked-mirror")).toBe(false);
  });

  it.each([
    { envKey: "CODEX_SANDBOX", envValue: "danger-full-access", reason: /sandbox/i },
    { envKey: "CODEX_APPROVAL_MODE", envValue: "never", reason: /approval/i },
  ] as const)("blocks unsafe $envKey=$envValue before spawning", async ({ envKey, envValue, reason }) => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(workspaceRoot);
    const executable = await createFakeCodexExecutable(0);
    let spawned = false;
    const runner = new RealCodexRunner({
      env: {
        ENABLE_REAL_CODEX: "1",
        CODEX_EXECUTABLE: executable,
        PSF_WORKSPACE_ROOT: workspaceRoot,
        PSF_REAL_CODEX_MAX_RUNTIME_MS: "10000",
        [envKey]: envValue,
      },
      spawnCodex: async () => {
        spawned = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const result = await runner.run(realRequest({
      repoUrl: repo,
      workspaceRoot,
      branchName: `agent/ai-novelist-${envKey.toLowerCase()}`,
    }));

    expect(["blocked", "manual_action"]).toContain(result.status);
    expect(result.reason).toMatch(reason);
    expect(result.executed).toBe(false);
    expect(spawned).toBe(false);
  });

  it("preflights blocked commands before creating a worktree or agent branch", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(workspaceRoot);
    const executable = await createFakeCodexExecutable(0);
    const missionId = "dangerous-command-mission";
    const branchName = "agent/ai-novelist-dangerous-command-mission";
    const expectedWorkspacePath = path.join(workspaceRoot, "ai-novelist", missionId);
    let spawned = false;
    const runner = new RealCodexRunner({
      env: {
        ENABLE_REAL_CODEX: "1",
        CODEX_EXECUTABLE: executable,
        PSF_WORKSPACE_ROOT: workspaceRoot,
        PSF_REAL_CODEX_MAX_RUNTIME_MS: "10000",
      },
      spawnCodex: async () => {
        spawned = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const result = await runner.run(realRequest({
      missionId,
      repoUrl: repo,
      workspaceRoot,
      branchName,
      commands: ["rm -rf /"],
    }));

    expect(["blocked", "manual_action"]).toContain(result.status);
    expect(result.executed).toBe(false);
    expect(spawned).toBe(false);
    expect(existsSync(expectedWorkspacePath)).toBe(false);
    expect(gitBranchExists(repo, branchName)).toBe(false);
  });

  it("escalates timed out Codex processes that ignore SIGTERM", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
    const repo = await createWorkspaceMirrorRepo(workspaceRoot);
    const executable = await createShellExecutable([
      "trap '' TERM",
      "echo started",
      "sleep 2",
      "echo should-not-finish",
    ]);
    const runner = new RealCodexRunner({
      env: {
        ENABLE_REAL_CODEX: "1",
        CODEX_EXECUTABLE: executable,
        PSF_WORKSPACE_ROOT: workspaceRoot,
        PSF_REAL_CODEX_MAX_RUNTIME_MS: "1000",
      },
    });

    const startedAt = Date.now();
    const result = await runFromMonorepoRoot(() => runner.run(realRequest({
      repoUrl: repo,
      workspaceRoot,
      branchName: "agent/ai-novelist-timeout",
      timeoutMs: 100,
    })));
    const elapsedMs = Date.now() - startedAt;

    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(124);
    expect(result.stderr).toMatch(/timed out/i);
    expect(elapsedMs).toBeLessThan(1_000);
  }, 5_000);

});
