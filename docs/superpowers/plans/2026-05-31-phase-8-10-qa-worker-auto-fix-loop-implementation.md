# Phase 8-10 QA Worker And Auto Fix Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local dry-run QA Worker, Playwright/MCP placeholder layer, lightweight Worker Runtime facade, and dry-run auto-fix loop for Personal Software Factory.

**Architecture:** Keep the existing pnpm TypeScript monorepo and reuse Project Registry, Mission Schema, Mission Core, Prisma storage models, CLI style, and Codex Worker dry-run. Add small focused packages for worker runtime and auto-fix orchestration, convert `workers/qa-worker` from scaffold to deterministic worker package, and keep real browser/Codex/external-service actions optional or disabled.

**Tech Stack:** TypeScript, pnpm workspace, Zod, Prisma/PostgreSQL, Vitest, tsx, optional Playwright Test.

---

## Scope And Guardrails

- Work on branch `phase-8-10-qa-worker-auto-fix-loop`.
- Do not push to any remote.
- Do not implement Hub Web.
- Do not implement BullMQ.
- Do not run `codex exec`.
- Do not clone, modify, or push the real `ai-novelist` repository.
- Do not call GitHub, Coolify, Uptime Kuma, Plane, n8n, or production services.
- Keep all new runtime behavior defaulted to `dry-run` or skipped.
- Keep `pnpm test` independent of real browsers and staging URLs.
- Use focused tests first, then run `pnpm test`, `pnpm typecheck`, `pnpm build`, `git diff --check`, and `git status --short`.
- Commit locally with a Chinese commit title and Chinese commit body only after checks pass.

## File Structure

Create or modify these files:

- Modify: `package.json` for optional Playwright script and existing `psf` command docs.
- Modify: `.env.example` for `STAGING_URL`, `QA_TEST_URL`, `ENABLE_REAL_PLAYWRIGHT`, and QA/Fix limits.
- Modify: `pnpm-lock.yaml` if adding Playwright as a dev dependency.
- Modify: `packages/mission-schema/src/schemas.ts` to allow `auto_fix` worker type and `skipped` QA status if needed.
- Modify: `packages/mission-schema/src/examples.ts` for QA/auto-fix examples if schema values change.
- Modify: `packages/mission-schema/tests/schemas.test.ts` for new enum coverage.
- Create: `packages/worker-runtime/package.json`.
- Create: `packages/worker-runtime/tsconfig.json`.
- Create: `packages/worker-runtime/src/index.ts`.
- Create: `packages/worker-runtime/tests/worker-runtime.test.ts`.
- Create: `packages/worker-runtime/README.md`.
- Modify: `workers/qa-worker/package.json`.
- Create: `workers/qa-worker/tsconfig.json`.
- Create: `workers/qa-worker/src/index.ts`.
- Create: `workers/qa-worker/src/dry-run.ts`.
- Create: `workers/qa-worker/src/playwright-smoke.ts`.
- Create: `workers/qa-worker/tests/qa-worker.test.ts`.
- Modify: `workers/qa-worker/README.md`.
- Create: `packages/auto-fix-loop/package.json`.
- Create: `packages/auto-fix-loop/tsconfig.json`.
- Create: `packages/auto-fix-loop/src/index.ts`.
- Create: `packages/auto-fix-loop/tests/auto-fix-loop.test.ts`.
- Create: `packages/auto-fix-loop/README.md`.
- Create: `playwright.config.ts`.
- Create: `tests/e2e/psf-smoke.spec.ts`.
- Modify: `scripts/psf.ts`.
- Modify: `scripts/psf.test.ts`.
- Create or update generated files under `missions/mission-0001-ai-novelist-chapter-review/`.
- Create: `docs/qa-worker.md`.
- Create: `docs/playwright.md`.
- Create: `docs/playwright-mcp.md`.
- Create: `docs/auto-fix-loop.md`.
- Create: `docs/worker-runtime.md`.
- Create: `docs/prompts/ai-qa-playwright-mcp.md`.
- Create: `docs/prompts/qa-report-template.md`.
- Create: `docs/prompts/bug-report-template.md`.
- Modify: `docs/artifacts.md`.
- Modify: `docs/storage.md`.
- Modify: `docs/progress.md`.
- Modify: `README.md`.

## Task 1: Prepare Shared Schema For Worker Runtime And QA Loop

**Files:**
- Modify: `packages/mission-schema/src/schemas.ts`
- Modify: `packages/mission-schema/tests/schemas.test.ts`
- Modify: `packages/mission-schema/src/examples.ts` only if examples need new values

- [ ] **Step 1: Add failing schema coverage**

Add this test to `packages/mission-schema/tests/schemas.test.ts`:

```ts
it("accepts auto-fix worker runs and skipped QA runs", () => {
  expect(WorkerRunSchema.parse({
    ...workerRunExample,
    worker_type: "auto_fix",
    mode: "dry-run",
    metadata: { generatedBy: "auto-fix-loop" },
  }).worker_type).toBe("auto_fix");

  expect(QAReportSchema.parse({
    ...qaReportExample,
    mode: "dry-run",
    status: "skipped",
    summary: "Playwright smoke skipped because no QA_TEST_URL or STAGING_URL was set.",
  }).status).toBe("skipped");
});
```

- [ ] **Step 2: Run schema tests and confirm failure**

Run:

```bash
pnpm --filter @psf/mission-schema test
```

Expected: FAIL because `auto_fix` and `skipped` are not accepted yet.

- [ ] **Step 3: Update schema enums**

Change `packages/mission-schema/src/schemas.ts`:

```ts
const WorkerTypeSchema = z.enum(["codex", "qa", "deploy", "monitor", "planner", "integration", "orchestrator", "auto_fix"]);
```

Change QA report status:

```ts
status: z.enum(["queued", "passed", "failed", "running", "cancelled", "skipped"]),
```

- [ ] **Step 4: Run schema tests**

Run:

```bash
pnpm --filter @psf/mission-schema test
```

Expected: PASS.

## Task 2: Add Worker Runtime Facade

**Files:**
- Create: `packages/worker-runtime/package.json`
- Create: `packages/worker-runtime/tsconfig.json`
- Create: `packages/worker-runtime/src/index.ts`
- Create: `packages/worker-runtime/tests/worker-runtime.test.ts`
- Create: `packages/worker-runtime/README.md`
- Modify: `package.json`

- [ ] **Step 1: Add package manifest**

Create `packages/worker-runtime/package.json`:

```json
{
  "name": "@psf/worker-runtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests",
    "lint": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "@psf/mission-schema": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/worker-runtime/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 2: Write failing runtime tests**

Create `packages/worker-runtime/tests/worker-runtime.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests and confirm failure**

Run:

```bash
pnpm --filter @psf/worker-runtime test
```

Expected: FAIL because the package implementation does not exist.

- [ ] **Step 4: Implement runtime**

Create `packages/worker-runtime/src/index.ts`:

```ts
import type { MissionEvent, WorkerRun } from "@psf/mission-schema";

export type WorkerRuntimeType = "qa" | "auto_fix" | "codex" | "planner" | "integration";
export type WorkerRuntimeMode = "dry-run" | "mock" | "real";

export interface WorkerJob {
  id: string;
  missionId: string;
  projectId: string;
  workerType: WorkerRuntimeType;
  mode: WorkerRuntimeMode;
  input: Record<string, unknown>;
  createdAt: string;
}

export interface WorkerHandlerResult {
  output?: Record<string, unknown>;
  logs?: string[];
}

export interface WorkerRuntimeResult {
  workerRun: WorkerRun;
  events: MissionEvent[];
}

export interface WorkerRuntime {
  run(job: WorkerJob, handler: (job: WorkerJob) => Promise<WorkerHandlerResult>): Promise<WorkerRuntimeResult>;
}

export interface InProcessWorkerRuntimeOptions {
  now?: () => string;
}

export class InProcessWorkerRuntime implements WorkerRuntime {
  public lastFailure: WorkerRuntimeResult | null = null;
  private readonly now: () => string;

  constructor(options: InProcessWorkerRuntimeOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(job: WorkerJob, handler: (job: WorkerJob) => Promise<WorkerHandlerResult>): Promise<WorkerRuntimeResult> {
    const startedAt = this.now();
    const started = buildEvent(job, "worker_runtime.started", "Worker runtime started.", startedAt);

    try {
      const handlerResult = await handler(job);
      const finishedAt = this.now();
      const workerRun = buildWorkerRun(job, "succeeded", startedAt, finishedAt, {
        output: handlerResult.output ?? {},
        logs: handlerResult.logs ?? [],
      });
      return {
        workerRun,
        events: [started, buildEvent(job, "worker_runtime.succeeded", "Worker runtime completed.", finishedAt, {
          workerRunId: workerRun.id,
        })],
      };
    } catch (error) {
      const finishedAt = this.now();
      const workerRun = buildWorkerRun(job, "failed", startedAt, finishedAt, {
        error: error instanceof Error ? error.message : String(error),
        logs: ["worker runtime failed"],
      });
      this.lastFailure = {
        workerRun,
        events: [started, buildEvent(job, "worker_runtime.failed", "Worker runtime failed.", finishedAt, {
          workerRunId: workerRun.id,
          error: workerRun.error ?? "unknown error",
        })],
      };
      throw error;
    }
  }
}

function buildWorkerRun(
  job: WorkerJob,
  status: WorkerRun["status"],
  startedAt: string,
  finishedAt: string,
  values: { output?: Record<string, unknown>; error?: string; logs?: string[] },
): WorkerRun {
  return {
    id: `worker-run-${job.id}`,
    mission_id: job.missionId,
    worker_type: job.workerType as WorkerRun["worker_type"],
    status,
    mode: job.mode,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: status === "succeeded" ? 0 : 1,
    input: { projectId: job.projectId, ...job.input },
    output: values.output ?? {},
    error: values.error ?? "",
    logs: values.logs ?? [],
    metadata: { runtime: "in-process", jobId: job.id },
    created_at: startedAt,
    updated_at: finishedAt,
  };
}

function buildEvent(
  job: WorkerJob,
  type: string,
  message: string,
  createdAt: string,
  payload: Record<string, unknown> = {},
): MissionEvent {
  return {
    id: `event-${job.id}-${type.replaceAll(".", "-")}`,
    mission_id: job.missionId,
    type,
    message,
    payload: { workerType: job.workerType, mode: job.mode, ...payload },
    created_at: createdAt,
  };
}
```

- [ ] **Step 5: Add README**

Create `packages/worker-runtime/README.md`:

```md
# Worker Runtime

`@psf/worker-runtime` is the lightweight queue facade for Personal Software Factory. The current implementation is `InProcessWorkerRuntime`, a synchronous local runner used by tests, CLI dry-runs, QA Worker, and auto-fix loop.

It deliberately does not depend on BullMQ. A future `BullMQWorkerRuntime` can implement the same `WorkerRuntime` interface after job payloads and event behavior are stable.
```

- [ ] **Step 6: Run worker runtime tests**

Run:

```bash
pnpm --filter @psf/worker-runtime test
pnpm --filter @psf/worker-runtime typecheck
```

Expected: PASS.

## Task 3: Implement QA Worker Dry Run

**Files:**
- Modify: `workers/qa-worker/package.json`
- Create: `workers/qa-worker/tsconfig.json`
- Create: `workers/qa-worker/src/index.ts`
- Create: `workers/qa-worker/src/dry-run.ts`
- Create: `workers/qa-worker/src/playwright-smoke.ts`
- Create: `workers/qa-worker/tests/qa-worker.test.ts`
- Modify: `workers/qa-worker/README.md`

- [ ] **Step 1: Replace QA package scaffold**

Update `workers/qa-worker/package.json`:

```json
{
  "name": "@psf/qa-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "description": "Personal Software Factory QA Worker dry-run generator.",
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests",
    "lint": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "@psf/mission-schema": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `workers/qa-worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 2: Write failing QA Worker tests**

Create `workers/qa-worker/tests/qa-worker.test.ts` with tests for no-bug dry-run, sample-bug dry-run, schema validation, and Playwright skip:

```ts
import { describe, expect, it } from "vitest";
import { BugReportSchema, QAReportSchema } from "@psf/mission-schema";
import { createQaDryRun, createSkippedPlaywrightSummary } from "../src/index.js";

const input = {
  missionId: "mission-0001-ai-novelist-chapter-review",
  projectId: "ai-novelist",
  passport: {
    id: "ai-novelist",
    name: "AI 小说助手",
    repo: { url: "https://github.com/hxfei-git/ai-novelist.git", default_branch: "main" },
    runtime: { kind: "web" },
    commands: {
      install: ["pnpm install"],
      test: ["pytest -q"],
      build: ["pnpm build"],
      run_staging: ["ai-novelist web"],
    },
    urls: { production: "", staging: "" },
    quality_gates: { require_ai_qa: true },
    core_flows: [{ id: "open_home", name: "打开首页", priority: "P0" as const }],
  },
  qaCharter: "# QA Charter\n\n## Normal Paths\n1. 打开首页\n\n## Abnormal Paths\n1. 空输入提交\n",
  missionFiles: {
    "mission.md": "# Mission\n增加章节审稿和自动修复流程\n",
    "acceptance.md": "# Acceptance\n必须覆盖正常和异常路径。\n",
  },
  now: "2026-05-31T10:00:00.000Z",
};

describe("QA Worker dry-run", () => {
  it("generates complete QA artifacts without browser execution", () => {
    const result = createQaDryRun(input);

    expect(result.files["qa-report.md"]).toContain("## 测试模式");
    expect(result.files["qa-report.md"]).toContain("dry-run");
    expect(result.files["bugs.json"]).toContain("\"bugs\": []");
    expect(result.files["generated-regression.spec.ts"]).toContain("AI 小说助手");
    expect(result.qaRun.status).toBe("passed");
    expect(result.workerRun.worker_type).toBe("qa");
    expect(result.artifacts.map((artifact) => artifact.type)).toContain("qa_report");
    expect(result.events.map((event) => event.type)).toContain("qa.completed");
    expect(QAReportSchema.parse(result.qaRun).status).toBe("passed");
  });

  it("generates a schema-valid sample BugReport when requested", () => {
    const result = createQaDryRun({ ...input, withSampleBug: true });
    const bug = result.bugs[0]!;

    expect(result.qaRun.status).toBe("failed");
    expect(result.files["bugs.json"]).toContain("连续点击生成按钮");
    expect(BugReportSchema.parse(bug).severity).toBe("P1");
    expect(result.events.map((event) => event.type)).toContain("bug.created");
  });

  it("skips optional Playwright when no URL is configured", () => {
    expect(createSkippedPlaywrightSummary({ missionId: input.missionId, now: input.now })).toMatchObject({
      status: "skipped",
      browserOpened: false,
      stagingVisited: false,
    });
  });
});
```

- [ ] **Step 3: Run QA Worker tests and confirm failure**

Run:

```bash
pnpm --filter @psf/qa-worker test
```

Expected: FAIL because implementation does not exist.

- [ ] **Step 4: Implement QA Worker public exports**

Create `workers/qa-worker/src/index.ts`:

```ts
export {
  createQaDryRun,
  type QaDryRunInput,
  type QaDryRunResult,
} from "./dry-run.js";
export {
  createSkippedPlaywrightSummary,
  type PlaywrightSmokeSummary,
} from "./playwright-smoke.js";
```

- [ ] **Step 5: Implement deterministic QA dry-run**

Create `workers/qa-worker/src/dry-run.ts` with:

```ts
import type { Artifact, BugReport, MissionEvent, ProjectPassport, QAReport, WorkerRun } from "@psf/mission-schema";

type MissionFileName = "mission.md" | "acceptance.md";

export interface QaDryRunInput {
  missionId: string;
  projectId: string;
  passport: ProjectPassport;
  qaCharter: string;
  missionFiles: Record<MissionFileName, string>;
  stagingUrl?: string;
  withSampleBug?: boolean;
  now?: string;
}

export interface QaDryRunResult {
  files: Record<"qa-report.md" | "bugs.json" | "qa-summary.json" | "generated-regression.spec.ts", string>;
  workerRun: WorkerRun;
  qaRun: QAReport;
  artifacts: Artifact[];
  bugs: BugReport[];
  events: MissionEvent[];
  directories: string[];
}
```

Then implement `createQaDryRun(input)` to:

- use `now ?? "2026-05-31T10:00:00.000Z"`;
- create stable IDs:
  - `worker-run-${missionId}-qa-dry-run`
  - `qa-run-${missionId}-dry-run`
  - `bug-${missionId}-sample-duplicate-generate` when sample bug is enabled;
- render `qa-report.md` with all required sections from the spec;
- render `bugs.json` as `{ "bugs": [...] }`;
- render `qa-summary.json` with `browserOpened=false`, `stagingVisited=false`, `generatedRegressionTemplate=true`;
- render `generated-regression.spec.ts` with `test.describe.skip("AI 小说助手 dry-run regression template", ...)`;
- return path-only artifacts for screenshot/trace dirs and inline small content artifacts for report/json/spec;
- return `QARun.status="passed"` without bugs and `"failed"` with sample bugs.

- [ ] **Step 6: Implement Playwright skip helper**

Create `workers/qa-worker/src/playwright-smoke.ts`:

```ts
export interface PlaywrightSmokeSummary {
  missionId: string;
  status: "skipped";
  reason: string;
  browserOpened: false;
  stagingVisited: false;
  createdAt: string;
}

export function createSkippedPlaywrightSummary(input: { missionId: string; now?: string }): PlaywrightSmokeSummary {
  return {
    missionId: input.missionId,
    status: "skipped",
    reason: "No QA_TEST_URL or STAGING_URL was configured.",
    browserOpened: false,
    stagingVisited: false,
    createdAt: input.now ?? new Date().toISOString(),
  };
}
```

- [ ] **Step 7: Run QA Worker tests**

Run:

```bash
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/qa-worker typecheck
```

Expected: PASS.

## Task 4: Add Auto Fix Loop Package

**Files:**
- Create: `packages/auto-fix-loop/package.json`
- Create: `packages/auto-fix-loop/tsconfig.json`
- Create: `packages/auto-fix-loop/src/index.ts`
- Create: `packages/auto-fix-loop/tests/auto-fix-loop.test.ts`
- Create: `packages/auto-fix-loop/README.md`

- [ ] **Step 1: Add package files**

Create `packages/auto-fix-loop/package.json`:

```json
{
  "name": "@psf/auto-fix-loop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests",
    "lint": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "@psf/codex-worker": "workspace:*",
    "@psf/mission-core": "workspace:*",
    "@psf/mission-schema": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/auto-fix-loop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 2: Write failing auto-fix tests**

Create `packages/auto-fix-loop/tests/auto-fix-loop.test.ts` covering pass path, bug path, max attempts, and no real Codex:

```ts
import { describe, expect, it } from "vitest";
import { MissionStatus } from "@psf/mission-schema";
import { createAutoFixDryRun } from "../src/index.js";

const baseInput = {
  missionId: "mission-0001-ai-novelist-chapter-review",
  projectId: "ai-novelist",
  missionStatus: MissionStatus.qa_running,
  branchName: "psf/mission-0001-ai-novelist-chapter-review",
  currentBranch: "dry-run/no-worktree",
  passport: {
    id: "ai-novelist",
    name: "AI 小说助手",
    repo: { url: "https://github.com/hxfei-git/ai-novelist.git", default_branch: "main" },
    runtime: { kind: "web" },
    commands: { install: ["pnpm install"], test: ["pytest -q"], build: ["pnpm build"], run_staging: ["ai-novelist web"] },
    urls: { production: "", staging: "" },
    quality_gates: { require_ai_qa: true },
    core_flows: [{ id: "review_chapter", name: "自动审稿", priority: "P0" as const }],
  },
  projectAgents: "# AGENTS\nDo not push remote branches.\n",
  missionFiles: {
    "mission.md": "# Mission\n",
    "acceptance.md": "# Acceptance\n",
    "technical-notes.md": "# Technical Notes\n",
    "risk-notes.md": "# Risk Notes\n",
  },
  bugs: [],
  now: "2026-05-31T10:00:00.000Z",
};

describe("auto-fix loop dry-run", () => {
  it("moves passing QA toward ready_for_review", () => {
    const result = createAutoFixDryRun(baseInput);

    expect(result.decision).toBe("qa_passed");
    expect(result.nextStatus).toBe(MissionStatus.ready_for_review);
    expect(result.files).toEqual({});
    expect(result.events.map((event) => event.type)).toContain("auto_fix.qa_passed");
  });

  it("generates fix mission and Codex dry-run artifacts for bugs", () => {
    const result = createAutoFixDryRun({
      ...baseInput,
      bugs: [{
        id: "bug-sample",
        mission_id: baseInput.missionId,
        title: "连续点击生成按钮会重复提交",
        severity: "P1",
        status: "open",
        reproduction_steps: ["打开首页", "连续点击生成按钮"],
        expected_result: "只提交一次。",
        actual_result: "提交多次。",
        evidence: { source: "qa-worker" },
        suggested_fix_direction: "加入 pending 状态锁。",
        source: "qa-worker",
        created_at: baseInput.now,
        updated_at: baseInput.now,
      }],
    });

    expect(result.decision).toBe("bugs_found");
    expect(result.files["fix-mission.md"]).toContain("连续点击生成按钮会重复提交");
    expect(result.files["fix-acceptance.md"]).toContain("回归测试");
    expect(result.files["fix-codex-prompt.md"]).toContain("Codex Mission Prompt");
    expect(result.files["fix-codex-command.sh"]).toContain("DRY-RUN REVIEW ARTIFACT");
    expect(result.codexDryRun?.executed).toBe(false);
  });

  it("pauses when max attempts are exhausted", () => {
    const result = createAutoFixDryRun({
      ...baseInput,
      currentAttempt: 3,
      maxAttempts: 3,
      bugs: [{
        id: "bug-sample",
        mission_id: baseInput.missionId,
        title: "仍然失败",
        severity: "P1",
        status: "open",
        reproduction_steps: ["重复执行失败路径"],
        expected_result: "通过。",
        actual_result: "失败。",
        evidence: {},
        created_at: baseInput.now,
        updated_at: baseInput.now,
      }],
    });

    expect(result.decision).toBe("max_attempts_exceeded");
    expect(result.nextStatus).toBe(MissionStatus.paused);
    expect(result.codexDryRun).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run auto-fix tests and confirm failure**

Run:

```bash
pnpm --filter @psf/auto-fix-loop test
```

Expected: FAIL because implementation does not exist.

- [ ] **Step 4: Implement auto-fix loop**

Create `packages/auto-fix-loop/src/index.ts` with:

- `AutoFixDryRunInput`
- `AutoFixDryRunResult`
- `createAutoFixDryRun(input)`
- fix document render helpers
- command review wrapper copied from CLI behavior, not Codex command generation

The function must:

- return `decision="qa_passed"` and `nextStatus=ready_for_review` when no bugs exist and status can transition;
- return `decision="bugs_found"` when bugs exist and attempts remain;
- return `decision="max_attempts_exceeded"` and `nextStatus=paused` when attempts are exhausted;
- call `createCodexDryRun` for bug fix artifacts;
- map Codex dry-run files to `fix-codex-prompt.md` and `fix-codex-command.sh`;
- include one `WorkerRun` for auto-fix loop plus the returned Codex worker run in output if needed;
- create artifacts for fix files.

- [ ] **Step 5: Run auto-fix tests**

Run:

```bash
pnpm --filter @psf/auto-fix-loop test
pnpm --filter @psf/auto-fix-loop typecheck
```

Expected: PASS.

## Task 5: Add Optional Playwright Smoke Configuration

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/psf-smoke.spec.ts`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Add scripts**

Modify root `package.json` scripts:

```json
"test:e2e": "playwright test",
"test:e2e:smoke": "playwright test tests/e2e/psf-smoke.spec.ts"
```

Add dev dependency only if absent:

```json
"@playwright/test": "^1.54.0"
```

- [ ] **Step 2: Add config**

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "artifacts/playwright-report" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
```

- [ ] **Step 3: Add skipped-by-default smoke spec**

Create `tests/e2e/psf-smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const targetUrl = process.env.QA_TEST_URL ?? process.env.STAGING_URL ?? "";

test.skip(!targetUrl, "Set QA_TEST_URL or STAGING_URL to run optional smoke QA.");

test("target URL responds with a visible page", async ({ page }) => {
  await page.goto(targetUrl);
  await expect(page.locator("body")).toBeVisible();
});
```

- [ ] **Step 4: Update `.env.example`**

Add:

```text
# Optional QA execution. Normal pnpm test does not require these.
STAGING_URL=
QA_TEST_URL=
ENABLE_REAL_PLAYWRIGHT=0
PSF_MAX_MISSION_FIX_ATTEMPTS=3
PSF_MAX_BUG_FIX_ATTEMPTS=2
```

- [ ] **Step 5: Run smoke test in skip mode**

Run:

```bash
pnpm test:e2e:smoke
```

Expected: command exits 0 with the smoke spec skipped when no URL is set.

## Task 6: Extend Local PSF CLI

**Files:**
- Modify: `scripts/psf.ts`
- Modify: `scripts/psf.test.ts`
- Modify: root `package.json` devDependencies for new workspace packages if needed

- [ ] **Step 1: Write failing CLI tests**

Extend `scripts/psf.test.ts` with tests:

```ts
test("qa dry-run writes report, bugs, summary, regression template, and artifact dirs", async () => {
  const cwd = await createExampleWorkspace("psf-cli-qa-");
  await runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, syncDatabase: false });
  await runPsfCli(["mission:plan", exampleMissionId], { cwd, syncDatabase: false });

  const result = await runPsfCli(["qa:dry-run", exampleMissionId], { cwd, syncDatabase: false });

  expect(result.exitCode).toBe(0);
  expect(await readFile(join(cwd, "missions", exampleMissionId, "qa-report.md"), "utf8")).toContain("dry-run");
  expect(await readFile(join(cwd, "missions", exampleMissionId, "bugs.json"), "utf8")).toContain("\"bugs\": []");
  expect(await readFile(join(cwd, "missions", exampleMissionId, "qa-summary.json"), "utf8")).toContain("\"browserOpened\": false");
  expect(await readFile(join(cwd, "missions", exampleMissionId, "generated-regression.spec.ts"), "utf8")).toContain("AI 小说助手");
});

test("loop dry-run with sample bug generates fix artifacts without executing Codex", async () => {
  const cwd = await createExampleWorkspace("psf-cli-loop-");
  await runPsfCli(["mission:create", "ai-novelist", exampleRequest], { cwd, syncDatabase: false });
  await runPsfCli(["mission:plan", exampleMissionId], { cwd, syncDatabase: false });

  const result = await runPsfCli(["loop:dry-run", exampleMissionId, "--with-sample-bug"], { cwd, syncDatabase: false });

  expect(result.exitCode).toBe(0);
  expect(await readFile(join(cwd, "missions", exampleMissionId, "fix-mission.md"), "utf8")).toContain("Bug");
  expect(await readFile(join(cwd, "missions", exampleMissionId, "fix-codex-command.sh"), "utf8")).toContain("DRY-RUN REVIEW ARTIFACT");
  expect(result.stdout).toContain("Codex was not executed");
});
```

- [ ] **Step 2: Run script tests and confirm failure**

Run:

```bash
pnpm test:scripts
```

Expected: FAIL because CLI commands do not exist.

- [ ] **Step 3: Extend command union and switch**

In `scripts/psf.ts`, update command type:

```ts
type CliCommand =
  | "projects:sync"
  | "mission:create"
  | "mission:plan"
  | "codex:dry-run"
  | "qa:dry-run"
  | "qa:playwright"
  | "fix:dry-run"
  | "loop:dry-run";
```

Add switch branches calling new command functions.

- [ ] **Step 4: Import worker packages**

Add imports:

```ts
import { createAutoFixDryRun } from "@psf/auto-fix-loop";
import { createQaDryRun, createSkippedPlaywrightSummary } from "@psf/qa-worker";
import type { BugReport, QAReport } from "@psf/mission-schema";
```

Update root `package.json` devDependencies:

```json
"@psf/auto-fix-loop": "workspace:*",
"@psf/qa-worker": "workspace:*",
"@psf/worker-runtime": "workspace:*"
```

- [ ] **Step 5: Add CLI database upsert helpers**

Add `qARun`, `bug`, and status update shapes to `PrismaLike`:

```ts
qARun: { upsert(args: unknown): Promise<unknown> };
bug: { upsert(args: unknown): Promise<unknown> };
```

Add helpers:

```ts
async function upsertQARun(prisma: PrismaLike, qaRun: QAReport): Promise<void> { /* map QAReport fields */ }
async function upsertBug(prisma: PrismaLike, bug: BugReport): Promise<void> { /* map BugReport fields */ }
```

Use existing naming conventions: camelCase Prisma fields and `toDateOrNull`.

- [ ] **Step 6: Implement `qa:dry-run`**

Implement `qaDryRunCommand(context, args)`:

- parse mission id through `requireMissionId(args)`;
- detect `--with-sample-bug`;
- load metadata, project, QA charter, mission.md, acceptance.md;
- call `createQaDryRun`;
- write files to mission directory;
- create `.gitkeep` files under `artifacts/screenshots`, `artifacts/traces`, and `artifacts/logs`;
- update metadata with `qaDryRunAt`;
- sync project, mission, worker run, QA run, artifacts, bugs, and events.

- [ ] **Step 7: Implement `qa:playwright` skip command**

Implement `qaPlaywrightCommand(context, args)`:

- parse mission id;
- call `createSkippedPlaywrightSummary` when `QA_TEST_URL` and `STAGING_URL` are empty;
- write `qa-summary.json`;
- print that optional Playwright was skipped.

Do not spawn Playwright from the CLI in this batch.

- [ ] **Step 8: Implement `fix:dry-run` and `loop:dry-run`**

Implement:

- `fixDryRunCommand`: reads existing `bugs.json`, calls `createAutoFixDryRun`.
- `loopDryRunCommand`: runs `createQaDryRun` first, writes QA outputs, then calls `createAutoFixDryRun`.

Both write fix files when returned and sync records when DB sync is enabled.

- [ ] **Step 9: Update usage text**

Add:

```text
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf fix:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf qa:playwright mission-0001-ai-novelist-chapter-review
```

- [ ] **Step 10: Run script tests**

Run:

```bash
pnpm test:scripts
```

Expected: PASS.

## Task 7: Generate Example Mission QA And Fix Artifacts

**Files:**
- Modify or create under `missions/mission-0001-ai-novelist-chapter-review/`

- [ ] **Step 1: Run QA dry-run with sample bug**

Run:

```bash
PSF_SKIP_DB=1 pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
```

Expected: files written:

```text
qa-report.md
bugs.json
qa-summary.json
generated-regression.spec.ts
artifacts/screenshots/.gitkeep
artifacts/traces/.gitkeep
artifacts/logs/.gitkeep
```

- [ ] **Step 2: Run fix dry-run**

Run:

```bash
PSF_SKIP_DB=1 pnpm psf fix:dry-run mission-0001-ai-novelist-chapter-review
```

Expected: files written:

```text
fix-mission.md
fix-acceptance.md
fix-codex-prompt.md
fix-codex-command.sh
```

- [ ] **Step 3: Confirm command artifact is not executable**

Run:

```bash
stat -c "%a %n" missions/mission-0001-ai-novelist-chapter-review/fix-codex-command.sh
```

Expected: mode does not include executable bits, commonly `644`.

## Task 8: Documentation Updates

**Files:**
- Create: `docs/qa-worker.md`
- Create: `docs/playwright.md`
- Create: `docs/playwright-mcp.md`
- Create: `docs/auto-fix-loop.md`
- Create: `docs/worker-runtime.md`
- Create: `docs/prompts/ai-qa-playwright-mcp.md`
- Create: `docs/prompts/qa-report-template.md`
- Create: `docs/prompts/bug-report-template.md`
- Modify: `docs/artifacts.md`
- Modify: `docs/storage.md`
- Modify: `docs/progress.md`
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Write QA Worker docs**

Create `docs/qa-worker.md` documenting:

- dry-run inputs;
- generated files;
- QARun/BugReport/Artifact/WorkerRun/MissionEvent outputs;
- `--with-sample-bug`;
- why no browser is required by default.

- [ ] **Step 2: Write Playwright docs**

Create `docs/playwright.md` documenting:

- `pnpm test:e2e:smoke`;
- `QA_TEST_URL` and `STAGING_URL`;
- skip behavior;
- screenshots/traces as path-only artifacts.

- [ ] **Step 3: Write Playwright MCP docs and prompts**

Create `docs/playwright-mcp.md` and prompt templates. The AI QA prompt must instruct AI to:

- act like a real user;
- execute normal and abnormal paths;
- inspect console/network errors;
- produce structured BugReport and QA Report;
- avoid high severity without evidence;
- avoid entering secrets or destructive production actions.

- [ ] **Step 4: Write Auto Fix Loop docs**

Create `docs/auto-fix-loop.md` documenting:

- QA pass path;
- bug path;
- max attempt limits;
- Codex dry-run reuse;
- real Codex disabled boundary.

- [ ] **Step 5: Update README and progress**

Update `README.md` with new commands:

```bash
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf qa:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf fix:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf qa:playwright mission-0001-ai-novelist-chapter-review
pnpm test:e2e:smoke
```

Update `docs/progress.md` with completed work, files, migration note, QA commands, dry-run boundaries, missing real staging/Codex requirements, Hub deferral, BullMQ deferral, plan alignment, and next batch suggestions.

- [ ] **Step 6: Fix stale auth statement**

Update `docs/storage.md` so it says token auth is implemented for write routes and storage remains route-independent.

## Task 9: Final Verification And Commit

**Files:**
- All changed files

- [ ] **Step 1: Run focused package tests**

Run:

```bash
pnpm --filter @psf/worker-runtime test
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/auto-fix-loop test
pnpm test:scripts
```

Expected: PASS.

- [ ] **Step 2: Run required full checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Expected:

- `pnpm test`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- `git diff --check`: no output.
- `git status --short`: only intended tracked changes plus untracked `.codegraph/` if still present.

- [ ] **Step 3: Review generated artifacts for secrets and real execution**

Run:

```bash
rg -n "sk-|api[_-]?key|token|password|codex exec$|danger-full-access" README.md docs missions scripts packages workers tests .env.example
```

Expected: no real secrets; `codex exec` appears only inside review artifact comments, docs, or safe command templates; no `danger-full-access`.

- [ ] **Step 4: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml .env.example README.md docs packages workers scripts tests playwright.config.ts missions
git commit -m "实现第八至十阶段干跑闭环" -m "新增 QA Worker dry-run、Worker Runtime facade、Playwright/MCP 占位、自动修复 dry-run、CLI 命令、示例任务产物与文档。所有真实 Codex、浏览器、远程推送和外部服务调用默认关闭。"
```

Expected: local commit created. Do not push.

## Plan Self-Review

- Spec coverage: covered Worker Runtime, QA Worker dry-run, optional Playwright, Playwright MCP docs/prompts, auto-fix dry-run, CLI, docs, verification, and safety boundaries.
- Placeholder scan: no unresolved placeholder markers or vague implementation steps remain; Playwright/MCP placeholders are explicit scope boundaries.
- Type consistency: uses current snake_case schema records and existing CLI/Prisma naming conventions; new `auto_fix` worker type and `skipped` QA status are introduced first before downstream tasks use them.
