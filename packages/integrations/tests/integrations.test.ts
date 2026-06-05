import { describe, expect, it } from "vitest";
import {
  createCoolifyAdapter,
  createGithubAdapter,
  createPlaneAdapter,
  createUptimeKumaAdapter,
  getIntegrationAdapter,
  listIntegrationStatuses,
  runCoolifyDryRun,
  runCoolifyReal,
  runGitHubDryRun,
  runGitHubReal,
  runIntegrationDryRun,
  runPlaneDryRun,
  runPlaneReal,
  runUptimeKumaDryRun,
  runUptimeKumaReal,
  type IntegrationTransport,
  type IntegrationTransportRequest,
  type IntegrationTransportResponse,
} from "../src/index.js";
import { buildRealResult } from "../src/github-real.js";

const fixedNow = "2026-05-31T12:00:00.000Z";

const missionInput = {
  missionId: "mission-001",
  missionTitle: "发布任务看板",
  missionSummary: "为 Hub 增加任务看板的只读视图。",
  project: "personal-software-factory",
  branchName: "psf/mission-001-hub-board",
  acceptanceCriteria: ["展示任务列表", "失败任务可查看 QA 证据"],
  devSummary: "新增 Hub board 页面骨架和数据映射。",
  qaReport: "Playwright smoke 通过，覆盖任务列表加载。",
  bugFixSummary: "修复空任务列表渲染。",
  artifacts: ["artifacts/mission-001/dev-summary.md", "artifacts/mission-001/qa-report.md"],
  workerRuns: [
    { id: "worker-run-1", worker: "codex", status: "succeeded", summary: "完成开发 dry-run。" },
    { id: "worker-run-2", worker: "qa", status: "succeeded", summary: "完成 QA dry-run。" },
  ],
  risks: ["真实发布前需要人工复核部署环境。"],
  requiresHumanApproval: true,
};

function textOf(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function createTransport(responses: IntegrationTransportResponse[] | ((request: IntegrationTransportRequest) => IntegrationTransportResponse | Promise<IntegrationTransportResponse>)): {
  calls: IntegrationTransportRequest[];
  transport: IntegrationTransport;
} {
  const calls: IntegrationTransportRequest[] = [];
  let index = 0;

  return {
    calls,
    transport: async (request) => {
      calls.push(request);

      if (typeof responses === "function") {
        return responses(request);
      }

      return responses[index++] ?? { status: 500, json: { message: "missing test response" } };
    },
  };
}

describe("integration dry-run adapters", () => {
  it("returns all statuses as safe dry-run entries when no tokens are configured", () => {
    const statuses = listIntegrationStatuses({ env: {}, now: fixedNow });

    expect(statuses.map((status) => status.name)).toEqual(["github", "coolify", "uptime_kuma", "plane"]);
    expect(statuses.map((status) => status.externalName)).toEqual(["github", "coolify", "uptime-kuma", "plane"]);
    expect(statuses.every((status) => status.configured === false)).toBe(true);
    expect(statuses.every((status) => status.realNetworkCall === false)).toBe(true);
    expect(statuses.every((status) => status.safeToRun === true)).toBe(true);
  });

  it("reports the planned required env names and missing env for unconfigured dry-runs", () => {
    const statuses = listIntegrationStatuses({ env: {}, now: fixedNow });

    expect(statuses.find((status) => status.name === "github")?.requiredEnv).toEqual(["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"]);
    expect(statuses.find((status) => status.name === "coolify")?.requiredEnv).toEqual(["COOLIFY_BASE_URL", "COOLIFY_TOKEN"]);
    expect(statuses.find((status) => status.name === "uptime_kuma")?.requiredEnv).toEqual([
      "UPTIME_KUMA_BASE_URL",
      "UPTIME_KUMA_USERNAME",
      "UPTIME_KUMA_PASSWORD",
    ]);
    expect(statuses.find((status) => status.name === "plane")?.requiredEnv).toEqual([
      "PLANE_BASE_URL",
      "PLANE_API_TOKEN",
      "PLANE_WORKSPACE_ID",
      "PLANE_PROJECT_ID",
    ]);

    const results = [
      runGitHubDryRun({ env: {}, now: fixedNow, mission: missionInput }),
      runCoolifyDryRun({ env: {}, now: fixedNow, deployment: { project: "psf", environment: "production" } }),
      runUptimeKumaDryRun({ env: {}, now: fixedNow, monitor: { project: "psf" } }),
      runPlaneDryRun({ env: {}, now: fixedNow, mission: missionInput, bugs: [] }),
    ];

    expect(results.map((result) => result.missingEnv)).toEqual([
      ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"],
      ["COOLIFY_BASE_URL", "COOLIFY_TOKEN"],
      ["UPTIME_KUMA_BASE_URL", "UPTIME_KUMA_USERNAME", "UPTIME_KUMA_PASSWORD"],
      ["PLANE_BASE_URL", "PLANE_API_TOKEN", "PLANE_WORKSPACE_ID", "PLANE_PROJECT_ID"],
    ]);

    for (const result of results) {
      expect(result.configured).toBe(false);
      expect(result.safeToRun).toBe(true);
      expect(result.realNetworkCall).toBe(false);
      expect(result.status.configured).toBe(false);
    }
  });

  it("does not enable real network calls when ENABLE_REAL flags are 0", () => {
    const env = {
      ENABLE_REAL_GITHUB: "0",
      ENABLE_REAL_COOLIFY: "0",
      ENABLE_REAL_UPTIME_KUMA: "0",
      ENABLE_REAL_PLANE: "0",
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "hxfei-git",
      GITHUB_REPO: "ai-novelist",
      COOLIFY_TOKEN: "coolify-secret",
      COOLIFY_BASE_URL: "https://coolify.example.test",
      UPTIME_KUMA_BASE_URL: "https://uptime.example.test",
      UPTIME_KUMA_USERNAME: "ops",
      UPTIME_KUMA_PASSWORD: "kuma-secret",
      PLANE_BASE_URL: "https://plane.example.test",
      PLANE_API_TOKEN: "plane-secret",
      PLANE_WORKSPACE_ID: "factory",
      PLANE_PROJECT_ID: "hub",
    };

    const statuses = listIntegrationStatuses({ env, now: fixedNow });

    expect(statuses.every((status) => status.realEnabled === false)).toBe(true);
    expect(statuses.every((status) => status.realNetworkCall === false)).toBe(true);
  });

  it("records realEnabled but still never performs real network calls when ENABLE_REAL flags are 1", () => {
    const env = {
      ENABLE_REAL_GITHUB: "1",
      ENABLE_REAL_COOLIFY: "1",
      ENABLE_REAL_UPTIME_KUMA: "1",
      ENABLE_REAL_PLANE: "1",
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "hxfei-git",
      GITHUB_REPO: "ai-novelist",
      COOLIFY_TOKEN: "coolify-secret",
      COOLIFY_BASE_URL: "https://coolify.example.test",
      UPTIME_KUMA_BASE_URL: "https://uptime.example.test",
      UPTIME_KUMA_USERNAME: "ops",
      UPTIME_KUMA_PASSWORD: "kuma-secret",
      PLANE_BASE_URL: "https://plane.example.test",
      PLANE_API_TOKEN: "plane-secret",
      PLANE_WORKSPACE_ID: "factory",
      PLANE_PROJECT_ID: "hub",
    };

    const results = [
      runGitHubDryRun({ env, now: fixedNow, mission: missionInput }),
      runCoolifyDryRun({ env, now: fixedNow, deployment: { project: "psf", environment: "staging" } }),
      runUptimeKumaDryRun({ env, now: fixedNow, monitor: { project: "psf", stagingUrl: "https://staging.example.test" } }),
      runPlaneDryRun({ env, now: fixedNow, mission: missionInput, bugs: [] }),
    ];

    expect(results.every((result) => result.realEnabled === true)).toBe(true);
    expect(results.every((result) => result.realNetworkCall === false)).toBe(true);
    expect(results.every((result) => result.configured === true)).toBe(true);
  });

  it("does not leak GitHub tokens in statuses or dry-run outputs", () => {
    const env = { ENABLE_REAL_GITHUB: "1", GITHUB_TOKEN: "ghp_top_secret" };

    const result = runGitHubDryRun({ env, now: fixedNow, mission: missionInput });

    expect(textOf(result)).not.toContain("ghp_top_secret");
  });

  it("does not leak Coolify tokens in statuses or dry-run outputs", () => {
    const env = {
      ENABLE_REAL_COOLIFY: "1",
      COOLIFY_TOKEN: "coolify_top_secret",
      COOLIFY_BASE_URL: "https://coolify.example.test",
    };

    const result = runCoolifyDryRun({ env, now: fixedNow, deployment: { project: "psf", environment: "production" } });

    expect(textOf(result)).not.toContain("coolify_top_secret");
  });

  it("does not leak Uptime Kuma passwords in statuses or dry-run outputs", () => {
    const env = {
      ENABLE_REAL_UPTIME_KUMA: "1",
      UPTIME_KUMA_BASE_URL: "https://uptime.example.test",
      UPTIME_KUMA_USERNAME: "ops",
      UPTIME_KUMA_PASSWORD: "kuma_top_secret",
    };

    const result = runUptimeKumaDryRun({ env, now: fixedNow, monitor: { project: "psf", productionUrl: "https://prod.example.test" } });

    expect(textOf(result)).not.toContain("kuma_top_secret");
  });

  it("does not leak Plane tokens in statuses or dry-run outputs", () => {
    const env = {
      ENABLE_REAL_PLANE: "1",
      PLANE_BASE_URL: "https://plane.example.test",
      PLANE_API_TOKEN: "plane_top_secret",
      PLANE_WORKSPACE_ID: "factory",
      PLANE_PROJECT_ID: "hub",
    };

    const result = runPlaneDryRun({ env, now: fixedNow, mission: missionInput, bugs: [] });

    expect(textOf(result)).not.toContain("plane_top_secret");
  });

  it("builds a complete GitHub PR body for human review", () => {
    const result = runGitHubDryRun({ env: {}, now: fixedNow, mission: missionInput });
    const pr = result.outputs.pullRequest as { body: string };

    expect(pr.body).toContain("Mission 摘要");
    expect(pr.body).toContain("Project");
    expect(pr.body).toContain("Branch");
    expect(pr.body).toContain("验收标准");
    expect(pr.body).toContain("Dev Summary 摘要");
    expect(pr.body).toContain("QA Report 摘要");
    expect(pr.body).toContain("Bug 修复摘要");
    expect(pr.body).toContain("Artifact 列表");
    expect(pr.body).toContain("WorkerRun 摘要");
    expect(pr.body).toContain("风险点");
    expect(pr.body).toContain("是否需要人工确认");
    expect(pr.body).toContain("Dry-run 标记");
  });


  it("does not leak Uptime Kuma session tokens when a post-login transport error includes headers", async () => {
    const sessionToken = "runtime-session-token-must-not-leak";
    const { transport } = createTransport(async (request) => {
      if (request.url.endsWith("/api/login")) {
        return { status: 200, ok: true, json: { token: sessionToken } };
      }

      throw new Error(`request failed with Authorization: ${request.headers?.authorization}`);
    });

    const result = await runUptimeKumaReal({
      env: {
        ENABLE_REAL_UPTIME_KUMA: "1",
        UPTIME_KUMA_BASE_URL: "https://uptime.example.test",
        UPTIME_KUMA_USERNAME: "ops",
        UPTIME_KUMA_PASSWORD: "kuma-password",
      },
      now: fixedNow,
      monitor: { project: "psf", productionUrl: "https://prod.example.test" },
      gates: { allowNetwork: true },
      transport,
    });

    expect(result.realNetworkCall).toBe(true);
    expect(textOf(result)).not.toContain(sessionToken);
    expect(textOf(result)).not.toContain(`Bearer ${sessionToken}`);
    expect(textOf(result)).not.toContain("kuma-password");
  });

  it("does not leak Uptime Kuma session tokens when a post-login provider failure echoes headers", async () => {
    const sessionToken = "runtime-session-token-in-provider-body";
    const { transport } = createTransport(async (request) => {
      if (request.url.endsWith("/api/login")) {
        return { status: 200, ok: true, json: { token: sessionToken } };
      }

      return {
        status: 500,
        ok: false,
        json: { message: `provider saw Authorization: ${request.headers?.authorization}` },
      };
    });

    const result = await runUptimeKumaReal({
      env: {
        ENABLE_REAL_UPTIME_KUMA: "1",
        UPTIME_KUMA_BASE_URL: "https://uptime.example.test",
        UPTIME_KUMA_USERNAME: "ops",
        UPTIME_KUMA_PASSWORD: "kuma-password",
      },
      now: fixedNow,
      monitor: { project: "psf", productionUrl: "https://prod.example.test" },
      gates: { allowNetwork: true },
      transport,
    });

    expect(result.realNetworkCall).toBe(true);
    expect(textOf(result)).not.toContain(sessionToken);
    expect(textOf(result)).not.toContain(`Bearer ${sessionToken}`);
    expect(textOf(result)).not.toContain("kuma-password");
  });

  it("maps uptime-kuma external names to the uptime_kuma adapter", () => {
    expect(getIntegrationAdapter("uptime-kuma").name).toBe("uptime_kuma");
    expect(getIntegrationAdapter("uptime_kuma").name).toBe("uptime_kuma");
  });

  it("scrubs secret-like URL query params, URL userinfo, and secret-like object keys", () => {
    const result = runUptimeKumaDryRun({
      env: {},
      now: fixedNow,
      monitor: {
        project: "psf",
        stagingUrl: "https://deploy:staging-password@x.test/health?token=query-token&api_key=query-key&safe=ok",
      },
    });

    const text = textOf(result);

    expect(text).not.toContain("deploy:staging-password");
    expect(text).not.toContain("staging-password");
    expect(text).not.toContain("query-token");
    expect(text).not.toContain("query-key");
    expect(text).toContain("safe=ok");
    expect(text).toContain("[REDACTED]");
  });

  it("scrubs secret-like assignments in user supplied text", () => {
    const result = runGitHubDryRun({
      env: {},
      now: fixedNow,
      mission: {
        ...missionInput,
        missionSummary: "token=plain-token password: plain-password apiKey=plain-key",
      },
    });

    const text = textOf(result);

    expect(text).not.toContain("plain-token");
    expect(text).not.toContain("plain-password");
    expect(text).not.toContain("plain-key");
  });

  it("scrubs complete Authorization bearer assignment values in user supplied text", () => {
    const result = runGitHubDryRun({
      env: {},
      now: fixedNow,
      mission: {
        ...missionInput,
        missionSummary: "Authorization: Bearer raw-bearer-secret\nauthorization=Bearer raw-equals-secret",
      },
    });

    const text = textOf(result);

    expect(text).toContain("Authorization: [REDACTED]");
    expect(text).toContain("authorization=[REDACTED]");
    expect(text).not.toContain("raw-bearer-secret");
    expect(text).not.toContain("raw-equals-secret");
    expect(text).not.toContain("Bearer raw");
  });

  it("scrubs secret-like bug evidence fields and keeps an evidence summary on Plane bug issues", () => {
    const result = runPlaneDryRun({
      env: {},
      now: fixedNow,
      mission: missionInput,
      bugs: [{
        id: "bug-001",
        title: "部署状态泄露",
        evidence: {
          apiToken: "bug-api-token",
          password: "bug-password",
          cookie: "bug-cookie",
          logUrl: "https://qa:qa-password@evidence.test/logs?secret=bug-secret&trace=visible",
          screenshot: "artifacts/bug-001/screenshot.png",
        },
      }],
    });

    const bugIssue = result.outputs.bugIssues[0];
    const text = textOf(result);

    expect(bugIssue?.evidenceSummary).toContain("screenshot");
    expect(bugIssue?.evidenceSummary).toContain("trace=visible");
    expect(text).not.toContain("bug-api-token");
    expect(text).not.toContain("bug-password");
    expect(text).not.toContain("bug-cookie");
    expect(text).not.toContain("bug-secret");
    expect(text).not.toContain("qa:qa-password");
  });

  it("returns provider-specific output types from adapters and discriminated union dry-runs", () => {
    const github = createGithubAdapter().dryRun({ env: {}, now: fixedNow, mission: missionInput });
    const coolify = createCoolifyAdapter().dryRun({ env: {}, now: fixedNow, deployment: { project: "psf", environment: "production" } });
    const uptimeKuma = createUptimeKumaAdapter().dryRun({ env: {}, now: fixedNow, monitor: { project: "psf" } });
    const plane = createPlaneAdapter().dryRun({ env: {}, now: fixedNow, mission: missionInput, bugs: [] });
    const union = runIntegrationDryRun("github", { env: {}, now: fixedNow, mission: missionInput });

    expect(github.outputs.pullRequest.body).toContain("Mission 摘要");
    expect(coolify.outputs.deployRequest.requiresApproval).toBe(true);
    expect(uptimeKuma.outputs.monitorConfig.type).toBe("http");
    expect(plane.outputs.missionIssue.title).toContain("[Mission]");

    if (union.name === "github") {
      expect(union.outputs.simulatedPullRequest.status).toBe("simulated");
    }
  });
});


describe("gated real integration adapters", () => {
  const configuredEnv = {
    ENABLE_REAL_GITHUB: "1",
    ENABLE_REAL_COOLIFY: "1",
    ENABLE_REAL_UPTIME_KUMA: "1",
    ENABLE_REAL_PLANE: "1",
    GITHUB_TOKEN: "ghp_real_secret",
    GITHUB_OWNER: "hxfei-git",
    GITHUB_REPO: "personal-software-factory",
    COOLIFY_TOKEN: "coolify_real_secret",
    COOLIFY_BASE_URL: "https://coolify.example.test",
    UPTIME_KUMA_BASE_URL: "https://uptime.example.test",
    UPTIME_KUMA_USERNAME: "ops",
    UPTIME_KUMA_PASSWORD: "kuma_real_secret",
    PLANE_BASE_URL: "https://plane.example.test",
    PLANE_API_TOKEN: "plane_real_secret",
    PLANE_WORKSPACE_ID: "factory",
    PLANE_PROJECT_ID: "hub",
  };

  it("returns manual-action guidance with no network when real mode is disabled", async () => {
    const calls: IntegrationTransportRequest[] = [];
    const transport: IntegrationTransport = async (request) => {
      calls.push(request);
      return { status: 200, json: {} };
    };
    const disabledEnv = {
      ...configuredEnv,
      ENABLE_REAL_GITHUB: "0",
      ENABLE_REAL_COOLIFY: "0",
      ENABLE_REAL_UPTIME_KUMA: "0",
      ENABLE_REAL_PLANE: "0",
    };
    const unsetEnv: Record<string, string | undefined> = {
      ...configuredEnv,
      ENABLE_REAL_GITHUB: undefined,
      ENABLE_REAL_COOLIFY: undefined,
      ENABLE_REAL_UPTIME_KUMA: undefined,
      ENABLE_REAL_PLANE: undefined,
    };

    for (const env of [disabledEnv, unsetEnv]) {
      const results = await Promise.all([
        runGitHubReal({ env, now: fixedNow, mission: missionInput, transport }),
        runCoolifyReal({ env, now: fixedNow, deployment: { project: "psf", environment: "staging" }, transport }),
        runUptimeKumaReal({ env, now: fixedNow, monitor: { project: "psf", stagingUrl: "https://staging.example.test" }, transport }),
        runPlaneReal({ env, now: fixedNow, mission: missionInput, bugs: [], transport }),
      ]);

      for (const result of results) {
        expect(result.realEnabled).toBe(false);
        expect(result.realNetworkCall).toBe(false);
        expect(result.safeToRun).toBe(false);
        expect(result.decision).toBe("manual_action");
        expect(result.message).toContain("Manual action");
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
      }
    }
    expect(calls).toHaveLength(0);
  });

  it("runs GitHub push, PR create, PR body update, and QA comment only through injected transport", async () => {
    const { calls, transport } = createTransport([
      { status: 201, json: { ref: "refs/heads/psf/mission-001-hub-board" } },
      { status: 201, json: { number: 42, html_url: "https://github.example.test/pull/42" } },
      { status: 200, json: { html_url: "https://github.example.test/pull/42" } },
      { status: 201, json: { html_url: "https://github.example.test/pull/42#issuecomment-1" } },
    ]);

    const result = await runGitHubReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      qaComment: "QA passed. token=qa-comment-secret",
      sourceSha: "abc123",
      transport,
      gates: {
        allowNetwork: true,
        allowPushBranch: true,
        allowCreatePullRequest: true,
        allowUpdatePullRequestBody: true,
        allowPostQaComment: true,
      },
    });

    expect(result.decision).toBe("succeeded");
    expect(result.realNetworkCall).toBe(true);
    expect(result.outputs.pullRequestUrl).toBe("https://github.example.test/pull/42");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST https://api.github.com/repos/hxfei-git/personal-software-factory/git/refs",
      "POST https://api.github.com/repos/hxfei-git/personal-software-factory/pulls",
      "PATCH https://api.github.com/repos/hxfei-git/personal-software-factory/pulls/42",
      "POST https://api.github.com/repos/hxfei-git/personal-software-factory/issues/42/comments",
    ]);
    expect(calls[0]?.headers?.authorization).toContain("ghp_real_secret");
    expect(textOf(result)).not.toContain("ghp_real_secret");
    expect(textOf(result)).not.toContain("qa-comment-secret");
    expect(textOf(result)).not.toContain("authorization");
  });

  it("refuses protected GitHub branches before transport is called", async () => {
    const { calls, transport } = createTransport([{ status: 201, json: {} }]);

    const result = await runGitHubReal({
      env: configuredEnv,
      now: fixedNow,
      mission: { ...missionInput, branchName: "main" },
      sourceSha: "abc123",
      transport,
      gates: { allowNetwork: true, allowPushBranch: true, allowCreatePullRequest: true },
    });

    expect(result.decision).toBe("manual_action");
    expect(result.realNetworkCall).toBe(false);
    expect(result.message).toContain("protected branch");
    expect(calls).toHaveLength(0);
  });

  it("refuses protected GitHub branches for create-PR-only operations before transport is called", async () => {
    const { calls, transport } = createTransport([{ status: 201, json: { number: 42 } }]);

    const result = await runGitHubReal({
      env: configuredEnv,
      now: fixedNow,
      mission: { ...missionInput, branchName: "main" },
      transport,
      gates: { allowNetwork: true, allowCreatePullRequest: true },
    });

    expect(result.decision).toBe("manual_action");
    expect(result.realNetworkCall).toBe(false);
    expect(result.message).toContain("protected branch");
    expect(calls).toHaveLength(0);
  });

  it("returns a GitHub operation gate blocker when no operation gate is enabled", async () => {
    const { calls, transport } = createTransport([{ status: 201, json: { number: 42 } }]);

    const result = await runGitHubReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      transport,
      gates: { allowNetwork: true },
    });

    expect(result.decision).toBe("manual_action");
    expect(result.message).toContain("operation gate");
    expect(result.message).not.toContain("transport");
    expect(result.realNetworkCall).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "policy.integration.operation_gate_disabled",
        blocks: ["execute"],
        source: "integration",
      }),
    ]));
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["GitHub", (transport: IntegrationTransport) => runGitHubReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      transport,
      gates: { allowNetwork: false },
    })],
    ["Coolify", (transport: IntegrationTransport) => runCoolifyReal({
      env: configuredEnv,
      now: fixedNow,
      deployment: { project: "psf", environment: "staging", stagingUrl: "https://staging.example.test" },
      transport,
      gates: { allowNetwork: false },
    })],
    ["Uptime Kuma", (transport: IntegrationTransport) => runUptimeKumaReal({
      env: configuredEnv,
      now: fixedNow,
      monitor: { project: "psf", stagingUrl: "https://staging.example.test" },
      transport,
      gates: { allowNetwork: false },
    })],
    ["Plane", (transport: IntegrationTransport) => runPlaneReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      bugs: [],
      transport,
      gates: { allowNetwork: false },
    })],
  ])("returns only a network gate blocker for %s when transport is present but allowNetwork is disabled", async (_name, run) => {
    const { calls, transport } = createTransport([{ status: 201, json: { number: 42 } }]);

    const result = await run(transport);

    expect(result.decision).toBe("manual_action");
    expect(result.message).toContain("allowNetwork");
    expect(result.message).not.toContain("transport");
    expect(result.realNetworkCall).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "policy",
        key: "policy.integration.network_gate_disabled",
        blocks: ["execute"],
        source: "integration",
      }),
    ]));
    expect(result.blockers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "execution.integration.injected_transport_missing" }),
    ]));
    expect(calls).toHaveLength(0);
  });

  it("adds an unclassified integration blocker to failed provider results", async () => {
    const { transport } = createTransport([{ status: 422, json: { message: "validation failure" } }]);

    const result = await runGitHubReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      sourceSha: "abc123",
      transport,
      gates: { allowNetwork: true, allowPushBranch: true, allowCreatePullRequest: true },
    });

    expect(result.decision).toBe("failed");
    expect(result.safeToRun).toBe(false);
    expect(result.outputs.manualActions).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "execution",
        key: "execution.integration.unclassified_execution_blocker",
        blocks: ["execute"],
        source: "integration",
        recommendedNextAction: "Inspect the integration adapter output before retrying.",
      }),
    ]));
  });

  it("adds an unclassified blocker when caller-provided blockers are empty for unsafe results", () => {
    const result = buildRealResult(
      {
        name: "github",
        externalName: "github",
        requiredEnv: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"],
        enableRealEnv: "ENABLE_REAL_GITHUB",
      },
      { env: configuredEnv, now: fixedNow },
      {
        decision: "degraded",
        message: "GitHub network unavailable after injected transport failure.",
        outputs: { manualActions: [] },
        safeToRun: false,
        blockers: [],
      },
    );

    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "execution",
        key: "execution.integration.unclassified_execution_blocker",
        blocks: ["execute"],
        source: "integration",
      }),
    ]));
  });

  it("redacts unsafe caller-provided blocker details while preserving allowlisted metadata", () => {
    const jwtLikeValue = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature";

    const result = buildRealResult(
      {
        name: "github",
        externalName: "github",
        requiredEnv: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"],
        enableRealEnv: "ENABLE_REAL_GITHUB",
      },
      { env: configuredEnv, now: fixedNow },
      {
        decision: "manual_action",
        message: "Manual action required: custom blocker detail safety test.",
        outputs: { manualActions: [] },
        safeToRun: false,
        blockers: [{
          category: "execution",
          key: "execution.integration.manual_action",
          message: "Manual action required: inspect custom blocker details.",
          recommendedNextAction: "Inspect the integration adapter output before retrying.",
          severity: "manual_action",
          blocks: ["execute"],
          source: "integration",
          details: {
            provider: "github",
            envName: "GITHUB_TOKEN",
            gate: "allowNetwork",
            operation: "createPullRequest",
            evidence: {
              summary: "provider returned a validation error",
              status: "failed",
              statusCode: 422,
              url: "https://evidence.example.test/log?safe=visible",
              path: "artifacts/mission-001/qa-report.md",
              resourceId: "mission-001",
              artifactId: "artifact-001",
              count: 1,
              operation: "createPullRequest",
              gate: "allowNetwork",
              raw: { token: "nested-raw-secret" },
              result: { body: "nested-result-secret" },
              providerResponse: { message: "nested-provider-response-secret" },
              headers: { authorization: "Bearer nested-header-secret" },
              payload: { body: "nested-payload-secret" },
              links: ["https://evidence.example.test/log?safe=visible"],
            },
            action: "manual-review",
            resourceId: "mission-001",
            jobType: "github-pr-preview",
            realPush: false,
            body: "raw-body-secret",
            responseBody: "raw-response-secret",
            providerResponse: { message: "provider-response-secret" },
            requestBody: { token: "request-body-secret" },
            data: { secret: "data-secret" },
            jwt: "jwt-real-secret",
            jwtLikeValue,
            bearer: "bearer-real-secret",
            bearerValue: "Bearer raw-bearer-secret",
            sessionId: "session-real-secret",
            apiToken: "api-token-real-secret",
            envSecretValue: "ghp_real_secret",
          },
        }],
      },
    );

    const text = textOf(result);

    expect(result.blockers[0]?.details).toMatchObject({
      provider: "github",
      envName: "GITHUB_TOKEN",
      gate: "allowNetwork",
      operation: "createPullRequest",
      evidence: {
        summary: "provider returned a validation error",
        status: "failed",
        statusCode: 422,
        url: "https://evidence.example.test/log?safe=visible",
        path: "artifacts/mission-001/qa-report.md",
        resourceId: "mission-001",
        artifactId: "artifact-001",
        count: 1,
        operation: "createPullRequest",
        gate: "allowNetwork",
        raw: "[REDACTED]",
        result: "[REDACTED]",
        providerResponse: "[REDACTED]",
        headers: "[REDACTED]",
        payload: "[REDACTED]",
        links: "[REDACTED]",
      },
      action: "manual-review",
      resourceId: "mission-001",
      jobType: "github-pr-preview",
      realPush: false,
      body: "[REDACTED]",
      responseBody: "[REDACTED]",
      providerResponse: "[REDACTED]",
      requestBody: "[REDACTED]",
      data: "[REDACTED]",
    });
    expect(text).not.toContain("raw-body-secret");
    expect(text).not.toContain("raw-response-secret");
    expect(text).not.toContain("provider-response-secret");
    expect(text).not.toContain("nested-raw-secret");
    expect(text).not.toContain("nested-result-secret");
    expect(text).not.toContain("nested-provider-response-secret");
    expect(text).not.toContain("request-body-secret");
    expect(text).not.toContain("data-secret");
    expect(text).not.toContain("nested-header-secret");
    expect(text).not.toContain("nested-payload-secret");
    expect(text).not.toContain(jwtLikeValue);
    expect(text).not.toContain("raw-bearer-secret");
    expect(text).not.toContain("ghp_real_secret");
    expect(text).not.toContain("jwt-real-secret");
    expect(text).not.toContain("bearer-real-secret");
    expect(text).not.toContain("session-real-secret");
    expect(text).not.toContain("api-token-real-secret");
  });

  it.each([
    ["auth failure", 401, "authentication failed"],
    ["permission failure", 403, "permission denied"],
    ["validation failure", 422, "request failed"],
    ["provider failure", 500, "provider unavailable"],
    ["timeout/network failure", 0, "network unavailable"],
  ])("returns redacted GitHub %s results", async (_label, status, expectedMessage) => {
    const transport: IntegrationTransport = async () => {
      if (status === 0) {
        throw new Error("network unavailable for ghp_real_secret");
      }
      return { status, json: { message: `${expectedMessage}: ghp_real_secret` } };
    };

    const result = await runGitHubReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      sourceSha: "abc123",
      transport,
      gates: { allowNetwork: true, allowPushBranch: true, allowCreatePullRequest: true },
    });

    expect(["failed", "degraded"]).toContain(result.decision);
    expect(result.message).toContain(expectedMessage);
    expect(textOf(result)).not.toContain("ghp_real_secret");
  });

  it("runs a gated Coolify staging deployment and status poll through injected transport", async () => {
    const { calls, transport } = createTransport([
      { status: 202, json: { id: "deploy-123", deployment_uuid: "deploy-123", url: "https://staging.example.test" } },
      { status: 200, json: { status: "success", deployment_url: "https://staging.example.test" } },
    ]);

    const result = await runCoolifyReal({
      env: configuredEnv,
      now: fixedNow,
      deployment: { project: "psf", environment: "staging", stagingUrl: "https://staging.example.test" },
      transport,
      gates: { allowNetwork: true },
    });

    expect(result.decision).toBe("succeeded");
    expect(result.realNetworkCall).toBe(true);
    expect(result.outputs.deploymentId).toBe("deploy-123");
    expect(result.outputs.stagingUrl).toContain("https://staging.example.test");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers?.authorization).toContain("coolify_real_secret");
    expect(textOf(result)).not.toContain("coolify_real_secret");
  });

  it("blocks Coolify production deployment without approval before transport is called", async () => {
    const { calls, transport } = createTransport([{ status: 202, json: { id: "deploy-prod" } }]);

    const result = await runCoolifyReal({
      env: configuredEnv,
      now: fixedNow,
      deployment: { project: "psf", environment: "production", productionUrl: "https://prod.example.test" },
      transport,
      gates: { allowNetwork: true },
    });

    expect(result.decision).toBe("manual_action");
    expect(result.realNetworkCall).toBe(false);
    expect(result.message).toContain("Production deployment requires approval");
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["auth failure", 401, "authentication failed"],
    ["permission failure", 403, "permission denied"],
    ["timeout/network failure", 0, "network unavailable"],
  ])("returns redacted Coolify %s results", async (_label, status, expectedMessage) => {
    const transport: IntegrationTransport = async () => {
      if (status === 0) {
        throw new Error("network unavailable for coolify_real_secret");
      }
      return { status, json: { message: `${expectedMessage}: coolify_real_secret` } };
    };

    const result = await runCoolifyReal({
      env: configuredEnv,
      now: fixedNow,
      deployment: { project: "psf", environment: "staging" },
      transport,
      gates: { allowNetwork: true },
    });

    expect(["failed", "degraded"]).toContain(result.decision);
    expect(result.message).toContain(expectedMessage);
    expect(textOf(result)).not.toContain("coolify_real_secret");
  });

  it("creates and checks an Uptime Kuma monitor through injected transport", async () => {
    const { calls, transport } = createTransport([
      { status: 200, json: { token: "session-secret" } },
      { status: 200, json: { monitorID: 77, id: 77 } },
      { status: 200, json: { status: "up", down: false } },
    ]);

    const result = await runUptimeKumaReal({
      env: configuredEnv,
      now: fixedNow,
      monitor: { project: "psf", stagingUrl: "https://staging.example.test" },
      transport,
      gates: { allowNetwork: true },
    });

    expect(result.decision).toBe("succeeded");
    expect(result.realNetworkCall).toBe(true);
    expect(result.outputs.monitorId).toBe("77");
    expect(result.outputs.downEvent).toBe(false);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.body).toEqual({ username: "ops", password: "kuma_real_secret" });
    expect(textOf(result)).not.toContain("kuma_real_secret");
    expect(textOf(result)).not.toContain("session-secret");
  });

  it.each([
    ["auth failure", 401, "authentication failed"],
    ["permission failure", 403, "permission denied"],
    ["provider unavailable", 503, "provider unavailable"],
    ["timeout/network failure", 0, "network unavailable"],
  ])("returns redacted Uptime Kuma %s results", async (_label, status, expectedMessage) => {
    const transport: IntegrationTransport = async () => {
      if (status === 0) {
        throw new Error("network unavailable for kuma_real_secret");
      }
      return { status, json: { message: `${expectedMessage}: kuma_real_secret` } };
    };

    const result = await runUptimeKumaReal({
      env: configuredEnv,
      now: fixedNow,
      monitor: { project: "psf", stagingUrl: "https://staging.example.test" },
      transport,
      gates: { allowNetwork: true },
    });

    expect(["failed", "degraded"]).toContain(result.decision);
    expect(result.message).toContain(expectedMessage);
    expect(textOf(result)).not.toContain("kuma_real_secret");
  });

  it("creates Plane mission and bug issues through injected transport", async () => {
    const { calls, transport } = createTransport([
      { status: 201, json: { id: "mission-plane-1", url: "https://plane.example.test/issues/mission-plane-1" } },
      { status: 200, json: { id: "mission-plane-1", state: "ready_for_review" } },
      { status: 201, json: { id: "bug-plane-1", url: "https://plane.example.test/issues/bug-plane-1" } },
      { status: 200, json: { id: "bug-plane-1", state: "open" } },
    ]);

    const result = await runPlaneReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      bugs: [{ id: "bug-1", title: "Broken deploy", evidence: { token: "bug-secret", url: "https://evidence.test/log?safe=1" } }],
      transport,
      gates: { allowNetwork: true },
    });

    expect(result.decision).toBe("succeeded");
    expect(result.realNetworkCall).toBe(true);
    expect(result.outputs.missionIssueUrl).toBe("https://plane.example.test/issues/mission-plane-1");
    expect(result.outputs.bugIssueUrls).toEqual(["https://plane.example.test/issues/bug-plane-1"]);
    expect(calls.map((call) => call.method)).toEqual(["POST", "PATCH", "POST", "PATCH"]);
    expect(calls[0]?.headers?.authorization).toContain("plane_real_secret");
    expect(textOf(result)).not.toContain("plane_real_secret");
    expect(textOf(result)).not.toContain("bug-secret");
  });

  it.each([
    ["auth failure", 401, "authentication failed"],
    ["permission failure", 403, "permission denied"],
    ["timeout/network failure", 0, "network unavailable"],
  ])("returns redacted Plane %s results", async (_label, status, expectedMessage) => {
    const transport: IntegrationTransport = async () => {
      if (status === 0) {
        throw new Error("network unavailable for plane_real_secret");
      }
      return { status, json: { message: `${expectedMessage}: plane_real_secret` } };
    };

    const result = await runPlaneReal({
      env: configuredEnv,
      now: fixedNow,
      mission: missionInput,
      bugs: [],
      transport,
      gates: { allowNetwork: true },
    });

    expect(["failed", "degraded"]).toContain(result.decision);
    expect(result.message).toContain(expectedMessage);
    expect(textOf(result)).not.toContain("plane_real_secret");
  });
});
