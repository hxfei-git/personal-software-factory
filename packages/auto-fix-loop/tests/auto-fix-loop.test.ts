import { describe, expect, it } from "vitest";
import { MissionStatus, type BugReport, type ProjectPassport, type WorkerRun } from "@psf/mission-schema";
import { createAutoFixDryRun, runGatedRealAutoFixLoop } from "../src/index.js";

const passport: ProjectPassport = {
  id: "ai-novelist",
  name: "AI 小说助手",
  repo: { url: "https://github.com/hxfei-git/ai-novelist.git", default_branch: "main" },
  runtime: { kind: "web" },
  commands: { install: ["pnpm install"], test: ["pytest -q"], build: ["pnpm build"], run_staging: ["ai-novelist web"] },
  urls: { production: "", staging: "" },
  quality_gates: { require_ai_qa: true },
  core_flows: [{ id: "review_chapter", name: "自动审稿", priority: "P0" }],
};

const baseInput = {
  missionId: "mission-0001-ai-novelist-chapter-review",
  projectId: "ai-novelist",
  missionStatus: MissionStatus.qa_running,
  branchName: "psf/mission-0001-ai-novelist-chapter-review",
  currentBranch: "dry-run/no-worktree",
  passport,
  projectAgents: "# AGENTS\nDo not push remote branches.\n",
  missionFiles: {
    "mission.md": "# Mission\n",
    "acceptance.md": "# Acceptance\n",
    "technical-notes.md": "# Technical Notes\n",
    "risk-notes.md": "# Risk Notes\n",
  },
  bugs: [],
  now: "2026-05-31T10:00:00.000Z",
};

function makeBug(overrides: Partial<BugReport> = {}): BugReport {
  return {
    id: "bug-sample",
    mission_id: baseInput.missionId,
    title: "连续点击生成按钮会重复提交",
    severity: "P1",
    status: "open",
    reproduction_steps: ["打开首页", "连续点击生成按钮"],
    expected_result: "只提交一次。",
    actual_result: "提交多次。",
    evidence: { source: "qa-worker" },
    suggested_fix_direction: "加入 pending 状态锁。",
    source: "qa-worker",
    created_at: baseInput.now,
    updated_at: baseInput.now,
    ...overrides,
  };
}

describe("auto-fix loop dry-run", () => {
  it("moves passing QA toward ready_for_review", () => {
    const result = createAutoFixDryRun(baseInput);

    expect(result.decision).toBe("qa_passed");
    expect(result.nextStatus).toBe(MissionStatus.ready_for_review);
    expect(result.files).toEqual({});
    expect(result.events.map((event) => event.type)).toContain("auto_fix.qa_passed");
  });

  it("generates fix mission and Codex dry-run artifacts for bugs", () => {
    const result = createAutoFixDryRun({
      ...baseInput,
      bugs: [{
        id: "bug-sample",
        mission_id: baseInput.missionId,
        title: "连续点击生成按钮会重复提交",
        severity: "P1",
        status: "open",
        reproduction_steps: ["打开首页", "连续点击生成按钮"],
        expected_result: "只提交一次。",
        actual_result: "提交多次。",
        evidence: { source: "qa-worker" },
        suggested_fix_direction: "加入 pending 状态锁。",
        source: "qa-worker",
        created_at: baseInput.now,
        updated_at: baseInput.now,
      }],
    });

    expect(result.decision).toBe("bugs_found");
    expect(result.files["fix-mission.md"]).toContain("连续点击生成按钮会重复提交");
    expect(result.files["fix-acceptance.md"]).toContain("Regression Acceptance");
    expect(result.files["fix-codex-prompt.md"]).toContain("Codex Mission Prompt");
    expect(result.files["fix-codex-command.sh"]).toContain("DRY-RUN REVIEW ARTIFACT");
    expect(result.codexDryRun?.executed).toBe(false);
  });

  it("pauses when max attempts are exhausted", () => {
    const result = createAutoFixDryRun({
      ...baseInput,
      currentAttempt: 3,
      maxAttempts: 3,
      bugs: [{
        id: "bug-sample",
        mission_id: baseInput.missionId,
        title: "仍然失败",
        severity: "P1",
        status: "open",
        reproduction_steps: ["重复执行失败路径"],
        expected_result: "通过。",
        actual_result: "失败。",
        evidence: {},
        created_at: baseInput.now,
        updated_at: baseInput.now,
      }],
    });

    expect(result.decision).toBe("max_attempts_exceeded");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(result.codexDryRun).toBeUndefined();
  });


  it("redacts user-supplied secret text from dry-run artifacts", () => {
    const result = createAutoFixDryRun({
      ...baseInput,
      bugs: [makeBug({
        title: "password=super-secret duplicate submit",
        expected_result: "Do not expose token=expected-secret.",
        actual_result: "Rendered --token actual-secret in UI.",
        reproduction_steps: ["Open /settings?api_key=step-secret", "Run command with --password step-password"],
        suggested_fix_direction: "Remove --api-key suggested-secret from output.",
      })],
    });

    const rendered = JSON.stringify({ files: result.files, artifacts: result.artifacts, codexDryRun: result.codexDryRun });

    for (const secret of ["super-secret", "expected-secret", "actual-secret", "step-secret", "step-password", "suggested-secret"]) {
      expect(rendered).not.toContain(secret);
    }
    expect(rendered).toContain("[REDACTED]");
  });
});


describe("gated real auto-fix loop", () => {
  it("pauses without invoking runners when Mission attempts exceed the default max", async () => {
    let codexCalls = 0;
    let testCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      currentAttempt: 4,
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
      testRunner: {
        async run() {
          testCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("paused");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(result.recommendedNextAction).toMatch(/human/i);
    expect(codexCalls).toBe(0);
    expect(testCalls).toBe(0);
  });

  it("pauses without invoking runners when any bug exceeds the default max attempts", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      perBugAttempts: { "bug-sample": 3 },
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("paused");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(codexCalls).toBe(0);
  });

  it("blocks real mode by default and leaves Codex uncalled", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      approvalIds: ["real_codex_execution"],
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("blocked");
    expect(result.workerRun.status).toBe("skipped");
    expect(result.workerRun.metadata.realNetworkCall).toBe(false);
    expect(result.recommendedNextAction).toMatch(/disabled/i);
    expect(codexCalls).toBe(0);
  });

  it("requires approval before invoking a fix-mode Codex runner", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      enableRealMode: true,
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("blocked");
    expect(result.recommendedNextAction).toContain("real_codex_execution");
    expect(result.gates.approval.allowed).toBe(false);
    expect(codexCalls).toBe(0);
  });

  it("requires regression coverage before claiming a reproducible bug is fixed", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("needs_human");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(result.recommendedNextAction).toMatch(/regression/i);
    expect(codexCalls).toBe(0);
  });

  it("blocks unsafe verification commands before invoking Codex", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      regressionEvidence: { existingSpecPath: "tests/e2e/bug-sample.spec.ts", existingSpecContent: "test('bug-sample', async () => {})" },
      verificationCommands: { regression: ["curl https://example.test"] },
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("manual_action");
    expect(result.recommendedNextAction).toMatch(/Command blocked/i);
    expect(result.gates.commands[0]?.allowed).toBe(false);
    expect(codexCalls).toBe(0);
  });

  it("pauses without invoking runners when Mission attempts equal the configured max", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      currentAttempt: 3,
      maxAttempts: 3,
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      regressionEvidence: { existingSpecPath: "tests/e2e/bug-sample.spec.ts", existingSpecContent: "test('bug-sample', async () => {})" },
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("paused");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(codexCalls).toBe(0);
  });

  it("pauses without invoking runners when bug attempts equal the configured max", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      perBugAttempts: { "bug-sample": 2 },
      maxBugAttempts: 2,
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      regressionEvidence: { existingSpecPath: "tests/e2e/bug-sample.spec.ts", existingSpecContent: "test('bug-sample', async () => {})" },
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("paused");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(codexCalls).toBe(0);
  });

  it("returns a redacted failure result when the Codex runner throws", async () => {
    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      extraSecrets: ["super-secret"],
      regressionEvidence: { existingSpecPath: "tests/e2e/bug-sample.spec.ts", existingSpecContent: "test('bug-sample', async () => {})" },
      codexRunner: {
        async run() {
          throw new Error("password=super-secret");
        },
      },
      testRunner: {
        async run() {
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("fix_failed");
    expect(result.workerRun.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(JSON.stringify(result)).toContain("[REDACTED]");
  });

  it("returns a redacted failure result when the test runner throws", async () => {
    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      extraSecrets: ["super-secret"],
      regressionEvidence: { existingSpecPath: "tests/e2e/bug-sample.spec.ts", existingSpecContent: "test('bug-sample', async () => {})" },
      verificationCommands: { regression: ["pytest -q"] },
      codexRunner: {
        async run() {
          return {
            status: "succeeded",
            executed: false,
            reason: "mock fix applied",
            workerRun: {
              id: "worker-run-codex-real-fix",
              mission_id: baseInput.missionId,
              worker_type: "codex",
              status: "succeeded",
              mode: "mock",
              input: {},
              output: {},
              logs: [],
              metadata: { realNetworkCall: false },
              created_at: baseInput.now,
              updated_at: baseInput.now,
            },
            artifacts: [],
            events: [],
            stdout: "fixed",
            stderr: "",
            exitCode: 0,
          };
        },
      },
      testRunner: {
        async run() {
          throw new Error("password=super-secret");
        },
      },
    });

    expect(result.decision).toBe("test_failed");
    expect(result.workerRun.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(JSON.stringify(result)).toContain("[REDACTED]");
  });

  it("rejects generated regression content without meaningful test structure", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      regressionEvidence: {
        generatedSpec: {
          path: "tests/e2e/generated/bug-sample.spec.ts",
          content: "# bug-sample notes only",
          valid: true,
        },
      },
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("needs_human");
    expect(result.regressionCoverage.present).toBe(false);
    expect(result.errors.join("\n")).toMatch(/regression/i);
    expect(codexCalls).toBe(0);
  });

  it("rejects generated regression content that does not reference the bug or reproduction", async () => {
    let codexCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      regressionEvidence: {
        generatedSpec: {
          path: "tests/e2e/generated/other.spec.ts",
          content: "import { test } from '@playwright/test';\ntest('unrelated happy path', async () => {});",
          valid: true,
        },
      },
      codexRunner: {
        async run() {
          codexCalls += 1;
          throw new Error("must not run");
        },
      },
    });

    expect(result.decision).toBe("needs_human");
    expect(result.regressionCoverage.present).toBe(false);
    expect(codexCalls).toBe(0);
  });

  it("does not return fixed when no verification commands are configured", async () => {
    let testCalls = 0;

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      passport: { ...passport, commands: { ...passport.commands, test: [] } },
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      regressionEvidence: { existingSpecPath: "tests/e2e/bug-sample.spec.ts", existingSpecContent: "test('bug-sample', async () => {})" },
      verificationCommands: { regression: [] },
      codexRunner: {
        async run() {
          return {
            status: "succeeded",
            executed: false,
            reason: "mock fix applied",
            workerRun: {
              id: "worker-run-codex-real-fix",
              mission_id: baseInput.missionId,
              worker_type: "codex",
              status: "succeeded",
              mode: "mock",
              input: {},
              output: {},
              logs: [],
              metadata: { realNetworkCall: false },
              created_at: baseInput.now,
              updated_at: baseInput.now,
            },
            artifacts: [],
            events: [],
            stdout: "fixed",
            stderr: "",
            exitCode: 0,
          };
        },
      },
      testRunner: {
        async run() {
          testCalls += 1;
          return { status: "passed", output: "should not run" };
        },
      },
    });

    expect(result.decision).toBe("manual_action");
    expect(result.recommendedNextAction).toMatch(/verification command/i);
    expect(testCalls).toBe(0);
  });

  it("claims fixed only after gated Codex and injected tests pass with regression coverage", async () => {
    const codexInputs: unknown[] = [];
    const testCommands: string[] = [];
    const codexWorkerRun: WorkerRun = {
      id: "worker-run-codex-real-fix",
      mission_id: baseInput.missionId,
      worker_type: "codex",
      status: "succeeded",
      mode: "mock",
      input: {},
      output: { token: "secret-value-123", executed: false },
      logs: ["mock codex completed with password=secret-value-123"],
      metadata: { realNetworkCall: false },
      created_at: baseInput.now,
      updated_at: baseInput.now,
    };

    const result = await runGatedRealAutoFixLoop({
      ...baseInput,
      missionStatus: MissionStatus.regression_running,
      bugs: [makeBug()],
      enableRealMode: true,
      approvalIds: ["real_codex_execution"],
      extraSecrets: ["secret-value-123"],
      regressionEvidence: {
        generatedSpec: {
          path: "tests/e2e/generated/bug-sample.spec.ts",
          content: "import { test } from '@playwright/test';\ntest('bug-sample regression', async () => {});",
          valid: true,
        },
      },
      verificationCommands: {
        regression: ["pytest -q"],
        unit: ["pnpm typecheck"],
        e2e: ["pnpm test"],
      },
      codexRunner: {
        async run(input) {
          codexInputs.push(input);
          return {
            status: "succeeded",
            executed: false,
            reason: "mock fix applied",
            workerRun: codexWorkerRun,
            artifacts: [],
            events: [],
            stdout: "fixed",
            stderr: "",
            exitCode: 0,
          };
        },
      },
      testRunner: {
        async run(input) {
          testCommands.push(input.command);
          return { status: "passed", exitCode: 0, output: input.command + " passed" };
        },
      },
    });

    expect(result.decision).toBe("fixed");
    expect(result.nextStatus).toBe(MissionStatus.qa_running);
    expect(codexInputs).toHaveLength(1);
    expect(codexInputs[0]).toMatchObject({ mode: "real", fixMode: true, approvalIds: ["real_codex_execution"] });
    expect(testCommands).toEqual(["pytest -q", "pnpm typecheck", "pnpm test"]);
    expect(JSON.stringify(result)).not.toContain("secret-value-123");
    expect(result.workerRun.metadata.realNetworkCall).toBe(false);
  });
});
