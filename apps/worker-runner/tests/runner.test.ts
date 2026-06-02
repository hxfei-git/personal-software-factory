import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkerJob } from "@psf/worker-runtime";
import {
  MissionStatus,
  type Artifact,
  type BugReport,
  type Mission,
  type MissionEvent,
  type ProjectPassport,
  type WorkerRun,
} from "@psf/mission-schema";
import { createInMemoryMissionStorage } from "@psf/orchestrator-api/storage";
import { runDeterministicPlaywrightQa, type DeterministicQaInput } from "@psf/qa-worker";
import type { CodexExecutionRequest } from "@psf/codex-worker";
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



  it("writes MissionEvent action result for a successful job", async () => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-action-result", MissionStatus.qa_running)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-action-result", "qa.dry_run", "job-qa")],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-action-result",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run",
      payload: {},
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

    const events = await storage.listMissionEvents("mission-action-result");
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "mission.action_result" })]));
    const actionResult = events.find((event) => event.type === "mission.action_result");
    expect(actionResult?.payload).toMatchObject({
      jobId: "job-qa",
      jobType: "qa.dry_run",
      workerRunId: "worker-run-wrapper",
      wrapperWorkerRunId: "worker-run-wrapper",
      childWorkerRunIds: ["worker-run-child-qa"],
      childQARunIds: ["qa-run-child"],
      childArtifactIds: ["artifact-qa-report"],
      childBugReportIds: [],
      recommendedNextAction: "Refresh Mission Summary.",
    });
  });

  it("auto transition moves qa_running to bugs_found when QA action result has bugs", async () => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-qa-bug", MissionStatus.qa_running)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-qa-bug", "qa.dry_run", "job-qa")],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-qa-bug",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: async () => ({
        childWorkerRunIds: [],
        childQARunIds: ["qa-run-child"],
        childArtifactIds: [],
        childBugReportIds: ["bug-child"],
        summary: "QA found bugs.",
        recommendedNextAction: "Fix the reported bug.",
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    await expect(storage.getMission("mission-qa-bug")).resolves.toMatchObject({ status: MissionStatus.bugs_found });
    expect(await storage.listMissionEvents("mission-qa-bug")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "mission.action_result",
        payload: expect.objectContaining({ childBugReportIds: ["bug-child"] }),
      }),
      expect.objectContaining({
        type: "mission.status.auto_transition",
        payload: expect.objectContaining({ from: MissionStatus.qa_running, to: MissionStatus.bugs_found }),
      }),
    ]));
  });

  it("auto transition moves qa_running to ready_for_review when QA action result has no bugs", async () => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-qa-clean", MissionStatus.qa_running)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-qa-clean", "qa.dry_run", "job-qa")],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-qa-clean",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: async () => ({
        childWorkerRunIds: [],
        childQARunIds: ["qa-run-child"],
        childArtifactIds: [],
        childBugReportIds: [],
        summary: "QA passed.",
        recommendedNextAction: "Review the mission.",
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    await expect(storage.getMission("mission-qa-clean")).resolves.toMatchObject({ status: MissionStatus.ready_for_review });
    expect(await storage.listMissionEvents("mission-qa-clean")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "mission.action_result" }),
      expect.objectContaining({
        type: "mission.status.auto_transition",
        payload: expect.objectContaining({ from: MissionStatus.qa_running, to: MissionStatus.ready_for_review }),
      }),
    ]));
  });

  it("auto transition keeps qa_running in bugs_found path when existing open bugs remain", async () => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-qa-existing-bug", MissionStatus.qa_running)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-qa-existing-bug", "qa.dry_run", "job-qa")],
      bugs: [{ ...bug("bug-existing-open"), mission_id: "mission-qa-existing-bug", status: "open" }],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-qa-existing-bug",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: async () => ({
        childWorkerRunIds: [],
        childQARunIds: ["qa-run-child"],
        childArtifactIds: [],
        childBugReportIds: [],
        summary: "QA passed in this run, but earlier bugs remain open.",
        recommendedNextAction: "Fix open bugs before review.",
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    await expect(storage.getMission("mission-qa-existing-bug")).resolves.toMatchObject({ status: MissionStatus.bugs_found });
    expect(await storage.listMissionEvents("mission-qa-existing-bug")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "mission.status.auto_transition",
        payload: expect.objectContaining({ from: MissionStatus.qa_running, to: MissionStatus.bugs_found }),
      }),
    ]));
  });

  it("records action result MissionEvent without forcing illegal auto transition", async () => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-illegal-transition", MissionStatus.planned)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-illegal-transition", "qa.dry_run", "job-qa")],
    });
    const job = buildWorkerJob({
      id: "job-qa",
      missionId: "mission-illegal-transition",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.dry_run",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: async () => ({
        childWorkerRunIds: [],
        childQARunIds: [],
        childArtifactIds: [],
        childBugReportIds: [],
        summary: "QA passed but mission is not in QA.",
        recommendedNextAction: "Review current mission status.",
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    await expect(storage.getMission("mission-illegal-transition")).resolves.toMatchObject({ status: MissionStatus.planned });
    const events = await storage.listMissionEvents("mission-illegal-transition");
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "mission.action_result" })]));
    expect(events).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "mission.status.auto_transition" })]));
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

  it("does not auto-transition qa.playwright blocked manual-action results", async () => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-qa-playwright-blocked", MissionStatus.qa_running)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-qa-playwright-blocked", "qa.playwright", "job-qa-playwright")],
    });
    const job = buildWorkerJob({
      id: "job-qa-playwright",
      missionId: "mission-qa-playwright-blocked",
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
    expect(wrapper.output).toMatchObject({
      status: "blocked",
      manualActionRequired: true,
      summary: "No target_url, QA_TEST_URL, or STAGING_URL was configured.",
    });
    await expect(storage.getMission("mission-qa-playwright-blocked")).resolves.toMatchObject({ status: MissionStatus.qa_running });
    const events = await storage.listMissionEvents("mission-qa-playwright-blocked");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "mission.action_result",
        payload: expect.objectContaining({
          status: "blocked",
          manualActionRequired: true,
          summary: "No target_url, QA_TEST_URL, or STAGING_URL was configured.",
        }),
      }),
    ]));
    expect(events).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "mission.status.auto_transition" })]));
  });

  it("passes project context to real deterministic QA and blocks unverified scenarios without executing browser", async () => {
    let executeCalled = false;
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-qa-playwright-context-blocked", MissionStatus.qa_running)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-qa-playwright-context-blocked", "qa.playwright", "job-qa-playwright")],
    });
    const missionFiles = {
      "mission.md": "# Mission\n\nReview the ai-novelist home flow.\n",
      "acceptance.md": "# Acceptance\n\n- Report deterministic failures.\n",
      "technical-notes.md": "# Technical Notes\n\nUse injected QA runner only.\n",
      "risk-notes.md": "# Risk Notes\n\nNo network or real browser.\n",
    };
    const job = buildWorkerJob({
      id: "job-qa-playwright",
      missionId: "mission-qa-playwright-context-blocked",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.playwright",
      mode: "real",
      payload: {
        targetUrl: "https://example.test/app",
        passport: projectPassport(),
        qaCharter: "QA Charter: cover open_home without external calls.",
        missionFiles,
      },
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        deterministicQaExecute: async () => {
          executeCalled = true;
          throw new Error("Injected Playwright executor should not run while selectors are unverified.");
        },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(executeCalled).toBe(false);
    expect(wrapper.status).toBe("succeeded");
    expect(wrapper.output).toMatchObject({
      status: "blocked",
      manualActionRequired: true,
      childWorkerRunIds: ["worker-run-mission-qa-playwright-context-blocked-qa-deterministic"],
      childQARunIds: ["qa-run-mission-qa-playwright-context-blocked-deterministic"],
      childBugReportIds: [],
    });
    expect(String(wrapper.output.summary)).toContain("manual action required");
    await expect(storage.getWorkerRun("worker-run-mission-qa-playwright-context-blocked-qa-deterministic")).resolves.toMatchObject({
      status: "skipped",
      mode: "dry-run",
    });
    await expect(storage.getMission("mission-qa-playwright-context-blocked")).resolves.toMatchObject({ status: MissionStatus.qa_running });
    const events = await storage.listMissionEvents("mission-qa-playwright-context-blocked");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "qa.completed", payload: expect.objectContaining({ status: "blocked", bugCount: 0 }) }),
      expect.objectContaining({
        type: "mission.action_result",
        payload: expect.objectContaining({ status: "blocked", manualActionRequired: true }),
      }),
    ]));
    expect(events).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "mission.status.auto_transition" })]));
  });


  it("persists qa.playwright child resources and passes enriched payload to deterministic QA", async () => {
    let capturedInput: DeterministicQaInput | undefined;
    const passport = projectPassport();
    const missionFiles = {
      "mission.md": "# Mission\n\nReview the ai-novelist home flow.\n",
      "acceptance.md": "# Acceptance\n\n- Report deterministic failures.\n",
      "technical-notes.md": "# Technical Notes\n\nUse injected QA runner only.\n",
      "risk-notes.md": "# Risk Notes\n\nNo network or real browser.\n",
    };
    const e2eCommandMetadata = {
      commands: ["pnpm test:e2e"],
      executionPolicy: "review-only",
    };
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-qa-playwright-resources", MissionStatus.qa_running)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-qa-playwright-resources", "qa.playwright", "job-qa-playwright")],
    });
    const job = buildWorkerJob({
      id: "job-qa-playwright",
      missionId: "mission-qa-playwright-resources",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "qa.playwright",
      mode: "real",
      payload: {
        targetUrl: "https://example.test/app",
        passport,
        qaCharter: "QA Charter: cover open_home without external calls.",
        missionFiles,
        e2eCommandMetadata,
      },
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        deterministicQaRunner: async (input) => {
          capturedInput = input;
          return runDeterministicPlaywrightQa({
            missionId: input.missionId,
            projectId: input.projectId,
            targetUrl: input.targetUrl ?? "",
            now: "2026-05-31T00:01:30.000Z",
            execute: async (executionInput) => ({
              status: "failed",
              passed: 0,
              failed: 1,
              logs: [`Injected deterministic QA visited ${executionInput.targetUrl}`],
              browserOpened: false,
              stagingVisited: true,
              failures: [{
                title: "Home flow did not render",
                severity: "P1",
                reproductionSteps: ["Open the target URL.", "Run the deterministic home flow."],
                expectedResult: "The home flow renders.",
                actualResult: "The home flow did not render.",
                evidence: { scenarioId: "smoke_home", screenshotPath: executionInput.artifacts.screenshotsDir },
              }],
            }),
          });
        },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(capturedInput).toMatchObject({
      missionId: "mission-qa-playwright-resources",
      projectId: "ai-novelist",
      targetUrl: "https://example.test/app",
      passport,
      qaCharter: "QA Charter: cover open_home without external calls.",
      missionFiles,
      e2eCommandMetadata,
    });
    expect(wrapper.output).toMatchObject({
      childWorkerRunIds: ["worker-run-mission-qa-playwright-resources-qa-deterministic"],
      childQARunIds: ["qa-run-mission-qa-playwright-resources-deterministic"],
      childBugReportIds: ["bug-mission-qa-playwright-resources-deterministic-1-home-flow-did-not-render"],
    });
    await expect(storage.getWorkerRun("worker-run-mission-qa-playwright-resources-qa-deterministic")).resolves.toMatchObject({
      status: "failed",
      worker_type: "qa",
    });
    await expect(storage.getQARun("qa-run-mission-qa-playwright-resources-deterministic")).resolves.toMatchObject({
      status: "failed",
      target_url: "https://example.test/app",
    });
    await expect(storage.getBug("bug-mission-qa-playwright-resources-deterministic-1-home-flow-did-not-render")).resolves.toMatchObject({
      status: "open",
      title: "Home flow did not render",
    });
    expect((await storage.listMissionArtifacts("mission-qa-playwright-resources")).map((artifact) => artifact.type)).toEqual(
      expect.arrayContaining(["qa_report", "bugs_json", "screenshot", "playwright_trace", "log"]),
    );
    await expect(storage.getMission("mission-qa-playwright-resources")).resolves.toMatchObject({ status: MissionStatus.bugs_found });
    expect(await storage.listMissionEvents("mission-qa-playwright-resources")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "qa.completed" }),
      expect.objectContaining({
        type: "mission.status.auto_transition",
        payload: expect.objectContaining({ from: MissionStatus.qa_running, to: MissionStatus.bugs_found }),
      }),
    ]));
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
  }, 15_000);

  it("persists codex.real child resources and records wrapper status and reason", async () => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-real", MissionStatus.fixing)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-real", "codex.real", "job-codex-real")],
    });
    const childRun = workerRun("worker-run-mission-real-codex", "codex", "failed", "real");
    const childArtifact = artifact("artifact-mission-codex-dev-summary", childRun.id, "dev_summary");
    const childEvent = event("codex.real.failed");
    const job = buildWorkerJob({
      id: "job-codex-real",
      missionId: "mission-real",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "codex.real",
      mode: "real",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        codexRunner: {
          run: async () => ({
            status: "failed",
            executed: false,
            reason: "Codex runner failed safely.",
            workerRun: childRun,
            artifacts: [childArtifact],
            events: [childEvent],
            stdout: "",
            stderr: "safe failure",
          }),
        },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(wrapper.output).toMatchObject({
      childWorkerRunIds: [childRun.id],
      childArtifactIds: [childArtifact.id],
      summary: "Codex runner failed safely.",
      recommendedNextAction: "Inspect Codex worker stderr and artifacts before retrying.",
      status: "failed",
      reason: "Codex runner failed safely.",
    });
    await expect(storage.getWorkerRun(childRun.id)).resolves.toMatchObject({ id: childRun.id, worker_type: "codex" });
    await expect(storage.getArtifact(childArtifact.id)).resolves.toMatchObject({ id: childArtifact.id, worker_run_id: childRun.id });
    expect(await storage.listMissionEvents("mission-real")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "codex.real.failed" }),
      expect.objectContaining({
        type: "mission.action_result",
        payload: expect.objectContaining({
          childWorkerRunIds: [childRun.id],
          childArtifactIds: [childArtifact.id],
          status: "failed",
          reason: "Codex runner failed safely.",
        }),
      }),
    ]));
  });

  it("passes enriched codex.real payload through to the injected Codex runner", async () => {
    let capturedInput: CodexExecutionRequest | undefined;
    const storage = createInMemoryMissionStorage({
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-real", "codex.real", "job-codex-real")],
    });
    const missionFiles = {
      "mission.md": "# Mission\n\nImplement the change.\n",
      "acceptance.md": "# Acceptance\n\n- Tests pass.\n",
      "technical-notes.md": "# Technical Notes\n\nUse existing adapters.\n",
      "risk-notes.md": "# Risk Notes\n\nNo push.\n",
    };
    const payload = {
      passport: projectPassport(),
      missionFiles,
      projectAgents: "Follow AGENTS.md and do not expose secrets.",
      repoUrl: "/tmp/ai-novelist.git",
      defaultBranch: "trunk",
      branchName: "agent/mission-real",
      workspaceRoot: "/tmp/psf-workspaces",
      commands: ["pnpm --filter ai-novelist test"],
      approvalIds: ["approval-real-codex"],
      approvalRecordIds: ["approval-record-real-codex"],
    };
    const job = buildWorkerJob({
      id: "job-codex-real",
      missionId: "mission-real",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "codex.real",
      mode: "real",
      payload,
      timeoutMs: 123_456,
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        codexRunner: {
          run: async (input) => {
            capturedInput = input;
            return codexResult("succeeded", "Codex runner completed safely.");
          },
        },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(capturedInput).toMatchObject({
      missionId: "mission-real",
      projectId: "ai-novelist",
      mode: "real",
      passport: payload.passport,
      missionFiles,
      projectAgents: payload.projectAgents,
      repoUrl: payload.repoUrl,
      defaultBranch: payload.defaultBranch,
      branchName: payload.branchName,
      workspaceRoot: payload.workspaceRoot,
      commands: payload.commands,
      approvalIds: payload.approvalIds,
      approvalRecordIds: payload.approvalRecordIds,
      timeoutMs: 123_456,
    });
  });

  it.each([
    ["blocked" as const, "Codex gates blocked execution."],
    ["manual_action" as const, "Manual action is required before Codex can run."],
  ])("does not advance Mission to success states when codex.real returns %s", async (status, reason) => {
    const storage = createInMemoryMissionStorage({
      missions: [mission("mission-real", MissionStatus.fixing)],
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-real", "codex.real", "job-codex-real")],
    });
    const job = buildWorkerJob({
      id: "job-codex-real",
      missionId: "mission-real",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "codex.real",
      mode: "real",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        codexRunner: { run: async () => codexResult(status, reason) },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(wrapper.output).toMatchObject({ status, reason, summary: reason });
    await expect(storage.getMission("mission-real")).resolves.toMatchObject({ status: MissionStatus.fixing });
    expect(await storage.listMissionEvents("mission-real")).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "mission.status.auto_transition",
        payload: expect.objectContaining({ to: MissionStatus.ready_for_review }),
      }),
      expect.objectContaining({
        type: "mission.status.auto_transition",
        payload: expect.objectContaining({ to: "released" }),
      }),
    ]));
  });

  it("redacts secrets from codex.real wrapper output, action result, artifacts, and events", async () => {
    const storage = createInMemoryMissionStorage({
      workerRuns: [wrapperRun("worker-run-wrapper", "mission-real", "codex.real", "job-codex-real")],
    });
    const secretText = "token=raw-token password=raw-password apiKey=raw-api-key";
    const unsafeWorkerRun = {
      ...workerRun("worker-run-mission-real-codex", "codex", "failed", "real"),
      output: { reason: secretText },
      error: secretText,
      logs: [secretText],
    };
    const unsafeArtifact = {
      ...artifact("artifact-mission-codex-secret", unsafeWorkerRun.id, "dev_summary"),
      content: secretText,
      metadata: { token: "raw-token" },
    };
    const unsafeEvent = {
      ...event("codex.real.failed"),
      message: secretText,
      payload: { password: "raw-password", nested: { apiKey: "raw-api-key" } },
    };
    const job = buildWorkerJob({
      id: "job-codex-real",
      missionId: "mission-real",
      projectId: "ai-novelist",
      workerRunId: "worker-run-wrapper",
      type: "codex.real",
      mode: "real",
      payload: {},
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        codexRunner: {
          run: async () => ({
            status: "failed",
            executed: false,
            reason: secretText,
            workerRun: unsafeWorkerRun,
            artifacts: [unsafeArtifact],
            events: [unsafeEvent],
            stdout: secretText,
            stderr: secretText,
          }),
        },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    const persistedJson = JSON.stringify({
      wrapper: await storage.getWorkerRun("worker-run-wrapper"),
      child: await storage.getWorkerRun(unsafeWorkerRun.id),
      artifact: await storage.getArtifact(unsafeArtifact.id),
      events: await storage.listMissionEvents("mission-real"),
    });
    expect(persistedJson).not.toMatch(/raw-token|raw-password|raw-api-key/);
    expect(persistedJson).not.toMatch(/token=raw|password=raw|apiKey=raw/i);
    expect(persistedJson).toContain("[REDACTED]");
  });

});

function codexResult(status: "blocked" | "manual_action" | "succeeded" | "failed", reason: string) {
  return {
    status,
    executed: false,
    reason,
    workerRun: workerRun("worker-run-mission-real-codex", "codex", status === "succeeded" ? "succeeded" : status === "failed" ? "failed" : "skipped", "real"),
    artifacts: [artifact("artifact-mission-codex-dev-summary", "worker-run-mission-real-codex", "dev_summary")],
    events: [event(`codex.real.${status}`)],
    stdout: "",
    stderr: "",
  };
}

async function createDemoCwd(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "psf-worker-runner-"));
  await cp(resolve(process.cwd(), "../../projects"), join(dir, "projects"), { recursive: true });
  return dir;
}

function sequenceNow(values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? new Date().toISOString();
}



function mission(id: string, status: Mission["status"]): Mission {
  return {
    id,
    project_id: "ai-novelist",
    title: "Review chapter flow",
    slug: id,
    raw_request: "Review the chapter flow.",
    status,
    priority: "P1",
    risk_level: "medium",
    current_attempt: 0,
    max_attempts: 3,
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
  };
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

function projectPassport(): ProjectPassport {
  return {
    id: "ai-novelist",
    name: "AI Novelist",
    description: "Deterministic QA fixture passport.",
    repo: {
      url: "https://example.invalid/ai-novelist.git",
      default_branch: "main",
    },
    runtime: { kind: "web" },
    commands: {
      install: "pnpm install --lockfile-only",
      test: "pnpm test",
      build: "pnpm build",
      run_staging: "pnpm dev",
      e2e: ["pnpm test:e2e"],
    },
    urls: {
      production: "",
      local: "http://127.0.0.1:5173",
      staging: "https://example.test/app",
    },
    quality_gates: {
      require_build: true,
      require_unit_tests: true,
      require_e2e_tests: true,
      require_pr_review: true,
    },
    core_flows: [{ id: "open_home", name: "Open home", priority: "P1" }],
  };
}
