import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildA1ManualActionResult,
  deriveA1Readiness,
  runA1AiNovelistProof,
  sanitizeA1Metadata,
  type A1ProofDeps,
  type A1ProofBlocker,
} from "./a1-ai-novelist-proof";

describe("A1 ai-novelist proof contract", () => {
  test("derives canQueue and canExecute from queue and execute blockers", () => {
    const queueBlocker: A1ProofBlocker = {
      category: "mirror",
      key: "mirror.existing_path_unexpected",
      message: "Mirror path exists but is not the expected ai-novelist repo.",
      recommendedNextAction: "Inspect workspaces/mirrors/ai-novelist and either remove it manually or point A1 at a verified mirror.",
      severity: "blocking",
      blocks: ["queue", "execute"],
      source: "a1-proof",
    };
    const executeBlocker: A1ProofBlocker = {
      category: "target",
      key: "target.web_command_unconfirmed",
      message: "The ai-novelist Web start command is not operator-confirmed.",
      recommendedNextAction: "Confirm the exact Web command before starting the target app.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "a1-proof",
    };

    expect(deriveA1Readiness([queueBlocker])).toMatchObject({ canQueue: false, canExecute: false });
    expect(deriveA1Readiness([executeBlocker])).toMatchObject({ canQueue: true, canExecute: false });
    expect(deriveA1Readiness([])).toMatchObject({ canQueue: true, canExecute: true });
  });

  test("keeps PSF safety flags false and records DeepSeek as target-app metadata", () => {
    const result = buildA1ManualActionResult({
      blocker: {
        category: "target",
        key: "target.deepseek_env_missing",
        message: "DeepSeek provider mode was requested, but the target app environment is not configured.",
        recommendedNextAction: "Set DEEPSEEK_API_KEY in the operator environment before retrying A1.",
        severity: "blocking",
        blocks: ["execute"],
        source: "a1-proof",
      },
      evidence: {
        targetProvider: "deepseek",
        targetProviderBoundary: "ai-novelist-web",
        targetAppProviderCall: "not_observed",
      },
    });

    expect(result.status).toBe("manual_action");
    expect(result.realNetworkCall).toBe(false);
    expect(result.realExternalCall).toBe(false);
    expect(result.realPush).toBe(false);
    expect(result.realDeploy).toBe(false);
    expect(result.evidence).toMatchObject({
      targetProvider: "deepseek",
      targetProviderBoundary: "ai-novelist-web",
      targetAppProviderCall: "not_observed",
    });
  });

  test("requires DeepSeek env when provider mode is deepseek", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-missing-deepseek-"));
    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: false }));

    expect(result.status).toBe("manual_action");
    expect(result.blockers[0]?.key).toBe("target.deepseek_env_missing");
    expect(result.realNetworkCall).toBe(false);
    expect(result.evidence.targetAppProviderCall).toBe("not_observed");
  });

  test("records successful page observation with target provider metadata separate from PSF safety flags", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-success-"));
    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true }));

    expect(result.status).toBe("succeeded");
    expect(result.canQueue).toBe(true);
    expect(result.canExecute).toBe(true);
    expect(result.realNetworkCall).toBe(false);
    expect(result.realExternalCall).toBe(false);
    expect(result.evidence).toMatchObject({
      targetProvider: "deepseek",
      targetProviderBoundary: "ai-novelist-web",
      targetAppProviderCall: false,
      targetHttpStatus: 200,
      webProcessStarted: true,
      webProcessStopped: true,
    });
  });

  test("cleanup failure turns the whole proof into manual_action", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-cleanup-fail-"));
    const deps = fakeDeps({ deepseekConfigured: true });
    deps.stopWeb = async () => false;

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, deps);

    expect(result.status).toBe("manual_action");
    expect(result.blockers[0]?.key).toBe("cleanup.web_process_stop_unconfirmed");
    expect(result.evidence.webProcessStopped).toBe(false);
  });

  test("sanitizes secret-like metadata before returning proof output", () => {
    const secret = "sk-deepseek-test-secret";
    const sanitized = sanitizeA1Metadata({
      commandTemplate: ".venv/bin/ai-novelist web --provider deepseek",
      nested: { deepseekApiKey: secret },
      logSummary: `Authorization: Bearer ${secret}`,
    }, [secret]);

    const json = JSON.stringify(sanitized);
    expect(json).not.toContain(secret);
    expect(json).toContain("[REDACTED]");
  });

  test("returns blocked manual output when an existing mirror is unexpected", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-unexpected-mirror-"));
    await mkdir(join(cwd, "workspaces", "mirrors", "ai-novelist"), { recursive: true });
    await writeFile(join(cwd, "workspaces", "mirrors", "ai-novelist", "README.txt"), "not a repo\n", "utf8");
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true, calls }));

    expect(result.status).toBe("blocked");
    expect(result.canQueue).toBe(false);
    expect(result.blockers[0]?.key).toBe("mirror.existing_path_unexpected");
    expect(calls.cloneLocalRepo).toBe(0);
  });

  test("blocks traversal-style mirror paths before source git or clone operations", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-bad-mirror-path-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "../ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true, calls }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.path_unexpected");
    expect(calls.gitSnapshot).toBe(0);
    expect(calls.cloneLocalRepo).toBe(0);
  });

  test("blocks backslash mirror paths before clone or target observation", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-backslash-mirror-path-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces\\mirrors\\ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true, calls }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.path_unexpected");
    expect(calls.cloneLocalRepo).toBe(0);
    expect(calls.startWeb).toBe(0);
    expect(calls.observeTarget).toBe(0);
  });

  test("clones missing mirror into the exact resolved A1 mirror path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-clone-target-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ calls, deepseekConfigured: true, mirrorExists: false }));

    expect(result.status).toBe("succeeded");
    expect(result.blockers).toEqual([]);
    expect(calls.cloneLocalRepo).toBe(1);
    expect(calls.cloneMirrorPaths).toEqual([resolve(cwd, "workspaces", "mirrors", "ai-novelist")]);
    expect(calls.startWeb).toBe(1);
    expect(calls.observeTarget).toBe(1);
  });

  test("blocks when cloned mirror is not the expected ai-novelist repo before mirror snapshot", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-cloned-wrong-mirror-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ calls, deepseekConfigured: true, mirrorExists: false, mirrorExpected: false }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.existing_path_unexpected");
    expect(calls.cloneLocalRepo).toBe(1);
    expect(calls.gitSnapshotPaths.some((snapshotPath) => normalizePath(snapshotPath).includes("/workspaces/mirrors/"))).toBe(false);
    expect(calls.startWeb).toBe(0);
    expect(calls.observeTarget).toBe(0);
  });

  test("blocks unexpected source path before git snapshot or clone", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-bad-source-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/tmp/not-ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true, calls }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.source_path_unexpected");
    expect(calls.gitSnapshot).toBe(0);
    expect(calls.cloneLocalRepo).toBe(0);
  });

  test("blocks missing source repo before git snapshot or clone", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-missing-source-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true, sourceExists: false, calls }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.source_path_unexpected");
    expect(calls.gitSnapshot).toBe(0);
    expect(calls.cloneLocalRepo).toBe(0);
  });

  test("blocks source path that resolves to the mirror path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-source-is-mirror-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: join(cwd, "workspaces", "mirrors", "ai-novelist"),
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true, sourceExists: true, sourceIsGitRepo: true, sourceExpected: true, calls }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.source_path_unexpected");
    expect(calls.gitSnapshot).toBe(0);
    expect(calls.cloneLocalRepo).toBe(0);
  });

  test("blocks an existing git mirror that is not the expected ai-novelist repo", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-wrong-git-mirror-"));
    await mkdir(join(cwd, "workspaces", "mirrors", "ai-novelist"), { recursive: true });
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({
      calls,
      deepseekConfigured: true,
      mirrorIsGitRepo: true,
      mirrorExpected: false,
    }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.existing_path_unexpected");
    expect(calls.cloneLocalRepo).toBe(0);
  });

  test("stops when source main or master is dirty before mirror preparation", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-dirty-source-"));
    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({
      deepseekConfigured: true,
      sourceGit: { branch: "main", head: "abc1234", statusShort: " M src/app.py" },
    }));

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]?.key).toBe("mirror.source_main_polluted");
    expect(JSON.stringify(result)).not.toContain("DEEPSEEK_API_KEY");
  });

  test("redacts secret-like source status from proof output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-redacted-source-status-"));
    const secret = "sk-deepseek-review-secret";

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({
      deepseekConfigured: true,
      sourceGit: { branch: "main", head: "abc1234", statusShort: ` M src/app.py DEEPSEEK_API_KEY=${secret}` },
    }));

    const json = JSON.stringify(result);
    expect(json).not.toContain(secret);
    expect(json).not.toContain(`DEEPSEEK_API_KEY=${secret}`);
    expect(json).toContain("[REDACTED]");
  });

  test("does not start or observe ai-novelist Web when command is unconfirmed", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "psf-a1-no-web-lifecycle-"));
    const calls = proofCalls();

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: false,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ calls, deepseekConfigured: true }));

    expect(result.status).toBe("manual_action");
    expect(result.blockers[0]?.key).toBe("target.web_command_unconfirmed");
    expect(calls.startWeb).toBe(0);
    expect(calls.observeTarget).toBe(0);
  });

});


interface ProofCalls {
  cloneLocalRepo: number;
  cloneSourcePaths: string[];
  cloneMirrorPaths: string[];
  gitSnapshot: number;
  gitSnapshotPaths: string[];
  startWeb: number;
  observeTarget: number;
}

function proofCalls(): ProofCalls {
  return {
    cloneLocalRepo: 0,
    cloneSourcePaths: [],
    cloneMirrorPaths: [],
    gitSnapshot: 0,
    gitSnapshotPaths: [],
    startWeb: 0,
    observeTarget: 0,
  };
}

function fakeDeps(overrides: Partial<{
  calls: ProofCalls;
  deepseekConfigured: boolean;
  sourceExists: boolean;
  sourceIsGitRepo: boolean;
  sourceExpected: boolean;
  mirrorExists: boolean;
  mirrorIsGitRepo: boolean;
  mirrorExpected: boolean;
  sourceGit: { branch: string; head: string; statusShort: string };
  mirrorGit: { branch: string; head: string; statusShort: string };
}> = {}): A1ProofDeps {
  const calls = overrides.calls;
  let clonedMirrorPath: string | undefined;
  return {
    pathExists: async (path) => {
      const normalized = normalizePath(path);
      if (normalized === "/home/ubuntu/1.project/ai-novelist" || normalized.endsWith("/not-ai-novelist")) {
        return overrides.sourceExists ?? true;
      }
      if (normalized.endsWith("/workspaces/mirrors/ai-novelist")) {
        if (overrides.mirrorExists !== undefined || clonedMirrorPath !== undefined) {
          return overrides.mirrorExists ?? true;
        }
      }
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    isGitRepo: async (path) => {
      const normalized = normalizePath(path);
      if (normalized === "/home/ubuntu/1.project/ai-novelist" || normalized.endsWith("/not-ai-novelist")) {
        return overrides.sourceIsGitRepo ?? true;
      }
      if (normalized.endsWith("/workspaces/mirrors/ai-novelist")) {
        return overrides.mirrorIsGitRepo ?? clonedMirrorPath !== undefined;
      }
      return false;
    },
    isExpectedAiNovelistRepo: async (path) => {
      const normalized = normalizePath(path);
      if (normalized === "/home/ubuntu/1.project/ai-novelist") {
        return overrides.sourceExpected ?? true;
      }
      if (normalized.endsWith("/workspaces/mirrors/ai-novelist")) {
        return overrides.mirrorExpected ?? true;
      }
      return false;
    },
    cloneLocalRepo: async (sourcePath, mirrorPath) => {
      clonedMirrorPath = mirrorPath;
      if (calls) {
        calls.cloneLocalRepo += 1;
        calls.cloneSourcePaths.push(sourcePath);
        calls.cloneMirrorPaths.push(mirrorPath);
      }
    },
    gitSnapshot: async (path) => {
      if (calls) {
        calls.gitSnapshot += 1;
        calls.gitSnapshotPaths.push(path);
      }
      return normalizePath(path).includes("/workspaces/mirrors/")
        ? overrides.mirrorGit ?? { branch: "agent/a1-local-mirror-deepseek-proof", head: "def5678", statusShort: "" }
        : overrides.sourceGit ?? { branch: "main", head: "abc1234", statusShort: "" };
    },
    deepseekConfigured: () => overrides.deepseekConfigured ?? false,
    startWeb: async () => {
      if (calls) calls.startWeb += 1;
      return { pid: 4242 };
    },
    observeTarget: async () => {
      if (calls) calls.observeTarget += 1;
      return { httpStatus: 200, responseType: "application/json" };
    },
    stopWeb: async () => true,
    writeArtifact: async () => "artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json",
    now: () => "2026-06-05T00:00:00.000Z",
  };
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}
