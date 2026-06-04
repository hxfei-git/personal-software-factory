# B2 Readiness Blocker Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mission summary real-mode readiness explicit by separating queue acceptance from execution permission with structured blockers.

**Architecture:** The Orchestrator API remains the source of Mission summary readiness. `safeToRun` stays as a backward-compatible queue-readiness field, but the new contract exposes `canQueue`, `canExecute`, `queueBlockers`, `executionBlockers`, `blockers`, and `recommendedNextAction` so Hub and operators do not infer real execution from a single boolean. Hub uses `canQueue` to guard queued real-action buttons and displays `canExecute=false` until runner, transport, mirror, target URL, selector, command-policy, workspace, and operation-gate proof exists.

**Tech Stack:** TypeScript, Fastify, Vitest, React/Vite, Markdown, pnpm.

---

## Scope Boundary

Implement only Batch B2 from [docs/superpowers/specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md](../specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md).

Do not enable Codex execution, Playwright browser execution, provider network calls, push, PR creation, deployment, monitor creation, Plane sync, Temporal, or LangGraph. Do not modify the integrations package `safeToRun` contract in this batch; it is a provider-adapter status field and is not the Mission summary readiness ambiguity being fixed here.

## File Structure

Modify these files:

- `apps/orchestrator-api/tests/api.test.ts`: add failing contract tests for `canQueue`, `canExecute`, queue blockers, execution blockers, and policy failure generation.
- `apps/orchestrator-api/src/services.ts`: extend the Mission summary readiness entry type and build structured blockers without parsing message text.
- `apps/hub/src/api/types.ts`: mirror the new readiness fields consumed by Hub.
- `apps/hub/src/App.tsx`: render `canQueue` and `canExecute`, use `canQueue` for guarded real-action buttons, and display blocker next actions.
- `apps/hub/tests/hub.test.tsx`: update the Mission detail fixture and assertions for the new readiness wording.
- `docs/api/orchestrator-api.md`: document the new Mission summary readiness contract.
- `docs/apps/hub-web.md`: document the Hub readiness display and button guard semantics.
- `docs/architecture/structure.md`: document the control-plane readiness data flow and safety boundary.
- `docs/status/progress.md`: record B2 completion and keep B3/A1 as next work.
- `docs/status/next-steps.md`: advance the route so B3 is next after B2.
- `summary.md`: update current status, risk/backlog wording, and the Markdown document map for this plan.
- `docs/debug/debug.md`: record B2 verification results, failures, and safety classification.
- `docs/superpowers/plans/2026-06-04-b2-readiness-blocker-contract.md`: track this implementation plan.

Read these files during execution:

- `docs/superpowers/specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md`
- `docs/status/progress.md`
- `docs/status/next-steps.md`
- `docs/api/orchestrator-api.md`
- `docs/apps/hub-web.md`
- `docs/security/safety.md`
- `docs/runtime/queue-runtime.md`

## Contract Shape

Use this shape in `apps/orchestrator-api/src/services.ts` and mirror it in `apps/hub/src/api/types.ts`:

```typescript
type ReadinessBlockerScope = "queue" | "execution";

type ReadinessBlockerKind =
  | "queue_mode"
  | "worker_runtime"
  | "route_gate"
  | "provider_env"
  | "approval"
  | "injected_runner"
  | "injected_transport"
  | "local_mirror"
  | "target_url"
  | "selector_verification"
  | "command_policy"
  | "workspace_guard"
  | "operation_gate";

type ReadinessBlocker = {
  scope: ReadinessBlockerScope;
  kind: ReadinessBlockerKind;
  message: string;
  nextAction: string;
  missing?: string[];
};

type ReadinessEntry = {
  key: ReadinessKey;
  label: string;
  action: GatedRealActionKind;
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  safeToRun: boolean;
  canQueue: boolean;
  canExecute: boolean;
  realNetworkCall: false;
  missingEnv: string[];
  requiredApprovalTypes: string[];
  approvedApprovalTypes: string[];
  missingApprovalTypes: string[];
  queueBlockers: ReadinessBlocker[];
  executionBlockers: ReadinessBlocker[];
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;
  message: string;
};
```

Semantic rules:

- `ready` keeps the current route-level pre-approval meaning: env gate, integration configuration, queued mode, and worker runtime are present.
- `safeToRun` is preserved for compatibility and equals `canQueue`; it must not be described as execution permission.
- `canQueue` is true only when queue mode, worker runtime, route gate, integration env, and required approvals are all satisfied.
- `canExecute` is false in current control-plane summaries because injected runners/transports, local mirror, target URL, selector verification, command policy, workspace guards, and operation gates are not proven by the Mission summary endpoint.
- `realNetworkCall` remains false.
- `buildPolicyFailures` reads `queueBlockers` and `executionBlockers`; it must not parse `entry.message`.

## Task 1: Add API Contract Failing Tests

**Files:**
- Modify: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Confirm the starting worktree**

Run:

```bash
git status --short --branch
```

Expected: clean B2 worktree before edits. If unrelated user changes appear, leave them untouched and account for them in the final response.

- [ ] **Step 2: Update the missing-approval readiness test first**

Replace the expectation inside `reports missing approval types in real-mode readiness` with:

```typescript
      expect(response.json().realModeReadiness.codex).toMatchObject({
        enabled: true,
        ready: true,
        safeToRun: false,
        canQueue: false,
        canExecute: false,
        requiredApprovalTypes: ["SECURITY_RISK"],
        approvedApprovalTypes: [],
        missingApprovalTypes: ["SECURITY_RISK"],
        queueBlockers: [
          expect.objectContaining({
            scope: "queue",
            kind: "approval",
            missing: ["SECURITY_RISK"],
          }),
        ],
        executionBlockers: expect.arrayContaining([
          expect.objectContaining({ scope: "execution", kind: "injected_runner" }),
          expect.objectContaining({ scope: "execution", kind: "local_mirror" }),
          expect.objectContaining({ scope: "execution", kind: "command_policy" }),
        ]),
      });
      expect(response.json().realModeReadiness.codex.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "approval" }),
        expect.objectContaining({ kind: "injected_runner" }),
      ]));
      expect(response.json().realModeReadiness.codex.recommendedNextAction).toContain("SECURITY_RISK");
      expect(response.json().policyFailures).toContain("Codex real execution missing approvals: SECURITY_RISK.");
      expect(response.json().policyFailures).toContain("Codex real execution requires an injected Codex runner before execution.");
```

- [ ] **Step 3: Add a queueable-but-not-executable readiness test**

Add this test immediately after `reports missing approval types in real-mode readiness`:

```typescript
  it("separates queue readiness from execution readiness in real-mode readiness", async () => {
    await withEnv({ PSF_ACTION_EXECUTION_MODE: "queued", PSF_ENABLE_REAL_CODEX: "true" }, async () => {
      const { server, storage } = await createTestServer({
        auth: { disabled: true },
        workerRuntime: new InProcessWorkerRuntime(),
      });
      await seedDemoMission(storage);
      const approval = await createApprovedApproval(server, EXAMPLE_MISSION_ID, "SECURITY_RISK");

      const response = await server.inject({ method: "GET", url: `/missions/${EXAMPLE_MISSION_ID}/summary` });

      expect(response.statusCode).toBe(200);
      expect(approval.type).toBe("SECURITY_RISK");
      expect(response.json().realModeReadiness.codex).toMatchObject({
        enabled: true,
        ready: true,
        safeToRun: true,
        canQueue: true,
        canExecute: false,
        requiredApprovalTypes: ["SECURITY_RISK"],
        approvedApprovalTypes: ["SECURITY_RISK"],
        missingApprovalTypes: [],
        queueBlockers: [],
        executionBlockers: expect.arrayContaining([
          expect.objectContaining({ scope: "execution", kind: "injected_runner" }),
          expect.objectContaining({ scope: "execution", kind: "local_mirror" }),
          expect.objectContaining({ scope: "execution", kind: "command_policy" }),
          expect.objectContaining({ scope: "execution", kind: "workspace_guard" }),
        ]),
      });
      expect(response.json().realModeReadiness.codex.message).toContain("queueable only");
      expect(response.json().realModeReadiness.codex.message).not.toContain("can execute");
      expect(response.json().policyFailures).toContain("Codex real execution requires an injected Codex runner before execution.");
      expect(response.json().policyFailures).not.toContain("Codex real execution missing approvals: SECURITY_RISK.");
    });
  });
```

- [ ] **Step 4: Update the redaction summary fixture expectation**

In the `redacts provider secrets from mission summary resources` test, replace readiness snippets like:

```typescript
codex: { enabled: false, configured: true, ready: false, safeToRun: false, realNetworkCall: false },
```

with:

```typescript
codex: {
  enabled: false,
  configured: true,
  ready: false,
  safeToRun: false,
  canQueue: false,
  canExecute: false,
  realNetworkCall: false,
  queueBlockers: expect.arrayContaining([expect.objectContaining({ kind: "route_gate" })]),
  executionBlockers: expect.arrayContaining([expect.objectContaining({ kind: "injected_runner" })]),
},
```

Apply the same `canQueue: false`, `canExecute: false`, and `realNetworkCall: false` expectation to `github`, `coolify`, `uptimeKuma`, and `plane`, using `route_gate` for disabled gates and `provider_env` when `configured` is false.

- [ ] **Step 5: Run API tests to verify RED**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --runInBand
```

Expected: FAIL because `canQueue`, `canExecute`, `queueBlockers`, `executionBlockers`, `blockers`, and `recommendedNextAction` do not exist yet.

## Task 2: Implement Orchestrator Readiness Contract

**Files:**
- Modify: `apps/orchestrator-api/src/services.ts`

- [ ] **Step 1: Add blocker types to the readiness section**

Insert the contract shape from the "Contract Shape" section above before `type ReadinessEntry`.

- [ ] **Step 2: Add queue blocker helper**

Add this helper before `buildRealModeReadiness`:

```typescript
function buildQueueBlockers(input: {
  label: string;
  gateEnv: string;
  enabled: boolean;
  configured: boolean;
  missingEnv: string[];
  queueReady: boolean;
  workerRuntimeConfigured: boolean;
  missingApprovalTypes: string[];
}): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  if (!input.queueReady) {
    blockers.push({
      scope: "queue",
      kind: "queue_mode",
      message: input.label + " cannot be queued because PSF_ACTION_EXECUTION_MODE is not queued.",
      nextAction: "Set PSF_ACTION_EXECUTION_MODE=queued before queueing this real action.",
      missing: ["PSF_ACTION_EXECUTION_MODE=queued"],
    });
  }
  if (!input.workerRuntimeConfigured) {
    blockers.push({
      scope: "queue",
      kind: "worker_runtime",
      message: input.label + " cannot be queued because Worker Runtime is not configured.",
      nextAction: "Start Orchestrator with a configured Worker Runtime before queueing this real action.",
    });
  }
  if (!input.enabled) {
    blockers.push({
      scope: "queue",
      kind: "route_gate",
      message: input.label + " cannot be queued because " + input.gateEnv + " is not true.",
      nextAction: "Set " + input.gateEnv + "=true only after approving this real-action path.",
      missing: [input.gateEnv + "=true"],
    });
  }
  if (!input.configured || input.missingEnv.length > 0) {
    blockers.push({
      scope: "queue",
      kind: "provider_env",
      message: input.label + " cannot be queued because provider environment is incomplete.",
      nextAction: "Configure missing provider environment before queueing this real action.",
      missing: input.missingEnv,
    });
  }
  if (input.missingApprovalTypes.length > 0) {
    blockers.push({
      scope: "queue",
      kind: "approval",
      message: input.label + " cannot be queued because required approvals are missing.",
      nextAction: input.label + " missing approvals: " + input.missingApprovalTypes.join(", ") + ".",
      missing: input.missingApprovalTypes,
    });
  }
  return blockers;
}
```

- [ ] **Step 3: Add execution blocker helper**

Add this helper after `buildQueueBlockers`:

```typescript
function buildExecutionBlockers(action: GatedRealActionKind, label: string): ReadinessBlocker[] {
  switch (action) {
    case "codex-real":
    case "fix-real":
      return [
        {
          scope: "execution",
          kind: "injected_runner",
          message: label + " requires an injected Codex runner before execution.",
          nextAction: label + " requires an injected Codex runner before execution.",
        },
        {
          scope: "execution",
          kind: "local_mirror",
          message: label + " requires an operator-verified local project mirror before execution.",
          nextAction: "Verify the local project mirror, passport commands, and workspace path before execution.",
        },
        {
          scope: "execution",
          kind: "command_policy",
          message: label + " requires a reviewed command policy before execution.",
          nextAction: "Review install, build, test, lint, and E2E commands against the real checkout before execution.",
        },
        {
          scope: "execution",
          kind: "workspace_guard",
          message: label + " requires workspace path guards before execution.",
          nextAction: "Verify workspace path guards prevent writes outside the approved local mirror.",
        },
      ];
    case "qa-playwright":
      return [
        {
          scope: "execution",
          kind: "target_url",
          message: label + " requires an operator-verified local target URL before execution.",
          nextAction: "Verify the local target URL responds before running Playwright QA.",
        },
        {
          scope: "execution",
          kind: "selector_verification",
          message: label + " requires deterministic selector verification before execution.",
          nextAction: "Verify deterministic selectors against the local target before running Playwright QA.",
        },
        {
          scope: "execution",
          kind: "command_policy",
          message: label + " requires a reviewed QA command policy before execution.",
          nextAction: "Review the Playwright command and artifact policy before execution.",
        },
      ];
    case "qa-ai-exploratory":
      return [
        {
          scope: "execution",
          kind: "injected_transport",
          message: label + " requires an injected AI exploratory transport before execution.",
          nextAction: "Inject and approve the AI exploratory transport before execution.",
        },
        {
          scope: "execution",
          kind: "target_url",
          message: label + " requires an operator-verified local target URL before execution.",
          nextAction: "Verify the local target URL before AI exploratory QA.",
        },
      ];
    case "github-pr":
    case "deploy-staging":
    case "monitor-sync":
    case "plane-sync":
      return [
        {
          scope: "execution",
          kind: "injected_transport",
          message: label + " requires an injected provider transport before execution.",
          nextAction: "Inject an approved provider transport in a later explicit provider task.",
        },
        {
          scope: "execution",
          kind: "operation_gate",
          message: label + " requires explicit operation gates before execution.",
          nextAction: "Keep provider network, push, PR, deploy, monitor, and sync operations disabled until a later approved task.",
        },
      ];
  }
}
```

- [ ] **Step 4: Update `buildRealModeReadiness`**

Replace the local string `blockers` logic with:

```typescript
    const queueBlockers = buildQueueBlockers({
      label: contract.label,
      gateEnv: contract.gateEnv,
      enabled,
      configured,
      missingEnv,
      queueReady,
      workerRuntimeConfigured: input.workerRuntimeConfigured,
      missingApprovalTypes: approvalCoverage.missingApprovalTypes,
    });
    const executionBlockers = buildExecutionBlockers(definition.action, contract.label);
    const blockers = [...queueBlockers, ...executionBlockers];
    const canQueue = queueBlockers.length === 0;
    const canExecute = canQueue && executionBlockers.length === 0;
    const safeToRun = canQueue;
    const recommendedNextAction = blockers[0]?.nextAction
      ?? contract.label + " has no readiness blockers reported.";
    const message = canQueue
      ? contract.label + " is queueable only; execution remains blocked/manual-action until execution blockers are cleared. API summary still reports realNetworkCall=false."
      : contract.label + " blocked before queueing: " + queueBlockers.map((blocker) => blocker.nextAction).join(" ") + " API summary still reports realNetworkCall=false.";
```

Return the new fields in the `ReadinessEntry` object:

```typescript
      canQueue,
      canExecute,
      queueBlockers,
      executionBlockers,
      blockers,
      recommendedNextAction,
```

- [ ] **Step 5: Rewrite `buildPolicyFailures` without message parsing**

Replace `buildPolicyFailures` with:

```typescript
function buildPolicyFailures(readiness: RealModeReadiness): string[] {
  return Object.values(readiness)
    .flatMap((entry) => entry.blockers.map((blocker) => {
      if (blocker.kind === "queue_mode") {
        return entry.label + " requires PSF_ACTION_EXECUTION_MODE=queued.";
      }
      if (blocker.kind === "route_gate") {
        const contract = gatedRealActionContracts[entry.action];
        return entry.label + " requires " + contract.gateEnv + "=true.";
      }
      if (blocker.kind === "provider_env") {
        return entry.label + " missing env: " + entry.missingEnv.join(", ") + ".";
      }
      if (blocker.kind === "worker_runtime") {
        return entry.label + " requires a configured Worker Runtime.";
      }
      if (blocker.kind === "approval") {
        return entry.label + " missing approvals: " + entry.missingApprovalTypes.join(", ") + ".";
      }
      return blocker.nextAction;
    }));
}
```

- [ ] **Step 6: Run API tests to verify GREEN**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --runInBand
```

Expected: PASS for Orchestrator API tests.

- [ ] **Step 7: Commit API contract change**

Run:

```bash
git add apps/orchestrator-api/tests/api.test.ts apps/orchestrator-api/src/services.ts
git commit -m "收敛就绪阻塞合同" -m "为 Mission summary realModeReadiness 增加 canQueue、canExecute、结构化 queue/execution blockers 和 recommendedNextAction，保留 safeToRun 作为兼容的队列就绪字段。" -m "buildPolicyFailures 改为读取结构化 blocker，不再解析 message 文案；realNetworkCall 继续保持 false，未启用任何真实 provider、push、PR 或 deploy。"
```

Expected: commit succeeds with a Chinese title and body.

## Task 3: Update Hub Consumer And Tests

**Files:**
- Modify: `apps/hub/src/api/types.ts`
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Add Hub readiness blocker types**

In `apps/hub/src/api/types.ts`, add the `ReadinessBlockerScope`, `ReadinessBlockerKind`, and `ReadinessBlocker` exports before `RealModeReadinessEntry`, then add these fields to `RealModeReadinessEntry`:

```typescript
  canQueue: boolean;
  canExecute: boolean;
  queueBlockers: ReadinessBlocker[];
  executionBlockers: ReadinessBlocker[];
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;
```

- [ ] **Step 2: Add blocker title helper in Hub**

In `apps/hub/src/App.tsx`, add this helper after `formatMissingApprovalTypes`:

```typescript
function formatReadinessBlockers(entry: MissionSummaryResponse["realModeReadiness"][keyof MissionSummaryResponse["realModeReadiness"]]): string {
  return entry.blockers.map((blocker) => blocker.nextAction).join(" ");
}
```

- [ ] **Step 3: Use `canQueue` for guarded real-action buttons**

Change the guarded real-action button block to:

```typescript
          const missingApprovalText = formatMissingApprovalTypes(entry.missingApprovalTypes);
          const blockerText = formatReadinessBlockers(entry);
          return (
            <button
              type="button"
              key={entry.action}
              disabled={busy || !entry.canQueue}
              title={[entry.message, missingApprovalText, blockerText].filter(Boolean).join(" ")}
            >
              {realActionButtonLabel(entry.action)}
            </button>
          );
```

- [ ] **Step 4: Render `canQueue` and `canExecute` in the readiness panel**

Replace the readiness status line with:

```tsx
            <span>{entry.canQueue ? "queueable/manual-action" : "blocked/manual-action"} / canQueue {String(entry.canQueue)} / canExecute {String(entry.canExecute)} / realNetworkCall {String(entry.realNetworkCall)}</span>
```

After the approval lines, add:

```tsx
            {entry.blockers.length > 0 ? <span>Next action {entry.recommendedNextAction}</span> : null}
            {entry.queueBlockers.length > 0 ? <span>Queue blockers {entry.queueBlockers.map((blocker) => blocker.kind).join(", ")}</span> : null}
            {entry.executionBlockers.length > 0 ? <span>Execution blockers {entry.executionBlockers.map((blocker) => blocker.kind).join(", ")}</span> : null}
```

- [ ] **Step 5: Update Hub test fixture**

In `apps/hub/tests/hub.test.tsx`, add these fields to every `realModeReadiness` fixture entry, adjusting `kind` and `missing` for each action:

```typescript
          canQueue: false,
          canExecute: false,
          queueBlockers: [{ scope: "queue", kind: "route_gate", message: "Gate disabled.", nextAction: "Set the route gate only after approval." }],
          executionBlockers: [{ scope: "execution", kind: "operation_gate", message: "Execution blocked.", nextAction: "Keep real operations disabled." }],
          blockers: [
            { scope: "queue", kind: "route_gate", message: "Gate disabled.", nextAction: "Set the route gate only after approval." },
            { scope: "execution", kind: "operation_gate", message: "Execution blocked.", nextAction: "Keep real operations disabled." },
          ],
          recommendedNextAction: "Set the route gate only after approval.",
```

For `codex`, use an `approval` queue blocker and `injected_runner` execution blocker so the existing missing approval assertions remain meaningful. For providers with missing env, use `provider_env` queue blockers and include the missing env name in `missing`.

- [ ] **Step 6: Update Hub assertions**

In the `renders real-mode readiness, blockers, links, statuses, and guarded real actions without secrets` test, replace the generic safe wording assertion with:

```typescript
    expect(text).toContain("blocked/manual-action");
    expect(text).toContain("canQueue false");
    expect(text).toContain("canExecute false");
    expect(text).toContain("Queue blockers");
    expect(text).toContain("Execution blockers");
    expect(text).toContain("Next action");
```

Keep these existing safety assertions:

```typescript
    expect(findButtonByText(view, "Create GitHub PR real").props.disabled).toBe(true);
    expect(findButtonByText(view, "Deploy staging real").props.disabled).toBe(true);
```

- [ ] **Step 7: Run Hub tests to verify RED/GREEN behavior**

Run after test edits and before production Hub edits:

```bash
pnpm --filter @psf/hub test -- --runInBand
```

Expected before production Hub edits: FAIL because `canQueue`, `canExecute`, and blocker rendering are missing.

Run after production Hub edits:

```bash
pnpm --filter @psf/hub test -- --runInBand
```

Expected after production Hub edits: PASS.

- [ ] **Step 8: Run Hub typecheck**

Run:

```bash
pnpm --filter @psf/hub typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Hub contract consumer change**

Run:

```bash
git add apps/hub/src/api/types.ts apps/hub/src/App.tsx apps/hub/tests/hub.test.tsx
git commit -m "更新就绪阻塞展示" -m "Hub Mission summary 使用 canQueue 保护真实动作按钮，并显示 canExecute、queue blockers、execution blockers 和 recommendedNextAction。" -m "本提交只消费 Orchestrator readiness 合同，不改变 integrations package safeToRun 语义，不启用真实 provider、push、PR、deploy、monitor 或 Plane sync。"
```

Expected: commit succeeds with a Chinese title and body.

## Task 4: Update Documentation Facts

**Files:**
- Modify: `docs/api/orchestrator-api.md`
- Modify: `docs/apps/hub-web.md`
- Modify: `docs/architecture/structure.md`
- Modify: `docs/status/progress.md`
- Modify: `docs/status/next-steps.md`
- Modify: `summary.md`
- Modify: `docs/debug/debug.md`

- [ ] **Step 1: Update API contract documentation**

In `docs/api/orchestrator-api.md`, update the Mission summary `realModeReadiness` description to state:

```markdown
`realModeReadiness` exposes queue readiness separately from execution readiness. `canQueue` means route gate, queue mode, worker runtime, integration env, and required approvals are satisfied for queuing a guarded action. `canExecute` remains `false` until a later approved task proves injected runner or transport, local mirror, target URL, selector verification, command policy, workspace guards, and operation gates. `safeToRun` is retained as a legacy queue-readiness alias and must not be interpreted as real execution permission. `queueBlockers`, `executionBlockers`, `blockers`, and `recommendedNextAction` provide operator-visible next actions. `realNetworkCall` remains `false`.
```

- [ ] **Step 2: Update Hub documentation**

In `docs/apps/hub-web.md`, add:

```markdown
Mission detail displays `canQueue`, `canExecute`, queue blockers, execution blockers, and the recommended next action for each guarded real-mode action. Guarded real-action buttons use `canQueue` as the enablement signal, but execution remains manual-action because `canExecute` is still `false` and provider/network execution is not enabled.
```

- [ ] **Step 3: Update architecture documentation**

In `docs/architecture/structure.md`, add or update the control-plane readiness paragraph:

```markdown
Mission summary readiness is a control-plane contract, not an execution grant. Orchestrator computes queue blockers from action execution mode, Worker Runtime, route gates, provider env, and approvals, then computes execution blockers from runner/transport, local mirror, target URL, selector verification, command policy, workspace guard, and operation-gate requirements. Hub renders these blockers directly. `safeToRun` is retained only as a legacy queue-readiness alias; `canQueue` and `canExecute` are the explicit fields.
```

- [ ] **Step 4: Update route/status docs**

In `docs/status/progress.md`, append a B2 completion note:

```markdown
### Batch B2: readiness/blocker 合同收敛

B2 已将 Mission summary readiness 从单一 `safeToRun` 语义收敛为 `canQueue`、`canExecute`、`queueBlockers`、`executionBlockers`、`blockers` 和 `recommendedNextAction`。`safeToRun` 仅保留为兼容的队列就绪别名；当前 `canExecute` 仍为 `false`，因为 injected runner/transport、本地 mirror、target URL、selector verification、command policy、workspace guard 和 operation gate 还没有在后续任务中证明。
```

In `docs/status/next-steps.md`, change the recommendation so B3 is the next active batch and A1 remains after B3.

- [ ] **Step 5: Update `summary.md`**

Add this line under the Superpowers plan list:

```markdown
- `docs/superpowers/plans/2026-06-04-b2-readiness-blocker-contract.md`: B2 readiness/blocker 合同收敛实施计划。
```

Update current problems/backlog so the readiness ambiguity is no longer described as purely unresolved. The remaining risk should say execution proof is still pending because `canExecute` blockers remain.

- [ ] **Step 6: Update debug log**

Append an entry to `docs/debug/debug.md` with:

```markdown
## 2026-06-04 - B2 readiness/blocker 合同收敛

- 范围：Mission summary `realModeReadiness` 和 Hub Mission Detail；未修改 integrations package `safeToRun` 语义。
- 结果：新增 `canQueue`、`canExecute`、`queueBlockers`、`executionBlockers`、`blockers` 和 `recommendedNextAction`，并保留 `safeToRun` 作为兼容队列就绪字段。
- 安全边界：`canExecute` 当前仍为 `false`；未启用 Codex、Playwright、provider network、push、PR、deploy、monitor 或 Plane sync。
- 验证：记录实际运行的 pnpm/test/typecheck/structure 命令和结果。
```

- [ ] **Step 7: Commit documentation updates**

Run:

```bash
git add docs/api/orchestrator-api.md docs/apps/hub-web.md docs/architecture/structure.md docs/status/progress.md docs/status/next-steps.md summary.md docs/debug/debug.md
git commit -m "记录就绪合同收敛" -m "同步 Orchestrator API、Hub、架构、状态、summary 和 debug 文档，明确 canQueue/canExecute 与结构化 blocker 合同。" -m "文档记录 safeToRun 仅为兼容队列就绪别名，当前 canExecute 仍为 false；未启用真实 provider、push、PR、deploy、monitor 或 Plane sync。"
```

Expected: commit succeeds with a Chinese title and body.

## Task 5: Final Verification And Merge Hygiene

**Files:**
- Read: changed files from Tasks 1-4

- [ ] **Step 1: Run focused checks**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --runInBand
pnpm --filter @psf/orchestrator-api typecheck
pnpm --filter @psf/hub test -- --runInBand
pnpm --filter @psf/hub typecheck
```

Expected: all PASS.

- [ ] **Step 2: Run structure and diff checks**

Run:

```bash
node scripts/check-phase1-structure.mjs
git diff --check
```

Expected: structure check prints `Validated 40 files and 26 directories.` and `git diff --check` prints no whitespace errors.

- [ ] **Step 3: Run safety scans with fallback**

Run:

```bash
if command -v rg >/dev/null 2>&1; then
  rg -n 'realNetworkCall.*true|realPush.*true|realDeploy.*true|create PR|deploy production' README.md AGENTS.md summary.md docs apps/orchestrator-api apps/hub
else
  grep -RInE 'realNetworkCall.*true|realPush.*true|realDeploy.*true|create PR|deploy production' README.md AGENTS.md summary.md docs apps/orchestrator-api apps/hub
fi
```

Expected: matches are allowed only when they are explicit prohibitions, safety boundaries, test fixture labels, dry-run previews, or ADR/debug history. No current text may imply provider network calls, push, real PR creation, deployment, monitor creation, or Plane sync are enabled.

- [ ] **Step 4: Confirm no undocumented Markdown change**

Run:

```bash
git diff --name-status HEAD~3..HEAD -- '*.md'
grep -n '2026-06-04-b2-readiness-blocker-contract.md' summary.md
```

Expected: every Markdown add/move/delete is represented in `summary.md`. For this plan, the B2 plan file is listed once in the Superpowers document map.

- [ ] **Step 5: Commit verification record if needed**

If Task 4 debug docs were updated before final verification results were known, amend with a focused docs commit:

```bash
git add docs/debug/debug.md docs/status/progress.md summary.md
git commit -m "补充就绪合同验证记录" -m "记录 B2 readiness/blocker 合同收敛的最终本地验证结果和安全扫描分类。" -m "本提交只更新验证记录，不启用真实 Codex、Playwright、provider network、push、PR、deploy、monitor 或 Plane sync。"
```

Expected: commit succeeds only if there are verification documentation changes.

## Self-Review

- Spec coverage: B2 defines `canQueue`/`canExecute`, standardizes queue and execution blockers, keeps `realNetworkCall=false`, and improves Hub visibility. B1/B3/A1 are not implemented here.
- Placeholder scan: this plan contains concrete file paths, code snippets, commands, and expected results.
- Type consistency: API and Hub both use `ReadinessBlockerScope`, `ReadinessBlockerKind`, `ReadinessBlocker`, `canQueue`, `canExecute`, `queueBlockers`, `executionBlockers`, `blockers`, and `recommendedNextAction`.
