# B3 Contract Safety Test Reinforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focused B3 contract tests and the smallest production-code fixes needed to lock readiness/blocker safety gaps left after B2.

**Architecture:** Keep Orchestrator API as the canonical response outlet and preserve the B2 duplicated local types in Hub, Worker Runner, and integrations. Add tests only at the high-risk API, Hub, and Worker Runner boundaries; integrations and auto-fix-loop remain covered by existing tests unless a new B3 assertion exposes a real gap.

**Tech Stack:** TypeScript monorepo, Vitest, Fastify Orchestrator API, React/Vite Hub, Worker Runner, pnpm workspaces.

---

## File Structure

- Modify `apps/orchestrator-api/tests/api.test.ts`: add B3 contract tests for `codex-real` 400 preflight readiness shape, redaction, and safety flags.
- Modify `apps/orchestrator-api/src/services.ts`: only if tests fail, route `codex-real` local mirror and branch preflight errors through existing `buildReadinessBlocker`, `deriveReadinessState`, `blockedPreflightDetails`, and `sanitizeApiResponse` paths.
- Modify `apps/hub/tests/hub.test.tsx`: add B3 contract tests for `canQueue` priority and API blocker order rendering.
- Modify `apps/hub/src/App.tsx`: only if tests fail, keep `canQueue` as the button guard when present and render `blockers[]` directly in API order.
- Modify `apps/worker-runner/tests/runner.test.ts`: strengthen `codex.real` defense-in-depth tests for remote repo and unsafe branch blocker shape.
- Modify `apps/worker-runner/src/handlers.ts` or `apps/worker-runner/src/readiness-blockers.ts`: only if tests fail, ensure defense-in-depth results emit execute-only policy blockers while preserving queue semantics.
- Modify `docs/debug/debug.md`: record B3 implementation verification results after running tests.
- Modify `summary.md`: only if a later implementation task adds, moves, renames, or deletes Markdown. This plan already updates the document map for itself.

Do not modify `packages/integrations/tests/integrations.test.ts` unless one of the B3 boundary tests proves an integration assertion is insufficient. Do not modify `packages/auto-fix-loop/tests/auto-fix-loop.test.ts`; its regression and safety coverage is already sufficient for B3.

### Task 1: Orchestrator API 400 Preflight Contract

**Files:**
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify if needed: `apps/orchestrator-api/src/services.ts`

- [ ] **Step 1: Add the local mirror preflight contract test**

In `apps/orchestrator-api/tests/api.test.ts`, place this test immediately after the existing test named `blocks codex-real preflight instead of using a GitHub HTTPS repo URL when no local mirror is provided`:

```ts
  it("returns canonical blockers and redacted details for codex-real local mirror preflight", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const fakeSecret = "b3-api-preflight-secret";
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
        PSF_LOCAL_REPO_ai_novelist: `https://github.example/ai-novelist.git?token=${fakeSecret}`,
      }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: {
            approvalId: approval.id,
            repoUrl: `https://github.com/example/ai-novelist.git?token=${fakeSecret}`,
            workspaceRoot: `/tmp/${fakeSecret}`,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({
            action: "codex-real",
            missingLocalMirror: true,
            canQueue: false,
            canExecute: false,
            realNetworkCall: false,
            realExternalCall: false,
            realPush: false,
            realDeploy: false,
            recommendedNextAction: expect.stringContaining("repoUrl"),
          }),
        });
        expect(body.details.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({
            category: "policy",
            key: "policy.codex.local_mirror_required",
            severity: "blocking",
            blocks: ["queue", "execute"],
            source: "orchestrator",
            details: expect.objectContaining({ action: "codex-real", missingLocalMirror: true }),
          }),
        ]));
        expect(JSON.stringify(body)).not.toContain(fakeSecret);
        expect(await workerRuntime.listJobs()).toHaveLength(0);
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run the focused API test and observe the contract gap**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'canonical blockers and redacted details for codex-real local mirror preflight'
```

Expected before implementation: FAIL because the current local mirror preflight error does not expose the full canonical readiness fields and stable blocker key.

- [ ] **Step 3: Route local mirror preflight through the readiness builder**

In `apps/orchestrator-api/src/services.ts`, replace `assertCodexLocalRepoUrlAvailable` with this implementation:

```ts
  function assertCodexLocalRepoUrlAvailable(mission: Mission, registryProject: RegistryProject, repoUrl: string | undefined) {
    if (repoUrl && isLocalRepoUrl(repoUrl)) {
      return;
    }
    throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", "codex-real requires an explicitly provided local repository mirror; GitHub HTTPS/SSH remotes are not accepted as real Codex repoUrl values.", blockedPreflightDetails(buildReadinessBlocker({
      category: "policy",
      key: "policy.codex.local_mirror_required",
      message: "codex-real requires an operator-provided local repository mirror; remote repository URLs are not accepted for execution preflight.",
      recommendedNextAction: `Provide repoUrl in the request body, or set ${localRepoEnvName(registryProject.project.id)} to a local mirror path under operator control.`,
      severity: "blocking",
      blocks: ["queue", "execute"],
      source: "orchestrator",
      details: { action: "codex-real", missingLocalMirror: true },
    }), {
      missionId: mission.id,
      projectId: mission.project_id,
      passportPath: registryProject.passportPath,
      action: "codex-real",
      missingLocalMirror: true,
    }));
  }
```

Do not add `repoUrl`, `workspaceRoot`, token values, raw request bodies, provider payloads, stdout, or stderr into blocker `details`.

- [ ] **Step 4: Verify the local mirror preflight test passes**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'canonical blockers and redacted details for codex-real local mirror preflight'
```

Expected after implementation: PASS.

- [ ] **Step 5: Add the unsafe branch preflight contract test**

In `apps/orchestrator-api/tests/api.test.ts`, place this test after the local mirror preflight contract test:

```ts
  it("returns canonical blockers for codex-real unsafe branch preflight", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "psf-codex-workspaces-"));
    const localMirror = join(workspaceRoot, "mirrors", "ai-novelist.git");
    await mkdir(localMirror, { recursive: true });
    try {
      await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_CODEX: "true" }, async () => {
        const workerRuntime = new InProcessWorkerRuntime();
        const { server, storage } = await createTestServer({ auth: { disabled: true }, workerRuntime, registryRoot });
        await seedDemoMission(storage);
        const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

        const response = await server.inject({
          method: "POST",
          url: `/missions/${EXAMPLE_MISSION_ID}/actions/codex-real`,
          payload: { approvalId: approval.id, repoUrl: localMirror, workspaceRoot, branchName: "main" },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body).toMatchObject({
          code: "MISSION_ACTION_PREFLIGHT_BLOCKED",
          details: expect.objectContaining({
            action: "codex-real",
            invalidBranchName: "main",
            canQueue: false,
            canExecute: false,
            realNetworkCall: false,
            realExternalCall: false,
            realPush: false,
            realDeploy: false,
          }),
        });
        expect(body.details.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({
            category: "policy",
            key: "policy.codex.branch_policy",
            severity: "blocking",
            blocks: ["queue", "execute"],
            source: "orchestrator",
            details: expect.objectContaining({ action: "codex-real", invalidBranchName: "main" }),
          }),
        ]));
        expect(await workerRuntime.listJobs()).toHaveLength(0);
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 6: Run the unsafe branch test and observe the contract gap**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'canonical blockers for codex-real unsafe branch preflight'
```

Expected before implementation: FAIL because the current branch preflight error does not expose the full canonical readiness fields and stable blocker key.

- [ ] **Step 7: Route branch preflight through the readiness builder**

In `apps/orchestrator-api/src/services.ts`, replace `assertCodexBranchNameAllowed` with this implementation:

```ts
  function assertCodexBranchNameAllowed(mission: Mission, branchName: string) {
    if (branchName === "main" || branchName === "master" || !branchName.startsWith("agent/")) {
      throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", "codex-real branchName must be under agent/ and cannot be main or master.", blockedPreflightDetails(buildReadinessBlocker({
        category: "policy",
        key: "policy.codex.branch_policy",
        message: "codex-real branchName must be under agent/ and cannot be main or master.",
        recommendedNextAction: "Use a branch name such as agent/<project>-<mission> for real Codex work.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: "codex-real", invalidBranchName: branchName },
      }), {
        missionId: mission.id,
        projectId: mission.project_id,
        action: "codex-real",
        invalidBranchName: branchName,
      }));
    }
  }
```

- [ ] **Step 8: Run focused API tests for this task**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'codex-real .*preflight'
```

Expected: PASS for the existing and new `codex-real` preflight tests. No WorkerRun or queue job should be created by blocked preflight responses.

- [ ] **Step 9: Commit Task 1**

```bash
git add apps/orchestrator-api/tests/api.test.ts apps/orchestrator-api/src/services.ts
git commit -m "补强 API 预检阻塞合同" -m "为 codex-real 本地镜像和分支策略预检补充 canonical readiness blockers、redacted details 和默认安全 flags。" -m "未启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync。"
```

### Task 2: Hub `canQueue` Priority And API Blocker Order

**Files:**
- Modify: `apps/hub/tests/hub.test.tsx`
- Modify if needed: `apps/hub/src/App.tsx`

- [ ] **Step 1: Add the `canQueue` priority test**

In `apps/hub/tests/hub.test.tsx`, add this test near the existing Mission detail readiness tests:

```ts
  it("uses canQueue instead of legacy safeToRun for guarded real-action buttons", () => {
    const baseEntry = (entry: {
      key: RealModeReadinessKey;
      label: string;
      action: MissionActionKind;
    }) => ({
      key: entry.key,
      label: entry.label,
      action: entry.action,
      enabled: false,
      configured: true,
      ready: false,
      safeToRun: false,
      canQueue: false,
      canExecute: false,
      realNetworkCall: false as const,
      missingEnv: [],
      requiredApprovalTypes: [],
      approvedApprovalTypes: [],
      missingApprovalTypes: [],
      message: "Manual action required.",
    });
    const onRunAction = vi.fn();
    const queueableManualActionSummary: MissionSummaryResponse = {
      ...missionSummary,
      realModeReadiness: {
        codex: baseEntry({ key: "codex", label: "Codex real execution", action: "codex-real" }),
        qaPlaywright: baseEntry({ key: "qaPlaywright", label: "Playwright QA", action: "qa-playwright" }),
        qaAiExploratory: baseEntry({ key: "qaAiExploratory", label: "AI exploratory QA", action: "qa-ai-exploratory" }),
        fix: baseEntry({ key: "fix", label: "Real fix loop", action: "fix-real" }),
        github: {
          ...baseEntry({ key: "github", label: "GitHub PR", action: "github-pr" }),
          safeToRun: false,
          canQueue: true,
          canExecute: false,
          realExternalCall: false as const,
          realPush: false as const,
          realDeploy: false as const,
          recommendedNextAction: "Review PR preview/manual-action output; no push or PR creation will occur.",
          blockers: [{
            category: "execution",
            key: "execution.github.injected_transport_missing",
            message: "Default GitHub PR path has no injected transport.",
            recommendedNextAction: "Review PR preview/manual-action output; no push or PR creation will occur.",
            severity: "manual_action",
            blocks: ["execute"],
            source: "orchestrator",
          }],
        },
        coolify: baseEntry({ key: "coolify", label: "Coolify staging deploy", action: "deploy-staging" }),
        uptimeKuma: baseEntry({ key: "uptimeKuma", label: "Uptime Kuma monitor sync", action: "monitor-sync" }),
        plane: baseEntry({ key: "plane", label: "Plane sync", action: "plane-sync" }),
      },
    };

    const view = renderMissionDetailView({
      state: { status: "success", data: queueableManualActionSummary },
      actions: { onRunAction, onRefresh: vi.fn() },
      actionState: { loading: "", message: "", error: "" },
    });

    const button = findButtonByText(view, "Create PR preview/manual-action");
    expect(button.props.disabled).toBe(false);
    expect(textFromElement(view)).not.toContain("Run real");
    button.props.onClick?.();
    expect(onRunAction).toHaveBeenCalledWith("github-pr", {});
  });
```


- [ ] **Step 2: Run the focused Hub test**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'uses canQueue instead of legacy safeToRun'
```

Expected: PASS if current Hub already uses `entry.canQueue ?? entry.safeToRun`; FAIL if a regression has restored `safeToRun` as the primary guard.

- [ ] **Step 3: Fix Hub button guard only if Step 2 fails**

If Step 2 fails because the button is disabled, replace the guarded-action map in `apps/hub/src/App.tsx` with this logic:

```tsx
        {guardedRealActions.map((entry) => {
          const canQueue = entry.canQueue ?? entry.safeToRun;
          const blockers = entry.blockers ?? [];
          const title = [entry.recommendedNextAction ?? entry.message, ...blockers.map((blocker) => blocker.message)].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              key={entry.action}
              disabled={busy || !canQueue}
              onClick={() => void actions.onRunAction(entry.action, {})}
              title={title}
            >
              {realActionButtonLabel(entry)}
            </button>
          );
        })}
```

Do not add local env, approval, transport, or provider inference in Hub.

- [ ] **Step 4: Add the API blocker order rendering test**

In `apps/hub/tests/hub.test.tsx`, add this test near the previous new Hub test:

```ts
  it("renders readiness blockers in API-provided order", () => {
    const orderedSummary: MissionSummaryResponse = {
      ...missionSummary,
      realModeReadiness: {
        codex: {
          key: "codex",
          label: "Codex real execution",
          action: "codex-real",
          enabled: true,
          configured: true,
          ready: true,
          safeToRun: false,
          canQueue: true,
          canExecute: false,
          realNetworkCall: false,
          realExternalCall: false,
          realPush: false,
          realDeploy: false,
          missingEnv: [],
          requiredApprovalTypes: ["SECURITY_RISK"],
          approvedApprovalTypes: ["SECURITY_RISK"],
          missingApprovalTypes: [],
          recommendedNextAction: "Use API blocker order.",
          blockers: [
            {
              category: "execution",
              key: "execution.second_from_api",
              message: "Second blocker from API order.",
              recommendedNextAction: "Review second blocker.",
              severity: "manual_action",
              blocks: ["execute"],
              source: "orchestrator",
            },
            {
              category: "policy",
              key: "policy.first_by_sort_but_second_by_api",
              message: "Policy blocker appears second in API order.",
              recommendedNextAction: "Review policy blocker.",
              severity: "blocking",
              blocks: ["execute"],
              source: "orchestrator",
            },
          ],
          message: "Manual action required.",
        },
        qaPlaywright: {
          key: "qaPlaywright",
          label: "Playwright QA",
          action: "qa-playwright",
          enabled: false,
          configured: true,
          ready: false,
          safeToRun: false,
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          missingEnv: [],
          message: "Manual action required.",
        },
        qaAiExploratory: {
          key: "qaAiExploratory",
          label: "AI exploratory QA",
          action: "qa-ai-exploratory",
          enabled: false,
          configured: true,
          ready: false,
          safeToRun: false,
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          missingEnv: [],
          message: "Manual action required.",
        },
        fix: {
          key: "fix",
          label: "Real fix loop",
          action: "fix-real",
          enabled: false,
          configured: true,
          ready: false,
          safeToRun: false,
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          missingEnv: [],
          message: "Manual action required.",
        },
        github: {
          key: "github",
          label: "GitHub PR",
          action: "github-pr",
          enabled: false,
          configured: false,
          ready: false,
          safeToRun: false,
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          missingEnv: [],
          message: "Manual action required.",
        },
        coolify: {
          key: "coolify",
          label: "Coolify staging deploy",
          action: "deploy-staging",
          enabled: false,
          configured: false,
          ready: false,
          safeToRun: false,
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          missingEnv: [],
          message: "Manual action required.",
        },
        uptimeKuma: {
          key: "uptimeKuma",
          label: "Uptime Kuma monitor sync",
          action: "monitor-sync",
          enabled: false,
          configured: false,
          ready: false,
          safeToRun: false,
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          missingEnv: [],
          message: "Manual action required.",
        },
        plane: {
          key: "plane",
          label: "Plane sync",
          action: "plane-sync",
          enabled: false,
          configured: false,
          ready: false,
          safeToRun: false,
          canQueue: false,
          canExecute: false,
          realNetworkCall: false,
          missingEnv: [],
          message: "Manual action required.",
        },
      },
    };

    const view = renderMissionDetailView({
      state: { status: "success", data: orderedSummary },
      actions: { onRunAction: vi.fn(), onRefresh: vi.fn() },
      actionState: { loading: "", message: "", error: "" },
    });
    const text = textFromElement(view);

    expect(text.indexOf("Second blocker from API order.")).toBeLessThan(text.indexOf("Policy blocker appears second in API order."));
  });
```

- [ ] **Step 5: Run the focused blocker-order test**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'renders readiness blockers in API-provided order'
```

Expected: PASS if Hub maps `entry.blockers` directly. If it fails, remove local sorting and render `entry.blockers ?? []` directly.

- [ ] **Step 6: Run focused Hub readiness tests**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'real-mode readiness|canQueue|API-provided order'
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/hub/tests/hub.test.tsx apps/hub/src/App.tsx
git commit -m "补强 Hub 就绪合同测试" -m "锁定 Hub 使用 canQueue 而非 legacy safeToRun 控制 gated action 按钮，并按 API 返回顺序展示 blockers。" -m "未启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync。"
```

If `apps/hub/src/App.tsx` did not change because both tests already passed, omit it from `git add`:

```bash
git add apps/hub/tests/hub.test.tsx
git commit -m "补强 Hub 就绪合同测试" -m "锁定 Hub 使用 canQueue 而非 legacy safeToRun 控制 gated action 按钮，并按 API 返回顺序展示 blockers。" -m "本提交只新增 Hub contract tests，现有 production code 已满足合同。"
```

### Task 3: Worker Runner Defense-In-Depth Blocker Semantics

**Files:**
- Modify: `apps/worker-runner/tests/runner.test.ts`
- Modify if needed: `apps/worker-runner/src/readiness-blockers.ts`
- Modify if needed: `apps/worker-runner/src/handlers.ts`

- [ ] **Step 1: Strengthen the remote repo defense-in-depth test**

In `apps/worker-runner/tests/runner.test.ts`, replace the current parameterized test named `blocks codex.real %s before calling injected runner` with this explicit test:

```ts
  it("reports codex.real remote repo defense-in-depth as execute-only policy blocker", async () => {
    let runnerCalls = 0;
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
      payload: { repoUrl: "https://github.com/example/ai-novelist.git", branchName: "agent/mission-real" },
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        codexRunner: {
          run: async () => {
            runnerCalls += 1;
            return codexResult("succeeded", "Should not run.");
          },
        },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(runnerCalls).toBe(0);
    expect(wrapper.output).toMatchObject({
      status: "manual_action",
      manualActionRequired: true,
      canQueue: true,
      canExecute: false,
      blockers: [expect.objectContaining({
        category: "policy",
        key: "policy.codex.local_mirror_required",
        severity: "blocking",
        blocks: ["execute"],
        source: "worker_runner",
      })],
    });
    expect(String(wrapper.output.reason)).toContain("codex.real queued job requires local repoUrl");
    const events = await storage.listMissionEvents("mission-real");
    const actionResult = events.find((event) => event.type === "mission.action_result");
    expect(actionResult?.payload).toMatchObject({
      canQueue: true,
      canExecute: false,
      blockers: [expect.objectContaining({ key: "policy.codex.local_mirror_required", blocks: ["execute"] })],
    });
    await expect(storage.getMission("mission-real")).resolves.toMatchObject({ status: MissionStatus.fixing });
  });
```

- [ ] **Step 2: Add the unsafe branch defense-in-depth test**

Add this test next to the remote repo test:

```ts
  it("reports codex.real unsafe branch defense-in-depth as execute-only policy blocker", async () => {
    let runnerCalls = 0;
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
      payload: { repoUrl: "/tmp/ai-novelist.git", branchName: "main" },
      createdAt: "2026-05-31T00:00:00.000Z",
    });

    const wrapper = await processWorkerJob({
      job,
      storage,
      handler: createDefaultJobHandler(process.cwd(), {
        codexRunner: {
          run: async () => {
            runnerCalls += 1;
            return codexResult("succeeded", "Should not run.");
          },
        },
      }),
      now: sequenceNow(["2026-05-31T00:01:00.000Z", "2026-05-31T00:02:00.000Z"]),
    });

    expect(runnerCalls).toBe(0);
    expect(wrapper.output).toMatchObject({
      status: "manual_action",
      manualActionRequired: true,
      canQueue: true,
      canExecute: false,
      blockers: [expect.objectContaining({
        category: "policy",
        key: "policy.codex.branch_policy",
        severity: "blocking",
        blocks: ["execute"],
        source: "worker_runner",
      })],
    });
    expect(String(wrapper.output.reason)).toContain("codex.real branchName must be under agent/");
    const events = await storage.listMissionEvents("mission-real");
    const actionResult = events.find((event) => event.type === "mission.action_result");
    expect(actionResult?.payload).toMatchObject({
      canQueue: true,
      canExecute: false,
      blockers: [expect.objectContaining({ key: "policy.codex.branch_policy", blocks: ["execute"] })],
    });
    await expect(storage.getMission("mission-real")).resolves.toMatchObject({ status: MissionStatus.fixing });
  });
```

- [ ] **Step 3: Run focused Worker Runner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'defense-in-depth as execute-only policy blocker'
```

Expected: PASS if the current mapper already emits execute-only policy blockers. FAIL if wrapper output or `mission.action_result` omits `canQueue`, `canExecute`, or `blockers` for these paths.

- [ ] **Step 4: Fix Worker Runner blocker mapping only if Step 3 fails**

If the remote repo or unsafe branch tests fail, inspect `codexManualActionBlocker` in `apps/worker-runner/src/readiness-blockers.ts`. It must keep this behavior:

```ts
export function codexManualActionBlocker(reason: string): WorkerReadinessBlocker {
  const key = codexBlockerKey(reason);
  const policyBlocker = key.startsWith("policy.");
  return {
    category: policyBlocker ? "policy" : "execution",
    key,
    message: reason,
    recommendedNextAction: codexRecommendedNextActionForKey(key),
    severity: policyBlocker ? "blocking" : "manual_action",
    blocks: ["execute"],
    source: "worker_runner",
    details: { jobType: "codex.real", defenseInDepth: policyBlocker },
  };
}
```

If key inference is wrong, replace `codexBlockerKey` with:

```ts
function codexBlockerKey(reason: string): WorkerReadinessBlocker["key"] {
  const lowerReason = reason.toLowerCase();
  if (reason.includes("repoUrl")) {
    return "policy.codex.local_mirror_required";
  }
  if (reason.includes("branchName")) {
    return "policy.codex.branch_policy";
  }
  if (lowerReason.includes("injected codex runner") || lowerReason.includes("no injected codex runner")) {
    return "execution.codex.injected_runner_missing";
  }
  return "execution.codex.unclassified_execution_blocker";
}
```

If wrapper output or `mission.action_result` omits readiness fields, do not change lifecycle logic. Confirm `toCodexRealHandlerResult` in `apps/worker-runner/src/handlers.ts` returns `canQueue`, `canExecute`, and `blockers` from `deriveWorkerReadiness`, and confirm `apps/worker-runner/src/runner.ts` already copies those fields into `buildSafeOutput` and `recordMissionActionResult`.

- [ ] **Step 5: Run Worker Runner contract tests**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'codex.real|github.pr|canonical blockers'
```

Expected: PASS. The blocked/manual-action paths must not transition Mission to `ready_for_review`, `released`, or any other success state.

- [ ] **Step 6: Commit Task 3**

If production code changed:

```bash
git add apps/worker-runner/tests/runner.test.ts apps/worker-runner/src/readiness-blockers.ts apps/worker-runner/src/handlers.ts
git commit -m "补强 Worker Runner 阻塞合同" -m "锁定已入队 codex.real defense-in-depth policy blocker 只阻塞 execute，并同步 wrapper output 与 mission.action_result。" -m "未改变 WorkerRun lifecycle、Mission auto-transition、queue semantics 或真实外部动作默认禁用边界。"
```

If only tests changed:

```bash
git add apps/worker-runner/tests/runner.test.ts
git commit -m "补强 Worker Runner 阻塞合同测试" -m "锁定已入队 codex.real defense-in-depth policy blocker 只阻塞 execute；现有 production code 已满足合同。" -m "未改变 WorkerRun lifecycle、Mission auto-transition、queue semantics 或真实外部动作默认禁用边界。"
```

### Task 4: Default GitHub PR Boundary And Final Documentation

**Files:**
- Modify: `apps/orchestrator-api/tests/api.test.ts` or `apps/worker-runner/tests/runner.test.ts`
- Modify: `docs/debug/debug.md`

- [ ] **Step 1: Strengthen default GitHub PR no-network boundary in the existing Worker Runner test**

In `apps/worker-runner/tests/runner.test.ts`, update the existing test named `keeps github.pr default manual-action without network and persists a PR preview artifact` by adding these assertions after `expect(wrapper.output).toMatchObject({ recommendedNextAction: ... })`:

```ts
    expect(wrapper.output).toMatchObject({
      canQueue: true,
      canExecute: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({ blocks: ["execute"], source: "integration" }),
      ]),
    });
```

Then add these assertions before the artifact assertion:

```ts
    const githubChild = await storage.getWorkerRun("worker-run-mission-real-github-pr");
    expect(githubChild).toMatchObject({
      output: expect.objectContaining({ realNetworkCall: false, realExternalCall: false, pushed: false }),
      metadata: expect.objectContaining({ realNetworkCall: false, pushed: false }),
    });
    const previewArtifact = await storage.getArtifact("artifact-mission-real-github-pr-preview");
    expect(previewArtifact).toMatchObject({
      metadata: expect.objectContaining({ realNetworkCall: false, pushed: false }),
      content: expect.stringContaining("Real network call: false"),
    });
    expect(previewArtifact?.content).toContain("Pushed: false");
```

The Worker Runner child output and preview artifact use `pushed:false` for the no-push boundary. Do not migrate this child schema to a new `realPush` field in B3.

- [ ] **Step 2: Run the default GitHub PR boundary test**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'keeps github.pr default manual-action without network'
```

Expected: PASS if default Worker Runner GitHub PR child output and preview artifact already preserve no-network/no-push semantics through `realNetworkCall:false` and `pushed:false`.

- [ ] **Step 3: Run focused package verification**

Run the smallest meaningful checks for changed surfaces:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'codex-real .*preflight|gated real actions|real-mode readiness'
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'real-mode readiness|canQueue|API-provided order'
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'codex.real|github.pr|canonical blockers|defense-in-depth'
```

Expected: PASS.

- [ ] **Step 4: Run full changed-package tests and typechecks**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
pnpm --filter @psf/hub test
pnpm --filter @psf/hub typecheck
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/worker-runner typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Run workspace safety checks**

Run:

```bash
pnpm check
git diff --check
node scripts/check-phase1-structure.mjs
git status --short --branch
```

Expected: `pnpm check`, `git diff --check`, and `node scripts/check-phase1-structure.mjs` PASS. `git status --short --branch` should show only intentional B3 implementation and docs changes before the final commit.

- [ ] **Step 6: Update `docs/debug/debug.md` with B3 verification**

Append this entry near the top of `## 当前条目` in `docs/debug/debug.md`, above the B2 entry:

```markdown
### 2026-06-05 - B3 合同安全测试精补

- 背景: 根据 B3 设计补强 readiness/blocker 合同缺口，重点覆盖 API 400 preflight、Hub canQueue 优先、Hub blocker 顺序、Worker Runner defense-in-depth execute-only blockers，以及默认 GitHub PR preview/manual-action no-network 边界。
- 现象: B2 已完成主合同收敛，但若缺少聚焦 contract tests，后续可能把 legacy safeToRun 重新当作真实执行 ready，或把已入队 Worker Runner defense-in-depth blocker 误写成 queue rejected。
- 范围: `apps/orchestrator-api/tests/api.test.ts`、`apps/hub/tests/hub.test.tsx`、`apps/worker-runner/tests/runner.test.ts`，以及必要最小 production-code 调整。
- 调查: 先补缺口测试，复用现有 readiness/blocker builder、Hub API readiness 展示、Worker Runner mapper 和 integration fake transport 测试边界；未新增共享 schema 迁移或真实 provider runner/transport。
- 修复: 400 preflight、Hub readiness 消费和 Worker Runner execute-only blocker 合同已由 B3 tests 锁住；默认 GitHub PR preview/manual-action 仍保持 no-network/no-push 安全边界。
- 验证: `pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'codex-real .*preflight|gated real actions|real-mode readiness'` 通过；`pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'real-mode readiness|canQueue|API-provided order'` 通过；`pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'codex.real|github.pr|canonical blockers|defense-in-depth'` 通过；`pnpm --filter @psf/orchestrator-api test` 通过；`pnpm --filter @psf/orchestrator-api typecheck` 通过；`pnpm --filter @psf/hub test` 通过；`pnpm --filter @psf/hub typecheck` 通过；`pnpm --filter @psf/worker-runner test` 通过；`pnpm --filter @psf/worker-runner typecheck` 通过；`pnpm check` 通过；`git diff --check` 通过；`node scripts/check-phase1-structure.mjs` 通过。
- 后续: B3 完成后继续按路线进入 A1 `ai-novelist` local mirror gated-runner proof；真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 和 Plane sync 仍需后续明确批准。
```

If a focused command fails during implementation and is fixed, include the failed command and the fixed command in the `验证` line before committing. Do not record secret values or long raw logs.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/worker-runner/tests/runner.test.ts docs/debug/debug.md
git commit -m "记录 B3 合同测试验证" -m "补强默认 GitHub PR preview/manual-action no-network 边界，并记录 B3 focused contract test 与 workspace verification 结果。" -m "默认安全边界保持不启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync。"
```

If `apps/worker-runner/tests/runner.test.ts` was committed in Task 3 and Task 4 only updates docs, use:

```bash
git add docs/debug/debug.md
git commit -m "记录 B3 合同测试验证" -m "记录 B3 focused contract test 与 workspace verification 结果；本提交只更新调试验证文档。" -m "默认安全边界保持不启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync。"
```

## Final Review

- [ ] **Step 1: Confirm no unexpected files changed**

Run:

```bash
git status --short --branch
git log --oneline -6
```

Expected: branch contains only focused B3 commits after the B3 plan/design commits. Working tree is clean.

- [ ] **Step 2: Report completion**

Final response should include:

- changed surfaces;
- commits created;
- verification commands run;
- confirmation that `docs/debug/debug.md` was updated for verification;
- confirmation that no real Codex, Playwright/browser, provider network, push, PR creation, deploy, monitor creation, or Plane sync was enabled.
