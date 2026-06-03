# Phase 18 Hub Control Plane And Generic Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Hub from a demo-focused console into an API-backed control plane and generalize dry-run Mission actions beyond the fixed ai-novelist demo Mission.

**Architecture:** Keep Orchestrator API as the only write/control boundary. Hub remains React/Vite and only uses typed Orchestrator client methods. WorkerRunner keeps queue wrapper WorkerRun semantics while adding conservative MissionEvent and status-transition behavior.

**Tech Stack:** TypeScript, React/Vite, Fastify, Zod, Prisma storage abstractions, Vitest, pnpm workspace, BullMQ-compatible WorkerRuntime.

---

## Scope Check

This plan implements `enhance_plan.md` Batch 1 and Batch 2 only. It intentionally does not execute real Codex, push branches, create PRs, deploy, call external providers, or introduce Temporal/LangGraph. The plan is large but coherent because Hub control-plane pages and generic action preflight share the same Orchestrator contracts.

## File Structure

- Modify `apps/orchestrator-api/src/services.ts`: shared WorkerRun validation, global list services, generic action preflight, conservative action responses.
- Modify `apps/orchestrator-api/src/server.ts`: global list routes for bugs/artifacts/approvals if missing.
- Modify `apps/orchestrator-api/src/storage.ts`: global list methods for approvals/artifacts/bugs.
- Modify `apps/orchestrator-api/src/actions.ts`: replace demo-only assertion with reusable generic request parsing/building helpers.
- Modify `apps/orchestrator-api/tests/api.test.ts`: API contract, schema drift, generic action preflight tests.
- Modify `apps/worker-runner/src/runner.ts`: emit post-handler MissionEvents and legal conservative Mission transitions.
- Modify `apps/worker-runner/tests/runner.test.ts`: WorkerRunner event and transition tests.
- Modify `apps/hub/src/api/types.ts`: list/detail request and response types for Projects, Missions, Bugs, WorkerRuns, Artifacts, Approvals.
- Modify `apps/hub/src/api/client.ts`: typed list/detail/create/decision methods.
- Modify `apps/hub/src/App.tsx`: route handling and composition of new view functions.
- Create `apps/hub/src/views/projects.tsx`: Projects list/detail rendering.
- Create `apps/hub/src/views/missions.tsx`: Missions list and create form rendering.
- Create `apps/hub/src/views/resources.tsx`: Bugs, WorkerRuns, Artifacts, Approval list/detail rendering.
- Modify `apps/hub/src/styles.css`: forms, tables, details, status banners.
- Modify `apps/hub/tests/hub.test.tsx`: client, route, view, form, approval, token-safety tests.
- Modify `README.md`, `docs/progress.md`, `docs/safety.md`, `docs/queue-runtime.md`, `docs/hub-web.md`, `docs/api.md`, `docs/next-steps.md`.
- Create `docs/progress/phase-18-hub-control-plane-and-generic-actions.md`.

## Task 0: Prepare The Branch And Baseline

**Files:**
- Read: `enhance_plan.md`
- Read: `docs/superpowers/specs/2026-06-01-phase-18-hub-control-plane-and-generic-actions-design.md`

- [ ] **Step 1: Create a feature branch**

Run:

```bash
git status --short --branch
git switch -c phase-18-hub-control-plane-generic-actions
```

Expected: branch created from current `main`; only `enhance_plan.md` may remain untracked.

- [ ] **Step 2: Run focused baseline checks**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
pnpm --filter @psf/worker-runner test
```

Expected: all existing focused tests pass before edits. If a baseline failure appears, record it in the task notes before editing.

## Task 1: Fix WorkerType Schema Drift

**Files:**
- Modify: `apps/orchestrator-api/src/services.ts`
- Test: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Add the failing API test for `auto_fix` WorkerRun**

Append this test near the WorkerRun API tests in `apps/orchestrator-api/tests/api.test.ts`:

```ts
it("accepts auto_fix WorkerRun type through the API schema", async () => {
  const { server, authHeaders, mission } = await setupServerWithMission();

  const response = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/worker-runs`,
    headers: authHeaders,
    payload: {
      workerType: "auto_fix",
      status: "queued",
      mode: "dry-run",
      input: { source: "schema-drift-test" },
    },
  });

  expect(response.statusCode).toBe(201);
  expect(response.json().worker_type).toBe("auto_fix");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t "accepts auto_fix WorkerRun type"
```

Expected: FAIL with a validation error for `workerType`.

- [ ] **Step 3: Implement the schema drift fix**

In `apps/orchestrator-api/src/services.ts`, replace the local worker type enum with one that includes `auto_fix`:

```ts
const WorkerTypeSchema = z.enum(["codex", "qa", "deploy", "monitor", "planner", "integration", "orchestrator", "auto_fix"]);
```

If the module already imports `WorkerRunSchema` cleanly from `@psf/mission-schema`, prefer this shared shape instead:

```ts
const WorkerTypeSchema = WorkerRunSchema.shape.worker_type;
```

Use the shared-shape version only if it typechecks without widening request parsing unexpectedly.

- [ ] **Step 4: Verify the test passes**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t "accepts auto_fix WorkerRun type"
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "修复 WorkerRun 类型校验漂移" -m "补齐 Orchestrator WorkerRun 校验中的 auto_fix 类型，并增加 API 回归测试，确保服务层与 mission-schema 语义一致。"
```

## Task 2: Add Global Resource List API Contracts

**Files:**
- Modify: `apps/orchestrator-api/src/storage.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Modify: `apps/orchestrator-api/src/server.ts`
- Test: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Add failing tests for global list routes**

Add these tests in `apps/orchestrator-api/tests/api.test.ts` near the resource API tests:

```ts
it("lists all bugs for Hub resource pages", async () => {
  const { server, authHeaders, mission } = await setupServerWithMission();
  await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/bugs`,
    headers: authHeaders,
    payload: {
      title: "Generated chapter does not show review result",
      severity: "P1",
      status: "open",
      reproductionSteps: ["Open mission", "Run QA"],
      expectedResult: "Review result is visible",
      actualResult: "Review result is missing",
      evidence: { reportPath: "missions/demo/qa-report.md" },
      suggestedFixDirection: "Render review status after generation",
      source: "test",
    },
  });

  const response = await server.inject({ method: "GET", url: "/bugs" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: "Generated chapter does not show review result" }),
  ]));
});

it("lists all artifacts for Hub resource pages", async () => {
  const { server, authHeaders, mission } = await setupServerWithMission();
  await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/artifacts`,
    headers: authHeaders,
    payload: {
      type: "qa_report",
      name: "QA Report",
      path: "missions/demo/qa-report.md",
      metadata: { source: "test" },
    },
  });

  const response = await server.inject({ method: "GET", url: "/artifacts" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "qa_report", path: "missions/demo/qa-report.md" }),
  ]));
});

it("lists all approvals for Hub approval pages", async () => {
  const { server, authHeaders, mission } = await setupServerWithMission();
  await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/approvals`,
    headers: authHeaders,
    payload: {
      type: "release",
      reason: "Review before external action",
      requestedBy: "test",
    },
  });

  const response = await server.inject({ method: "GET", url: "/approvals" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "release", status: "pending" }),
  ]));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t "lists all"
```

Expected: FAIL with 404 for the new global routes.

- [ ] **Step 3: Add storage methods**

Update `MissionStorage` in `apps/orchestrator-api/src/storage.ts`:

```ts
listApprovals(): Promise<Approval[]>;
listArtifacts(): Promise<Artifact[]>;
listBugs(): Promise<BugReport[]>;
```

For in-memory storage, return sorted arrays:

```ts
async listApprovals() {
  return [...approvals.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async listArtifacts() {
  return [...artifacts.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async listBugs() {
  return [...bugs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
```

For Prisma-backed storage, use the existing model mapping helpers and descending create time:

```ts
async listApprovals() {
  const rows = await prisma.approval.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toApproval);
}
```

Use the existing `toArtifact` and `toBugReport` mapping helpers for `listArtifacts` and `listBugs`.

- [ ] **Step 4: Add service and routes**

In `apps/orchestrator-api/src/services.ts` return sanitized lists:

```ts
listApprovals: async () => sanitizeApiList(await storage.listApprovals()),
listArtifacts: async () => sanitizeApiList(await storage.listArtifacts()),
listBugs: async () => sanitizeApiList(await storage.listBugs()),
```

In `apps/orchestrator-api/src/server.ts`, add read routes:

```ts
server.get("/approvals", async () => services.listApprovals());
server.get("/artifacts", async () => services.listArtifacts());
server.get("/bugs", async () => services.listBugs());
```

Place them before parameterized routes where route order could become ambiguous.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t "lists all"
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/orchestrator-api/src/storage.ts apps/orchestrator-api/src/services.ts apps/orchestrator-api/src/server.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "补齐 Hub 资源列表接口" -m "新增 bugs、artifacts、approvals 的全局只读列表能力，供 Hub 控制台资源页面使用。"
```

## Task 3: Expand Hub API Client

**Files:**
- Modify: `apps/hub/src/api/types.ts`
- Modify: `apps/hub/src/api/client.ts`
- Test: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Add client contract tests**

Add a test near the existing API client tests:

```ts
it("calls Hub control-plane list and create APIs with safe auth behavior", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createOrchestratorClient({
    baseUrl: "http://api.test",
    token: "local-secret-token",
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return {
        ok: true,
        status: 200,
        json: async () => input.endsWith("/missions") && init?.method === "POST"
          ? { id: "mission-new", project_id: "ai-novelist", title: "New Mission" }
          : [],
      };
    },
  });

  await client.listProjects();
  await client.listMissions();
  await client.listBugs();
  await client.listArtifacts();
  await client.listApprovals();
  await client.createMission({
    projectId: "ai-novelist",
    title: "New Mission",
    rawRequest: "Add review flow",
    priority: "P2",
    riskLevel: "medium",
  });

  expect(calls.map((call) => call.input)).toEqual([
    "http://api.test/projects",
    "http://api.test/missions",
    "http://api.test/bugs",
    "http://api.test/artifacts",
    "http://api.test/approvals",
    "http://api.test/missions",
  ]);
  expect(calls.at(-1)?.init?.headers).toMatchObject({ authorization: "Bearer local-secret-token" });
});
```

- [ ] **Step 2: Run the failing client test**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t "calls Hub control-plane list and create APIs"
```

Expected: FAIL because the client methods do not exist.

- [ ] **Step 3: Add request types**

In `apps/hub/src/api/types.ts`, add:

```ts
export interface CreateMissionRequest {
  projectId: string;
  title: string;
  rawRequest: string;
  priority?: Priority;
  riskLevel?: RiskLevel;
}
```

If the API expects snake case, the client method will translate this to:

```ts
{
  projectId: input.projectId,
  title: input.title,
  rawRequest: input.rawRequest,
  priority: input.priority ?? "P2",
  riskLevel: input.riskLevel ?? "medium",
}
```

Use the existing API field style from current `POST /missions` tests if it differs.

- [ ] **Step 4: Add client methods**

In `apps/hub/src/api/client.ts`, extend `OrchestratorClient`:

```ts
listProjects: () => Promise<Project[]>;
getProject: (projectId: string) => Promise<Project>;
syncProjects: () => Promise<Project[]>;
listMissions: () => Promise<Mission[]>;
createMission: (input: CreateMissionRequest) => Promise<Mission>;
listBugs: () => Promise<BugReport[]>;
getBug: (bugId: string) => Promise<BugReport>;
listArtifacts: () => Promise<Artifact[]>;
getArtifact: (artifactId: string) => Promise<Artifact>;
listApprovals: () => Promise<Approval[]>;
getApproval: (approvalId: string) => Promise<Approval>;
decideApproval: (approvalId: string, input: { status: "approved" | "rejected" | "cancelled"; decidedBy?: string; decision?: string }) => Promise<Approval>;
```

Return implementations:

```ts
listProjects: () => request<Project[]>("/projects"),
getProject: (projectId) => request<Project>(`/projects/${encodeURIComponent(projectId)}`),
syncProjects: () => request<Project[]>("/projects/sync", { method: "POST" }),
listMissions: () => request<Mission[]>("/missions"),
createMission: (input) => request<Mission>("/missions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(input),
}),
listBugs: () => request<BugReport[]>("/bugs"),
getBug: (bugId) => request<BugReport>(`/bugs/${encodeURIComponent(bugId)}`),
listArtifacts: () => request<Artifact[]>("/artifacts"),
getArtifact: (artifactId) => request<Artifact>(`/artifacts/${encodeURIComponent(artifactId)}`),
listApprovals: () => request<Approval[]>("/approvals"),
getApproval: (approvalId) => request<Approval>(`/approvals/${encodeURIComponent(approvalId)}`),
decideApproval: (approvalId, input) => request<Approval>(`/approvals/${encodeURIComponent(approvalId)}/decision`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(input),
}),
```

- [ ] **Step 5: Update mock client helper**

In `apps/hub/tests/hub.test.tsx`, update `createMockClient()` to return arrays from existing fixtures:

```ts
listProjects: vi.fn().mockResolvedValue([dashboard.recentMissions[0]?.project].filter(Boolean)),
getProject: vi.fn().mockResolvedValue(projectFixture),
syncProjects: vi.fn().mockResolvedValue([projectFixture]),
listMissions: vi.fn().mockResolvedValue([missionSummary.mission]),
createMission: vi.fn().mockResolvedValue(missionSummary.mission),
listBugs: vi.fn().mockResolvedValue(missionSummary.bugs),
getBug: vi.fn().mockResolvedValue(missionSummary.bugs[0]),
listArtifacts: vi.fn().mockResolvedValue(missionSummary.artifacts),
getArtifact: vi.fn().mockResolvedValue(missionSummary.artifacts[0]),
listApprovals: vi.fn().mockResolvedValue(missionSummary.approvals),
getApproval: vi.fn().mockResolvedValue(missionSummary.approvals[0]),
decideApproval: vi.fn().mockResolvedValue({ ...missionSummary.approvals[0], status: "approved" }),
```

Create `projectFixture` in the test file if no suitable project object already exists.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t "calls Hub control-plane list and create APIs"
pnpm --filter @psf/hub typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/hub/src/api/types.ts apps/hub/src/api/client.ts apps/hub/tests/hub.test.tsx
git commit -m "扩展 Hub 控制台 API 客户端" -m "为项目、任务、Bug、Artifact、Approval 和 Mission 创建补齐类型化客户端方法，并保持写接口 token 保护。"
```

## Task 4: Replace Static Hub Routes With API-Backed Views

**Files:**
- Modify: `apps/hub/src/App.tsx`
- Create: `apps/hub/src/views/projects.tsx`
- Create: `apps/hub/src/views/missions.tsx`
- Create: `apps/hub/src/views/resources.tsx`
- Modify: `apps/hub/src/styles.css`
- Test: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Add failing route rendering tests**

Add mounted App tests:

```ts
it("renders API-backed Projects route", async () => {
  const client = createMockClient();
  const mounted = await renderMountedApp(client, "#projects");

  expect(mounted.container.textContent).toContain("Projects");
  expect(mounted.container.textContent).toContain("ai-novelist");
  expect(client.listProjects).toHaveBeenCalledOnce();

  mounted.root.unmount();
  mounted.cleanup();
});

it("renders API-backed Missions route without falling back to demo mission detail", async () => {
  const client = createMockClient();
  const mounted = await renderMountedApp(client, "#missions");

  expect(mounted.container.textContent).toContain("Missions");
  expect(mounted.container.textContent).toContain(missionSummary.mission.title);
  expect(client.getMissionSummary).not.toHaveBeenCalled();
  expect(client.listMissions).toHaveBeenCalledOnce();

  mounted.root.unmount();
  mounted.cleanup();
});
```

Expected before implementation: FAIL because these routes render the static empty-state view.

- [ ] **Step 2: Add route state loaders**

In `apps/hub/src/App.tsx`, add load states:

```ts
const [projectsState, setProjectsState] = useState<LoadState<Project[]>>({ status: "idle" });
const [missionsState, setMissionsState] = useState<LoadState<Mission[]>>({ status: "idle" });
const [bugsState, setBugsState] = useState<LoadState<BugReport[]>>({ status: "idle" });
const [workerRunsState, setWorkerRunsState] = useState<LoadState<WorkerRun[]>>({ status: "idle" });
const [artifactsState, setArtifactsState] = useState<LoadState<Artifact[]>>({ status: "idle" });
const [approvalsState, setApprovalsState] = useState<LoadState<Approval[]>>({ status: "idle" });
```

Add effects keyed by route page to call the corresponding client method.

- [ ] **Step 3: Create project view renderer**

Create `apps/hub/src/views/projects.tsx`:

```tsx
import type { ReactElement } from "react";
import type { Project } from "../api/types";
import type { LoadState } from "../App";

export function renderProjectsView(state: LoadState<Project[]>): ReactElement {
  if (state.status === "loading" || state.status === "idle") {
    return <main className="content-surface"><h1>Projects</h1><p>Loading projects from Orchestrator API</p></main>;
  }
  if (state.status === "error") {
    return <main className="content-surface"><h1>Projects</h1><p className="error-text">{state.message}</p></main>;
  }
  return (
    <main className="content-surface">
      <header className="page-header"><div><h1>Projects</h1><p>Registered Project Passports</p></div></header>
      <section className="panel">
        {state.data.length === 0 ? <p className="empty-line">No projects registered</p> : (
          <div className="data-table">
            {state.data.map((project) => (
              <a className="data-row" key={project.id} href={`#projects?id=${encodeURIComponent(project.id)}`}>
                <strong>{project.name}</strong>
                <span>{project.id}</span>
                <span>{project.repo_url}</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Create mission view renderer**

Create `apps/hub/src/views/missions.tsx` with `renderMissionsView` and `renderMissionCreateView`. Use controlled form state in `App.tsx` and pass callbacks so the view stays stateless where possible:

```tsx
export interface MissionCreateActions {
  onSubmit: (input: { projectId: string; title: string; rawRequest: string; priority: "P0" | "P1" | "P2" | "P3"; riskLevel: "low" | "medium" | "high" }) => void | Promise<void>;
}
```

The rendered form must include labels and fields for project, title, raw request, priority, and risk level. Submit button text:

```text
Create Mission
```

- [ ] **Step 5: Create resource view renderers**

Create `apps/hub/src/views/resources.tsx` with:

```ts
export function renderBugsView(state: LoadState<BugReport[]>): ReactElement;
export function renderWorkerRunsView(state: LoadState<WorkerRun[]>, actions?: { onCancel: (id: string) => void | Promise<void>; onRetry: (id: string) => void | Promise<void> }): ReactElement;
export function renderArtifactsView(state: LoadState<Artifact[]>): ReactElement;
export function renderApprovalsView(state: LoadState<Approval[]>, actions?: { onApprove: (id: string) => void | Promise<void>; onReject: (id: string) => void | Promise<void> }): ReactElement;
```

Each function must render a readable empty state, an error state, and a table/list state.

- [ ] **Step 6: Wire App route switch**

Replace the static fallback path for `projects`, `missions`, `bugs`, `worker-runs`, `artifacts`, and `approvals` with the new renderers. Keep a fallback for unknown pages only.

For `mission-detail`, require an explicit id:

```ts
const missionId = route.params.get("id");
if (!missionId) {
  return renderMissionSelectionRequiredView();
}
```

Add a demo shortcut link on Dashboard:

```tsx
<a href="#mission-detail?id=mission-0001-ai-novelist-chapter-review">Open demo Mission</a>
```

- [ ] **Step 7: Verify focused Hub tests**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t "API-backed"
pnpm --filter @psf/hub typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/hub/src/App.tsx apps/hub/src/views apps/hub/src/styles.css apps/hub/tests/hub.test.tsx
git commit -m "补齐 Hub 资源页面" -m "将 Hub 项目、任务、Bug、WorkerRun、Artifact 和 Approval 页面接入 Orchestrator API，并移除正常路由对固定 demo Mission 的依赖。"
```

## Task 5: Add Hub Mission Creation Flow

**Files:**
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/src/views/missions.tsx`
- Test: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Add failing mounted form test**

Add:

```ts
it("creates a Mission from Hub and navigates to Mission Detail", async () => {
  const createdMission = { ...missionSummary.mission, id: "mission-created-from-hub", title: "Review chapter export" };
  const client = createMockClient({ createMission: vi.fn().mockResolvedValue(createdMission) });
  const mounted = await renderMountedApp(client, "#missions/new");

  expect(mounted.container.textContent).toContain("Create Mission");

  await act(async () => {
    await findDomButtonByText(mounted.container, "Create Mission").dispatchEvent(new TestEvent("click", { bubbles: true }));
    await flushReactWork();
  });

  expect(client.createMission).toHaveBeenCalledWith(expect.objectContaining({
    projectId: "ai-novelist",
  }));
  expect(window.location.hash).toBe("#mission-detail?id=mission-created-from-hub");

  mounted.root.unmount();
  mounted.cleanup();
});
```

If the custom DOM does not support input assignment, render `renderMissionCreateView` directly and call the provided `onSubmit` with explicit values.

- [ ] **Step 2: Implement create action in App**

Add:

```ts
const createMissionFromHub = useCallback(async (input: CreateMissionRequest): Promise<void> => {
  setActionState({ loading: "create-mission", message: "", error: "" });
  try {
    const mission = await client.createMission(input);
    setActionState({ loading: "", message: "Mission created", error: "" });
    window.location.hash = `#mission-detail?id=${encodeURIComponent(mission.id)}`;
  } catch (error: unknown) {
    setActionState({ loading: "", message: "", error: errorMessage(error, "Mission creation failed") });
  }
}, [client]);
```

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t "creates a Mission from Hub"
pnpm --filter @psf/hub typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/hub/src/App.tsx apps/hub/src/views/missions.tsx apps/hub/tests/hub.test.tsx
git commit -m "增加 Hub 创建任务入口" -m "新增 Mission 创建表单并在创建成功后跳转到对应 Mission Detail，保持所有写操作经 Orchestrator API。"
```

## Task 6: Add Approval Decision UI

**Files:**
- Modify: `apps/hub/src/App.tsx`
- Modify: `apps/hub/src/views/resources.tsx`
- Test: `apps/hub/tests/hub.test.tsx`

- [ ] **Step 1: Add failing approval decision tests**

Add:

```ts
it("approves and rejects approvals through protected Orchestrator client methods", async () => {
  const client = createMockClient();
  const mounted = await renderMountedApp(client, "#approvals");

  await act(async () => {
    findDomButtonByText(mounted.container, "Approve").click();
    await flushReactWork();
  });

  expect(client.decideApproval).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "approved" }));

  await act(async () => {
    findDomButtonByText(mounted.container, "Reject").click();
    await flushReactWork();
  });

  expect(client.decideApproval).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "rejected" }));

  mounted.root.unmount();
  mounted.cleanup();
});
```

- [ ] **Step 2: Implement approval callbacks**

In `App.tsx`:

```ts
const decideApprovalFromHub = useCallback(async (approvalId: string, status: "approved" | "rejected"): Promise<void> => {
  setActionState({ loading: `approval-${status}`, message: "", error: "" });
  try {
    await client.decideApproval(approvalId, { status, decidedBy: "hub", decision: `Hub ${status}` });
    await loadApprovals();
    setActionState({ loading: "", message: `Approval ${status}`, error: "" });
  } catch (error: unknown) {
    setActionState({ loading: "", message: "", error: errorMessage(error, `Approval ${status} failed`) });
  }
}, [client, loadApprovals]);
```

The UI text must state that approval decisions do not trigger real Codex, PR, deploy, monitor, or provider sync in this phase.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx -t "approves and rejects approvals"
pnpm --filter @psf/hub typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/hub/src/App.tsx apps/hub/src/views/resources.tsx apps/hub/tests/hub.test.tsx
git commit -m "增加 Hub 审批决策入口" -m "Approval 页面支持 approve 和 reject，并明确审批记录不会自动触发真实外部动作。"
```

## Task 7: Generalize Mission Action Preflight

**Files:**
- Modify: `apps/orchestrator-api/src/actions.ts`
- Modify: `apps/orchestrator-api/src/services.ts`
- Test: `apps/orchestrator-api/tests/api.test.ts`

- [ ] **Step 1: Add failing generic action tests**

Add tests:

```ts
it("allows dry-run action for a non-demo Mission when project and passport exist", async () => {
  const { server, authHeaders, storage } = await setupServer();
  const project = await storage.createProject(projectFixture("generic-project"));
  const mission = await storage.createMission(missionFixture({ id: "mission-generic-1", project_id: project.id }));

  const response = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/actions/plan`,
    headers: authHeaders,
    payload: {},
  });

  expect([200, 202]).toContain(response.statusCode);
  expect(response.json().missionId).toBe(mission.id);
});

it("returns a readable preflight error when Mission action cannot resolve project", async () => {
  const { server, authHeaders, storage } = await setupServer();
  const mission = await storage.createMission(missionFixture({ id: "mission-missing-project", project_id: "missing-project" }));

  const response = await server.inject({
    method: "POST",
    url: `/missions/${mission.id}/actions/qa-dry-run`,
    headers: authHeaders,
    payload: {},
  });

  expect(response.statusCode).toBe(400);
  expect(response.json().message).toContain("Project");
});
```

Use existing test fixture helpers if they have different names. The important behavior is that non-demo Missions no longer fail solely because their id is not the demo id.

- [ ] **Step 2: Run tests to see the demo-only failure**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t "non-demo Mission"
```

Expected: FAIL with the current demo-only validation message.

- [ ] **Step 3: Replace demo-only assertion in services**

In `apps/orchestrator-api/src/services.ts`, replace this pattern:

```ts
assertDemoMissionActionSupported(id);
```

with a preflight helper:

```ts
async function assertMissionActionSupported(id: string, action: QueuedActionKind) {
  const mission = await storage.getMission(id);
  if (!mission) {
    throw notFound("MISSION_NOT_FOUND", `Mission not found: ${id}`);
  }
  const project = await storage.getProject(mission.project_id);
  if (!project) {
    throw badRequest("MISSION_PROJECT_NOT_FOUND", `Project not found for Mission: ${mission.project_id}`, { missionId: id, projectId: mission.project_id });
  }
  if (!["plan", "codex", "qa", "fix", "loop"].includes(action)) {
    throw badRequest("MISSION_ACTION_NOT_SUPPORTED", `Mission action is not supported: ${action}`, { missionId: id, action });
  }
  return { mission, project };
}
```

Keep `assertDemoMissionActionSupported` only for `POST /demo/ai-novelist`, not Mission-specific action routes.

- [ ] **Step 4: Adjust inline runner behavior**

Existing inline dry-run functions in `@psf/demo-workflow` may still be ai-novelist shaped. For non-demo Missions, inline mode should return a controlled dry-run response rather than calling demo-only file generation if generic generation is not available.

Add a helper:

```ts
function toGenericInlineActionResponse(input: { missionId: string; projectId: string; action: QueuedActionKind }) {
  return {
    accepted: true,
    executionMode: "inline" as const,
    missionId: input.missionId,
    projectId: input.projectId,
    mode: "dry-run",
    dryRun: true,
    realCodexExecuted: false,
    realExternalCall: false,
    realPush: false,
    realDeploy: false,
    generatedArtifacts: [],
    workerRunIds: [],
    qaRunIds: [],
    bugIds: [],
    eventIds: [],
    recommendedNextAction: `Generic ${input.action} preflight passed. Queue mode is recommended for worker execution.`,
  };
}
```

Use existing demo-workflow runners for the demo Mission and this controlled response for non-demo inline actions until generic worker services are available.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts -t "Mission action"
pnpm --filter @psf/orchestrator-api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/orchestrator-api/src/actions.ts apps/orchestrator-api/src/services.ts apps/orchestrator-api/tests/api.test.ts
git commit -m "泛化任务动作前置校验" -m "Mission dry-run action 不再只接受固定 demo Mission，并在缺少项目或不支持动作时返回明确错误。"
```

## Task 8: Connect WorkerRunner Results To Mission Events And Safe Transitions

**Files:**
- Modify: `apps/worker-runner/src/runner.ts`
- Test: `apps/worker-runner/tests/runner.test.ts`

- [ ] **Step 1: Add failing WorkerRunner transition tests**

Add tests:

```ts
it("records a MissionEvent when a queue job succeeds with QA bugs", async () => {
  const storage = createMemoryStorageWithMission({ status: "qa_running" });
  const job = queueJob({ type: "qa.dry_run_with_sample_bug" });

  await processWorkerJob({
    job,
    storage,
    handler: async () => ({
      childWorkerRunIds: ["qa-run-worker"],
      childQARunIds: ["qa-run-1"],
      childArtifactIds: ["bugs-json-artifact"],
      childBugReportIds: ["bug-1"],
      summary: "QA dry-run found bugs.",
      recommendedNextAction: "Run fix dry-run.",
    }),
    now: () => "2026-06-01T00:00:00.000Z",
  });

  const events = await storage.listMissionEvents(job.missionId);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: "mission.action_result",
      message: expect.stringContaining("QA dry-run found bugs"),
    }),
  ]));
});
```

Add a second test for `qa.dry_run` with no bugs and a current Mission status where `ready_for_review` is legal.

- [ ] **Step 2: Implement action result event**

In `apps/worker-runner/src/runner.ts`, after handler success and before final wrapper update, append:

```ts
await appendActionResultEvent(input.storage, input.job, result, succeededAt);
```

Add helper:

```ts
async function appendActionResultEvent(storage: MissionStorage, job: QueueWorkerJob, result: WorkerJobHandlerResult, timestamp: string): Promise<void> {
  await storage.appendMissionEvent({
    id: `event-${job.workerRunId}-action-result-${randomUUID()}`,
    mission_id: job.missionId,
    type: "mission.action_result",
    message: result.summary,
    payload: {
      jobId: job.id,
      jobType: job.type,
      workerRunId: job.workerRunId,
      childWorkerRunIds: result.childWorkerRunIds,
      childQARunIds: result.childQARunIds,
      childArtifactIds: result.childArtifactIds,
      childBugReportIds: result.childBugReportIds,
      recommendedNextAction: result.recommendedNextAction,
    },
    created_at: timestamp,
  });
}
```

- [ ] **Step 3: Implement conservative transition helper**

Add:

```ts
async function applyConservativeMissionTransition(storage: MissionStorage, job: QueueWorkerJob, result: WorkerJobHandlerResult, timestamp: string): Promise<void> {
  const mission = await storage.getMission(job.missionId);
  if (!mission) return;

  const nextStatus = inferNextMissionStatus(job, result, mission.status);
  if (!nextStatus || nextStatus === mission.status) return;

  await storage.updateMission({
    resource: { ...mission, status: nextStatus, updated_at: timestamp },
    event: {
      id: `event-${job.workerRunId}-mission-status-${randomUUID()}`,
      mission_id: mission.id,
      type: "mission.status.auto_transition",
      message: `Mission moved from ${mission.status} to ${nextStatus} after ${job.type}.`,
      payload: { from: mission.status, to: nextStatus, jobId: job.id, jobType: job.type, workerRunId: job.workerRunId },
      created_at: timestamp,
    },
  });
}

function inferNextMissionStatus(job: QueueWorkerJob, result: WorkerJobHandlerResult, currentStatus: string): string | undefined {
  if (job.type === "mission.plan" && (currentStatus === "received" || currentStatus === "planning")) return "planned";
  if (job.type.startsWith("qa.") && result.childBugReportIds.length > 0 && currentStatus === "qa_running") return "bugs_found";
  if (job.type.startsWith("qa.") && result.childBugReportIds.length === 0 && currentStatus === "qa_running") return "ready_for_review";
  if (job.type === "fix.dry_run" && currentStatus === "fixing") return "regression_running";
  if (job.type === "loop.dry_run" && result.childBugReportIds.length === 0 && currentStatus !== "ready_for_review") return "ready_for_review";
  return undefined;
}
```

If `storage.updateMission` has a different signature, use the existing mission update helper in storage.

- [ ] **Step 4: Verify WorkerRunner tests**

Run:

```bash
pnpm --filter @psf/worker-runner test -- --run tests/runner.test.ts -t "MissionEvent"
pnpm --filter @psf/worker-runner typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/worker-runner/src/runner.ts apps/worker-runner/tests/runner.test.ts
git commit -m "记录队列任务结果事件" -m "WorkerRunner 在 wrapper WorkerRun 完成后写入 Mission action result 事件，并按保守规则推动合法 Mission 状态。"
```

## Task 9: Document Phase 18 Behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/progress.md`
- Create: `docs/progress/phase-18-hub-control-plane-and-generic-actions.md`
- Modify: `docs/safety.md`
- Modify: `docs/queue-runtime.md`
- Modify: `docs/hub-web.md`
- Modify: `docs/api.md`
- Modify: `docs/next-steps.md`

- [ ] **Step 1: Update docs with precise scope**

Add this capability statement to the phase progress doc:

```md
# Phase 18 Progress: Hub Control Plane And Generic Mission Actions

## Completed Scope

- Hub resource pages now read Projects, Missions, Bugs, WorkerRuns, Artifacts, and Approvals through Orchestrator API.
- Hub can create Missions for registered projects and open the created Mission detail page.
- Approval decisions can be recorded from Hub, but they do not execute real Codex, PR, deploy, monitor, or provider sync.
- Mission dry-run action preflight no longer rejects non-demo Missions solely because of the Mission id.
- WorkerRunner records Mission action result events and applies conservative legal status transitions.

## Safety Boundary

The system still does not execute real Codex by default, does not push, does not create PRs, does not deploy, and does not call GitHub, Coolify, Uptime Kuma, or Plane provider APIs by default.
```

- [ ] **Step 2: Update API docs**

Ensure `docs/api.md` includes:

```md
GET /bugs
GET /artifacts
GET /approvals
POST /missions
POST /approvals/:approvalId/decision
```

For `POST /missions`, document the request body used by Hub:

```json
{
  "projectId": "ai-novelist",
  "title": "Review chapter export",
  "rawRequest": "Add review coverage for export flow",
  "priority": "P2",
  "riskLevel": "medium"
}
```

- [ ] **Step 3: Update Hub docs**

In `docs/hub-web.md`, document:

```md
Hub normal navigation no longer falls back to the fixed demo Mission. The demo Mission remains linked as a quick-start sample from Dashboard.
```

- [ ] **Step 4: Verify doc formatting**

Run:

```bash
git diff --check -- README.md docs/progress.md docs/progress/phase-18-hub-control-plane-and-generic-actions.md docs/safety.md docs/queue-runtime.md docs/hub-web.md docs/api.md docs/next-steps.md
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md docs/progress.md docs/progress/phase-18-hub-control-plane-and-generic-actions.md docs/safety.md docs/queue-runtime.md docs/hub-web.md docs/api.md docs/next-steps.md
git commit -m "记录 Phase 18 控制台与通用动作进展" -m "同步 Hub 控制台、通用 Mission action、默认安全边界和 API 文档，保持真实外部动作默认关闭。"
```

## Task 10: Full Verification And Final Commit Hygiene

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused package checks**

Run:

```bash
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/hub test
```

Expected: all pass.

- [ ] **Step 2: Run phase gate checks**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm psf doctor
git diff --check
git status --short --branch
```

Expected:

- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm build` passes.
- `pnpm psf doctor` may report warnings for missing local `.env` or optional provider credentials; it must not fail due to Phase 18 changes.
- `git diff --check` passes.
- `git status --short --branch` shows only intentional tracked changes or a clean tree. `enhance_plan.md` can remain untracked if it is user-provided planning input.

- [ ] **Step 3: Commit any remaining tracked verification fixes**

If verification required small tracked fixes, commit them:

```bash
git add <changed-tracked-files>
git commit -m "稳定 Phase 18 验收检查" -m "修复 Phase 18 控制台和通用任务动作实现后的类型、测试或文档验收问题。"
```

Skip this commit if no tracked fixes remain after Task 9.

## Self-Review

- Spec coverage: Tasks 1-2 cover schema drift and API list contracts; Tasks 3-6 cover Hub control-plane pages, Mission creation, and Approval decisions; Tasks 7-8 cover generic Mission action preflight and WorkerRunner result events/transitions; Task 9 covers docs; Task 10 covers phase gates.
- Scope control: no task enables real Codex, provider network calls, push, PR creation, deployment, Temporal, or LangGraph.
- Type consistency: request names use Hub camelCase input and Orchestrator route contracts already present in `server.ts`; `auto_fix` matches `@psf/mission-schema`.
- Execution order: tests precede implementation in each code task, and commits are scoped to reviewable slices.
