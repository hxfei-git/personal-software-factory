import { describe, expect, test } from "vitest";
import {
  buildA1ManualActionResult,
  deriveA1Readiness,
  sanitizeA1Metadata,
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
});
