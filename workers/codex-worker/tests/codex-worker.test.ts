import { describe, expect, it } from "vitest";
import {
  ArtifactSchema,
  MissionEventSchema,
  WorkerRunSchema,
  projectPassportExample,
} from "@psf/mission-schema";
import { assertSafeCodexExecution, createCodexDryRun } from "../src/index.js";

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
