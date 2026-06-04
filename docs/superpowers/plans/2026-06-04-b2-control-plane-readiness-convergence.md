# B2 Control Plane Readiness Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved B2 readiness/blocker contract so API, Hub, Worker Runner, and integration outputs expose `canQueue`, `canExecute`, structured `blockers[]`, and `recommendedNextAction` while preserving `safeToRun` as legacy route-level readiness.

**Architecture:** Orchestrator API is the canonical response outlet. B2 adds local readiness helpers inside Orchestrator and source-specific mappers at Worker Runner and integration boundaries; it does not force a shared package schema migration. Hub consumes API readiness only and stops using `safeToRun` as the primary control for guarded actions.

**Tech Stack:** TypeScript, Fastify service layer, React/Vite Hub, Vitest, pnpm workspaces, existing redaction helpers from `@psf/integrations`.

---

## Scope Boundary

Implement only B2 from `docs/superpowers/specs/2026-06-04-control-plane-readiness-convergence-design.md`.

Do not enable real Codex, real Playwright/browser, provider network calls, push, PR creation, deploy, monitor creation, or Plane sync. Default `realNetworkCall`, `realExternalCall`, `realPush`, and `realDeploy` must stay explicitly false wherever those fields appear on readiness, blocked/manual-action, gated real action response, or Worker Runner real-job wrapper/child output.

Keep `safeToRun` as a compatibility field. Treat it as legacy route-level queue readiness only. New tests and UI behavior must use `canQueue`, `canExecute`, and `blockers[]`.

B2 may add focused contract tests and minimal production code. B3 remains the follow-up for broader contract-test reinforcement after this implementation is complete.

## File Structure

Create these files:

- `apps/orchestrator-api/src/readiness.ts`: Orchestrator-local canonical readiness/blocker types and helper functions.
- `apps/worker-runner/src/readiness-blockers.ts`: Worker Runner-local blocker mapper helpers for real-job wrapper outputs.

Modify these files:

- `apps/orchestrator-api/src/services.ts`: use Orchestrator readiness helpers in Mission summary, dashboard readiness, and route/preflight blocked details.
- `apps/orchestrator-api/src/actions.ts`: add blocker-aware gated real action responses for route gate and queue-mode blockers.
- `apps/orchestrator-api/tests/api.test.ts`: add failing contract tests before implementation and update compatibility expectations.
- `apps/hub/src/api/types.ts`: add local API response types for `ReadinessBlocker`, `canQueue`, `canExecute`, and safety flags.
- `apps/hub/src/App.tsx`: render queue/execute readiness and blocker list; use `canQueue` for guarded buttons; avoid `Run real ...` labels.
- `apps/hub/tests/hub.test.tsx`: lock Hub display and button wording against the new contract.
- `apps/worker-runner/src/handlers.ts`: attach blockers to manual-action/blocked real-job handler results.
- `apps/worker-runner/src/runner.ts`: persist blockers on wrapper output and `mission.action_result` events.
- `apps/worker-runner/tests/runner.test.ts`: assert Worker Runner blockers preserve queue semantics and do not expose secrets.
- `packages/integrations/src/github-real.ts`: add `IntegrationReadinessBlocker` to real integration result shape and derive blockers from missing env, manual actions, gates, and unclassified manual-action state.
- `packages/integrations/tests/integrations.test.ts`: assert integration blockers for disabled real mode, missing transport/gates, and fake transport success.
- `docs/api/orchestrator-api.md`: document the new readiness/blocker fields and legacy `safeToRun` boundary.
- `docs/apps/hub-web.md`: document Hub readiness display changes at a high level.
- `docs/status/progress.md`: record that B2 has been implemented only after code and tests pass.
- `docs/debug/debug.md`: record focused verification results only after code and tests pass.
- `summary.md`: add this implementation plan to the Markdown document map.

Read these files during execution:

- `docs/superpowers/specs/2026-06-04-control-plane-readiness-convergence-design.md`
- `docs/api/orchestrator-api.md`
- `docs/apps/hub-web.md`
- `docs/security/safety.md`
- `docs/runtime/queue-runtime.md`

## Task 1: Orchestrator Readiness Helper

**Files:**
- Create: `apps/orchestrator-api/src/readiness.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `apps/orchestrator-api/src/services.ts`

- [ ] **Step 1: Write failing Mission summary readiness assertions**

In `apps/orchestrator-api/tests/api.test.ts`, extend the existing test named `reports missing approval types in real-mode readiness` with these assertions after the existing `toMatchObject` call:

```ts
const codexReadiness = response.json().realModeReadiness.codex;
expect(codexReadiness).toMatchObject({
  canQueue: false,
  canExecute: false,
  realNetworkCall: false,
  realExternalCall: false,
  realPush: false,
  realDeploy: false,
  recommendedNextAction: expect.stringContaining("SECURITY_RISK"),
});
expect(codexReadiness.blockers).toEqual(expect.arrayContaining([
  expect.objectContaining({
    category: "approval",
    key: "approval.SECURITY_RISK.missing",
    severity: "blocking",
    blocks: ["queue", "execute"],
    source: "orchestrator",
    details: { action: "codex-real", approvalType: "SECURITY_RISK" },
  }),
  expect.objectContaining({
    category: "execution",
    key: "execution.codex.injected_runner_missing",
    severity: "manual_action",
    blocks: ["execute"],
    source: "orchestrator",
    details: expect.objectContaining({ action: "codex-real", evidence: "known_static" }),
  }),
]));
```

- [ ] **Step 2: Run the focused API test and verify it fails**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'reports missing approval types in real-mode readiness'
```

Expected: FAIL because `canQueue`, `canExecute`, `blockers`, and the extra safety flags do not exist on readiness entries yet.

- [ ] **Step 3: Add the Orchestrator readiness helper**

Create `apps/orchestrator-api/src/readiness.ts` with this content:

```ts
import { isSecretLikeName, redactValue } from "@psf/integrations";

export type ReadinessBlockerCategory = "queue_acceptance" | "approval" | "configuration" | "policy" | "execution" | "safety";
export type ReadinessBlockerSeverity = "blocking" | "manual_action" | "warning" | "info";
export type ReadinessBlockTarget = "queue" | "execute";
export type ReadinessBlockerSource = "orchestrator" | "worker_runner" | "integration" | "worker";

export interface ReadinessBlocker {
  category: ReadinessBlockerCategory;
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: ReadinessBlockerSeverity;
  blocks: ReadinessBlockTarget[];
  source: ReadinessBlockerSource;
  details?: Record<string, unknown>;
}

export interface ReadinessState {
  canQueue: boolean;
  canExecute: boolean;
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;
}

const severityRank: Record<ReadinessBlockerSeverity, number> = {
  blocking: 0,
  manual_action: 1,
  warning: 2,
  info: 3,
};

const categoryRank: Record<ReadinessBlockerCategory, number> = {
  queue_acceptance: 0,
  approval: 1,
  configuration: 2,
  policy: 3,
  execution: 4,
  safety: 5,
};

export function buildReadinessBlocker(input: ReadinessBlocker): ReadinessBlocker {
  const blocks = uniqueBlocks(input.blocks);
  return {
    ...input,
    blocks,
    details: input.details === undefined ? undefined : sanitizeBlockerDetails(input.details),
  };
}

export function sortReadinessBlockers(blockers: ReadinessBlocker[]): ReadinessBlocker[] {
  return [...blockers].sort((left, right) => {
    const severity = severityRank[left.severity] - severityRank[right.severity];
    if (severity !== 0) return severity;
    const blockScope = blockRank(left) - blockRank(right);
    if (blockScope !== 0) return blockScope;
    const category = categoryRank[left.category] - categoryRank[right.category];
    if (category !== 0) return category;
    return left.key.localeCompare(right.key);
  });
}

export function deriveReadinessState(blockers: ReadinessBlocker[], fallbackRecommendedNextAction: string): ReadinessState {
  const sorted = sortReadinessBlockers(blockers.map((blocker) => buildReadinessBlocker(blocker)));
  const canQueue = sorted.every((blocker) => !blocker.blocks.includes("queue"));
  const canExecute = canQueue && sorted.every((blocker) => !blocker.blocks.includes("execute"));
  return {
    canQueue,
    canExecute,
    blockers: sorted,
    recommendedNextAction: sorted[0]?.recommendedNextAction ?? fallbackRecommendedNextAction,
  };
}

function uniqueBlocks(blocks: ReadinessBlockTarget[]): ReadinessBlockTarget[] {
  const output: ReadinessBlockTarget[] = [];
  for (const block of blocks) {
    if ((block === "queue" || block === "execute") && !output.includes(block)) {
      output.push(block);
    }
  }
  return output;
}

function blockRank(blocker: ReadinessBlocker): number {
  return blocker.blocks.includes("queue") ? 0 : 1;
}

function sanitizeBlockerDetails(details: Record<string, unknown>): Record<string, unknown> {
  return redactValue(Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, isSecretLikeName(key) ? "[REDACTED]" : sanitizeDetailValue(value)]),
  ), process.env) as Record<string, unknown>;
}

function sanitizeDetailValue(value: unknown): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeDetailValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      isSecretLikeName(key) ? "[REDACTED]" : sanitizeDetailValue(nested),
    ]));
  }
  return String(value);
}
```

- [ ] **Step 4: Extend Orchestrator readiness types and imports**

In `apps/orchestrator-api/src/services.ts`, import the helper:

```ts
import { buildReadinessBlocker, deriveReadinessState, type ReadinessBlocker } from "./readiness.js";
```

Extend `ReadinessEntry` with:

```ts
  canQueue: boolean;
  canExecute: boolean;
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
```

- [ ] **Step 5: Replace string-only blocker construction in `buildRealModeReadiness`**

Inside `buildRealModeReadiness`, replace `const blockers: string[] = []` and its push calls with structured blockers. Use this shape and keep the existing `safeToRun` calculation unchanged:

```ts
    const blockers: ReadinessBlocker[] = [];
    if (!queueReady) {
      blockers.push(buildReadinessBlocker({
        category: "queue_acceptance",
        key: "queue_acceptance.action_execution_mode",
        message: "Action execution mode must be queued before this gated contract job can be accepted.",
        recommendedNextAction: "Set PSF_ACTION_EXECUTION_MODE=queued and configure Worker Runtime before retrying.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, required: "queued", actual: input.actionExecutionMode },
      }));
    }
    if (!input.workerRuntimeConfigured) {
      blockers.push(buildReadinessBlocker({
        category: "queue_acceptance",
        key: "queue_acceptance.worker_runtime_missing",
        message: "Worker Runtime is not configured for queued gated actions.",
        recommendedNextAction: "Configure PSF_WORKER_RUNTIME and start or refresh the Worker Runner.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action },
      }));
    }
    if (!enabled) {
      blockers.push(buildReadinessBlocker({
        category: "queue_acceptance",
        key: "queue_acceptance.route_gate." + contract.gateEnv,
        message: contract.label + " requires " + contract.gateEnv + "=true before Orchestrator can queue it.",
        recommendedNextAction: "Set " + contract.gateEnv + "=true only after approvals and worker support are ready.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, gateEnv: contract.gateEnv },
      }));
    }
    for (const envName of missingEnv) {
      blockers.push(buildReadinessBlocker({
        category: "configuration",
        key: "configuration.env." + envName + ".missing",
        message: contract.label + " is missing required provider environment variable " + envName + ".",
        recommendedNextAction: "Configure " + envName + " in local env or keep this action in manual-action mode.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, envName },
      }));
    }
    for (const approvalType of approvalCoverage.missingApprovalTypes) {
      blockers.push(buildReadinessBlocker({
        category: "approval",
        key: "approval." + approvalType + ".missing",
        message: contract.label + " is missing approved Mission approval " + approvalType + ".",
        recommendedNextAction: "Create and approve a Mission approval of type " + approvalType + " before queueing this action.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action: definition.action, approvalType },
      }));
    }
    blockers.push(...knownStaticExecutionBlockers(key, definition.action));
    const readinessState = deriveReadinessState(blockers, contract.label + " has no known blockers; review Worker Runner output before advancing the Mission.");
```

Add this helper near `buildRealModeReadiness`:

```ts
function knownStaticExecutionBlockers(key: ReadinessKey, action: GatedRealActionKind): ReadinessBlocker[] {
  switch (action) {
    case "codex-real":
    case "fix-real":
      return [buildReadinessBlocker({
        category: "execution",
        key: action === "codex-real" ? "execution.codex.injected_runner_missing" : "execution.fix.injected_runner_missing",
        message: "Default Worker Runner has no injected Codex runner configured for " + action + ".",
        recommendedNextAction: "Inject an approved local runner or expect the queued job to return manual-action.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
    case "github-pr":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.github.injected_transport_missing",
        message: "Default GitHub PR path has no injected transport and operation gates are disabled.",
        recommendedNextAction: "Review the PR preview/manual-action output; do not expect push or PR creation.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static", realPush: false },
      })];
    case "qa-playwright":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.qa.selector_verification_required",
        message: "Playwright QA execution still requires verified target URL and selectors at route or worker time.",
        recommendedNextAction: "Verify target URL and selectors before treating QA execution as ready.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
    case "qa-ai-exploratory":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.qa_ai.executor_missing",
        message: "AI exploratory QA has no approved executor path by default.",
        recommendedNextAction: "Keep AI exploratory QA in manual-action mode until an approved executor is configured.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
    case "deploy-staging":
    case "monitor-sync":
    case "plane-sync":
      return [buildReadinessBlocker({
        category: "execution",
        key: "execution.integration.injected_transport_missing." + action,
        message: "Default integration path has no injected transport for " + action + ".",
        recommendedNextAction: "Keep this integration in manual-action mode until an approved injected transport is configured.",
        severity: "manual_action",
        blocks: ["execute"],
        source: "orchestrator",
        details: { action, readinessKey: key, evidence: "known_static" },
      })];
  }
}
```

- [ ] **Step 6: Return the new readiness fields**

In the object returned by `buildRealModeReadiness`, add:

```ts
      canQueue: readinessState.canQueue,
      canExecute: readinessState.canExecute,
      blockers: readinessState.blockers,
      recommendedNextAction: readinessState.recommendedNextAction,
      realExternalCall: false as const,
      realPush: false as const,
      realDeploy: false as const,
```

Change `message` construction to use the structured blocker messages:

```ts
    const message = safeToRun
      ? contract.label + " is ready to queue at the legacy route level; execution readiness is represented by canExecute and blockers."
      : contract.label + " blocked/manual-action: " + readinessState.blockers.map((blocker) => blocker.message).join("; ") + ".";
```

- [ ] **Step 7: Run the focused API test and verify it passes**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'reports missing approval types in real-mode readiness'
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add apps/orchestrator-api/src/readiness.ts apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "实现就绪阻塞合同核心" -m "为 Orchestrator readiness 增加 canQueue、canExecute、blockers[] 和 recommendedNextAction，同时保留 safeToRun 的 legacy route-level 语义。" -m "未启用真实 Codex、Playwright/browser、provider network、push、PR、deploy、monitor 或 Plane sync。"
```

Expected: commit succeeds.

## Task 2: Route And Preflight Blocker Responses

**Files:**
- Modify: `apps/orchestrator-api/src/actions.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Write failing route blocked response assertions**

In `apps/orchestrator-api/tests/api.test.ts`, extend the gated route test that expects `status: "blocked"` for disabled gates. After the existing `toMatchObject`, add:

```ts
const body = response.json();
expect(body).toMatchObject({
  canQueue: false,
  canExecute: false,
  realNetworkCall: false,
  realExternalCall: false,
  realPush: false,
  realDeploy: false,
});
expect(body.blockers).toEqual(expect.arrayContaining([
  expect.objectContaining({
    category: "queue_acceptance",
    key: "queue_acceptance.route_gate." + route.gate,
    severity: "blocking",
    blocks: ["queue", "execute"],
    source: "orchestrator",
  }),
]));
expect(body.recommendedNextAction).toContain(route.gate);
```

- [ ] **Step 2: Write failing preflight error assertions**

In the test `blocks qa-playwright preflight when request and passport target URLs are absent`, add assertions against `response.json().details`:

```ts
const details = response.json().details;
expect(details).toMatchObject({
  canQueue: false,
  canExecute: false,
});
expect(details.blockers).toEqual(expect.arrayContaining([
  expect.objectContaining({
    category: "configuration",
    key: "configuration.target_url.missing",
    severity: "blocking",
    blocks: ["queue", "execute"],
    source: "orchestrator",
    details: expect.objectContaining({ action: "qa-playwright", missingTargetUrl: true }),
  }),
]));
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'blocks gated real actions when route gates are disabled|blocks qa-playwright preflight when request and passport target URLs are absent'
```

Expected: FAIL because route and preflight bodies do not yet contain the new blocker shape.

- [ ] **Step 4: Add blocker state to `toBlockedRealActionResponse`**

In `apps/orchestrator-api/src/actions.ts`, import helpers:

```ts
import { buildReadinessBlocker, deriveReadinessState, type ReadinessBlocker } from "./readiness.js";
```

Extend `GatedRealActionResponseInput`:

```ts
  realEnabled?: boolean;
  blockers?: ReadinessBlocker[];
```

Inside `toBlockedRealActionResponse`, before `return`, build default blockers:

```ts
  const blockers = input.blockers ?? [buildReadinessBlocker({
    category: "queue_acceptance",
    key: "queue_acceptance.route_gate." + contract.gateEnv,
    message: contract.label + " requires " + contract.gateEnv + "=true and PSF_ACTION_EXECUTION_MODE=queued before Orchestrator can queue it.",
    recommendedNextAction: "Set " + contract.gateEnv + "=true and PSF_ACTION_EXECUTION_MODE=queued after approvals and worker support are ready.",
    severity: "blocking",
    blocks: ["queue", "execute"],
    source: "orchestrator",
    details: { action: input.action, gateEnv: contract.gateEnv, executionMode: input.executionMode },
  })];
  const readinessState = deriveReadinessState(blockers, "Resolve real-action route blockers before retrying.");
```

Add these fields to the returned object:

```ts
    realEnabled: input.realEnabled ?? false,
    canQueue: readinessState.canQueue,
    canExecute: readinessState.canExecute,
    blockers: readinessState.blockers,
    recommendedNextAction: readinessState.recommendedNextAction,
```

Remove the older hard-coded `realEnabled: false` and hard-coded `recommendedNextAction` fields from the same returned object.

- [ ] **Step 5: Add preflight blocker details helper in services**

In `apps/orchestrator-api/src/services.ts`, add this helper near `actionPreflightBlocked`:

```ts
function blockedPreflightDetails(blocker: ReadinessBlocker, extra: Record<string, unknown>) {
  const readinessState = deriveReadinessState([blocker], blocker.recommendedNextAction);
  return {
    ...extra,
    canQueue: readinessState.canQueue,
    canExecute: readinessState.canExecute,
    blockers: readinessState.blockers,
    recommendedNextAction: readinessState.recommendedNextAction,
    realNetworkCall: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
  };
}
```

Use it in `assertGatedRealTargetUrlAvailable` for missing target URL:

```ts
      ...blockedPreflightDetails(buildReadinessBlocker({
        category: "configuration",
        key: "configuration.target_url.missing",
        message: action + " requires a local, staging, or production target URL.",
        recommendedNextAction: "Add urls.local, urls.staging, or urls.production to project.passport.yaml before enabling this action.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action, missingTargetUrl: true },
      }), {
        projectId: registryProject.project.id,
        passportPath: registryProject.passportPath,
        action,
        missingTargetUrl: true,
      }),
```

- [ ] **Step 6: Add approval blockers in `runGatedRealAction`**

When `approvalCoverage.missingApprovalTypes.length > 0`, build approval blockers and pass them to `toBlockedRealActionResponse`:

```ts
      const approvalBlockers = approvalCoverage.missingApprovalTypes.map((approvalType) => buildReadinessBlocker({
        category: "approval",
        key: "approval." + approvalType + ".missing",
        message: action + " is missing approved Mission approval " + approvalType + ".",
        recommendedNextAction: "Create and approve a Mission approval of type " + approvalType + " before queueing this action.",
        severity: "blocking",
        blocks: ["queue", "execute"],
        source: "orchestrator",
        details: { action, approvalType },
      }));
```

Pass `realEnabled` and merged blockers into `toBlockedRealActionResponse`:

```ts
        realEnabled,
        blockers: approvalCoverage.missingApprovalTypes.length > 0 ? approvalBlockers : undefined,
```

- [ ] **Step 7: Run focused API tests**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t 'gated real actions|preflight|real-mode readiness'
```

Expected: PASS for the focused gated real action and readiness tests.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add apps/orchestrator-api/src/actions.ts apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "统一真实动作阻塞响应" -m "为 gated real action blocked responses 和 preflight errors 增加 canQueue、canExecute、blockers[] 与 redacted details。" -m "保持 safeToRun 为 legacy route-level 字段，默认真实外部动作仍全部禁用。"
```

Expected: commit succeeds.

## Task 3: Hub Readiness UX

**Files:**
- Modify: `apps/hub/src/api/types.ts`
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Write failing Hub contract assertions**

In `apps/hub/tests/hub.test.tsx`, update the `realModeReadiness` fixture in the test named `renders real-mode readiness, blockers, links, statuses, and guarded real actions without secrets` by adding `canQueue`, `canExecute`, `realExternalCall`, `realPush`, `realDeploy`, `recommendedNextAction`, and `blockers` to the `github` entry:

```ts
          canQueue: true,
          canExecute: false,
          realExternalCall: false,
          realPush: false,
          realDeploy: false,
          recommendedNextAction: "Review PR preview/manual-action output; no push or PR creation will occur.",
          blockers: [
            {
              category: "execution",
              key: "execution.github.injected_transport_missing",
              message: "Default GitHub PR path has no injected transport.",
              recommendedNextAction: "Review PR preview/manual-action output; no push or PR creation will occur.",
              severity: "manual_action",
              blocks: ["execute"],
              source: "orchestrator",
              details: { action: "github-pr", evidence: "known_static" },
            },
          ],
```

Add these assertions after `const text = textFromElement(view);`:

```ts
expect(text).toContain("Queue: ready");
expect(text).toContain("Execute: manual-action");
expect(text).toContain("Default GitHub PR path has no injected transport.");
expect(text).toContain("Review PR preview/manual-action output; no push or PR creation will occur.");
expect(text).toContain("Create PR preview/manual-action");
expect(text).not.toContain("Create GitHub PR real");
expect(text).not.toContain("Run Codex real");
```

- [ ] **Step 2: Run focused Hub test and verify it fails**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'renders real-mode readiness'
```

Expected: FAIL because Hub types and UI do not yet support `canQueue`, `canExecute`, and blockers.

- [ ] **Step 3: Extend Hub API types**

In `apps/hub/src/api/types.ts`, add before `RealModeReadinessEntry`:

```ts
export interface ReadinessBlocker {
  category: "queue_acceptance" | "approval" | "configuration" | "policy" | "execution" | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: "blocking" | "manual_action" | "warning" | "info";
  blocks: Array<"queue" | "execute">;
  source: "orchestrator" | "worker_runner" | "integration" | "worker";
  details?: JsonRecord;
}
```

Extend `RealModeReadinessEntry`:

```ts
  canQueue?: boolean;
  canExecute?: boolean;
  blockers?: ReadinessBlocker[];
  recommendedNextAction?: string;
  realExternalCall?: false;
  realPush?: false;
  realDeploy?: false;
```

Use optional fields so Hub remains compatible with an older API during local development.

- [ ] **Step 4: Update guarded action buttons**

In `apps/hub/src/App.tsx`, change guarded action button disabling and labels:

```tsx
          const canQueue = entry.canQueue ?? entry.safeToRun;
          const blockers = entry.blockers ?? [];
          const title = [entry.recommendedNextAction ?? entry.message, ...blockers.map((blocker) => blocker.message)].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              key={entry.action}
              disabled={busy || !canQueue}
              title={title}
            >
              {realActionButtonLabel(entry)}
            </button>
          );
```

Replace `realActionButtonLabel(action: string)` with:

```tsx
function realActionButtonLabel(entry: MissionSummaryResponse["realModeReadiness"][RealModeReadinessKey]): string {
  const canExecute = entry.canExecute === true;
  switch (entry.action) {
    case "codex-real":
      return canExecute ? "Queue gated Codex" : "Queue Codex manual-action";
    case "qa-playwright":
      return canExecute ? "Queue gated Playwright QA" : "Queue gated QA evidence";
    case "qa-ai-exploratory":
      return canExecute ? "Queue gated AI QA" : "Queue AI QA manual-action";
    case "fix-real":
      return canExecute ? "Queue gated fix" : "Queue fix manual-action";
    case "github-pr":
      return canExecute ? "Queue GitHub PR contract" : "Create PR preview/manual-action";
    case "deploy-staging":
      return canExecute ? "Queue gated deploy" : "Queue deploy manual-action";
    case "monitor-sync":
      return canExecute ? "Queue monitor sync" : "Queue monitor manual-action";
    case "plane-sync":
      return canExecute ? "Queue Plane sync" : "Queue Plane manual-action";
    default:
      return "Queue gated action";
  }
}
```

- [ ] **Step 5: Update readiness panel rendering**

Inside `renderRealModeReadiness`, replace the `safeToRun` status line with:

```tsx
            <span>{`Queue: ${entry.canQueue ?? entry.safeToRun ? "ready" : "blocked"} / Execute: ${entry.canExecute ? "ready" : "manual-action"} / realNetworkCall ${String(entry.realNetworkCall)}`}</span>
            <span>{entry.recommendedNextAction ?? entry.message}</span>
            {(entry.blockers ?? []).map((blocker) => (
              <span key={blocker.key}>{`${blocker.severity} ${blocker.category}: ${blocker.message}`}</span>
            ))}
```

Keep the existing missing env and approval lines for compatibility.

- [ ] **Step 6: Run focused Hub test**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t 'renders real-mode readiness'
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add apps/hub/src/api/types.ts apps/hub/src/App.tsx apps/hub/tests/hub.test.tsx
git commit -m "更新 Hub 就绪阻塞展示" -m "Hub 改用 canQueue/canExecute/blockers[] 展示 readiness，并避免 Run real 文案误导 operator。" -m "Hub 只消费 API readiness，不自行推断 env、approval、transport 或 operation gates。"
```

Expected: commit succeeds.

## Task 4: Worker Runner Blocker Outputs

**Files:**
- Create: `apps/worker-runner/src/readiness-blockers.ts`
- Modify: `apps/worker-runner/src/handlers.ts`
- Modify: `apps/worker-runner/src/runner.ts`
- Modify: `apps/worker-runner/tests/runner.test.ts`

- [ ] **Step 1: Write failing Worker Runner blocker assertions**

In `apps/worker-runner/tests/runner.test.ts`, in the test `returns manual_action for codex.real default handler when no injected Codex runner is configured`, add:

```ts
expect(wrapper.output).toMatchObject({
  canQueue: true,
  canExecute: false,
  blockers: [expect.objectContaining({
    category: "execution",
    key: "execution.codex.injected_runner_missing",
    severity: "manual_action",
    blocks: ["execute"],
    source: "worker_runner",
  })],
});
```

In the test `keeps github.pr default manual-action without network and persists a PR preview artifact`, add:

```ts
expect(wrapper.output).toMatchObject({
  canQueue: true,
  canExecute: false,
  blockers: expect.arrayContaining([
    expect.objectContaining({ key: "execution.integration.injected_transport_missing", blocks: ["execute"] }),
    expect.objectContaining({ key: "policy.integration.operation_gate_disabled", blocks: ["execute"] }),
  ]),
});
```

- [ ] **Step 2: Run focused Worker Runner tests and verify they fail**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'manual_action for codex.real default handler|github.pr default manual-action'
```

Expected: FAIL because wrapper outputs do not contain `canQueue`, `canExecute`, or `blockers`.

- [ ] **Step 3: Add Worker Runner blocker helper**

Create `apps/worker-runner/src/readiness-blockers.ts`:

```ts
import type { GitHubRealResult } from "@psf/integrations";

export interface WorkerReadinessBlocker {
  category: "queue_acceptance" | "approval" | "configuration" | "policy" | "execution" | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: "blocking" | "manual_action" | "warning" | "info";
  blocks: Array<"queue" | "execute">;
  source: "worker_runner" | "integration" | "worker";
  details?: Record<string, unknown>;
}

export function deriveWorkerReadiness(blockers: WorkerReadinessBlocker[], fallbackRecommendedNextAction: string) {
  const sorted = sortWorkerBlockers(blockers);
  const canQueue = true;
  const canExecute = canQueue && sorted.every((blocker) => !blocker.blocks.includes("execute"));
  return {
    canQueue,
    canExecute,
    blockers: sorted,
    recommendedNextAction: sorted[0]?.recommendedNextAction ?? fallbackRecommendedNextAction,
  };
}

export function codexManualActionBlocker(reason: string): WorkerReadinessBlocker {
  const key = reason.includes("repoUrl")
    ? "policy.codex.local_mirror_required"
    : reason.includes("branchName")
      ? "policy.codex.branch_policy"
      : "execution.codex.injected_runner_missing";
  return {
    category: key.startsWith("policy.") ? "policy" : "execution",
    key,
    message: reason,
    recommendedNextAction: key === "execution.codex.injected_runner_missing"
      ? "Inject an approved local Codex runner or handle this action manually."
      : "Review route preflight and Worker Runner defense-in-depth policy before retrying.",
    severity: key.startsWith("policy.") ? "blocking" : "manual_action",
    blocks: ["execute"],
    source: "worker_runner",
    details: { jobType: "codex.real", defenseInDepth: key.startsWith("policy.") },
  };
}

export function githubResultBlockers(result: GitHubRealResult): WorkerReadinessBlocker[] {
  const blockers: WorkerReadinessBlocker[] = [];
  if (result.outputs.manualActions.some((action) => action.toLowerCase().includes("transport"))) {
    blockers.push({
      category: "execution",
      key: "execution.integration.injected_transport_missing",
      message: "GitHub PR requires an injected transport before any provider request.",
      recommendedNextAction: "Review PR preview/manual-action output; no push or PR creation occurred.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github" },
    });
  }
  if (result.outputs.manualActions.some((action) => action.toLowerCase().includes("operation gate") || action.toLowerCase().includes("allowpushbranch") || action.toLowerCase().includes("allowcreatepullrequest"))) {
    blockers.push({
      category: "policy",
      key: "policy.integration.operation_gate_disabled",
      message: "GitHub PR operation gates are disabled by default.",
      recommendedNextAction: "Keep the PR preview in manual-action mode until operation gates and transport are explicitly approved.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github", realPush: false },
    });
  }
  if (result.decision !== "succeeded" && blockers.length === 0) {
    blockers.push({
      category: "execution",
      key: "execution.integration.unclassified_execution_blocker",
      message: result.message,
      recommendedNextAction: "Inspect the integration adapter output before retrying.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { jobType: "github.pr", provider: "github" },
    });
  }
  return sortWorkerBlockers(blockers);
}

function sortWorkerBlockers(blockers: WorkerReadinessBlocker[]): WorkerReadinessBlocker[] {
  const severityRank = { blocking: 0, manual_action: 1, warning: 2, info: 3 } as const;
  const categoryRank = { queue_acceptance: 0, approval: 1, configuration: 2, policy: 3, execution: 4, safety: 5 } as const;
  return [...blockers].sort((left, right) => {
    const severity = severityRank[left.severity] - severityRank[right.severity];
    if (severity !== 0) return severity;
    const block = (left.blocks.includes("queue") ? 0 : 1) - (right.blocks.includes("queue") ? 0 : 1);
    if (block !== 0) return block;
    const category = categoryRank[left.category] - categoryRank[right.category];
    if (category !== 0) return category;
    return left.key.localeCompare(right.key);
  });
}
```

- [ ] **Step 4: Thread blockers through handler results**

In `apps/worker-runner/src/handlers.ts`, import helper functions:

```ts
import { codexManualActionBlocker, deriveWorkerReadiness, githubResultBlockers, type WorkerReadinessBlocker } from "./readiness-blockers.js";
```

Add to `WorkerJobHandlerResult`:

```ts
  canQueue?: boolean;
  canExecute?: boolean;
  blockers?: WorkerReadinessBlocker[];
```

In `toCodexRealHandlerResult`, create readiness before return:

```ts
  const readiness = result.status === "blocked" || result.status === "manual_action"
    ? deriveWorkerReadiness([codexManualActionBlocker(result.reason)], codexRecommendedNextAction(result))
    : deriveWorkerReadiness([], codexRecommendedNextAction(result));
```

Add to its return object:

```ts
    canQueue: readiness.canQueue,
    canExecute: readiness.canExecute,
    blockers: readiness.blockers,
```

In `toGitHubPrHandlerResult`, create readiness:

```ts
  const readiness = deriveWorkerReadiness(githubResultBlockers(result), result.safeToRun
    ? "Review GitHub PR result and PR URL before advancing the Mission."
    : "Review PR preview and complete missing GitHub approval, env, route, operation, or transport gates.");
```

Add to its return object:

```ts
    canQueue: readiness.canQueue,
    canExecute: readiness.canExecute,
    blockers: readiness.blockers,
```

- [ ] **Step 5: Persist blockers on wrapper output and action_result**

In `apps/worker-runner/src/runner.ts`, add `canQueue`, `canExecute`, and `blockers` to the `recordMissionActionResult` payload and `buildSafeOutput` return object:

```ts
      ...(result.canQueue === undefined ? {} : { canQueue: result.canQueue }),
      ...(result.canExecute === undefined ? {} : { canExecute: result.canExecute }),
      ...(result.blockers === undefined ? {} : { blockers: result.blockers }),
```

- [ ] **Step 6: Run focused Worker Runner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t 'manual_action for codex.real default handler|github.pr default manual-action'
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add apps/worker-runner/src/readiness-blockers.ts apps/worker-runner/src/handlers.ts apps/worker-runner/src/runner.ts apps/worker-runner/tests/runner.test.ts
git commit -m "记录 Worker Runner 阻塞合同" -m "Worker Runner real-job manual-action 输出现在携带 canQueue、canExecute 和 execution blockers，同时不回写已入队任务的 queue 语义。" -m "默认不执行 Codex、不 push、不创建 PR、不调用 provider network。"
```

Expected: commit succeeds.

## Task 5: Integration Real Result Blockers

**Files:**
- Modify: `packages/integrations/src/github-real.ts`
- Modify: `packages/integrations/tests/integrations.test.ts`

- [ ] **Step 1: Write failing integration blocker assertions**

In `packages/integrations/tests/integrations.test.ts`, in the test `returns manual-action guidance with no network when real mode is disabled`, add inside the `for (const result of results)` block:

```ts
expect(result.blockers.length).toBeGreaterThan(0);
expect(result.blockers[0]).toMatchObject({
  severity: "manual_action",
  blocks: ["execute"],
  source: "integration",
});
expect(textOf(result)).not.toContain("ghp_real_secret");
expect(textOf(result)).not.toContain("coolify_real_secret");
expect(textOf(result)).not.toContain("kuma_real_secret");
expect(textOf(result)).not.toContain("plane_real_secret");
```

In the GitHub missing operation gate test path, add:

```ts
expect(result.blockers).toEqual(expect.arrayContaining([
  expect.objectContaining({
    key: "policy.integration.operation_gate_disabled",
    blocks: ["execute"],
    source: "integration",
  }),
]));
```

- [ ] **Step 2: Run focused integration tests and verify they fail**

Run:

```bash
pnpm --filter @psf/integrations test -- --run tests/integrations.test.ts -t 'manual-action guidance|operation gate'
```

Expected: FAIL because real integration results do not yet contain `blockers`.

- [ ] **Step 3: Add integration blocker type and builder**

In `packages/integrations/src/github-real.ts`, add after `RealIntegrationDecision`:

```ts
export interface IntegrationReadinessBlocker {
  category: "queue_acceptance" | "approval" | "configuration" | "policy" | "execution" | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: "blocking" | "manual_action" | "warning" | "info";
  blocks: Array<"queue" | "execute">;
  source: "integration";
  details?: Record<string, unknown>;
}
```

Add to `IntegrationRealResult`:

```ts
  blockers: IntegrationReadinessBlocker[];
```

Add `blockers?: IntegrationReadinessBlocker[];` to `buildRealResult` fields.

- [ ] **Step 4: Derive integration blockers in `buildRealResult`**

In `buildRealResult`, before `const result`, add:

```ts
  const blockers = sortIntegrationBlockers(fields.blockers ?? integrationBlockersFromResult({
    integrationName: integrationDefinition.name,
    decision: fields.decision,
    message: fields.message,
    missingEnv,
    outputs: fields.outputs,
  }));
```

Add `blockers` to `result`.

Add these helper functions near `buildRealResult`:

```ts
function integrationBlockersFromResult(input: {
  integrationName: IntegrationName;
  decision: RealIntegrationDecision;
  message: string;
  missingEnv: string[];
  outputs: object;
}): IntegrationReadinessBlocker[] {
  const blockers: IntegrationReadinessBlocker[] = [];
  for (const envName of input.missingEnv) {
    blockers.push({
      category: "configuration",
      key: "configuration.env." + envName + ".missing",
      message: input.integrationName + " is missing required environment variable " + envName + ".",
      recommendedNextAction: "Configure " + envName + " or keep this integration in manual-action mode.",
      severity: "blocking",
      blocks: ["execute"],
      source: "integration",
      details: { provider: input.integrationName, envName },
    });
  }
  for (const manualAction of manualActionsFromOutputs(input.outputs)) {
    blockers.push(blockerFromManualAction(input.integrationName, manualAction));
  }
  if (input.decision === "manual_action" && blockers.length === 0) {
    blockers.push({
      category: "execution",
      key: "execution.integration.unclassified_execution_blocker",
      message: input.message,
      recommendedNextAction: "Inspect the adapter output before retrying this integration.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "integration",
      details: { provider: input.integrationName },
    });
  }
  return blockers;
}

function manualActionsFromOutputs(outputs: object): string[] {
  const value = (outputs as { manualActions?: unknown }).manualActions;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "") : [];
}

function blockerFromManualAction(provider: IntegrationName, manualAction: string): IntegrationReadinessBlocker {
  const lower = manualAction.toLowerCase();
  const isOperationGate = lower.includes("operation gate") || lower.includes("allowpushbranch") || lower.includes("allowcreatepullrequest");
  const isTransport = lower.includes("transport") || lower.includes("allownetwork");
  return {
    category: isOperationGate ? "policy" : isTransport ? "execution" : "execution",
    key: isOperationGate ? "policy.integration.operation_gate_disabled" : isTransport ? "execution.integration.injected_transport_missing" : "execution.integration.manual_action",
    message: manualAction,
    recommendedNextAction: isOperationGate
      ? "Review operation gates and keep provider side effects disabled until explicitly approved."
      : "Complete the manual action before retrying this integration.",
    severity: "manual_action",
    blocks: ["execute"],
    source: "integration",
    details: { provider },
  };
}

function sortIntegrationBlockers(blockers: IntegrationReadinessBlocker[]): IntegrationReadinessBlocker[] {
  const severityRank = { blocking: 0, manual_action: 1, warning: 2, info: 3 } as const;
  const categoryRank = { queue_acceptance: 0, approval: 1, configuration: 2, policy: 3, execution: 4, safety: 5 } as const;
  return [...blockers].sort((left, right) => {
    const severity = severityRank[left.severity] - severityRank[right.severity];
    if (severity !== 0) return severity;
    const block = (left.blocks.includes("queue") ? 0 : 1) - (right.blocks.includes("queue") ? 0 : 1);
    if (block !== 0) return block;
    const category = categoryRank[left.category] - categoryRank[right.category];
    if (category !== 0) return category;
    return left.key.localeCompare(right.key);
  });
}
```

- [ ] **Step 5: Export integration blocker type**

In `packages/integrations/src/index.ts`, add `type IntegrationReadinessBlocker` to the export list from `github-real.js`.

- [ ] **Step 6: Run focused integration tests**

Run:

```bash
pnpm --filter @psf/integrations test -- --run tests/integrations.test.ts -t 'manual-action guidance|operation gate'
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add packages/integrations/src/github-real.ts packages/integrations/src/index.ts packages/integrations/tests/integrations.test.ts
git commit -m "映射集成阻塞原因" -m "Integration real results 从 missingEnv、manualActions 和 operation gates 派生结构化 blockers，safeToRun:false 不再单独承担原因语义。" -m "默认 provider network call 仍保持禁用。"
```

Expected: commit succeeds.

## Task 6: Documentation And Final Verification

**Files:**
- Modify: `docs/api/orchestrator-api.md`
- Modify: `docs/apps/hub-web.md`
- Modify: `docs/status/progress.md`
- Modify: `docs/debug/debug.md`
- Modify: `summary.md`

- [ ] **Step 1: Update API docs**

In `docs/api/orchestrator-api.md`, update the Mission summary `realModeReadiness` bullet to mention:

```markdown
Each readiness entry keeps legacy `safeToRun` for compatibility, but new consumers should use `canQueue`, `canExecute`, sorted `blockers[]`, and `recommendedNextAction`. `safeToRun` only means route-level queue readiness and does not prove real execution can happen. Blocker details are redacted safe metadata only. Safety flags remain explicit false by default: `realNetworkCall:false`, `realExternalCall:false`, `realPush:false`, and `realDeploy:false`.
```

- [ ] **Step 2: Update Hub docs**

In `docs/apps/hub-web.md`, add this sentence in the Mission Detail section:

```markdown
Mission Detail reads API-provided `canQueue`, `canExecute`, and `blockers[]`; it does not infer env, approval, transport, runner, or provider state locally, and guarded action labels use queue/manual-action language rather than `Run real ...` when execution blockers remain.
```

- [ ] **Step 3: Update progress after tests pass**

In `docs/status/progress.md`, add under `## 最新更新`:

```markdown
B2 readiness/blocker 合同收敛已完成。Orchestrator readiness、gated real action blocked responses、Hub Mission Detail、Worker Runner real-job manual-action outputs 和 integration real results 现在共享 `canQueue`、`canExecute`、`blockers[]` 与 `recommendedNextAction` 语义。`safeToRun` 保留为 legacy route-level queue readiness 字段，不代表真实执行可发生。默认真实 Codex、Playwright/browser、provider network、push、PR creation、deploy、monitor creation 和 Plane sync 仍保持禁用。
```

- [ ] **Step 4: Add debug verification entry**

In `docs/debug/debug.md`, add a current entry:

```markdown
### 2026-06-04 - B2 控制面 readiness/blocker 合同收敛

- 背景: 实施已确认的 B2 readiness/blocker 合同，避免 `safeToRun` 被误读为真实执行 ready。
- 现象: 旧 readiness surface 只有 route-level `safeToRun` 和文字 `message`，Hub 也直接依赖 `safeToRun` 控制 guarded action buttons。
- 范围: Orchestrator API readiness 和 gated real responses、Hub Mission Detail、Worker Runner real-job manual-action output、integration real result mapping。
- 调查: 使用 `docs/superpowers/specs/2026-06-04-control-plane-readiness-convergence-design.md` 作为设计源；没有恢复已 revert 的旧 B2 提交。
- 修复: 新增 `canQueue`、`canExecute`、结构化 `blockers[]`、`recommendedNextAction` 和 redacted blocker details；保留 `safeToRun` legacy 语义。
- 验证: 运行 focused package tests、typecheck、structure check 和 `git diff --check`。
- 后续: B3 只补聚焦合同回归测试和必要最小生产代码调整。
```

- [ ] **Step 5: Update summary document map**

Ensure `summary.md` includes this plan entry under `### Superpowers`:

```markdown
- `docs/superpowers/plans/2026-06-04-b2-control-plane-readiness-convergence.md`: B2 控制面 readiness/blocker 合同收敛实施计划。
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
pnpm --filter @psf/hub test
pnpm --filter @psf/hub typecheck
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/worker-runner typecheck
pnpm --filter @psf/integrations test
pnpm --filter @psf/integrations typecheck
node scripts/check-phase1-structure.mjs
git diff --check
```

Expected: every command passes.

- [ ] **Step 7: Run broader verification if focused checks pass**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: both commands pass. If either fails outside the B2 touched surface, record the failure and its scope in `docs/debug/debug.md` before deciding whether to fix it in B2 or defer.

- [ ] **Step 8: Commit documentation and verification record**

Run:

```bash
git add docs/api/orchestrator-api.md docs/apps/hub-web.md docs/status/progress.md docs/debug/debug.md summary.md
git commit -m "记录 B2 就绪合同实施结果" -m "更新 API、Hub、progress、debug 和 summary 文档，记录 readiness/blocker 合同实施与验证结果。" -m "本次仍未启用真实 Codex、Playwright/browser、provider network、push、PR、deploy、monitor 或 Plane sync。"
```

Expected: commit succeeds.

## Final Completion Check

- [ ] **Step 1: Confirm clean status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on the current branch.

- [ ] **Step 2: Summarize B2 outcome**

Final response should include:

- the B2 commits created;
- the focused and broader verification commands run;
- whether any command failed and why;
- confirmation that default real external actions remain disabled;
- a note that `safeToRun` remains legacy and new consumers use `canQueue`, `canExecute`, and `blockers[]`.
