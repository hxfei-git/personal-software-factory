import { describe, expect, it } from "vitest";
import { InProcessWorkerRuntime, type WorkerJob } from "../src/index.js";

const job: WorkerJob = {
  id: "job-qa-001",
  missionId: "mission-001",
  projectId: "ai-novelist",
  workerType: "qa",
  mode: "dry-run",
  input: { dryRun: true },
  createdAt: "2026-05-31T10:00:00.000Z",
};

describe("InProcessWorkerRuntime", () => {
  it("wraps successful handlers with WorkerRun and MissionEvent records", async () => {
    const runtime = new InProcessWorkerRuntime({ now: () => "2026-05-31T10:01:00.000Z" });

    const result = await runtime.run(job, async () => ({
      output: { generatedFiles: ["qa-report.md"] },
      logs: ["qa dry-run completed"],
    }));

    expect(result.workerRun).toMatchObject({
      id: "worker-run-job-qa-001",
      mission_id: "mission-001",
      worker_type: "qa",
      mode: "dry-run",
      status: "succeeded",
      output: { generatedFiles: ["qa-report.md"] },
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "worker_runtime.started",
      "worker_runtime.succeeded",
    ]);
  });

  it("records failure metadata and rethrows handler errors", async () => {
    const runtime = new InProcessWorkerRuntime({ now: () => "2026-05-31T10:02:00.000Z" });

    await expect(runtime.run(job, async () => {
      throw new Error("qa exploded");
    })).rejects.toThrow("qa exploded");

    expect(runtime.lastFailure?.workerRun).toMatchObject({
      id: "worker-run-job-qa-001",
      status: "failed",
      error: "qa exploded",
    });
    expect(runtime.lastFailure?.events.at(-1)?.type).toBe("worker_runtime.failed");
  });
});
