# Batch 3/4 QA And Local Codex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build project-level deterministic QA for `ai-novelist` and prove gated local Codex execution through queued Orchestrator/Worker Runner paths without push, PR creation, deployment, or external provider calls.

**Architecture:** Orchestrator enriches whitelisted queued jobs with project context; Worker Runner executes existing QA/Codex worker boundaries and persists child resources under queue wrapper WorkerRuns. QA Worker owns deterministic scenario/evidence logic, Codex Worker owns local mirror/worktree/executable safety, and Hub only displays Orchestrator API state.

**Tech Stack:** TypeScript, Zod, Fastify, Prisma-compatible storage interfaces, BullMQ/InProcess worker runtime, Vitest, Playwright optional, React/Vite Hub.

---

## File Structure

- Modify `apps/orchestrator-api/src/actions.ts`: extend real action request/payload construction for `targetUrl`, local mirror, workspace root, and safe project context.
- Modify `apps/orchestrator-api/src/services.ts`: build Project Passport, QA charter, mission files, target URL, and command metadata before enqueueing `qa.playwright` and `codex.real`.
- Modify `apps/orchestrator-api/tests/api.test.ts`: add focused assertions for enriched queued payloads and blocked target URL behavior.
- Modify `workers/qa-worker/src/deterministic.ts`: add deterministic scenario model, scenario evidence, real Playwright evidence capture, stronger bug evidence, and redaction.
- Modify `workers/qa-worker/src/index.ts`: export scenario types needed by tests or Worker Runner.
- Modify `workers/qa-worker/tests/qa-worker.test.ts`: add focused QA Batch 3 tests.
- Modify `workers/codex-worker/src/runner.ts` only if result contract needs extra safe output fields; keep existing safety gates.
- Modify `workers/codex-worker/tests/codex-worker.test.ts`: add fixture proof for local mirror, worktree, branch, no main mutation, no push, artifacts, and blocked gates.
- Modify `apps/worker-runner/src/handlers.ts`: pass enriched payload to QA/Codex runners without fallback masking when project context exists.
- Modify `apps/worker-runner/tests/runner.test.ts`: verify `qa.playwright` and `codex.real` child resources are persisted and transitions remain conservative.
- Modify `apps/hub/src/App.tsx`: show screenshot/log evidence paths in Mission Detail if they are present.
- Modify `apps/hub/tests/hub.test.tsx`: add minimal visibility test for QA evidence paths if Hub changes.
- Update `docs/progress.md`, create `docs/progress/batch-03-04-qa-and-local-codex.md`, and update relevant QA/API/Codex safety docs.

---

### Task 1: Orchestrator QA Payload Tests

**Files:**
- Modify: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Add a failing queued QA payload test**

Add this test near the existing gated real action tests:

```ts
it("queues qa-playwright with Project Passport, QA charter, targetUrl, mission files, and e2e command metadata", async () => {
  await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_QA_PLAYWRIGHT: "true" }, async () => {
    const workerRuntime = new InProcessWorkerRuntime();
    const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime });
    await seedDemoMission(storage);

    const response = await server.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/actions/qa-playwright`,
      payload: { targetUrl: "http://127.0.0.1:8999/app" },
    });

    expect(response.statusCode).toBe(202);
    const jobs = await workerRuntime.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.job).toMatchObject({
      missionId: EXAMPLE_MISSION_ID,
      projectId: "ai-novelist",
      type: "qa.playwright",
      mode: "real",
      payload: expect.objectContaining({
        enableRealMode: true,
        targetUrl: "http://127.0.0.1:8999/app",
        qaCharter: expect.stringContaining("QA Charter"),
        passport: expect.objectContaining({
          id: "ai-novelist",
          core_flows: expect.arrayContaining([expect.objectContaining({ id: "open_home" })]),
        }),
        missionFiles: expect.objectContaining({
          "mission.md": expect.stringContaining("Mission"),
          "acceptance.md": expect.stringContaining("Acceptance"),
          "technical-notes.md": expect.any(String),
          "risk-notes.md": expect.any(String),
        }),
        e2eCommandMetadata: expect.objectContaining({
          commands: expect.any(Array),
          executionPolicy: "review-only",
        }),
      }),
    });
    expect(JSON.stringify(response.json())).not.toMatch(/token|password|secret/i);
  });
});
```

- [ ] **Step 2: Add a failing missing target URL preflight test**

```ts
it("blocks qa-playwright preflight when no request, project, or passport target URL exists", async () => {
  const registryRoot = await createRegistryRoot({
    passport: {
      urls: { production: "", staging: "", local: "" },
      commands: { e2e: ["pnpm test:e2e"] },
    },
  });
  try {
    await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_QA_PLAYWRIGHT: "true" }, async () => {
      const workerRuntime = new InProcessWorkerRuntime();
      const { server } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
      const mission = await createMission(server, "QA missing target URL");

      const response = await server.inject({
        method: "POST",
        url: `/missions/${mission.id}/actions/qa-playwright`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
        details: expect.objectContaining({ action: "qa-playwright", missingTargetUrl: true }),
      });
      expect(response.json().message).toContain("target URL");
    });
  } finally {
    await rm(registryRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the targeted API test and confirm failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --runInBand
```

Expected: the new test fails because `qa.playwright` payload currently lacks the full project context.

### Task 2: Orchestrator Payload Implementation

**Files:**
- Modify: `apps/orchestrator-api/src/actions.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Test: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Extend real action request schema**

In `apps/orchestrator-api/src/actions.ts`, replace `RealActionRequestSchema` with:

```ts
export const RealActionRequestSchema = z.object({
  approvalId: z.string().min(1).optional(),
  targetUrl: z.string().min(1).optional(),
  repoUrl: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  workspaceRoot: z.string().min(1).optional(),
}).strict();
```

- [ ] **Step 2: Allow enriched payload in `buildQueuedRealActionJob`**

Change the payload construction to merge a sanitized `context` object supplied by services:

```ts
const parsedBody = parseActionRequest(RealActionRequestSchema, {
  approvalId: bodyRecord.approvalId,
  targetUrl: bodyRecord.targetUrl,
  repoUrl: bodyRecord.repoUrl,
  branchName: bodyRecord.branchName,
  workspaceRoot: bodyRecord.workspaceRoot,
});
const context = bodyRecord.context && typeof bodyRecord.context === "object" && !Array.isArray(bodyRecord.context)
  ? bodyRecord.context as Record<string, unknown>
  : {};
const payload = {
  ...context,
  enableRealMode: true,
  approvalRecordIds: input.approvalRecordIds ?? [],
  approvalIds: input.approvalGrantIds ?? [],
  ...(parsedBody.approvalId ? { requestedApprovalId: parsedBody.approvalId } : {}),
  ...(parsedBody.targetUrl ? { targetUrl: parsedBody.targetUrl } : {}),
  ...(parsedBody.repoUrl ? { repoUrl: parsedBody.repoUrl } : {}),
  ...(parsedBody.branchName ? { branchName: parsedBody.branchName } : {}),
  ...(parsedBody.workspaceRoot ? { workspaceRoot: parsedBody.workspaceRoot } : {}),
};
```

- [ ] **Step 3: Add service helpers for target URL and mission files**

In `apps/orchestrator-api/src/services.ts`, add helpers near existing preflight helpers:

```ts
async function buildMissionFileContext(mission: Mission): Promise<Record<"mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md", string>> {
  const planner = await getExistingPlannerResult(mission.id).catch(() => undefined);
  const artifactContent = new Map<string, string>();
  for (const artifact of planner?.artifacts ?? []) {
    if (artifact.content && artifact.path) {
      artifactContent.set(basename(artifact.path), artifact.content);
      if (artifact.name) artifactContent.set(artifact.name, artifact.content);
    }
  }
  return {
    "mission.md": artifactContent.get("mission.md") ?? mission.mission_markdown ?? `# Mission\n\n${mission.title}\n\n${mission.raw_request}\n`,
    "acceptance.md": artifactContent.get("acceptance.md") ?? mission.acceptance_markdown ?? "# Acceptance\n\n- Stop for manual action when project context is incomplete.\n",
    "technical-notes.md": artifactContent.get("technical-notes.md") ?? "# Technical Notes\n\nProject context was assembled by Orchestrator preflight.\n",
    "risk-notes.md": artifactContent.get("risk-notes.md") ?? "# Risk Notes\n\nNo push, deployment, external provider call, or secret exposure is allowed by default.\n",
  };
}

function resolveQaTargetUrl(body: Record<string, unknown>, project: MissionProjectLike, registryProject: RegistryProject): string {
  const requestTargetUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim() : "";
  return [
    requestTargetUrl,
    project.staging_url,
    project.production_url,
    registryProject.passport.urls.local,
    registryProject.passport.urls.staging,
    registryProject.passport.urls.production,
  ].find(isNonEmptyString) ?? "";
}
```

Import `basename` from `node:path`.

- [ ] **Step 4: Build real action context before queueing**

In `runGatedRealAction`, after approvals are checked and before `queueAction`, build context:

```ts
const bodyRecord = isRecord(body) ? body : {};
const project = await storage.getProject(mission.project_id);
if (!project) throw notFound("Project", mission.project_id);
const registryProject = await getRegistryProject(mission.project_id);
const missionFiles = await buildMissionFileContext(mission);
const qaCharter = await readQaCharterNextToPassport(registryProject.passportPath);
const context = buildGatedRealJobContext(action, mission, project, registryProject, bodyRecord, missionFiles, qaCharter);
return sanitizeApiResponse(await queueAction(mission, {
  ...input,
  context,
  approvalRecordIds: approvedApprovalRecordIdsForAction(action, approvals),
  approvalIds: approvalGrantIdsForAction(action),
}, action, "real"));
```

Add:

```ts
function buildGatedRealJobContext(
  action: GatedRealActionKind,
  mission: Mission,
  project: MissionProjectLike,
  registryProject: RegistryProject,
  body: Record<string, unknown>,
  missionFiles: Record<"mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md", string>,
  qaCharter: string,
): Record<string, unknown> {
  const targetUrl = resolveQaTargetUrl(body, project, registryProject);
  const passport = registryProject.passport;
  if (action === "qa-playwright") {
    return {
      passport,
      qaCharter,
      missionFiles,
      targetUrl,
      e2eCommandMetadata: {
        commands: normalizeCommandList(passport.commands.e2e),
        executionPolicy: "review-only",
      },
    };
  }
  if (action === "codex-real") {
    return {
      passport,
      missionFiles,
      repoUrl: typeof body.repoUrl === "string" ? body.repoUrl : passport.repo.url,
      defaultBranch: passport.repo.default_branch,
      branchName: typeof body.branchName === "string" ? body.branchName : `agent/${passport.id}-${mission.id}`,
      workspaceRoot: typeof body.workspaceRoot === "string" ? body.workspaceRoot : process.env.PSF_WORKSPACE_ROOT ?? "./workspaces",
      commands: [
        ...normalizeCommandList(passport.commands.test),
        ...normalizeCommandList(passport.commands.build),
        ...normalizeCommandList(passport.commands.lint),
        ...normalizeCommandList(passport.commands.e2e),
      ],
    };
  }
  return {
    passport,
    missionFiles,
    ...(targetUrl ? { targetUrl } : {}),
  };
}

function normalizeCommandList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return typeof value === "string" && value.trim().length > 0 ? [value] : [];
}
```

- [ ] **Step 5: Run API tests**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
```

Expected: PASS for existing tests and the new QA payload tests.

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator-api/src/actions.ts apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "补齐真实动作入队上下文" -m "为 qa-playwright 和 codex-real 入队 payload 注入 Project Passport、QA charter、mission files、target URL、本地 Codex 上下文和安全命令元数据。"
```

### Task 3: QA Worker Scenario Tests

**Files:**
- Modify: `workers/qa-worker/tests/qa-worker.test.ts`

- [ ] **Step 1: Add failing deterministic scenario tests**

Add tests in the `Deterministic Playwright QA runner` describe block:

```ts
it("builds ai-novelist scenarios from passport and QA charter and blocks unverified selectors", async () => {
  const result = await runDeterministicPlaywrightQa({
    ...input,
    targetUrl: "http://127.0.0.1:8000",
    env: { ENABLE_REAL_PLAYWRIGHT: "1" },
  });

  expect(result.status).toBe("blocked");
  expect(result.manualActionRequired).toBe(true);
  expect(result.files["qa-report.md"]).toContain("smoke_home");
  expect(result.files["qa-report.md"]).toContain("create_or_start_novel");
  expect(result.files["qa-report.md"]).toContain("manual action");
  expect(result.files["bugs.json"]).toContain('"bugs": []');
});

it("records scenario evidence paths for a failing injected deterministic flow", async () => {
  const result = await runDeterministicPlaywrightQa({
    ...input,
    targetUrl: "http://127.0.0.1:8000",
    execute: async (execution) => ({
      status: "failed",
      passed: 1,
      failed: 1,
      logs: ["scenario duplicate_click_or_loading_guard failed", "api_key=qa-secret"],
      browserOpened: true,
      stagingVisited: true,
      failures: [{
        title: "Duplicate generate click is not guarded",
        severity: "P1",
        reproductionSteps: ["Open ai-novelist.", "Start a novel.", "Click generate twice quickly."],
        expectedResult: "Only one generation request is accepted.",
        actualResult: "The UI allowed repeated generation attempts.",
        evidence: {
          scenarioId: "duplicate_click_or_loading_guard",
          screenshotPath: `${execution.artifacts.screenshotsDir}/duplicate-click.png`,
          tracePath: execution.artifacts.tracePath,
          logPath: execution.artifacts.logPath,
          token: "qa-secret",
        },
        suggestedFix: "Disable generate controls while a request is pending and add request idempotency.",
      }],
    }),
  });

  const bug = result.bugs[0]!;
  expect(result.status).toBe("failed");
  expect(bug.evidence).toMatchObject({
    scenarioId: "duplicate_click_or_loading_guard",
    tracePath: expect.stringContaining("trace.zip"),
    logPath: expect.stringContaining("deterministic.log"),
  });
  expect(result.files["bugs.json"]).not.toContain("qa-secret");
  expect(result.artifacts.map((artifact) => artifact.type)).toEqual(expect.arrayContaining(["screenshot", "playwright_trace", "log"]));
});
```

- [ ] **Step 2: Run QA worker tests and confirm failure**

Run:

```bash
pnpm --filter @psf/qa-worker test
```

Expected: FAIL because scenario modeling and unverified selector blocking are not implemented.

### Task 4: QA Worker Scenario And Evidence Implementation

**Files:**
- Modify: `workers/qa-worker/src/deterministic.ts`
- Modify: `workers/qa-worker/src/index.ts`
- Test: `workers/qa-worker/tests/qa-worker.test.ts`

- [ ] **Step 1: Add scenario types**

In `workers/qa-worker/src/deterministic.ts`, add:

```ts
export type DeterministicScenarioId =
  | "smoke_home"
  | "create_or_start_novel"
  | "generate_or_wait_for_content"
  | "review_or_report_visible"
  | "duplicate_click_or_loading_guard";

export interface DeterministicScenario {
  id: DeterministicScenarioId;
  title: string;
  sourceFlowIds: string[];
  charterReferences: string[];
  selectorStatus: "verified" | "unverified";
  manualActionWhenUnverified: string;
}

interface ScenarioExecutionEvidence {
  scenarioId: DeterministicScenarioId;
  status: "passed" | "failed" | "blocked";
  message: string;
  screenshotPath: string;
  tracePath: string;
  logPath: string;
}
```

- [ ] **Step 2: Extend `DeterministicQaInput`**

Add optional project context:

```ts
passport?: ProjectPassport;
qaCharter?: string;
missionFiles?: Record<string, string>;
```

Import `ProjectPassport` from `@psf/mission-schema`.

- [ ] **Step 3: Build scenarios from passport and charter**

Add:

```ts
export function buildDeterministicScenarios(input: Pick<DeterministicQaInput, "passport" | "qaCharter">): DeterministicScenario[] {
  const flowIds = new Set((input.passport?.core_flows ?? []).map((flow) => flow.id));
  const charter = input.qaCharter ?? "";
  return [
    scenario("smoke_home", "Homepage loads and primary surface is visible", ["open_home"], charter),
    scenario("create_or_start_novel", "Novel project can be created or started", ["create_novel_project", "enter_story_prompt"], charter),
    scenario("generate_or_wait_for_content", "Worldview, outline, and chapter generation reach a stable content state", ["generate_worldview", "generate_outline", "generate_chapter"], charter),
    scenario("review_or_report_visible", "Chapter review report becomes visible", ["review_chapter"], charter),
    scenario("duplicate_click_or_loading_guard", "Repeated generate clicks are guarded by loading or idempotency state", ["generate_chapter"], charter),
  ].map((entry) => ({
    ...entry,
    sourceFlowIds: entry.sourceFlowIds.filter((id) => flowIds.size === 0 || flowIds.has(id)),
  }));
}

function scenario(id: DeterministicScenarioId, title: string, sourceFlowIds: string[], charter: string): DeterministicScenario {
  return {
    id,
    title,
    sourceFlowIds,
    charterReferences: sourceFlowIds.filter((flowId) => charter.includes(flowId) || charter.length > 0),
    selectorStatus: "unverified",
    manualActionWhenUnverified: `Scenario ${id} requires verified ai-novelist selectors before it can be marked passed.`,
  };
}
```

- [ ] **Step 4: Block unverified selectors before real browser pass claims**

After target URL and real gate checks, before `executeRealPlaywright`, add:

```ts
const scenarios = buildDeterministicScenarios(input);
if (input.execute === undefined && realPlaywrightEnabled && scenarios.some((entry) => entry.selectorStatus === "unverified")) {
  const scenarioEvidence = scenarios.map((entry): ScenarioExecutionEvidence => ({
    scenarioId: entry.id,
    status: "blocked",
    message: entry.manualActionWhenUnverified,
    screenshotPath: `${paths.screenshotsDir}/${entry.id}.png`,
    tracePath: paths.tracePath,
    logPath: paths.logPath,
  }));
  return buildResult({
    input,
    now,
    workerRunId,
    qaRunId,
    targetUrl,
    paths,
    status: "blocked",
    qaStatus: "skipped",
    workerStatus: "skipped",
    manualActionRequired: true,
    browserOpened: false,
    stagingVisited: false,
    passed: 0,
    failed: 0,
    logs: scenarioEvidence.map((entry) => `${entry.scenarioId}: ${entry.message}`),
    failures: [],
    workerMode: "dry-run",
    executionSummary: "Deterministic QA requires verified ai-novelist selectors before real browser scenarios can pass.",
    evidence: { scenarios: scenarioEvidence },
  });
}
```

- [ ] **Step 5: Add scenario/evidence details to report and summary**

In `DeterministicQaSummary`, add:

```ts
scenarioCount: number;
manualActionScenarios: string[];
```

In `buildResult`, compute:

```ts
const scenarioEvidence = Array.isArray(input.evidence?.scenarios) ? input.evidence.scenarios : [];
```

Then include safe scenario fields in summary/report. If `input.evidence` contains scenario entries, render them under a `## Scenarios` section.

- [ ] **Step 6: Strengthen bug evidence defaults**

In `createBugReport`, ensure evidence always includes:

```ts
scenarioId: typeof failure.evidence?.scenarioId === "string" ? failure.evidence.scenarioId : "smoke_home",
screenshotPath: typeof failure.evidence?.screenshotPath === "string" ? failure.evidence.screenshotPath : input.paths.screenshotsDir,
tracePath: typeof failure.evidence?.tracePath === "string" ? failure.evidence.tracePath : input.paths.tracePath,
logPath: typeof failure.evidence?.logPath === "string" ? failure.evidence.logPath : input.paths.logPath,
```

- [ ] **Step 7: Export scenario helpers**

In `workers/qa-worker/src/index.ts` export:

```ts
  buildDeterministicScenarios,
  type DeterministicScenario,
  type DeterministicScenarioId,
```

- [ ] **Step 8: Run QA tests**

Run:

```bash
pnpm --filter @psf/qa-worker test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add workers/qa-worker/src/deterministic.ts workers/qa-worker/src/index.ts workers/qa-worker/tests/qa-worker.test.ts
git commit -m "增强 ai-novelist 确定性 QA" -m "新增 deterministic scenario 抽象、未验证 selector 的 manual-action 输出、QA evidence 路径和 schema-valid bug evidence。"
```

### Task 5: Worker Runner QA Integration

**Files:**
- Modify: `apps/worker-runner/src/handlers.ts`
- Modify: `apps/worker-runner/tests/runner.test.ts`

- [ ] **Step 1: Add failing qa.playwright persistence test**

Add this test near existing `qa.playwright` tests:

```ts
it("persists qa.playwright child resources and bug evidence from injected executor", async () => {
  const storage = createInMemoryMissionStorage({
    missions: [mission("mission-qa-playwright-bug", MissionStatus.qa_running)],
    workerRuns: [wrapperRun("worker-run-wrapper", "mission-qa-playwright-bug", "qa.playwright", "job-qa-playwright")],
  });
  const job = buildWorkerJob({
    id: "job-qa-playwright",
    missionId: "mission-qa-playwright-bug",
    projectId: "ai-novelist",
    workerRunId: "worker-run-wrapper",
    type: "qa.playwright",
    mode: "real",
    payload: {
      targetUrl: "http://127.0.0.1:8000",
      qaCharter: "# QA Charter\n\n## Normal Paths\n1. 打开首页\n",
      passport: {
        id: "ai-novelist",
        name: "AI 小说助手",
        repo: { url: "file:///workspaces/mirrors/ai-novelist", default_branch: "main" },
        runtime: { kind: "web" },
        commands: { install: [], test: ["pytest -q"], build: ["npm run build"], run_staging: [], e2e: ["npm run e2e"] },
        urls: { production: "", local: "http://127.0.0.1:8000", staging: "" },
        quality_gates: { require_e2e_tests: true },
        core_flows: [{ id: "open_home", name: "打开首页", priority: "P0" }],
      },
      missionFiles: {
        "mission.md": "# Mission\n",
        "acceptance.md": "# Acceptance\n",
        "technical-notes.md": "# Technical Notes\n",
        "risk-notes.md": "# Risk Notes\n",
      },
    },
    createdAt: "2026-05-31T00:00:00.000Z",
  });

  const wrapper = await processWorkerJob({
    job,
    storage,
    handler: createDefaultJobHandler(process.cwd(), {
      deterministicQaExecute: async (execution) => ({
        status: "failed",
        passed: 1,
        failed: 1,
        browserOpened: true,
        stagingVisited: true,
        logs: ["duplicate click failed"],
        failures: [{
          title: "Duplicate click is not guarded",
          severity: "P1",
          reproductionSteps: ["Open app", "Click generate twice"],
          expectedResult: "One request is accepted.",
          actualResult: "Multiple requests can be triggered.",
          evidence: {
            scenarioId: "duplicate_click_or_loading_guard",
            screenshotPath: `${execution.artifacts.screenshotsDir}/duplicate-click.png`,
            tracePath: execution.artifacts.tracePath,
            logPath: execution.artifacts.logPath,
          },
        }],
      }),
    }),
    now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
  });

  expect(wrapper.status).toBe("succeeded");
  expect(wrapper.output.childBugReportIds).toEqual(expect.arrayContaining([expect.stringContaining("bug-mission-qa-playwright-bug")]));
  await expect(storage.getMission("mission-qa-playwright-bug")).resolves.toMatchObject({ status: MissionStatus.bugs_found });
  const artifacts = await storage.listMissionArtifacts("mission-qa-playwright-bug");
  expect(artifacts.map((artifact) => artifact.type)).toEqual(expect.arrayContaining(["qa_report", "bugs_json", "screenshot", "playwright_trace", "log"]));
});
```

- [ ] **Step 2: Pass full QA context into `runDeterministicPlaywrightQa`**

In `buildDeterministicQaInput`, return:

```ts
const missionFiles = buildMissionFiles(job);
return {
  missionId: job.missionId,
  projectId: job.projectId,
  passport: buildProjectPassport(job),
  qaCharter: stringValue(job.payload.qaCharter) ?? "",
  missionFiles,
  ...(targetUrl ? { targetUrl } : {}),
  env: buildPlaywrightEnv(job),
  ...(deps.deterministicQaExecute ? { execute: deps.deterministicQaExecute } : {}),
};
```

- [ ] **Step 3: Run Worker Runner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/worker-runner/src/handlers.ts apps/worker-runner/tests/runner.test.ts
git commit -m "接入项目级 Playwright QA 队列任务" -m "Worker Runner 将 qa.playwright payload 中的 passport、QA charter、mission files 和 target URL 传给 QA Worker，并验证 child resources 与保守状态推进。"
```

### Task 6: Codex Worker Fixture Proof

**Files:**
- Modify: `workers/codex-worker/tests/codex-worker.test.ts`
- Modify: `workers/codex-worker/src/runner.ts` only if the test proves missing safe output fields

- [ ] **Step 1: Add fixture proof test for no main mutation and no push**

Add this test to the real Codex runner describe block:

```ts
it("proves local fixture execution stays on agent branch, keeps main unchanged, and never pushes", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "psf-workspaces-"));
  const repo = await createWorkspaceMirrorRepo(workspaceRoot);
  const mainBefore = gitOutput(repo, ["rev-parse", "main"]);
  const executable = await createShellExecutable([
    "echo 'fixture codex execution'",
    "git status --short",
    "echo '# changed by fake codex' >> README.md",
    "git add README.md",
    "git commit -m 'local fixture codex change'",
    "exit 0",
  ]);
  const runner = new RealCodexRunner({
    env: {
      ENABLE_REAL_CODEX: "1",
      CODEX_EXECUTABLE: executable,
      PSF_WORKSPACE_ROOT: workspaceRoot,
      PSF_REAL_CODEX_MAX_RUNTIME_MS: "10000",
      CODEX_SANDBOX: "workspace-write",
      CODEX_APPROVAL_MODE: "on-request",
    },
  });

  const result = await runFromMonorepoRoot(() => runner.run(realRequest({
    repoUrl: repo,
    workspaceRoot,
    branchName: "agent/ai-novelist-fixture-proof",
    commands: ["pytest -q", "npm run build"],
  })));

  expect(result.status).toBe("succeeded");
  expect(result.executed).toBe(true);
  expect(result.branchName).toBe("agent/ai-novelist-fixture-proof");
  expect(gitOutput(repo, ["rev-parse", "main"])).toBe(mainBefore);
  expect(gitBranchExists(repo, "agent/ai-novelist-fixture-proof")).toBe(true);
  expect(result.workerRun.metadata).toMatchObject({ pushed: false, realNetworkCall: false });
  expect(result.artifacts.map((artifact) => artifact.type)).toEqual(expect.arrayContaining([
    "codex_stdout",
    "codex_stderr",
    "dev_summary",
    "codex_diff_summary",
    "codex_local_commit_summary",
  ]));
  expect(JSON.stringify(result)).not.toMatch(/token|password|secret-value/i);
});
```

- [ ] **Step 2: Add missing gate tests if absent**

Add a table test for missing executable and missing approval:

```ts
it.each([
  { label: "missing executable", env: { ENABLE_REAL_CODEX: "1" }, request: realRequest(), expected: /CODEX_EXECUTABLE/ },
  { label: "missing approval", env: { ENABLE_REAL_CODEX: "1", CODEX_EXECUTABLE: "/tmp/does-not-matter" }, request: realRequest({ approvalIds: [] }), expected: /approved Approval/ },
])("returns manual-action or blocked for $label", async ({ env, request, expected }) => {
  const runner = new RealCodexRunner({ env });
  const result = await runner.run(request);
  expect(["blocked", "manual_action"]).toContain(result.status);
  expect(result.executed).toBe(false);
  expect(result.reason).toMatch(expected);
});
```

- [ ] **Step 3: Run Codex tests**

Run:

```bash
pnpm --filter @psf/codex-worker test
```

Expected: PASS. If the fixture test shows missing output fields, update `workers/codex-worker/src/runner.ts` to add only the missing safe metadata and artifact fields.

- [ ] **Step 4: Commit**

```bash
git add workers/codex-worker/tests/codex-worker.test.ts workers/codex-worker/src/runner.ts
git commit -m "验证本地 Codex 安全执行" -m "新增 fixture repo proof，验证 agent worktree、本地提交摘要、main 未修改、无 push、无外部调用和 secret redaction。"
```

### Task 7: Orchestrator Codex Payload Tests And Implementation

**Files:**
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `apps/orchestrator-api/src/services.ts`

- [ ] **Step 1: Add failing codex-real payload test**

Add near the existing `queues gated real actions` tests:

```ts
it("queues codex-real with local mirror, branch, workspace, mission files, passport, and safe commands", async () => {
  await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_CODEX: "true", PSF_WORKSPACE_ROOT: "/tmp/psf-workspaces" }, async () => {
    const workerRuntime = new InProcessWorkerRuntime();
    const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime });
    await seedDemoMission(storage);
    const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

    const response = await server.inject({
      method: "POST",
      url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
      payload: {
        approvalId: approval.id,
        repoUrl: "file:///tmp/psf-workspaces/mirrors/ai-novelist",
        branchName: "agent/ai-novelist-mission-0001",
        workspaceRoot: "/tmp/psf-workspaces",
      },
    });

    expect(response.statusCode).toBe(202);
    const jobs = await workerRuntime.listJobs();
    expect(jobs[0]?.job.payload).toMatchObject({
      passport: expect.objectContaining({ id: "ai-novelist" }),
      repoUrl: "file:///tmp/psf-workspaces/mirrors/ai-novelist",
      defaultBranch: "main",
      branchName: "agent/ai-novelist-mission-0001",
      workspaceRoot: "/tmp/psf-workspaces",
      approvalIds: ["real_codex_execution"],
      missionFiles: expect.objectContaining({
        "mission.md": expect.any(String),
        "acceptance.md": expect.any(String),
        "technical-notes.md": expect.any(String),
        "risk-notes.md": expect.any(String),
      }),
      commands: expect.arrayContaining([expect.any(String)]),
    });
  });
});
```

- [ ] **Step 2: Adjust service context if Task 2 did not satisfy the test**

Use the `buildGatedRealJobContext` from Task 2. Ensure `commands` removes empty strings and preserves only passport command values:

```ts
const commands = uniqueStrings([
  ...normalizeCommandList(passport.commands.test),
  ...normalizeCommandList(passport.commands.build),
  ...normalizeCommandList(passport.commands.lint),
  ...normalizeCommandList(passport.commands.e2e),
]);
```

Add:

```ts
function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
```

- [ ] **Step 3: Run API tests**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "补齐 Codex 入队项目上下文" -m "为 codex-real 队列任务加入本地 mirror、agent branch、workspace root、mission files、passport 和安全命令列表。"
```

### Task 8: Worker Runner Codex Integration

**Files:**
- Modify: `apps/worker-runner/src/handlers.ts`
- Modify: `apps/worker-runner/tests/runner.test.ts`

- [ ] **Step 1: Add codex.real persistence test**

Add:

```ts
it("persists codex.real child WorkerRun and artifacts from injected runner", async () => {
  const storage = createInMemoryMissionStorage({
    missions: [mission("mission-codex-real", MissionStatus.dev_running)],
    workerRuns: [wrapperRun("worker-run-wrapper", "mission-codex-real", "codex.real", "job-codex-real")],
  });
  const child = workerRun("worker-run-mission-codex-real-codex", "codex", "succeeded", "real");
  const childArtifact = artifact("artifact-mission-codex-real-dev-summary", child.id, "dev_summary");
  const job = buildWorkerJob({
    id: "job-codex-real",
    missionId: "mission-codex-real",
    projectId: "ai-novelist",
    workerRunId: "worker-run-wrapper",
    type: "codex.real",
    mode: "real",
    payload: {
      repoUrl: "file:///tmp/psf-workspaces/mirrors/ai-novelist",
      defaultBranch: "main",
      branchName: "agent/ai-novelist-mission-codex-real",
      workspaceRoot: "/tmp/psf-workspaces",
      commands: ["pytest -q"],
      missionFiles: {
        "mission.md": "# Mission\n",
        "acceptance.md": "# Acceptance\n",
        "technical-notes.md": "# Technical Notes\n",
        "risk-notes.md": "# Risk Notes\n",
      },
      approvalIds: ["real_codex_execution"],
    },
    createdAt: "2026-05-31T00:00:00.000Z",
  });

  const wrapper = await processWorkerJob({
    job,
    storage,
    handler: createDefaultJobHandler(process.cwd(), {
      codexRunner: {
        run: async () => ({
          status: "succeeded",
          executed: true,
          reason: "Fixture Codex completed safely.",
          workerRun: child,
          artifacts: [childArtifact],
          events: [event("codex.real.succeeded")],
          stdout: "",
          stderr: "",
          exitCode: 0,
          workspacePath: "/tmp/psf-workspaces/ai-novelist/mission-codex-real",
          branchName: "agent/ai-novelist-mission-codex-real",
        }),
      },
    }),
    now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
  });

  expect(wrapper.status).toBe("succeeded");
  expect(wrapper.output.childWorkerRunIds).toEqual([child.id]);
  expect(wrapper.output.childArtifactIds).toEqual([childArtifact.id]);
  await expect(storage.getWorkerRun(child.id)).resolves.toMatchObject({ worker_type: "codex", mode: "real" });
  await expect(storage.getArtifact(childArtifact.id)).resolves.toMatchObject({ type: "dev_summary" });
});
```

- [ ] **Step 2: Ensure `buildCodexRealInput` uses enriched payload**

In `apps/worker-runner/src/handlers.ts`, make sure the returned input includes:

```ts
repoUrl: stringValue(payload.repoUrl) ?? passport.repo.url,
defaultBranch: stringValue(payload.defaultBranch) ?? passport.repo.default_branch,
missionFiles: buildMissionFiles(job),
approvalIds: stringArray(payload.approvalIds),
commands: stringArray(payload.commands),
branchName: stringValue(payload.branchName) ?? `agent/${passport.id}-${job.missionId}`,
workspaceRoot: stringValue(payload.workspaceRoot) ?? path.join(cwd, "workspaces"),
```

- [ ] **Step 3: Run Worker Runner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/worker-runner/src/handlers.ts apps/worker-runner/tests/runner.test.ts
git commit -m "接入 Codex 真实队列结果持久化" -m "Worker Runner 复用 codex.real runner 输入与 child resource 持久化，保持 wrapper WorkerRun 语义不变。"
```

### Task 9: Hub Evidence Visibility

**Files:**
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Add visibility test**

In `apps/hub/tests/hub.test.tsx`, extend the Mission Detail fixture with a QARun that has:

```ts
screenshots_dir: "artifacts/missions/mission-0001/worker-run-qa/qa/screenshots",
trace_path: "artifacts/missions/mission-0001/worker-run-qa/qa/trace.zip",
bugs_json_path: "artifacts/missions/mission-0001/worker-run-qa/qa/bugs.json",
```

Add an assertion in the Mission Detail render test:

```ts
expect(text).toContain("artifacts/missions/mission-0001/worker-run-qa/qa/screenshots");
expect(text).toContain("artifacts/missions/mission-0001/worker-run-qa/qa/trace.zip");
expect(text).toContain("artifacts/missions/mission-0001/worker-run-qa/qa/bugs.json");
```

- [ ] **Step 2: Render screenshot and bugs paths**

In `renderQaRunDetail`, add:

```tsx
{run.screenshots_dir ? <span>{run.screenshots_dir}</span> : null}
{run.bugs_json_path ? <span>{run.bugs_json_path}</span> : null}
```

- [ ] **Step 3: Run Hub tests**

Run:

```bash
pnpm --filter @psf/hub test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/src/App.tsx apps/hub/tests/hub.test.tsx
git commit -m "展示 QA 证据路径" -m "Mission Detail 在 QARun detail 中展示 screenshot、trace 和 bugs.json artifact path，不引入前端业务逻辑。"
```

### Task 10: Documentation

**Files:**
- Modify: `docs/progress.md`
- Create: `docs/progress/batch-03-04-qa-and-local-codex.md`
- Modify: `docs/api.md`
- Modify: `docs/safety.md`
- Modify: `docs/queue-runtime.md`
- Modify: `README.md`

- [ ] **Step 1: Create Batch 3/4 progress doc**

Create `docs/progress/batch-03-04-qa-and-local-codex.md` with:

```md
# Batch 3/4 Progress: ai-novelist QA And Local Codex

## Completed

- Deterministic QA now receives project passport, QA charter, mission files, target URL, and e2e command metadata through Orchestrator queued payloads.
- QA Worker now models ai-novelist deterministic scenarios and returns blocked/manual-action evidence when selectors are unverified.
- QA evidence includes qa-report.md, bugs.json, qa-summary.json, screenshot path, trace path, and log path.
- Codex real runner fixture tests prove local mirror/worktree/agent branch execution, no main/master mutation, no push, and secret redaction.
- Worker Runner persists child WorkerRun/QARun/Artifact/Bug/MissionEvent resources for qa.playwright and codex.real.

## Safety Boundary

- No push, PR creation, deployment, monitor creation, Plane sync, provider API call, or AI provider call was enabled.
- Real ai-novelist QA still requires an operator-prepared target URL and verified selectors.
- Real Codex still requires an operator-prepared local mirror, approval, absolute CODEX_EXECUTABLE, safe workspace root, and safe commands.

## Verification

```bash
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/hub test
pnpm typecheck
pnpm test
pnpm build
```

## Manual Preparation Still Required

- Prepare a local ai-novelist mirror under `PSF_WORKSPACE_ROOT/mirrors`.
- Start a real local or staging ai-novelist URL.
- Verify real UI selectors before expecting deterministic QA scenarios to pass.
- Provide local-only approvals and `CODEX_EXECUTABLE` before real Codex execution.
```

- [ ] **Step 2: Update docs/progress.md**

Add a latest update paragraph referencing the new progress file and stating no external calls were made.

- [ ] **Step 3: Update docs/api.md**

Document:

```md
`POST /missions/:id/actions/qa-playwright` queues `qa.playwright` with passport, qaCharter, missionFiles, targetUrl, and e2e command metadata. Missing target URL returns `MISSION_ACTION_PREFLIGHT_BLOCKED`.

`POST /missions/:id/actions/codex-real` queues `codex.real` with local repoUrl, branchName, workspaceRoot, missionFiles, passport, commands, and approval ids. Remote clone/update and push are not part of this route.
```

- [ ] **Step 4: Update safety and queue docs**

Add a short section:

```md
Batch 3/4 keeps real work gated. Deterministic QA must not mark unverified ai-novelist selectors as passed. Codex real runner accepts only local mirrors under `PSF_WORKSPACE_ROOT/mirrors`, creates `agent/*` worktrees, refuses main/master, and keeps push disabled.
```

- [ ] **Step 5: Update README**

Add a short current-scope note:

```md
Batch 3/4 adds project-level deterministic QA context and fixture-proven local Codex safety. Operators still need a local ai-novelist mirror, target URL, verified selectors, approvals, and an absolute Codex executable before any real local execution can pass.
```

- [ ] **Step 6: Commit docs**

```bash
git add README.md docs/progress.md docs/progress/batch-03-04-qa-and-local-codex.md docs/api.md docs/safety.md docs/queue-runtime.md
git commit -m "记录 Batch 3/4 进展" -m "更新 QA evidence、Codex local mirror、queued payload、安全边界和人工准备事项文档。"
```

### Task 11: Final Verification

**Files:**
- No source files modified in this task unless verification exposes a defect.

- [ ] **Step 1: Run focused worker/API checks**

Run:

```bash
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/worker-runner test
```

Expected: all PASS.

- [ ] **Step 2: Run Hub checks if Task 9 changed Hub**

Run:

```bash
pnpm --filter @psf/hub test
pnpm build
```

Expected: PASS. If `pnpm build` reports existing non-fatal Turborepo warnings with exit code 0, record the warning in the final summary.

- [ ] **Step 3: Run broad gates**

Run:

```bash
pnpm typecheck
pnpm test
git diff --check
git status --short --branch
```

Expected: typecheck and tests pass; `git diff --check` has no output; status shows clean working tree on the implementation branch or local `main` with unpushed commits only.

- [ ] **Step 4: Final commit if verification fixes were needed**

If verification required fixes, commit them:

```bash
git add <fixed-files>
git commit -m "修复 Batch 3/4 验收问题" -m "修复最终验证发现的类型、测试或文档问题，保持无 push、无外部调用、无部署边界。"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: Tasks 1-2 cover Orchestrator payload, Tasks 3-5 cover deterministic QA and Worker Runner persistence, Tasks 6-8 cover gated local Codex and Worker Runner persistence, Task 9 covers Hub visibility, Task 10 covers docs, and Task 11 covers verification.
- 占位扫描：本计划不保留未定事项或未完成实现标记。
- Type consistency: job types use existing `qa.playwright` and `codex.real`; wrapper/child ids stay in existing `WorkerJobHandlerResult`; Mission transitions remain delegated to existing Worker Runner and `mission-core`.
