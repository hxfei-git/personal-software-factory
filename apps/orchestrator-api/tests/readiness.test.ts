import { describe, expect, it } from "vitest";
import {
  buildReadinessBlocker,
  deriveReadinessState,
  sortReadinessBlockers,
  type ReadinessBlockerCategory,
  type ReadinessBlockerInput,
  type ReadinessBlockerSeverity,
  type ReadinessBlockTarget,
} from "../src/readiness.js";

function blocker(input: {
  key: string;
  category?: ReadinessBlockerCategory;
  severity?: ReadinessBlockerSeverity;
  blocks?: ReadinessBlockTarget[];
}): ReadinessBlockerInput {
  return {
    category: input.category ?? "execution",
    key: input.key,
    message: input.key + " message",
    recommendedNextAction: input.key + " next action",
    severity: input.severity ?? "blocking",
    blocks: input.blocks ?? ["execute"],
    source: "orchestrator",
    details: { key: input.key },
  };
}

describe("readiness helper", () => {
  it("allows queueing but blocks execution for execute-only blockers", () => {
    const state = deriveReadinessState([
      blocker({
        key: "execution.codex.injected_runner_missing",
        severity: "manual_action",
        blocks: ["execute"],
      }),
    ], "fallback next action");

    expect(state.canQueue).toBe(true);
    expect(state.canExecute).toBe(false);
    expect(state.recommendedNextAction).toBe("execution.codex.injected_runner_missing next action");
    expect(state.blockers).toHaveLength(1);
    expect(state.blockers[0]).toMatchObject({
      key: "execution.codex.injected_runner_missing",
      blocks: ["execute"],
    });
  });

  it("sorts blockers by severity, queue impact, category, and key", () => {
    const sorted = sortReadinessBlockers([
      buildReadinessBlocker(blocker({
        key: "00.manual_queue",
        category: "queue_acceptance",
        severity: "manual_action",
        blocks: ["queue", "execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "safety.zulu",
        category: "safety",
        severity: "blocking",
        blocks: ["queue", "execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "aa.execute_only",
        category: "queue_acceptance",
        severity: "blocking",
        blocks: ["execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "d.execution",
        category: "execution",
        severity: "blocking",
        blocks: ["queue", "execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "c.policy",
        category: "policy",
        severity: "blocking",
        blocks: ["queue", "execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "b.configuration",
        category: "configuration",
        severity: "blocking",
        blocks: ["queue", "execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "a.approval",
        category: "approval",
        severity: "blocking",
        blocks: ["queue", "execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "safety.alpha",
        category: "safety",
        severity: "blocking",
        blocks: ["queue", "execute"],
      })),
      buildReadinessBlocker(blocker({
        key: "z.queue_acceptance",
        category: "queue_acceptance",
        severity: "blocking",
        blocks: ["queue", "execute"],
      })),
    ]);

    expect(sorted.map((entry) => entry.key)).toEqual([
      "z.queue_acceptance",
      "a.approval",
      "b.configuration",
      "c.policy",
      "d.execution",
      "safety.alpha",
      "safety.zulu",
      "aa.execute_only",
      "00.manual_queue",
    ]);
  });

  it("redacts nested secret-like details and env secret values while preserving safe metadata", () => {
    const previousSecret = process.env.PSF_READINESS_TEST_SECRET;
    process.env.PSF_READINESS_TEST_SECRET = "review-secret-value";

    try {
      const built = buildReadinessBlocker({
        category: "execution",
        key: "execution.codex.injected_runner_missing",
        message: "Codex runner missing.",
        recommendedNextAction: "Inject approved runner.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: {
          action: "codex-real",
          envEcho: "review-secret-value",
          nested: {
            token: "raw-token-value",
            safeFlag: true,
            deeper: {
              api_key: "nested-api-key",
              note: "safe metadata",
            },
          },
          list: ["review-secret-value", { password: "nested-password", label: "safe label" }],
          safeMetadata: { readinessKey: "codex", evidence: "known_static" },
        },
      });

      expect(built.details).toEqual({
        action: "codex-real",
        envEcho: "[REDACTED]",
        nested: {
          token: "[REDACTED]",
          safeFlag: true,
          deeper: {
            api_key: "[REDACTED]",
            note: "safe metadata",
          },
        },
        list: ["[REDACTED]", { password: "[REDACTED]", label: "safe label" }],
        safeMetadata: { readinessKey: "codex", evidence: "known_static" },
      });
      const serializedDetails = JSON.stringify(built.details);
      expect(serializedDetails).not.toContain("review-secret-value");
      expect(serializedDetails).not.toContain("raw-token-value");
      expect(serializedDetails).not.toContain("nested-api-key");
      expect(serializedDetails).not.toContain("nested-password");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PSF_READINESS_TEST_SECRET;
      } else {
        process.env.PSF_READINESS_TEST_SECRET = previousSecret;
      }
    }
  });
});
