import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

    const result = await runA1AiNovelistProof({
      cwd,
      sourcePath: "/home/ubuntu/1.project/ai-novelist",
      mirrorPath: "workspaces/mirrors/ai-novelist",
      provider: "deepseek",
      webCommandConfirmed: true,
      targetUrl: "http://127.0.0.1:8000/api/projects",
    }, fakeDeps({ deepseekConfigured: true }));

    expect(result.status).toBe("blocked");
    expect(result.canQueue).toBe(false);
    expect(result.blockers[0]?.key).toBe("mirror.existing_path_unexpected");
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

});


function fakeDeps(overrides: Partial<{
  deepseekConfigured: boolean;
  sourceGit: { branch: string; head: string; statusShort: string };
  mirrorGit: { branch: string; head: string; statusShort: string };
}> = {}): A1ProofDeps {
  return {
    pathExists: async (path) => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    isGitRepo: async (path) => !path.includes("workspaces/mirrors/ai-novelist"),
    cloneLocalRepo: async () => undefined,
    gitSnapshot: async (path) => path.includes("workspaces/mirrors")
      ? overrides.mirrorGit ?? { branch: "agent/a1-local-mirror-deepseek-proof", head: "def5678", statusShort: "" }
      : overrides.sourceGit ?? { branch: "main", head: "abc1234", statusShort: "" },
    deepseekConfigured: () => overrides.deepseekConfigured ?? false,
    startWeb: async () => ({ pid: 1234 }),
    observeTarget: async () => ({ httpStatus: 200, responseType: "application/json" }),
    stopWeb: async () => true,
    writeArtifact: async () => "artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json",
    now: () => "2026-06-05T00:00:00.000Z",
  };
}
