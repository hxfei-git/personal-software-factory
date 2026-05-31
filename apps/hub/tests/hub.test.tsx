import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  OrchestratorApiError,
  createOrchestratorClient,
  type OrchestratorClient,
} from "../src/api/client";
import type {
  DashboardResponse,
  DryRunActionResponse,
  IntegrationStatus,
  MissionDryRunAction,
  MissionSummaryResponse,
  QueueStatus,
} from "../src/api/types";
import App, {
  renderDashboardView,
  renderIntegrationsView,
  renderMissionDetailView,
  renderTokenSafetyProbe,
} from "../src/App";

const now = "2026-05-31T00:00:00.000Z";

const appMissionDetailHash = "#mission-detail?id=mission-0001-ai-novelist-chapter-review";

type TestEventListener = (event: TestEvent) => void;

class TestEvent {
  readonly type: string;
  readonly bubbles: boolean;
  target: TestNode | null = null;
  currentTarget: TestNode | null = null;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string, init: { bubbles?: boolean } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class TestNode {
  readonly childNodes: TestNode[] = [];
  parentNode: TestNode | null = null;
  ownerDocument: TestDocument | null = null;
  readonly listeners = new Map<string, Set<TestEventListener>>();

  constructor(readonly nodeType: number, readonly nodeName: string) {}

  appendChild<T extends TestNode>(node: T): T {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore<T extends TestNode>(node: T, before: TestNode | null): T {
    if (before === null) {
      return this.appendChild(node);
    }
    const index = this.childNodes.indexOf(before);
    if (index < 0) {
      throw new Error("Reference node is not a child");
    }
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild<T extends TestNode>(node: T): T {
    const index = this.childNodes.indexOf(node);
    if (index < 0) {
      throw new Error("Node is not a child");
    }
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  addEventListener(type: string, listener: TestEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<TestEventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: TestEvent): boolean {
    if (!event.target) {
      event.target = this;
    }
    let node: TestNode | null = this;
    while (node) {
      event.currentTarget = node;
      for (const listener of node.listeners.get(event.type) ?? []) {
        listener(event);
      }
      if (!event.bubbles || event.propagationStopped) {
        break;
      }
      node = node.parentNode;
    }
    return !event.defaultPrevented;
  }

  get firstChild(): TestNode | null {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes.length = 0;
    if (value !== "") {
      this.appendChild(new TestText(value, this.ownerDocument));
    }
  }
}

class TestText extends TestNode {
  data: string;

  constructor(data: string, ownerDocument: TestDocument | null) {
    super(3, "#text");
    this.data = data;
    this.ownerDocument = ownerDocument;
  }

  get nodeValue(): string {
    return this.data;
  }

  set nodeValue(value: string) {
    this.data = value;
  }

  override get textContent(): string {
    return this.data;
  }

  override set textContent(value: string) {
    this.data = value;
  }
}

class TestElement extends TestNode {
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  namespaceURI = "http://www.w3.org/1999/xhtml";
  disabled = false;
  className = "";

  constructor(readonly tagName: string, ownerDocument: TestDocument | null) {
    super(1, tagName.toUpperCase());
    this.ownerDocument = ownerDocument;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name === "class") {
      this.className = String(value);
    }
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "class") {
      this.className = "";
    }
  }

  click(): void {
    this.dispatchEvent(new TestEvent("click", { bubbles: true }));
  }
}

class TestDocument extends TestNode {
  readonly documentElement: TestElement;
  readonly body: TestElement;
  defaultView: TestWindow | null = null;
  activeElement: TestElement | null = null;

  constructor() {
    super(9, "#document");
    this.ownerDocument = this;
    this.documentElement = this.createElement("html");
    this.body = this.createElement("body");
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }

  createElement(tagName: string): TestElement {
    return new TestElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): TestElement {
    return new TestElement(tagName, this);
  }

  createTextNode(data: string): TestText {
    return new TestText(data, this);
  }

  createComment(data: string): TestText {
    return new TestText(data, this);
  }
}

interface TestWindow {
  document: TestDocument;
  location: { hash: string };
  navigator: { userAgent: string };
  Event: typeof TestEvent;
  MouseEvent: typeof TestEvent;
  Node: typeof TestNode;
  Element: typeof TestElement;
  HTMLElement: typeof TestElement;
  HTMLButtonElement: typeof TestElement;
  HTMLIFrameElement: typeof TestElement;
  addEventListener: TestDocument["addEventListener"];
  removeEventListener: TestDocument["removeEventListener"];
  dispatchEvent: TestDocument["dispatchEvent"];
}

function installTestDom(hash: string): { container: TestElement; cleanup: () => void } {
  const document = new TestDocument();
  const windowObject: TestWindow = {
    document,
    location: { hash },
    navigator: { userAgent: "vitest" },
    Event: TestEvent,
    MouseEvent: TestEvent,
    Node: TestNode,
    Element: TestElement,
    HTMLElement: TestElement,
    HTMLButtonElement: TestElement,
    HTMLIFrameElement: TestElement,
    addEventListener: document.addEventListener.bind(document),
    removeEventListener: document.removeEventListener.bind(document),
    dispatchEvent: document.dispatchEvent.bind(document),
  };
  document.defaultView = windowObject;
  const container = document.createElement("div");
  document.body.appendChild(container);

  vi.stubGlobal("window", windowObject);
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", windowObject.navigator);
  vi.stubGlobal("Event", TestEvent);
  vi.stubGlobal("MouseEvent", TestEvent);
  vi.stubGlobal("Node", TestNode);
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("HTMLElement", TestElement);
  vi.stubGlobal("HTMLButtonElement", TestElement);
  vi.stubGlobal("HTMLIFrameElement", TestElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  return {
    container,
    cleanup: () => vi.unstubAllGlobals(),
  };
}

function findDomButtonByText(node: TestNode, label: string): TestElement {
  if (node instanceof TestElement && node.tagName.toLowerCase() === "button" && node.textContent.includes(label)) {
    return node;
  }
  for (const child of node.childNodes) {
    try {
      return findDomButtonByText(child, label);
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`DOM button not found: ${label}`);
}

async function flushReactWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderMountedApp(client: OrchestratorClient | undefined, hash: string): Promise<{ container: TestElement; root: Root; cleanup: () => void }> {
  const dom = installTestDom(hash);
  const root = createRoot(dom.container as unknown as Element);
  await act(async () => {
    root.render(client ? <App client={client} /> : <App />);
    await flushReactWork();
  });
  return { ...dom, root };
}

function createMockClient(overrides: Partial<OrchestratorClient> = {}): OrchestratorClient {
  return {
    getDashboard: vi.fn().mockResolvedValue(dashboard),
    getMissionSummary: vi.fn().mockResolvedValue(missionSummary),
    getQueueStatus: vi.fn().mockResolvedValue(queueStatus),
    listWorkerRuns: vi.fn().mockResolvedValue(missionSummary.workerRuns),
    cancelWorkerRun: vi.fn().mockResolvedValue({ status: "cancelled" }),
    retryWorkerRun: vi.fn().mockResolvedValue({ status: "queued" }),
    listIntegrations: vi.fn().mockResolvedValue(dashboard.integrationStatuses),
    runIntegrationDryRun: vi.fn().mockResolvedValue(dryRunResponse),
    runMissionAction: vi.fn().mockResolvedValue(dryRunResponse),
    runAiNovelistDemo: vi.fn().mockResolvedValue(dryRunResponse),
    ...overrides,
  };
}

function textFromElement(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromElement).join(" ");
  }
  const element = node as ReactElement<{ children?: unknown }>;
  return textFromElement(element.props?.children);
}

function findButtonByText(node: unknown, label: string): ReactElement<{ children?: unknown; onClick?: () => void | Promise<void>; disabled?: boolean }> {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    throw new Error(`Button not found: ${label}`);
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findButtonByText(child, label);
      } catch {
        // Continue searching sibling branches.
      }
    }
    throw new Error(`Button not found: ${label}`);
  }
  const element = node as ReactElement<{ children?: unknown; onClick?: () => void | Promise<void>; disabled?: boolean }>;
  if (element.type === "button" && textFromElement(element.props.children).includes(label)) {
    return element;
  }
  return findButtonByText(element.props?.children, label);
}

function sampleIntegration(name: IntegrationStatus["name"]): IntegrationStatus {
  return {
    name,
    externalName: name === "uptime_kuma" ? "uptime-kuma" : name,
    mode: "dry-run",
    enabled: false,
    configured: false,
    healthy: true,
    realEnabled: false,
    realNetworkCall: false,
    safeToRun: true,
    requiredEnv: [`${name.toUpperCase()}_TOKEN`],
    missingEnv: [`${name.toUpperCase()}_TOKEN`],
    lastCheckedAt: now,
    message: `${name} mock/dry-run only`,
  };
}

const dashboard: DashboardResponse = {
  metrics: {
    projectCount: 1,
    missionCount: 8,
    runningMissionCount: 2,
    failedMissionCount: 1,
    readyForReviewMissionCount: 3,
    qaRunCount: 5,
    qaFailedCount: 2,
    bugCount: 6,
    openBugCount: 4,
    p0p1BugCount: 2,
    pendingApprovalCount: 1,
    workerRunCount: 7,
    artifactCount: 9,
  },
  recentMissions: [
    {
      id: "mission-0001-ai-novelist-chapter-review",
      project_id: "ai-novelist",
      title: "AI Novelist chapter review",
      slug: "ai-novelist-chapter-review",
      raw_request: "Review chapter flow",
      status: "ready_for_review",
      priority: "P1",
      risk_level: "medium",
      branch_name: "psf/chapter-review",
      workspace_path: "",
      pr_url: "https://github.example/pr/1",
      current_attempt: 1,
      max_attempts: 3,
      created_at: now,
      updated_at: now,
    },
  ],
  recentBugs: [
    {
      id: "bug-dashboard-p1",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      title: "Chapter review blocks ready state",
      severity: "P1",
      status: "open",
      reproduction_steps: ["Open mission detail"],
      expected_result: "Ready status is visible",
      actual_result: "Status is hidden",
      evidence: {},
      created_at: now,
      updated_at: now,
    },
  ],
  recentWorkerRuns: [
    {
      id: "worker-run-dashboard",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      worker_type: "codex",
      status: "failed",
      mode: "dry-run",
      error: "Unit test failed",
      input: {},
      output: {},
      logs: [],
      metadata: {},
      created_at: now,
      updated_at: now,
    },
  ],
  recentFailedWorkerRuns: [],
  recentQaRuns: [
    {
      id: "qa-run-dashboard",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      target_url: "http://127.0.0.1:8400",
      mode: "mock",
      status: "failed",
      summary: "Failed QA.",
      passed: 3,
      failed: 1,
      bugs: [],
      created_at: now,
      updated_at: now,
    },
  ],
  recentArtifacts: [
    {
      id: "artifact-qa",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      type: "qa_report",
      path: "missions/mission-0001-ai-novelist-chapter-review/qa-report.md",
      content: "# QA Report",
      size: 11,
      metadata: {},
      created_at: now,
    },
  ],
  integrationStatuses: ["github", "coolify", "uptime_kuma", "plane"].map((name) =>
    sampleIntegration(name as IntegrationStatus["name"]),
  ),
  recommendedNextActions: ["Review open P0/P1 bugs", "Approve pending releases"],
  healthSignals: [
    { key: "failed-worker-runs", status: "attention", count: 1, message: "1 worker run failed recently" },
  ],
};

const queueStatus: QueueStatus = {
  runtime: "bullmq",
  redisConfigured: true,
  redisReachable: true,
  queueName: "psf:worker-jobs",
  counts: {
    queued: 4,
    active: 2,
    completed: 12,
    failed: 1,
    cancelled: 1,
    delayed: 3,
  },
};

const missionSummary: MissionSummaryResponse = {
  mission: dashboard.recentMissions[0]!,
  project: {
    id: "ai-novelist",
    slug: "ai-novelist",
    name: "AI Novelist",
    repo_url: "https://github.example/ai-novelist",
    default_branch: "main",
    status: "active",
    created_at: now,
    updated_at: now,
  },
  currentStatus: "ready_for_review",
  events: [
    {
      id: "event-created",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      type: "mission.created",
      message: "Mission created",
      payload: {},
      created_at: now,
    },
  ],
  artifacts: dashboard.recentArtifacts,
  workerRuns: [
    {
      id: "queue-wrapper-run",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      worker_type: "qa",
      status: "queued",
      mode: "dry-run",
      input: {},
      output: {
        jobId: "job-queued-123",
        jobType: "qa.dry_run",
        childWorkerRunIds: ["worker-run-dashboard"],
        childQARunIds: ["qa-run-dashboard"],
        childArtifactIds: ["artifact-qa"],
        childBugReportIds: ["bug-dashboard-p1"],
        recommendedNextAction: "Refresh Mission Summary after Worker Runner processes the job",
      },
      logs: [],
      metadata: {
        queueWrapper: true,
        jobId: "job-queued-123",
        jobType: "qa.dry_run",
      },
      created_at: now,
      updated_at: now,
    },
    ...dashboard.recentWorkerRuns,
  ],
  qaRuns: dashboard.recentQaRuns,
  bugs: dashboard.recentBugs,
  approvals: [
    {
      id: "approval-release",
      mission_id: "mission-0001-ai-novelist-chapter-review",
      type: "PRODUCTION_DEPLOY",
      status: "pending",
      reason: "Release review",
      payload: {},
      created_at: now,
    },
  ],
  qaReportArtifact: dashboard.recentArtifacts[0]!,
  bugsJsonArtifact: {
    ...dashboard.recentArtifacts[0]!,
    id: "artifact-bugs-json",
    type: "bugs_json",
    path: "missions/mission-0001-ai-novelist-chapter-review/bugs.json",
    content: "[]",
  },
  codexCommandArtifact: {
    ...dashboard.recentArtifacts[0]!,
    id: "artifact-codex-command",
    type: "codex_command",
    path: "missions/mission-0001-ai-novelist-chapter-review/codex-command.sh",
    content: "codex exec",
  },
  fixMissionArtifact: {
    ...dashboard.recentArtifacts[0]!,
    id: "artifact-fix-mission",
    type: "fix_mission",
    path: "missions/mission-0001-ai-novelist-chapter-review/fix-mission.md",
    content: "Fix mission",
  },
  fixCodexCommandArtifact: {
    ...dashboard.recentArtifacts[0]!,
    id: "artifact-fix-command",
    type: "fix_codex_command",
    path: "missions/mission-0001-ai-novelist-chapter-review/fix-codex-command.sh",
    content: "codex fix",
  },
  recommendedNextAction: "Review QA report and approve release",
};

const dryRunResponse: DryRunActionResponse = {
  missionId: "mission-0001-ai-novelist-chapter-review",
  projectId: "ai-novelist",
  mode: "dry-run",
  dryRun: true,
  realCodexExecuted: false,
  realExternalCall: false,
  realPush: false,
  realDeploy: false,
  generatedArtifacts: ["missions/mission-0001-ai-novelist-chapter-review/qa-report.md"],
  workerRunIds: ["worker-run-dashboard"],
  qaRunIds: ["qa-run-dashboard"],
  bugIds: ["bug-dashboard-p1"],
  eventIds: ["event-created"],
  recommendedNextAction: "Review QA report and approve release",
};

const queuedActionResponse: DryRunActionResponse = {
  accepted: true,
  executionMode: "queued",
  workerRunId: "queue-wrapper-run",
  jobId: "job-queued-123",
  missionId: "mission-0001-ai-novelist-chapter-review",
  projectId: "ai-novelist",
  status: "queued",
  recommendedNextAction: "Start Worker Runner, then refresh Mission Summary.",
};

describe("orchestrator API client", () => {
  it("only sends configured token on write requests without leaking token values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => dashboard })
      .mockResolvedValueOnce({ ok: true, json: async () => missionSummary })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const client = createOrchestratorClient({
      baseUrl: "http://api.local/",
      token: "super-secret-token",
      fetchImpl: fetchMock,
    });

    await client.getDashboard();
    await client.getMissionSummary("mission-0001-ai-novelist-chapter-review");
    await client.runIntegrationDryRun("github", { mission: { missionId: "mission-1" } });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://api.local/dashboard", {
      headers: {},
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://api.local/missions/mission-0001-ai-novelist-chapter-review/summary", {
      headers: {},
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://api.local/integrations/github/dry-run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer super-secret-token",
      },
      body: JSON.stringify({ mission: { missionId: "mission-1" } }),
    });
  });

  it("calls mission qa dry-run action with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dryRunResponse,
    });
    const client = createOrchestratorClient({
      baseUrl: "http://api.local",
      token: "hub-token",
      fetchImpl: fetchMock,
    });

    await client.runMissionAction("mission-1", "qa-dry-run", { withSampleBug: true });

    expect(fetchMock).toHaveBeenCalledWith("http://api.local/missions/mission-1/actions/qa-dry-run", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer hub-token" },
      body: JSON.stringify({ withSampleBug: true }),
    });
  });

  it("fetches queue status through Orchestrator API only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => queueStatus,
    });
    const client = createOrchestratorClient({
      baseUrl: "http://api.local",
      token: "hub-token",
      fetchImpl: fetchMock,
    });

    await client.getQueueStatus();

    expect(fetchMock).toHaveBeenCalledWith("http://api.local/queues/status", {
      headers: {},
    });
  });

  it("calls worker-run cancel and retry through protected Orchestrator APIs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "queued" }),
    });
    const client = createOrchestratorClient({
      baseUrl: "http://api.local",
      token: "hub-token",
      fetchImpl: fetchMock,
    });

    await client.cancelWorkerRun("queue-wrapper-run");
    await client.retryWorkerRun("queue-wrapper-run");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://api.local/worker-runs/queue-wrapper-run/cancel", {
      method: "POST",
      headers: { authorization: "Bearer hub-token" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://api.local/worker-runs/queue-wrapper-run/retry", {
      method: "POST",
      headers: { authorization: "Bearer hub-token" },
    });
  });

  it("calls ai novelist demo dry-run with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dryRunResponse,
    });
    const client = createOrchestratorClient({
      baseUrl: "http://api.local",
      token: "hub-token",
      fetchImpl: fetchMock,
    });

    await client.runAiNovelistDemo({ withSampleBug: true });

    expect(fetchMock).toHaveBeenCalledWith("http://api.local/demo/ai-novelist", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer hub-token" },
      body: JSON.stringify({ withSampleBug: true }),
    });
  });

  it("shows a local-token hint for protected dry-run requests without printing a token", async () => {
    const fetchMock = vi.fn();
    const client = createOrchestratorClient({
      baseUrl: "http://api.local",
      token: "",
      fetchImpl: fetchMock,
    });

    await expect(client.runMissionAction("mission-1", "qa-dry-run")).rejects.toMatchObject({
      name: "OrchestratorApiError",
      status: 401,
      code: "TOKEN_REQUIRED",
      message: "Set VITE_PSF_API_TOKEN to a local Orchestrator bearer token before running protected dry-run actions.",
    } satisfies Partial<OrchestratorApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns sanitized API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ code: "NOT_FOUND", message: "Mission missing super-secret-token" }),
    });
    const client = createOrchestratorClient({
      baseUrl: "http://api.local",
      token: "super-secret-token",
      fetchImpl: fetchMock,
    });

    await expect(client.getMissionSummary("missing")).rejects.toMatchObject({
      name: "OrchestratorApiError",
      status: 404,
      message: "Mission missing [redacted]",
    } satisfies Partial<OrchestratorApiError>);
  });
});

describe("App wiring", () => {
  it("runs QA dry-run with sample bug from the mounted Mission Detail button and refreshes summary", async () => {
    const missionId = "mission-0001-ai-novelist-chapter-review";
    const client = createMockClient({
      getMissionSummary: vi.fn().mockResolvedValue(missionSummary),
      runMissionAction: vi.fn().mockResolvedValue(dryRunResponse),
    });
    const mounted = await renderMountedApp(client, appMissionDetailHash);

    await act(async () => {
      findDomButtonByText(mounted.container, "Run QA dry-run with Sample Bug").click();
      await flushReactWork();
    });

    expect(client.runMissionAction).toHaveBeenCalledWith(missionId, "qa-dry-run", { withSampleBug: true });
    expect(client.getMissionSummary).toHaveBeenCalledTimes(2);
    expect(client.getMissionSummary).toHaveBeenNthCalledWith(1, missionId);
    expect(client.getMissionSummary).toHaveBeenNthCalledWith(2, missionId);

    await act(async () => mounted.root.unmount());
    mounted.cleanup();
  });

  it("shows queued action accepted details after a mounted Mission Detail action", async () => {
    const missionId = "mission-0001-ai-novelist-chapter-review";
    const client = createMockClient({
      getMissionSummary: vi.fn().mockResolvedValue(missionSummary),
      runMissionAction: vi.fn().mockResolvedValue(queuedActionResponse),
    });
    const mounted = await renderMountedApp(client, appMissionDetailHash);

    await act(async () => {
      findDomButtonByText(mounted.container, "Run QA dry-run").click();
      await flushReactWork();
    });

    expect(client.runMissionAction).toHaveBeenCalledWith(missionId, "qa-dry-run", {});
    expect(mounted.container.textContent).toContain("accepted");
    expect(mounted.container.textContent).toContain("job-queued-123");
    expect(mounted.container.textContent).toContain("queue-wrapper-run");

    await act(async () => mounted.root.unmount());
    mounted.cleanup();
  });

  it("reuses the default Orchestrator client across dashboard state re-renders", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => dashboard })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => queueStatus });
    vi.stubGlobal("fetch", fetchMock);
    const mounted = await renderMountedApp(undefined, "#dashboard");

    await act(async () => {
      await flushReactWork();
      await flushReactWork();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => mounted.root.unmount());
    mounted.cleanup();
  });
  it("keeps Dashboard usable when queue status fetch fails", async () => {
    const client = createMockClient({
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      getQueueStatus: vi.fn().mockRejectedValue(new Error("Redis is not reachable")),
    });
    const mounted = await renderMountedApp(client, "#dashboard");

    await act(async () => {
      await flushReactWork();
    });

    expect(mounted.container.textContent).toContain("Dashboard");
    expect(mounted.container.textContent).toContain("Queue Runtime");
    expect(mounted.container.textContent).toContain("Redis is not reachable");

    await act(async () => mounted.root.unmount());
    mounted.cleanup();
  });
});

describe("Hub render helpers", () => {
  it("renders dashboard metrics, recent rows, integrations, and next actions", () => {
    const text = textFromElement(renderDashboardView({
      state: { status: "success", data: dashboard },
      queueState: { status: "success", data: queueStatus },
      actions: {
        onRunDemo: vi.fn(),
        onRefresh: vi.fn(),
      },
      actionState: { loading: "", message: "", error: "" },
    }));

    expect(text).toContain("Missions");
    expect(text).toContain("Generate ai-novelist Demo dry-run");
    expect(text).toContain("Generate ai-novelist Demo with Sample Bug dry-run");
    expect(text).toContain("Refresh Dashboard");
    expect(text).toContain("8 total");
    expect(text).toContain("2 running");
    expect(text).toContain("3 ready_for_review");
    expect(text).toContain("QA");
    expect(text).toContain("Latest key artifact");
    expect(text).toContain("Health signals");
    expect(text).toContain("1 worker run failed recently");
    expect(text).toContain("Recent Artifacts");
    expect(text).toContain("artifact-qa");
    expect(text).toContain("AI Novelist chapter review");
    expect(text).toContain("Chapter review blocks ready state");
    expect(text).toContain("Review open P0/P1 bugs");
    expect(text).toContain("Queue Runtime");
    expect(text).toContain("bullmq");
    expect(text).toContain("4 queued");
    expect(text).toContain("2 active");
    expect(text).toContain("1 failed");
    expect(text).toContain("psf:worker-jobs");
  });

  it("renders queue warning without breaking dashboard content", () => {
    const text = textFromElement(renderDashboardView({
      state: { status: "success", data: dashboard },
      queueState: { status: "error", message: "Redis is not reachable without leaking super-secret-token" },
    }));

    expect(text).toContain("Queue Runtime");
    expect(text).toContain("Queue status unavailable");
    expect(text).toContain("Redis is not reachable");
    expect(text).not.toContain("super-secret-token");
  });

  it("renders mission detail with all highlighted operational resources", () => {
    const text = textFromElement(renderMissionDetailView({
      state: { status: "success", data: missionSummary },
      actions: {
        onRunAction: vi.fn(),
        onRefresh: vi.fn(),
      },
      actionState: { loading: "", message: "", error: "" },
    }));

    expect(text).toContain("mission-0001-ai-novelist-chapter-review");
    expect(text).toContain("Plan Mission dry-run");
    expect(text).toContain("Generate Codex dry-run");
    expect(text).toContain("Run QA dry-run");
    expect(text).toContain("Run QA dry-run with Sample Bug");
    expect(text).toContain("Run Fix dry-run");
    expect(text).toContain("Run Full Loop dry-run");
    expect(text).toContain("Refresh Summary");
    expect(text).toContain("Mission events");
    expect(text).toContain("QA Report");
    expect(text).toContain("bugs.json");
    expect(text).toContain("BugReport");
    expect(text).toContain("WorkerRun");
    expect(text).toContain("QARun");
    expect(text).toContain("Artifact");
    expect(text).toContain("Approval");
    expect(text).toContain("codex-command.sh");
    expect(text).toContain("fix-mission.md");
    expect(text).toContain("fix-codex-command.sh");
    expect(text).toContain("Review QA report and approve release");
    expect(text).toContain("Queue wrapper");
    expect(text).toContain("job-queued-123");
    expect(text).toContain("qa.dry_run");
    expect(text).toContain("Child WorkerRuns");
    expect(text).toContain("worker-run-dashboard");
    expect(text).toContain("Unit test failed");
  });

  it("renders integration dry-run/mock safety state", () => {
    const text = textFromElement(renderIntegrationsView({
      state: { status: "success", data: dashboard.integrationStatuses },
    }));

    expect(text).toContain("github");
    expect(text).toContain("coolify");
    expect(text).toContain("uptime-kuma");
    expect(text).toContain("plane");
    expect(text).toContain("dry-run");
    expect(text).toContain("No real network calls");
  });

  it("renders clear empty and unavailable states", () => {
    const emptyText = textFromElement(renderDashboardView({
      state: {
        status: "success",
        data: {
          ...dashboard,
          metrics: { ...dashboard.metrics, missionCount: 0, bugCount: 0, workerRunCount: 0, artifactCount: 0 },
          recentMissions: [],
          recentBugs: [],
          recentWorkerRuns: [],
          recentQaRuns: [],
          recentArtifacts: [],
          recommendedNextActions: [],
        },
      },
    }));
    const errorText = textFromElement(renderDashboardView({
      state: { status: "error", message: "GET /dashboard returned 404" },
    }));

    expect(emptyText).toContain("No missions yet");
    expect(emptyText).toContain("No recommended actions");
    expect(errorText).toContain("API unavailable");
    expect(errorText).toContain("GET /dashboard returned 404");
  });

  it("clicks dashboard dry-run buttons with the expected payload choices", async () => {
    const onRunDemo = vi.fn();
    const onRefresh = vi.fn();
    const view = renderDashboardView({
      state: { status: "success", data: dashboard },
      actions: { onRunDemo, onRefresh },
      actionState: { loading: "", message: "Dry-run completed through Orchestrator API", error: "" },
    });

    await findButtonByText(view, "Generate ai-novelist Demo dry-run").props.onClick?.();
    await findButtonByText(view, "Generate ai-novelist Demo with Sample Bug dry-run").props.onClick?.();
    await findButtonByText(view, "Refresh Dashboard").props.onClick?.();

    expect(onRunDemo).toHaveBeenNthCalledWith(1, false);
    expect(onRunDemo).toHaveBeenNthCalledWith(2, true);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(textFromElement(view)).toContain("Dry-run completed through Orchestrator API");
  });

  it("clicks mission dry-run buttons with expected actions and sample bug payload", async () => {
    const onRunAction = vi.fn();
    const onRefresh = vi.fn();
    const view = renderMissionDetailView({
      state: { status: "success", data: missionSummary },
      actions: { onRunAction, onRefresh },
      actionState: { loading: "", message: "", error: "" },
    });

    await findButtonByText(view, "Plan Mission dry-run").props.onClick?.();
    await findButtonByText(view, "Generate Codex dry-run").props.onClick?.();
    await findButtonByText(view, "Run QA dry-run").props.onClick?.();
    await findButtonByText(view, "Run QA dry-run with Sample Bug").props.onClick?.();
    await findButtonByText(view, "Run Fix dry-run").props.onClick?.();
    await findButtonByText(view, "Run Full Loop dry-run").props.onClick?.();
    await findButtonByText(view, "Refresh Summary").props.onClick?.();

    expect(onRunAction).toHaveBeenNthCalledWith(1, "plan" satisfies MissionDryRunAction, {});
    expect(onRunAction).toHaveBeenNthCalledWith(2, "codex-dry-run" satisfies MissionDryRunAction, {});
    expect(onRunAction).toHaveBeenNthCalledWith(3, "qa-dry-run" satisfies MissionDryRunAction, {});
    expect(onRunAction).toHaveBeenNthCalledWith(4, "qa-dry-run" satisfies MissionDryRunAction, { withSampleBug: true });
    expect(onRunAction).toHaveBeenNthCalledWith(5, "fix-dry-run" satisfies MissionDryRunAction, {});
    expect(onRunAction).toHaveBeenNthCalledWith(6, "loop-dry-run" satisfies MissionDryRunAction, {});
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("renders loading and error state for dry-run actions without leaking tokens", () => {
    const loadingView = renderMissionDetailView({
      state: { status: "success", data: missionSummary },
      actions: { onRunAction: vi.fn(), onRefresh: vi.fn() },
      actionState: { loading: "qa-dry-run", message: "", error: "" },
    });
    const errorView = renderMissionDetailView({
      state: { status: "success", data: missionSummary },
      actions: { onRunAction: vi.fn(), onRefresh: vi.fn() },
      actionState: {
        loading: "",
        message: "",
        error: "Set VITE_PSF_API_TOKEN to a local Orchestrator bearer token before running protected dry-run actions.",
      },
    });

    expect(findButtonByText(loadingView, "Run QA dry-run").props.disabled).toBe(true);
    expect(textFromElement(loadingView)).toContain("Running qa-dry-run");
    expect(textFromElement(errorView)).toContain("Set VITE_PSF_API_TOKEN");
    expect(textFromElement(errorView)).not.toContain("super-secret-token");
  });

  it("does not render configured token values", () => {
    const text = textFromElement(renderTokenSafetyProbe("super-secret-token", dashboard));

    expect(text).not.toContain("super-secret-token");
    expect(text).toContain("Token configured");
  });
});
