import path from "node:path";
import type { Artifact, BugReport, MissionEvent, ProjectPassport, QAReport, WorkerRun } from "@psf/mission-schema";
import { buildArtifactPath } from "@psf/artifact-store";
import { redactJson, redactText } from "@psf/security";

export type DeterministicQaStatus = "blocked" | "passed" | "failed";
export type DeterministicScenarioId =
  | "smoke_home"
  | "create_or_start_novel"
  | "generate_or_wait_for_content"
  | "review_or_report_visible"
  | "duplicate_click_or_loading_guard";

type Env = Record<string, string | undefined>;

type ResultFileName = "qa-report.md" | "bugs.json" | "qa-summary.json";

export interface DeterministicQaFailure {
  title: string;
  severity?: BugReport["severity"];
  reproductionSteps: string[];
  expectedResult: string;
  actualResult: string;
  evidence?: Record<string, unknown>;
  suggestedFix?: string;
}

export interface DeterministicScenario {
  id: DeterministicScenarioId;
  title: string;
  sourceFlowIds: string[];
  charterReferences: string[];
  selectorStatus: "verified" | "unverified";
  manualActionWhenUnverified: string;
}

interface ScenarioExecutionEvidence {
  scenarioId: DeterministicScenarioId;
  status: "passed" | "failed" | "blocked";
  message: string;
  screenshotPath: string;
  tracePath: string;
  logPath: string;
}

export interface DeterministicQaExecutionInput {
  missionId: string;
  projectId: string;
  targetUrl: string;
  now: string;
  artifacts: {
    screenshotsDir: string;
    tracePath: string;
    logPath: string;
  };
}

export interface DeterministicQaExecutionResult {
  status: "passed" | "failed";
  passed?: number;
  failed?: number;
  logs?: string[];
  evidence?: Record<string, unknown>;
  failures?: DeterministicQaFailure[];
  browserOpened?: boolean;
  stagingVisited?: boolean;
  summary?: string;
}

export interface DeterministicQaInput {
  missionId: string;
  projectId: string;
  targetUrl?: string;
  passport?: ProjectPassport;
  qaCharter?: string;
  missionFiles?: Record<string, string>;
  e2eCommandMetadata?: Record<string, unknown>;
  now?: string;
  env?: Env;
  execute?: (input: DeterministicQaExecutionInput) => Promise<DeterministicQaExecutionResult>;
}

export interface DeterministicQaSummary {
  missionId: string;
  projectId: string;
  mode: "deterministic";
  status: DeterministicQaStatus;
  targetUrl: string;
  passed: number;
  failed: number;
  browserOpened: boolean;
  stagingVisited: boolean;
  manualActionRequired: boolean;
  scenarioCount: number;
  manualActionScenarios: string[];
  bugCount: number;
  createdAt: string;
  logs: string[];
}

export interface DeterministicQaResult {
  status: DeterministicQaStatus;
  manualActionRequired: boolean;
  browserOpened: boolean;
  stagingVisited: boolean;
  targetUrl: string;
  files: Record<ResultFileName, string>;
  workerRun: WorkerRun;
  qaRun: QAReport;
  artifacts: Artifact[];
  bugs: BugReport[];
  events: MissionEvent[];
  summary: DeterministicQaSummary;
}

const GENERATED_BY = "qa-worker";
const DEFAULT_NOW = "2026-05-31T10:00:00.000Z";

class RealPlaywrightUnavailableError extends Error {}

export function buildDeterministicScenarios(input: Pick<DeterministicQaInput, "passport" | "qaCharter">): DeterministicScenario[] {
  const flowIds = new Set((input.passport?.core_flows ?? []).map((flow) => flow.id));
  const charter = input.qaCharter ?? "";
  return [
    scenario("smoke_home", "Homepage loads and primary surface is visible", ["open_home"], charter),
    scenario("create_or_start_novel", "Novel project can be created or started", ["create_novel_project", "enter_story_prompt"], charter),
    scenario("generate_or_wait_for_content", "Worldview, outline, and chapter generation reach a stable content state", ["generate_worldview", "generate_outline", "generate_chapter"], charter),
    scenario("review_or_report_visible", "Chapter review report becomes visible", ["review_chapter"], charter),
    scenario("duplicate_click_or_loading_guard", "Repeated generate clicks are guarded by loading or idempotency state", ["generate_chapter"], charter),
  ].map((entry) => ({
    ...entry,
    sourceFlowIds: entry.sourceFlowIds.filter((id) => flowIds.size === 0 || flowIds.has(id)),
  }));
}

function scenario(id: DeterministicScenarioId, title: string, sourceFlowIds: string[], charter: string): DeterministicScenario {
  return {
    id,
    title,
    sourceFlowIds,
    charterReferences: sourceFlowIds.filter((flowId) => charter.includes(flowId) || charter.length > 0),
    selectorStatus: "unverified",
    manualActionWhenUnverified: `Scenario ${id} requires verified ai-novelist selectors before it can be marked passed.`,
  };
}

export async function runDeterministicPlaywrightQa(input: DeterministicQaInput): Promise<DeterministicQaResult> {
  const now = input.now ?? DEFAULT_NOW;
  const workerRunId = `worker-run-${input.missionId}-qa-deterministic`;
  const qaRunId = `qa-run-${input.missionId}-deterministic`;
  const targetUrlResolution = resolveTargetUrl(input);
  const targetUrl = targetUrlResolution.targetUrl;
  const paths = createArtifactPaths(input.missionId, workerRunId);

  if (targetUrlResolution.reason !== undefined) {
    return buildResult({
      input,
      now,
      workerRunId,
      qaRunId,
      targetUrl: "",
      paths,
      status: "blocked",
      qaStatus: "skipped",
      workerStatus: "skipped",
      manualActionRequired: true,
      browserOpened: false,
      stagingVisited: false,
      passed: 0,
      failed: 0,
      logs: [targetUrlResolution.reason],
      failures: [],
      workerMode: "dry-run",
      executionSummary: targetUrlResolution.reason,
    });
  }

  if (targetUrl.length === 0) {
    return buildResult({
      input,
      now,
      workerRunId,
      qaRunId,
      targetUrl,
      paths,
      status: "blocked",
      qaStatus: "skipped",
      workerStatus: "skipped",
      manualActionRequired: true,
      browserOpened: false,
      stagingVisited: false,
      passed: 0,
      failed: 0,
      logs: ["No target_url, QA_TEST_URL, or STAGING_URL was configured."],
      failures: [],
      workerMode: "dry-run",
    });
  }

  const realPlaywrightEnabled = resolveRealPlaywrightEnabled(input.env);
  const scenarios = buildDeterministicScenarios(input);
  const unverifiedScenarios = scenarios.filter((entry) => entry.selectorStatus === "unverified");
  const hasProjectQaContext = input.passport !== undefined || input.qaCharter !== undefined || input.missionFiles !== undefined;
  const shouldBlockUnverifiedScenarios = unverifiedScenarios.length > 0
    && ((input.execute !== undefined && hasProjectQaContext) || (input.execute === undefined && realPlaywrightEnabled));
  if (shouldBlockUnverifiedScenarios) {
    const scenarioEvidence = unverifiedScenarios.map((entry): ScenarioExecutionEvidence => ({
      scenarioId: entry.id,
      status: "blocked",
      message: entry.manualActionWhenUnverified,
      screenshotPath: `${paths.screenshotsDir}/${entry.id}.png`,
      tracePath: paths.tracePath,
      logPath: paths.logPath,
    }));

    return buildResult({
      input,
      now,
      workerRunId,
      qaRunId,
      targetUrl,
      paths,
      status: "blocked",
      qaStatus: "skipped",
      workerStatus: "skipped",
      manualActionRequired: true,
      browserOpened: false,
      stagingVisited: false,
      passed: 0,
      failed: 0,
      logs: scenarioEvidence.map((entry) => `${entry.scenarioId}: manual action required - ${entry.message}`),
      failures: [],
      workerMode: "dry-run",
      executionSummary: "Deterministic QA requires manual action to verify scenario selectors before injected execution can run.",
      evidence: { scenarios: scenarioEvidence },
    });
  }

  if (input.execute === undefined && !realPlaywrightEnabled) {
    return buildResult({
      input,
      now,
      workerRunId,
      qaRunId,
      targetUrl,
      paths,
      status: "blocked",
      qaStatus: "skipped",
      workerStatus: "skipped",
      manualActionRequired: true,
      browserOpened: false,
      stagingVisited: false,
      passed: 0,
      failed: 0,
      logs: ["Deterministic Playwright QA requires ENABLE_REAL_PLAYWRIGHT=1 or an injected runner."],
      failures: [],
      workerMode: "dry-run",
    });
  }

  let execution: DeterministicQaExecutionResult;
  try {
    execution = input.execute === undefined
      ? await executeRealPlaywright({
          missionId: input.missionId,
          projectId: input.projectId,
          targetUrl,
          now,
          artifacts: paths,
        })
      : await input.execute({
          missionId: input.missionId,
          projectId: input.projectId,
          targetUrl,
          now,
          artifacts: paths,
        });
  } catch (error) {
    if (error instanceof RealPlaywrightUnavailableError) {
      return buildResult({
        input,
        now,
        workerRunId,
        qaRunId,
        targetUrl,
        paths,
        status: "blocked",
        qaStatus: "skipped",
        workerStatus: "skipped",
        manualActionRequired: true,
        browserOpened: false,
        stagingVisited: false,
        passed: 0,
        failed: 0,
        logs: [error.message],
        failures: [],
        workerMode: "real",
      });
    }

    execution = {
      status: "failed",
      passed: 0,
      failed: 1,
      logs: [error instanceof Error ? error.message : String(error)],
      browserOpened: realPlaywrightEnabled,
      stagingVisited: true,
      failures: [{
        title: "Deterministic Playwright execution failed",
        severity: "P1",
        reproductionSteps: ["Open the configured target URL.", "Run deterministic Playwright QA."],
        expectedResult: "Deterministic QA completes without runner errors.",
        actualResult: error instanceof Error ? error.message : String(error),
        evidence: { source: "deterministic-playwright" },
      }],
    };
  }

  const failures = normalizeFailures(execution);
  const status = execution.status === "passed" && failures.length === 0 ? "passed" : "failed";

  return buildResult({
    input,
    now,
    workerRunId,
    qaRunId,
    targetUrl,
    paths,
    status,
    qaStatus: status,
    workerStatus: status === "passed" ? "succeeded" : "failed",
    manualActionRequired: false,
    browserOpened: execution.browserOpened ?? false,
    stagingVisited: execution.stagingVisited ?? true,
    passed: execution.passed ?? (status === "passed" ? 1 : 0),
    failed: execution.failed ?? failures.length,
    logs: execution.logs ?? [],
    failures,
    workerMode: input.execute === undefined ? "real" : "mock",
    executionSummary: execution.summary,
    evidence: execution.evidence,
  });
}

interface BuildResultInput {
  input: DeterministicQaInput;
  now: string;
  workerRunId: string;
  qaRunId: string;
  targetUrl: string;
  paths: DeterministicQaExecutionInput["artifacts"];
  status: DeterministicQaStatus;
  qaStatus: QAReport["status"];
  workerStatus: WorkerRun["status"];
  manualActionRequired: boolean;
  browserOpened: boolean;
  stagingVisited: boolean;
  passed: number;
  failed: number;
  logs: string[];
  failures: DeterministicQaFailure[];
  workerMode: WorkerRun["mode"];
  executionSummary?: string | undefined;
  evidence?: Record<string, unknown> | undefined;
}

function buildResult(input: BuildResultInput): DeterministicQaResult {
  const redactedTargetUrl = redactText(input.targetUrl);
  const logs = input.logs.map((line) => redactText(line));
  const redactedExecutionSummary = redactText(input.executionSummary ?? defaultSummary(input.status, input.failures.length));
  const scenarioEvidence = extractScenarioEvidence(input.evidence);
  const manualActionScenarios = scenarioEvidence
    .filter((entry) => entry.status === "blocked")
    .map((entry) => entry.scenarioId);
  const evidence = redactJson({
    ...(input.evidence ?? {}),
    scenarioCount: scenarioEvidence.length,
    manualActionScenarios,
  });
  const bugs = input.failures.map((failure, index) => createBugReport(input, failure, index));
  const summary: DeterministicQaSummary = redactJson({
    missionId: input.input.missionId,
    projectId: input.input.projectId,
    mode: "deterministic",
    status: input.status,
    targetUrl: redactedTargetUrl,
    passed: input.passed,
    failed: input.failed,
    browserOpened: input.browserOpened,
    stagingVisited: input.stagingVisited,
    manualActionRequired: input.manualActionRequired,
    scenarioCount: scenarioEvidence.length,
    manualActionScenarios,
    bugCount: bugs.length,
    createdAt: input.now,
    logs,
  });
  const files = createFiles(input, summary, bugs, redactedTargetUrl, logs);
  const artifacts = createArtifacts(input, files);
  const qaRun: QAReport = {
    id: input.qaRunId,
    mission_id: input.input.missionId,
    target_url: redactedTargetUrl,
    mode: "deterministic",
    status: input.qaStatus,
    summary: redactedExecutionSummary,
    report_path: artifacts.find((artifact) => artifact.type === "qa_report")?.path,
    screenshots_dir: input.paths.screenshotsDir,
    trace_path: input.paths.tracePath,
    bugs_json_path: artifacts.find((artifact) => artifact.type === "bugs_json")?.path,
    ...(redactedTargetUrl.length === 0 ? {} : { staging_url: redactedTargetUrl }),
    passed: input.passed,
    failed: input.failed,
    started_at: input.now,
    finished_at: input.now,
    bugs,
    created_at: input.now,
    updated_at: input.now,
  };
  const workerRun: WorkerRun = {
    id: input.workerRunId,
    mission_id: input.input.missionId,
    worker_type: "qa",
    status: input.workerStatus,
    mode: input.workerMode,
    started_at: input.now,
    finished_at: input.now,
    exit_code: input.status === "failed" ? 1 : 0,
    input: redactJson({
      missionId: input.input.missionId,
      projectId: input.input.projectId,
      targetUrl: redactedTargetUrl,
      mode: "deterministic",
    }),
    output: redactJson({
      generatedFiles: Object.keys(files),
      bugCount: bugs.length,
      qaRunId: input.qaRunId,
      browserOpened: input.browserOpened,
      stagingVisited: input.stagingVisited,
      scenarioCount: scenarioEvidence.length,
      manualActionScenarios,
      evidence,
    }),
    error: input.status === "failed" ? "Deterministic QA failed." : "",
    logs,
    metadata: redactJson({ generatedBy: GENERATED_BY, mode: "deterministic", browserOpened: input.browserOpened, stagingVisited: input.stagingVisited, scenarioCount: scenarioEvidence.length, manualActionScenarios }),
    created_at: input.now,
    updated_at: input.now,
  };
  const events = createEvents(input, bugs, artifacts);

  return {
    status: input.status,
    manualActionRequired: input.manualActionRequired,
    browserOpened: input.browserOpened,
    stagingVisited: input.stagingVisited,
    targetUrl: redactedTargetUrl,
    files,
    workerRun,
    qaRun,
    artifacts,
    bugs,
    events,
    summary,
  };
}

function createFiles(
  input: BuildResultInput,
  summary: DeterministicQaSummary,
  bugs: BugReport[],
  targetUrl: string,
  logs: string[],
): Record<ResultFileName, string> {
  const files = {
    "qa-report.md": renderQaReport(input, bugs, targetUrl, logs),
    "bugs.json": `${JSON.stringify({ bugs }, null, 2)}\n`,
    "qa-summary.json": `${JSON.stringify(summary, null, 2)}\n`,
  };
  return {
    "qa-report.md": redactText(files["qa-report.md"]),
    "bugs.json": files["bugs.json"],
    "qa-summary.json": files["qa-summary.json"],
  };
}

function renderQaReport(input: BuildResultInput, bugs: BugReport[], targetUrl: string, logs: string[]): string {
  return [
    "# QA Report",
    "",
    "## Mission",
    `- Mission ID: ${input.input.missionId}`,
    `- Project ID: ${input.input.projectId}`,
    "",
    "## Mode",
    "deterministic",
    "",
    "## Target",
    `- URL: ${targetUrl || "not configured"}`,
    `- Browser opened: ${input.browserOpened ? "yes" : "no"}`,
    `- Staging visited: ${input.stagingVisited ? "yes" : "no"}`,
    "",
    "## Summary",
    `- Status: ${input.status}`,
    `- Passed: ${input.passed}`,
    `- Failed: ${input.failed}`,
    `- Manual action required: ${input.manualActionRequired ? "yes" : "no"}`,
    `- Scenario count: ${extractScenarioEvidence(input.evidence).length}`,
    `- manualActionScenarios: ${formatManualActionScenarios(input)}`,
    "",
    "## Scenarios",
    renderScenarioSection(input),
    "",
    "## Bugs",
    bugs.length === 0 ? "- none" : bugs.map((bug) => `- ${bug.severity}: ${bug.title}`).join("\n"),
    "",
    "## Logs",
    logs.length === 0 ? "- none" : logs.map((line) => `- ${line}`).join("\n"),
    "",
  ].join("\n");
}

function formatManualActionScenarios(input: BuildResultInput): string {
  const manualActionScenarios = extractScenarioEvidence(input.evidence)
    .filter((entry) => entry.status === "blocked")
    .map((entry) => entry.scenarioId);
  return manualActionScenarios.length === 0 ? "none" : manualActionScenarios.join(", ");
}

function renderScenarioSection(input: BuildResultInput): string {
  const scenarioEvidence = extractScenarioEvidence(input.evidence);
  if (scenarioEvidence.length === 0) {
    return "- none";
  }

  return scenarioEvidence
    .map((entry) => `- ${entry.scenarioId}: ${entry.status} - ${entry.message}${entry.status === "blocked" ? " (manual action required)" : ""}`)
    .join("\n");
}

function extractScenarioEvidence(evidence: Record<string, unknown> | undefined): ScenarioExecutionEvidence[] {
  const scenarios = evidence?.scenarios;
  if (!Array.isArray(scenarios)) {
    return [];
  }

  return scenarios.filter((entry): entry is ScenarioExecutionEvidence => {
    if (!isRecord(entry)) {
      return false;
    }
    return isDeterministicScenarioId(entry.scenarioId)
      && (entry.status === "passed" || entry.status === "failed" || entry.status === "blocked")
      && typeof entry.message === "string"
      && typeof entry.screenshotPath === "string"
      && typeof entry.tracePath === "string"
      && typeof entry.logPath === "string";
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDeterministicScenarioId(value: unknown): value is DeterministicScenarioId {
  return value === "smoke_home"
    || value === "create_or_start_novel"
    || value === "generate_or_wait_for_content"
    || value === "review_or_report_visible"
    || value === "duplicate_click_or_loading_guard";
}

function createBugReport(input: BuildResultInput, failure: DeterministicQaFailure, index: number): BugReport {
  const rawEvidence = failure.evidence ?? {};
  const evidence = redactJson({
    ...rawEvidence,
    source: "deterministic-playwright",
    browserOpened: input.browserOpened,
    stagingVisited: input.stagingVisited,
    targetUrl: redactText(input.targetUrl),
    scenarioId: typeof rawEvidence.scenarioId === "string" ? rawEvidence.scenarioId : "smoke_home",
    screenshotPath: typeof rawEvidence.screenshotPath === "string" ? rawEvidence.screenshotPath : input.paths.screenshotsDir,
    tracePath: typeof rawEvidence.tracePath === "string" ? rawEvidence.tracePath : input.paths.tracePath,
    logPath: typeof rawEvidence.logPath === "string" ? rawEvidence.logPath : input.paths.logPath,
  });

  return {
    id: `bug-${input.input.missionId}-deterministic-${index + 1}-${slugify(failure.title).slice(0, 48)}`,
    mission_id: input.input.missionId,
    qa_run_id: input.qaRunId,
    title: redactText(failure.title),
    severity: failure.severity ?? "P1",
    status: "open",
    reproduction_steps: nonEmptySteps(failure.reproductionSteps).map((step) => redactText(step)),
    expected_result: redactText(failure.expectedResult),
    actual_result: redactText(failure.actualResult),
    evidence,
    ...(failure.suggestedFix === undefined ? {} : { suggested_fix: redactText(failure.suggestedFix) }),
    regression_test_path: input.paths.tracePath,
    suggested_fix_direction: "Use the deterministic failure evidence to add or update a focused regression before fixing.",
    source: "qa-worker",
    created_at: input.now,
    updated_at: input.now,
  };
}

function normalizeFailures(execution: DeterministicQaExecutionResult): DeterministicQaFailure[] {
  if (execution.failures !== undefined && execution.failures.length > 0) {
    return execution.failures;
  }
  if (execution.status === "passed") {
    return [];
  }
  return [{
    title: "Deterministic Playwright assertion failed",
    severity: "P1",
    reproductionSteps: ["Open the configured target URL.", "Run deterministic Playwright QA."],
    expectedResult: "All deterministic checks pass.",
    actualResult: "One or more deterministic checks failed.",
    evidence: execution.evidence ?? {},
  }];
}

function nonEmptySteps(steps: string[]): string[] {
  const filtered = steps.filter((step) => step.trim().length > 0);
  return filtered.length > 0 ? filtered : ["Open the configured target URL.", "Run deterministic Playwright QA."];
}

function createArtifacts(input: BuildResultInput, files: Record<ResultFileName, string>): Artifact[] {
  return [
    createTextArtifact(input, "qa_report", "qa-report.md", files["qa-report.md"], "text/markdown"),
    createTextArtifact(input, "bugs_json", "bugs.json", files["bugs.json"], "application/json"),
    createTextArtifact(input, "other", "qa-summary.json", files["qa-summary.json"], "application/json"),
    createPathArtifact(input, "screenshot", "screenshots", input.paths.screenshotsDir),
    createPathArtifact(input, "playwright_trace", "trace.zip", input.paths.tracePath),
    createPathArtifact(input, "log", "deterministic.log", input.paths.logPath),
  ];
}

function createTextArtifact(input: BuildResultInput, type: Artifact["type"], name: string, content: string, mimeType: string): Artifact {
  const redactedContent = redactText(content);
  return {
    id: `artifact-${input.input.missionId}-deterministic-${slugify(name)}`,
    mission_id: input.input.missionId,
    type,
    path: relativeArtifactPath(input.input.missionId, input.workerRunId, "qa", name),
    worker_run_id: input.workerRunId,
    content: redactedContent,
    mime_type: mimeType,
    size: Buffer.byteLength(redactedContent, "utf8"),
    metadata: redactJson({ generatedBy: GENERATED_BY, mode: "deterministic", pathOnly: false }),
    created_at: input.now,
  };
}

function createPathArtifact(input: BuildResultInput, type: Artifact["type"], name: string, artifactPath: string): Artifact {
  return {
    id: `artifact-${input.input.missionId}-deterministic-${type}`,
    mission_id: input.input.missionId,
    type,
    path: artifactPath,
    worker_run_id: input.workerRunId,
    mime_type: "application/octet-stream",
    size: 0,
    metadata: redactJson({ generatedBy: GENERATED_BY, mode: "deterministic", pathOnly: true, artifactName: name }),
    created_at: input.now,
  };
}

function createArtifactPaths(missionId: string, workerRunId: string): DeterministicQaExecutionInput["artifacts"] {
  return {
    screenshotsDir: relativeArtifactPath(missionId, workerRunId, "qa", "screenshots"),
    tracePath: relativeArtifactPath(missionId, workerRunId, "qa", "trace.zip"),
    logPath: relativeArtifactPath(missionId, workerRunId, "logs", "deterministic.log"),
  };
}

function relativeArtifactPath(missionId: string, workerRunId: string, category: "qa" | "logs", filename: string): string {
  const absolutePath = buildArtifactPath({
    artifactsRoot: path.resolve(process.cwd(), "artifacts"),
    missionId,
    runId: workerRunId,
    category,
    filename,
  });
  return path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
}

function createEvents(input: BuildResultInput, bugs: BugReport[], artifacts: Artifact[]): MissionEvent[] {
  return [
    buildEvent(input.input.missionId, "qa.started", "Deterministic QA started.", { workerRunId: input.workerRunId, qaRunId: input.qaRunId }, input.now),
    buildEvent(input.input.missionId, "worker_run.created", "QA WorkerRun created.", { workerRunId: input.workerRunId, workerType: "qa", mode: input.workerMode }, input.now),
    buildEvent(input.input.missionId, "qa_run.created", "Deterministic QA run created.", { qaRunId: input.qaRunId, status: input.qaStatus }, input.now),
    ...artifacts.map((artifact) => buildEvent(input.input.missionId, "artifact.created", "QA artifact created.", { artifactId: artifact.id, type: artifact.type, path: artifact.path }, input.now)),
    ...bugs.map((bug) => buildEvent(input.input.missionId, "bug.created", "Bug report created from deterministic QA.", { bugId: bug.id, severity: bug.severity }, input.now)),
    buildEvent(input.input.missionId, "qa.completed", "Deterministic QA completed.", { workerRunId: input.workerRunId, qaRunId: input.qaRunId, status: input.status, bugCount: bugs.length }, input.now),
  ];
}

function buildEvent(missionId: string, type: string, message: string, payload: Record<string, unknown>, now: string): MissionEvent {
  return {
    id: `event-${missionId}-${type.replaceAll(".", "-")}-${stableSuffix(payload)}`,
    mission_id: missionId,
    type,
    message,
    payload: redactJson(payload),
    created_at: now,
  };
}

async function executeRealPlaywright(input: DeterministicQaExecutionInput): Promise<DeterministicQaExecutionResult> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<Record<string, unknown>>;
  let playwright: Record<string, unknown>;
  try {
    playwright = await dynamicImport("@playwright/test");
  } catch {
    throw new RealPlaywrightUnavailableError("Real Playwright execution requires @playwright/test to be installed.");
  }

  const chromium = playwright.chromium as { launch: () => Promise<{ newPage: () => Promise<RealPlaywrightPage>; close: () => Promise<void> }> } | undefined;
  if (chromium === undefined) {
    throw new RealPlaywrightUnavailableError("Real Playwright execution requires a chromium launcher.");
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(input.targetUrl, { waitUntil: "domcontentloaded" });
    const title = await page.title();
    const bodyVisible = await page.locator("body").isVisible();
    if (!bodyVisible) {
      return {
        status: "failed",
        passed: 0,
        failed: 1,
        browserOpened: true,
        stagingVisited: true,
        logs: [`Visited ${input.targetUrl}`, "Body was not visible."],
        failures: [{
          title: "Page body is not visible",
          severity: "P1",
          reproductionSteps: ["Open the configured target URL.", "Wait for DOM content to load."],
          expectedResult: "The page body is visible.",
          actualResult: "The page body was not visible.",
          evidence: { title, screenshotPath: input.artifacts.screenshotsDir, tracePath: input.artifacts.tracePath },
        }],
      };
    }

    return {
      status: "passed",
      passed: 1,
      failed: 0,
      browserOpened: true,
      stagingVisited: true,
      logs: [`Visited ${input.targetUrl}`, `Page title: ${title}`],
      evidence: { title, screenshotPath: input.artifacts.screenshotsDir, tracePath: input.artifacts.tracePath },
    };
  } finally {
    await browser.close();
  }
}

interface RealPlaywrightPage {
  goto: (url: string, options: { waitUntil: string }) => Promise<unknown>;
  title: () => Promise<string>;
  locator: (selector: string) => { isVisible: () => Promise<boolean> };
}

interface TargetUrlResolution {
  targetUrl: string;
  reason?: string;
}

function resolveTargetUrl(input: DeterministicQaInput): TargetUrlResolution {
  const env = input.env ?? process.env;
  const targetUrl = firstNonEmpty(input.targetUrl, env.QA_TEST_URL, env.STAGING_URL);
  if (targetUrl.length === 0) {
    return { targetUrl };
  }

  if (!isValidHttpUrl(targetUrl)) {
    return {
      targetUrl: "",
      reason: "Invalid target URL: provide an absolute http(s) URL via targetUrl, QA_TEST_URL, or STAGING_URL.",
    };
  }

  return { targetUrl };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveRealPlaywrightEnabled(env?: Env): boolean {
  const source = env ?? process.env;
  return source.ENABLE_REAL_PLAYWRIGHT === "1";
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function defaultSummary(status: DeterministicQaStatus, bugCount: number): string {
  if (status === "blocked") {
    return "Deterministic Playwright QA is blocked until a target URL and enabled runner are provided.";
  }
  if (status === "passed") {
    return "Deterministic Playwright QA passed.";
  }
  return `Deterministic Playwright QA failed with ${bugCount} bug report(s).`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function stableSuffix(payload: Record<string, unknown>): string {
  const source = String(payload.workerRunId ?? payload.qaRunId ?? payload.artifactId ?? payload.bugId ?? payload.bugCount ?? "root");
  return slugify(source).slice(0, 80) || "root";
}
