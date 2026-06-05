# A1 ai-novelist Local Mirror DeepSeek Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an A1 proof command that prepares or verifies an isolated `ai-novelist` mirror, starts the target Web app in DeepSeek provider mode through the target app boundary, observes a local reachable target event, records redacted evidence, and stops safely.

**Architecture:** Add a focused script module with dependency injection for Git, process, HTTP probe, artifact writing, and time so contract behavior can be tested without launching the real app. Wire the module into the existing `pnpm psf` CLI as an explicit A1 command. Keep PSF-owned safety flags false and represent target app DeepSeek activity only with separate target-app metadata.

**Tech Stack:** TypeScript scripts under `scripts/`, Vitest for script tests, Node `child_process`/`fs`/`http` runtime APIs, existing `@psf/security` redaction and path guard helpers, Markdown docs under `docs/` and `summary.md`.

---

## File Structure

- Create `scripts/a1-ai-novelist-proof.ts`: A1 proof orchestration, typed result contract, blocker helpers, mirror Git checks, target process start/stop, HTTP observation, redacted artifact writer, and dependency interfaces.
- Create `scripts/a1-ai-novelist-proof.test.ts`: focused unit tests for mirror safety, blocker shape, provider metadata separation, cleanup hard gate, and redaction.
- Modify `scripts/psf.ts`: add `a1:ai-novelist-proof` CLI command and argument parsing, delegating implementation to `runA1AiNovelistProof`.
- Modify `scripts/psf.test.ts`: add CLI-level tests for usage errors and JSON output redaction.
- Modify `package.json`: broaden `test:scripts` from only `scripts/psf.test.ts` to all script tests.
- Modify `scripts/README.md`: document the A1 command, safety boundary, and no-provider-by-PSF semantics.
- Modify `docs/architecture/structure.md`: record the A1 proof command as a local proof utility and target-app provider boundary, without changing default real execution posture.
- Modify `docs/security/safety.md`: document `targetAppProviderCall`/`targetProvider` as separate from PSF `realNetworkCall`/`realExternalCall`.
- Modify `docs/debug/debug.md`: record implementation verification commands and A1 proof/manual-action result summaries.
- Modify `docs/status/progress.md`, `docs/status/next-steps.md`, and `summary.md`: update A1 status after implementation, and keep Markdown document map current.

---

### Task 1: Add A1 Proof Contract And Pure Helpers

**Files:**
- Create: `scripts/a1-ai-novelist-proof.ts`
- Create: `scripts/a1-ai-novelist-proof.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing contract tests**

Add `scripts/a1-ai-novelist-proof.test.ts` with these initial tests:

```ts
import { describe, expect, test } from "vitest";
import {
  buildA1ManualActionResult,
  deriveA1Readiness,
  sanitizeA1Metadata,
  type A1ProofBlocker,
} from "./a1-ai-novelist-proof";

describe("A1 ai-novelist proof contract", () => {
  test("derives canQueue and canExecute from queue and execute blockers", () => {
    const queueBlocker: A1ProofBlocker = {
      category: "mirror",
      key: "mirror.existing_path_unexpected",
      message: "Mirror path exists but is not the expected ai-novelist repo.",
      recommendedNextAction: "Inspect workspaces/mirrors/ai-novelist and either remove it manually or point A1 at a verified mirror.",
      severity: "blocking",
      blocks: ["queue", "execute"],
      source: "a1-proof",
    };
    const executeBlocker: A1ProofBlocker = {
      category: "target",
      key: "target.web_command_unconfirmed",
      message: "The ai-novelist Web start command is not operator-confirmed.",
      recommendedNextAction: "Confirm the exact Web command before starting the target app.",
      severity: "manual_action",
      blocks: ["execute"],
      source: "a1-proof",
    };

    expect(deriveA1Readiness([queueBlocker])).toMatchObject({ canQueue: false, canExecute: false });
    expect(deriveA1Readiness([executeBlocker])).toMatchObject({ canQueue: true, canExecute: false });
    expect(deriveA1Readiness([])).toMatchObject({ canQueue: true, canExecute: true });
  });

  test("keeps PSF safety flags false and records DeepSeek as target-app metadata", () => {
    const result = buildA1ManualActionResult({
      blocker: {
        category: "target",
        key: "target.deepseek_env_missing",
        message: "DeepSeek provider mode was requested, but the target app environment is not configured.",
        recommendedNextAction: "Set DEEPSEEK_API_KEY in the operator environment before retrying A1.",
        severity: "blocking",
        blocks: ["execute"],
        source: "a1-proof",
      },
      evidence: {
        targetProvider: "deepseek",
        targetProviderBoundary: "ai-novelist-web",
        targetAppProviderCall: "not_observed",
      },
    });

    expect(result.status).toBe("manual_action");
    expect(result.realNetworkCall).toBe(false);
    expect(result.realExternalCall).toBe(false);
    expect(result.realPush).toBe(false);
    expect(result.realDeploy).toBe(false);
    expect(result.evidence).toMatchObject({
      targetProvider: "deepseek",
      targetProviderBoundary: "ai-novelist-web",
      targetAppProviderCall: "not_observed",
    });
  });

  test("sanitizes secret-like metadata before returning proof output", () => {
    const secret = "sk-deepseek-test-secret";
    const sanitized = sanitizeA1Metadata({
      commandTemplate: ".venv/bin/ai-novelist web --provider deepseek",
      nested: { deepseekApiKey: secret },
      logSummary: `Authorization: Bearer ${secret}`,
    }, [secret]);

    const json = JSON.stringify(sanitized);
    expect(json).not.toContain(secret);
    expect(json).toContain("[REDACTED]");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts
```

Expected: FAIL because `scripts/a1-ai-novelist-proof.ts` does not exist.

- [ ] **Step 3: Create the proof contract helper module**

Create `scripts/a1-ai-novelist-proof.ts` with this initial implementation:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { redactJson, redactText, assertInsideWorkspace, assertNotForbiddenPath } from "@psf/security";

export type A1BlockTarget = "queue" | "execute";
export type A1BlockerSeverity = "blocking" | "manual_action" | "warning" | "info";
export type A1ProofStatus = "succeeded" | "manual_action" | "blocked";
export type A1TargetAppProviderCall = true | false | "not_observed";

export interface A1ProofBlocker {
  category: "mirror" | "target" | "observation" | "evidence" | "cleanup" | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: A1BlockerSeverity;
  blocks: A1BlockTarget[];
  source: "a1-proof";
  details?: Record<string, unknown>;
}

export interface A1ReadinessState {
  canQueue: boolean;
  canExecute: boolean;
  blockers: A1ProofBlocker[];
  recommendedNextAction: string;
}

export interface A1ProofEvidence {
  sourcePath?: string;
  sourceBranch?: string;
  sourceHead?: string;
  sourceStatusShort?: string;
  mirrorPath?: string;
  mirrorBranch?: string;
  mirrorHead?: string;
  mirrorStatusShort?: string;
  commandTemplate?: string;
  targetUrl?: string;
  targetHttpStatus?: number;
  targetResponseType?: string;
  targetProvider?: "deepseek";
  targetProviderBoundary?: "ai-novelist-web";
  targetAppProviderCall?: A1TargetAppProviderCall;
  webProcessStarted?: boolean;
  webProcessStopped?: boolean;
  artifactPath?: string;
  logSummary?: string;
}

export interface A1ProofResult extends A1ReadinessState {
  status: A1ProofStatus;
  evidence: A1ProofEvidence;
  realNetworkCall: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
}

const severityOrder: Record<A1BlockerSeverity, number> = {
  blocking: 0,
  manual_action: 1,
  warning: 2,
  info: 3,
};

const categoryOrder: Record<A1ProofBlocker["category"], number> = {
  mirror: 0,
  target: 1,
  observation: 2,
  evidence: 3,
  cleanup: 4,
  safety: 5,
};

export function sortA1Blockers(blockers: A1ProofBlocker[]): A1ProofBlocker[] {
  return [...blockers].sort((left, right) => {
    const severity = severityOrder[left.severity] - severityOrder[right.severity];
    if (severity !== 0) return severity;
    const leftQueue = left.blocks.includes("queue") ? 0 : 1;
    const rightQueue = right.blocks.includes("queue") ? 0 : 1;
    if (leftQueue !== rightQueue) return leftQueue - rightQueue;
    const category = categoryOrder[left.category] - categoryOrder[right.category];
    if (category !== 0) return category;
    return left.key.localeCompare(right.key);
  });
}

export function deriveA1Readiness(blockers: A1ProofBlocker[]): A1ReadinessState {
  const sorted = sortA1Blockers(blockers.map((blocker) => ({
    ...blocker,
    details: blocker.details ? sanitizeA1Metadata(blocker.details) as Record<string, unknown> : undefined,
  })));
  const canQueue = !sorted.some((blocker) => blocker.blocks.includes("queue"));
  const canExecute = canQueue && !sorted.some((blocker) => blocker.blocks.includes("execute"));
  return {
    canQueue,
    canExecute,
    blockers: sorted,
    recommendedNextAction: sorted[0]?.recommendedNextAction ?? "Review A1 proof evidence before treating the local mirror as observed.",
  };
}

export function sanitizeA1Metadata<T>(metadata: T, extraSecrets: string[] = []): T {
  return redactJson(metadata, extraSecrets);
}

export function buildA1ManualActionResult(input: { blocker: A1ProofBlocker; evidence?: A1ProofEvidence }): A1ProofResult {
  const readiness = deriveA1Readiness([input.blocker]);
  return {
    status: input.blocker.blocks.includes("queue") ? "blocked" : "manual_action",
    ...readiness,
    evidence: sanitizeA1Metadata(input.evidence ?? {}),
    realNetworkCall: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
  };
}

export function safeRelativePath(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).split("\").join("/");
}

export async function writeA1ProofArtifact(cwd: string, result: A1ProofResult): Promise<string> {
  const artifactPath = resolve(cwd, "artifacts", "a1", "ai-novelist-local-mirror-deepseek-proof.json");
  assertNotForbiddenPath("artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json");
  assertInsideWorkspace(artifactPath, cwd);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(sanitizeA1Metadata(result), null, 2) + "
", "utf8");
  return join("artifacts", "a1", "ai-novelist-local-mirror-deepseek-proof.json");
}

export function sanitizeA1Text(input: string, extraSecrets: string[] = []): string {
  return redactText(input, extraSecrets);
}
```

- [ ] **Step 4: Broaden script test discovery**

Modify `package.json`:

```json
"test:scripts": "vitest run scripts/*.test.ts"
```

- [ ] **Step 5: Run focused and script tests**

Run:

```bash
pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts
pnpm test:scripts
pnpm typecheck:scripts
```

Expected: all pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json scripts/a1-ai-novelist-proof.ts scripts/a1-ai-novelist-proof.test.ts
git commit -m "添加 A1 证明合同基础" -m "新增 A1 ai-novelist 本地镜像 proof 的脚本合同、readiness/blocker helper、redaction helper 和脚本测试发现范围。PSF 安全 flags 仍保持 false，目标 app DeepSeek 边界单独表达。"
```

---

### Task 2: Implement Mirror Safety And Git Metadata

**Files:**
- Modify: `scripts/a1-ai-novelist-proof.ts`
- Modify: `scripts/a1-ai-novelist-proof.test.ts`

- [ ] **Step 1: Add failing mirror safety tests**

Append these tests to `scripts/a1-ai-novelist-proof.test.ts`:

```ts
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runA1AiNovelistProof, type A1ProofDeps } from "./a1-ai-novelist-proof";

test("returns blocked manual output when an existing mirror is unexpected", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-a1-unexpected-mirror-"));
  await mkdir(join(cwd, "workspaces", "mirrors", "ai-novelist"), { recursive: true });
  await writeFile(join(cwd, "workspaces", "mirrors", "ai-novelist", "README.txt"), "not a repo
", "utf8");

  const result = await runA1AiNovelistProof({
    cwd,
    sourcePath: "/home/ubuntu/1.project/ai-novelist",
    mirrorPath: "workspaces/mirrors/ai-novelist",
    provider: "deepseek",
    webCommandConfirmed: true,
    targetUrl: "http://127.0.0.1:8000/api/projects",
  }, fakeDeps({ deepseekConfigured: true }));

  expect(result.status).toBe("blocked");
  expect(result.canQueue).toBe(false);
  expect(result.blockers[0].key).toBe("mirror.existing_path_unexpected");
});

test("stops when source main or master is dirty before mirror preparation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-a1-dirty-source-"));
  const result = await runA1AiNovelistProof({
    cwd,
    sourcePath: "/home/ubuntu/1.project/ai-novelist",
    mirrorPath: "workspaces/mirrors/ai-novelist",
    provider: "deepseek",
    webCommandConfirmed: true,
    targetUrl: "http://127.0.0.1:8000/api/projects",
  }, fakeDeps({
    deepseekConfigured: true,
    sourceGit: { branch: "main", head: "abc1234", statusShort: " M src/app.py" },
  }));

  expect(result.status).toBe("blocked");
  expect(result.blockers[0].key).toBe("mirror.source_main_polluted");
  expect(JSON.stringify(result)).not.toContain("DEEPSEEK_API_KEY");
});
```

Also add this test helper at the bottom of the file:

```ts
function fakeDeps(overrides: Partial<{
  deepseekConfigured: boolean;
  sourceGit: { branch: string; head: string; statusShort: string };
  mirrorGit: { branch: string; head: string; statusShort: string };
}> = {}): A1ProofDeps {
  return {
    pathExists: async (path) => path.includes("workspaces/mirrors/ai-novelist") ? false : true,
    isGitRepo: async (path) => !path.includes("README.txt"),
    cloneLocalRepo: async () => undefined,
    gitSnapshot: async (path) => path.includes("workspaces/mirrors")
      ? overrides.mirrorGit ?? { branch: "agent/a1-local-mirror-deepseek-proof", head: "def5678", statusShort: "" }
      : overrides.sourceGit ?? { branch: "main", head: "abc1234", statusShort: "" },
    deepseekConfigured: () => overrides.deepseekConfigured ?? false,
    startWeb: async () => ({ pid: 1234 }),
    observeTarget: async () => ({ httpStatus: 200, responseType: "application/json" }),
    stopWeb: async () => true,
    writeArtifact: async () => "artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json",
    now: () => "2026-06-05T00:00:00.000Z",
  };
}
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts -t "mirror"
```

Expected: FAIL because `runA1AiNovelistProof` and `A1ProofDeps` are not implemented.

- [ ] **Step 3: Implement mirror safety orchestration**

Extend `scripts/a1-ai-novelist-proof.ts` with these exports and logic:

```ts
export interface GitSnapshot {
  branch: string;
  head: string;
  statusShort: string;
}

export interface A1ProofInput {
  cwd: string;
  sourcePath: string;
  mirrorPath: string;
  provider: "deepseek";
  webCommandConfirmed: boolean;
  targetUrl: string;
  host?: string;
  port?: number;
}

export interface A1ProofDeps {
  pathExists(path: string): Promise<boolean>;
  isGitRepo(path: string): Promise<boolean>;
  cloneLocalRepo(sourcePath: string, mirrorPath: string): Promise<void>;
  gitSnapshot(path: string): Promise<GitSnapshot>;
  deepseekConfigured(): boolean;
  startWeb(input: { cwd: string; host: string; port: number; provider: "deepseek" }): Promise<{ pid: number }>;
  observeTarget(input: { targetUrl: string }): Promise<{ httpStatus: number; responseType: string }>;
  stopWeb(process: { pid: number }): Promise<boolean>;
  writeArtifact(cwd: string, result: A1ProofResult): Promise<string>;
  now(): string;
}

export async function runA1AiNovelistProof(input: A1ProofInput, deps: A1ProofDeps): Promise<A1ProofResult> {
  const cwd = resolve(input.cwd);
  const sourcePath = resolve(input.sourcePath);
  const mirrorPath = resolve(cwd, input.mirrorPath);
  const evidence: A1ProofEvidence = {
    sourcePath,
    mirrorPath: safeRelativePath(cwd, mirrorPath),
    targetProvider: "deepseek",
    targetProviderBoundary: "ai-novelist-web",
    targetAppProviderCall: "not_observed",
  };

  const sourceBefore = await deps.gitSnapshot(sourcePath);
  Object.assign(evidence, {
    sourceBranch: sourceBefore.branch,
    sourceHead: sourceBefore.head,
    sourceStatusShort: sanitizeA1Text(sourceBefore.statusShort),
  });

  if (["main", "master"].includes(sourceBefore.branch) && sourceBefore.statusShort.trim() !== "") {
    return withArtifact(cwd, buildA1ManualActionResult({
      blocker: blocker("mirror", "mirror.source_main_polluted", "Source checkout main/master has uncommitted changes before A1 mirror preparation.", "Clean or commit the source checkout before retrying A1.", "blocking", ["queue", "execute"]),
      evidence,
    }), deps);
  }

  const mirrorExists = await deps.pathExists(mirrorPath);
  if (mirrorExists && !await deps.isGitRepo(mirrorPath)) {
    return withArtifact(cwd, buildA1ManualActionResult({
      blocker: blocker("mirror", "mirror.existing_path_unexpected", "Mirror path exists but is not the expected ai-novelist repo.", "Inspect workspaces/mirrors/ai-novelist and either remove it manually or point A1 at a verified mirror.", "blocking", ["queue", "execute"]),
      evidence,
    }), deps);
  }

  if (!mirrorExists) {
    await deps.cloneLocalRepo(sourcePath, mirrorPath);
  }

  const mirrorSnapshot = await deps.gitSnapshot(mirrorPath);
  Object.assign(evidence, {
    mirrorBranch: mirrorSnapshot.branch,
    mirrorHead: mirrorSnapshot.head,
    mirrorStatusShort: sanitizeA1Text(mirrorSnapshot.statusShort),
  });

  return continueTargetProof(cwd, input, evidence, deps);
}

function blocker(
  category: A1ProofBlocker["category"],
  key: string,
  message: string,
  recommendedNextAction: string,
  severity: A1BlockerSeverity,
  blocks: A1BlockTarget[],
): A1ProofBlocker {
  return { category, key, message, recommendedNextAction, severity, blocks, source: "a1-proof" };
}

async function withArtifact(cwd: string, result: A1ProofResult, deps: Pick<A1ProofDeps, "writeArtifact">): Promise<A1ProofResult> {
  const artifactPath = await deps.writeArtifact(cwd, result);
  return { ...result, evidence: { ...result.evidence, artifactPath } };
}
```

Add `continueTargetProof` with conservative target gates. At the end of Task 2 it must still stop before process startup, so no target process can be launched before Task 3 adds lifecycle handling:

```ts
async function continueTargetProof(cwd: string, input: A1ProofInput, evidence: A1ProofEvidence, deps: A1ProofDeps): Promise<A1ProofResult> {
  if (!input.webCommandConfirmed) {
    return withArtifact(cwd, buildA1ManualActionResult({
      blocker: blocker("target", "target.web_command_unconfirmed", "The ai-novelist Web start command is not operator-confirmed.", "Confirm the exact Web command before starting the target app.", "manual_action", ["execute"]),
      evidence,
    }), deps);
  }
  if (!deps.deepseekConfigured()) {
    return withArtifact(cwd, buildA1ManualActionResult({
      blocker: blocker("target", "target.deepseek_env_missing", "DeepSeek provider mode was requested, but the target app environment is not configured.", "Set DEEPSEEK_API_KEY in the operator environment before retrying A1.", "manual_action", ["execute"]),
      evidence,
    }), deps);
  }
  return withArtifact(cwd, buildA1ManualActionResult({
    blocker: blocker("target", "target.web_lifecycle_required", "The target Web lifecycle gate has not yet run in this proof path.", "Run the target lifecycle proof path that starts, observes, and stops ai-novelist Web before claiming A1 success.", "manual_action", ["execute"]),
    evidence,
  }), deps);
}
```

- [ ] **Step 4: Run mirror tests**

```bash
pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts -t "mirror|source main"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/a1-ai-novelist-proof.ts scripts/a1-ai-novelist-proof.test.ts
git commit -m "实现 A1 镜像安全检查" -m "为 A1 proof 增加 source/mirror Git metadata、已有 mirror 防覆盖检查和 source main/master 污染阻断。失败输出使用 readiness blockers 和 redacted evidence。"
```

---

### Task 3: Implement Target Startup, Observation, Cleanup, And Default Deps

**Files:**
- Modify: `scripts/a1-ai-novelist-proof.ts`
- Modify: `scripts/a1-ai-novelist-proof.test.ts`

- [ ] **Step 1: Add failing target lifecycle tests**

Append these tests:

```ts
test("requires DeepSeek env when provider mode is deepseek", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-a1-missing-deepseek-"));
  const result = await runA1AiNovelistProof({
    cwd,
    sourcePath: "/home/ubuntu/1.project/ai-novelist",
    mirrorPath: "workspaces/mirrors/ai-novelist",
    provider: "deepseek",
    webCommandConfirmed: true,
    targetUrl: "http://127.0.0.1:8000/api/projects",
  }, fakeDeps({ deepseekConfigured: false }));

  expect(result.status).toBe("manual_action");
  expect(result.blockers[0].key).toBe("target.deepseek_env_missing");
  expect(result.realNetworkCall).toBe(false);
  expect(result.evidence.targetAppProviderCall).toBe("not_observed");
});

test("records successful page observation with target provider metadata separate from PSF safety flags", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-a1-success-"));
  const result = await runA1AiNovelistProof({
    cwd,
    sourcePath: "/home/ubuntu/1.project/ai-novelist",
    mirrorPath: "workspaces/mirrors/ai-novelist",
    provider: "deepseek",
    webCommandConfirmed: true,
    targetUrl: "http://127.0.0.1:8000/api/projects",
  }, fakeDeps({ deepseekConfigured: true }));

  expect(result.status).toBe("succeeded");
  expect(result.canQueue).toBe(true);
  expect(result.canExecute).toBe(true);
  expect(result.realNetworkCall).toBe(false);
  expect(result.realExternalCall).toBe(false);
  expect(result.evidence).toMatchObject({
    targetProvider: "deepseek",
    targetProviderBoundary: "ai-novelist-web",
    targetAppProviderCall: false,
    targetHttpStatus: 200,
    webProcessStarted: true,
    webProcessStopped: true,
  });
});

test("cleanup failure turns the whole proof into manual_action", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-a1-cleanup-fail-"));
  const deps = fakeDeps({ deepseekConfigured: true });
  deps.stopWeb = async () => false;

  const result = await runA1AiNovelistProof({
    cwd,
    sourcePath: "/home/ubuntu/1.project/ai-novelist",
    mirrorPath: "workspaces/mirrors/ai-novelist",
    provider: "deepseek",
    webCommandConfirmed: true,
    targetUrl: "http://127.0.0.1:8000/api/projects",
  }, deps);

  expect(result.status).toBe("manual_action");
  expect(result.blockers[0].key).toBe("cleanup.web_process_stop_unconfirmed");
  expect(result.evidence.webProcessStopped).toBe(false);
});
```

- [ ] **Step 2: Run focused target tests and confirm RED**

```bash
pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts -t "DeepSeek env|page observation|cleanup failure"
```

Expected: FAIL because `continueTargetProof` still returns `target.web_lifecycle_required` before target startup and observation are wired.

- [ ] **Step 3: Implement target lifecycle**

Replace `continueTargetProof` with:

```ts
async function continueTargetProof(cwd: string, input: A1ProofInput, evidence: A1ProofEvidence, deps: A1ProofDeps): Promise<A1ProofResult> {
  const host = input.host ?? "127.0.0.1";
  const port = input.port ?? 8000;
  Object.assign(evidence, {
    commandTemplate: `.venv/bin/ai-novelist web --host ${host} --port ${port} --provider deepseek`,
    targetUrl: input.targetUrl,
  });

  if (!input.webCommandConfirmed) {
    return withArtifact(cwd, buildA1ManualActionResult({
      blocker: blocker("target", "target.web_command_unconfirmed", "The ai-novelist Web start command is not operator-confirmed.", "Confirm the exact Web command before starting the target app.", "manual_action", ["execute"]),
      evidence,
    }), deps);
  }

  if (!deps.deepseekConfigured()) {
    return withArtifact(cwd, buildA1ManualActionResult({
      blocker: blocker("target", "target.deepseek_env_missing", "DeepSeek provider mode was requested, but the target app environment is not configured.", "Set DEEPSEEK_API_KEY in the operator environment before retrying A1.", "manual_action", ["execute"]),
      evidence,
    }), deps);
  }

  let webProcess: { pid: number } | undefined;
  try {
    webProcess = await deps.startWeb({ cwd: resolve(cwd, input.mirrorPath), host, port, provider: "deepseek" });
    evidence.webProcessStarted = true;
    const observation = await deps.observeTarget({ targetUrl: input.targetUrl });
    evidence.targetHttpStatus = observation.httpStatus;
    evidence.targetResponseType = observation.responseType;
    evidence.targetAppProviderCall = false;

    if (observation.httpStatus < 200 || observation.httpStatus >= 400) {
      return withArtifact(cwd, buildA1ManualActionResult({
        blocker: blocker("observation", "observation.target_unreachable", "The ai-novelist local target did not return a successful response.", "Inspect the target URL, port, and Web process logs before retrying A1.", "blocking", ["execute"]),
        evidence,
      }), deps);
    }

    const stopped = await deps.stopWeb(webProcess);
    evidence.webProcessStopped = stopped;
    if (!stopped) {
      return cleanupFailure(cwd, evidence, deps);
    }

    const readiness = deriveA1Readiness([]);
    const result: A1ProofResult = {
      status: "succeeded",
      ...readiness,
      evidence: sanitizeA1Metadata(evidence),
      realNetworkCall: false,
      realExternalCall: false,
      realPush: false,
      realDeploy: false,
    };
    return withArtifact(cwd, result, deps);
  } catch (error) {
    evidence.logSummary = sanitizeA1Text(error instanceof Error ? error.message : String(error));
    return withArtifact(cwd, buildA1ManualActionResult({
      blocker: blocker("target", "target.web_start_failed", "The ai-novelist Web target could not be started or observed.", "Inspect sanitized Web startup logs and retry with a confirmed local command.", "blocking", ["execute"]),
      evidence,
    }), deps);
  } finally {
    if (webProcess && evidence.webProcessStopped !== true) {
      const stopped = await deps.stopWeb(webProcess).catch(() => false);
      evidence.webProcessStopped = stopped;
    }
  }
}

async function cleanupFailure(cwd: string, evidence: A1ProofEvidence, deps: A1ProofDeps): Promise<A1ProofResult> {
  return withArtifact(cwd, buildA1ManualActionResult({
    blocker: blocker("cleanup", "cleanup.web_process_stop_unconfirmed", "The ai-novelist Web process stop could not be confirmed.", "Manually inspect the PID, target port, and provider quota before retrying A1.", "blocking", ["execute"]),
    evidence,
  }), deps);
}
```

- [ ] **Step 4: Add default runtime dependencies**

Add default dependency helpers to `scripts/a1-ai-novelist-proof.ts`:

```ts
import { spawn, execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function createDefaultA1ProofDeps(env: NodeJS.ProcessEnv = process.env): A1ProofDeps {
  return {
    pathExists: async (path) => stat(path).then(() => true, () => false),
    isGitRepo: async (path) => execFileAsync("git", ["-C", path, "rev-parse", "--is-inside-work-tree"]).then((result) => result.stdout.trim() === "true", () => false),
    cloneLocalRepo: async (sourcePath, mirrorPath) => {
      await execFileAsync("git", ["clone", "--no-hardlinks", sourcePath, mirrorPath]);
      await execFileAsync("git", ["-C", mirrorPath, "switch", "-c", "agent/a1-local-mirror-deepseek-proof"]);
    },
    gitSnapshot: async (path) => {
      const [branch, head, statusShort] = await Promise.all([
        execFileAsync("git", ["-C", path, "branch", "--show-current"]).then((result) => result.stdout.trim() || "detached"),
        execFileAsync("git", ["-C", path, "rev-parse", "--short", "HEAD"]).then((result) => result.stdout.trim()),
        execFileAsync("git", ["-C", path, "status", "--short"]).then((result) => sanitizeA1Text(result.stdout.trim())),
      ]);
      return { branch, head, statusShort };
    },
    deepseekConfigured: () => Boolean(env.DEEPSEEK_API_KEY?.trim()),
    startWeb: async ({ cwd, host, port, provider }) => {
      const child = spawn(".venv/bin/ai-novelist", ["web", "--host", host, "--port", String(port), "--provider", provider], {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
      if (child.exitCode !== null) {
        throw new Error("ai-novelist Web process exited before observation.");
      }
      return { pid: child.pid ?? 0 };
    },
    observeTarget: ({ targetUrl }) => observeTargetUrl(targetUrl),
    stopWeb: async ({ pid }) => {
      try {
        process.kill(pid, "SIGTERM");
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
        try {
          process.kill(pid, 0);
          process.kill(pid, "SIGKILL");
          return false;
        } catch {
          return true;
        }
      } catch {
        return false;
      }
    },
    writeArtifact: writeA1ProofArtifact,
    now: () => new Date().toISOString(),
  };
}

async function observeTargetUrl(targetUrl: string): Promise<{ httpStatus: number; responseType: string }> {
  const url = new URL(targetUrl);
  const transport = url.protocol === "https:" ? httpsRequest : request;
  return new Promise((resolvePromise, reject) => {
    const req = transport(url, { method: "GET", timeout: 5000 }, (res) => {
      res.resume();
      resolvePromise({ httpStatus: res.statusCode ?? 0, responseType: String(res.headers["content-type"] ?? "unknown") });
    });
    req.on("timeout", () => {
      req.destroy(new Error("Target observation timed out."));
    });
    req.on("error", reject);
    req.end();
  });
}
```

- [ ] **Step 5: Run target lifecycle tests and typecheck**

```bash
pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts
pnpm typecheck:scripts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/a1-ai-novelist-proof.ts scripts/a1-ai-novelist-proof.test.ts
git commit -m "实现 A1 目标观测与清理门禁" -m "A1 proof 现在能在测试中覆盖 DeepSeek env gate、本地目标观测、PSF safety flags false、target-app provider metadata 分离，以及 Web 进程停止失败降级为 manual_action。"
```

---

### Task 4: Wire A1 Proof Into PSF CLI

**Files:**
- Modify: `scripts/psf.ts`
- Modify: `scripts/psf.test.ts`
- Modify: `scripts/README.md`

- [ ] **Step 1: Add failing CLI tests**

Add these tests to `scripts/psf.test.ts` near other CLI command tests:

```ts
test("a1 proof command requires explicit operator confirmation", async () => {
  const cwd = await createExampleWorkspace("psf-cli-a1-usage-");
  const result = await runPsfCli(["a1:ai-novelist-proof", "--skip-db"], { cwd, syncDatabase: false });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Usage: pnpm psf a1:ai-novelist-proof");
  expect(result.stderr).toContain("--confirm-web-command");
});

test("a1 proof command redacts DeepSeek key and keeps PSF safety flags false", async () => {
  const cwd = await createExampleWorkspace("psf-cli-a1-redaction-");
  const secret = "sk-deepseek-cli-secret";

  const result = await runPsfCli([
    "a1:ai-novelist-proof",
    "--confirm-web-command",
    "--source", "/home/ubuntu/1.project/ai-novelist",
    "--target-url", "http://127.0.0.1:8000/api/projects",
    "--json",
    "--skip-db",
  ], {
    cwd,
    syncDatabase: false,
    env: { ...process.env, DEEPSEEK_API_KEY: secret },
  });

  expect(result.stdout).not.toContain(secret);
  expect(result.stderr).not.toContain(secret);
  expect(result.stdout).toContain("realNetworkCall");
  expect(result.stdout).toContain("realExternalCall");
  expect(result.stdout).toContain("targetProvider");
});
```

- [ ] **Step 2: Run CLI tests and confirm RED**

```bash
pnpm exec vitest run scripts/psf.test.ts -t "a1 proof"
```

Expected: FAIL because `a1:ai-novelist-proof` is not in `CliCommand` and usage.

- [ ] **Step 3: Import and dispatch A1 proof command**

Modify imports at the top of `scripts/psf.ts`:

```ts
import { createDefaultA1ProofDeps, runA1AiNovelistProof, sanitizeA1Metadata } from "./a1-ai-novelist-proof";
```

Extend `CliCommand`:

```ts
type CliCommand = "a1:ai-novelist-proof" | "artifacts:cleanup" | "projects:sync" | "mission:create" | "mission:plan" | "codex:dry-run" | "qa:dry-run" | "qa:playwright" | "fix:dry-run" | "loop:dry-run" | "integrations:status" | "integrations:dry-run" | "queues:status" | "worker:start" | "worker:once" | "worker-runs:list" | "worker-runs:cancel" | "worker-runs:retry" | "doctor" | "demo:seed" | "demo:reset" | "demo:ai-novelist" | "demo:report";
```

Add the switch case before `artifacts:cleanup`:

```ts
case "a1:ai-novelist-proof":
  await a1AiNovelistProofCommand(context, args);
  break;
```

Add the command function near other command functions:

```ts
async function a1AiNovelistProofCommand(context: CliContext, args: string[]): Promise<void> {
  const flags = parseValueFlags(args, new Set(["--source", "--mirror", "--target-url", "--host", "--port"]), new Set(["--confirm-web-command", "--json", "--skip-db"]), "Usage: pnpm psf a1:ai-novelist-proof --confirm-web-command --source <path> --target-url <url> [--mirror workspaces/mirrors/ai-novelist] [--host 127.0.0.1] [--port 8000] [--json] [--skip-db]");
  if (!flags.booleans.has("--confirm-web-command")) {
    throw new PsfCliError("USAGE", "Usage: pnpm psf a1:ai-novelist-proof --confirm-web-command --source <path> --target-url <url> [--mirror workspaces/mirrors/ai-novelist] [--host 127.0.0.1] [--port 8000] [--json] [--skip-db]");
  }
  const sourcePath = flags.values.get("--source") ?? "/home/ubuntu/1.project/ai-novelist";
  const targetUrl = flags.values.get("--target-url") ?? "http://127.0.0.1:8000/api/projects";
  const mirrorPath = flags.values.get("--mirror") ?? "workspaces/mirrors/ai-novelist";
  const host = flags.values.get("--host") ?? "127.0.0.1";
  const port = Number(flags.values.get("--port") ?? "8000");
  const result = await runA1AiNovelistProof({
    cwd: context.cwd,
    sourcePath,
    mirrorPath,
    provider: "deepseek",
    webCommandConfirmed: true,
    targetUrl,
    host,
    port,
  }, createDefaultA1ProofDeps(context.env));

  if (flags.booleans.has("--json")) {
    context.stdout.push(JSON.stringify(sanitizeA1Metadata(result), null, 2));
  } else {
    context.stdout.push(`A1 ai-novelist proof status: ${result.status}`);
    context.stdout.push(`canQueue=${result.canQueue} canExecute=${result.canExecute}`);
    context.stdout.push(`realNetworkCall=${result.realNetworkCall} realExternalCall=${result.realExternalCall} realPush=${result.realPush} realDeploy=${result.realDeploy}`);
    context.stdout.push(`targetProvider=${result.evidence.targetProvider ?? "none"} targetAppProviderCall=${String(result.evidence.targetAppProviderCall ?? "not_observed")}`);
    context.stdout.push(`artifact=${result.evidence.artifactPath ?? "none"}`);
    context.stdout.push(`next=${result.recommendedNextAction}`);
  }
}
```

Add this parser helper near `parseFlags`:

```ts
function parseValueFlags(args: string[], valueFlags: Set<string>, booleanFlags: Set<string>, usageText: string): { values: Map<string, string>; booleans: Set<string> } {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (booleanFlags.has(arg)) {
      booleans.add(arg);
      continue;
    }
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new PsfCliError("USAGE", usageText);
      }
      values.set(arg, value);
      index += 1;
      continue;
    }
    throw new PsfCliError("USAGE", usageText);
  }
  return { values, booleans };
}
```

- [ ] **Step 4: Update scripts README**

Add to `scripts/README.md` under PSF CLI command examples:

```markdown
pnpm psf a1:ai-novelist-proof --confirm-web-command --source /home/ubuntu/1.project/ai-novelist --target-url http://127.0.0.1:8000/api/projects --json --skip-db
```

Add this bullet to the command list:

```markdown
- `a1:ai-novelist-proof` prepares or verifies `workspaces/mirrors/ai-novelist`, starts an operator-confirmed local `ai-novelist` Web target in DeepSeek provider mode, observes a local page/API reachable event, records redacted metadata under `artifacts/a1/`, and stops the Web process. PSF-owned `realNetworkCall`, `realExternalCall`, `realPush`, and `realDeploy` remain `false`; target app DeepSeek activity is reported separately as `targetAppProviderCall` / `targetProvider` metadata.
```

- [ ] **Step 5: Run CLI tests**

```bash
pnpm exec vitest run scripts/psf.test.ts -t "a1 proof"
pnpm test:scripts
pnpm typecheck:scripts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add scripts/psf.ts scripts/psf.test.ts scripts/README.md
git commit -m "接入 A1 本地证明命令" -m "将 A1 ai-novelist local mirror DeepSeek proof 接入 pnpm psf CLI，补充 usage、JSON 输出 redaction、PSF safety flags false 和 target-app provider metadata 展示。"
```

---

### Task 5: Run Local Proof, Record Docs, And Verify

**Files:**
- Modify: `docs/debug/debug.md`
- Modify: `docs/architecture/structure.md`
- Modify: `docs/security/safety.md`
- Modify: `docs/status/progress.md`
- Modify: `docs/status/next-steps.md`
- Modify: `summary.md`

- [ ] **Step 1: Run focused code checks before real local proof**

Run:

```bash
pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts
pnpm exec vitest run scripts/psf.test.ts -t "a1 proof"
pnpm typecheck:scripts
```

Expected: PASS.

- [ ] **Step 2: Run A1 proof command**

Run only after confirming `DEEPSEEK_API_KEY` exists in the operator environment. Do not print the variable value.

```bash
pnpm psf a1:ai-novelist-proof --confirm-web-command --source /home/ubuntu/1.project/ai-novelist --target-url http://127.0.0.1:8000/api/projects --json --skip-db
```

Expected successful proof output includes:

```json
{
  "status": "succeeded",
  "canQueue": true,
  "canExecute": true,
  "realNetworkCall": false,
  "realExternalCall": false,
  "realPush": false,
  "realDeploy": false,
  "evidence": {
    "targetProvider": "deepseek",
    "targetProviderBoundary": "ai-novelist-web",
    "targetAppProviderCall": false,
    "targetHttpStatus": 200,
    "webProcessStarted": true,
    "webProcessStopped": true
  }
}
```

If the command returns `manual_action` or `blocked`, do not force success. Keep the output, confirm no lingering Web process, and record the blocker key and safe next action in `docs/debug/debug.md`.

- [ ] **Step 3: Inspect generated artifact safely**

Run:

```bash
node -e "const fs=require('fs'); const p='artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json'; const data=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify({status:data.status, canQueue:data.canQueue, canExecute:data.canExecute, artifact:data.evidence.artifactPath, targetProvider:data.evidence.targetProvider, targetAppProviderCall:data.evidence.targetAppProviderCall, realNetworkCall:data.realNetworkCall, realExternalCall:data.realExternalCall, realPush:data.realPush, realDeploy:data.realDeploy}, null, 2));"
```

Expected: prints only sanitized summary fields, not DeepSeek key, prompt, response, or env values.

- [ ] **Step 4: Update debug record**

Add a new `docs/debug/debug.md` entry:

```markdown
### 2026-06-05 - A1 ai-novelist local mirror DeepSeek proof

- 背景: 执行 A1，在 `workspaces/mirrors/ai-novelist` 隔离 mirror 上验证本地 `ai-novelist` Web target，可由目标 app 内部使用 DeepSeek provider。
- 现象: A1 需要证明真实本地目标可观测事件，而不把 PSF 变成 provider caller。
- 范围: `scripts/a1-ai-novelist-proof.ts`、`scripts/psf.ts`、`artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json`、`workspaces/mirrors/ai-novelist`。
- 调查: 记录 source/mirror branch、HEAD、status 的 sanitized 摘要；记录 target URL 可访问性和 cleanup 结果；未记录 DeepSeek key、prompt、response 或 provider payload。
- 修复: 新增 A1 proof CLI 和 redacted artifact 输出；PSF safety flags 保持 false，目标 app DeepSeek 边界用 `targetProvider` 和 `targetAppProviderCall` 表达。
- 验证: `pnpm exec vitest run scripts/a1-ai-novelist-proof.test.ts` 通过；`pnpm exec vitest run scripts/psf.test.ts -t "a1 proof"` 通过；`pnpm typecheck:scripts` 通过；A1 proof 命令返回 `<status>`，target HTTP status `<status-code>`，cleanup `<confirmed-or-manual-action>`。
- 后续: 若 proof 为 manual-action，按 blocker 的 recommendedNextAction 处理；若 succeeded，后续再决定是否进入更深 smoke flow，生成/审稿类 DeepSeek 调用仍需单独批准。
```

Replace `<status>`, `<status-code>`, and `<confirmed-or-manual-action>` with the actual sanitized result.

- [ ] **Step 5: Update architecture and safety docs**

In `docs/architecture/structure.md`, add a short paragraph under Worker Contracts or ai-novelist Readiness:

```markdown
A1 local mirror proof is exposed as an explicit PSF CLI utility rather than a default worker capability. It prepares or verifies `workspaces/mirrors/ai-novelist`, starts an operator-confirmed target `ai-novelist` Web process, observes a local target URL, writes redacted evidence under `artifacts/a1/`, and shuts the target process down. Any DeepSeek call remains owned by the target app boundary and is reported as target-app metadata, not PSF `realNetworkCall` or `realExternalCall`.
```

In `docs/security/safety.md`, add under Real-Mode Readiness Boundary:

```markdown
A1 `ai-novelist` local proof may run the target Web app in DeepSeek provider mode, but PSF does not own the provider transport. PSF-owned `realNetworkCall`, `realExternalCall`, `realPush`, and `realDeploy` remain false; target app provider activity is represented separately as `targetAppProviderCall`, `targetProvider`, and `targetProviderBoundary`. DeepSeek prompt/response bodies, keys, env dumps, and provider payloads must not be written to PSF artifacts, docs, API responses, Hub state, WorkerRuns, or commits.
```

- [ ] **Step 6: Update status docs and summary**

If the A1 proof succeeds, update `docs/status/progress.md`, `docs/status/next-steps.md`, and `summary.md` to say A1 local mirror target observation has been proven, while deeper provider-consuming smoke flows still need separate approval.

If the A1 proof returns manual-action, update the same docs to say A1 is blocked on the specific blocker key and next action, without claiming A1 complete.

Use this sentence for a success case:

```markdown
A1 `ai-novelist` local mirror DeepSeek proof has observed a local target event from `workspaces/mirrors/ai-novelist`; PSF-owned provider/network/push/deploy safety flags remain false, and DeepSeek activity remains target-app-owned metadata rather than a PSF provider call.
```

Use this sentence for a manual-action case:

```markdown
A1 `ai-novelist` local mirror DeepSeek proof is blocked/manual-action on `<blocker-key>`; no proof success is claimed, and PSF-owned provider/network/push/deploy safety flags remain false.
```

- [ ] **Step 7: Run final verification**

Run:

```bash
pnpm test:scripts
pnpm typecheck:scripts
git diff --check
node scripts/check-phase1-structure.mjs
```

If A1 changed shared contracts beyond scripts, run:

```bash
pnpm check
```

Expected: all selected checks pass. Any failed or skipped command must be recorded in `docs/debug/debug.md`.

- [ ] **Step 8: Commit Task 5**

```bash
git add scripts/a1-ai-novelist-proof.ts scripts/a1-ai-novelist-proof.test.ts scripts/psf.ts scripts/psf.test.ts scripts/README.md docs/debug/debug.md docs/architecture/structure.md docs/security/safety.md docs/status/progress.md docs/status/next-steps.md summary.md package.json artifacts/a1/ai-novelist-local-mirror-deepseek-proof.json
git commit -m "完成 A1 本地镜像证明" -m "执行 A1 ai-novelist 隔离本地 mirror proof，记录本地 target observation、redacted artifact、cleanup 结果和文档状态。PSF 自身 realNetworkCall、realExternalCall、realPush、realDeploy 继续为 false；DeepSeek 仅作为目标 app 内部 provider 边界记录。"
```

If A1 produced manual-action instead of success, use this commit title:

```bash
git commit -m "记录 A1 本地镜像阻断结果" -m "执行 A1 ai-novelist 隔离本地 mirror proof 后停在 manual-action/blocker，记录 redacted artifact、debug 结果和后续动作。未伪造 proof success，PSF 自身 provider/network/push/deploy safety flags 继续为 false。"
```

---

## Self-Review Checklist

- Spec coverage: mirror non-overwrite, source/mirror Git metadata, target Web DeepSeek boundary, local observation, redacted evidence, cleanup hard gate, `safeToRun` avoidance, target-app provider metadata, and manual-action blockers are covered by Tasks 1-5.
- Scope: plan adds one focused proof module and one CLI command; no shared schema migration, Hub UI change, Orchestrator route change, Worker Runner change, provider adapter change, push, PR creation, deploy, monitor creation, or Plane sync.
- Testing: starts with pure helper tests, then CLI tests, then script typecheck, then real local proof, then docs and final checks.
- Documentation: new plan is registered in `summary.md`; implementation updates debug, architecture, safety, status, scripts README, and summary according to actual A1 result.
