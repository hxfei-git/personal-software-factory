import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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


  it("preserves wrapper output changes written while handler is running", async () => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [{
        id: "worker-run-wrapper",
        mission_id: "mission-0001-ai-novelist-chapter-review",
        worker_type: "orchestrator",
        status: "queued",
        mode: "dry-run",
        input: {},
        output: { queueWrapper: true, jobId: "job-qa", jobType: "qa.dry_run" },
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
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: async () => {
        const current = await storage.getWorkerRun("worker-run-wrapper");
        if (!current) throw new Error("missing wrapper");
        await storage.updateWorkerRun({
          resource: {
            ...current,
            output: { ...current.output, cancellationRequested: true },
            metadata: { ...current.metadata, cancellationRequested: true },
            updated_at: "2026-05-31T00:01:30.000Z",
          },
          event: {
            id: "event-cancellation-requested",
            mission_id: current.mission_id,
            type: "worker_run.cancellation_requested",
            message: "Cancellation requested while job was running.",
            payload: { worker_run_id: current.id, cancellationRequested: true },
            created_at: "2026-05-31T00:01:30.000Z",
          },
        });
        return {
          childWorkerRunIds: ["worker-run-child-qa"],
          childQARunIds: [],
          childArtifactIds: [],
          childBugReportIds: [],
          summary: "QA dry-run completed.",
          recommendedNextAction: "Refresh Mission Summary.",
        };
      },
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    const wrapper = await storage.getWorkerRun("worker-run-wrapper");
    expect(wrapper?.status).toBe("succeeded");
    expect(wrapper?.output).toMatchObject({ cancellationRequested: true, childWorkerRunIds: ["worker-run-child-qa"] });
    expect(wrapper?.metadata).toMatchObject({ cancellationRequested: true });
  });

  it("persists child resources returned by the default QA handler", async () => {
    const tempCwd = await createDemoCwd();
    const storage = createInMemoryMissionStorage({
      workerRuns: [{
        id: "worker-run-wrapper",
        mission_id: "mission-0001-ai-novelist-chapter-review",
        worker_type: "orchestrator",
        status: "queued",
        mode: "dry-run",
        input: {},
        output: { queueWrapper: true, jobId: "job-qa", jobType: "qa.dry_run_with_sample_bug" },
        logs: [],
        metadata: { queueWrapper: true, jobId: "job-qa", jobType: "qa.dry_run_with_sample_bug" },
        created_at: "2026-05-31T00:00:00.000Z",
        updated_at: "2026-05-31T00:00:00.000Z",
      }],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-0001-ai-novelist-chapter-review",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run_with_sample_bug",
      payload: { withSampleBug: true },
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(tempCwd),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    const childWorkerRunIds = wrapper.output.childWorkerRunIds as string[];
    const childQARunId = (wrapper.output.childQARunIds as string[])[0];
    const childBugReportId = (wrapper.output.childBugReportIds as string[])[0];
    expect(childWorkerRunIds.length).toBeGreaterThan(0);
    expect(childQARunId).toBeTruthy();
    expect(childBugReportId).toBeTruthy();
    if (!childQARunId || !childBugReportId) throw new Error("missing child resource ids");
    const childWorkerRuns = await Promise.all(childWorkerRunIds.map((id) => storage.getWorkerRun(id)));
    expect(childWorkerRuns).toEqual(expect.arrayContaining([expect.objectContaining({ worker_type: "qa" })]));
    await expect(storage.getQARun(childQARunId)).resolves.toMatchObject({ id: childQARunId });
    await expect(storage.getBug(childBugReportId)).resolves.toMatchObject({ id: childBugReportId });
    expect((await storage.listMissionArtifacts(job.missionId)).length).toBeGreaterThan(0);
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
        throw new Error('failed TOKEN=abc password=hunter2 {"token":"jsonsecret"} postgresql://user:pass@db.local/app?apikey=qwerty token secret-value');
      },
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    })).rejects.toThrow("failed");

    const wrapper = await storage.getWorkerRun("worker-run-wrapper");
    expect(wrapper?.status).toBe("failed");
    expect(wrapper?.error).toContain("[REDACTED]");
    expect(wrapper?.error).not.toContain("secret-value");
    expect(wrapper?.error).not.toContain("hunter2");
    expect(wrapper?.error).not.toContain("abc");
    expect(wrapper?.error).not.toContain("jsonsecret");
    expect(wrapper?.error).not.toContain("user:pass");
    expect(wrapper?.error).not.toContain("qwerty");
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

async function createDemoCwd(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "psf-worker-runner-"));
  await cp(resolve(process.cwd(), "../../projects"), join(dir, "projects"), { recursive: true });
  return dir;
}

function sequenceNow(values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? new Date().toISOString();
}
