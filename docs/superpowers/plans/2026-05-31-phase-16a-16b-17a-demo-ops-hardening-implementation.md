# Phase 16A/16B/17A Demo Ops Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable local dry-run demo workflow, protected Hub/API dry-run action entrypoints, doctor/reset/report operations, and complete MVP operations documentation.

**Architecture:** Add `@psf/demo-workflow` as the shared local workflow package that composes Project Registry, Mission Planner, Codex Worker dry-run, QA Worker dry-run, Auto Fix Loop dry-run, and report generation. CLI and Orchestrator API call typed functions from this package; Hub Web only calls Orchestrator API and never runs shell, reads the filesystem, or touches external providers directly.

**Tech Stack:** pnpm workspace, TypeScript, Zod, Fastify, Prisma/PostgreSQL, Vitest, Vite React, existing dry-run workers.

---

## File Structure

Create:

- `packages/demo-workflow/package.json`: package metadata, scripts, workspace dependencies.
- `packages/demo-workflow/tsconfig.json`: TypeScript config extending the root base config.
- `packages/demo-workflow/README.md`: package purpose and dry-run boundary.
- `packages/demo-workflow/src/constants.ts`: demo IDs, URLs, command names, and safety constants.
- `packages/demo-workflow/src/types.ts`: `DemoWorkflowOptions`, `DemoWorkflowResult`, `DoctorResult`, reset/report/action response types.
- `packages/demo-workflow/src/paths.ts`: safe path helpers for mission files and reports.
- `packages/demo-workflow/src/files.ts`: mission metadata and artifact file read/write helpers.
- `packages/demo-workflow/src/db.ts`: optional Prisma sync helpers and scoped demo reset helper.
- `packages/demo-workflow/src/doctor.ts`: read-only local health checks and secret redaction.
- `packages/demo-workflow/src/report.ts`: `docs/reports/demo-ai-novelist-report.md` renderer.
- `packages/demo-workflow/src/workflow.ts`: demo seed, plan, Codex dry-run, QA dry-run, fix dry-run, full loop.
- `packages/demo-workflow/src/index.ts`: public exports.
- `packages/demo-workflow/tests/demo-workflow.test.ts`: focused workflow, reset, doctor, report tests.
- `apps/orchestrator-api/src/actions.ts`: API-facing wrappers around workflow action functions.
- `docs/brainstorms/phase-16-17a.md`: implementation design check required by the user.
- `docs/reports/demo-ai-novelist-report.md`: generated report output.
- `docs/safety.md`
- `docs/worker-permissions.md`
- `docs/operations.md`
- `docs/troubleshooting.md`
- `docs/local-development.md`
- `docs/health-checks.md`
- `docs/final-mvp-scope.md`
- `docs/next-steps.md`

Modify:

- `package.json`: add `@psf/demo-workflow` dev dependency if root scripts import it, keep `pnpm psf`.
- `scripts/psf.ts`: route existing and new commands through `@psf/demo-workflow`.
- `scripts/psf.test.ts`: add CLI tests for `doctor`, `demo:*`, reset safety, report.
- `apps/orchestrator-api/package.json`: add `@psf/demo-workflow`.
- `apps/orchestrator-api/src/server.ts`: add action routes.
- `apps/orchestrator-api/src/services.ts`: keep existing resource services; delegate action methods to `actions.ts`.
- `apps/orchestrator-api/tests/api.test.ts`: add action route auth, success, 404, safety tests.
- `apps/hub/src/api/types.ts`: add action response types.
- `apps/hub/src/api/client.ts`: add dry-run action methods.
- `apps/hub/src/App.tsx`: add Dashboard and Mission Detail dry-run buttons.
- `apps/hub/src/styles.css`: add compact action toolbar/loading/error styles.
- `apps/hub/tests/hub.test.tsx`: add button render/click/success/error/token safety tests.
- `.env.example`: add demo/doctor reset variables if absent.
- `docs/api.md`, `docs/auth.md`, `docs/hub-web.md`, `docs/progress.md`, `README.md`: document Phase 16A/16B/17A.

Protect:

- Do not stage or revert existing uncommitted demo artifact edits under `missions/mission-0001-ai-novelist-chapter-review/` unless the executing user explicitly asks.

---

## Task 1: Scaffold `@psf/demo-workflow`

**Files:**
- Create: `packages/demo-workflow/package.json`
- Create: `packages/demo-workflow/tsconfig.json`
- Create: `packages/demo-workflow/README.md`
- Create: `packages/demo-workflow/src/constants.ts`
- Create: `packages/demo-workflow/src/types.ts`
- Create: `packages/demo-workflow/src/index.ts`
- Create: `packages/demo-workflow/tests/demo-workflow.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing package smoke test**

Create `packages/demo-workflow/tests/demo-workflow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_API_URL,
  DEFAULT_DEMO_HUB_URL,
  EXAMPLE_MISSION_ID,
  getDemoBoundary,
} from "../src/index.js";

describe("@psf/demo-workflow scaffold", () => {
  it("exports fixed demo constants and dry-run boundary", () => {
    expect(EXAMPLE_MISSION_ID).toBe("mission-0001-ai-novelist-chapter-review");
    expect(DEFAULT_DEMO_API_URL).toBe("http://127.0.0.1:3000");
    expect(DEFAULT_DEMO_HUB_URL).toBe("http://127.0.0.1:5173");
    expect(getDemoBoundary()).toMatchObject({
      dryRun: true,
      realCodexExecuted: false,
      realExternalCall: false,
      realPush: false,
      realDeploy: false,
    });
  });
});
```

- [ ] **Step 2: Add package files**

Create `packages/demo-workflow/package.json`:

```json
{
  "name": "@psf/demo-workflow",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "description": "Local dry-run demo and operations workflow for Personal Software Factory.",
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests",
    "lint": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "@psf/auto-fix-loop": "workspace:*",
    "@psf/codex-worker": "workspace:*",
    "@psf/db": "workspace:*",
    "@psf/integrations": "workspace:*",
    "@psf/mission-planner": "workspace:*",
    "@psf/mission-schema": "workspace:*",
    "@psf/project-registry": "workspace:*",
    "@psf/qa-worker": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  },
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Create `packages/demo-workflow/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Create `packages/demo-workflow/src/constants.ts`:

```ts
export const EXAMPLE_PROJECT_ID = "ai-novelist";
export const EXAMPLE_MISSION_ID = "mission-0001-ai-novelist-chapter-review";
export const EXAMPLE_REQUEST = "增加章节审稿和自动修复流程";
export const EXAMPLE_TITLE = "增加章节审稿和自动修复流程";
export const EXAMPLE_SLUG = "ai-novelist-chapter-review";
export const EXAMPLE_BRANCH = `psf/${EXAMPLE_MISSION_ID}`;
export const DEFAULT_DEMO_API_URL = "http://127.0.0.1:3000";
export const DEFAULT_DEMO_HUB_URL = "http://127.0.0.1:5173";
export const DEFAULT_DATABASE_URL = "postgresql://psf:psf_dev_password@localhost:5432/psf?schema=public";
export const DEMO_REPORT_PATH = "docs/reports/demo-ai-novelist-report.md";
```

Create `packages/demo-workflow/src/types.ts` with these exports:

```ts
export interface DemoBoundary {
  dryRun: true;
  realCodexExecuted: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
}

export interface DemoWorkflowOptions {
  cwd?: string;
  withSampleBug?: boolean;
  resetDemo?: boolean;
  skipDb?: boolean;
  apiUrl?: string;
  hubUrl?: string;
  now?: string;
}

export interface DemoWorkflowResult {
  missionId: string;
  projectId: string;
  apiUrl: string;
  hubUrl: string;
  missionDetailUrl: string;
  generatedArtifacts: string[];
  workerRunIds: string[];
  qaRunIds: string[];
  bugIds: string[];
  eventIds: string[];
  dbSynced: boolean;
  boundary: DemoBoundary;
  message: string;
}

export type DoctorStatus = "ok" | "warning" | "failed";

export interface DoctorCheck {
  key: string;
  status: DoctorStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorResult {
  status: DoctorStatus;
  checks: DoctorCheck[];
}
```

Create `packages/demo-workflow/src/index.ts`:

```ts
export * from "./constants.js";
export * from "./types.js";

import type { DemoBoundary } from "./types.js";

export function getDemoBoundary(): DemoBoundary {
  return {
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
  };
}
```

Add root dependency in `package.json` `devDependencies`:

```json
"@psf/demo-workflow": "workspace:*"
```

- [ ] **Step 3: Run focused package test**

Run:

```bash
pnpm --filter @psf/demo-workflow test
```

Expected: PASS for the scaffold smoke test.

- [ ] **Step 4: Commit scaffold**

```bash
git add package.json packages/demo-workflow
git commit -m "搭建演示工作流包" -m "新增 @psf/demo-workflow 包，定义 ai-novelist demo 常量、基础类型和 dry-run 安全边界。"
```

---

## Task 2: Implement Local Demo Workflow And Report

**Files:**
- Create: `packages/demo-workflow/src/paths.ts`
- Create: `packages/demo-workflow/src/files.ts`
- Create: `packages/demo-workflow/src/db.ts`
- Create: `packages/demo-workflow/src/report.ts`
- Create: `packages/demo-workflow/src/workflow.ts`
- Modify: `packages/demo-workflow/src/index.ts`
- Modify: `packages/demo-workflow/tests/demo-workflow.test.ts`

- [ ] **Step 1: Add failing tests for demo artifacts and report**

Append tests:

```ts
import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEMO_REPORT_PATH,
  runAiNovelistDemo,
} from "../src/index.js";

it("runs the ai-novelist demo with sample bug and writes dry-run artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-demo-workflow-"));
  await cp(resolve("projects"), join(cwd, "projects"), { recursive: true });

  const result = await runAiNovelistDemo({
    cwd,
    skipDb: true,
    withSampleBug: true,
    now: "2026-05-31T12:00:00.000Z",
  });

  expect(result.missionId).toBe(EXAMPLE_MISSION_ID);
  expect(result.dbSynced).toBe(false);
  expect(result.boundary.realCodexExecuted).toBe(false);
  expect(result.generatedArtifacts).toEqual(expect.arrayContaining([
    `missions/${EXAMPLE_MISSION_ID}/mission.md`,
    `missions/${EXAMPLE_MISSION_ID}/codex-command.sh`,
    `missions/${EXAMPLE_MISSION_ID}/qa-report.md`,
    `missions/${EXAMPLE_MISSION_ID}/bugs.json`,
    `missions/${EXAMPLE_MISSION_ID}/fix-mission.md`,
    `missions/${EXAMPLE_MISSION_ID}/fix-codex-command.sh`,
  ]));
  await expect(stat(join(cwd, "missions", EXAMPLE_MISSION_ID, "qa-report.md"))).resolves.toBeTruthy();
  expect(await readFile(join(cwd, "missions", EXAMPLE_MISSION_ID, "fix-codex-command.sh"), "utf8")).toContain("DRY-RUN REVIEW ARTIFACT");
});

it("generates a repeatable demo acceptance report without secrets", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-demo-report-"));
  await cp(resolve("projects"), join(cwd, "projects"), { recursive: true });
  await runAiNovelistDemo({ cwd, skipDb: true, withSampleBug: true, now: "2026-05-31T12:00:00.000Z" });

  const report = await readFile(join(cwd, DEMO_REPORT_PATH), "utf8");
  expect(report).toContain("# AI Novelist Demo Acceptance Report");
  expect(report).toContain("realCodexExecuted: false");
  expect(report).toContain(`missions/${EXAMPLE_MISSION_ID}/qa-report.md`);
  expect(report).not.toMatch(/TOKEN|PASSWORD|SECRET|ghp_/i);
});
```

- [ ] **Step 2: Implement safe paths and file helpers**

`paths.ts` exports `resolveInside`, `missionDir`, `missionFile`, `relativeToCwd`.

`files.ts` exports:

```ts
export interface MissionMetadata {
  id: string;
  projectId: string;
  title: string;
  slug: string;
  rawRequest: string;
  status: "received" | "planned";
  priority: "P0" | "P1" | "P2" | "P3";
  riskLevel: "low" | "medium" | "high";
  branchName: string;
  missionDir: string;
  dryRun: true;
  createdAt: string;
  updatedAt: string;
  plannedAt?: string;
  codexDryRunAt?: string;
  qaDryRunAt?: string;
  fixDryRunAt?: string;
}
```

It must provide `readMissionMetadataIfExists`, `writeMissionMetadata`, `readMissionFile`, `writeMissionFile`, `writeJsonFile`, and `ensureArtifactDirs`.

- [ ] **Step 3: Implement workflow orchestration**

`workflow.ts` must implement:

```ts
export async function runAiNovelistDemo(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult>
export async function ensureDemoMission(options: DemoWorkflowOptions = {}): Promise<{ metadata: MissionMetadata; created: boolean }>
export async function runMissionPlan(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult>
export async function runCodexDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult>
export async function runQaDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult>
export async function runFixDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult>
export async function runLoopDryRun(options: DemoWorkflowOptions = {}): Promise<DemoWorkflowResult>
```

Implementation rules:

- Load `projects/ai-novelist/project.passport.yaml` through `scanProjectRegistry`.
- Use fixed demo metadata from `constants.ts`.
- Use `createDeterministicMissionPlan` for planner artifacts.
- Use `createCodexDryRun` for Codex artifacts with `enableRealCodex: false`.
- Use `createQaDryRun` for QA artifacts.
- Use `createAutoFixDryRun` for fix artifacts.
- Convert generated `codex-command.sh` and `fix-codex-command.sh` into review-only files and set permissions to `0o644`.
- Generate `docs/reports/demo-ai-novelist-report.md` every time `runAiNovelistDemo` completes.

- [ ] **Step 4: Implement DB sync helpers**

`db.ts` exports `syncDemoResources` with the same upsert behavior currently in `scripts/psf.ts`. Keep `skipDb: true` fully file-only. If DB sync fails, throw an error message containing:

```text
Database sync failed. Start the local Postgres service or use PSF_SKIP_DB=1 / --skip-db for artifact-only dry-runs.
```

Redact database password with `://user:<redacted>@`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter @psf/demo-workflow test
pnpm --filter @psf/demo-workflow typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit workflow**

```bash
git add packages/demo-workflow
git commit -m "实现本地演示工作流" -m "串联 ai-novelist demo 的规划、Codex dry-run、QA dry-run、自动修复 dry-run 和验收报告生成，保持所有真实动作关闭。"
```

---

## Task 3: Implement Doctor And Demo Reset

**Files:**
- Create: `packages/demo-workflow/src/doctor.ts`
- Modify: `packages/demo-workflow/src/db.ts`
- Modify: `packages/demo-workflow/src/index.ts`
- Modify: `packages/demo-workflow/tests/demo-workflow.test.ts`

- [ ] **Step 1: Add failing tests**

Append tests:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { runDoctor, resetDemoData } from "../src/index.js";

it("doctor reports warnings without leaking token values", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "psf-doctor-"));
  await mkdir(join(cwd, "projects", "ai-novelist"), { recursive: true });
  await mkdir(join(cwd, "apps", "hub"), { recursive: true });
  await mkdir(join(cwd, "apps", "orchestrator-api"), { recursive: true });
  await mkdir(join(cwd, "packages"), { recursive: true });
  await mkdir(join(cwd, "workers"), { recursive: true });
  await mkdir(join(cwd, "missions"), { recursive: true });
  await cp(resolve("projects", "ai-novelist", "project.passport.yaml"), join(cwd, "projects", "ai-novelist", "project.passport.yaml"));
  await writeFile(join(cwd, ".env.example"), "PSF_API_TOKEN=example\n", "utf8");

  const result = await runDoctor({
    cwd,
    env: { PSF_API_TOKEN: "super-secret-token", ENABLE_REAL_CODEX: "1" },
    checkDatabase: false,
  });

  expect(result.status).toBe("warning");
  expect(JSON.stringify(result)).not.toContain("super-secret-token");
  expect(result.checks.some((check) => check.key === "enable-real-codex")).toBe(true);
});

it("demo reset refuses to delete without confirmation and protects non-demo ids", async () => {
  await expect(resetDemoData({ cwd: "/tmp", confirm: false, missionId: EXAMPLE_MISSION_ID, skipDb: true })).resolves.toMatchObject({
    deleted: false,
    requiresConfirmation: true,
  });
  await expect(resetDemoData({ cwd: "/tmp", confirm: true, missionId: "mission-real-production", skipDb: true })).rejects.toThrow("Refusing to reset non-demo mission");
});
```

- [ ] **Step 2: Implement `runDoctor`**

`doctor.ts` exports:

```ts
export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  json?: boolean;
  checkDatabase?: boolean;
  checkApi?: boolean;
  checkHub?: boolean;
}

export async function runDoctor(options?: DoctorOptions): Promise<DoctorResult>
export function formatDoctorResult(result: DoctorResult, json?: boolean): string
```

Checks must include Node, pnpm command availability through `process.version` and `process.env.npm_execpath`, required directories, `.env`/`.env.example`, passport parsing, optional DB connection, optional API/Hub HTTP GET, integration status, and real-mode warnings.

- [ ] **Step 3: Implement `resetDemoData`**

`db.ts` exports:

```ts
export interface DemoResetOptions {
  cwd?: string;
  missionId?: string;
  confirm?: boolean;
  skipDb?: boolean;
}

export interface DemoResetResult {
  deleted: boolean;
  requiresConfirmation: boolean;
  missionId: string;
  deletedPaths: string[];
  deletedDatabaseRecords: string[];
  message: string;
}

export async function resetDemoData(options?: DemoResetOptions): Promise<DemoResetResult>
```

Rules:

- Accept only `mission-0001-ai-novelist-chapter-review` or IDs starting with `demo-`.
- Without confirmation, return `deleted: false`.
- With confirmation, remove only `missions/<missionId>` and scoped DB records for that mission.
- Use Prisma deleteMany scoped by `missionId`; never call raw truncate.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @psf/demo-workflow test
```

Expected: PASS.

- [ ] **Step 5: Commit doctor/reset**

```bash
git add packages/demo-workflow
git commit -m "补齐医生检查和演示重置" -m "新增只读 doctor 检查、脱敏输出和受确认保护的 demo reset，禁止清理非 demo 数据。"
```

---

## Task 4: Refactor PSF CLI To Use Demo Workflow

**Files:**
- Modify: `scripts/psf.ts`
- Modify: `scripts/psf.test.ts`
- Modify: `scripts/README.md`

- [ ] **Step 1: Add failing CLI tests**

Add tests:

```ts
test("demo ai-novelist runs the full dry-run flow with sample bug", async () => {
  const cwd = await createExampleWorkspace("psf-cli-demo-");
  const result = await runPsfCli(["demo:ai-novelist", "--with-sample-bug", "--skip-db"], { cwd, syncDatabase: false });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("mission-0001-ai-novelist-chapter-review");
  expect(result.stdout).toContain("realCodexExecuted=false");
  expect(await readFile(join(cwd, "missions", exampleMissionId, "qa-report.md"), "utf8")).toContain("QA Report");
  expect(await readFile(join(cwd, "docs", "reports", "demo-ai-novelist-report.md"), "utf8")).toContain("AI Novelist Demo Acceptance Report");
});

test("doctor json redacts secrets", async () => {
  const result = await withEnv({ PSF_API_TOKEN: "local-secret-token" }, () =>
    runPsfCli(["doctor", "--json"], { syncDatabase: false }),
  );
  expect(result.stdout).not.toContain("local-secret-token");
  expect(result.stdout).toContain("\"status\"");
});

test("demo reset requires confirmation", async () => {
  const cwd = await createExampleWorkspace("psf-cli-reset-");
  await runPsfCli(["demo:ai-novelist", "--skip-db"], { cwd, syncDatabase: false });
  const result = await runPsfCli(["demo:reset"], { cwd, syncDatabase: false });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("DEMO_RESET_CONFIRM=1");
  await expect(stat(join(cwd, "missions", exampleMissionId))).resolves.toBeTruthy();
});
```

- [ ] **Step 2: Update command union and dispatch**

Extend `CliCommand`:

```ts
type CliCommand =
  | "projects:sync"
  | "mission:create"
  | "mission:plan"
  | "codex:dry-run"
  | "qa:dry-run"
  | "qa:playwright"
  | "fix:dry-run"
  | "loop:dry-run"
  | "integrations:status"
  | "integrations:dry-run"
  | "doctor"
  | "demo:seed"
  | "demo:reset"
  | "demo:ai-novelist"
  | "demo:report";
```

Dispatch new commands to imported functions from `@psf/demo-workflow`.

- [ ] **Step 3: Implement CLI formatting**

For `demo:ai-novelist`, print lines:

```text
Mission ID: mission-0001-ai-novelist-chapter-review
API URL: http://127.0.0.1:3000
Hub URL: http://127.0.0.1:5173
Mission Detail URL: http://127.0.0.1:5173/#mission-detail?id=mission-0001-ai-novelist-chapter-review
realCodexExecuted=false realExternalCall=false realPush=false realDeploy=false
```

For `demo:reset` without confirmation, print:

```text
Demo reset preview only. Set DEMO_RESET_CONFIRM=1 to delete demo data.
```

- [ ] **Step 4: Update usage text**

Add commands to `usage()`:

```text
  pnpm psf doctor
  pnpm psf doctor --json
  pnpm psf demo:seed
  DEMO_RESET_CONFIRM=1 pnpm psf demo:reset
  pnpm psf demo:ai-novelist --with-sample-bug
  pnpm psf demo:report
```

- [ ] **Step 5: Run CLI tests**

```bash
pnpm test:scripts
```

Expected: PASS.

- [ ] **Step 6: Commit CLI**

```bash
git add scripts/psf.ts scripts/psf.test.ts scripts/README.md
git commit -m "接入演示工作流命令" -m "将 psf CLI 扩展为 doctor、demo seed、demo reset、ai-novelist demo 和 demo report 入口，并保持所有动作为 dry-run。"
```

---

## Task 5: Add Orchestrator Dry-Run Action APIs

**Files:**
- Create: `apps/orchestrator-api/src/actions.ts`
- Modify: `apps/orchestrator-api/package.json`
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Add failing API tests**

Add tests using auth enabled:

```ts
it("protects mission dry-run action routes", async () => {
  const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
  const response = await server.inject({ method: "POST", url: "/missions/mission-missing/actions/qa-dry-run" });
  expect(response.statusCode).toBe(401);
});

it("runs demo ai-novelist action without real Codex or external calls", async () => {
  const root = await createAiNovelistRegistryRoot();
  try {
    const { server } = await createTestServer({ auth: { token: "secret", disabled: false }, registryRoot: root });
    await server.inject({
      method: "POST",
      url: "/projects/sync",
      headers: { authorization: "Bearer secret" },
    });
    const response = await server.inject({
      method: "POST",
      url: "/demo/ai-novelist",
      headers: { authorization: "Bearer secret" },
      payload: { withSampleBug: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      missionId: "mission-0001-ai-novelist-chapter-review",
      mode: "dry-run",
      dryRun: true,
      realCodexExecuted: false,
      realExternalCall: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Add one test for `POST /missions/:id/actions/qa-dry-run` after creating and planning a Mission, and assert the response contains `qaRunIds` and `bugIds` when `{ withSampleBug: true }`.

- [ ] **Step 2: Add package dependency**

In `apps/orchestrator-api/package.json` dependencies:

```json
"@psf/demo-workflow": "workspace:*"
```

- [ ] **Step 3: Implement `actions.ts`**

Export:

```ts
export const MissionActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
});

export const DemoActionRequestSchema = z.object({
  withSampleBug: z.boolean().default(false),
  resetDemo: z.literal(false).default(false),
});

export function toActionResponse(result: DemoWorkflowResult) {
  return {
    missionId: result.missionId,
    projectId: result.projectId,
    mode: "dry-run",
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    generatedArtifacts: result.generatedArtifacts,
    workerRunIds: result.workerRunIds,
    qaRunIds: result.qaRunIds,
    bugIds: result.bugIds,
    eventIds: result.eventIds,
    recommendedNextAction: result.message,
  };
}
```

The action functions call `@psf/demo-workflow` with `cwd: process.cwd()`, `skipDb: false`, and the request body options. Do not spawn shell commands.

- [ ] **Step 4: Register routes**

In `server.ts`, add:

```ts
server.post<{ Params: { id: string } }>("/missions/:id/actions/plan", async (request) => services.runMissionPlanAction(request.params.id, request.body));
server.post<{ Params: { id: string } }>("/missions/:id/actions/codex-dry-run", async (request) => services.runCodexDryRunAction(request.params.id, request.body));
server.post<{ Params: { id: string } }>("/missions/:id/actions/qa-dry-run", async (request) => services.runQaDryRunAction(request.params.id, request.body));
server.post<{ Params: { id: string } }>("/missions/:id/actions/fix-dry-run", async (request) => services.runFixDryRunAction(request.params.id, request.body));
server.post<{ Params: { id: string } }>("/missions/:id/actions/loop-dry-run", async (request) => services.runLoopDryRunAction(request.params.id, request.body));
server.post("/demo/ai-novelist", async (request) => services.runAiNovelistDemoAction(request.body));
```

- [ ] **Step 5: Add service methods**

In `services.ts`, add methods that first check Mission existence for mission-scoped routes:

```ts
async runQaDryRunAction(id: string, body: unknown) {
  await getRawMission(id);
  return runStorageBackedQaDryRunAction({ missionId: id, body, storage, registryRoot });
}
```

If `@psf/demo-workflow` only supports the fixed demo Mission in this batch, validate `id === EXAMPLE_MISSION_ID` and return `400 VALIDATION_ERROR` for other IDs with message:

```text
This dry-run action currently supports the ai-novelist demo mission only.
```

- [ ] **Step 6: Run API tests**

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit API actions**

```bash
git add apps/orchestrator-api docs/api.md
git commit -m "增加安全干跑动作接口" -m "为 Orchestrator API 增加受令牌保护的 Mission 和 ai-novelist demo dry-run 动作入口，不执行 shell、Codex 或外部 API。"
```

---

## Task 6: Add Hub Web Dry-Run Buttons

**Files:**
- Modify: `apps/hub/src/api/types.ts`
- Modify: `apps/hub/src/api/client.ts`
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/src/styles.css`
- Modify: `apps/hub/tests/hub.test.tsx`
- Modify: `docs/hub-web.md`

- [ ] **Step 1: Add failing Hub client tests**

Add tests:

```ts
it("calls mission qa dry-run action with bearer token", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ missionId: "mission-1", dryRun: true }) });
  const client = createOrchestratorClient({ baseUrl: "http://api.local", token: "hub-token", fetchImpl: fetchMock });
  await client.runMissionAction("mission-1", "qa-dry-run", { withSampleBug: true });
  expect(fetchMock).toHaveBeenCalledWith("http://api.local/missions/mission-1/actions/qa-dry-run", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer hub-token" },
    body: JSON.stringify({ withSampleBug: true }),
  });
});
```

- [ ] **Step 2: Add action types and client methods**

In `types.ts`:

```ts
export type MissionDryRunAction = "plan" | "codex-dry-run" | "qa-dry-run" | "fix-dry-run" | "loop-dry-run";

export interface DryRunActionResponse {
  missionId: string;
  projectId?: string;
  mode: "dry-run";
  dryRun: true;
  realCodexExecuted: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;
  generatedArtifacts: string[];
  workerRunIds: string[];
  qaRunIds: string[];
  bugIds: string[];
  eventIds: string[];
  recommendedNextAction: string;
}
```

In `client.ts`, add:

```ts
runMissionAction: (missionId, action, payload = {}) => request<DryRunActionResponse>(
  `/missions/${encodeURIComponent(missionId)}/actions/${action}`,
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
),
runAiNovelistDemo: (payload = {}) => request<DryRunActionResponse>(
  "/demo/ai-novelist",
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
),
```

- [ ] **Step 3: Add Mission Detail action toolbar**

In `App.tsx`, add action state:

```ts
const [actionState, setActionState] = useState<{ loading: string; message: string; error: string }>({ loading: "", message: "", error: "" });
```

Add buttons with labels:

- `Plan Mission dry-run`
- `Generate Codex dry-run`
- `Run QA dry-run`
- `Run QA dry-run with Sample Bug`
- `Run Fix dry-run`
- `Run Full Loop dry-run`
- `Refresh Summary`

On success, call `client.getMissionSummary(missionId)` and update `missionState`.

- [ ] **Step 4: Add Dashboard demo buttons**

Add:

- `Generate ai-novelist Demo dry-run`
- `Generate ai-novelist Demo with Sample Bug dry-run`
- `Refresh Dashboard`

On success, reload `GET /dashboard`.

- [ ] **Step 5: Add UI tests**

Add tests that render `renderMissionDetailView` with callbacks or render `App` with a mock client:

```ts
it("renders dry-run mission action buttons", () => {
  const text = textFromElement(renderMissionDetailView({
    state: { status: "success", data: missionSummary },
    actions: createNoopActions(),
  }));
  expect(text).toContain("Run QA dry-run");
  expect(text).toContain("Run Full Loop dry-run");
});
```

Use an `App` integration-style unit test with a mock client to click `Run QA dry-run with Sample Bug` and assert `runMissionAction` was called with `"qa-dry-run"` and `{ withSampleBug: true }`.

- [ ] **Step 6: Run Hub tests**

```bash
pnpm --filter @psf/hub test
pnpm --filter @psf/hub typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Hub actions**

```bash
git add apps/hub docs/hub-web.md
git commit -m "增加管理台干跑动作按钮" -m "在 Dashboard 和 Mission Detail 中增加安全 dry-run 动作入口，所有按钮通过 Orchestrator API 调用并刷新视图。"
```

---

## Task 7: Complete Safety And Operations Documentation

**Files:**
- Create: `docs/brainstorms/phase-16-17a.md`
- Create: `docs/safety.md`
- Create: `docs/worker-permissions.md`
- Create: `docs/operations.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/local-development.md`
- Create: `docs/health-checks.md`
- Create: `docs/final-mvp-scope.md`
- Create: `docs/next-steps.md`
- Modify: `docs/progress.md`
- Modify: `docs/auth.md`
- Modify: `docs/api.md`
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Write `docs/brainstorms/phase-16-17a.md`**

Include sections:

- `Phase 16A Demo Chain`
- `Phase 16B Hub/API Dry-Run Actions`
- `Phase 17A Doctor, Reset, Report, Operations`
- `Forbidden Real Actions`
- `Why No GitHub/Coolify/Uptime Kuma/Plane Real Calls`
- `Why No Temporal/LangGraph`

- [ ] **Step 2: Write safety docs**

`docs/safety.md` must state:

```text
Current default real capabilities are disabled: Codex execution, GitHub push/PR/Issue, Coolify deploy, Uptime Kuma monitor creation, Plane issue creation, production deployment.
```

Also document how to verify dry-run mode:

```bash
pnpm psf doctor
pnpm psf integrations:status
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
```

- [ ] **Step 3: Write operations and troubleshooting docs**

`docs/operations.md` must include local startup order:

```bash
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm dev:hub
pnpm psf demo:ai-novelist --with-sample-bug
```

`docs/troubleshooting.md` must include remedies for DB unavailable, API token failure, Hub cannot connect API, artifact missing, QA dry-run failure, Auto Fix Loop failure, Playwright skipped, Integration dry-run failure, `pnpm test` failure, and safe demo reset.

- [ ] **Step 4: Update README**

Add a concise "Run The Local MVP Demo" sequence:

```bash
pnpm install
cp .env.example .env
sudo docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm psf doctor
pnpm psf demo:ai-novelist --with-sample-bug
PSF_AUTH_DISABLED=true pnpm dev:api
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000 pnpm dev:hub
```

State that the MVP does not execute Codex, push, create PRs, deploy, or call external services.

- [ ] **Step 5: Update `.env.example`**

Add:

```dotenv
# Demo reset safety. Set only when intentionally clearing demo namespace.
DEMO_RESET_CONFIRM=0

# Optional doctor checks.
PSF_DOCTOR_CHECK_API=0
PSF_DOCTOR_CHECK_HUB=0
```

- [ ] **Step 6: Commit docs**

```bash
git add .env.example README.md docs
git commit -m "完善演示运维文档" -m "补齐 Phase 16A/16B/17A 的安全、doctor、运维、故障排查、MVP 范围、后续路线和 README 指南。"
```

---

## Task 8: Verification And Cleanup

**Files:**
- No code files unless verification exposes a defect in this batch.

- [ ] **Step 1: Run focused checks**

```bash
pnpm --filter @psf/demo-workflow test
pnpm test:scripts
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
```

Expected: all PASS.

- [ ] **Step 2: Run full phase gate**

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

Expected:

- `pnpm test`: exit code 0.
- `pnpm typecheck`: exit code 0.
- `pnpm build`: exit code 0.
- `git diff --check`: exit code 0.
- `git status --short --branch`: shows only intentionally uncommitted pre-existing demo artifact changes, or clean if the user asked to include them.

- [ ] **Step 3: If verification changes are needed, commit them**

Use a Chinese commit:

```bash
git add <changed files>
git commit -m "修正演示运维验收问题" -m "根据测试、类型检查、构建和 diff 检查结果修正 Phase 16A/16B/17A 的实现细节。"
```

- [ ] **Step 4: Final status summary**

Collect:

```bash
git log --oneline -8
git status --short --branch
```

Final answer must include:

- Completed summary.
- Current branch.
- Local commits created.
- New/modified files.
- Database migration note.
- New API routes.
- New CLI commands.
- Doctor/demo/reset examples.
- Hub/API startup commands.
- Hub viewing path for demo.
- Demo report path.
- Test results.
- MVP boundary.
- Dry-run/mock features.
- Explicitly non-executed real capabilities.
- Plan alignment.
- Recommended next phase order and risk.

