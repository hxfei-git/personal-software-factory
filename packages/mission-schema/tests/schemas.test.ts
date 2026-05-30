import { describe, expect, it } from "vitest";
import {
  artifactExample,
  approvalExample,
  bugReportExample,
  integrationStatusExample,
  missionEventExample,
  missionExample,
  projectExample,
  projectPassportExample,
  qaReportExample,
  workerRunExample,
} from "../src/examples.js";
import {
  ArtifactSchema,
  ApprovalSchema,
  BugReportSchema,
  IntegrationStatusSchema,
  MissionEventSchema,
  MissionSchema,
  ProjectPassportSchema,
  ProjectSchema,
  QAReportSchema,
  WorkerRunSchema,
} from "../src/schemas.js";
import { MissionStatus } from "../src/status.js";

describe("mission schemas", () => {
  it("validates the MissionStatus list", () => {
    expect(MissionStatus.received).toBe("received");
    expect(Object.values(MissionStatus)).toContain("production_deploying");
  });

  it("accepts valid examples", () => {
    expect(ProjectSchema.parse(projectExample).id).toBe("ai-novelist");
    expect(MissionSchema.parse(missionExample).status).toBe("received");
    expect(ProjectPassportSchema.parse(projectPassportExample).id).toBe("ai-novelist");
    expect(MissionEventSchema.parse(missionEventExample).type).toBe("mission.created");
    expect(BugReportSchema.parse(bugReportExample).severity).toBe("P1");
    expect(QAReportSchema.parse(qaReportExample).status).toBe("passed");
    expect(ArtifactSchema.parse(artifactExample).type).toBe("qa_report");
    expect(ApprovalSchema.parse(approvalExample).status).toBe("pending");
    expect(WorkerRunSchema.parse(workerRunExample).status).toBe("succeeded");
    expect(IntegrationStatusSchema.parse(integrationStatusExample).provider).toBe("github");
  });

  it("rejects a Mission without a project id", () => {
    const result = MissionSchema.safeParse({ ...missionExample, project_id: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["project_id"]);
    }
  });

  it("rejects an invalid Project Passport missing commands", () => {
    const result = ProjectPassportSchema.safeParse({
      ...projectPassportExample,
      commands: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects uppercase MissionEvent types", () => {
    const result = MissionEventSchema.safeParse({
      ...missionEventExample,
      type: "MISSION_CREATED",
    });
    expect(result.success).toBe(false);
  });

  it("accepts expanded Approval fields", () => {
    const approval = ApprovalSchema.parse({
      ...approvalExample,
      requested_by: "planner",
      decided_by: "local-user",
      decision: "approved for dry-run",
      decided_at: "2026-05-30T10:05:00.000Z",
    });
    expect(approval.status).toBe("pending");
    expect(approval.requested_by).toBe("planner");
  });

  it("accepts expanded WorkerRun dry-run fields", () => {
    const workerRun = WorkerRunSchema.parse({
      ...workerRunExample,
      worker_type: "planner",
      mode: "dry-run",
      input: { missionId: "mission-sample-001" },
      output: { files: ["mission.md"] },
      error: "",
      logs: ["planner started"],
      created_at: "2026-05-30T10:00:00.000Z",
      updated_at: "2026-05-30T10:00:00.000Z",
    });
    expect(workerRun.mode).toBe("dry-run");
  });

  it("accepts legacy Artifact type strings", () => {
    expect(ArtifactSchema.parse({
      ...artifactExample,
      type: "qa-report",
    }).type).toBe("qa-report");
  });

  it("accepts expanded Artifact, BugReport, and QAReport values", () => {
    expect(ArtifactSchema.parse({
      ...artifactExample,
      type: "codex_prompt",
      worker_run_id: "worker-run-sample-001",
      content: "# Prompt",
      metadata: { storage: "inline-small-text" },
    }).type).toBe("codex_prompt");

    expect(BugReportSchema.parse({
      ...bugReportExample,
      status: "in_progress",
      suggested_fix_direction: "Disable repeated submit while generation is running.",
      source: "qa-worker",
    }).status).toBe("in_progress");

    expect(QAReportSchema.parse({
      ...qaReportExample,
      mode: "playwright-mcp",
      status: "queued",
      staging_url: "http://127.0.0.1:8000",
      passed: 0,
      failed: 0,
      started_at: "2026-05-30T10:00:00.000Z",
      finished_at: "2026-05-30T10:10:00.000Z",
    }).mode).toBe("playwright-mcp");

    expect(QAReportSchema.parse({
      ...qaReportExample,
      mode: "mock",
    }).mode).toBe("mock");
  });
});
