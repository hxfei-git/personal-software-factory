# Aggressive Documentation Cleanup Design

## Status

Approved design for the next cleanup pass after the current architecture documentation cleanup was merged to `main`.

This spec covers repository hygiene only. It must not change runtime behavior, enable real external calls, push to a remote, or modify product code.

## Goal

Historical note: this spec was written before the documentation map migration; old root and flat `docs/*.md` paths below describe then-current source locations or historical cleanup targets, not current documentation entrypoints.

Reduce stale and low-value documentation surface so future work starts from current fact sources instead of old phase plans, completed Superpowers artifacts, or duplicated progress narratives.

The cleanup should keep enough decision history to explain architecture choices, but it should remove files that now compete with current guidance.

## Approved Cleanup Boundary

Preserve these documents and document groups:

- `AGENTS.md`
- `docs/architecture/structure.md`
- `summary.md`
- `docs/debug/debug.md`
- `README.md`
- Current operational docs such as `docs/api/orchestrator-api.md`, `docs/security/safety.md`, `docs/runtime/queue-runtime.md`, integration docs, worker docs, auth, storage, schema, state-machine, operations, troubleshooting, and local-development docs.
- ADRs under `docs/adr/**`.
- Package, app, worker, project, mission, artifact, and workspace README files that explain active repository boundaries.

Candidates for deletion or archive cleanup:

- Completed Superpowers specs and plans, including the completed 2026-06-03 documentation cleanup spec and plan once this new cleanup is underway.
- Old brainstorms, old phase plans, and archived enhancement plans.
- Low-value archived Superpowers plans/specs that no longer need to remain in the repository.
- Old progress phase rollups when their content is already represented by `docs/architecture/structure.md`, `summary.md`, `docs/debug/debug.md`, `README.md`, `docs/status/progress.md`, current docs, or ADRs.
- Duplicative roadmap and acceptance-criteria docs if they are still written as phase plans rather than current instructions.
- The merged local worktree at `.worktrees/docs-current-architecture-cleanup`.

## Non-Goals

- Do not delete source code, tests, package manifests, Prisma migrations, project metadata, mission fixture files, or active README files.
- Do not delete ADRs.
- Do not delete `node_modules`, package `dist` folders, `.turbo`, or other ignored generated outputs unless a later explicit disk-cleanup task requests it.
- Do not modify real-mode gates or turn GitHub, Coolify, Uptime Kuma, Plane, Codex, Playwright, or provider paths into real external callers.
- Do not push to GitHub.

## Cleanup Strategy

### 1. Direct Local Cleanup

Remove the already-merged worktree:

- `.worktrees/docs-current-architecture-cleanup`

This is a local hygiene operation. It should be performed with `git worktree remove` so Git metadata is cleaned up correctly.

### 2. Delete Low-Value Historical Documents

Delete completed historical material when it no longer carries unique decision value:

- `docs/archive/superpowers/plans/**`
- `docs/archive/superpowers/specs/**`
- `docs/archive/brainstorms/**`
- `docs/archive/plans/enhance_plan.md`
- completed active Superpowers cleanup spec/plan after the implementation plan for this cleanup exists

If a file contains a decision that is not captured elsewhere, preserve the decision by summarizing it in `summary.md`, `docs/debug/debug.md`, or a retained ADR before deleting the file.

### 3. Reclassify Or Delete Progress And Phase Planning Docs

Review active phase/progress planning documents and handle each file explicitly:

- Keep current progress entrypoint `docs/status/progress.md`.
- Keep focused progress notes only if they still provide useful verification or batch audit context that is not duplicated elsewhere.
- Delete phase-only progress notes when they only repeat obsolete milestone narratives.
- Delete or rewrite roadmap/acceptance docs that present old phase order as current implementation guidance.

The expected default is deletion when the content is duplicated or obsolete. Rewriting is reserved for files that are still useful current operational guidance.

### 4. Keep And Rewrite Current Operational Docs

Do not delete current operational docs just because they include old phase wording. Instead, rewrite the entry language to current architecture language:

- default-safe
- dry-run/status behavior
- gated real-mode contracts
- `realNetworkCall: false` by default
- explicit approvals, gates, injected runner, or injected transport before real execution

Known examples to review include:

- `docs/integrations/overview.md`
- `docs/status/next-steps.md`
- `docs/api/orchestrator-api.md`
- `docs/runtime/queue-runtime.md`
- `docs/local-development.md`
- `docs/security/safety.md`
- `docs/worker-runtime.md`
- `README.md`

## Documentation Updates Required

Every implementation task must update the corresponding current records:

- `summary.md`: record what was deleted, what was retained, why ADRs are protected, and residual drift risk.
- `docs/debug/debug.md`: record investigation scope, deletion/retention decisions, verification commands, and results.
- `docs/architecture/structure.md`: update only if the cleanup changes current documentation source priority or top-level documentation structure.
- `AGENTS.md`: update only if the cleanup policy needs a more explicit future rule.

No secrets, tokens, raw credentials, private content, or long logs may be added to these documents.

## Verification Requirements

Run focused documentation checks after implementation:

```bash
git status --short --branch
git diff --check
git worktree list
find docs/superpowers -maxdepth 3 -type f | sort
find docs/archive -maxdepth 4 -type f | sort
rg -n 'Phase [0-9]|After Phase|current.md|enhance_plan|scheduled to move|scheduled to be archived|dry-run only|mock/dry-run only' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
rg -n 'realNetworkCall.*false|default-safe|gated real|injected runner|injected transport' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
```

Expected results:

- Worktree is clean after commits.
- `.worktrees/docs-current-architecture-cleanup` is gone from `git worktree list`.
- Active `docs/superpowers/` does not contain completed historical specs/plans from previous workstreams.
- ADR files remain present.
- Current docs do not present old phase plans as current implementation instructions.
- Safety docs still preserve `realNetworkCall: false`, default-safe, gated real, injected runner, and injected transport boundaries.

## Success Criteria

- The repository has fewer stale planning files and lower active-document noise.
- Current fact sources remain clear and preserved.
- ADR decision history remains intact.
- Any retained historical material is either clearly marked as audit-only or summarized in current records.
- No runtime behavior changes.
- No real external calls, pushes, deployments, provider writes, browser executions, or Codex executions are enabled.
