import { describe, expect, it } from "vitest";
import { buildWorkerJob } from "@psf/worker-runtime";
import { createInMemoryMissionStorage } from "@psf/orchestrator-api/storage";
import { createDefaultJobHandler } from "../src/handlers.js";
import { processWorkerJob } from "../src/runner.js";

describe("worker runner", () => {
  it("updates wrapper WorkerRun to succeeded and records child ids", async () => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [{
        id: "worker-run-wrapper",
        mission_id: "mission-0001-ai-novelist-chapter-review",
        worker_type: "orchestrator",
        status: "queued",
        mode: "dry-run",
        input: {},
        output: {},
        logs: [],
        metadata: { queueWrapper: true, jobId: "job-qa", jobType: "qa.dry_run" },
        created_at: "2026-05-31T00:00:00.000Z",
        updated_at: "2026-05-31T00:00:00.000Z",
      }],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run",
      payload: { withSampleBug: false },
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: async () => ({
        childWorkerRunIds: ["worker-run-child-qa"],
        childQARunIds: ["qa-run-child"],
        childArtifactIds: ["artifact-qa-report"],
        childBugReportIds: [],
        summary: "QA dry-run completed.",
        recommendedNextAction: "Refresh Mission Summary.",
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    const wrapper = await storage.getWorkerRun("worker-run-wrapper");
    expect(wrapper?.status).toBe("succeeded");
    expect(wrapper?.started_at).toBe("2026-05-31T00:01:00.000Z");
    expect(wrapper?.finished_at).toBe("2026-05-31T00:02:00.000Z");
    expect(wrapper?.output).toMatchObject({
      jobId: "job-qa",
      jobType: "qa.dry_run",
      childWorkerRunIds: ["worker-run-child-qa"],
      childQARunIds: ["qa-run-child"],
      childArtifactIds: ["artifact-qa-report"],
      childBugReportIds: [],
      summary: "QA dry-run completed.",
      recommendedNextAction: "Refresh Mission Summary.",
    });
    expect(await storage.listMissionEvents("mission-0001-ai-novelist-chapter-review")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "worker_run.running" }),
        expect.objectContaining({ type: "worker_run.succeeded" }),
      ]),
    );
  });

  it("records failed wrapper WorkerRun errors without leaking secrets", async () => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [{
        id: "worker-run-wrapper",
        mission_id: "mission-0001-ai-novelist-chapter-review",
        worker_type: "orchestrator",
        status: "queued",
        mode: "dry-run",
        input: {},
        output: {},
        logs: [],
        metadata: { queueWrapper: true, jobId: "job-loop", jobType: "loop.dry_run" },
        created_at: "2026-05-31T00:00:00.000Z",
        updated_at: "2026-05-31T00:00:00.000Z",
      }],
    });
    const job = buildWorkerJob({
      id: "job-loop",
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "loop.dry_run",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await expect(processWorkerJob({
      job,
      storage,
      handler: async () => {
        throw new Error("failed with token secret-value and password hunter2");
      },
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    })).rejects.toThrow("failed");

    const wrapper = await storage.getWorkerRun("worker-run-wrapper");
    expect(wrapper?.status).toBe("failed");
    expect(wrapper?.error).toContain("[REDACTED]");
    expect(wrapper?.error).not.toContain("secret-value");
    expect(wrapper?.error).not.toContain("hunter2");
    expect(await storage.listMissionEvents("mission-0001-ai-novelist-chapter-review")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "worker_run.running" }),
        expect.objectContaining({ type: "worker_run.failed" }),
      ]),
    );
  });

  it("runs integration dry-run handler without real network calls", async () => {
    const handler = createDefaultJobHandler(process.cwd());
    const job = buildWorkerJob({
      id: "job-integration",
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "integration.dry_run",
      payload: { name: "github" },
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const result = await handler(job);

    expect(result.summary).toContain("dry-run");
    expect(result.recommendedNextAction).toContain("Review");
    expect(result.childWorkerRunIds).toEqual([]);
  });
});

function sequenceNow(values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? new Date().toISOString();
}
