import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkerJob } from "@psf/worker-runtime";
import type { Artifact, BugReport, MissionEvent, WorkerRun } from "@psf/mission-schema";
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
      workerRunId: "worker-run-wrapper",
      missionId: "mission-0001-ai-novelist-chapter-review",
      correlationId: "worker-run-wrapper:job-qa",
      heartbeatAt: "2026-05-31T00:01:00.000Z",
      workerRunnerHeartbeatAt: "2026-05-31T00:01:00.000Z",
      childWorkerRunIds: ["worker-run-child-qa"],
      childQARunIds: ["qa-run-child"],
      childArtifactIds: ["artifact-qa-report"],
      childBugReportIds: [],
      summary: "QA dry-run completed.",
      recommendedNextAction: "Refresh Mission Summary.",
    });
    expect(wrapper?.metadata).toMatchObject({
      queueWrapper: true,
      jobId: "job-qa",
      jobType: "qa.dry_run",
      workerRunId: "worker-run-wrapper",
      missionId: "mission-0001-ai-novelist-chapter-review",
      correlationId: "worker-run-wrapper:job-qa",
      heartbeatAt: "2026-05-31T00:01:00.000Z",
      workerRunnerHeartbeatAt: "2026-05-31T00:01:00.000Z",
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
        throw new Error('failed TOKEN=abc password=hunter2 {"token":"jsonsecret"} postgresql://user:pass@db.local/app?jwt=jwtsecret --token cli-secret token secret-value');
      },
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    })).rejects.toThrow(/^failed TOKEN=\[REDACTED\] password=\[REDACTED\] \{"token":"\[REDACTED\]"\} postgresql:\/\/user:\[REDACTED\]@db\.local\/app\?jwt=\[REDACTED\] --token \[REDACTED\] token \[REDACTED\]$/);

    const wrapper = await storage.getWorkerRun("worker-run-wrapper");
    expect(wrapper?.status).toBe("failed");
    expect(wrapper?.error).toContain("[REDACTED]");
    expect(wrapper?.error).not.toContain("secret-value");
    expect(wrapper?.error).not.toContain("hunter2");
    expect(wrapper?.error).not.toContain("abc");
    expect(wrapper?.error).not.toContain("jsonsecret");
    expect(wrapper?.error).not.toContain("user:pass");
    expect(wrapper?.error).not.toContain("jwtsecret");
    expect(wrapper?.error).not.toContain("cli-secret");
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

  it("records qa.playwright as manual-action when no target URL is configured", async () => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-real", "qa.playwright", "job-qa-playwright")],
    });
    const job = buildWorkerJob({
      id: "job-qa-playwright",
      missionId: "mission-real",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.playwright",
      mode: "real",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd()),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(wrapper.status).toBe("succeeded");
    expect(wrapper.output.summary).toContain("No target_url, QA_TEST_URL, or STAGING_URL was configured.");
    expect(wrapper.output.childWorkerRunIds).toEqual(["worker-run-mission-real-qa-deterministic"]);
    expect(wrapper.output.childQARunIds).toEqual(["qa-run-mission-real-deterministic"]);
    await expect(storage.getWorkerRun("worker-run-mission-real-qa-deterministic")).resolves.toMatchObject({
      status: "skipped",
      mode: "dry-run",
    });
  });


  it.each([
    {
      type: "codex.real" as const,
      payload: {},
      expectedSummary: "Mock codex real handler completed.",
      deps: {
        codexRunner: {
          run: async () => ({
            status: "succeeded" as const,
            executed: false,
            reason: "Mock codex real handler completed.",
            workerRun: workerRun("worker-run-mission-real-codex", "codex", "succeeded", "real"),
            artifacts: [artifact("artifact-mission-codex-dev-summary", "worker-run-mission-real-codex", "dev_summary")],
            events: [event("codex.real.succeeded")],
            stdout: "",
            stderr: "",
          }),
        },
      },
      expectedChildWorkerRunIds: ["worker-run-mission-real-codex"],
      expectedChildArtifactIds: ["artifact-mission-codex-dev-summary"],
    },
    {
      type: "qa.playwright" as const,
      payload: { targetUrl: "https://example.test/app" },
      expectedSummary: "Deterministic QA passed through injected runner.",
      deps: {
        deterministicQaExecute: async () => ({
          status: "passed" as const,
          passed: 1,
          failed: 0,
          logs: ["Deterministic QA passed through injected runner."],
          browserOpened: false,
          stagingVisited: true,
          summary: "Deterministic QA passed through injected runner.",
        }),
      },
      expectedChildWorkerRunIds: ["worker-run-mission-real-qa-deterministic"],
      expectedChildQARunIds: ["qa-run-mission-real-deterministic"],
    },
    {
      type: "qa.ai_exploratory" as const,
      payload: { targetUrl: "https://example.test/app" },
      expectedSummary: "AI exploratory QA is disabled because ENABLE_AI_EXPLORATORY_QA is not 1.",
      deps: {
        aiExploratoryQaExecute: async () => ({
          reportMarkdown: "# AI Exploratory QA Report\n\nNo bugs.\n",
          bugsJson: "{\"bugs\":[]}",
          regressionSpec: "import { test } from \"@playwright/test\";\ntest(\"noop\", async () => {});\n",
          browserOpened: false,
          mcpConnected: false,
          stagingVisited: false,
          summary: "AI exploratory QA would pass if enabled.",
        }),
      },
      expectedChildWorkerRunIds: ["worker-run-mission-real-qa-ai-exploratory"],
      expectedChildQARunIds: ["qa-run-mission-real-ai-exploratory"],
    },
    {
      type: "fix.real" as const,
      payload: { bugs: [bug("bug-mission-real-1")] },
      expectedSummary: "Real auto-fix mode is disabled by default; enable it only with explicit gated approval.",
      deps: {},
      expectedChildWorkerRunIds: ["worker-run-mission-real-auto-fix-real-gated"],
    },
    {
      type: "github.pr" as const,
      payload: { mission: { missionId: "mission-real", branchName: "agent/mission-real" } },
      expectedSummary: "Manual action required",
      deps: {},
      expectedChildWorkerRunIds: [],
    },
    {
      type: "deploy.coolify" as const,
      payload: { deployment: { project: "psf", environment: "staging" } },
      expectedSummary: "Manual action required",
      deps: {},
      expectedChildWorkerRunIds: [],
    },
    {
      type: "monitor.uptime_kuma" as const,
      payload: { monitor: { project: "psf", stagingUrl: "https://example.test" } },
      expectedSummary: "Manual action required",
      deps: {},
      expectedChildWorkerRunIds: [],
    },
    {
      type: "plane.sync" as const,
      payload: { mission: { missionId: "mission-real", title: "Real mission" }, bugs: [] },
      expectedSummary: "Manual action required",
      deps: {},
      expectedChildWorkerRunIds: [],
    },
  ])("dispatches gated real job type $type through the default handler", async (scenario) => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-real", scenario.type, "job-real")],
    });
    const job = buildWorkerJob({
      id: "job-real",
      missionId: "mission-real",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: scenario.type,
      mode: "real",
      payload: scenario.payload,
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), scenario.deps),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(wrapper.status).toBe("succeeded");
    expect(wrapper.output.jobType).toBe(scenario.type);
    expect(wrapper.output.summary).toContain(scenario.expectedSummary);
    expect(wrapper.output.childWorkerRunIds).toEqual(scenario.expectedChildWorkerRunIds);
    if (scenario.expectedChildArtifactIds) {
      expect(wrapper.output.childArtifactIds).toEqual(scenario.expectedChildArtifactIds);
    }
    if (scenario.expectedChildQARunIds) {
      expect(wrapper.output.childQARunIds).toEqual(scenario.expectedChildQARunIds);
    }
    for (const childWorkerRunId of scenario.expectedChildWorkerRunIds) {
      await expect(storage.getWorkerRun(childWorkerRunId)).resolves.toMatchObject({ id: childWorkerRunId });
    }
    for (const childArtifactId of scenario.expectedChildArtifactIds ?? []) {
      await expect(storage.getArtifact(childArtifactId)).resolves.toMatchObject({ id: childArtifactId });
    }
    for (const childQARunId of scenario.expectedChildQARunIds ?? []) {
      await expect(storage.getQARun(childQARunId)).resolves.toMatchObject({ id: childQARunId });
    }
    expect(JSON.stringify(wrapper.output)).not.toContain("secret-value");
    expect(await storage.listMissionEvents("mission-real")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "worker_run.running" }),
        expect.objectContaining({ type: "worker_run.succeeded" }),
      ]),
    );
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


function wrapperRun(id: string, missionId: string, jobType: string, jobId: string): WorkerRun {
  return {
    id,
    mission_id: missionId,
    worker_type: "orchestrator",
    status: "queued",
    mode: "real",
    input: {},
    output: { queueWrapper: true, jobId, jobType },
    logs: [],
    metadata: { queueWrapper: true, jobId, jobType },
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
  };
}

function workerRun(id: string, workerType: WorkerRun["worker_type"], status: WorkerRun["status"], mode: WorkerRun["mode"]): WorkerRun {
  return {
    id,
    mission_id: "mission-real",
    worker_type: workerType,
    status,
    mode,
    input: {},
    output: { realNetworkCall: false, realExternalCall: false },
    logs: [],
    metadata: { realNetworkCall: false, realExternalCall: false },
    created_at: "2026-05-31T00:01:30.000Z",
    updated_at: "2026-05-31T00:01:30.000Z",
  };
}

function artifact(id: string, workerRunId: string, type: Artifact["type"]): Artifact {
  return {
    id,
    mission_id: "mission-real",
    worker_run_id: workerRunId,
    type,
    path: `missions/mission-real/${id}.md`,
    content: "safe artifact",
    mime_type: "text/markdown",
    size: 13,
    metadata: { realNetworkCall: false },
    created_at: "2026-05-31T00:01:30.000Z",
  };
}

function event(type: string): MissionEvent {
  return {
    id: `event-mission-real-${type.replaceAll(".", "-")}`,
    mission_id: "mission-real",
    type,
    message: "safe event",
    payload: {},
    created_at: "2026-05-31T00:01:30.000Z",
  };
}

function bug(id: string): BugReport {
  return {
    id,
    mission_id: "mission-real",
    qa_run_id: "qa-run-mission-real-deterministic",
    title: "Broken flow",
    severity: "P1",
    status: "open",
    reproduction_steps: ["Open the page.", "Run the failing flow."],
    expected_result: "The flow succeeds.",
    actual_result: "The flow fails.",
    evidence: { source: "test" },
    source: "qa-worker",
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
  };
}
