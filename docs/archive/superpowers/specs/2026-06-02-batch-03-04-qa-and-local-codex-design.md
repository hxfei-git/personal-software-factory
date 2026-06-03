# Batch 3/4 Design: ai-novelist Deterministic QA And Gated Local Codex

## Scope

This spec covers `enhance_plan.md` Batch 3 and Batch 4:

- Batch 3: upgrade deterministic QA from a body-visible smoke check into an `ai-novelist` project-level QA executor.
- Batch 4: prove gated local real Codex execution on fixture/local mirror inputs without push, PR creation, deployment, or provider calls.

Batch 1/2 surfaces remain intact. Hub resource pages, Mission creation, Approval decisions, generic preflight, queue wrapper WorkerRun semantics, and inline/queued compatibility are not reworked.

## Safety Boundary

The default path remains safe:

- no GitHub, Coolify, Uptime Kuma, Plane, or external provider API calls;
- no AI provider calls;
- no remote clone/update;
- no push, PR creation, deployment, or production mutation;
- no execution on `main` or `master`;
- no token, password, secret, API key, authorization header, cookie, or credential in logs, artifacts, API responses, Hub UI, or test snapshots.

If the local `ai-novelist` mirror, target URL, verified selectors, executable, approval, workspace, or safe command policy is missing, the worker returns `blocked` or `manual_action` with evidence and next steps. It must not fabricate a passed QA or Codex result.

## Existing Architecture Alignment

The current architecture already has the right seams:

- Orchestrator API has gated action routes for `qa-playwright` and `codex-real`.
- `@psf/worker-runtime` accepts whitelisted job types including `qa.playwright` and `codex.real`.
- `apps/worker-runner` consumes queue jobs, updates the queue wrapper WorkerRun, persists child resources, records MissionEvents, and applies conservative `mission-core` transitions.
- `workers/qa-worker` has deterministic QA result objects, QARun/Bug/Artifact/Event creation, secret redaction, and path-only screenshot/trace/log artifacts.
- `workers/codex-worker` has a real runner abstraction with approval, branch, workspace, command, timeout, executable, no-push, and redaction gates.
- Hub already displays Mission Detail resources and should remain a view/controller over Orchestrator API only.

The implementation should fill missing project context and scenario depth rather than replace these boundaries.

## Orchestrator Payload Design

### QA Playwright Payload

For `POST /missions/:id/actions/qa-playwright`, Orchestrator constructs a secret-safe queued job payload:

- `passport`: parsed Project Passport from Project Registry.
- `qaCharter`: `projects/<projectId>/qa-charter.md`, empty string only when the file is absent.
- `targetUrl`: first non-empty value from:
  1. request body `targetUrl`
  2. database Project `staging_url`
  3. database Project `production_url`
  4. passport `urls.local`
  5. passport `urls.staging`
  6. passport `urls.production`
- `missionFiles`: `mission.md`, `acceptance.md`, `technical-notes.md`, `risk-notes.md`.
  - Prefer planner artifacts and Mission fields when available.
  - Use safe fallback text when an artifact is absent.
- `commands`: e2e command metadata from Project Passport, for policy/review only.
- `enableRealMode`, approval metadata, and route gate metadata already used by gated real action jobs.

The API response remains sanitized. It may return `accepted`, `workerRunId`, `jobId`, `jobType`, and safe readiness metadata, but not raw secrets or command output.

Missing or invalid target URL produces a readable preflight block for real QA. Dry-run demo shortcuts remain compatible.

### Codex Real Payload

For `POST /missions/:id/actions/codex-real`, Orchestrator constructs:

- `passport`
- `missionFiles`
- `repoUrl`: local mirror path or `file://` URL only; remote clone/update is not supported in this batch.
- `defaultBranch`: passport default branch.
- `branchName`: default `agent/<projectId>-<missionId>` unless a safe request value is provided.
- `workspaceRoot`: request value or configured `PSF_WORKSPACE_ROOT`.
- `commands`: safe command candidates from passport `test`, `build`, optional `lint`, optional `e2e`.
- `approvalIds`: policy grant ids derived from approved Mission Approvals.
- `approvalRecordIds`: persisted Approval record ids for audit.

The API should reject or block unsafe context early when possible, but final workspace and command policy still belongs in `RealCodexRunner`.

## QA Worker Design

### Deterministic Scenario Model

Add a project-level deterministic scenario abstraction. The first `ai-novelist` scenario set contains:

- `smoke_home`
- `create_or_start_novel`
- `generate_or_wait_for_content`
- `review_or_report_visible`
- `duplicate_click_or_loading_guard`

Each scenario has:

- `id`
- `title`
- `sourceFlowIds` from Project Passport `core_flows`
- `charterReferences` from `qa-charter.md`
- `requiredSelectors` or `selectorStatus`
- `manualActionWhenUnverified`
- execution result with `passed`, `failed`, or `blocked`

Because `project.passport.yaml` marks the real commands and layout as `manual-verification-required`, unknown selectors do not pass. They create blocked/manual-action evidence unless an injected executor or verified selector map proves the flow.

### Execution Modes

- Without `targetUrl`: blocked/manual action, no browser opened.
- With invalid `targetUrl`: blocked/manual action, no browser opened.
- With injected executor: run the provided executor for tests and deterministic worker-runner coverage.
- With `ENABLE_REAL_PLAYWRIGHT=1` and valid `targetUrl`: open browser, execute verified scenarios, and collect evidence.
- Without real gate and without executor: blocked/manual action.

### Evidence And Artifacts

Deterministic QA output includes:

- `qa-report.md`
- `bugs.json`
- `qa-summary.json`
- screenshot artifact path
- trace artifact path
- deterministic log artifact path

The QA report records:

- Mission and Project ids
- mode `deterministic`
- `targetUrl`
- `browserOpened`
- `stagingVisited`
- `passed`
- `failed`
- `manualActionRequired`
- scenario summary
- console error summary
- page error summary
- failed request summary
- evidence paths

All URL, console, network, error, and artifact content is redacted.

### Bug JSON Contract

Each deterministic bug must be schema-valid and include:

- `title`
- `severity`
- `reproductionSteps`
- `expectedResult`
- `actualResult`
- `evidence.screenshotPath`
- `evidence.tracePath`
- `evidence.logPath`
- `evidence.scenarioId`
- `suggestedFixDirection`

Evidence must not include full novel body text, user manuscript content, tokens, passwords, cookies, authorization headers, or API keys.

## Codex Worker Design

`RealCodexRunner` remains the execution boundary. This batch strengthens proof and payload integration:

- use only operator-prepared local mirrors under `PSF_WORKSPACE_ROOT/mirrors`;
- create a worktree under `PSF_WORKSPACE_ROOT/<project>/<mission>`;
- create an `agent/*` branch;
- refuse `main` and `master`;
- refuse existing target branch or workspace path;
- require approved `real_codex_execution` policy grant;
- require absolute `CODEX_EXECUTABLE`;
- require safe `CODEX_SANDBOX=workspace-write|read-only`;
- require `CODEX_APPROVAL_MODE=on-request`;
- enforce command allowlist/denylist;
- enforce timeout;
- pass only an allowlisted non-secret child environment;
- record `stdout`, `stderr`, `dev-summary`, `diff-summary`, `local-commit-summary`, prompt, and command artifacts;
- record `realNetworkCall=false`, `pushed=false`, `realExternalCall=false`.

Fixture proof uses a disposable git repo and fake Codex executable. It must prove the branch/worktree path, main/master immutability, no push, artifact generation, and redaction. The fixture does not call external providers and does not need user credentials.

## Worker Runner Design

No schema-level parent/child refactor is introduced. The existing queue wrapper WorkerRun remains:

- wrapper status: `queued -> running -> succeeded|failed|cancelled`
- child WorkerRuns: actual QA/Codex worker outputs
- wrapper `output.childWorkerRunIds`, `childQARunIds`, `childArtifactIds`, `childBugReportIds`

For `qa.playwright`:

- pass full payload into `runDeterministicPlaywrightQa`;
- persist child WorkerRun, QARun, artifacts, bugs, and events;
- when QARun has open bugs and the Mission is legally in `qa_running`, transition to `bugs_found`;
- when QARun passes with no open bugs and transition is legal, transition to `ready_for_review`;
- otherwise only record `mission.action_result`.

For `codex.real`:

- pass full payload into `RealCodexRunner`;
- persist child WorkerRun, artifacts, and events;
- do not force Mission transition unless `mission-core` allows it in later stages.

## Hub Design

Hub remains a read/control surface over Orchestrator API. It does not evaluate QA scenarios, inspect files directly, run shell commands, or call providers.

Minimal updates are acceptable:

- Mission Detail should visibly show QARun report path, screenshot directory/path, trace path, log artifact path, bugs, and artifacts.
- WorkerRun detail should make queue wrapper versus child WorkerRun clear.
- Real action buttons may remain readiness-only unless already safe to wire through Orchestrator. If wired, they must call only Orchestrator protected routes and display accepted/blocked results.

## Error Handling

- Missing target URL: `blocked` QA result, skipped QARun, manual-action report.
- Invalid URL: `blocked` QA result, skipped QARun, sanitized reason.
- Unknown selectors: blocked/manual-action scenario evidence, not passed.
- Missing local mirror: Codex `manual_action`.
- Remote repo URL: Codex `manual_action`.
- Missing approval: Codex blocked/manual-action via approval policy.
- Missing executable: Codex `manual_action`.
- Unsafe command: Codex `manual_action` before worktree creation when possible.
- Worker Runner illegal Mission transition: leave status unchanged and keep action/result events.

## Testing Plan

Focused tests are added before broad checks:

### QA Worker

- missing target URL returns blocked/manual-action;
- invalid target URL returns blocked;
- injected executor passed returns passed QA, no bugs, schema-valid QARun;
- injected executor failed returns schema-valid bugs, QA report, summary, and evidence paths;
- selector-unverified scenario creates manual-action evidence;
- secret redaction covers logs, evidence, report, summary, bugs, artifacts.

### Orchestrator API

- `qa-playwright` queued payload includes passport, targetUrl, qaCharter, missionFiles, e2e command metadata;
- missing target URL returns readable preflight block;
- `codex-real` queued payload includes passport, missionFiles, local repoUrl, safe commands, branchName, workspaceRoot, approval ids;
- API responses do not expose secrets.

### Worker Runner

- `qa.playwright` persists child WorkerRun, QARun, Artifact, Bug, MissionEvent;
- QA failure with bug conservatively transitions only when `mission-core` permits;
- `codex.real` persists child WorkerRun, Artifact, MissionEvent;
- wrapper output records child ids and safe summaries.

### Codex Worker

- fixture repo creates local mirror, `agent/*` branch, and worktree;
- main/master are not modified;
- no push is attempted;
- stdout/stderr/dev-summary/diff-summary/local-commit-summary artifacts are generated;
- missing executable, approval, workspace mirror, or unsafe command returns blocked/manual-action;
- secret redaction covers stdout, stderr, artifacts, result JSON, and child env.

### Hub

Only if Hub changes:

- Mission Detail renders QA artifact paths, bug evidence, WorkerRun queue/child distinction;
- no token/secret is shown.

## Verification Commands

Run focused checks first:

```bash
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/worker-runner test
```

Then run broader checks:

```bash
pnpm typecheck
pnpm test
```

If Hub is modified:

```bash
pnpm --filter @psf/hub test
pnpm build
```

## Documentation Updates

Implementation must update:

- `docs/progress.md`
- `docs/progress/batch-03-04-qa-and-local-codex.md`
- QA evidence documentation, either existing QA docs or a focused deterministic QA doc
- API docs for queued QA/Codex payload and response boundaries
- Codex/local workspace docs for local mirror, branch, approval, executable, and no-push gates
- safety docs when new guardrails or redaction surfaces are added

All documentation must state that default behavior does not push, create PRs, deploy, call external providers, or use a real AI provider.

## Self-Review Result

- 占位扫描：本 spec 不保留未定事项或未完成实现标记。
- Internal consistency: Orchestrator supplies context, Worker Runner consumes jobs, QA/Codex workers own execution logic, and Hub only displays API state.
- Scope check: Batch 3/4 are combined because both require queued project context and local evidence, but external integrations, fix loop regression, PR, deploy, monitor, and Plane sync remain out of scope.
- Ambiguity check: missing real target/mirror/selector/executable/approval produces blocked or manual-action output rather than success.
