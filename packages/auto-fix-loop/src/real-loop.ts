import path from "node:path";
import { canTransition } from "@psf/mission-core";
import { MissionStatus, type Artifact, type BugReport, type MissionEvent, type MissionStatusValue, type ProjectPassport, type WorkerRun } from "@psf/mission-schema";
import { evaluateApprovalPolicy, evaluateCommandPolicy, redactJson, redactText, type ApprovalPolicyResult, type CommandPolicyResult } from "@psf/security";

export type GatedRealAutoFixDecision = "qa_passed" | "blocked" | "manual_action" | "needs_human" | "paused" | "fix_failed" | "test_failed" | "fixed";

type MissionFileName = "mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md";
type VerificationCommandGroup = "regression" | "unit" | "e2e";

export interface RegressionGeneratedSpecValidation {
  path?: string;
  content?: string;
  valid: boolean;
  errors?: string[];
}

export interface RegressionCoverageInput {
  existingSpecPath?: string;
  existingSpecContent?: string;
  generatedSpec?: RegressionGeneratedSpecValidation;
}

export interface RegressionCoverageMissingBug {
  id: string;
  title: string;
}

export interface RegressionCoverageResult {
  present: boolean;
  source: "existing" | "generated" | "missing";
  path?: string;
  errors: string[];
  missingCoverage?: RegressionCoverageMissingBug[];
}

export interface GatedRealCodexRunnerInput {
  missionId: string;
  projectId: string;
  repoUrl: string;
  defaultBranch: string;
  missionFiles: Record<MissionFileName, string>;
  approvalIds: string[];
  commands: string[];
  branchName: string;
  workspaceRoot: string;
  timeoutMs: number;
  mode: "real";
  fixMode: true;
}

export interface GatedRealCodexRunnerResult {
  status: "blocked" | "manual_action" | "succeeded" | "failed";
  executed: boolean;
  reason: string;
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
  stdout: string;
  stderr: string;
  exitCode?: number;
  workspacePath?: string;
  branchName?: string;
}

export interface GatedRealCodexRunner {
  run(input: GatedRealCodexRunnerInput): Promise<GatedRealCodexRunnerResult>;
}

export interface GatedRealTestRunnerInput {
  command: string;
  group: VerificationCommandGroup;
  cwd: string;
  workspaceRoot: string;
  timeoutMs: number;
}

export interface GatedRealTestRunnerResult {
  status: "passed" | "failed";
  exitCode?: number;
  output: string;
  error?: string;
}

export interface GatedRealTestRunner {
  run(input: GatedRealTestRunnerInput): Promise<GatedRealTestRunnerResult>;
}

export interface GatedRealVerificationCommands {
  regression?: string[];
  unit?: string[];
  e2e?: string[];
}

export interface GatedRealAutoFixLoopInput {
  missionId: string;
  projectId: string;
  missionStatus: MissionStatusValue;
  branchName: string;
  currentBranch: string;
  passport: ProjectPassport;
  projectAgents: string;
  missionFiles: Record<MissionFileName, string>;
  bugs: BugReport[];
  currentAttempt?: number;
  maxAttempts?: number;
  perBugAttempts?: Record<string, number>;
  maxBugAttempts?: number;
  now?: string;
  enableRealMode?: boolean;
  approvalIds?: string[];
  workspaceRoot?: string;
  timeoutMs?: number;
  verificationCommands?: GatedRealVerificationCommands;
  regressionEvidence?: RegressionCoverageInput;
  codexRunner?: GatedRealCodexRunner;
  testRunner?: GatedRealTestRunner;
  extraSecrets?: string[];
}

export interface GatedRealAutoFixLoopGates {
  realModeEnabled: boolean;
  approval: ApprovalPolicyResult;
  regressionCoverage: RegressionCoverageResult;
  commands: CommandPolicyResult[];
}

export interface GatedRealAutoFixLoopResult {
  decision: GatedRealAutoFixDecision;
  nextStatus?: MissionStatusValue;
  workerRun: WorkerRun;
  workerRuns: WorkerRun[];
  artifacts: Artifact[];
  events: MissionEvent[];
  gates: GatedRealAutoFixLoopGates;
  recommendedNextAction: string;
  regressionCoverage: RegressionCoverageResult;
  codexResult?: GatedRealCodexRunnerResult;
  testResults: Array<GatedRealTestRunnerResult & { command: string; group: VerificationCommandGroup }>;
  errors: string[];
}

const DEFAULT_NOW = "2026-05-31T10:00:00.000Z";
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_MISSION_ATTEMPTS = 3;
const DEFAULT_MAX_BUG_ATTEMPTS = 2;

export async function runGatedRealAutoFixLoop(input: GatedRealAutoFixLoopInput): Promise<GatedRealAutoFixLoopResult> {
  const extraSecrets = input.extraSecrets ?? [];
  const now = input.now ?? DEFAULT_NOW;
  const workspaceRoot = path.resolve(input.workspaceRoot ?? path.join("workspaces", input.projectId));
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const commands = buildVerificationCommands(input);
  const commandPolicyResults = commands.map(({ command }) => evaluateCommandPolicy({
    command,
    cwd: workspaceRoot,
    workspaceRoot,
    allowNetwork: false,
    allowGitPush: false,
    timeoutMs,
  }));
  const approval = evaluateApprovalPolicy("real_codex_execution", input.approvalIds ?? []);
  const regressionCoverage = evaluateRegressionCoverage(input.regressionEvidence, input.bugs);
  const baseGates: GatedRealAutoFixLoopGates = {
    realModeEnabled: input.enableRealMode === true,
    approval,
    regressionCoverage,
    commands: commandPolicyResults,
  };

  const attemptsDecision = attemptsExceededDecision(input, now, baseGates, regressionCoverage, extraSecrets);
  if (attemptsDecision) {
    return attemptsDecision;
  }

  if (input.bugs.length === 0) {
    return finish(input, {
      decision: "qa_passed",
      nextStatus: canTransition(input.missionStatus, MissionStatus.ready_for_review) ? MissionStatus.ready_for_review : undefined,
      status: "succeeded",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: "QA passed; no real fix loop is required.",
      testResults: [],
      errors: [],
      output: { bugCount: 0 },
      extraSecrets,
    });
  }

  if (!baseGates.realModeEnabled) {
    return finish(input, {
      decision: "blocked",
      status: "skipped",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: "Real auto-fix mode is disabled by default; enable it only with explicit gated approval.",
      testResults: [],
      errors: ["real mode disabled"],
      output: { blockedBy: "real_mode_disabled" },
      extraSecrets,
    });
  }

  if (!approval.allowed) {
    return finish(input, {
      decision: "blocked",
      status: "skipped",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: approval.reason,
      testResults: [],
      errors: [approval.reason],
      output: { blockedBy: "approval", missingApprovalTypes: approval.missingApprovalTypes },
      extraSecrets,
    });
  }

  if (hasReproducibleBug(input.bugs) && !regressionCoverage.present) {
    return finish(input, {
      decision: "needs_human",
      nextStatus: canTransition(input.missionStatus, MissionStatus.paused) ? MissionStatus.paused : undefined,
      status: "skipped",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: "Add or validate regression coverage before allowing a reproducible bug to be marked fixed.",
      testResults: [],
      errors: regressionCoverage.errors,
      output: {
        blockedBy: "missing_regression_coverage",
        missingCoverage: regressionCoverage.missingCoverage ?? [],
      },
      extraSecrets,
    });
  }

  const deniedCommand = commandPolicyResults.find((result) => !result.allowed);
  if (deniedCommand) {
    return finish(input, {
      decision: "manual_action",
      status: "skipped",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: `Command blocked: ${deniedCommand.reason}`,
      testResults: [],
      errors: [`Command blocked: ${deniedCommand.reason}`],
      output: { blockedBy: "command_policy", command: deniedCommand.normalizedCommand },
      extraSecrets,
    });
  }

  if (commands.length === 0) {
    return finish(input, {
      decision: "manual_action",
      status: "skipped",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: "At least one verification command is required before marking a real auto-fix complete.",
      testResults: [],
      errors: ["missing verification command"],
      output: { blockedBy: "missing_verification_commands" },
      extraSecrets,
    });
  }

  if (!input.codexRunner || !input.testRunner) {
    return finish(input, {
      decision: "manual_action",
      status: "skipped",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: "Command policy passed; provide injected Codex and test runners to execute real fix mode. No commands were run.",
      testResults: [],
      errors: [],
      output: { safePlan: true, commands: commandPolicyResults.map((result) => result.normalizedCommand) },
      extraSecrets,
    });
  }

  let codexResult: GatedRealCodexRunnerResult;
  try {
    codexResult = await input.codexRunner.run({
      missionId: input.missionId,
      projectId: input.projectId,
      repoUrl: input.passport.repo.url,
      defaultBranch: input.passport.repo.default_branch,
      missionFiles: input.missionFiles,
      approvalIds: input.approvalIds ?? [],
      commands: commandPolicyResults.map((result) => result.normalizedCommand),
      branchName: input.branchName,
      workspaceRoot,
      timeoutMs,
      mode: "real",
      fixMode: true,
    });
  } catch (error) {
    const message = formatRunnerError("Codex runner", error, extraSecrets);
    return finish(input, {
      decision: "fix_failed",
      status: "failed",
      now,
      gates: baseGates,
      regressionCoverage,
      recommendedNextAction: message,
      testResults: [],
      errors: [message],
      output: { codexStatus: "runner_exception" },
      extraSecrets,
    });
  }
  const redactedCodexResult = redactJson(codexResult, extraSecrets);

  if (redactedCodexResult.status !== "succeeded") {
    return finish(input, {
      decision: redactedCodexResult.status === "manual_action" ? "manual_action" : "fix_failed",
      status: redactedCodexResult.status === "failed" ? "failed" : "skipped",
      now,
      gates: baseGates,
      regressionCoverage,
      codexResult: redactedCodexResult,
      workerRuns: [redactedCodexResult.workerRun],
      artifacts: redactedCodexResult.artifacts,
      events: redactedCodexResult.events,
      recommendedNextAction: redactedCodexResult.reason,
      testResults: [],
      errors: [redactedCodexResult.reason],
      output: { codexStatus: redactedCodexResult.status },
      extraSecrets,
    });
  }

  const testResults: Array<GatedRealTestRunnerResult & { command: string; group: VerificationCommandGroup }> = [];
  for (const command of commands) {
    let testResult: GatedRealTestRunnerResult;
    try {
      testResult = await input.testRunner.run({
        command: command.command,
        group: command.group,
        cwd: workspaceRoot,
        workspaceRoot,
        timeoutMs,
      });
    } catch (error) {
      testResult = {
        status: "failed",
        output: "",
        error: formatRunnerError("Test runner", error, extraSecrets),
      };
    }

    const redactedTestResult = redactJson(testResult, extraSecrets);
    testResults.push({ ...redactedTestResult, command: command.command, group: command.group });
    if (redactedTestResult.status !== "passed") {
      return finish(input, {
        decision: "test_failed",
        status: "failed",
        now,
        gates: baseGates,
        regressionCoverage,
        codexResult: redactedCodexResult,
        workerRuns: [redactedCodexResult.workerRun],
        artifacts: redactedCodexResult.artifacts,
        events: redactedCodexResult.events,
        recommendedNextAction: `Fix verification failure from ${command.group}: ${command.command}`,
        testResults,
        errors: [redactedTestResult.error ?? redactedTestResult.output],
        output: { failedCommand: command.command, group: command.group },
        extraSecrets,
      });
    }
  }

  return finish(input, {
    decision: "fixed",
    nextStatus: canTransition(input.missionStatus, MissionStatus.qa_running) ? MissionStatus.qa_running : undefined,
    status: "succeeded",
    now,
    gates: baseGates,
    regressionCoverage,
    codexResult: redactedCodexResult,
    workerRuns: [redactedCodexResult.workerRun],
    artifacts: [
      ...redactedCodexResult.artifacts,
      createRegressionArtifact(input, regressionCoverage, now),
    ],
    events: redactedCodexResult.events,
    recommendedNextAction: "Regression, unit, and e2e verification passed through injected runners; return to QA.",
    testResults,
    errors: [],
    output: { codexStatus: redactedCodexResult.status, verifiedCommands: commands.map((command) => command.command) },
    extraSecrets,
  });
}

function attemptsExceededDecision(
  input: GatedRealAutoFixLoopInput,
  now: string,
  gates: GatedRealAutoFixLoopGates,
  regressionCoverage: RegressionCoverageResult,
  extraSecrets: string[],
): GatedRealAutoFixLoopResult | undefined {
  const currentAttempt = input.currentAttempt ?? 0;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_MISSION_ATTEMPTS;
  const maxBugAttempts = input.maxBugAttempts ?? DEFAULT_MAX_BUG_ATTEMPTS;
  const exhaustedBug = input.bugs.find((bug) => (input.perBugAttempts?.[bug.id] ?? 0) >= maxBugAttempts);

  if (currentAttempt < maxAttempts && exhaustedBug === undefined) {
    return undefined;
  }

  const reason = exhaustedBug
    ? `Bug ${exhaustedBug.id} reached max attempts ${maxBugAttempts}; pause for human review.`
    : `Mission attempts ${currentAttempt} reached max attempts ${maxAttempts}; pause for human review.`;

  return finish(input, {
    decision: "paused",
    nextStatus: canTransition(input.missionStatus, MissionStatus.paused) ? MissionStatus.paused : undefined,
    status: "skipped",
    now,
    gates,
    regressionCoverage,
    recommendedNextAction: reason,
    testResults: [],
    errors: [reason],
    output: { blockedBy: "max_attempts", currentAttempt, maxAttempts, maxBugAttempts, exhaustedBugId: exhaustedBug?.id },
    extraSecrets,
  });
}

function evaluateRegressionCoverage(input: RegressionCoverageInput | undefined, bugs: BugReport[]): RegressionCoverageResult {
  const existingPath = input?.existingSpecPath?.trim();
  const existingContent = input?.existingSpecContent?.trim();
  if (existingPath && existingContent) {
    const validation = validateRegressionContent(existingContent, bugs);
    return validation.errors.length === 0
      ? { present: true, source: "existing", path: existingPath, errors: [] }
      : {
        present: false,
        source: "missing",
        path: existingPath,
        errors: validation.errors,
        missingCoverage: validation.missingCoverage,
      };
  }

  const generated = input?.generatedSpec;
  const generatedPath = generated?.path?.trim();
  const generatedContent = generated?.content?.trim();
  if (generated?.valid === true && generatedPath && generatedContent) {
    const validation = validateRegressionContent(generatedContent, bugs);
    return validation.errors.length === 0
      ? { present: true, source: "generated", path: generatedPath, errors: [] }
      : {
        present: false,
        source: "missing",
        path: generatedPath,
        errors: validation.errors,
        missingCoverage: validation.missingCoverage,
      };
  }

  const missingCoverage = reproducibleBugsRequiringCoverage(bugs).map(toRegressionCoverageMissingBug);
  return {
    present: false,
    source: "missing",
    errors: generated?.errors?.length ? generated.errors : ["Regression coverage is required for reproducible bugs."],
    ...(missingCoverage.length === 0 ? {} : { missingCoverage }),
  };
}

interface RegressionContentValidation {
  errors: string[];
  missingCoverage: RegressionCoverageMissingBug[];
}

function validateRegressionContent(content: string, bugs: BugReport[]): RegressionContentValidation {
  const errors: string[] = [];
  const missingCoverage = missingRegressionCoverage(content, bugs);

  if (!hasRegressionTestStructure(content)) {
    errors.push("Regression coverage must contain meaningful test structure.");
  }

  for (const bug of missingCoverage) {
    errors.push(`Missing regression coverage for reproducible bug ${bug.id}: ${bug.title}.`);
  }

  return { errors, missingCoverage };
}

function hasRegressionTestStructure(content: string): boolean {
  return /\b(?:test|it|describe)\s*\(/i.test(content) || /\b(?:async\s+def|def)\s+test_[A-Za-z0-9_]+\s*\(/.test(content);
}

function missingRegressionCoverage(content: string, bugs: BugReport[]): RegressionCoverageMissingBug[] {
  const normalizedContent = normalizeRegressionSignal(content);
  return reproducibleBugsRequiringCoverage(bugs)
    .filter((bug) => !bugRegressionSignals(bug).some((signal) => normalizedContent.includes(signal)))
    .map(toRegressionCoverageMissingBug);
}

function bugRegressionSignals(bug: BugReport): string[] {
  return [bug.id, bug.title, ...bug.reproduction_steps]
    .map(normalizeRegressionSignal)
    .filter((signal) => signal.length >= 3);
}

function toRegressionCoverageMissingBug(bug: BugReport): RegressionCoverageMissingBug {
  return { id: bug.id, title: bug.title };
}

function reproducibleBugsRequiringCoverage(bugs: BugReport[]): BugReport[] {
  return bugs.filter((bug) => bug.reproduction_steps.length > 0 && bug.status !== "accepted" && bug.status !== "wont_fix");
}

function normalizeRegressionSignal(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatRunnerError(label: string, error: unknown, extraSecrets: string[]): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactText(`${label} threw: ${message}`, extraSecrets);
}

function hasReproducibleBug(bugs: BugReport[]): boolean {
  return reproducibleBugsRequiringCoverage(bugs).length > 0;
}

function buildVerificationCommands(input: GatedRealAutoFixLoopInput): Array<{ group: VerificationCommandGroup; command: string }> {
  const defaultTestCommands = toCommandList(input.passport.commands.test);
  const groups: Array<[VerificationCommandGroup, string[] | undefined]> = [
    ["regression", input.verificationCommands?.regression ?? defaultTestCommands],
    ["unit", input.verificationCommands?.unit],
    ["e2e", input.verificationCommands?.e2e],
  ];

  return groups.flatMap(([group, commands]) => (commands ?? []).map((command) => ({ group, command })));
}

interface FinishFields {
  decision: GatedRealAutoFixDecision;
  nextStatus?: MissionStatusValue | undefined;
  status: WorkerRun["status"];
  now: string;
  gates: GatedRealAutoFixLoopGates;
  regressionCoverage: RegressionCoverageResult;
  recommendedNextAction: string;
  testResults: Array<GatedRealTestRunnerResult & { command: string; group: VerificationCommandGroup }>;
  errors: string[];
  output: Record<string, unknown>;
  codexResult?: GatedRealCodexRunnerResult | undefined;
  workerRuns?: WorkerRun[] | undefined;
  artifacts?: Artifact[] | undefined;
  events?: MissionEvent[] | undefined;
  extraSecrets: string[];
}

function finish(input: GatedRealAutoFixLoopInput, fields: FinishFields): GatedRealAutoFixLoopResult {
  const workerRun = createWorkerRun(input, fields.status, fields.now, {
    decision: fields.decision,
    nextStatus: fields.nextStatus,
    recommendedNextAction: fields.recommendedNextAction,
    gates: fields.gates,
    regressionCoverage: fields.regressionCoverage,
    ...fields.output,
  }, fields.errors, fields.extraSecrets);
  const events = [
    createEvent(input.missionId, "auto_fix.real.started", "Gated real auto-fix loop evaluated gates.", { workerRunId: workerRun.id }, fields.now),
    createEvent(input.missionId, `auto_fix.real.${eventDecision(fields.decision)}`, fields.recommendedNextAction, { workerRunId: workerRun.id, decision: fields.decision }, fields.now),
    ...(fields.events ?? []),
  ];
  const result: GatedRealAutoFixLoopResult = {
    decision: fields.decision,
    ...(fields.nextStatus === undefined ? {} : { nextStatus: fields.nextStatus }),
    workerRun,
    workerRuns: [workerRun, ...(fields.workerRuns ?? [])],
    artifacts: fields.artifacts ?? [],
    events,
    gates: fields.gates,
    recommendedNextAction: fields.recommendedNextAction,
    regressionCoverage: fields.regressionCoverage,
    ...(fields.codexResult === undefined ? {} : { codexResult: fields.codexResult }),
    testResults: fields.testResults,
    errors: fields.errors,
  };

  return redactJson(result, fields.extraSecrets);
}

function createWorkerRun(input: GatedRealAutoFixLoopInput, status: WorkerRun["status"], now: string, output: Record<string, unknown>, errors: string[], extraSecrets: string[]): WorkerRun {
  return {
    id: `worker-run-${input.missionId}-auto-fix-real-gated`,
    mission_id: input.missionId,
    worker_type: "auto_fix",
    status,
    mode: "real",
    started_at: now,
    finished_at: now,
    exit_code: status === "succeeded" ? 0 : undefined,
    input: redactJson({ missionId: input.missionId, projectId: input.projectId, bugCount: input.bugs.length }, extraSecrets),
    output: redactJson(output, extraSecrets),
    error: errors.map((error) => redactText(error, extraSecrets)).join("\n"),
    logs: [
      "gated real auto-fix loop evaluated",
      `auto-fix decision: ${output.decision}`,
      "real execution disabled unless injected runners are supplied",
      "git push, deploy, and external network calls disabled",
    ],
    metadata: {
      generatedBy: "auto-fix-loop",
      mode: "real-gated",
      realNetworkCall: false,
      pushed: false,
      externalServicesCalled: false,
    },
    created_at: now,
    updated_at: now,
  };
}

function createRegressionArtifact(input: GatedRealAutoFixLoopInput, coverage: RegressionCoverageResult, now: string): Artifact {
  const content = [
    "# Regression Coverage",
    "",
    `- Present: ${coverage.present}`,
    `- Source: ${coverage.source}`,
    `- Path: ${coverage.path ?? "n/a"}`,
    "- Real network calls: false",
    "",
  ].join("\n");
  return {
    id: `artifact-${input.missionId}-real-regression-coverage`,
    mission_id: input.missionId,
    type: "generated_test",
    path: `missions/${input.missionId}/real-regression-coverage.md`,
    worker_run_id: `worker-run-${input.missionId}-auto-fix-real-gated`,
    content,
    mime_type: "text/markdown",
    size: Buffer.byteLength(content, "utf8"),
    metadata: { generatedBy: "auto-fix-loop", mode: "real-gated", realNetworkCall: false, pathOnly: false },
    created_at: now,
  };
}

function createEvent(missionId: string, type: string, message: string, payload: Record<string, unknown>, now: string): MissionEvent {
  return {
    id: `event-${missionId}-${type.replaceAll(".", "-")}-${stableSuffix(payload)}`,
    mission_id: missionId,
    type,
    message: redactText(message),
    payload: redactJson(payload),
    created_at: now,
  };
}

function eventDecision(decision: GatedRealAutoFixDecision): string {
  return decision.replace(/[^a-z0-9_]+/g, "_");
}

function toCommandList(command: string | string[]): string[] {
  return Array.isArray(command) ? command : [command];
}

function stableSuffix(payload: Record<string, unknown>): string {
  const source = String(payload.workerRunId ?? payload.decision ?? "root");
  return source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "root";
}
