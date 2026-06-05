# B3 Contract Safety Test Reinforcement Design

## Context

B1 documentation drift audit and minimal cleanup are complete. B2 readiness/blocker convergence is implemented and merged to `main`.

The current readiness contract is:

- `safeToRun` remains a legacy compatibility field for route-level queue readiness only.
- New decisions prefer `canQueue`, `canExecute`, sorted `blockers[]`, and `recommendedNextAction`.
- `canExecute` implies `canQueue`.
- Summary readiness must be conservative when execution evidence is missing.
- Default safety boundaries remain disabled: no real Codex execution, no real Playwright/browser execution, no provider network calls, no push, no PR creation, no deploy, no monitor creation, and no Plane sync.

B3 is a contract-test reinforcement design. It does not define an implementation plan, does not migrate shared schemas, and does not enable real execution.

## Goal

Add focused contract tests for the remaining B2 gaps where drift would be expensive:

- API 400 preflight readiness shape and redaction.
- Hub use of `canQueue` over legacy `safeToRun`.
- Hub blocker display order following API order.
- Worker Runner defense-in-depth blocker semantics after a job has already been queued.
- Default safety flags staying false when fake transport tests elsewhere can produce `realNetworkCall:true`.

B3 should only allow minimal production-code changes needed to make these contracts explicit and stable.

## Non-Goals

- Do not repeat existing B2 tests with equivalent assertions.
- Do not create contract snapshots for every package layer.
- Do not introduce a shared schema migration or shared cross-package test framework.
- Do not restructure `apps/orchestrator-api/src/services.ts`, `apps/hub/src/App.tsx`, `apps/worker-runner/src/handlers.ts`, or integration adapters beyond minimal contract fixes.
- Do not expand Hub UI.
- Do not implement provider clients, injected real transports, injected real runners, or A1 `ai-novelist` mirror proof.
- Do not enable real Codex, Playwright/browser, provider network, push, PR creation, deploy, monitor creation, or Plane sync.

## Existing Coverage

These contracts are already covered and should not receive duplicate B3 tests unless an assertion is too weak:

| Boundary | Existing Coverage | B3 Treatment |
|---|---|---|
| Orchestrator readiness helper | `apps/orchestrator-api/tests/readiness.test.ts` covers `canQueue`/`canExecute` derivation, blocker sorting, and details redaction. | No duplicate test. |
| Mission summary approval blocker | `apps/orchestrator-api/tests/api.test.ts` covers missing `SECURITY_RISK`, approval blocker, known static execution blocker, and safety flags. | No duplicate test. |
| Mission summary Worker Runtime blocker | Existing API tests cover missing Worker Runtime in queued readiness. | No duplicate test. |
| Route gate blocked response | Existing API tests cover disabled route gates for all gated real routes, no enqueue, blockers, and safety flags. | No duplicate test. |
| Accepted queued gated routes | Existing API tests cover whitelisted jobs, wrapper metadata, and default safety flags false. | No duplicate test. |
| Hub basic readiness display | Existing Hub tests cover queue/execute text, blocker text, recommended next action, preview/manual-action wording, and secret redaction. | Only add gap-specific assertions. |
| Worker Runner default `codex.real` manual-action | Existing Worker Runner tests cover injected runner missing, execute blocker, `canQueue:true`, `canExecute:false`, `mission.action_result`, and no success transition. | No duplicate test. |
| Worker Runner integration output | Existing Worker Runner tests cover generic integration blockers in wrapper output and `mission.action_result`. | No duplicate test. |
| Worker Runner default `github.pr` | Existing tests cover manual-action/no-network, PR preview artifact, execute blockers, and redaction. | Add only default/fake-transport boundary if needed. |
| Integration real result mapping | Existing integration tests cover disabled real mode, missing env, network gate, operation gate, unclassified fallback, caller-provided empty blockers, details redaction, and fake transport success. | Prefer no new integration test. |
| Auto-fix loop | Existing tests cover approval, regression evidence, unsafe commands, runner gates, redaction, and `realNetworkCall:false`. | No B3 test unless Worker Runner `fix.real` contract is directly affected. |

## Gaps To Cover

### API 400 Preflight Contract

B3 should add or strengthen a test for `codex-real` preflight when the route cannot safely build a local execution context, such as missing local mirror or remote repository URL fallback.

The response must keep the same external shape as other readiness/blocker outputs:

- `code: "MISSION_ACTION_PREFLIGHT_BLOCKED"`;
- `details.canQueue: false`;
- `details.canExecute: false`;
- sorted `details.blockers[]`;
- `details.recommendedNextAction`;
- `details.realNetworkCall: false`;
- `details.realExternalCall: false`;
- `details.realPush: false`;
- `details.realDeploy: false`;
- no WorkerRun and no queue job are created.

For local mirror or branch policy failures, the blocker should be a route preflight blocker that blocks both queue and execution. The exact category can follow the existing implementation, but the test should ensure it is structured, has a stable key, includes `blocks: ["queue", "execute"]`, and comes from `orchestrator`.

The test may use request body, environment, or fixture values containing obvious fake secrets, but it must not persist those fake secrets to storage, logs, or artifacts. Acceptance is that the response JSON does not contain the original fake secret value.

### Hub `canQueue` Priority

B3 should add a focused Hub test where a readiness entry has:

- `safeToRun:false`;
- `canQueue:true`;
- `canExecute:false`;
- an execute-only blocker.

The gated preview/manual-action button must remain enabled because `canQueue` is the primary queue contract. The button label must not imply immediate real execution or use `Run real ...` wording.

This test prevents future regressions where `safeToRun` is accidentally restored as the primary button guard.

### Hub Blocker Order

B3 should add a focused Hub rendering test with multiple blockers in a deliberate API-provided order. Hub must render them in that same order.

Hub should not sort blockers or infer category priority locally. The API is the ordering source.

The test should inspect rendered text order only. It should not duplicate the Orchestrator sort helper tests.

### Worker Runner Defense-In-Depth Semantics

B3 should strengthen Worker Runner tests for policy failures discovered after a job has already been queued:

- remote repository URL for `codex.real`;
- unsafe branch name such as `main`, `master`, or a branch outside `agent/`.

The wrapper output and `mission.action_result` should contain:

- `canQueue:true`;
- `canExecute:false`;
- a policy blocker from `worker_runner`;
- `blocks:["execute"]`;
- stable keys such as `policy.codex.local_mirror_required` or `policy.codex.branch_policy`.

These tests should not change wrapper status lifecycle, child resource behavior, or Mission auto-transition rules. Already queued jobs must not be retroactively reported as queue rejected.

If the current wrapper output lacks `canQueue`, `canExecute`, or `blockers` for these defense-in-depth paths, B3 may add minimal mapping to wrapper output and `mission.action_result`.

### Fake Transport Boundary

Existing integration tests intentionally allow fake injected transports to produce `realNetworkCall:true`. That is valid inside controlled provider-adapter tests.

B3 should ensure the default API or Worker Runner path for GitHub PR preview/manual-action still reports:

- `realNetworkCall:false`;
- `realPush:false` where the field is present;
- execute blockers that explain preview/manual-action behavior.

This test prevents fake transport success from being misread as a default real provider capability.

## Production-Code Boundary

B3 may make only the following minimal production-code adjustments:

- Route missing `codex-real` preflight paths through the existing readiness blocker builder and API response sanitizer.
- Redact request-derived or environment-derived values in 400 preflight `details` and blocker `details`.
- Make Hub button disabled state prefer `canQueue` when present, with `safeToRun` only as compatibility fallback.
- Ensure Hub renders API blocker order as-is.
- Add missing Worker Runner blocked/manual-action readiness fields to wrapper output and `mission.action_result`.
- Preserve or minimally correct integration result fields only if B3 exposes an actual assertion gap.

B3 must not:

- change WorkerRun lifecycle semantics;
- change Mission auto-transition behavior;
- change queue acceptance rules;
- change state-machine transitions;
- introduce broad helper abstractions;
- migrate duplicate types into a shared package;
- turn fake transport tests into default provider behavior.

## Safety Boundary

All default readiness, blocked/manual-action, gated real action response, and Worker Runner default real-job outputs must keep safety fields false wherever those fields appear:

```ts
realNetworkCall: false;
realExternalCall: false;
realPush: false;
realDeploy: false;
```

Dry-run outputs that do not currently expose all four fields do not need a schema migration.

`safeToRun` must remain available for compatibility, but B3 tests should not use it as the source of truth for new readiness decisions.

## Verification And Documentation

B3 design adds this Markdown file, so `summary.md` must update the Markdown document map in the same commit.

This design does not change current architecture facts and does not run project verification commands. Therefore `docs/architecture/structure.md` and `docs/debug/debug.md` do not need updates for the design-only commit.

During the later implementation task, any executed verification command must be recorded in `docs/debug/debug.md` according to repository rules. If an implementation plan Markdown file is added, moved, renamed, or deleted, `summary.md` must be updated again.

## Approval Boundary

Approval of this design authorizes only the B3 design record. It does not authorize implementation, an implementation plan, real provider network calls, real Codex, real Playwright/browser, push, PR creation, deploy, monitor creation, or Plane sync.
