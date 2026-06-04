# 调试记录

> 当前调试记录入口为 `docs/debug/debug.md`。历史条目中出现的旧路径只表示当时的文件位置，不是当前事实源。

## Purpose

This file records debugging context that should survive a single terminal session. It summarizes investigations, failed checks, unexpected behavior, manual-action results, queue/runtime issues, and follow-up verification.

Do not paste secrets, raw tokens, passwords, cookies, provider credentials, private manuscript content, or long logs here. Store large generated evidence under `artifacts/` and link only safe paths or sanitized summaries.

## Known Debug Hotspots

- Orchestrator write auth and local `PSF_API_TOKEN` / `VITE_PSF_API_TOKEN` mismatch.
- Queue mode mismatch between `PSF_WORKER_RUNTIME`, `PSF_ACTION_EXECUTION_MODE`, Redis, API, and Worker Runner.
- `qa.playwright` blocked because target URL, verified selectors, or `ENABLE_REAL_PLAYWRIGHT=1` is missing.
- `codex.real` manual-action output because no injected runner is wired, repoUrl is not a local mirror, branch is not under `agent/`, or workspace guards fail.
- GitHub PR preview blocked because `EXTERNAL_COST_RISK` approval or operation gates are missing.
- Integration readiness confusion where `realEnabled=true` still correctly reports `realNetworkCall=false`.
- `ai-novelist` command assumptions that remain manual-verification-required.

## Focused Verification Commands

```bash
git status --short --branch
git diff --check
pnpm --filter @psf/orchestrator-api test -- --run tests/api.test.ts
pnpm --filter @psf/hub test -- --run tests/hub.test.tsx
pnpm --filter @psf/worker-runner test
pnpm --filter @psf/integrations test
pnpm psf doctor
pnpm psf integrations:status
pnpm psf queues:status
```

Run the smallest meaningful checks first. Use broader `pnpm check`, `pnpm typecheck`, and `pnpm test` when shared contracts, phase gates, or cross-package behavior change.

## Debug Record Format

Use this format for new entries:

```markdown
### YYYY-MM-DD - Short Issue Title

- Context: what changed or what was being checked.
- Symptom: exact failure or unexpected behavior, with secrets redacted.
- Scope: packages, apps, docs, or commands involved.
- Investigation: key observations and discarded causes.
- Fix: files changed or decision made.
- Verification: commands run and results.
- Follow-up: concrete remaining action or `none`.
```

## Current Entries

### 2026-06-03 - Documentation Drift Identified

- Context: current documentation cleanup planning.
- Symptom: `docs/progress/current.md` still described Phase 1, while README and progress rollups described gated real execution and Batch 05/06.
- Scope: then-root docs, progress docs, AGENTS guidance, historical planning files.
- Investigation: searched docs for stale phase labels, archived enhancement-plan references and active references to historical plans.
- Fix: created current fact-source docs and archived misleading historical files under `docs/archive/`.
- Verification: spec and plan were committed before file cleanup, and the archive task moved historical files with `git mv`.
- Follow-up: re-run documentation text checks after each cleanup pass.

### 2026-06-03 - Active Stale Phase Wording Found

- Context: supplemental Task 3B followed stale-phase verification after active documentation cleanup.
- Symptom: the stale-phase search still matched current-state wording in active reference docs outside the original cleanup spec and plan.
- Scope: AGENTS guidance, architecture docs, worker permissions, final MVP scope, migration notes, roadmap headings, acceptance criteria headings, summary, and debug records.
- Investigation: ran the required search excluding `docs/archive/**` and separated intended historical cleanup spec/plan matches from active reference docs that needed wording updates.
- Fix: renamed current-phase headings, updated active docs to describe current dry-run and gated real contracts, preserved no real execution, no provider call, no push, and no deploy defaults, and archived historical files under `docs/archive/`.
- Verification: rerun the stale-phase search and `git diff --check` for the allowed files.
- Follow-up: monitor future cleanup passes for stale active-doc wording.

### 2026-06-03 - Runtime Boundary Phase Wording Corrected

- Context: Task 4 quality review found active runtime, local-development, and safety docs still used old phase-boundary wording for current execution safety.
- Symptom: active docs described runtime and local development as phase-specific dry-run-boundary, which could hide the current gated real contract paths.
- Scope: `docs/worker-runtime.md`, `docs/local-development.md`, `docs/safety.md`, `summary.md`, and `debug.md`.
- Investigation: searched the active docs for the exact stale phase sentences and verified existing `realNetworkCall: false` and default-safe safety boundaries.
- Fix: replaced old phase-boundary statements with default-safe plus gated real contract wording, without enabling Codex, Playwright, provider, GitHub, Coolify, Uptime Kuma, or Plane real calls.
- Verification: rerun the stale-sentence search, safety-boundary search, targeted `git diff --check`, and `git status --short`.
- Follow-up: none.

### 2026-06-03 - Operations Queue Boundary Wording Corrected

- Context: Task 4 quality review found `docs/operations.md` still described queue mode as dry-run/mock only.
- Symptom: the operations guide did not reflect current default-safe queue behavior with gated real-mode contract jobs.
- Scope: `docs/operations.md`, `summary.md`, and `debug.md`.
- Investigation: searched active operations, summary, and debug docs for the stale queue sentence and existing `realNetworkCall: false` safety wording.
- Fix: replaced the dry-run-only queue sentence with default-safe, dry-run/mock, gated real-mode contract, explicit gates, and injected runner/transport wording without enabling real calls.
- Verification: rerun the stale queue search, safety-boundary search, targeted `git diff --check`, and `git status --short`.
- Follow-up: none.

### 2026-06-03 - Documentation Cleanup Validation

- Context: final validation after creating current fact-source docs and archiving historical planning files.
- Symptom: active docs previously mixed current architecture with stale phase guidance.
- Scope: `AGENTS.md`, then-root docs, progress docs, Superpowers docs, runtime/safety docs, and archive paths.
- Investigation: ran whitespace, stale-phase text, safety-boundary text, and git status checks.
- Fix: Historical note: active docs were updated at that time to point to then-current `struct.md`, `summary.md`, and `debug.md`; later documentation-map work moved those entries to `docs/architecture/structure.md`, `summary.md`, and `docs/debug/debug.md`. Historical plans were archived during that cleanup pass; later aggressive cleanup removed low-value archive files; runtime/safety docs use default-safe plus gated real contract wording.
- Verification: `git diff --check HEAD~3..HEAD` passed with no output; `git diff --check main...HEAD` passed with no output; `rg -n 'Phase 1: Monorepo Foundation|Phase 11-15 currently|Current Phase' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'` only matched active cleanup spec/plan command examples and replacement instructions; `rg -n 'realNetworkCall.*false|realNetworkCall` stays `false|realNetworkCall` remains `false' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'` found current safety-boundary wording plus cleanup plan/spec and debug history references; `git status --short --branch` showed `## docs/current-architecture-cleanup`.
- Follow-up: none.

### 2026-06-03 - Active Docs Final Safety Wording Corrected

- Context: final reviewer found remaining active docs with stale dry-run-boundary, old phase-surface, and archived-plan wording.
- Symptom: API, risk, approval, README, and progress docs could imply provider or Codex surfaces are only historical dry-runs rather than current default-safe contracts with gated real runner or adapter paths.
- Scope: `README.md`, `docs/api.md`, then-active `docs/03-risk-and-assumptions.md`, now deleted in Task 5, `docs/approval-policy.md`, `docs/progress/batch-05-06-brainstorming.md`, `summary.md`, and `debug.md`.
- Investigation: searched the allowed active docs for exact stale phrases and compared them against existing default-safe, `realNetworkCall: false`, injected transport, injected runner, and historical archive wording.
- Fix: replaced stale dry-run-boundary and phase-only wording with default-safe dry-run/status plus gated real contract wording, preserved `realNetworkCall: false` defaults until explicit gates, approvals, and injected transports or runners are wired, and changed the progress note to the historical archived enhancement-plan reference.
- Verification: rerun the stale wording search, current safety/archive wording search, targeted `git diff --check`, and `git status --short`.
- Follow-up: none.

### 2026-06-04 - Low-Value Archive Files Removed

- Context: aggressive cleanup after current architecture documentation was merged.
- Symptom: `docs/archive/` still retained completed Superpowers plans/specs, brainstorms, an archived enhancement plan, and a superseded Phase 1 current note that no longer carried unique decision value.
- Scope: `docs/archive/**`, `docs/README.md`, `summary.md`, and `debug.md`.
- Investigation: compared archive contents with current fact sources and ADR protection rules.
- Fix: removed low-value archive files, rewrote `docs/archive/README.md` as a retained-audit policy, and corrected active docs that still pointed to deleted archive material.
- Verification: run archive listing, stale-reference search, `git diff --check`, and `git status --short --branch`.
- Follow-up: none.

### 2026-06-04 - Completed Superpowers Cleanup Docs Removed

- Context: active Superpowers directories still contained the completed current-architecture cleanup spec and implementation plan.
- Symptom: completed workflow artifacts could be mistaken for the active workstream.
- Scope: `docs/superpowers/**`, `summary.md`, and `debug.md`.
- Investigation: listed active Superpowers files and separated the completed previous cleanup from the current aggressive cleanup spec/plan.
- Fix: deleted the completed previous cleanup spec/plan and updated Superpowers README guidance.
- Verification: run active Superpowers listing, deleted-path search, `git diff --check`, and `git status --short`.
- Follow-up: remove this aggressive cleanup plan/spec in a later cleanup after this workstream is no longer active.

### 2026-06-04 - Progress Rollups Consolidated

- Context: aggressive cleanup of progress files after current facts moved into then-current fact sources; current progress entrypoint is `docs/status/progress.md`.
- Symptom: `docs/progress/` contained old phase and batch rollups that duplicated the then-current progress entrypoint, current docs, and debug history.
- Scope: historical `docs/progress/**`, current `docs/status/progress.md`, `summary.md`, and `docs/debug/debug.md`.
- Investigation: searched active references to progress child files and confirmed the progress entrypoint contained the current capability and verification summary.
- Fix: deleted progress child rollups and removed active links to them. Progress README now keeps `../progress.md` as the only path reference after child rollup deletion. Progress child rollup deletion also updated the structure check script from old phase files to current fact sources.
- Verification: run deleted-path search, stale phase search, `git diff --check`, and `git status --short`.
- Follow-up: record future current progress in `docs/status/progress.md` unless a new focused current note is explicitly needed.

### 2026-06-04 - Duplicate Phase Planning Docs Removed

- Context: aggressive cleanup of old numbered phase planning documents.
- Symptom: roadmap, acceptance, MVP scope, migration sketch, and early architecture planning docs duplicated current fact sources or ADRs.
- Scope: numbered docs, README documentation links, development standards, next steps, summary, and debug records.
- Investigation: searched active references to numbered phase docs and replaced them with root fact-source and ADR guidance.
- Fix: deleted duplicate phase planning docs and updated active references.
- Verification: run deleted-path search, stale phase search, `git diff --check`, and `git status --short`.
- Follow-up: create new ADRs or designs for future architecture decisions instead of reviving numbered phase plans.

### 2026-06-04 - Retained Operational Docs Reworded

- Context: active operational docs were preserved but still included old phase-entry wording.
- Symptom: API, queue, local development, safety, auth, schema, storage, artifacts, worker runtime, and integration docs could read as phase plans instead of current operating guidance.
- Scope: retained operational docs, `summary.md`, and `debug.md`.
- Investigation: searched active docs for old phase phrases and checked each retained file against current default-safe and gated real boundaries.
- Fix: replaced old phase-entry language with current operational wording while preserving `realNetworkCall: false` and gated runner/transport boundaries. Storage queue wording was also corrected from old later-phase/API-MVP language to current optional queue runtime wording. Remaining phase/batch wording in retained operational docs was normalized to task/current-runtime wording. Safety doc remaining batch wording was normalized to current queue safety and future-approved-task wording.
- Verification: run stale phase search, safety-boundary search, `git diff --check`, and `git status --short`.
- Follow-up: none.

### 2026-06-04 - Cleanup Governance Updated

- Context: aggressive cleanup changed the documentation retention policy.
- Symptom: previous guidance allowed historical docs to remain in archive even when they no longer carried unique audit value.
- Scope: `AGENTS.md`, then-current `struct.md`, `summary.md`, and `debug.md`.
- Investigation: compared approved cleanup boundary with current documentation maintenance rules and source priority.
- Fix: documented ADR protection and the rule to remove low-value completed plans or stale phase notes after useful facts are captured.
- Verification: run governance wording search, source-priority check, `git diff --check`, and `git status --short`.
- Follow-up: none.

### 2026-06-04 - Aggressive Documentation Cleanup Validation

- Context: final validation in the `docs/aggressive-documentation-cleanup` worktree after deleting low-value historical docs, duplicate phase planning files, old progress rollups, and the merged cleanup worktree.
- Symptom: repository documentation had retained stale phase artifacts, completed workflow documents, and old archive/progress paths after the first cleanup pass.
- Scope: then-active root docs, `docs/archive`, `docs/superpowers`, historical `docs/progress`, retained operational docs, ADRs, and local worktrees.
- Investigation: ran structural checks, deleted-path checks, stale phase wording checks, safety-boundary checks, and git status checks before writing these final notes.
- Fix: retained current fact sources and ADRs, removed low-value historical files, kept archive/progress child directories reduced to README policy files, and recorded the cleanup policy and final validation result.
- Verification: `git status --short --branch` initially showed clean `## docs/aggressive-documentation-cleanup`; `git diff --check` passed with no output; `git worktree list` showed the main worktree and this aggressive cleanup worktree only, with no `.worktrees/docs-current-architecture-cleanup`; active Superpowers contained only the current aggressive cleanup spec/plan and README files; `docs/archive` contained only `docs/archive/README.md`; historical `docs/progress` contained only `docs/progress/README.md`; `test -d docs/adr` exited 0. Deleted-path search matched cleanup history or commands in the debug record and the active aggressive cleanup plan/spec only. Stale phase wording search still matched current repository check labels, retained operational feature labels, current progress/history labels, ADR history, summary/debug cleanup records, and active aggressive cleanup plan/spec verification text, but did not show retained operational docs treating deleted phase documents as current instructions. Safety-boundary search found active `realNetworkCall: false`, default-safe, gated real, injected runner, injected transport, and no-external-call guidance across `AGENTS.md`, `README.md`, `docs/architecture/structure.md`, `summary.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, `docs/runtime/queue-runtime.md`, provider docs, worker docs, and cleanup records.
- Follow-up: none.

### 2026-06-04 - Documentation Migration Links Corrected

- Context: Task 6 after the documentation map migration moved root and flat docs into topic directories.
- Symptom: retained README files, operation standards, debug history, and cleanup workflow docs still contained old paths that could be mistaken for current entrypoints.
- Scope: archive and Superpowers README files, development standards, debug records, aggressive cleanup plan/spec, vision plan historical note, and summary.
- Investigation: ran the required old-path and root-fact-source scans, then separated current guidance from historical old paths and command examples.
- Fix: updated current guidance to `docs/architecture/structure.md`, `docs/debug/debug.md`, `docs/status/progress.md`, `docs/api/orchestrator-api.md`, `docs/security/safety.md`, `docs/runtime/queue-runtime.md`, and `docs/integrations/overview.md`; marked retained old paths as historical notes.
- Verification: old-path scan output was limited to current new paths containing legacy basenames, migration mappings, historical cleanup commands/records, vision historical prompt text, and ADR history; root wording scan had only then-root history or documentation-map plan headings; `git diff --check` passed with no output; git status showed only Task 6 Markdown edits.
- Follow-up: none.

### 2026-06-04 - Documentation Map And Structure Validation

- Context: final validation after moving global Markdown into topic directories and keeping `README.md`, `AGENTS.md`, and `summary.md` as root entrypoints.
- Symptom: root and `docs/` Markdown paths were too flat for user navigation and made `summary.md` incomplete as a document map.
- Scope: root Markdown files, global `docs/` files, code-adjacent README files, Mission/project context files, Superpowers workflow files, structure checks, and current path references.
- Investigation: ran structure checks, Markdown inventory, old-path scans, safety-boundary scans, Prisma generation, and full project checks.
- Fix: moved global docs into topic directories, kept code-adjacent/generated context docs in place, rewrote user-facing entry docs in Chinese, updated `summary.md` document map, strengthened `AGENTS.md` documentation maintenance rules, and marked historical old paths as non-current.
- Verification: `git status --short --branch` showed clean `## docs/documentation-map-and-structure`; `git diff --check` passed with no output; `node scripts/check-phase1-structure.mjs` passed and validated 40 files plus 26 directories; Markdown inventory with `artifacts/` and `workspaces/` pruned showed root Markdown limited to `./AGENTS.md`, `./README.md`, and `./summary.md`, with global docs under topic directories and local docs beside apps/packages/workers/missions/projects. Old current-path scan still matched current new paths containing legacy basenames, migration maps, historical command examples, debug history, ADR references to early `plan.md`, and `docs/vision/plan.md` historical prompt text; no active current guidance pointed to old moved paths. Safety-boundary scan found active `realNetworkCall: false`, default-safe, gated real, injected runner, injected transport, do-not-execute-Codex, and no-external-call guidance across `AGENTS.md`, `README.md`, `summary.md`, architecture, security, runtime, integration, worker, operation, status, and debug docs. `pnpm db:generate` generated Prisma Client v6.19.3 successfully. `pnpm check` passed: typecheck completed 17/17 packages, script tests passed 21/21, and workspace tests completed 17/17 packages.
- Follow-up: keep `summary.md` document map updated whenever Markdown files are added, moved, renamed, or deleted.
