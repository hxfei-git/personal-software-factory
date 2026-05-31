import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import {
  OrchestratorApiError,
  createOrchestratorClient,
} from "../src/api/client";
import type {
  DashboardResponse,
  DryRunActionResponse,
  IntegrationStatus,
  MissionDryRunAction,
  MissionSummaryResponse,
} from "../src/api/types";
import {
  renderDashboardView,
  renderIntegrationsView,
  renderMissionDetailView,
  renderTokenSafetyProbe,
} from "../src/App";

const now = "2026-05-31T00:00:00.000Z";

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
  workerRuns: dashboard.recentWorkerRuns,
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

describe("Hub render helpers", () => {
  it("renders dashboard metrics, recent rows, integrations, and next actions", () => {
    const text = textFromElement(renderDashboardView({
      state: { status: "success", data: dashboard },
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
