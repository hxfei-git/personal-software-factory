import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

async function createTempGitRepo(name = "repo"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "psf-codex-worker-"));
  const repo = path.join(root, name);

  git(root, ["init", repo]);
  git(repo, ["config", "user.email", "codex-worker-test@example.com"]);
  git(repo, ["config", "user.name", "Codex Worker Test"]);
  await writeFile(path.join(repo, "README.md"), "# Fixture\n", "utf8");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "initial"]);
  git(repo, ["branch", "-M", "main"]);
  git(repo, ["remote", "add", "origin", repo]);

  return repo;
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
    const repo = await createTempGitRepo();
    const root = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));

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

  it("refuses protected execution branches and repositories without git remotes", async () => {
    const repoWithoutRemote = await mkdtemp(path.join(os.tmpdir(), "psf-codex-no-remote-"));
    git(repoWithoutRemote, ["init"]);
    const root = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));

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
    const repo = await createTempGitRepo();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
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
});
