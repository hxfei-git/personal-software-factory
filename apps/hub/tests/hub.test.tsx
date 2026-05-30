import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import {
  OrchestratorApiError,
  createOrchestratorClient,
} from "../src/api/client";
import type {
  DashboardResponse,
  IntegrationStatus,
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
  healthSignals: ["1 worker run failed recently"],
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

describe("orchestrator API client", () => {
  it("sends configured token on GET and POST requests without leaking token values", async () => {
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
      headers: { authorization: "Bearer super-secret-token" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://api.local/missions/mission-0001-ai-novelist-chapter-review/summary", {
      headers: { authorization: "Bearer super-secret-token" },
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
    const text = textFromElement(renderDashboardView({ state: { status: "success", data: dashboard } }));

    expect(text).toContain("Missions");
    expect(text).toContain("8 total");
    expect(text).toContain("2 running");
    expect(text).toContain("3 ready_for_review");
    expect(text).toContain("QA");
    expect(text).toContain("Latest key artifact");
    expect(text).toContain("artifact-qa");
    expect(text).toContain("AI Novelist chapter review");
    expect(text).toContain("Chapter review blocks ready state");
    expect(text).toContain("Review open P0/P1 bugs");
  });

  it("renders mission detail with all highlighted operational resources", () => {
    const text = textFromElement(renderMissionDetailView({ state: { status: "success", data: missionSummary } }));

    expect(text).toContain("mission-0001-ai-novelist-chapter-review");
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

  it("does not render configured token values", () => {
    const text = textFromElement(renderTokenSafetyProbe("super-secret-token", dashboard));

    expect(text).not.toContain("super-secret-token");
    expect(text).toContain("Token configured");
  });
});
