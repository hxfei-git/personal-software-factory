# A1 ai-novelist Local Mirror DeepSeek Proof Design

## Context

B1 documentation drift cleanup, B2 readiness/blocker convergence, and B3 focused contract safety tests are complete. The next workstream is A1: prove a shortest local mirror gated-runner path for `ai-novelist`.

The operator-provided source checkout is `/home/ubuntu/1.project/ai-novelist`. A1 must not treat the current PSF passport metadata as verified just because the source checkout exists. Passport commands, local URL behavior, selectors, and target runtime behavior are only proven when this A1 run observes them and records safe evidence.

This document is a design record only. It does not implement A1, does not define an implementation plan, does not enable PSF-owned provider calls, does not enable real Codex execution, and does not authorize push, PR creation, deployment, monitor creation, Plane sync, or production mutation.

## Goal

A1 should prove that PSF can use an isolated `ai-novelist` local mirror under:

```text
workspaces/mirrors/ai-novelist
```

and produce redacted, auditable proof that:

- the mirror or worktree is safe and isolated from the operator source checkout;
- an operator-confirmed `ai-novelist` Web command can start a local target in DeepSeek provider mode;
- at least one real local target observation happened, such as page or health reachability;
- readiness and manual-action results use the B2/B3 `canQueue`, `canExecute`, `blockers[]`, and `recommendedNextAction` contract;
- PSF itself still performs no provider network call, push, PR creation, deploy, monitor creation, or Plane sync.

DeepSeek may be used by the target app, but the boundary is explicit: the provider call belongs to `ai-novelist` Web, not to PSF Orchestrator, Worker Runner, Hub, or integration adapters.

## Non-Goals

- Do not directly operate on `/home/ubuntu/1.project/ai-novelist` for proof work.
- Do not overwrite an existing `workspaces/mirrors/ai-novelist` directory.
- Do not claim all passport commands or selectors are globally verified unless each one has A1 evidence.
- Do not save DeepSeek prompts, responses, raw provider payloads, provider logs, tokens, cookies, authorization headers, credentials, sessions, JWTs, bearer values, or secret-like values.
- Do not default to generation, review, repair, or other provider-consuming smoke flows without a separate operator approval for that run.
- Do not enable PSF-owned real Codex, Playwright/browser, GitHub, Coolify, Uptime Kuma, Plane, push, PR creation, deploy, monitor creation, or provider transports.
- Do not introduce a broad schema migration, UI overhaul, or shared package refactor.

## Architecture Boundary

A1 uses five bounded surfaces:

- Mirror preparation: creates or verifies the isolated local mirror/worktree.
- Target Web process: starts `ai-novelist` Web from the mirror using an operator-confirmed command.
- Observation probe: proves a local target event happened.
- Evidence recorder: stores only redacted proof metadata and safe artifact references.
- Readiness/manual-action mapper: exposes success or failure through the existing blocker contract.

PSF is the controller and evidence recorder. The target app owns DeepSeek runtime behavior. PSF must not import target app provider credentials into API responses, WorkerRun outputs, Hub state, artifacts, docs, commits, or logs.

## Mirror Preparation

A1 must prepare or verify `workspaces/mirrors/ai-novelist` as an isolated mirror or worktree sourced from `/home/ubuntu/1.project/ai-novelist`.

If `workspaces/mirrors/ai-novelist` already exists, A1 must not overwrite it. The run may continue only when the directory is confirmed to be the expected `ai-novelist` repo or worktree. If the directory exists but is unexpected, incomplete, not a Git repo/worktree, or unsafe to classify, A1 stops with a manual-action report.

Before and after mirror preparation, A1 records sanitized Git metadata for both source checkout and mirror/worktree:

- `git status --short`;
- current branch;
- HEAD commit;
- whether the checked-out branch is `main`, `master`, `agent/*`, detached, or another name.

If proof uses an `agent/*` branch, A1 must confirm the source checkout `main` or `master` has not been modified by the proof. Source checkout mutations are not acceptable A1 evidence. Any source checkout pollution stops the run and produces manual-action output.

Mirror path checks must stay within PSF workspace guard expectations. Remote repository URLs, HTTP/SSH/SCP repo URLs, and ambiguous paths remain blocked by existing B2/B3 policy.

## Target Web Process

The Web start command must be operator-confirmed or explicitly verified before execution. A1 may record a command template, provider name, working directory, host, port, and process id as safe metadata. It must not record a full environment dump or key values.

The target Web process may use DeepSeek only through the target app boundary, for example by selecting provider `deepseek` and allowing `ai-novelist` to read its local environment. PSF must not read, echo, persist, or forward `DEEPSEEK_API_KEY` or equivalent provider secrets.

A1 must define a cleanup strategy before starting the process. On success, failure, interruption, or manual-action stop, the local Web process must be shut down and the stop must be confirmed. If shutdown cannot be confirmed, the whole proof becomes `manual_action`, not a warning. The blocker should identify `cleanup.web_process_stop_unconfirmed` and recommend manual inspection of PID, port, and provider quota.

The helper script in the target project may be unsafe as a default proof entry if it sources shell configuration or provider credentials implicitly. A1 should prefer an explicit operator-confirmed command whose provider, host, port, and working directory are visible without exposing secret values.

## Observation Probe

A1 must prove at least one real local target observation. Readiness records alone are insufficient.

The minimum acceptable observation is local page or health reachability for the target URL, such as:

- request target page or health endpoint;
- record HTTP status, target host/path, timestamp, and response type;
- confirm the result came from the mirror-started local Web process.

This minimum proof does not need to trigger generation, review, repair, or any other quota-consuming DeepSeek action.

If a smoke flow triggers DeepSeek generation, review, or repair, it requires a separate operator approval for that run. That smoke input must be non-sensitive test text, and evidence must not save the DeepSeek prompt or response body. Selector verification must come from the actual page or an operator-confirmed selector, not from guessed passport metadata.

## Evidence

A1 evidence may include:

- mirror path, branch, and HEAD metadata;
- source checkout branch and HEAD metadata;
- command template and provider name;
- target URL host/path and HTTP status;
- process start and confirmed stop metadata;
- screenshot path or log path only when content is safe;
- redacted screenshot/log summary;
- selector names or selector verification result;
- WorkerRun, Artifact, or manual-action resource ids.

Screenshots are optional and must be treated as sensitive if they may contain generated text, user manuscript text, provider output, prompt text, or credentials. If redaction cannot be guaranteed, A1 should save only screenshot metadata, not the image body.

Logs must be summarized and redacted. Long logs, raw provider payloads, prompt/response text, stdout/stderr dumps, env dumps, and secret-like values must not be written to PSF artifacts or docs. `docs/debug/debug.md` should receive only sanitized command/result summaries during implementation.

## Readiness And Manual-Action Semantics

A1 uses the B2/B3 readiness contract:

```text
canQueue = no queue blocker
canExecute = canQueue && no execute blocker
```

`safeToRun` remains a legacy route-level queue readiness field and must not be used as proof of execution readiness.

A1 success may record only observed facts, such as "this local mirror proof observed target page reachability." It must not globally mark passport commands, selectors, local URL behavior, or project execution as verified unless each item was explicitly checked and has safe evidence from this run.

Failure or uncertainty produces blocked/manual-action output with structured blockers. Example blocker keys include:

- `mirror.existing_path_unexpected`;
- `mirror.source_status_unreadable`;
- `mirror.source_main_polluted`;
- `target.web_command_unconfirmed`;
- `target.deepseek_env_missing`;
- `target.web_start_failed`;
- `observation.target_unreachable`;
- `observation.selector_verification_required`;
- `evidence.redaction_required`;
- `cleanup.web_process_stop_unconfirmed`.

If mirror preparation, target startup, DeepSeek configuration, target reachability, selector verification, artifact redaction, source/mirror Git safety, or cleanup cannot be confirmed, A1 stops and records manual-action output. It must not fabricate proof success.

## Safety Flags And Target Provider Metadata

PSF safety flags remain scoped to PSF-owned control-plane, worker, and integration behavior:

```ts
realNetworkCall: false;
realExternalCall: false;
realPush: false;
realDeploy: false;
```

If the target app internally calls DeepSeek, A1 must use separate metadata instead of changing PSF safety flags:

```ts
targetAppProviderCall: true;
targetProvider: "deepseek";
targetProviderBoundary: "ai-novelist-web";
```

If A1 only observes page or health reachability and does not trigger a provider-consuming flow, it should record `targetAppProviderCall` as `false` or `not_observed`, not infer a provider call from provider-mode startup alone.

No PSF response, WorkerRun, Artifact, Hub view, debug entry, or commit may imply that PSF itself called DeepSeek, pushed code, created a PR, deployed, created a monitor, or synced Plane.

## Acceptance Conditions

A1 proof is successful only when all of the following are true:

- `workspaces/mirrors/ai-novelist` is confirmed as the expected isolated mirror or worktree;
- source checkout `main` or `master` is not polluted by proof work;
- Web start command is operator-confirmed or explicitly verified;
- target Web process starts, is observed, and is confirmed stopped;
- at least one local page or health observation succeeds;
- evidence contains only redacted metadata or safe paths;
- readiness output uses `canQueue`, `canExecute`, `blockers[]`, and `recommendedNextAction`;
- PSF `realNetworkCall`, `realExternalCall`, `realPush`, and `realDeploy` remain false wherever those fields appear;
- any target app DeepSeek call is represented only by target-app metadata;
- the proof does not expand into global passport command or selector verification without item-level evidence.

If any condition fails, the A1 output is `manual_action` or `blocked` with a concrete blocker and safe next action.

## Testing And Verification Boundary

A1 implementation should use the smallest checks that prove the changed surface. PSF contract checks should focus on mirror guard behavior, blocker shape, safety flags, target-app provider metadata, cleanup failure handling, and redaction. It should not migrate shared schemas, create broad snapshots, or build a full UI automation framework.

The real local proof runs only against the isolated mirror and local target. It should start with page or health reachability. Provider-consuming smoke flows require separate operator approval and non-sensitive test input.

If implementation runs validation commands, starts/stops the Web process, creates evidence, or hits a manual-action failure, `docs/debug/debug.md` must record a sanitized summary. If implementation changes architecture, worker contracts, integration gates, API response semantics, or safety boundaries, the matching current fact docs must be updated in the same task.

## Documentation Maintenance

This design adds one Markdown file, so `summary.md` must be updated in the same commit to keep the Markdown document map accurate.

This design does not update `docs/architecture/structure.md` or `docs/debug/debug.md` because it is a design-only record: it changes no current architecture facts, runs no A1 proof, starts no target Web process, and records no runtime verification result. The commit body should state this reason if those files remain unchanged.

## Approval Boundary

Approval of this design authorizes only the A1 design record. It does not authorize implementation or an implementation plan. After user review confirms the written spec, the next step is to use `superpowers:writing-plans` to create a focused A1 implementation plan.
