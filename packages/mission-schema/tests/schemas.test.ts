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
    expect(ArtifactSchema.parse(artifactExample).type).toBe("qa-report");
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
});
