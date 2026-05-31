import path from "node:path";
import ts from "typescript";
import { buildArtifactPath } from "@psf/artifact-store";
import { BugReportSchema, type Artifact, type BugReport, type MissionEvent, type ProjectPassport, type QAReport, type WorkerRun } from "@psf/mission-schema";
import { redactJson, redactText } from "@psf/security";

type MissionFileName = "mission.md" | "acceptance.md";
type Env = Record<string, string | undefined>;
type ResultFileName = "qa-report.md" | "bugs.json" | "qa-summary.json" | "generated-regression.spec.ts";

export type AiExploratoryQaMode = "dry-run" | "mock" | "real";
export type AiExploratoryQaStatus = "blocked" | "passed" | "failed";

export interface AiExploratoryQaExecutionInput {
  missionId: string;
  projectId: string;
  missionFiles: Record<MissionFileName, string>;
  passport: ProjectPassport;
  qaCharter: string;
  targetUrl: string;
  now: string;
  artifacts: {
    screenshotsDir: string;
    tracePath: string;
    logPath: string;
  };
}

export interface AiExploratoryQaExecutionOutput {
  reportMarkdown: string;
  bugsJson: string;
  regressionSpec: string;
  passed?: number;
  failed?: number;
  logs?: string[];
  browserOpened?: boolean;
  mcpConnected?: boolean;
  stagingVisited?: boolean;
  summary?: string;
  evidence?: Record<string, unknown>;
}

export type AiExploratoryQaExecutor = (input: AiExploratoryQaExecutionInput) => Promise<AiExploratoryQaExecutionOutput>;

export interface AiExploratoryQaInput {
  missionId: string;
  projectId: string;
  passport: ProjectPassport;
  qaCharter: string;
  missionFiles: Record<MissionFileName, string>;
  targetUrl?: string;
  stagingUrl?: string;
  mode?: AiExploratoryQaMode;
  env?: Env;
  now?: string;
  execute?: AiExploratoryQaExecutor;
}

export interface AiExploratoryQaSummary {
  missionId: string;
  projectId: string;
  mode: "ai_exploratory";
  runnerMode: AiExploratoryQaMode;
  status: AiExploratoryQaStatus;
  targetUrl: string;
  passed: number;
  failed: number;
  browserOpened: boolean;
  mcpConnected: boolean;
  stagingVisited: boolean;
  manualActionRequired: boolean;
  bugCount: number;
  createdAt: string;
  logs: string[];
}

export interface AiExploratoryQaResult {
  status: AiExploratoryQaStatus;
  manualActionRequired: boolean;
  browserOpened: boolean;
  mcpConnected: boolean;
  stagingVisited: boolean;
  targetUrl: string;
  files: Record<ResultFileName, string>;
  workerRun: WorkerRun;
  qaRun: QAReport;
  artifacts: Artifact[];
  bugs: BugReport[];
  events: MissionEvent[];
  summary: AiExploratoryQaSummary;
}

export interface AiExploratoryOutputValidationInput {
  missionId: string;
  qaRunId: string;
  now: string;
  reportMarkdown: string;
  bugsJson: string;
  regressionSpec: string;
}

export interface AiExploratoryOutputValidationResult {
  ok: boolean;
  errors: string[];
  files: Record<"qa-report.md" | "bugs.json" | "generated-regression.spec.ts", string>;
  bugs: BugReport[];
}

interface BuildResultInput {
  input: AiExploratoryQaInput;
  now: string;
  workerRunId: string;
  qaRunId: string;
  requestedMode: AiExploratoryQaMode;
  workerMode: WorkerRun["mode"];
  targetUrl: string;
  paths: AiExploratoryQaExecutionInput["artifacts"];
  status: AiExploratoryQaStatus;
  qaStatus: QAReport["status"];
  workerStatus: WorkerRun["status"];
  manualActionRequired: boolean;
  browserOpened: boolean;
  mcpConnected: boolean;
  stagingVisited: boolean;
  passed: number;
  failed: number;
  bugs: BugReport[];
  reportMarkdown: string;
  bugsJson: string;
  regressionSpec: string;
  logs: string[];
  executionSummary?: string | undefined;
  evidence?: Record<string, unknown> | undefined;
}

interface TargetUrlResolution {
  targetUrl: string;
  reason?: string;
}

const GENERATED_BY = "qa-worker";
const DEFAULT_NOW = "2026-05-31T10:00:00.000Z";

export class AiExploratoryQaRunner {
  constructor(private readonly defaults: Partial<Pick<AiExploratoryQaInput, "mode" | "env" | "execute">> = {}) {}

  static dryRun(defaults: Partial<Pick<AiExploratoryQaInput, "env">> = {}): AiExploratoryQaRunner {
    return new AiExploratoryQaRunner({ ...defaults, mode: "dry-run" });
  }

  static mock(execute: AiExploratoryQaExecutor, defaults: Partial<Pick<AiExploratoryQaInput, "env">> = {}): AiExploratoryQaRunner {
    return new AiExploratoryQaRunner({ ...defaults, mode: "mock", execute });
  }

  static real(defaults: Partial<Pick<AiExploratoryQaInput, "env" | "execute">> = {}): AiExploratoryQaRunner {
    return new AiExploratoryQaRunner({ ...defaults, mode: "real" });
  }

  async run(input: AiExploratoryQaInput): Promise<AiExploratoryQaResult> {
    const defaultExecute = input.execute ?? this.defaults.execute;
    const merged: AiExploratoryQaInput = {
      ...input,
      mode: input.mode ?? this.defaults.mode ?? (defaultExecute === undefined ? "dry-run" : "mock"),
    };
    const env = input.env ?? this.defaults.env;
    if (env !== undefined) {
      merged.env = env;
    }
    if (defaultExecute !== undefined) {
      merged.execute = defaultExecute;
    }
    const now = merged.now ?? DEFAULT_NOW;
    const workerRunId = `worker-run-${merged.missionId}-qa-ai-exploratory`;
    const qaRunId = `qa-run-${merged.missionId}-ai-exploratory`;
    const requestedMode = merged.mode ?? "dry-run";
    const paths = createArtifactPaths(merged.missionId, workerRunId);
    const targetUrlResolution = resolveTargetUrl(merged);
    const targetUrl = targetUrlResolution.targetUrl;

    if (targetUrlResolution.reason !== undefined) {
      return this.buildManualActionResult({
        input: merged,
        now,
        workerRunId,
        qaRunId,
        requestedMode,
        workerMode: "dry-run",
        targetUrl: "",
        paths,
        logs: [targetUrlResolution.reason],
      });
    }

    if (requestedMode === "dry-run") {
      return this.buildManualActionResult({
        input: merged,
        now,
        workerRunId,
        qaRunId,
        requestedMode,
        workerMode: "dry-run",
        targetUrl,
        paths,
        logs: ["AI exploratory QA dry-run generated artifacts only; no MCP connection or browser was opened."],
      });
    }

    if (requestedMode === "real") {
      const log = resolveAiExploratoryEnabled(merged.env)
        ? "Real Playwright MCP execution path is not approved yet; AI exploratory QA remains manual-action only."
        : "AI exploratory QA is disabled because ENABLE_AI_EXPLORATORY_QA is not 1.";
      return this.buildManualActionResult({
        input: merged,
        now,
        workerRunId,
        qaRunId,
        requestedMode,
        workerMode: "dry-run",
        targetUrl,
        paths,
        logs: [log],
      });
    }

    if (merged.execute !== undefined && !resolveAiExploratoryEnabled(merged.env)) {
      return this.buildManualActionResult({
        input: merged,
        now,
        workerRunId,
        qaRunId,
        requestedMode,
        workerMode: "dry-run",
        targetUrl,
        paths,
        logs: ["AI exploratory QA executor is disabled because ENABLE_AI_EXPLORATORY_QA is not 1."],
      });
    }

    if (merged.execute === undefined) {
      return this.buildManualActionResult({
        input: merged,
        now,
        workerRunId,
        qaRunId,
        requestedMode,
        workerMode: "mock",
        targetUrl,
        paths,
        logs: ["Real Playwright MCP execution path is not approved yet; run manual exploratory QA or inject a mock executor in tests."],
      });
    }

    let execution: AiExploratoryQaExecutionOutput;
    try {
      execution = await merged.execute({
        missionId: merged.missionId,
        projectId: merged.projectId,
        missionFiles: merged.missionFiles,
        passport: merged.passport,
        qaCharter: merged.qaCharter,
        targetUrl,
        now,
        artifacts: paths,
      });
    } catch (error) {
      return this.buildManualActionResult({
        input: merged,
        now,
        workerRunId,
        qaRunId,
        requestedMode,
        workerMode: "mock",
        targetUrl,
        paths,
        logs: [error instanceof Error ? error.message : String(error)],
      });
    }

    const validation = validateAiExploratoryOutput({
      missionId: merged.missionId,
      qaRunId,
      now,
      reportMarkdown: execution.reportMarkdown,
      bugsJson: execution.bugsJson,
      regressionSpec: execution.regressionSpec,
    });

    if (!validation.ok) {
      return buildResult({
        input: merged,
        now,
        workerRunId,
        qaRunId,
        requestedMode,
        workerMode: "mock",
        targetUrl,
        paths,
        status: "failed",
        qaStatus: "failed",
        workerStatus: "failed",
        manualActionRequired: true,
        browserOpened: execution.browserOpened ?? false,
        mcpConnected: execution.mcpConnected ?? false,
        stagingVisited: execution.stagingVisited ?? false,
        passed: 0,
        failed: validation.errors.length,
        bugs: [],
        reportMarkdown: renderRejectedReport(merged, validation.errors),
        bugsJson: `${JSON.stringify({ bugs: [] }, null, 2)}\n`,
        regressionSpec: renderRegressionSpecTemplate(merged),
        logs: [...(execution.logs ?? []), ...validation.errors],
        executionSummary: "AI exploratory QA output was rejected by schema validation.",
        evidence: execution.evidence,
      });
    }

    const bugs = validation.bugs;
    const status: AiExploratoryQaStatus = bugs.length > 0 ? "failed" : "passed";

    return buildResult({
      input: merged,
      now,
      workerRunId,
      qaRunId,
      requestedMode,
      workerMode: "mock",
      targetUrl,
      paths,
      status,
      qaStatus: status,
      workerStatus: status === "passed" ? "succeeded" : "failed",
      manualActionRequired: false,
      browserOpened: execution.browserOpened ?? false,
      mcpConnected: execution.mcpConnected ?? false,
      stagingVisited: execution.stagingVisited ?? targetUrl.length > 0,
      passed: execution.passed ?? (status === "passed" ? 1 : 0),
      failed: execution.failed ?? bugs.length,
      bugs,
      reportMarkdown: validation.files["qa-report.md"],
      bugsJson: validation.files["bugs.json"],
      regressionSpec: validation.files["generated-regression.spec.ts"],
      logs: execution.logs ?? [],
      executionSummary: execution.summary,
      evidence: execution.evidence,
    });
  }

  private buildManualActionResult(input: {
    input: AiExploratoryQaInput;
    now: string;
    workerRunId: string;
    qaRunId: string;
    requestedMode: AiExploratoryQaMode;
    workerMode: WorkerRun["mode"];
    targetUrl: string;
    paths: AiExploratoryQaExecutionInput["artifacts"];
    logs: string[];
  }): AiExploratoryQaResult {
    return buildResult({
      input: input.input,
      now: input.now,
      workerRunId: input.workerRunId,
      qaRunId: input.qaRunId,
      requestedMode: input.requestedMode,
      workerMode: input.workerMode,
      targetUrl: input.targetUrl,
      paths: input.paths,
      status: "blocked",
      qaStatus: "skipped",
      workerStatus: "skipped",
      manualActionRequired: true,
      browserOpened: false,
      mcpConnected: false,
      stagingVisited: false,
      passed: 0,
      failed: 0,
      bugs: [],
      reportMarkdown: renderManualActionReport(input.input, input.targetUrl, input.logs),
      bugsJson: `${JSON.stringify({ bugs: [] }, null, 2)}\n`,
      regressionSpec: renderRegressionSpecTemplate(input.input),
      logs: input.logs,
      executionSummary: "AI exploratory QA manual action required; no MCP connection or browser execution occurred.",
    });
  }
}

export function validateAiExploratoryOutput(input: AiExploratoryOutputValidationInput): AiExploratoryOutputValidationResult {
  const errors: string[] = [];
  const reportMarkdown = redactText(input.reportMarkdown);
  const regressionSpec = redactText(stripMarkdownFence(input.regressionSpec));
  const bugs: BugReport[] = [];

  const parseErrors = getTypeScriptParseErrors(regressionSpec);
  const isPlaywrightTypeScriptSpec = isLikelyTypeScriptSpec(regressionSpec);
  if (parseErrors.length > 0) {
    errors.push(...parseErrors);
  }
  if (!isPlaywrightTypeScriptSpec) {
    errors.push("generated-regression.spec.ts must be a Playwright TypeScript spec.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.bugsJson);
  } catch {
    errors.push("bugs.json must be valid JSON.");
  }

  if (parsed !== undefined) {
    const rawBugs = readRawBugs(parsed);
    if (rawBugs === undefined) {
      errors.push("bugs.json must contain a bugs array.");
    } else {
      for (const [index, rawBug] of rawBugs.entries()) {
        const bug = createBugReportFromRaw(input, rawBug, index, errors);
        if (bug !== undefined) {
          bugs.push(bug);
        }
      }
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      files: {
        "qa-report.md": reportMarkdown,
        "bugs.json": `${JSON.stringify({ bugs: [] }, null, 2)}\n`,
        "generated-regression.spec.ts": regressionSpec,
      },
      bugs: [],
    };
  }

  return {
    ok: true,
    errors: [],
    files: {
      "qa-report.md": reportMarkdown,
      "bugs.json": `${JSON.stringify({ bugs }, null, 2)}\n`,
      "generated-regression.spec.ts": regressionSpec,
    },
    bugs,
  };
}

function buildResult(input: BuildResultInput): AiExploratoryQaResult {
  const targetUrl = redactText(input.targetUrl);
  const logs = input.logs.map((line) => redactText(line));
  const bugs = redactJson(input.bugs);
  const summary: AiExploratoryQaSummary = redactJson({
    missionId: input.input.missionId,
    projectId: input.input.projectId,
    mode: "ai_exploratory",
    runnerMode: input.workerMode ?? input.requestedMode,
    status: input.status,
    targetUrl,
    passed: input.passed,
    failed: input.failed,
    browserOpened: input.browserOpened,
    mcpConnected: input.mcpConnected,
    stagingVisited: input.stagingVisited,
    manualActionRequired: input.manualActionRequired,
    bugCount: bugs.length,
    createdAt: input.now,
    logs,
  });
  const files = createFiles(input, summary, bugs);
  const artifacts = createArtifacts(input, files);
  const qaRun: QAReport = {
    id: input.qaRunId,
    mission_id: input.input.missionId,
    target_url: targetUrl,
    mode: "ai_exploratory",
    status: input.qaStatus,
    summary: redactText(input.executionSummary ?? defaultSummary(input.status, bugs.length)),
    report_path: artifacts.find((artifact) => artifact.type === "qa_report")?.path,
    screenshots_dir: input.paths.screenshotsDir,
    trace_path: input.paths.tracePath,
    bugs_json_path: artifacts.find((artifact) => artifact.type === "bugs_json")?.path,
    ...(targetUrl.length === 0 ? {} : { staging_url: targetUrl }),
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
      targetUrl,
      mode: "ai_exploratory",
      requestedMode: input.requestedMode,
    }),
    output: redactJson({
      generatedFiles: Object.keys(files),
      bugCount: bugs.length,
      qaRunId: input.qaRunId,
      browserOpened: input.browserOpened,
      mcpConnected: input.mcpConnected,
      stagingVisited: input.stagingVisited,
      manualActionRequired: input.manualActionRequired,
      evidence: input.evidence ?? {},
    }),
    error: input.status === "failed" ? "AI exploratory QA failed." : "",
    logs,
    metadata: redactJson({
      generatedBy: GENERATED_BY,
      mode: "ai_exploratory",
      requestedMode: input.requestedMode,
      runnerMode: input.workerMode,
      browserOpened: input.browserOpened,
      mcpConnected: input.mcpConnected,
      stagingVisited: input.stagingVisited,
    }),
    created_at: input.now,
    updated_at: input.now,
  };
  const events = createEvents(input, bugs, artifacts);

  return {
    status: input.status,
    manualActionRequired: input.manualActionRequired,
    browserOpened: input.browserOpened,
    mcpConnected: input.mcpConnected,
    stagingVisited: input.stagingVisited,
    targetUrl,
    files,
    workerRun,
    qaRun,
    artifacts,
    bugs,
    events,
    summary,
  };
}

function createFiles(input: BuildResultInput, summary: AiExploratoryQaSummary, bugs: BugReport[]): Record<ResultFileName, string> {
  return {
    "qa-report.md": redactText(input.reportMarkdown),
    "bugs.json": `${JSON.stringify({ bugs }, null, 2)}\n`,
    "qa-summary.json": `${JSON.stringify(summary, null, 2)}\n`,
    "generated-regression.spec.ts": redactText(input.regressionSpec),
  };
}

function createArtifacts(input: BuildResultInput, files: Record<ResultFileName, string>): Artifact[] {
  return [
    createTextArtifact(input, "qa_report", "qa-report.md", files["qa-report.md"], "text/markdown"),
    createTextArtifact(input, "bugs_json", "bugs.json", files["bugs.json"], "application/json"),
    createTextArtifact(input, "other", "qa-summary.json", files["qa-summary.json"], "application/json"),
    createTextArtifact(input, "generated_test", "generated-regression.spec.ts", files["generated-regression.spec.ts"], "text/typescript"),
    createPathArtifact(input, "screenshot", "screenshots", input.paths.screenshotsDir),
    createPathArtifact(input, "playwright_trace", "trace.zip", input.paths.tracePath),
    createPathArtifact(input, "log", "ai-exploratory.log", input.paths.logPath),
  ];
}

function createTextArtifact(input: BuildResultInput, type: Artifact["type"], name: string, content: string, mimeType: string): Artifact {
  const redactedContent = redactText(content);
  return {
    id: `artifact-${input.input.missionId}-ai-exploratory-${slugify(name)}`,
    mission_id: input.input.missionId,
    type,
    path: relativeArtifactPath(input.input.missionId, input.workerRunId, "qa", name),
    worker_run_id: input.workerRunId,
    content: redactedContent,
    mime_type: mimeType,
    size: Buffer.byteLength(redactedContent, "utf8"),
    metadata: redactJson({ generatedBy: GENERATED_BY, mode: "ai_exploratory", pathOnly: false }),
    created_at: input.now,
  };
}

function createPathArtifact(input: BuildResultInput, type: Artifact["type"], name: string, artifactPath: string): Artifact {
  return {
    id: `artifact-${input.input.missionId}-ai-exploratory-${type}`,
    mission_id: input.input.missionId,
    type,
    path: artifactPath,
    worker_run_id: input.workerRunId,
    mime_type: "application/octet-stream",
    size: 0,
    metadata: redactJson({ generatedBy: GENERATED_BY, mode: "ai_exploratory", pathOnly: true, artifactName: name }),
    created_at: input.now,
  };
}

function createEvents(input: BuildResultInput, bugs: BugReport[], artifacts: Artifact[]): MissionEvent[] {
  return [
    buildEvent(input.input.missionId, "qa.started", "AI exploratory QA started.", { workerRunId: input.workerRunId, qaRunId: input.qaRunId, mode: input.workerMode }, input.now),
    buildEvent(input.input.missionId, "worker_run.created", "QA WorkerRun created.", { workerRunId: input.workerRunId, workerType: "qa", mode: input.workerMode }, input.now),
    buildEvent(input.input.missionId, "qa_run.created", "AI exploratory QA run created.", { qaRunId: input.qaRunId, status: input.qaStatus }, input.now),
    ...artifacts.map((artifact) => buildEvent(input.input.missionId, "artifact.created", "QA artifact created.", { artifactId: artifact.id, type: artifact.type, path: artifact.path }, input.now)),
    ...bugs.map((bug) => buildEvent(input.input.missionId, "bug.created", "Bug report created from AI exploratory QA.", { bugId: bug.id, severity: bug.severity }, input.now)),
    buildEvent(input.input.missionId, "qa.completed", "AI exploratory QA completed.", { workerRunId: input.workerRunId, qaRunId: input.qaRunId, status: input.status, bugCount: bugs.length }, input.now),
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

function createBugReportFromRaw(input: AiExploratoryOutputValidationInput, raw: unknown, index: number, errors: string[]): BugReport | undefined {
  if (!raw || typeof raw !== "object") {
    errors.push(`Bug at index ${index} must be an object.`);
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const title = readNonEmptyString(record.title);
  const severity = readSeverity(record.severity);
  const reproductionSteps = readStringArray(record.reproduction_steps) ?? readStringArray(record.reproductionSteps);
  const expectedResult = readNonEmptyString(record.expected_result) ?? readNonEmptyString(record.expectedResult);
  const actualResult = readNonEmptyString(record.actual_result) ?? readNonEmptyString(record.actualResult);

  if (title === undefined || severity === undefined || reproductionSteps === undefined || expectedResult === undefined || actualResult === undefined) {
    errors.push(`Bug at index ${index} is missing required schema fields.`);
    return undefined;
  }

  if ((severity === "P0" || severity === "P1") && !hasEvidence(record.evidence)) {
    errors.push(`P0/P1 AI bug "${title}" requires evidence.`);
    return undefined;
  }

  const evidence = redactJson({
    ...(isRecord(record.evidence) ? record.evidence : {}),
    source: "ai-exploratory",
  });
  const candidate: BugReport = {
    id: readNonEmptyString(record.id) ?? `bug-${input.missionId}-ai-exploratory-${index + 1}-${slugify(title).slice(0, 48)}`,
    mission_id: input.missionId,
    qa_run_id: input.qaRunId,
    title: redactText(title),
    severity,
    status: "open",
    reproduction_steps: reproductionSteps.map((step) => redactText(step)),
    expected_result: redactText(expectedResult),
    actual_result: redactText(actualResult),
    evidence,
    ...(readNonEmptyString(record.suggested_fix) === undefined ? {} : { suggested_fix: redactText(readNonEmptyString(record.suggested_fix)!) }),
    regression_test_path: `missions/${input.missionId}/generated-regression.spec.ts`,
    suggested_fix_direction: "Convert the AI exploratory finding into a deterministic Playwright regression before fixing.",
    source: "qa-worker",
    created_at: input.now,
    updated_at: input.now,
  };

  const parsed = BugReportSchema.safeParse(candidate);
  if (!parsed.success) {
    errors.push(`Bug at index ${index} failed BugReport schema validation.`);
    return undefined;
  }

  return parsed.data;
}

function renderManualActionReport(input: AiExploratoryQaInput, targetUrl: string, logs: string[]): string {
  return [
    "# AI Exploratory QA Report",
    "",
    "## Mode",
    "ai_exploratory",
    "",
    "## Status",
    "manual action required",
    "",
    "## Mission",
    `- Mission ID: ${input.missionId}`,
    `- Project ID: ${input.projectId}`,
    "",
    "## Target",
    `- URL: ${targetUrl || "not configured"}`,
    "- Browser opened: no",
    "- MCP connected: no",
    "- Staging visited: no",
    "",
    "## Safety Gate",
    "AI exploratory QA did not connect to Playwright MCP, did not open a browser, and did not call external APIs.",
    "",
    "## Logs",
    logs.length === 0 ? "- none" : logs.map((line) => `- ${line}`).join("\n"),
    "",
  ].join("\n");
}

function renderRejectedReport(input: AiExploratoryQaInput, errors: string[]): string {
  return [
    "# AI Exploratory QA Report",
    "",
    "## Mode",
    "ai_exploratory",
    "",
    "## Status",
    "AI output rejected",
    "",
    "## Mission",
    `- Mission ID: ${input.missionId}`,
    `- Project ID: ${input.projectId}`,
    "",
    "## Validation Errors",
    ...errors.map((error) => `- ${error}`),
    "",
  ].join("\n");
}

function renderRegressionSpecTemplate(input: AiExploratoryQaInput): string {
  return [
    "import { test, expect } from '@playwright/test';",
    "",
    `test.describe.skip('AI exploratory QA regression template: ${input.passport.name}', () => {`,
    "  test('documents a future AI-discovered regression', async ({ page }) => {",
    "    await page.goto(process.env.QA_TEST_URL ?? process.env.STAGING_URL ?? 'http://127.0.0.1:8000');",
    "    await expect(page.locator('body')).toBeVisible();",
    "  });",
    "});",
    "",
  ].join("\n");
}

function readRawBugs(parsed: unknown): unknown[] | undefined {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isRecord(parsed) && Array.isArray(parsed.bugs)) {
    return parsed.bugs;
  }
  return undefined;
}

function getTypeScriptParseErrors(source: string): string[] {
  const output = ts.transpileModule(source, {
    fileName: "generated-regression.spec.ts",
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return (output.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      if (diagnostic.file === undefined || diagnostic.start === undefined) {
        return `TypeScript parse error: ${message}`;
      }
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `TypeScript parse error at ${position.line + 1}:${position.character + 1}: ${message}`;
    });
}

function isLikelyTypeScriptSpec(value: string): boolean {
  const source = value.trim();
  if (source.length === 0 || source.includes("```") || /<\/?[a-z][\s\S]*>/i.test(source)) {
    return false;
  }
  const importsPlaywright = /from\s+["']@playwright\/test["']/.test(source);
  const hasPlaywrightTest = /\btest(?:\.describe|\.skip|\.only)?\s*\(/.test(source) || /\btest\.describe(?:\.skip|\.only)?\s*\(/.test(source);
  return importsPlaywright && hasPlaywrightTest && hasBalancedDelimiters(source);
}

function hasBalancedDelimiters(source: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "}": "{", ")": "(", "]": "[" };
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (const char of source) {
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
    } else if (char === "{" || char === "(" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === ")" || char === "]") {
      if (stack.pop() !== pairs[char]) {
        return false;
      }
    }
  }

  return quote === undefined && stack.length === 0;
}

function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:typescript|ts)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return match?.[1] ?? value;
}

function hasEvidence(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([, item]) => {
    if (item === undefined || item === null) {
      return false;
    }
    if (typeof item === "string") {
      return item.trim().length > 0;
    }
    if (Array.isArray(item)) {
      return item.length > 0;
    }
    if (typeof item === "object") {
      return Object.keys(item).length > 0;
    }
    return true;
  });
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function readSeverity(value: unknown): BugReport["severity"] | undefined {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createArtifactPaths(missionId: string, workerRunId: string): AiExploratoryQaExecutionInput["artifacts"] {
  return {
    screenshotsDir: relativeArtifactPath(missionId, workerRunId, "qa", "screenshots"),
    tracePath: relativeArtifactPath(missionId, workerRunId, "qa", "trace.zip"),
    logPath: relativeArtifactPath(missionId, workerRunId, "logs", "ai-exploratory.log"),
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

function resolveTargetUrl(input: AiExploratoryQaInput): TargetUrlResolution {
  const env = input.env ?? process.env;
  const targetUrl = firstNonEmpty(input.targetUrl, input.stagingUrl, env.QA_TEST_URL, env.STAGING_URL);
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

function resolveAiExploratoryEnabled(env?: Env): boolean {
  const source = env ?? process.env;
  return source.ENABLE_AI_EXPLORATORY_QA === "1";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function defaultSummary(status: AiExploratoryQaStatus, bugCount: number): string {
  if (status === "blocked") {
    return "AI exploratory QA is blocked until a gated and approved execution path is available.";
  }
  if (status === "passed") {
    return "AI exploratory QA output passed validation.";
  }
  return `AI exploratory QA failed with ${bugCount} bug report(s).`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function stableSuffix(payload: Record<string, unknown>): string {
  const source = String(payload.workerRunId ?? payload.qaRunId ?? payload.artifactId ?? payload.bugId ?? payload.bugCount ?? "root");
  return slugify(source).slice(0, 80) || "root";
}
