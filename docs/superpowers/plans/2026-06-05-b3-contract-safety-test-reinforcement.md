# B3 Contract Safety Test Reinforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focused B3 contract tests for the remaining B2 readiness/blocker and safety gaps without repeating existing coverage or enabling real execution.

**Architecture:** Keep the current B2 boundaries: Orchestrator remains the canonical API response outlet, Hub consumes API readiness, Worker Runner maps already queued results to execute blockers, and integrations keep their existing adapter contracts. Production changes are limited to missing readiness fields, redaction, or preserving existing API-provided ordering needed by the tests.

**Tech Stack:** TypeScript monorepo, pnpm workspaces, Vitest, Fastify Orchestrator API, React/Vite Hub, Worker Runner with `@psf/worker-runtime`, existing readiness/blocker helpers.

---

## Scope

Implement only the approved B3 gap tests from `docs/superpowers/specs/2026-06-05-b3-contract-safety-test-reinforcement-design.md`.

Do not add broad snapshot tests, shared schema migrations, cross-package test frameworks, provider clients, injected real transports, injected real runners, or A1 `ai-novelist` mirror proof.

Some B3 tests may pass immediately because B2 already implemented the behavior. If a new contract test passes, keep it as reinforcement and skip the associated production edit.

Default safety boundaries must remain disabled: no real Codex execution, real Playwright/browser execution, provider network calls, push, PR creation, deploy, monitor creation, or Plane sync.

## File Map

- Modify: `apps/orchestrator-api/tests/api.test.ts`  
  Adds focused API 400 preflight contract/redaction assertions for `codex-real` local mirror failures.
- Modify if needed: `apps/orchestrator-api/src/services.ts`  
  Routes `codex-real` local mirror preflight failures through `blockedPreflightDetails(...)` with sanitized structured blockers if the new test fails.
- Modify: `apps/hub/tests/hub.test.tsx`  
  Adds focused tests for `canQueue` priority over legacy `safeToRun` and API blocker ordering.
- Modify if needed: `apps/hub/src/App.tsx`  
  Keeps button disabled logic based on `entry.canQueue ?? entry.safeToRun` and renders blockers in API order if the new tests fail.
- Modify: `apps/worker-runner/tests/runner.test.ts`  
  Strengthens defense-in-depth `codex.real` policy blocker assertions and default GitHub PR no-network assertions.
- Modify if needed: `apps/worker-runner/src/handlers.ts` and `apps/worker-runner/src/readiness-blockers.ts`  
  Adds missing readiness fields or stable blocker keys for blocked/manual-action outputs if the new tests fail.
- Modify only if a focused assertion exposes a gap: `packages/integrations/tests/integrations.test.ts`, `packages/integrations/src/github-real.ts`  
  Current integration coverage should be enough; do not touch unless a B3 test proves otherwise.
- Modify at the end: `summary.md`, `docs/status/progress.md`, `docs/status/next-steps.md`, `docs/debug/debug.md`  
  Records B3 completion, verification results, and next step A1. Do not add or delete Markdown in the implementation unless a later confirmed task requires it.

---

### Task 1: API 400 Preflight Contract For `codex-real`

**Files:**
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify if needed: `apps/orchestrator-api/src/services.ts`

- [ ] **Step 1: Strengthen the existing local mirror preflight test**

In `apps/orchestrator-api/tests/api.test.ts`, replace the body of the existing test named `blocks codex-real preflight instead of using a GitHub HTTPS repo URL when no local mirror is provided` with this version. Keep the existing test name so related history remains easy to follow.

```ts
  it("blocks codex-real preflight instead of using a GitHub HTTPS repo URL when no local mirror is provided", async () => {
    const registryRoot = await createAiNovelistRegistryRoot();
    const fakeSecret = "b3-api-preflight-secret-value";
    try {
      await withEnv({
        PSF_ACTION_EXECUTION_MODE: "queued",
        PSF_ENABLE_REAL_CODEX: "true",
        PSF_LOCAL_REPO_ai_novelist: undefined,
        PSF_LOCAL_REPO_AI_NOVELIST: undefined,
        PSF_B3_PREFLIGHT_TOKEN: fakeSecret,
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
            repoUrl: `https://github.com/hxfei-git/ai-novelist.git?token=${fakeSecret}`,
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
            recommendedNextAction: expect.stringContaining("local mirror"),
          }),
        });
        expect(body.details.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({
            key: "policy.codex.local_mirror_required",
            category: "policy",
            severity: "blocking",
            blocks: ["queue", "execute"],
            source: "orchestrator",
            details: expect.objectContaining({
              action: "codex-real",
              missingLocalMirror: true,
            }),
          }),
        ]));
        expect(JSON.stringify(body)).not.toContain(fakeSecret);
        expect(JSON.stringify(body)).not.toContain("token=");
        expect(body.message).toContain("local repository mirror");
        expect(await storage.listMissionWorkerRuns(EXAMPLE_MISSION_ID)).toHaveLength(0);
        expect(await workerRuntime.listJobs()).toHaveLength(0);
      });
    } finally {
      await rm(registryRoot, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run the focused API test**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'blocks codex-real preflight instead of using a GitHub HTTPS repo URL when no local mirror is provided'
```

Expected if the gap still exists: FAIL because `body.details.canQueue`, `body.details.blockers`, or safety flags are missing for this `codex-real` preflight path.

Expected if B2 already covers it: PASS. If it passes, skip Step 3 and keep the test as contract reinforcement.

- [ ] **Step 3: Add the minimal API preflight blocker implementation if the test fails**

In `apps/orchestrator-api/src/services.ts`, change `assertCodexLocalRepoUrlAvailable` so the `badRequest(...)` details use `blockedPreflightDetails(...)` and the existing readiness helper.

Replace the `throw badRequest(...)` block in `assertCodexLocalRepoUrlAvailable` with:

```ts
    throw badRequest("MISSION_ACTION_PREFLIGHT_BLOCKED", "codex-real requires an explicitly provided local repository mirror; GitHub HTTPS/SSH remotes are not accepted as real Codex repoUrl values.", blockedPreflightDetails(buildReadinessBlocker({
      category: "policy",
      key: "policy.codex.local_mirror_required",
      message: "codex-real requires an operator-prepared local repository mirror; remote GitHub HTTPS/SSH repo URLs are refused at route preflight.",
      recommendedNextAction: `Provide repoUrl in the request body, or set ${localRepoEnvName(registryProject.project.id)} to a local mirror path under operator control.`,
      severity: "blocking",
      blocks: ["queue", "execute"],
      source: "orchestrator",
      details: {
        action: "codex-real",
        missingLocalMirror: true,
        evidence: "route_preflight",
      },
    }), {
      missionId: mission.id,
      projectId: mission.project_id,
      passportPath: registryProject.passportPath,
      action: "codex-real",
      missingLocalMirror: true,
    }));
```

Do not include `repoUrl`, raw request body, raw environment values, or any token-like text in `details`.

- [ ] **Step 4: Re-run the focused API test**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'blocks codex-real preflight instead of using a GitHub HTTPS repo URL when no local mirror is provided'
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1 if it changed code or tests**

Run:

```bash
git add apps/orchestrator-api/tests/api.test.ts apps/orchestrator-api/src/services.ts
git commit -m "补强 Codex 预检阻塞合同" -m "为 codex-real local mirror 预检失败补充 canQueue、canExecute、blockers[]、recommendedNextAction 和默认安全 flags 断言。" -m "若实现有改动，仅复用现有 readiness blocker builder 和 API redaction 边界，不启用真实 Codex、provider network、push、PR 或 deploy。"
```

If Step 2 passed and only the test changed, commit only `apps/orchestrator-api/tests/api.test.ts` with the same commit message.

---

### Task 2: Hub `canQueue` Priority And API Blocker Order

**Files:**
- Modify: `apps/hub/tests/hub.test.tsx`
- Modify if needed: `apps/hub/src/App.tsx`

- [ ] **Step 1: Add a focused Hub contract test**

In `apps/hub/tests/hub.test.tsx`, add this test near the existing real-mode readiness test.

```tsx
  it("uses canQueue over legacy safeToRun and preserves API blocker order", () => {
    const firstBlocker = "First API blocker: route accepted the gated preview contract.";
    const secondBlocker = "Second API blocker: injected transport is still missing.";
    const readiness: NonNullable<MissionSummaryResponse["realModeReadiness"]> = {
      codex: {
        key: "codex",
        label: "Codex real execution",
        action: "codex-real",
        enabled: false,
        configured: true,
        ready: false,
        safeToRun: false,
        canQueue: false,
        canExecute: false,
        realNetworkCall: false,
        missingEnv: [],
        message: "Codex route gate is blocked.",
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
        message: "Playwright QA is blocked.",
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
        message: "AI exploratory QA is blocked.",
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
        message: "Fix real is blocked.",
      },
      github: {
        key: "github",
        label: "GitHub PR",
        action: "github-pr",
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
        requiredApprovalTypes: ["EXTERNAL_COST_RISK"],
        approvedApprovalTypes: ["EXTERNAL_COST_RISK"],
        missingApprovalTypes: [],
        recommendedNextAction: "Create a PR preview/manual-action; no push or PR creation will occur.",
        blockers: [
          {
            category: "policy",
            key: "policy.github.preview_contract",
            message: firstBlocker,
            recommendedNextAction: "Review the queued PR preview result.",
            severity: "manual_action",
            blocks: ["execute"],
            source: "orchestrator",
          },
          {
            category: "execution",
            key: "execution.github.injected_transport_missing",
            message: secondBlocker,
            recommendedNextAction: "Inject a transport only in a later approved task.",
            severity: "manual_action",
            blocks: ["execute"],
            source: "orchestrator",
          },
        ],
        message: "GitHub PR can queue a gated preview, but execution remains manual-action.",
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
        message: "Coolify deploy is blocked.",
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
        message: "Monitor sync is blocked.",
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
        message: "Plane sync is blocked.",
      },
    };

    const view = renderMissionDetailView({
      state: { status: "success", data: { ...missionSummary, realModeReadiness: readiness } },
      actions: { onRunAction: vi.fn(), onRefresh: vi.fn() },
      actionState: { loading: "", message: "", error: "" },
    });

    const button = findButtonByText(view, "Create PR preview/manual-action");
    const text = textFromElement(view);

    expect(button.props.disabled).toBe(false);
    expect(text).toContain("Queue: ready");
    expect(text).toContain("Execute: manual-action");
    expect(text).not.toContain("Run real");
    expect(text.indexOf(firstBlocker)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(secondBlocker)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(firstBlocker)).toBeLessThan(text.indexOf(secondBlocker));
  });
```

- [ ] **Step 2: Run the focused Hub test**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'uses canQueue over legacy safeToRun and preserves API blocker order'
```

Expected: PASS if current Hub already uses `entry.canQueue ?? entry.safeToRun` and renders blockers in array order. If it fails, continue to Step 3.

- [ ] **Step 3: Keep Hub button and blocker rendering aligned with the API if needed**

If the test fails because the button is disabled, update `renderMissionActions` in `apps/hub/src/App.tsx` so the guarded real action loop uses this queue decision:

```tsx
          const canQueue = entry.canQueue ?? entry.safeToRun;
```

If the test fails because blocker order changes, keep `renderRealModeReadiness` as a direct map over the API array:

```tsx
            {(entry.blockers ?? []).map((blocker) => (
              <span key={blocker.key}>{`${blocker.severity} ${blocker.category}: ${blocker.message}`}</span>
            ))}
```

Do not introduce Hub-side sorting or env/approval/transport inference.

- [ ] **Step 4: Re-run the focused Hub test**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'uses canQueue over legacy safeToRun and preserves API blocker order'
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2 if it changed tests or code**

Run:

```bash
git add apps/hub/tests/hub.test.tsx apps/hub/src/App.tsx
git commit -m "锁定 Hub 就绪合同展示" -m "新增 Hub 合同测试，确认 canQueue 优先于 legacy safeToRun，并按 API 返回顺序展示 blockers。" -m "如有实现调整，仅保持现有 API 消费语义，不新增 Hub 推断、不启用真实外部动作。"
```

---

### Task 3: Worker Runner Defense-In-Depth Execute Blockers

**Files:**
- Modify: `apps/worker-runner/tests/runner.test.ts`
- Modify if needed: `apps/worker-runner/src/readiness-blockers.ts`
- Modify if needed: `apps/worker-runner/src/handlers.ts`

- [ ] **Step 1: Strengthen remote repo defense-in-depth assertions**

In `apps/worker-runner/tests/runner.test.ts`, find the parameterized test named `blocks codex.real %s before calling injected runner`. After the existing `expect(String(wrapper.output.reason)).toContain("codex.real queued job requires local repoUrl");`, add:

```ts
    expect(wrapper.output).toMatchObject({
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
    const events = await storage.listMissionEvents("mission-real");
    const actionResult = events.find((event) => event.type === "mission.action_result");
    expect(actionResult?.payload).toMatchObject({
      canQueue: true,
      canExecute: false,
      blockers: [expect.objectContaining({
        key: "policy.codex.local_mirror_required",
        blocks: ["execute"],
        source: "worker_runner",
      })],
    });
```

- [ ] **Step 2: Strengthen unsafe branch defense-in-depth assertions**

In the test named `blocks unsafe codex.real branch %s before calling injected runner`, after `expect(String(wrapper.output.reason)).toContain("codex.real branchName must be under agent/");`, add:

```ts
    expect(wrapper.output).toMatchObject({
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
    const events = await storage.listMissionEvents("mission-real");
    const actionResult = events.find((event) => event.type === "mission.action_result");
    expect(actionResult?.payload).toMatchObject({
      canQueue: true,
      canExecute: false,
      blockers: [expect.objectContaining({
        key: "policy.codex.branch_policy",
        blocks: ["execute"],
        source: "worker_runner",
      })],
    });
```

- [ ] **Step 3: Run the focused Worker Runner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'blocks codex.real|blocks unsafe codex.real branch'
```

Expected: PASS if B2 already maps these defense-in-depth failures to execute-only policy blockers. If it fails, continue to Step 4.

- [ ] **Step 4: Add the minimal Worker Runner mapping if needed**

If the blocker key is wrong, update `codexBlockerKey` in `apps/worker-runner/src/readiness-blockers.ts` to keep these mappings:

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

If `canQueue`, `canExecute`, or `blockers` are absent from wrapper output, keep `toCodexRealHandlerResult` in `apps/worker-runner/src/handlers.ts` deriving readiness for `blocked` and `manual_action` statuses:

```ts
  const readiness = result.status === "blocked" || result.status === "manual_action"
    ? deriveWorkerReadiness([codexManualActionBlocker(result.reason)], recommendedNextAction)
    : deriveWorkerReadiness([], recommendedNextAction);
```

and ensure the returned object includes:

```ts
    canQueue: readiness.canQueue,
    canExecute: readiness.canExecute,
    blockers: readiness.blockers,
```

Do not change wrapper status lifecycle, Mission auto-transition rules, or queue semantics.

- [ ] **Step 5: Re-run the focused Worker Runner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'blocks codex.real|blocks unsafe codex.real branch'
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3 if it changed tests or code**

Run:

```bash
git add apps/worker-runner/tests/runner.test.ts apps/worker-runner/src/readiness-blockers.ts apps/worker-runner/src/handlers.ts
git commit -m "锁定 Worker 执行阻塞语义" -m "补强 Worker Runner defense-in-depth 测试，确认已入队 codex.real policy blocker 只阻塞 execute 且不回写 queue 语义。" -m "如有实现调整，仅补 wrapper output 与 mission.action_result readiness 字段，不改变 WorkerRun lifecycle 或 Mission auto-transition。"
```

---

### Task 4: Default GitHub PR Boundary Versus Fake Transport Success

**Files:**
- Modify: `apps/worker-runner/tests/runner.test.ts`
- Modify if needed: `apps/worker-runner/src/handlers.ts`

- [ ] **Step 1: Strengthen the default GitHub PR Worker Runner test**

In `apps/worker-runner/tests/runner.test.ts`, find the test named `keeps github.pr default manual-action without network and persists a PR preview artifact`. After the existing `expect(wrapper.output).toMatchObject({ recommendedNextAction: ... })` block and before artifact assertions, add:

```ts
    const githubChild = await storage.getWorkerRun("worker-run-mission-real-github-pr");
    expect(githubChild).toMatchObject({
      output: expect.objectContaining({
        realNetworkCall: false,
        realExternalCall: false,
        pushed: false,
      }),
      metadata: expect.objectContaining({
        realNetworkCall: false,
        pushed: false,
      }),
    });
```

After the artifact assertion for `artifact-mission-real-github-pr-preview`, add:

```ts
    const previewArtifact = await storage.getArtifact("artifact-mission-real-github-pr-preview");
    expect(previewArtifact).toMatchObject({
      metadata: expect.objectContaining({ realNetworkCall: false, pushed: false }),
      content: expect.stringContaining("Real network call: false"),
    });
    expect(previewArtifact?.content).toContain("Pushed: false");
```

This locks the default Worker Runner path. It does not conflict with the existing fake transport success test, where injected transport deliberately produces `realNetworkCall:true`.

- [ ] **Step 2: Run the focused GitHub PR default test**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'keeps github.pr default manual-action without network and persists a PR preview artifact'
```

Expected: PASS if the default child WorkerRun and preview artifact already preserve no-network metadata. If it fails, continue to Step 3.

- [ ] **Step 3: Add minimal no-network fields if needed**

If child output or metadata lacks the fields, update `createGitHubPrWorkerRun` in `apps/worker-runner/src/handlers.ts` so the child output includes:

```ts
      realNetworkCall: result.realNetworkCall,
      safeToRun: result.safeToRun,
      configured: result.configured,
      missingEnv: result.missingEnv,
      requests: result.outputs.requests,
      manualActions: result.outputs.manualActions,
      pushed: false,
      realExternalCall: result.realNetworkCall,
```

and metadata includes:

```ts
      realNetworkCall: result.realNetworkCall,
      pushed: false,
```

If the preview artifact lacks the safety text or metadata, update `createGitHubPrPreviewArtifact` so its content includes:

```ts
    `- Real network call: ${result.realNetworkCall}`,
    `- Pushed: false`,
```

and metadata includes:

```ts
metadata: { generatedBy: "worker-runner", provider: "github", realNetworkCall: result.realNetworkCall, pushed: false },
```

Do not add `realPush:true`, do not create PRs, and do not add any real transport.

- [ ] **Step 4: Re-run the focused GitHub PR default test**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'keeps github.pr default manual-action without network and persists a PR preview artifact'
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4 if it changed tests or code**

Run:

```bash
git add apps/worker-runner/tests/runner.test.ts apps/worker-runner/src/handlers.ts
git commit -m "锁定 GitHub 预览默认安全边界" -m "补强 Worker Runner GitHub PR default manual-action 测试，确认 fake transport 的 realNetworkCall:true 不污染默认 preview/no-network 路径。" -m "保持默认不 push、不创建 PR、不调用 provider network。"
```

---

### Task 5: Focused Verification And Documentation Rollup

**Files:**
- Modify: `docs/debug/debug.md`
- Modify: `docs/status/progress.md`
- Modify: `docs/status/next-steps.md`
- Modify: `summary.md`

- [ ] **Step 1: Run focused package tests**

Run the smallest checks for touched surfaces:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'codex-real preflight|gated real actions|real-mode readiness'
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'canQueue|real-mode readiness|guarded real actions'
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'codex.real|github.pr default manual-action'
```

Expected: PASS for each command.

If a `-t` pattern does not match the exact local test name after edits, run the package file directly:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts
```

Expected: PASS for each command.

- [ ] **Step 2: Run broader checks only after focused checks pass**

Run:

```bash
pnpm --filter @psf/orchestrator-api typecheck
pnpm --filter @psf/hub typecheck
pnpm --filter @psf/worker-runner typecheck
pnpm check
git diff --check
```

Expected: PASS. `git diff --check` should produce no output.

- [ ] **Step 3: Update `docs/debug/debug.md` with verification results**

Add this entry near the top of `## 当前条目`, above the B2 entry. Adjust command result counts only to match actual terminal output; keep the safety statement unchanged.

```markdown
### 2026-06-05 - B3 合同与安全测试缺口精补

- 背景: 用户确认 B3 只做 B2 readiness/blocker 合同的缺口精补，不重复已有 B2 覆盖，也不进入 A1 local mirror proof。
- 现象: B2 已有合同实现和多处测试，但 API 400 preflight、Hub `canQueue` 优先、Hub blocker 顺序、Worker Runner defense-in-depth execute-only blocker、GitHub PR fake transport 与默认 no-network 边界仍需要聚焦回归测试锁定。
- 范围: `apps/orchestrator-api/tests/api.test.ts`、`apps/hub/tests/hub.test.tsx`、`apps/worker-runner/tests/runner.test.ts`，以及为通过测试所需的最小 production-code 调整。
- 调查: 对照 B3 设计确认已有覆盖不重复新增；fake transport `realNetworkCall:true` 只保留在受控 injected transport 测试中，默认 API/Worker Runner preview/manual-action path 必须继续 no-network。
- 修复: 补充 B3 focused contract tests，并仅在必要时补齐 400 preflight blocker details、Hub API readiness 消费或 Worker Runner blocked/manual-action readiness mapping。
- 验证: Focused checks 通过：`pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts ...`、`pnpm --filter @psf/hub test -- --run tests/hub.test.tsx ...`、`pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts ...`。Broader checks 通过：`pnpm --filter @psf/orchestrator-api typecheck`、`pnpm --filter @psf/hub typecheck`、`pnpm --filter @psf/worker-runner typecheck`、`pnpm check`、`git diff --check`。
- 后续: 执行 A1 前，仍需 operator-prepared `ai-novelist` local mirror，并人工验证 passport commands、local URL 和 selectors；默认仍不启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync。
```

- [ ] **Step 4: Update current status docs**

In `docs/status/progress.md`, change the B3 line in `## 当前执行路线` from B3 being next to B3 being complete and A1 being next. Use this wording:

```markdown
B1 文档差异审计与最小必要清理已完成。B2 控制面 readiness/blocker 合同收敛已完成并进入当前实现事实：`safeToRun` 只作为 legacy route-level queue readiness 字段保留，新的判断优先使用 `canQueue`、`canExecute`、`blockers[]` 和 `recommendedNextAction`。B3 合同与安全测试缺口精补已完成；下一步执行 A1，在 operator-prepared `ai-novelist` local mirror 上证明 gated-runner path。
```

In `docs/status/next-steps.md`, replace the B3 bullet with:

```markdown
3. B3 合同与安全测试缺口精补已完成；下一步执行 A1：只在 operator-prepared `ai-novelist` local mirror 上证明 gated-runner path。Passport 中 `manual-verification-required` 的 commands、local URL 和 selectors 必须先人工验证。
```

In `summary.md`, update the current problems/improvement backlog only where wording says B3 still needs to be done. Use this replacement for the current problem item about B3:

```markdown
2. B3 已用 focused contract tests 锁定 B2 readiness/blocker 的高风险边界；后续仍需避免新 route、worker 或 integration path 绕过 `canQueue`、`canExecute`、`blockers[]` 和默认安全 flags。
```

If a line says `下一步执行 B3 合同回归测试和必要最小调整，最后执行 A1`, replace it with:

```markdown
后续顺序：B1 文档差异审计与最小必要清理已完成，B2 readiness/blocker 合同收敛已完成，B3 合同与安全测试缺口精补已完成；下一步执行 A1 `ai-novelist` local mirror gated-runner proof。
```

- [ ] **Step 5: Run documentation consistency checks**

Run:

```bash
node scripts/check-phase1-structure.mjs
git diff --check
```

Expected: `node scripts/check-phase1-structure.mjs` passes and validates the expected file/directory counts. `git diff --check` produces no output.

- [ ] **Step 6: Commit Task 5 documentation rollup**

Run:

```bash
git add docs/debug/debug.md docs/status/progress.md docs/status/next-steps.md summary.md
git commit -m "记录 B3 合同测试收口" -m "更新当前事实源和调试记录，记录 B3 focused contract tests、验证结果和 A1 作为下一步。" -m "默认安全边界保持不启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync。"
```

---

### Task 6: Final Workspace Verification

**Files:**
- No production files expected. Commit only if verification uncovers a required fix.

- [ ] **Step 1: Run final workspace checks**

Run:

```bash
pnpm typecheck
pnpm test
pnpm check
node scripts/check-phase1-structure.mjs
git diff --check
git status --short --branch
```

Expected:

- `pnpm typecheck`: PASS.
- `pnpm test`: PASS.
- `pnpm check`: PASS.
- `node scripts/check-phase1-structure.mjs`: PASS.
- `git diff --check`: no output.
- `git status --short --branch`: clean except branch ahead count.

- [ ] **Step 2: If final verification requires a fix, make the smallest fix and commit**

If a check fails, inspect the failure, make only the minimal scoped change, rerun the failed command, then rerun the final workspace checks from Step 1.

Commit any required final fix with a Chinese title and body. Use a message shaped like:

```bash
git add apps/orchestrator-api/tests/api.test.ts apps/orchestrator-api/src/services.ts apps/hub/tests/hub.test.tsx apps/hub/src/App.tsx apps/worker-runner/tests/runner.test.ts apps/worker-runner/src/handlers.ts apps/worker-runner/src/readiness-blockers.ts docs/debug/debug.md docs/status/progress.md docs/status/next-steps.md summary.md
git commit -m "修正 B3 验证收口问题" -m "根据最终验证结果修正 B3 合同测试或文档收口问题。" -m "未启用真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 或 Plane sync。"
```

- [ ] **Step 3: Report completion**

In the final response, include:

- implemented test gaps;
- production-code files changed, if any;
- verification commands and results;
- documentation files updated;
- final commit hashes;
- explicit note that no real external execution was enabled.
