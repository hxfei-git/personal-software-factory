# Phase 4.5-7 Project Registry And Codex Worker Dry Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Personal Software Factory from an Orchestrator API MVP into a dry-run capable control plane that can sync `ai-novelist`, plan a Mission, record core resource records, and generate Codex execution artifacts without calling external services.

**Architecture:** Keep the existing pnpm/TypeScript/Fastify/Prisma architecture. Add stable schema fields and a Prisma migration, keep API routes thin through service and storage boundaries, add focused packages for Project Registry and Mission Planner, and make the Codex Worker a dry-run generator with explicit real-execution guards.

**Tech Stack:** TypeScript, pnpm workspace, Zod, Fastify, Prisma, PostgreSQL, Vitest, YAML, tsx.

---

## Scope And Guardrails

- Work on branch `phase-4-5-7-project-registry-codex-worker`.
- Do not push to any remote.
- Do not implement Hub Web UI.
- Do not implement Playwright QA Worker.
- Do not run `codex exec` for real.
- Do not modify a real `ai-novelist` checkout.
- Do not call GitHub, Coolify, Uptime Kuma, Plane, or production services.
- Use local commits with Chinese commit title and Chinese commit body.
- Prefer focused test commands before broad verification.

## File Structure

Create or modify these files:

- Modify: `.env.example` for `PSF_AUTH_DISABLED`, `ENABLE_REAL_CODEX`, and CLI defaults.
- Modify: `package.json` for `psf` scripts.
- Modify: `pnpm-lock.yaml` after dependency changes.
- Modify: `packages/mission-schema/src/schemas.ts` for expanded resource schemas.
- Modify: `packages/mission-schema/src/examples.ts` for expanded examples.
- Modify: `packages/mission-schema/tests/schemas.test.ts` for resource value coverage.
- Modify: `packages/mission-schema/README.md`.
- Modify: `packages/db/prisma/schema.prisma`.
- Create: `packages/db/prisma/migrations/000002_core_resources/migration.sql`.
- Modify: `packages/db/README.md`.
- Create: `packages/project-registry/package.json`.
- Create: `packages/project-registry/tsconfig.json`.
- Create: `packages/project-registry/src/index.ts`.
- Create: `packages/project-registry/tests/project-registry.test.ts`.
- Create: `packages/project-registry/README.md`.
- Create: `packages/mission-planner/package.json`.
- Create: `packages/mission-planner/tsconfig.json`.
- Create: `packages/mission-planner/src/index.ts`.
- Create: `packages/mission-planner/tests/mission-planner.test.ts`.
- Create: `packages/mission-planner/README.md`.
- Modify: `apps/orchestrator-api/src/errors.ts`.
- Create: `apps/orchestrator-api/src/auth.ts`.
- Replace or split: `apps/orchestrator-api/src/storage.ts` as needed to add core resource methods.
- Replace or split: `apps/orchestrator-api/src/services.ts` as needed to add core resource services.
- Modify: `apps/orchestrator-api/src/server.ts`.
- Modify: `apps/orchestrator-api/src/index.ts` only if server options need env wiring.
- Modify: `apps/orchestrator-api/tests/api.test.ts`.
- Create: `projects/ai-novelist/project.passport.yaml`.
- Create: `projects/ai-novelist/AGENTS.md`.
- Create: `projects/ai-novelist/qa-charter.md`.
- Create: `projects/ai-novelist/README.md`.
- Modify: `workers/codex-worker/package.json`.
- Create: `workers/codex-worker/tsconfig.json`.
- Create: `workers/codex-worker/src/index.ts`.
- Create: `workers/codex-worker/src/dry-run.ts`.
- Create: `workers/codex-worker/src/safety.ts`.
- Create: `workers/codex-worker/tests/codex-worker.test.ts`.
- Modify: `workers/codex-worker/README.md`.
- Create: `scripts/psf.ts`.
- Create or modify: `missions/mission-0001-ai-novelist-chapter-review/*` through CLI or deterministic generation.
- Create or modify: `docs/api.md`.
- Create: `docs/auth.md`.
- Create: `docs/project-registry.md`.
- Modify: `docs/project-passport.md` if absent create it.
- Create: `docs/mission-planner.md`.
- Create: `docs/codex-worker.md`.
- Create: `docs/artifacts.md`.
- Create: `docs/approval-policy.md`.
- Modify: `docs/progress.md`.
- Modify: `README.md`.

## Task 1: Expand Shared Schemas And Database Migration

**Files:**
- Modify: `packages/mission-schema/src/schemas.ts`
- Modify: `packages/mission-schema/src/examples.ts`
- Modify: `packages/mission-schema/tests/schemas.test.ts`
- Modify: `packages/mission-schema/README.md`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/000002_core_resources/migration.sql`
- Modify: `packages/db/README.md`

- [ ] **Step 1: Write schema tests for expanded resource contracts**

Add test cases to `packages/mission-schema/tests/schemas.test.ts`:

```ts
it("accepts expanded Approval fields", () => {
  const approval = ApprovalSchema.parse({
    ...approvalExample,
    requested_by: "planner",
    decided_by: "local-user",
    decision: "approved for dry-run",
    decided_at: "2026-05-30T10:05:00.000Z",
  });
  expect(approval.status).toBe("pending");
  expect(approval.requested_by).toBe("planner");
});

it("accepts expanded WorkerRun dry-run fields", () => {
  const workerRun = WorkerRunSchema.parse({
    ...workerRunExample,
    worker_type: "planner",
    mode: "dry-run",
    input: { missionId: "mission-sample-001" },
    output: { files: ["mission.md"] },
    error: "",
    logs: ["planner started"],
    created_at: "2026-05-30T10:00:00.000Z",
    updated_at: "2026-05-30T10:00:00.000Z",
  });
  expect(workerRun.mode).toBe("dry-run");
});

it("accepts expanded Artifact, BugReport, and QAReport values", () => {
  expect(ArtifactSchema.parse({
    ...artifactExample,
    type: "codex_prompt",
    worker_run_id: "worker-run-sample-001",
    content: "# Prompt",
    metadata: { storage: "inline-small-text" },
  }).type).toBe("codex_prompt");

  expect(BugReportSchema.parse({
    ...bugReportExample,
    status: "in_progress",
    suggested_fix_direction: "Disable repeated submit while generation is running.",
    source: "qa-worker",
  }).status).toBe("in_progress");

  expect(QAReportSchema.parse({
    ...qaReportExample,
    mode: "playwright-mcp",
    status: "queued",
    staging_url: "http://127.0.0.1:8000",
    passed: 0,
    failed: 0,
    started_at: "2026-05-30T10:00:00.000Z",
    finished_at: "2026-05-30T10:10:00.000Z",
  }).mode).toBe("playwright-mcp");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @psf/mission-schema test
```

Expected: FAIL because schemas do not yet define the new fields and enum values.

- [ ] **Step 3: Expand schema constants and fields**

Update `packages/mission-schema/src/schemas.ts` with these enums and fields:

```ts
const WorkerTypeSchema = z.enum(["codex", "qa", "deploy", "monitor", "planner", "integration", "orchestrator"]);
const WorkerRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled", "skipped"]);
const WorkerRunModeSchema = z.enum(["dry-run", "mock", "real"]);
const ArtifactTypeSchema = z.enum([
  "mission",
  "acceptance",
  "technical_notes",
  "risk_notes",
  "codex_prompt",
  "codex_command",
  "dev_summary",
  "qa_report",
  "bugs_json",
  "fix_mission",
  "playwright_trace",
  "screenshot",
  "generated_test",
  "log",
  "other",
]);
```

Add optional fields to the existing Zod objects:

```ts
requested_by: z.string().optional(),
decided_by: z.string().optional(),
decision: z.string().optional(),
decided_at: DateTimeString.optional(),
mode: WorkerRunModeSchema.optional(),
input: JsonObject.default({}),
output: JsonObject.default({}),
error: z.string().optional(),
logs: z.array(z.string()).default([]),
worker_run_id: z.string().optional(),
content: z.string().optional(),
metadata: JsonObject.default({}),
suggested_fix_direction: z.string().optional(),
source: z.string().optional(),
staging_url: z.string().optional(),
passed: z.number().int().nonnegative().optional(),
failed: z.number().int().nonnegative().optional(),
started_at: DateTimeString.optional(),
finished_at: DateTimeString.optional(),
```

- [ ] **Step 4: Update examples**

Update `packages/mission-schema/src/examples.ts` so examples include dry-run mode and expanded fields:

```ts
export const workerRunExample: WorkerRun = {
  id: "worker-run-sample-001",
  mission_id: missionExample.id,
  worker_type: "planner",
  status: "succeeded",
  mode: "dry-run",
  command: "pnpm psf mission:plan mission-sample-001",
  stdout_path: "artifacts/missions/mission-sample-001/worker-runs/stdout.log",
  stderr_path: "artifacts/missions/mission-sample-001/worker-runs/stderr.log",
  started_at: now,
  finished_at: now,
  exit_code: 0,
  input: { missionId: missionExample.id },
  output: { artifacts: ["mission.md", "acceptance.md"] },
  error: "",
  logs: ["Planner dry-run completed."],
  metadata: { phase: "planner" },
  created_at: now,
  updated_at: now,
};
```

- [ ] **Step 5: Add Prisma migration**

Update `packages/db/prisma/schema.prisma` by adding mapped fields matching the schema design. Use nullable columns for new fields to keep existing data valid:

```prisma
model WorkerRun {
  mode       String?   @default("dry-run")
  input      Json?     @default("{}")
  output     Json?     @default("{}")
  error      String?
  logs       String[]  @default([])
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
}
```

Create `packages/db/prisma/migrations/000002_core_resources/migration.sql` with `ALTER TABLE` statements:

```sql
ALTER TABLE "worker_runs"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'dry-run',
  ADD COLUMN "input" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "output" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "error" TEXT,
  ADD COLUMN "logs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "artifacts"
  ADD COLUMN "worker_run_id" TEXT,
  ADD COLUMN "content" TEXT,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "approvals"
  ADD COLUMN "requested_by" TEXT,
  ADD COLUMN "decided_by" TEXT,
  ADD COLUMN "decision" TEXT,
  ADD COLUMN "decided_at" TIMESTAMP(3);

ALTER TABLE "bugs"
  ADD COLUMN "suggested_fix_direction" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE "qa_runs"
  ADD COLUMN "staging_url" TEXT,
  ADD COLUMN "passed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "finished_at" TIMESTAMP(3);
```

- [ ] **Step 6: Run focused checks**

Run:

```bash
pnpm --filter @psf/mission-schema test
pnpm --filter @psf/mission-schema typecheck
pnpm db:generate
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/mission-schema packages/db
git commit -m "扩展核心资源数据契约" -m "补齐 Approval、WorkerRun、Artifact、BugReport 和 QARun 的共享 Schema 与 Prisma 字段，为后续资源 API、Planner 和 Codex dry-run 提供稳定落库结构。"
```

## Task 2: Add API Token Auth

**Files:**
- Modify: `.env.example`
- Modify: `apps/orchestrator-api/src/errors.ts`
- Create: `apps/orchestrator-api/src/auth.ts`
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `README.md`
- Create: `docs/auth.md`

- [ ] **Step 1: Write API auth tests**

Add tests in `apps/orchestrator-api/tests/api.test.ts`:

```ts
it("rejects write requests without token when auth is enabled", async () => {
  const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
  const response = await server.inject({
    method: "POST",
    url: "/missions",
    payload: { project_id: "ai-novelist", title: "Auth check", raw_request: "Check auth." },
  });
  expect(response.statusCode).toBe(401);
  expect(response.json().code).toBe("UNAUTHORIZED");
});

it("allows write requests with a valid bearer token", async () => {
  const { server } = await createTestServer({ auth: { token: "secret", disabled: false } });
  const response = await server.inject({
    method: "POST",
    url: "/missions",
    headers: { authorization: "Bearer secret" },
    payload: { project_id: "ai-novelist", title: "Auth pass", raw_request: "Check auth pass." },
  });
  expect(response.statusCode).toBe(201);
});

it("allows write requests when auth is explicitly disabled", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const response = await server.inject({
    method: "POST",
    url: "/missions",
    payload: { project_id: "ai-novelist", title: "Auth disabled", raw_request: "Local test." },
  });
  expect(response.statusCode).toBe(201);
});
```

- [ ] **Step 2: Run API tests to verify failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
```

Expected: FAIL because `buildServer` does not accept auth options and no auth hook exists.

- [ ] **Step 3: Add auth error and auth hook**

Update `apps/orchestrator-api/src/errors.ts`:

```ts
export function unauthorized(message = "Missing or invalid API token"): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}
```

Create `apps/orchestrator-api/src/auth.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { unauthorized } from "./errors.js";

export interface ApiAuthOptions {
  token?: string;
  disabled?: boolean;
}

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function registerApiAuth(server: FastifyInstance, options: ApiAuthOptions): void {
  server.addHook("preHandler", async (request) => {
    if (!writeMethods.has(request.method)) {
      return;
    }
    if (request.url === "/health" || options.disabled === true) {
      return;
    }
    const token = options.token;
    const header = request.headers.authorization ?? "";
    if (!token || header !== `Bearer ${token}`) {
      throw unauthorized();
    }
  });
}
```

- [ ] **Step 4: Wire auth through server options**

Update `apps/orchestrator-api/src/server.ts`:

```ts
import { registerApiAuth, type ApiAuthOptions } from "./auth.js";

export interface BuildServerOptions {
  storage: MissionStorage;
  auth?: ApiAuthOptions;
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const server = Fastify({ logger: false });
  registerApiAuth(server, options.auth ?? {
    token: process.env.PSF_API_TOKEN,
    disabled: process.env.PSF_AUTH_DISABLED === "true" || process.env.NODE_ENV === "test",
  });
  // existing routes remain below
}
```

- [ ] **Step 5: Update env and docs**

Add to `.env.example`:

```dotenv
PSF_AUTH_DISABLED=true
ENABLE_REAL_CODEX=0
```

Create `docs/auth.md` with:

```md
# API Authentication

All write routes require `Authorization: Bearer <PSF_API_TOKEN>` unless `PSF_AUTH_DISABLED=true`.
Use disabled auth only for local development and automated tests. `GET /health` remains public.
```

- [ ] **Step 6: Run focused checks**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add .env.example apps/orchestrator-api README.md docs/auth.md
git commit -m "增加 API Token 鉴权" -m "为 Orchestrator API 增加写接口 Bearer Token 保护，并补充本地禁用鉴权的环境变量与文档说明。"
```

## Task 3: Add Core Resource Storage, Services, And Routes

**Files:**
- Modify: `apps/orchestrator-api/src/storage.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Write API tests for resource route families**

Add focused tests for each family to `apps/orchestrator-api/tests/api.test.ts`. Use auth disabled in the test helper unless the test targets auth:

```ts
it("creates, lists, reads, approves, and rejects approvals", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "Approval mission");
  const created = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/approvals`,
    payload: { type: "PRODUCTION_DEPLOY", requestedBy: "planner", reason: "Release requires approval." },
  });
  expect(created.statusCode).toBe(201);
  const approval = created.json();
  expect(approval.status).toBe("pending");

  expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/approvals` })).json()).toHaveLength(1);
  expect((await server.inject({ method: "GET", url: `/approvals/${approval.id}` })).json().id).toBe(approval.id);

  const decision = await server.inject({
    method: "POST",
    url: `/approvals/${approval.id}/decision`,
    payload: { status: "approved", decidedBy: "local-user", decision: "Approved for dry-run." },
  });
  expect(decision.statusCode).toBe(200);
  expect(decision.json().status).toBe("approved");
});
```

Add these additional tests in the same file:

```ts
it("creates, lists, reads, and updates worker runs", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "WorkerRun mission");
  const created = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/worker-runs`,
    payload: { workerType: "planner", status: "queued", mode: "dry-run", input: { missionId: mission.id } },
  });
  expect(created.statusCode).toBe(201);
  const workerRun = created.json();
  expect(workerRun.mode).toBe("dry-run");
  expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/worker-runs` })).json()).toHaveLength(1);
  expect((await server.inject({ method: "GET", url: `/worker-runs/${workerRun.id}` })).json().id).toBe(workerRun.id);
  const updated = await server.inject({ method: "PATCH", url: `/worker-runs/${workerRun.id}`, payload: { status: "succeeded", output: { files: ["mission.md"] }, logs: ["done"] } });
  expect(updated.statusCode).toBe(200);
  expect(updated.json().status).toBe("succeeded");
});

it("creates, lists, and reads artifacts", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "Artifact mission");
  const created = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/artifacts`,
    payload: { type: "mission", name: "mission.md", path: `missions/${mission.id}/mission.md`, content: "# Mission", metadata: { storage: "inline" } },
  });
  expect(created.statusCode).toBe(201);
  const artifact = created.json();
  expect(artifact.type).toBe("mission");
  expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/artifacts` })).json()).toHaveLength(1);
  expect((await server.inject({ method: "GET", url: `/artifacts/${artifact.id}` })).json().id).toBe(artifact.id);
});

it("creates, lists, reads, and updates bugs", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "Bug mission");
  const created = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/bugs`,
    payload: {
      title: "Repeated generate clicks",
      severity: "P1",
      reproductionSteps: ["Open editor", "Click generate twice"],
      expectedResult: "One request is submitted.",
      actualResult: "Two requests are submitted.",
      evidence: { source: "api-test" },
      suggestedFixDirection: "Disable the button while running.",
      source: "qa-worker",
    },
  });
  expect(created.statusCode).toBe(201);
  const bug = created.json();
  expect(bug.status).toBe("open");
  expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/bugs` })).json()).toHaveLength(1);
  expect((await server.inject({ method: "GET", url: `/bugs/${bug.id}` })).json().id).toBe(bug.id);
  const updated = await server.inject({ method: "PATCH", url: `/bugs/${bug.id}`, payload: { status: "in_progress" } });
  expect(updated.statusCode).toBe(200);
  expect(updated.json().status).toBe("in_progress");
});

it("creates, lists, reads, and updates QA runs", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "QA mission");
  const created = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/qa-runs`,
    payload: { status: "queued", mode: "mock", stagingUrl: "http://127.0.0.1:8000", summary: "Queued mock QA." },
  });
  expect(created.statusCode).toBe(201);
  const qaRun = created.json();
  expect(qaRun.mode).toBe("mock");
  expect((await server.inject({ method: "GET", url: `/missions/${mission.id}/qa-runs` })).json()).toHaveLength(1);
  expect((await server.inject({ method: "GET", url: `/qa-runs/${qaRun.id}` })).json().id).toBe(qaRun.id);
  const updated = await server.inject({ method: "PATCH", url: `/qa-runs/${qaRun.id}`, payload: { status: "passed", passed: 8, failed: 0 } });
  expect(updated.statusCode).toBe(200);
  expect(updated.json().status).toBe("passed");
});
```

- [ ] **Step 2: Run API tests to verify failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
```

Expected: FAIL with route not found or missing storage methods.

- [ ] **Step 3: Extend storage interface and in-memory storage**

Add resource methods to `MissionStorage`:

```ts
createApproval(input: CreateApprovalInput): Promise<Approval>;
listMissionApprovals(missionId: string): Promise<Approval[]>;
getApproval(id: string): Promise<Approval | null>;
decideApproval(id: string, input: DecideApprovalInput, event: MissionEvent): Promise<Approval>;
createWorkerRun(input: CreateWorkerRunInput, event: MissionEvent): Promise<WorkerRun>;
listMissionWorkerRuns(missionId: string): Promise<WorkerRun[]>;
getWorkerRun(id: string): Promise<WorkerRun | null>;
updateWorkerRun(id: string, input: UpdateWorkerRunInput, event: MissionEvent): Promise<WorkerRun>;
createArtifact(input: CreateArtifactInput, event: MissionEvent): Promise<Artifact>;
listMissionArtifacts(missionId: string): Promise<Artifact[]>;
getArtifact(id: string): Promise<Artifact | null>;
createBug(input: CreateBugInput, event: MissionEvent): Promise<BugReport>;
listMissionBugs(missionId: string): Promise<BugReport[]>;
getBug(id: string): Promise<BugReport | null>;
updateBug(id: string, input: UpdateBugInput, event: MissionEvent): Promise<BugReport>;
createQARun(input: CreateQARunInput, event: MissionEvent): Promise<QAReport>;
listMissionQARuns(missionId: string): Promise<QAReport[]>;
getQARun(id: string): Promise<QAReport | null>;
updateQARun(id: string, input: UpdateQARunInput, event: MissionEvent): Promise<QAReport>;
```

Implement the same methods in `createInMemoryMissionStorage` using Maps for each resource type and the existing events array.

- [ ] **Step 4: Extend Prisma storage mapping**

Implement Prisma storage methods using transactions for writes:

```ts
const created = await prisma.$transaction(async (tx) => {
  const resource = await tx.workerRun.create({ data: toPrismaWorkerRunCreate(input) });
  await tx.missionEvent.create({ data: toPrismaMissionEventCreate(event) });
  return resource;
});
return mapWorkerRun(created);
```

Use this transaction pattern for Approval decisions, WorkerRun updates, Artifact creation, Bug creation/update, and QARun creation/update.

- [ ] **Step 5: Add service request validation**

Add Zod request schemas in `apps/orchestrator-api/src/services.ts`:

```ts
const CreateWorkerRunRequestSchema = z.object({
  workerType: z.enum(["codex", "qa", "deploy", "monitor", "planner", "integration"]),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled", "skipped"]).default("queued"),
  mode: z.enum(["dry-run", "mock", "real"]).default("dry-run"),
  input: z.record(z.unknown()).default({}),
});
```

Define analogous schemas for Approval, Artifact, BugReport, and QARun. Convert camelCase request bodies to snake_case response objects where the public schema already uses snake_case.

- [ ] **Step 6: Register routes**

Update `apps/orchestrator-api/src/server.ts`:

```ts
server.post<{ Params: { missionId: string } }>("/missions/:missionId/worker-runs", async (request, reply) => {
  const workerRun = await services.createWorkerRun(request.params.missionId, request.body);
  return reply.status(201).send(workerRun);
});

server.get<{ Params: { workerRunId: string } }>("/worker-runs/:workerRunId", async (request) => {
  return services.getWorkerRun(request.params.workerRunId);
});
```

Add the complete route set listed in the spec.

- [ ] **Step 7: Run focused checks**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/orchestrator-api docs/api.md
git commit -m "补齐核心资源 API" -m "新增 Approval、WorkerRun、Artifact、BugReport 和 QARun 的服务、存储和路由，并确保写操作产生 MissionEvent。"
```

## Task 4: Implement Project Registry Package And API Sync

**Files:**
- Create: `packages/project-registry/package.json`
- Create: `packages/project-registry/tsconfig.json`
- Create: `packages/project-registry/src/index.ts`
- Create: `packages/project-registry/tests/project-registry.test.ts`
- Create: `packages/project-registry/README.md`
- Modify: `apps/orchestrator-api/src/storage.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Write registry package tests**

Create `packages/project-registry/tests/project-registry.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findProjectById, scanProjectRegistry } from "../src/index.js";

describe("project registry", () => {
  it("scans and normalizes project passports", async () => {
    const root = await mkdtemp(join(tmpdir(), "psf-registry-"));
    const projectDir = join(root, "sample");
    await mkdir(projectDir);
    await writeFile(join(projectDir, "project.passport.yaml"), [
      "id: sample",
      "name: Sample",
      "repo:",
      "  url: https://example.com/sample.git",
      "  default_branch: main",
      "runtime:",
      "  kind: web",
      "commands:",
      "  install: pnpm install",
      "  test: pnpm test",
      "  build: pnpm build",
      "  run_staging: pnpm dev",
      "urls:",
      "  production: \"\"",
      "  staging: \"\"",
      "quality_gates:",
      "  require_build: true",
      "core_flows:",
      "  - id: smoke",
      "    name: Smoke",
      "    priority: P1",
      "",
    ].join("\n"));

    const projects = await scanProjectRegistry(root);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.passport.commands.install).toEqual(["pnpm install"]);
    expect(findProjectById(projects, "sample")?.project.id).toBe("sample");
    await rm(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run registry tests to verify failure**

Run:

```bash
pnpm --filter @psf/project-registry test
```

Expected: FAIL because package does not exist.

- [ ] **Step 3: Create package metadata**

Create `packages/project-registry/package.json`:

```json
{
  "name": "@psf/project-registry",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Local project registry scanner for Personal Software Factory.",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "check": "pnpm typecheck && pnpm test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@psf/mission-schema": "workspace:*",
    "@psf/project-passport": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 4: Implement scanner**

Create `packages/project-registry/src/index.ts`:

```ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readProjectPassport } from "@psf/project-passport";
import type { Project, ProjectPassport } from "@psf/mission-schema";

export interface RegistryProject {
  project: Project;
  passport: ProjectPassport;
  passportPath: string;
}

export async function scanProjectRegistry(projectsRoot = "projects"): Promise<RegistryProject[]> {
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projects: RegistryProject[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const passportPath = join(projectsRoot, entry.name, "project.passport.yaml");
    const passport = await readProjectPassport(passportPath);
    projects.push({ project: projectFromPassport(passport, passportPath), passport, passportPath });
  }
  return projects.sort((left, right) => left.project.id.localeCompare(right.project.id));
}

export function findProjectById(projects: RegistryProject[], projectId: string): RegistryProject | null {
  return projects.find((entry) => entry.project.id === projectId) ?? null;
}

export function projectFromPassport(passport: ProjectPassport, passportPath: string): Project {
  const now = new Date().toISOString();
  return {
    id: passport.id,
    slug: passport.id,
    name: passport.name,
    description: passport.description ?? "",
    repo_url: passport.repo.url,
    default_branch: passport.repo.default_branch,
    local_path: `./workspaces/${passport.id}`,
    passport_path: passportPath,
    production_url: passport.urls.production,
    staging_url: passport.urls.staging,
    status: "active",
    created_at: now,
    updated_at: now,
  };
}
```

- [ ] **Step 5: Add API sync routes and tests**

Add API tests for:

```ts
POST /projects/sync
GET /projects/:projectId/passport
```

Expected behavior:

- sync returns `{ synced: 1, projects: [...] }`;
- passport endpoint returns the normalized passport;
- sync route is protected by token auth when auth is enabled.

- [ ] **Step 6: Run focused checks**

Run:

```bash
pnpm --filter @psf/project-registry test
pnpm --filter @psf/project-registry typecheck
pnpm --filter @psf/orchestrator-api test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/project-registry apps/orchestrator-api
git commit -m "实现项目注册表" -m "新增 Project Registry 扫描、校验和 API 同步能力，确保 Orchestrator 通过统一入口读取本地项目护照。"
```

## Task 5: Add ai-novelist Registry Entry

**Files:**
- Create: `projects/ai-novelist/project.passport.yaml`
- Create: `projects/ai-novelist/AGENTS.md`
- Create: `projects/ai-novelist/qa-charter.md`
- Create: `projects/ai-novelist/README.md`
- Modify: `docs/project-passport.md`

- [ ] **Step 1: Create ai-novelist passport**

Create `projects/ai-novelist/project.passport.yaml`:

```yaml
id: ai-novelist
name: AI 小说助手
description: Web AI writing assistant for creating, reviewing, repairing and exporting novels. Commands are conservative local defaults and require manual verification before real worker execution.
repo:
  url: https://github.com/hxfei-git/ai-novelist.git
  default_branch: main
runtime:
  kind: web
  backend:
    language: python
    framework: manual-verification-required
  frontend:
    language: typescript
    framework: manual-verification-required
commands:
  install:
    - python -m venv .venv
    - . .venv/bin/activate && pip install -e .
    - npm --prefix web/frontend install
  test:
    - . .venv/bin/activate && pytest -q
  build:
    - npm --prefix web/frontend run build
  run_staging:
    - . .venv/bin/activate && ai-novelist web --host 127.0.0.1 --port 8000
urls:
  production: ""
  staging: ""
quality_gates:
  require_build: true
  require_unit_tests: true
  require_e2e_tests: true
  require_ai_qa: true
  require_pr_review: true
  require_human_production_approval: true
core_flows:
  - id: open_home
    name: 打开首页
    priority: P0
  - id: create_novel_project
    name: 新建小说项目
    priority: P0
  - id: generate_worldview
    name: 生成世界观
    priority: P0
  - id: generate_outline
    name: 生成大纲
    priority: P0
  - id: generate_chapter
    name: 生成章节
    priority: P0
  - id: review_chapter
    name: 自动审稿
    priority: P0
  - id: repair_chapter
    name: 修复章节
    priority: P0
  - id: export_novel
    name: 导出小说
    priority: P1
```

- [ ] **Step 2: Write ai-novelist collaboration and QA documents**

Create `projects/ai-novelist/AGENTS.md`:

```md
# AGENTS.md - AI 小说助手

## Project Goal

AI 小说助手用于创建小说项目、生成世界观、生成大纲、生成章节、自动审稿、按审稿报告修复章节并导出小说。

## Development Rules

- Do not delete user writing data.
- Do not bypass the review step after chapter generation.
- Do not hide backend or AI provider failures from the user.
- Do not push remote branches without explicit approval.
- Keep changes on non-main branches.

## Required Checks

- Run the project passport test command before reporting success.
- Run the project passport build command before review when build is available.
- Add or update E2E coverage for critical user flows when the real project is available.
```

Create `projects/ai-novelist/qa-charter.md`:

```md
# QA Charter - AI 小说助手

## Normal Paths

1. 打开首页。
2. 新建小说项目。
3. 输入小说题材。
4. 生成世界观。
5. 生成大纲。
6. 生成章节。
7. 自动审稿。
8. 查看审稿报告。
9. 修复章节。
10. 导出小说。

## Abnormal Paths

1. 空输入提交。
2. 超长输入提交。
3. 连续点击生成按钮。
4. 生成过程中刷新页面。
5. 生成过程中后退。
6. 多标签页同时操作。
7. API 失败。
8. 审稿失败。
9. 修复失败。
10. 导出前跳过审稿。
```

- [ ] **Step 3: Test passport parsing**

Run:

```bash
pnpm --filter @psf/project-registry test
pnpm --filter @psf/project-passport test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add projects/ai-novelist docs/project-passport.md
git commit -m "接入 AI 小说助手项目" -m "新增 ai-novelist 的项目护照、项目协作规范、QA Charter 和说明文档，供 Project Registry、Mission Planner 和 dry-run Worker 使用。"
```

## Task 6: Implement Mission Planner Package

**Files:**
- Create: `packages/mission-planner/package.json`
- Create: `packages/mission-planner/tsconfig.json`
- Create: `packages/mission-planner/src/index.ts`
- Create: `packages/mission-planner/tests/mission-planner.test.ts`
- Create: `packages/mission-planner/README.md`

- [ ] **Step 1: Write planner tests**

Create `packages/mission-planner/tests/mission-planner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectPassportExample } from "@psf/mission-schema";
import { createDeterministicMissionPlan } from "../src/index.js";

describe("mission planner", () => {
  it("generates all required planning documents", () => {
    const plan = createDeterministicMissionPlan({
      projectId: "ai-novelist",
      title: "章节审稿与修复闭环",
      userRequirement: "增加章节审稿和自动修复流程",
      passport: projectPassportExample,
      qaCharter: "# QA Charter\n- 打开首页\n- 新建小说项目",
      priority: "P1",
    });
    expect(plan.files.map((file) => file.name)).toEqual([
      "mission.md",
      "acceptance.md",
      "technical-notes.md",
      "risk-notes.md",
    ]);
    expect(plan.files.find((file) => file.name === "mission.md")?.content).toContain("## 验收标准");
    expect(plan.workerRun.worker_type).toBe("planner");
    expect(plan.workerRun.mode).toBe("dry-run");
    expect(plan.events.map((event) => event.type)).toContain("mission.planning.completed");
  });
});
```

- [ ] **Step 2: Run planner tests to verify failure**

Run:

```bash
pnpm --filter @psf/mission-planner test
```

Expected: FAIL because package does not exist.

- [ ] **Step 3: Create package and deterministic generator**

Create `packages/mission-planner/src/index.ts` with:

```ts
import { randomUUID } from "node:crypto";
import type { Artifact, MissionEvent, ProjectPassport, WorkerRun } from "@psf/mission-schema";

export interface MissionPlannerInput {
  projectId: string;
  userRequirement: string;
  passport: ProjectPassport;
  qaCharter: string;
  title?: string;
  priority?: "P0" | "P1" | "P2" | "P3";
  missionId?: string;
}

export interface PlannedFile {
  name: "mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md";
  content: string;
}

export function createDeterministicMissionPlan(input: MissionPlannerInput) {
  const now = new Date().toISOString();
  const missionId = input.missionId ?? "mission-" + randomUUID();
  const title = input.title ?? input.userRequirement.slice(0, 48);
  const files: PlannedFile[] = [
    { name: "mission.md", content: renderMissionMarkdown(title, input) },
    { name: "acceptance.md", content: renderAcceptanceMarkdown(input) },
    { name: "technical-notes.md", content: renderTechnicalNotes(input) },
    { name: "risk-notes.md", content: renderRiskNotes(input) },
  ];
  const workerRun: WorkerRun = {
    id: "worker-run-" + randomUUID(),
    mission_id: missionId,
    worker_type: "planner",
    status: "succeeded",
    mode: "dry-run",
    command: "deterministic mission planner",
    input: { projectId: input.projectId, userRequirement: input.userRequirement },
    output: { files: files.map((file) => file.name) },
    error: "",
    logs: ["Generated deterministic Mission planning artifacts."],
    metadata: { planner: "deterministic-template" },
    created_at: now,
    updated_at: now,
  };
  const events: MissionEvent[] = [
    { id: randomUUID(), mission_id: missionId, type: "mission.planning.started", message: "Mission planning started", payload: { mode: "dry-run" }, created_at: now },
    { id: randomUUID(), mission_id: missionId, type: "mission.planning.completed", message: "Mission planning completed", payload: { files: files.map((file) => file.name) }, created_at: now },
  ];
  const artifacts: Artifact[] = files.map((file) => ({
    id: "artifact-" + randomUUID(),
    mission_id: missionId,
    type: file.name === "mission.md" ? "mission" : file.name === "acceptance.md" ? "acceptance" : file.name === "technical-notes.md" ? "technical_notes" : "risk_notes",
    path: `missions/${missionId}/${file.name}`,
    content: file.content,
    metadata: { generatedBy: "mission-planner" },
    size: Buffer.byteLength(file.content, "utf8"),
    created_at: now,
  }));
  return { missionId, files, workerRun, artifacts, events };
}
```

Implement concrete markdown render functions with these section lists:

```ts
function renderMissionMarkdown(title: string, input: MissionPlannerInput): string {
  return [
    `# Mission: ${title}`,
    "",
    "## 背景",
    `${input.projectId} 收到自然语言需求：${input.userRequirement}`,
    "",
    "## 目标",
    "把需求实现为可测试、可审查、可回滚的项目变更。",
    "",
    "## 用户故事",
    "作为个人开发者，我希望系统把需求转成明确任务，让 Codex Worker 可以在独立分支中实施。",
    "",
    "## 范围",
    "- 生成结构化 Mission。",
    "- 记录验收标准和风险。",
    "- 使用 Project Passport 中声明的命令作为测试依据。",
    "",
    "## 非目标",
    "- 不直接部署生产。",
    "- 不真实调用外部服务。",
    "- 不在 main/master 上修改代码。",
    "",
    "## 验收标准",
    "- Mission 文件存在。",
    "- Acceptance 文件存在。",
    "- Technical notes 文件存在。",
    "- Risk notes 文件存在。",
    "",
    "## 必须运行的测试",
    ...input.passport.commands.test.map((command) => `- ${command}`),
    "",
    "## 禁止事项",
    "- 不写入真实凭据。",
    "- 不 push 远程分支。",
    "- 不发布生产。",
    "",
    "## 预期交付物",
    "- dev-summary.md",
    "- 通过测试的本地分支或 dry-run 执行计划。",
    "",
    "## 风险点",
    "- 项目命令仍需人工验证。",
    "- AI 生成内容需要人工审查。",
    "",
  ].join("\n");
}
```

Use equivalent explicit section arrays for `renderAcceptanceMarkdown`, `renderTechnicalNotes`, and `renderRiskNotes` so the generated documents contain the required headings from the user request.

- [ ] **Step 4: Run focused checks**

Run:

```bash
pnpm --filter @psf/mission-planner test
pnpm --filter @psf/mission-planner typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mission-planner
git commit -m "实现任务规划器" -m "新增 deterministic Mission Planner，生成 mission、acceptance、technical notes 和 risk notes，并返回 WorkerRun、Artifact 与 MissionEvent 描述。"
```

## Task 7: Wire Mission Planner Into API

**Files:**
- Modify: `apps/orchestrator-api/src/storage.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/src/server.ts`
- Modify: `apps/orchestrator-api/tests/api.test.ts`
- Create: `docs/mission-planner.md`

- [ ] **Step 1: Write API planner test**

Add to `apps/orchestrator-api/tests/api.test.ts`:

```ts
it("plans a mission and records planner resources", async () => {
  const { server } = await createTestServer({ auth: { disabled: true } });
  const mission = await createMission(server, "Plan ai-novelist chapter review");
  const response = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/plan`,
    payload: {
      userRequirement: "增加章节审稿和自动修复流程",
      qaCharter: "# QA Charter\n- 打开首页\n- 导出小说",
    },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().files).toHaveLength(4);

  const artifacts = await server.inject({ method: "GET", url: `/missions/${mission.id}/artifacts` });
  expect(artifacts.json().map((artifact: { type: string }) => artifact.type)).toContain("mission");

  const runs = await server.inject({ method: "GET", url: `/missions/${mission.id}/worker-runs` });
  expect(runs.json().at(-1).worker_type).toBe("planner");
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
```

Expected: FAIL because `/missions/:id/plan` is missing.

- [ ] **Step 3: Add service method and route**

In `apps/orchestrator-api/src/services.ts`, add `planMission(id, body)` that:

- loads the Mission;
- loads its Project;
- reads Project Passport through Project Registry if `passport_path` exists;
- uses request `qaCharter` or project `qa-charter.md` text when present;
- calls `createDeterministicMissionPlan`;
- creates WorkerRun, Artifact records, and MissionEvents through storage.

In `apps/orchestrator-api/src/server.ts`:

```ts
server.post<{ Params: { id: string } }>("/missions/:id/plan", async (request) => {
  return services.planMission(request.params.id, request.body);
});
```

- [ ] **Step 4: Run focused checks**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator-api docs/mission-planner.md
git commit -m "接入任务规划 API" -m "新增 Mission Planner API，将 deterministic 规划结果记录为 WorkerRun、Artifact 和 MissionEvent。"
```

## Task 8: Implement Codex Worker Dry Run

**Files:**
- Modify: `workers/codex-worker/package.json`
- Create: `workers/codex-worker/tsconfig.json`
- Create: `workers/codex-worker/src/safety.ts`
- Create: `workers/codex-worker/src/dry-run.ts`
- Create: `workers/codex-worker/src/index.ts`
- Create: `workers/codex-worker/tests/codex-worker.test.ts`
- Modify: `workers/codex-worker/README.md`
- Create: `docs/codex-worker.md`

- [ ] **Step 1: Write Codex Worker tests**

Create `workers/codex-worker/tests/codex-worker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectPassportExample } from "@psf/mission-schema";
import { assertSafeCodexExecution, createCodexDryRun } from "../src/index.js";

describe("codex worker dry-run", () => {
  it("generates prompt, command, summary, worker run, and artifacts without execution", () => {
    const result = createCodexDryRun({
      missionId: "mission-0001",
      projectId: "ai-novelist",
      branchName: "agent/mission-0001",
      currentBranch: "agent/mission-0001",
      passport: projectPassportExample,
      projectAgents: "# AGENTS\n- Do not push.",
      missionFiles: {
        "mission.md": "# Mission\nBuild feature.",
        "acceptance.md": "# Acceptance\nPass tests.",
        "technical-notes.md": "# Technical Notes\nUse existing commands.",
        "risk-notes.md": "# Risk Notes\nNo production deploy.",
      },
      mode: "dry-run",
    });
    expect(result.executed).toBe(false);
    expect(result.files["codex-command.sh"]).toContain("codex exec --sandbox workspace-write");
    expect(result.files["codex-prompt.md"]).toContain("Do not modify main/master");
    expect(result.workerRun.worker_type).toBe("codex");
    expect(result.artifacts.map((artifact) => artifact.type)).toContain("codex_prompt");
  });

  it("blocks real execution on main and master", () => {
    expect(() => assertSafeCodexExecution({ mode: "real", enableRealCodex: true, currentBranch: "main", hasApproval: true })).toThrow(/main\/master/);
    expect(() => assertSafeCodexExecution({ mode: "real", enableRealCodex: true, currentBranch: "master", hasApproval: true })).toThrow(/main\/master/);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @psf/codex-worker test
```

Expected: FAIL because Codex Worker has only scaffold scripts.

- [ ] **Step 3: Implement safety guard**

Create `workers/codex-worker/src/safety.ts`:

```ts
export interface CodexExecutionSafetyInput {
  mode: "dry-run" | "mock" | "real";
  enableRealCodex: boolean;
  currentBranch: string;
  hasApproval: boolean;
}

export function assertSafeCodexExecution(input: CodexExecutionSafetyInput): void {
  if (input.mode !== "real") {
    return;
  }
  if (!input.enableRealCodex) {
    throw new Error("Real Codex execution requires ENABLE_REAL_CODEX=1.");
  }
  if (!input.hasApproval) {
    throw new Error("Real Codex execution requires an approved Approval record.");
  }
  if (input.currentBranch === "main" || input.currentBranch === "master") {
    throw new Error("Real Codex execution is blocked on main/master branches.");
  }
}
```

- [ ] **Step 4: Implement dry-run generator**

Create `workers/codex-worker/src/dry-run.ts` with `createCodexDryRun(input)`. It must:

- call `assertSafeCodexExecution`;
- render `codex-prompt.md`;
- render `codex-command.sh`;
- render `dev-summary.md`;
- return `executed: false`;
- return WorkerRun and Artifact objects with `mode=dry-run`.

The prompt must include instructions to read all four Mission files, read project `AGENTS.md`, create a separate branch, run declared tests, generate `dev-summary.md`, avoid production deployment, and avoid remote push without authorization.

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/codex-worker typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add workers/codex-worker docs/codex-worker.md
git commit -m "实现 Codex Worker Dry Run" -m "新增 Codex Worker dry-run 生成器和安全保护，生成 prompt、command 与 dev summary，但不真实调用 Codex。"
```

## Task 9: Add Minimal PSF CLI And Example Mission Files

**Files:**
- Modify: `package.json`
- Create: `scripts/psf.ts`
- Create or modify: `missions/mission-0001-ai-novelist-chapter-review/*`
- Modify: `scripts/README.md`

- [ ] **Step 1: Add CLI script**

Update root `package.json` scripts:

```json
{
  "psf": "tsx scripts/psf.ts"
}
```

- [ ] **Step 2: Write CLI smoke test command as manual verification target**

The CLI will support:

```bash
pnpm psf projects:sync
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
pnpm psf codex:dry-run mission-0001-ai-novelist-chapter-review
```

- [ ] **Step 3: Implement CLI**

Create `scripts/psf.ts` with a small command dispatcher:

```ts
const [, , command, ...args] = process.argv;

switch (command) {
  case "projects:sync":
    await syncProjectsCommand();
    break;
  case "mission:create":
    await createMissionCommand(args);
    break;
  case "mission:plan":
    await planMissionCommand(args);
    break;
  case "codex:dry-run":
    await codexDryRunCommand(args);
    break;
  default:
    console.error("Usage: pnpm psf <projects:sync|mission:create|mission:plan|codex:dry-run>");
    process.exitCode = 1;
}
```

Commands may use deterministic local files first and Prisma where useful. They must not call external APIs or execute Codex.

- [ ] **Step 4: Generate example mission files**

Run:

```bash
pnpm psf projects:sync
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
pnpm psf codex:dry-run mission-0001-ai-novelist-chapter-review
```

Expected: `missions/mission-0001-ai-novelist-chapter-review/` contains:

```text
mission.md
acceptance.md
technical-notes.md
risk-notes.md
codex-prompt.md
codex-command.sh
dev-summary.md
```

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts missions
git commit -m "增加本地 PSF CLI" -m "新增 projects sync、mission create、mission plan 和 codex dry-run 的本地命令，并生成 ai-novelist 示例任务文件。"
```

## Task 10: Documentation Pass

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/api.md`
- Modify: `docs/project-passport.md`
- Create: `docs/project-registry.md`
- Create: `docs/artifacts.md`
- Create: `docs/approval-policy.md`
- Modify: `docs/progress.md`

- [ ] **Step 1: Update docs with final behavior**

Update the documentation files with these concrete sections:

- token auth and `PSF_AUTH_DISABLED`;
- core resource endpoints;
- Project Registry scan and sync;
- ai-novelist Project Passport;
- Mission Planner deterministic output;
- Codex Worker dry-run boundaries;
- Artifact storage strategy;
- Approval policy;
- CLI commands;
- dry-run and mock boundaries.

- [ ] **Step 2: Check docs for forbidden unresolved markers**

Run:

```bash
rg -n "TBD|FIXME|真实凭据|secret-value" README.md docs .env.example projects missions
```

Expected: no output for unresolved markers or fake secret values.

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example docs projects missions
git commit -m "更新四点五至七阶段文档" -m "补充 API、鉴权、项目注册表、任务规划器、Codex dry-run、Artifact、Approval 和进度说明，明确 dry-run 与 mock 边界。"
```

## Task 11: Final Verification

**Files:**
- No new functional files unless a verification failure reveals a necessary fix.
- Modify only files directly related to any discovered failure.

- [ ] **Step 1: Run database verification**

Run:

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: Prisma client generates and migration applies. If PostgreSQL is not running, start local services with:

```bash
sudo docker compose up -d postgres redis
```

- [ ] **Step 2: Run required full checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass.

- [ ] **Step 3: Check git and whitespace**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. `git status --short` should show only intentional uncommitted changes, then commit them.

- [ ] **Step 4: Commit final fixes if needed**

If verification required code or doc fixes:

```bash
git add <changed-files>
git commit -m "修复四点五至七阶段验收问题" -m "根据最终测试、类型检查、构建或数据库验证结果修正实现与文档，确保阶段验收通过。"
```

- [ ] **Step 5: Prepare final summary**

Final response must include:

- completion summary;
- added and modified files;
- database migration explanation;
- new API list;
- CLI examples;
- test results;
- dry-run boundaries;
- remaining unfinished work;
- next batch suggestions.

