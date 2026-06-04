# Control Plane Readiness Convergence Design

## Context

B1 has already completed the documentation drift audit and minimal cleanup. Current implementation facts remain in `summary.md`, `docs/architecture/structure.md`, `docs/status/progress.md`, `docs/debug/debug.md`, `README.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, and `docs/runtime/queue-runtime.md`.

This B2 document is a design record only. It does not change the current architecture facts, does not define an implementation plan, and does not enable real Codex execution, real Playwright/browser execution, provider network calls, push, PR creation, deploy, monitor creation, or Plane sync.

The current `buildRealModeReadiness` surface exposes `safeToRun`, but that field only reflects route-level queue readiness. It checks queue mode, Worker Runtime configuration, route env gates, integration env, and Mission approvals. It does not prove injected runner or transport availability, local mirror readiness, target URL validity, selector verification, command policy success, workspace guards, or operation gates.

The B2 goal is to design a compatible readiness/blocker contract that makes blocked and manual-action states operational across the Orchestrator API, Hub, Worker Runner, and integrations.

## Goals

- Make Orchestrator API the canonical response outlet for readiness and blocker data.
- Preserve compatibility with existing API, Hub, and tests by keeping `safeToRun` as a legacy field.
- Add `canQueue`, `canExecute`, `blockers[]`, and `recommendedNextAction` as the primary readiness contract.
- Make blockers structured, sorted, redacted, and suitable for API, Hub, Worker Runner, and integration result surfaces.
- Let Hub display queue readiness, execution readiness, and concrete blockers without inferring env, approval, transport, or operation gate state by itself.
- Let Worker Runner and integrations map existing manual-action outputs into the same blocker shape without forcing an immediate shared package type migration.
- Keep all default safety boundaries unchanged.

## Non-Goals

- Do not enable real Codex, real Playwright/browser, provider network calls, push, PR creation, deploy, monitor creation, or Plane sync.
- Do not remove or rename `safeToRun` in B2.
- Do not force a shared package schema migration in B2.
- Do not introduce a broad refactor of API, Hub, Worker Runner, integrations, or shared schemas.
- Do not include step-by-step coding tasks in this design.
- Do not treat `docs/vision/plan.md` as current implementation fact.

## Architecture Boundary

Orchestrator API is the canonical response outlet. It should shape Mission summary readiness, dashboard readiness, blocked gated-action responses, and preflight error bodies into the same readiness/blocker contract.

This does not make Orchestrator the only source of execution observations. Worker Runner and integration adapters may still produce their existing result types. B2 should map those results into the canonical blocker shape at the boundary where they become API-visible, Hub-visible, or WorkerRun-visible state.

Shared package type migration is deferred. Hub can keep local API response types, Worker Runner can keep handler result types, and integrations can keep adapter result types. Short-term duplicated types are acceptable if B3 covers the API, Hub, Worker Runner, and integration boundaries with focused contract tests.

## Readiness Entry Contract

Each gated real action readiness entry should keep existing compatibility fields and add the new primary contract fields:

```ts
type ActionReadiness = {
  key: string;
  label: string;
  action: string;
  jobType: string;

  canQueue: boolean;
  canExecute: boolean;
  blockers: ReadinessBlocker[];
  recommendedNextAction: string;

  safeToRun: boolean; // legacy compatibility only

  realNetworkCall: false;
  realExternalCall: false;
  realPush: false;
  realDeploy: false;

  enabled: boolean;
  configured: boolean;
  ready: boolean;
  missingEnv: string[];
  requiredApprovalTypes: string[];
  approvedApprovalTypes: string[];
  missingApprovalTypes: string[];
  message: string;
};
```

`safeToRun` remains as a legacy compatibility field. Its meaning is route-level queue readiness only. It must not be treated as proof that real execution can happen. New Hub display logic, new API decisions, and new B3 tests should prefer `canQueue`, `canExecute`, and `blockers[]`.

`canQueue` means the Orchestrator can accept the request and enqueue a whitelisted gated contract job.

`canExecute` means the action has the conditions needed for actual execution at the relevant boundary. The calculation must be derived from blockers:

```text
canQueue = no blocker has "queue" in blocks
canExecute = canQueue && no blocker has "execute" in blocks
```

If any queue blocker exists, `canExecute` must be false even when execution conditions appear satisfied. `canQueue=true` does not imply `canExecute=true`; this is the expected default for many gated real actions.

Summary readiness must be conservative. If it lacks enough evidence to confirm an execution condition, it must add a `requires_verification` blocker or a known static blocker. Summary readiness must not claim command policy, workspace guard, selector verification, injected runner, or injected transport success unless that condition was actually checked by route preflight, Worker Runner, or an integration result.

## Blocker Contract

Blockers should use one structured shape:

```ts
type ReadinessBlocker = {
  category:
    | "queue_acceptance"
    | "approval"
    | "configuration"
    | "policy"
    | "execution"
    | "safety";
  key: string;
  message: string;
  recommendedNextAction: string;
  severity: "blocking" | "manual_action" | "warning" | "info";
  blocks: Array<"queue" | "execute">;
  source: "orchestrator" | "worker_runner" | "integration" | "worker";
  details?: Record<string, unknown>;
};
```

`category` describes the kind of blocker. It does not decide whether queue or execution is blocked. The `blocks` field carries that semantic. For example, an approval blocker may block queue acceptance for an API route, while an operation gate blocker may block only execution after a job has already been queued.

`details` is sanitized metadata only. It may contain enum values, env var names, action names, job types, resource ids, safe relative paths, boolean flags, and names of missing items. It must not contain tokens, passwords, authorization values, credentials, sessions, JWTs, bearer values, secret-like values, raw provider payloads, long error text, raw stdout, or raw stderr. API response bodies and preflight error bodies must pass blocker details through the existing redaction and sanitization boundary.

Blockers should be sorted once by the canonical helper and consumed in that order by Hub and tests:

1. Severity order: `blocking`, `manual_action`, `warning`, `info`.
2. Blockers that block `queue` before blockers that only block `execute`.
3. Category order: `queue_acceptance`, `approval`, `configuration`, `policy`, `execution`, `safety`.
4. Stable `key` order for ties.

`recommendedNextAction` for a readiness entry comes from the highest-priority blocker after sorting. If there are no blockers, the action should still use conservative review wording rather than implying that an external side effect has already happened.

## Blocker Sources

The design should use small source-specific mapper helpers rather than one broad untyped mapper. Conceptual boundaries are:

- `readinessBlockersFromPreflightError`
- `readinessBlockersFromWorkerResult`
- `readinessBlockersFromIntegrationResult`
- `buildReadinessBlocker`
- `sortReadinessBlockers`
- `deriveReadinessState`

The exact function names may differ, but the boundary matters: each mapper should have a clear input type and should produce the same blocker shape.

`buildReadinessBlocker` should centralize default fields, stable keys, redaction of `details`, and fallback recommended actions. `deriveReadinessState` should be the only calculation point for `canQueue` and `canExecute`.

## Summary Readiness

Mission summary and dashboard readiness should include queue acceptance blockers such as:

- action execution mode is not `queued`;
- Worker Runtime is not configured;
- route env gate is disabled;
- required Mission approval is missing;
- provider env is missing for integration-backed actions.

Summary readiness may also include known static execution blockers such as:

- default Worker Runner has no injected Codex runner configured;
- default integration path has no injected transport configured;
- GitHub operation gates are disabled by default;
- local mirror is unverified;
- selector verification is required;
- target URL requires verification.

Known static blockers must be marked as such in safe details, for example with `evidence: "known_static"` or an equivalent field. They must not imply that Worker Runner already executed preflight.

Summary readiness must not fabricate command policy or workspace guard results. If those conditions are not checked in summary construction, the blocker should say that verification is required, not that verification failed or passed.

## Route And Preflight Responses

Gated real action route blockers should use the same shape as summary readiness. Current blocked/manual responses may keep their existing HTTP behavior and compatibility fields, but their bodies should add:

- `canQueue`;
- `canExecute`;
- `blockers[]`;
- `recommendedNextAction`;
- safety flags that remain false.

Route gate, action execution mode, missing approval, missing Worker Runtime, missing provider env, missing local mirror, missing target URL, missing passport command, invalid Mission status, and unsafe branch policy usually block both queue and execute. These blockers should use `blocks: ["queue", "execute"]`, because Orchestrator should not enqueue a job with missing required route context or a violated route policy.

`MISSION_ACTION_PREFLIGHT_BLOCKED` and similar 400 error bodies should also include sorted and redacted `blockers[]`. Hub and API tests should not need separate parsing logic for 200 blocked responses and 400 preflight errors.

Route preflight blockers should be generated through the same builder and mapper helpers used by other readiness surfaces. Avoid per-route hand-written blocker objects that drift in fields or wording.

## Worker Runner Result Mapping

Worker Runner is not the canonical schema owner, but real-job wrapper output, child output, and `mission.action_result` should expose blocker data when the result is blocked or manual-action.

If `manualActionRequired=true`, or a result status is `blocked` or `manual_action`, the public output shape must contain at least one execution blocker. If the underlying runner already returned blockers, the mapper should preserve, redact, and sort them without generating duplicate equivalent blockers. If no blockers exist, the mapper should derive a conservative fallback blocker from `reason` and `recommendedNextAction`.

Already queued Worker Runner results should not retroactively change queue semantics. Their blockers usually use `blocks: ["execute"]`. Defense-in-depth findings such as a remote repo URL, unsafe branch, missing runner, disabled Playwright runner, missing target URL, missing regression evidence, or missing transport may be `policy` or `execution` blockers with severity `blocking` or `manual_action`, but they should not set `canQueue=false` on a wrapper job that already entered the queue.

Typical Worker Runner mappings:

- `codex.real` without injected runner: `execution/injected_runner_missing`, `blocks: ["execute"]`, severity `manual_action`.
- `codex.real` remote repo URL or unsafe branch: `policy/local_mirror_required` or `policy/branch_policy`, `blocks: ["execute"]`, severity `blocking`.
- `qa.playwright` missing target URL or disabled runner: `configuration/target_url_missing` or `execution/playwright_runner_missing`.
- `qa.ai_exploratory` without approved executor path: `execution/ai_exploratory_executor_missing`.
- `fix.real` missing regression evidence or verification runner: `policy/regression_evidence_missing` or `execution/verification_runner_missing`.
- `github.pr` default path: `execution/injected_transport_missing` and `policy/operation_gate_disabled`, with messages that say no push and no PR creation happened.

Worker output should keep existing `manualActionRequired`, `status`, `reason`, and `recommendedNextAction` fields for compatibility.

## Integration Result Mapping

Integration adapters may keep existing result fields such as `manualActions[]`, `decision`, `safeToRun`, `missingEnv[]`, and `realNetworkCall`. The mapper should convert those into concrete blockers when the result becomes API-visible, Hub-visible, or WorkerRun-visible.

Mapping rules:

- `missingEnv[]` becomes configuration blockers.
- `manualActions[]` becomes execution blockers.
- Safe operation gate information such as `allowNetwork:false`, `allowPushBranch:false`, or `allowCreatePullRequest:false` becomes policy or execution blockers.
- Missing injected transport becomes an execution blocker.
- `safeToRun:false` is not itself a blocker reason. It only means the mapper must find concrete reasons from `missingEnv[]`, `manualActions[]`, transport state, operation gates, or network gates.
- If no concrete reason is available, use an `unclassified_execution_blocker` or `unknown_manual_action` blocker and recommend manually inspecting adapter output.

Default integration paths must keep `realNetworkCall:false`. Fake transport tests may produce `realNetworkCall:true` in controlled test scenarios, but that does not change the default API, Hub, or Worker Runner safety boundary.

## Hub Operator UX

Hub should consume Orchestrator API readiness. It should not infer env, approval, transport, runner, provider, or operation gate state by itself.

Gated real action buttons should use `canQueue`, not `safeToRun`, to decide whether a contract job can be queued. If `canQueue=false`, the button is disabled and should display the highest-priority queue blocker. If `canQueue=true` and `canExecute=false`, the button may allow the operator to queue a gated contract job, but the label must not say `Run real ...`.

Safer button language:

- `github.pr`: create or queue PR preview/manual-action. It does not push or create a PR by default.
- `qa.playwright`: queue gated QA evidence. It may produce blocked/manual-action evidence.
- `codex.real` and `fix.real`: queue gated manual-action unless injected runners are configured.

Readiness rows should show queue readiness, execution readiness, safety flags, the recommended next action, and the sorted blocker list. Hub should display the API blocker order as-is and should not define its own blocker sorting.

Hub may show blocker category, severity, message, recommended next action, and source. It should only show `details` if the values are already redacted safe metadata.

Hub API types may keep `safeToRun` for compatibility, but new display logic should not depend on it.

## Safety And Error Handling

Unknown readiness states should become manual-action blockers, not ready states. If a blocker cannot be classified, use `unclassified_execution_blocker` or `unknown_manual_action` with a safe recommended next action.

`canExecute=true` should only appear when the relevant boundary has enough evidence and no execution blockers. Summary readiness without evidence must generate a verification blocker. Route, Worker Runner, or integration results may omit execution blockers only when that boundary actually checked the relevant conditions.

Safety flags remain explicit and false on readiness, blocked/manual-action, gated real action response, and Worker Runner real-job wrapper or child output whenever those fields appear:

```ts
realNetworkCall: false;
realExternalCall: false;
realPush: false;
realDeploy: false;
```

Do not force unrelated dry-run outputs to add all four fields. B2 should not become a schema migration for every response type.

Blocked route responses can keep current status-code behavior. A response can be `accepted:false` with HTTP 200, or a preflight validation error with HTTP 400, but both bodies should expose the same sorted and redacted blocker shape.

Worker manual-action or blocked results must not advance Mission state to a success state. Existing conservative auto-transition behavior should remain.

## B3 Contract Test Boundary

B3 should add focused contract tests and only the minimal production-code changes needed to make the contract explicit. It should not become a broad refactor.

Contract coverage should include:

- Mission summary readiness exposes `canQueue`, `canExecute`, sorted `blockers[]`, and legacy `safeToRun`.
- Queue mode, Worker Runtime, route gate, approval, provider env, and known static execution blockers produce stable blocker keys and recommendations.
- Summary readiness does not claim unverified command policy or workspace guard success or failure.
- Gated real action blocked responses and preflight error bodies expose the same blocker shape.
- Hub buttons use `canQueue` instead of `safeToRun`, and `canQueue=true` plus `canExecute=false` avoids `Run real ...` wording.
- Hub displays API blocker order and does not define separate sorting.
- Worker Runner manual-action or blocked real-job outputs expose execution blockers without changing queue semantics.
- Existing runner-provided blockers are preserved and sorted rather than duplicated.
- Integration mapping converts `missingEnv[]`, `manualActions[]`, transport state, and operation gates into concrete blockers.
- `safeToRun:false` without concrete integration reasons becomes an unclassified blocker rather than a fabricated cause.
- Blocker details and responses redact secret-like values.
- Safety flags remain explicit false where they appear on readiness, blocked/manual-action, gated real action responses, and Worker Runner real-job outputs.

## Documentation Maintenance

This design adds one Markdown file, so `summary.md` must be updated in the same change to keep the Markdown document map accurate.

This design does not update `docs/architecture/structure.md` or `docs/debug/debug.md` because it does not change current architecture facts and does not record a runtime debug or verification event. The commit body should state that reason if those files remain unchanged.

## Approval Boundary

Approval of this design authorizes only the B2 readiness/blocker design record. It does not authorize implementation, an implementation plan, provider network calls, real Codex, real Playwright/browser, push, PR creation, deploy, monitor creation, or Plane sync.
