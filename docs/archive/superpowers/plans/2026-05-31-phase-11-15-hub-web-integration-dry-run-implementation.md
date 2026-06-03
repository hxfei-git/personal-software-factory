# Phase 11-15 Hub Web And Integration Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Hub Web dashboard and dry-run integration adapters so the user can inspect the Personal Software Factory loop from a Web control plane without real external side effects.

**Architecture:** Add `packages/integrations` as the dry-run adapter boundary, extend Orchestrator API with dashboard/summary/integration aggregation routes, and implement `apps/hub` as a Vite + React + TypeScript client that only calls the API. Keep Prisma behind the storage abstraction and keep all external integrations mock/dry-run.

**Tech Stack:** pnpm workspace, TypeScript, Zod-compatible shared shapes, Fastify, Prisma/PostgreSQL storage abstraction, Vitest, Vite, React, local bearer token auth.

---

## File Structure

Create:

- `packages/integrations/package.json`: package scripts and workspace dependencies.
- `packages/integrations/tsconfig.json`: package TypeScript config.
- `packages/integrations/README.md`: package boundary and dry-run safety.
- `packages/integrations/src/types.ts`: adapter names, status, dry-run result, input types.
- `packages/integrations/src/redaction.ts`: redaction helpers and leak assertion helpers for tests.
- `packages/integrations/src/base.ts`: common status/dry-run helpers.
- `packages/integrations/src/github.ts`: GitHub dry-run adapter.
- `packages/integrations/src/coolify.ts`: Coolify dry-run adapter.
- `packages/integrations/src/uptime-kuma.ts`: Uptime Kuma dry-run adapter.
- `packages/integrations/src/plane.ts`: Plane dry-run adapter.
- `packages/integrations/src/index.ts`: exports and adapter registry.
- `packages/integrations/tests/integrations.test.ts`: adapter, redaction, and safety tests.
- `apps/hub/index.html`: Vite HTML entry.
- `apps/hub/tsconfig.json`: Hub TS config.
- `apps/hub/vite.config.ts`: Vite config.
- `apps/hub/src/main.tsx`: React entry point.
- `apps/hub/src/App.tsx`: page routing and layout.
- `apps/hub/src/api/client.ts`: API client.
- `apps/hub/src/api/types.ts`: Hub response types.
- `apps/hub/src/components/*.tsx`: focused dashboard/detail/list components.
- `apps/hub/src/styles.css`: compact control-plane CSS.
- `apps/hub/tests/hub.test.tsx`: Hub API client and rendering tests.
- `docs/hub-web.md`: Hub usage and scope.
- `docs/integrations.md`: shared integration adapter policy.
- `docs/github-integration.md`: GitHub dry-run details.
- `docs/coolify-integration.md`: Coolify dry-run details.
- `docs/uptime-kuma-integration.md`: Uptime Kuma dry-run details.
- `docs/plane-integration.md`: Plane dry-run details.

Modify:

- `package.json`: add `dev:hub`, add `@psf/integrations` workspace dependency for scripts if needed.
- `pnpm-workspace.yaml`: no change expected unless workspace globs changed.
- `.env.example`: add Hub and integration variables.
- `apps/orchestrator-api/package.json`: depend on `@psf/integrations`.
- `apps/orchestrator-api/src/server.ts`: register dashboard, summary, and integration routes.
- `apps/orchestrator-api/src/services.ts`: add dashboard/summary/integration service methods.
- `apps/orchestrator-api/src/storage.ts`: add global list methods needed by dashboard.
- `apps/orchestrator-api/tests/api.test.ts`: add API tests.
- `apps/hub/package.json`: replace scaffold scripts with real Vite/Vitest scripts and dependencies.
- `scripts/psf.ts`: add integration status and dry-run CLI commands.
- `scripts/psf.test.ts`: add CLI tests.
- `README.md`: document Hub, API, demo data, dry-run integrations, safety.
- `docs/api.md`: document new API endpoints.
- `docs/auth.md`: document integration dry-run auth.
- `docs/progress.md`: record Phase 11-15 progress.
- `AGENTS.md`, `docs/00-system-architecture.md`, `docs/03-risk-and-assumptions.md`: update active plan filename references from `personal-software-factory-plan.md` to `plan.md`.

Do not modify:

- Prisma migrations, unless a test proves a new persisted model is required. The expected implementation uses existing models and dynamic integration status.
- Codex Worker, QA Worker, Auto Fix Loop behavior beyond reading their artifacts in Hub.

---

### Task 1: Create Integration Adapter Package With Failing Tests

**Files:**
- Create: `packages/integrations/package.json`
- Create: `packages/integrations/tsconfig.json`
- Create: `packages/integrations/src/types.ts`
- Create: `packages/integrations/src/redaction.ts`
- Create: `packages/integrations/src/base.ts`
- Create: `packages/integrations/src/github.ts`
- Create: `packages/integrations/src/coolify.ts`
- Create: `packages/integrations/src/uptime-kuma.ts`
- Create: `packages/integrations/src/plane.ts`
- Create: `packages/integrations/src/index.ts`
- Create: `packages/integrations/tests/integrations.test.ts`
- Create: `packages/integrations/README.md`

- [ ] **Step 1: Add package scaffold**

Create `packages/integrations/package.json`:

```json
{
  "name": "@psf/integrations",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Dry-run external integration adapters for Personal Software Factory.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@psf/mission-schema": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vite": "^7.3.3",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/integrations/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node", "vitest"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 2: Write failing adapter tests**

Create `packages/integrations/tests/integrations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createCoolifyAdapter,
  createGithubAdapter,
  createPlaneAdapter,
  createUptimeKumaAdapter,
  getIntegrationAdapter,
  listIntegrationStatuses,
  runIntegrationDryRun,
} from "../src/index.js";

const missionInput = {
  mission: {
    id: "mission-0001-ai-novelist-chapter-review",
    title: "增加章节审稿和自动修复流程",
    project_id: "ai-novelist",
    status: "ready_for_review",
  },
  project: {
    id: "ai-novelist",
    name: "AI 小说助手",
    repo_url: "https://github.com/hxfei-git/ai-novelist.git",
    staging_url: "https://staging.example.test",
    production_url: "https://production.example.test",
  },
  artifacts: [
    { type: "qa_report", path: "missions/mission-0001-ai-novelist-chapter-review/qa-report.md" },
    { type: "codex_command", path: "missions/mission-0001-ai-novelist-chapter-review/codex-command.sh" },
  ],
  bugs: [
    { id: "bug-sample", title: "连续点击生成按钮会重复提交", severity: "P1", status: "open" },
  ],
};

describe("@psf/integrations", () => {
  it("returns all integration statuses without provider tokens", () => {
    const statuses = listIntegrationStatuses({});
    expect(statuses.map((status) => status.name)).toEqual(["github", "coolify", "uptime_kuma", "plane"]);
    expect(statuses.every((status) => status.mode === "dry-run" || status.mode === "mock")).toBe(true);
    expect(statuses.every((status) => status.realNetworkCall === false)).toBe(true);
  });

  it("maps external uptime-kuma name to internal uptime_kuma adapter", () => {
    expect(getIntegrationAdapter("uptime-kuma").name).toBe("uptime_kuma");
    expect(getIntegrationAdapter("uptime_kuma").name).toBe("uptime_kuma");
  });

  it("runs GitHub dry-run without a token and never leaks token", () => {
    const result = createGithubAdapter().dryRun(missionInput, {
      GITHUB_TOKEN: "ghp_super_secret",
      GITHUB_OWNER: "hxfei-git",
      GITHUB_REPO: "ai-novelist",
      ENABLE_REAL_GITHUB: "1",
    });
    const serialized = JSON.stringify(result);
    expect(result.realEnabled).toBe(true);
    expect(result.realNetworkCall).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.outputs.prBody).toContain("Dry-run");
    expect(serialized).not.toContain("ghp_super_secret");
  });

  it("runs Coolify dry-run and marks production deploy as approval-required", () => {
    const result = createCoolifyAdapter().dryRun({ ...missionInput, target: "production" }, {
      COOLIFY_TOKEN: "coolify_secret",
      COOLIFY_BASE_URL: "https://coolify.example.test",
      ENABLE_REAL_COOLIFY: "0",
    });
    const serialized = JSON.stringify(result);
    expect(result.realEnabled).toBe(false);
    expect(result.realNetworkCall).toBe(false);
    expect(result.outputs.requiresApproval).toBe(true);
    expect(serialized).not.toContain("coolify_secret");
  });

  it("runs Uptime Kuma dry-run and never leaks password", () => {
    const result = createUptimeKumaAdapter().dryRun(missionInput, {
      UPTIME_KUMA_BASE_URL: "https://kuma.example.test",
      UPTIME_KUMA_USERNAME: "operator",
      UPTIME_KUMA_PASSWORD: "kuma_password",
      ENABLE_REAL_UPTIME_KUMA: "1",
    });
    const serialized = JSON.stringify(result);
    expect(result.realEnabled).toBe(true);
    expect(result.realNetworkCall).toBe(false);
    expect(result.outputs.monitor.target).toBe("https://staging.example.test");
    expect(serialized).not.toContain("kuma_password");
  });

  it("runs Plane dry-run and never leaks token", () => {
    const result = createPlaneAdapter().dryRun(missionInput, {
      PLANE_BASE_URL: "https://plane.example.test",
      PLANE_API_TOKEN: "plane_secret",
      PLANE_WORKSPACE_ID: "workspace-1",
      PLANE_PROJECT_ID: "project-1",
      ENABLE_REAL_PLANE: "0",
    });
    const serialized = JSON.stringify(result);
    expect(result.realNetworkCall).toBe(false);
    expect(result.outputs.missionIssue.title).toContain("增加章节审稿和自动修复流程");
    expect(result.outputs.bugIssues).toHaveLength(1);
    expect(serialized).not.toContain("plane_secret");
  });

  it("generic dry-run includes mandatory safety fields when missing env", () => {
    const result = runIntegrationDryRun("github", missionInput, {});
    expect(result).toMatchObject({
      mode: "dry-run",
      realEnabled: false,
      realNetworkCall: false,
      configured: false,
      safeToRun: true,
    });
    expect(result.missingEnv).toContain("GITHUB_TOKEN");
    expect(result.message).toContain("dry-run");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter @psf/integrations test
```

Expected: fail because `@psf/integrations` source files do not exist.

- [ ] **Step 4: Implement integration types**

Create `packages/integrations/src/types.ts`:

```ts
export type IntegrationName = "github" | "coolify" | "uptime_kuma" | "plane";
export type ExternalIntegrationName = IntegrationName | "uptime-kuma";
export type IntegrationMode = "mock" | "dry-run" | "real";

export interface IntegrationStatus {
  name: IntegrationName;
  externalName: string;
  mode: IntegrationMode;
  enabled: boolean;
  configured: boolean;
  healthy: boolean;
  realEnabled: boolean;
  realNetworkCall: false;
  safeToRun: boolean;
  requiredEnv: string[];
  missingEnv: string[];
  lastCheckedAt: string;
  message: string;
}

export interface IntegrationDryRunInput {
  mission?: Record<string, unknown>;
  project?: Record<string, unknown>;
  artifacts?: Array<Record<string, unknown>>;
  bugs?: Array<Record<string, unknown>>;
  target?: "staging" | "production";
}

export interface IntegrationDryRunResult {
  name: IntegrationName;
  externalName: string;
  mode: IntegrationMode;
  realEnabled: boolean;
  realNetworkCall: false;
  configured: boolean;
  missingEnv: string[];
  safeToRun: boolean;
  message: string;
  status: IntegrationStatus;
  outputs: Record<string, unknown>;
  createdAt: string;
}

export interface IntegrationAdapter {
  name: IntegrationName;
  externalName: string;
  mode: IntegrationMode;
  requiredEnv: string[];
  realEnableEnv: string;
  isRealEnabled(env?: NodeJS.ProcessEnv): boolean;
  healthCheck(env?: NodeJS.ProcessEnv): IntegrationStatus;
  dryRun(input?: IntegrationDryRunInput, env?: NodeJS.ProcessEnv): IntegrationDryRunResult;
  getStatus(env?: NodeJS.ProcessEnv): IntegrationStatus;
  redactConfig(env?: NodeJS.ProcessEnv): Record<string, unknown>;
}
```

- [ ] **Step 5: Implement shared helpers**

Create `packages/integrations/src/redaction.ts`:

```ts
const secretNamePattern = /(TOKEN|PASSWORD|SECRET|KEY|COOKIE)/i;

export function redactValue(key: string, value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return secretNamePattern.test(key) ? "<redacted>" : value;
}

export function redactConfig(env: NodeJS.ProcessEnv, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, redactValue(key, env[key]) ?? ""]));
}

export function assertNoSecretLeak(serialized: string, secrets: string[]): void {
  for (const secret of secrets.filter(Boolean)) {
    if (serialized.includes(secret)) {
      throw new Error("Secret leaked into integration output");
    }
  }
}
```

Create `packages/integrations/src/base.ts`:

```ts
import type { IntegrationAdapter, IntegrationDryRunResult, IntegrationMode, IntegrationName, IntegrationStatus } from "./types.js";
import { redactConfig } from "./redaction.js";

export interface AdapterConfig {
  name: IntegrationName;
  externalName: string;
  mode?: IntegrationMode;
  requiredEnv: string[];
  realEnableEnv: string;
}

export function missingEnv(env: NodeJS.ProcessEnv, keys: string[]): string[] {
  return keys.filter((key) => !env[key]);
}

export function isRealEnabled(env: NodeJS.ProcessEnv, realEnableEnv: string): boolean {
  return env[realEnableEnv] === "1";
}

export function buildStatus(config: AdapterConfig, env: NodeJS.ProcessEnv = process.env): IntegrationStatus {
  const missing = missingEnv(env, config.requiredEnv);
  const realEnabled = isRealEnabled(env, config.realEnableEnv);
  const configured = missing.length === 0;
  return {
    name: config.name,
    externalName: config.externalName,
    mode: config.mode ?? "dry-run",
    enabled: true,
    configured,
    healthy: true,
    realEnabled,
    realNetworkCall: false,
    safeToRun: true,
    requiredEnv: config.requiredEnv,
    missingEnv: missing,
    lastCheckedAt: new Date().toISOString(),
    message: configured
      ? `${config.externalName} configured for dry-run. Real network calls remain disabled in this batch.`
      : `${config.externalName} dry-run is available without credentials; missing ${missing.join(", ")}.`,
  };
}

export function buildDryRunResult(
  config: AdapterConfig,
  outputs: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): IntegrationDryRunResult {
  const status = buildStatus(config, env);
  return {
    name: config.name,
    externalName: config.externalName,
    mode: status.mode,
    realEnabled: status.realEnabled,
    realNetworkCall: false,
    configured: status.configured,
    missingEnv: status.missingEnv,
    safeToRun: status.safeToRun,
    message: `${config.externalName} dry-run completed. No real network call was made.`,
    status,
    outputs,
    createdAt: new Date().toISOString(),
  };
}

export function createAdapter(config: AdapterConfig, renderOutputs: (input: unknown, env: NodeJS.ProcessEnv) => Record<string, unknown>): IntegrationAdapter {
  return {
    name: config.name,
    externalName: config.externalName,
    mode: config.mode ?? "dry-run",
    requiredEnv: config.requiredEnv,
    realEnableEnv: config.realEnableEnv,
    isRealEnabled: (env = process.env) => isRealEnabled(env, config.realEnableEnv),
    healthCheck: (env = process.env) => buildStatus(config, env),
    getStatus: (env = process.env) => buildStatus(config, env),
    redactConfig: (env = process.env) => redactConfig(env, [...config.requiredEnv, config.realEnableEnv]),
    dryRun: (input = {}, env = process.env) => buildDryRunResult(config, renderOutputs(input, env), env),
  };
}
```

- [ ] **Step 6: Implement provider adapters**

Create `packages/integrations/src/github.ts`:

```ts
import { createAdapter } from "./base.js";
import type { IntegrationDryRunInput } from "./types.js";

const config = {
  name: "github" as const,
  externalName: "github",
  requiredEnv: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"],
  realEnableEnv: "ENABLE_REAL_GITHUB",
};

export function createGithubAdapter() {
  return createAdapter(config, (input: IntegrationDryRunInput) => {
    const mission = input.mission ?? {};
    const project = input.project ?? {};
    const missionId = String(mission.id ?? "mission-dry-run");
    const title = String(mission.title ?? "Personal Software Factory dry-run");
    const projectId = String(project.id ?? mission.project_id ?? "unknown-project");
    const branchName = `psf/${missionId}`;
    const artifactList = (input.artifacts ?? []).map((artifact) => `- ${String(artifact.type ?? "artifact")}: ${String(artifact.path ?? "")}`).join("\n");
    const bugList = (input.bugs ?? []).map((bug) => `- ${String(bug.severity ?? "P?")} ${String(bug.title ?? bug.id ?? "Bug")}`).join("\n");
    const prBody = [
      "# Dry-run PR",
      "",
      "## Mission 摘要",
      `- ${title}`,
      "",
      "## Project",
      `- ${projectId}`,
      "",
      "## Branch",
      `- ${branchName}`,
      "",
      "## 验收标准",
      "- See Mission acceptance artifacts.",
      "",
      "## Dev Summary 摘要",
      "- Dry-run only; no Codex execution occurred in this integration adapter.",
      "",
      "## QA Report 摘要",
      "- QA artifacts are linked below when available.",
      "",
      "## Bug 修复摘要",
      bugList || "- No bug summary provided.",
      "",
      "## Artifact 列表",
      artifactList || "- No artifact list provided.",
      "",
      "## WorkerRun 摘要",
      "- WorkerRun details remain in Orchestrator API.",
      "",
      "## 风险点",
      "- Real GitHub push and PR creation are disabled.",
      "",
      "## 是否需要人工确认",
      "- Yes before any real push or PR creation.",
      "",
      "## Dry-run 标记",
      "- This body was generated by Personal Software Factory dry-run mode.",
    ].join("\n");
    return {
      branchName,
      commitMessage: `阶段性交付：${title}`,
      prTitle: `[Dry-run] ${title}`,
      prBody,
      issueTitle: `[PSF] ${title}`,
      issueBody: prBody,
      simulatedPr: { number: 1001, url: `https://github.com/dry-run/${projectId}/pull/1001` },
      simulatedIssue: { number: 2001, url: `https://github.com/dry-run/${projectId}/issues/2001` },
    };
  });
}
```

Create `packages/integrations/src/coolify.ts`, `packages/integrations/src/uptime-kuma.ts`, and `packages/integrations/src/plane.ts` with the same `createAdapter` pattern. Each should use only input data, generate deterministic simulated ids, and include no environment secret values in `outputs`.

Minimum Coolify outputs:

```ts
{
  request: { target, projectId, url },
  requiresApproval: target === "production",
  simulatedDeployment: { id: "coolify-deploy-" + missionId, status: "queued" },
  summary: "Coolify dry-run prepared; no deployment was triggered."
}
```

Minimum Uptime Kuma outputs:

```ts
{
  monitor: { id: "kuma-monitor-" + projectId, type: "http", target: stagingUrl || productionUrl || "" },
  status: "not_created",
  uptimeSummary: "Uptime Kuma dry-run prepared; no monitor was created."
}
```

Minimum Plane outputs:

```ts
{
  missionIssue: { id: "plane-issue-" + missionId, title, body, url },
  bugIssues: bugs.map(...),
  summary: "Plane dry-run prepared; no issue was created."
}
```

- [ ] **Step 7: Implement registry exports**

Create `packages/integrations/src/index.ts`:

```ts
export * from "./types.js";
export * from "./github.js";
export * from "./coolify.js";
export * from "./uptime-kuma.js";
export * from "./plane.js";

import { createCoolifyAdapter } from "./coolify.js";
import { createGithubAdapter } from "./github.js";
import { createPlaneAdapter } from "./plane.js";
import { createUptimeKumaAdapter } from "./uptime-kuma.js";
import type { ExternalIntegrationName, IntegrationAdapter, IntegrationDryRunInput } from "./types.js";

export function normalizeIntegrationName(name: ExternalIntegrationName | string): ExternalIntegrationName {
  return name === "uptime_kuma" ? "uptime-kuma" : name as ExternalIntegrationName;
}

export function getIntegrationAdapter(name: ExternalIntegrationName | string): IntegrationAdapter {
  switch (normalizeIntegrationName(name)) {
    case "github":
      return createGithubAdapter();
    case "coolify":
      return createCoolifyAdapter();
    case "uptime-kuma":
      return createUptimeKumaAdapter();
    case "plane":
      return createPlaneAdapter();
    default:
      throw new Error("Unknown integration: " + name);
  }
}

export function listIntegrationAdapters(): IntegrationAdapter[] {
  return [createGithubAdapter(), createCoolifyAdapter(), createUptimeKumaAdapter(), createPlaneAdapter()];
}

export function listIntegrationStatuses(env: NodeJS.ProcessEnv = process.env) {
  return listIntegrationAdapters().map((adapter) => adapter.getStatus(env));
}

export function runIntegrationDryRun(name: ExternalIntegrationName | string, input: IntegrationDryRunInput = {}, env: NodeJS.ProcessEnv = process.env) {
  return getIntegrationAdapter(name).dryRun(input, env);
}
```

- [ ] **Step 8: Add package README**

Create `packages/integrations/README.md` explaining:

- adapters are dry-run only;
- `ENABLE_REAL_*="1"` reports real-enabled intent but still makes no network calls;
- secrets are redacted and never returned.

- [ ] **Step 9: Run focused tests**

Run:

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/integrations typecheck
```

Expected: both pass.

- [ ] **Step 10: Commit**

```bash
git add packages/integrations package.json pnpm-lock.yaml
git commit -m "新增外部集成干跑适配器" -m "新增 GitHub、Coolify、Uptime Kuma、Plane 的统一 dry-run adapter，默认不访问网络并覆盖凭据脱敏测试。"
```

---

### Task 2: Add Dashboard And Mission Summary API Aggregation

**Files:**
- Modify: `apps/orchestrator-api/package.json`
- Modify: `apps/orchestrator-api/src/storage.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Write failing API tests**

Append tests to `apps/orchestrator-api/tests/api.test.ts`:

```ts
it("returns dashboard metrics, recent records, integrations, and next actions", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "Dashboard mission");
  await server.inject({ method: "POST", url: `/missions/${mission.id}/qa-runs`, payload: { status: "failed", mode: "dry-run", summary: "QA dry-run failed.", failed: 1 } });
  await server.inject({ method: "POST", url: `/missions/${mission.id}/bugs`, payload: {
    title: "P1 dashboard bug",
    severity: "P1",
    reproductionSteps: ["Open app"],
    expectedResult: "Works",
    actualResult: "Fails",
  } });
  await server.inject({ method: "POST", url: `/missions/${mission.id}/worker-runs`, payload: {
    workerType: "qa",
    status: "failed",
    mode: "dry-run",
    error: "QA failed",
  } });
  await server.inject({ method: "POST", url: `/missions/${mission.id}/artifacts`, payload: {
    type: "qa_report",
    path: `missions/${mission.id}/qa-report.md`,
    content: "# QA Report",
  } });

  const response = await server.inject({ method: "GET", url: "/dashboard" });
  expect(response.statusCode).toBe(200);
  const dashboard = response.json();
  expect(dashboard.metrics.missionCount).toBe(1);
  expect(dashboard.metrics.qaFailedCount).toBe(1);
  expect(dashboard.metrics.openBugCount).toBe(1);
  expect(dashboard.metrics.p0p1BugCount).toBe(1);
  expect(dashboard.metrics.workerRunCount).toBe(1);
  expect(dashboard.metrics.artifactCount).toBe(1);
  expect(dashboard.recentMissions).toHaveLength(1);
  expect(dashboard.recentBugs).toHaveLength(1);
  expect(dashboard.recentFailedWorkerRuns).toHaveLength(1);
  expect(dashboard.integrationStatuses.map((item: { externalName: string }) => item.externalName)).toContain("uptime-kuma");
  expect(dashboard.recommendedNextActions[0].kind).toBe("view_qa_report");
});

it("returns mission summary with highlighted artifacts", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "Summary mission");
  await server.inject({ method: "POST", url: `/missions/${mission.id}/artifacts`, payload: {
    type: "qa_report",
    path: `missions/${mission.id}/qa-report.md`,
    content: "# QA Report",
  } });
  await server.inject({ method: "POST", url: `/missions/${mission.id}/artifacts`, payload: {
    type: "codex_command",
    path: `missions/${mission.id}/codex-command.sh`,
    content: "# dry-run command",
  } });

  const response = await server.inject({ method: "GET", url: `/missions/${mission.id}/summary` });
  expect(response.statusCode).toBe(200);
  const summary = response.json();
  expect(summary.mission.id).toBe(mission.id);
  expect(summary.project.id).toBe("ai-novelist");
  expect(summary.qaReportArtifact.path).toContain("qa-report.md");
  expect(summary.codexCommandArtifact.path).toContain("codex-command.sh");
  expect(summary.recommendedNextAction).toBeTruthy();
});
```

- [ ] **Step 2: Run focused API tests to verify failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
```

Expected: fail because `/dashboard` and `/missions/:id/summary` are not registered.

- [ ] **Step 3: Extend storage abstraction**

In `apps/orchestrator-api/src/storage.ts`, add methods to `MissionStorage`:

```ts
  listAllApprovals(): Promise<Approval[]>;
  listAllWorkerRuns(): Promise<WorkerRun[]>;
  listAllArtifacts(): Promise<Artifact[]>;
  listAllBugs(): Promise<BugReport[]>;
  listAllQARuns(): Promise<QAReport[]>;
```

Implement in-memory methods by returning sorted map values. Implement Prisma methods using `findMany({ orderBy: { createdAt: "asc" } })`, including `bugs` for QARuns.

- [ ] **Step 4: Add service aggregation helpers**

In `apps/orchestrator-api/src/services.ts`, import:

```ts
import { listIntegrationStatuses, runIntegrationDryRun } from "@psf/integrations";
```

Add service methods:

```ts
async getDashboard() {
  const [projects, missions, qaRuns, bugs, workerRuns, artifacts, approvals] = await Promise.all([
    storage.listProjects(),
    storage.listMissions(),
    storage.listAllQARuns(),
    storage.listAllBugs(),
    storage.listAllWorkerRuns(),
    storage.listAllArtifacts(),
    storage.listAllApprovals(),
  ]);
  return buildDashboard({ projects, missions, qaRuns, bugs, workerRuns, artifacts, approvals });
},

async getMissionSummary(id: string) {
  const mission = await getMission(id);
  const project = await storage.getProject(mission.project_id);
  if (!project) {
    throw notFound("Project", mission.project_id);
  }
  const [events, artifacts, workerRuns, qaRuns, bugs, approvals] = await Promise.all([
    storage.listMissionEvents(id),
    storage.listMissionArtifacts(id),
    storage.listMissionWorkerRuns(id),
    storage.listMissionQARuns(id),
    storage.listMissionBugs(id),
    storage.listMissionApprovals(id),
  ]);
  return buildMissionSummary({ mission, project, events, artifacts, workerRuns, qaRuns, bugs, approvals });
},

listIntegrations() {
  return listIntegrationStatuses(process.env);
},

runIntegrationDryRun(name: string, body: unknown) {
  return runIntegrationDryRun(name, parseIntegrationDryRunBody(body), process.env);
},
```

Add pure helpers near the bottom:

```ts
function latestByUpdatedAt<T extends { updated_at?: string; created_at?: string }>(items: T[], limit: number): T[] {
  return [...items].sort((left, right) => (right.updated_at ?? right.created_at ?? "").localeCompare(left.updated_at ?? left.created_at ?? "")).slice(0, limit);
}

function isRunningStatus(status: string): boolean {
  return ["planning", "dev_queued", "dev_running", "build_running", "test_running", "staging_deploying", "qa_running", "fixing", "regression_running", "production_deploying"].includes(status);
}

function isOpenBug(status: string): boolean {
  return ["open", "in_progress"].includes(status);
}

function findArtifactByTypeOrName(artifacts: Artifact[], candidates: string[]): Artifact | null {
  return artifacts.find((artifact) => candidates.includes(artifact.type) || candidates.some((name) => artifact.path.endsWith(name))) ?? null;
}
```

- [ ] **Step 5: Register routes**

In `apps/orchestrator-api/src/server.ts`, add:

```ts
  server.get("/dashboard", async () => services.getDashboard());
  server.get<{ Params: { id: string } }>("/missions/:id/summary", async (request) => {
    return services.getMissionSummary(request.params.id);
  });
  server.get("/integrations", async () => services.listIntegrations());
  server.post<{ Params: { name: string } }>("/integrations/:name/dry-run", async (request) => {
    return services.runIntegrationDryRun(request.params.name, request.body);
  });
```

Place `/missions/:id/summary` before generic `/missions/:id` if Fastify route matching needs the more specific route first.

- [ ] **Step 6: Run focused API tests**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/orchestrator-api packages/integrations package.json pnpm-lock.yaml
git commit -m "补齐控制台聚合接口" -m "新增 Dashboard、Mission Summary 和 Integration dry-run API，复用 storage abstraction 与 dry-run adapter，不引入真实外部调用。"
```

---

### Task 3: Add Integration CLI Commands

**Files:**
- Modify: `scripts/psf.ts`
- Modify: `scripts/psf.test.ts`
- Modify: `package.json` if `@psf/integrations` is needed by scripts.

- [ ] **Step 1: Write failing CLI tests**

Add tests to `scripts/psf.test.ts`:

```ts
test("integration status command lists dry-run adapters without credentials", async () => {
  const result = await runPsfCli(["integrations:status"], { cwd: tempRoot, syncDatabase: false });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("github");
  expect(result.stdout).toContain("uptime-kuma");
  expect(result.stdout).toContain("realNetworkCall=false");
});

test("integration dry-run command supports uptime-kuma path name", async () => {
  const result = await runPsfCli(["integrations:dry-run", "uptime-kuma"], { cwd: tempRoot, syncDatabase: false });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("uptime-kuma dry-run completed");
  expect(result.stdout).toContain("realNetworkCall=false");
});
```

- [ ] **Step 2: Run script tests to verify failure**

Run:

```bash
pnpm test:scripts
```

Expected: fail because commands are unknown.

- [ ] **Step 3: Implement CLI commands**

In `scripts/psf.ts`, update `CliCommand`:

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
  | "integrations:dry-run";
```

Import integrations:

```ts
import { listIntegrationStatuses, runIntegrationDryRun } from "@psf/integrations";
```

Add switch cases:

```ts
      case "integrations:status":
        await integrationsStatusCommand(context);
        break;
      case "integrations:dry-run":
        await integrationsDryRunCommand(context, args);
        break;
```

Add implementations:

```ts
async function integrationsStatusCommand(context: CliContext): Promise<void> {
  for (const status of listIntegrationStatuses(process.env)) {
    context.stdout.push(`${status.externalName}: mode=${status.mode} configured=${status.configured} realEnabled=${status.realEnabled} realNetworkCall=${status.realNetworkCall} missingEnv=${status.missingEnv.join(",") || "-"}`);
  }
}

async function integrationsDryRunCommand(context: CliContext, args: string[]): Promise<void> {
  const [name] = args;
  if (!name) {
    throw new PsfCliError("USAGE", "Usage: pnpm psf integrations:dry-run <github|coolify|uptime-kuma|plane>");
  }
  const result = runIntegrationDryRun(name, {}, process.env);
  context.stdout.push(`${result.externalName} dry-run completed.`);
  context.stdout.push(`mode=${result.mode} configured=${result.configured} realEnabled=${result.realEnabled} realNetworkCall=${result.realNetworkCall} safeToRun=${result.safeToRun}`);
  context.stdout.push(result.message);
}
```

- [ ] **Step 4: Run script tests**

Run:

```bash
pnpm test:scripts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/psf.ts scripts/psf.test.ts package.json pnpm-lock.yaml
git commit -m "增加集成干跑命令" -m "为本地 psf CLI 增加 integrations:status 和 integrations:dry-run 命令，支持 uptime-kuma 路径名且不访问网络。"
```

---

### Task 4: Implement Hub Web API Client And Shell

**Files:**
- Modify: `apps/hub/package.json`
- Create: `apps/hub/tsconfig.json`
- Create: `apps/hub/vite.config.ts`
- Create: `apps/hub/index.html`
- Create: `apps/hub/src/api/types.ts`
- Create: `apps/hub/src/api/client.ts`
- Create: `apps/hub/src/App.tsx`
- Create: `apps/hub/src/main.tsx`
- Create: `apps/hub/src/vite-env.d.ts`
- Create: `apps/hub/src/styles.css`
- Create: `apps/hub/tests/hub.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Add Hub dependencies**

Update `apps/hub/package.json`:

```json
{
  "name": "@psf/hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Personal Software Factory Hub Web.",
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "vite build",
    "dev": "vite --host 127.0.0.1 --port 5173"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.8.0",
    "vite": "^7.3.3",
    "vitest": "^3.2.0"
  }
}
```

If package resolution requires exact versions, run `pnpm install` and keep the resolved versions from `pnpm-lock.yaml`. If dependency download fails because the registry is unavailable, stop and report the dependency install blocker before implementing Hub.

Update root `package.json`:

```json
"dev:hub": "pnpm --filter @psf/hub dev"
```

- [ ] **Step 2: Write failing API client tests**

Create `apps/hub/tests/hub.test.tsx`:

```tsx
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/api/client.js";
import { renderDashboardView, renderIntegrationsView, renderMissionDetailView } from "../src/App.js";

describe("@psf/hub api client", () => {
  it("attaches token only to request headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const client = createApiClient({ baseUrl: "http://api.local", token: "secret-token", fetchImpl: fetchMock });
    await client.runIntegrationDryRun("github");
    expect(fetchMock).toHaveBeenCalledWith("http://api.local/integrations/github/dry-run", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer secret-token" }),
    }));
    expect(JSON.stringify(fetchMock.mock.calls)).toContain("Bearer secret-token");
  });

  it("renders dashboard metrics and next actions from mock data", () => {
    const view = renderDashboardView({
      metrics: { missionCount: 1, runningMissionCount: 0, failedMissionCount: 0, readyForReviewMissionCount: 1, qaRunCount: 1, qaFailedCount: 0, bugCount: 1, openBugCount: 1, p0p1BugCount: 1, workerRunCount: 2, artifactCount: 4, pendingApprovalCount: 0 },
      healthSignals: { status: "attention_required", message: "Open bugs need attention." },
      recentMissions: [{ id: "mission-1", title: "Mission", status: "ready_for_review" }],
      recentBugs: [{ id: "bug-1", title: "Bug", severity: "P1", status: "open" }],
      recentWorkerRuns: [],
      recentFailedWorkerRuns: [],
      recentQaRuns: [],
      recentArtifacts: [],
      integrationStatuses: [],
      recommendedNextActions: [{ kind: "run_fix_dry_run", label: "Run fix:dry-run", href: "/missions/mission-1" }],
    });
    expect(view.props.children).toBeTruthy();
  });

  it("renders mission detail summary", () => {
    const view = renderMissionDetailView({
      mission: { id: "mission-1", title: "Mission", status: "qa_running" },
      project: { id: "ai-novelist", name: "AI 小说助手" },
      currentStatus: "qa_running",
      events: [],
      artifacts: [],
      workerRuns: [],
      qaRuns: [],
      bugs: [],
      approvals: [],
      recommendedNextAction: { label: "查看 QA Report" },
    });
    expect(view.props.children).toBeTruthy();
  });

  it("renders integrations status cards", () => {
    const view = renderIntegrationsView([
      { name: "github", externalName: "github", mode: "dry-run", configured: false, healthy: true, missingEnv: ["GITHUB_TOKEN"], realEnabled: false, realNetworkCall: false, safeToRun: true, message: "dry-run available" },
    ]);
    expect(view.props.children).toBeTruthy();
  });
});
```

If the React renderer dependency is not added, keep tests at the component-return level as above so `pnpm test` does not require jsdom.

- [ ] **Step 3: Run Hub tests to verify failure**

Run:

```bash
pnpm --filter @psf/hub test
```

Expected: fail because files do not exist.

- [ ] **Step 4: Implement API client**

Create `apps/hub/src/api/client.ts`:

```ts
export interface ApiClientOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? import.meta.env.VITE_ORCHESTRATOR_API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const token = options.token ?? import.meta.env.VITE_PSF_API_TOKEN;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.method && init.method !== "GET" && token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  return {
    getDashboard: () => request("/dashboard"),
    listProjects: () => request("/projects"),
    listMissions: () => request("/missions"),
    getMissionSummary: (id: string) => request(`/missions/${encodeURIComponent(id)}/summary`),
    listIntegrations: () => request("/integrations"),
    runIntegrationDryRun: (name: string) => request(`/integrations/${encodeURIComponent(name)}/dry-run`, { method: "POST" }),
  };
}
```

- [ ] **Step 5: Implement Hub shell and render helpers**

Create `apps/hub/src/App.tsx` exporting pure render helpers for tests and the app component. Keep non-Dashboard pages simple. The Dashboard component should use compact metric cards, recent tables, and Integration status cards. The Mission Detail component should render highlighted artifacts inline with `pre-wrap` for safe text content and no raw HTML injection.

- [ ] **Step 6: Add Vite files and CSS**

Create:

- `apps/hub/index.html`
- `apps/hub/src/main.tsx`
- `apps/hub/vite.config.ts`
- `apps/hub/tsconfig.json`
- `apps/hub/src/styles.css`

CSS should use restrained colors, dense cards, responsive grids, and stable dimensions. Do not use a landing-page hero.

- [ ] **Step 7: Run Hub checks**

Run:

```bash
pnpm --filter @psf/hub test
pnpm --filter @psf/hub typecheck
pnpm --filter @psf/hub build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/hub package.json pnpm-lock.yaml
git commit -m "实现管理台首页骨架" -m "将 Hub Web 从占位包升级为 Vite React 控制台，新增 Dashboard、Mission Detail 和 Integrations 的基础查看能力。"
```

---

### Task 5: Update Documentation And Environment Examples

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/api.md`
- Modify: `docs/auth.md`
- Modify: `docs/artifacts.md`
- Modify: `docs/progress.md`
- Modify: `AGENTS.md`
- Modify: `docs/00-system-architecture.md`
- Modify: `docs/03-risk-and-assumptions.md`
- Create: `docs/hub-web.md`
- Create: `docs/integrations.md`
- Create: `docs/github-integration.md`
- Create: `docs/coolify-integration.md`
- Create: `docs/uptime-kuma-integration.md`
- Create: `docs/plane-integration.md`

- [ ] **Step 1: Update `.env.example`**

Add:

```dotenv
# Hub Web.
VITE_ORCHESTRATOR_API_URL=http://127.0.0.1:3000
VITE_PSF_API_TOKEN=

# GitHub dry-run integration.
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
ENABLE_REAL_GITHUB=0

# Coolify dry-run integration.
COOLIFY_BASE_URL=
COOLIFY_TOKEN=
ENABLE_REAL_COOLIFY=0

# Uptime Kuma dry-run integration.
UPTIME_KUMA_BASE_URL=
UPTIME_KUMA_USERNAME=
UPTIME_KUMA_PASSWORD=
ENABLE_REAL_UPTIME_KUMA=0

# Plane dry-run integration.
PLANE_BASE_URL=
PLANE_API_TOKEN=
PLANE_WORKSPACE_ID=
PLANE_PROJECT_ID=
ENABLE_REAL_PLANE=0
```

- [ ] **Step 2: Update README commands**

Add sections for:

```bash
pnpm dev:api
pnpm dev:hub
pnpm psf loop:dry-run mission-0001-ai-novelist-chapter-review --with-sample-bug
pnpm psf integrations:status
pnpm psf integrations:dry-run github
pnpm psf integrations:dry-run coolify
pnpm psf integrations:dry-run uptime-kuma
pnpm psf integrations:dry-run plane
```

Document that Hub opens at `http://127.0.0.1:5173` by default.

- [ ] **Step 3: Update API docs**

In `docs/api.md`, add:

- `GET /dashboard`
- `GET /missions/:id/summary`
- `GET /integrations`
- `POST /integrations/:name/dry-run`

Mention `POST /integrations/uptime-kuma/dry-run`.

- [ ] **Step 4: Create integration docs**

Each integration doc must state:

- dry-run only;
- required env variables;
- no real network calls in this batch;
- `ENABLE_REAL_*="1"` only reports real-enabled intent;
- credentials are redacted and never returned.

- [ ] **Step 5: Update active plan filename references**

Change active docs from `personal-software-factory-plan.md` to `plan.md` in:

- `AGENTS.md`
- `docs/00-system-architecture.md`
- `docs/03-risk-and-assumptions.md`

Do not rewrite historical Superpowers specs unless they are actively misleading.

- [ ] **Step 6: Update progress**

Update `docs/progress.md` with:

- completed Phase 11-15 work;
- created/modified file list;
- database migration note: none expected;
- API startup command;
- Hub startup command;
- demo-data command;
- Mission detail, QA Report, Bug, WorkerRun, Integration viewing instructions;
- dry-run/mock boundaries;
- env vars needed for later real integrations;
- why no real external calls;
- next batch suggestions;
- plan alignment.

- [ ] **Step 7: Commit**

```bash
git add .env.example README.md docs AGENTS.md
git commit -m "更新控制台与集成文档" -m "补充 Hub Web、Dashboard API、外部集成 dry-run、安全边界和 plan.md 文件名说明。"
```

---

### Task 6: Final Verification And Cleanup

**Files:**
- No planned edits unless verification reveals a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
pnpm test:scripts
```

Expected: all pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

Expected:

- `pnpm test`: pass;
- `pnpm typecheck`: pass;
- `pnpm build`: pass;
- `git diff --check`: no output;
- `git status --short --branch`: clean except branch ahead of remote.

- [ ] **Step 3: If all checks pass, create final local commit only if uncommitted fixes remain**

If Tasks 1-5 already committed every change and the worktree is clean, do not create an empty commit.

If verification fixes produced changes:

```bash
git add <changed-files>
git commit -m "修复控制台集成验收问题" -m "根据最终测试和构建结果修复 Phase 11-15 的类型、测试或文档问题。"
```

- [ ] **Step 4: Final response**

Report:

1. completion summary;
2. current branch;
3. local commits created;
4. created/modified file list;
5. database migration note;
6. new API list;
7. new CLI/pnpm command list;
8. local API startup command;
9. local Hub startup command;
10. demo-data command;
11. integration dry-run examples;
12. verification results;
13. what Hub can view now;
14. which integrations remain dry-run/mock;
15. env vars required for future real integrations;
16. whether implementation deviates from `plan.md`;
17. next batch suggestions.

Do not push.
