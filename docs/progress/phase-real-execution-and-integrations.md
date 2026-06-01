# Real Execution And Integrations Phase Rollup

## Scope

This rollup covers Tasks 1-14 for the real execution and integrations phase. The phase added gated real-mode code paths and contracts, but the default product posture remains local-first, dry-run/mock, and manual-action safe.

Real external APIs were not called while preparing this rollup.

## Completed Tasks

1. Shared Safety Package
   Added shared guardrails for secret redaction, command/path safety, and real-mode checks so logs, artifacts, API payloads, and integration outputs can stay free of provider tokens and passwords.

2. Artifact Store And Retention Policy
   Kept local artifacts under the established artifact roots, documented path-only treatment for larger QA evidence, and preserved the local-first storage model.

3. Queue And API Real-Mode Job Contracts
   Added explicit real/gated job contracts for Codex, QA, fix, GitHub PR, Coolify deploy, Uptime Kuma monitor sync, and Plane sync. The API does not accept arbitrary command or generic job submission.

4. Real Codex Runner Gated Mode
   Added the Codex real-runner abstraction. It is blocked unless `ENABLE_REAL_CODEX=1`, `CODEX_EXECUTABLE` is an explicit absolute path, workspace roots are guarded, CLI policy remains safe, runtime limits are respected, and approvals/runtime wiring exist.

5. Deterministic Playwright QA Runner
   Added deterministic Playwright QA support with a real browser path gated by target URL plus `ENABLE_REAL_PLAYWRIGHT=1` or an injected test runner. Missing configuration returns blocked/manual-action output instead of opening a browser.

6. AI Exploratory QA Gated Mode
   Added the AI exploratory QA abstraction and validation path. The default remains manual-action/dry-run; it does not connect to Playwright MCP, open a browser, or call external APIs unless a later approved executor path is wired.

7. Real Auto Fix Loop Gated Mode
   Added a gated real fix-loop contract while keeping dry-run/manual-action defaults and max-attempt safety boundaries.

8. Real Integration Adapters With Injected Transports
   Added gated real adapters for GitHub, Coolify, Uptime Kuma, and Plane. They require `ENABLE_REAL_*` eligibility, credentials/configuration, operation gates, approvals where relevant, and an injected transport before they can make a network request.

9. Worker Runner Real Job Handlers
   Mapped whitelisted real job contracts to Worker Runner handlers. Default handlers keep `realNetworkCall`, `realExternalCall`, `realPush`, and `realDeploy` false unless the full gate chain is intentionally configured.

10. Orchestrator API And Hub Visibility
    Added protected route contracts and Hub readiness visibility for real/gated actions. Routes require `PSF_ACTION_EXECUTION_MODE=queued` plus route-specific gates such as `PSF_ENABLE_REAL_CODEX=true`, `PSF_ENABLE_REAL_QA_PLAYWRIGHT=true`, and `PSF_ENABLE_REAL_GITHUB_PR=true`.

11. ai-novelist Real Loop Readiness
    Documented readiness expectations for the first managed project while preserving manual preparation boundaries for project workspaces, target URLs, checks, and approvals.

12. Operations Hardening
    Extended operational guidance around queue runtime, worker runner usage, doctor warnings, real-gate readiness, workspace roots, and redaction.

13. Temporal And LangGraph Decision Record
    Recorded the decision to defer Temporal and LangGraph until BullMQ-based orchestration shows a concrete need for a heavier durable workflow or agent graph layer.

14. Full Verification And Documentation Rollup
    Updated README, `.env.example`, and progress docs so the repository describes gated real abilities, default safe behavior, verification expectations, and remaining manual actions in one place.

## Changed Capability List

Real but disabled/gated:

- Codex real runner.
- Deterministic Playwright QA.
- AI exploratory QA abstraction.
- Gated real fix loop.
- GitHub, Coolify, Uptime Kuma, and Plane real adapters through injected transport.
- Worker Runner handlers for real-mode job contracts.
- Orchestrator protected real-action routes and Hub readiness display.

Still dry-run/mock/default safe:

- Local CLI demo and dry-run commands.
- Integration status and dry-run endpoints without injected real transport.
- Normal tests and fake-transport integration tests.
- Hub dry-run actions and blocked/manual-action readiness states.
- Queue runtime unless explicitly configured for queued real contract acceptance.

## Required Gates Before Real Work

Real Codex execution requires `ENABLE_REAL_CODEX=1`, absolute `CODEX_EXECUTABLE`, safe `CODEX_SANDBOX`, `CODEX_APPROVAL_MODE=on-request`, guarded `PSF_WORKSPACE_ROOT`, runtime limits, approval state, queue/runtime wiring, and safe project commands.

Deterministic Playwright QA requires a target URL through `QA_TEST_URL`, `STAGING_URL`, or request payload plus `ENABLE_REAL_PLAYWRIGHT=1` or an injected runner.

AI exploratory QA requires `ENABLE_AI_EXPLORATORY_QA=1` and an approved executor path; the default path does not install or run Playwright MCP.

Real-action API routes require `PSF_ACTION_EXECUTION_MODE=queued` and route gates:

```dotenv
PSF_ENABLE_REAL_CODEX=false
PSF_ENABLE_REAL_QA_PLAYWRIGHT=false
PSF_ENABLE_REAL_QA_AI_EXPLORATORY=false
PSF_ENABLE_REAL_FIX=false
PSF_ENABLE_REAL_GITHUB_PR=false
PSF_ENABLE_REAL_COOLIFY_DEPLOY=false
PSF_ENABLE_REAL_UPTIME_KUMA_SYNC=false
PSF_ENABLE_REAL_PLANE_SYNC=false
```

Provider adapters require provider eligibility gates and configuration:

```dotenv
ENABLE_REAL_GITHUB=0
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=

ENABLE_REAL_COOLIFY=0
COOLIFY_BASE_URL=
COOLIFY_TOKEN=

ENABLE_REAL_UPTIME_KUMA=0
UPTIME_KUMA_BASE_URL=
UPTIME_KUMA_USERNAME=
UPTIME_KUMA_PASSWORD=

ENABLE_REAL_PLANE=0
PLANE_BASE_URL=
PLANE_API_TOKEN=
PLANE_WORKSPACE_ID=
PLANE_PROJECT_ID=
```

No real secrets should be committed. Tokens and passwords must not appear in prompts, logs, reports, artifacts, PR bodies, Issue bodies, API responses, Hub UI, or dry-run outputs.

## Default Safety Boundaries

- `realNetworkCall` stays `false` until a gated real adapter actually invokes an injected transport.
- `realExternalCall`, `realPush`, and `realDeploy` stay false in default API/Worker Runner paths.
- Missing gates or credentials produce blocked/manual-action output, not best-effort execution.
- Production deploy remains approval-only and is not part of the default path.
- Remote clone/update, provider network validation, push, PR creation, monitor creation, deploy, and Plane sync remain manual or gated future actions unless deliberately enabled.

## Migrations

Task 14 is documentation-only and adds no Prisma migration. This rollup does not change runtime code or schema.

## Verification Results

Final coordinator verification was run after this rollup and the follow-up test-stability commits.

Passed:

```bash
pnpm install --lockfile-only
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm psf doctor
git diff --check
git status --short --branch
```

`pnpm psf doctor` exited successfully with warning status because local `.env` and optional provider credentials are not configured. No token values were printed, and no real external APIs were called.

Focused phase checks also passed while validating the real-mode surfaces:

```bash
pnpm --filter @psf/integrations test
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/qa-worker test
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/orchestrator-api test
pnpm --filter @psf/hub test
```

## Remaining Manual Actions

- Configure real credentials only outside tracked files.
- Decide which real action, if any, is approved for a later run.
- Start Redis/API/Worker Runner in queued mode before accepting real-action route contracts.
- Inject approved runner/transport implementations before expecting Codex, Playwright, or provider adapters to perform real work.
- Keep provider network validation behind explicit later approval.
