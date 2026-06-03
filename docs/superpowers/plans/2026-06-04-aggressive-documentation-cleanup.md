# Aggressive Documentation Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove low-value stale documentation and the merged cleanup worktree while preserving current fact sources, ADRs, and default-safe real-mode boundaries.

**Architecture:** Keep `AGENTS.md`, `struct.md`, `summary.md`, `debug.md`, `README.md`, current operational docs, and `docs/adr/**` as the durable documentation surface. Delete completed phase planning/progress artifacts that duplicate current facts, then rewrite remaining active docs to use current default-safe and gated real contract language.

**Tech Stack:** Git, Markdown, ripgrep, pnpm workspace docs; no runtime code or TypeScript changes.

---

## Scope And Safety Rules

- Do not change TypeScript, Prisma, package manifests, tests, source code, or generated runtime behavior.
- Do not delete ADRs under `docs/adr/**`.
- Do not delete app/package/worker/project/mission README files.
- Do not delete `node_modules`, `dist`, `.turbo`, `.codegraph`, or runtime artifacts beyond the merged worktree named in Task 1.
- Do not push to GitHub.
- Keep `realNetworkCall: false`, default-safe, gated real, injected runner, and injected transport boundaries in active docs.
- Every tracked-file task must end with a Chinese commit title and Chinese commit body.
- Update `summary.md` and `debug.md` when files are deleted or active wording changes.

## File Structure

### Local cleanup

- Remove local worktree path: `.worktrees/docs-current-architecture-cleanup`
- Delete merged local branch: `docs/current-architecture-cleanup`

### Delete low-value archive files

- Delete: `docs/archive/progress/current-phase-1.md`
- Delete: `docs/archive/plans/enhance_plan.md`
- Delete: `docs/archive/brainstorms/phase-11-15.md`
- Delete: `docs/archive/brainstorms/phase-16-17a.md`
- Delete: `docs/archive/brainstorms/phase-17-queue-worker-runtime.md`
- Delete: `docs/archive/brainstorms/phase-8-10.md`
- Delete all files under `docs/archive/superpowers/plans/`
- Delete all files under `docs/archive/superpowers/specs/`
- Modify: `docs/archive/README.md`
- Modify: `docs/README.md`
- Modify: `summary.md`
- Modify: `debug.md`

### Delete completed previous Superpowers cleanup docs

- Delete: `docs/superpowers/plans/2026-06-03-documentation-cleanup-and-current-architecture.md`
- Delete: `docs/superpowers/specs/2026-06-03-documentation-cleanup-and-current-architecture-design.md`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/README.md`
- Modify: `summary.md`
- Modify: `debug.md`

Keep the current cleanup spec and this plan active:

- `docs/superpowers/specs/2026-06-03-aggressive-documentation-cleanup-design.md`
- `docs/superpowers/plans/2026-06-04-aggressive-documentation-cleanup.md`

### Delete old progress and phase planning files

- Delete: `docs/progress/batch-03-04-qa-and-local-codex.md`
- Delete: `docs/progress/batch-05-06-brainstorming.md`
- Delete: `docs/progress/batch-05-06-fix-regression-and-pr-gate.md`
- Delete: `docs/progress/phase-01-summary.md`
- Delete: `docs/progress/phase-18-hub-control-plane-and-generic-actions.md`
- Delete: `docs/progress/phase-real-execution-and-integrations.md`
- Delete: `docs/00-system-architecture.md`
- Delete: `docs/01-execution-roadmap.md`
- Delete: `docs/02-mvp-scope.md`
- Delete: `docs/03-risk-and-assumptions.md`
- Delete: `docs/04-phase-acceptance-criteria.md`
- Delete: `docs/final-mvp-scope.md`
- Delete: `docs/temporal-langgraph-migration.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/next-steps.md`
- Modify: `docs/progress.md`
- Modify: `docs/progress/README.md`
- Modify: `summary.md`
- Modify: `debug.md`

### Rewrite retained current operational docs

- Modify: `docs/api.md`
- Modify: `docs/artifacts.md`
- Modify: `docs/auth.md`
- Modify: `docs/integrations.md`
- Modify: `docs/local-development.md`
- Modify: `docs/queue-runtime.md`
- Modify: `docs/safety.md`
- Modify: `docs/schema.md`
- Modify: `docs/storage.md`
- Modify: `docs/worker-runtime.md`
- Modify: `summary.md`
- Modify: `debug.md`

### Update governance facts

- Modify: `AGENTS.md`
- Modify: `struct.md`
- Modify: `summary.md`
- Modify: `debug.md`

---

## Task 1: Remove Merged Local Worktree

**Files:**

- Local delete: `.worktrees/docs-current-architecture-cleanup`
- Local branch delete: `docs/current-architecture-cleanup`
- Test: Git worktree/status checks only

- [ ] **Step 1: Verify main is clean and points at the merged cleanup commit**

Run:

```bash
git status --short --branch
git worktree list
git branch --contains d6bbff2
```

Expected:

- `git status --short --branch` prints `## main...origin/main [ahead 21]` or the same branch with a larger ahead count after the plan commit.
- `git worktree list` includes `.worktrees/docs-current-architecture-cleanup` and may also include the current execution worktree `.worktrees/aggressive-documentation-cleanup`.
- `git branch --contains d6bbff2` includes both `main` and `docs/current-architecture-cleanup`.

- [ ] **Step 2: Remove the merged worktree**

Run:

```bash
git worktree remove .worktrees/docs-current-architecture-cleanup
```

Expected: command exits 0.

- [ ] **Step 3: Delete the merged branch**

Run:

```bash
git branch -d docs/current-architecture-cleanup
git worktree prune
```

Expected:

- `git branch -d docs/current-architecture-cleanup` reports the branch was deleted.
- `git worktree prune` exits 0.

- [ ] **Step 4: Verify local cleanup**

Run:

```bash
git worktree list
test ! -e .worktrees/docs-current-architecture-cleanup
git status --short --branch
```

Expected:

- `git worktree list` no longer lists `.worktrees/docs-current-architecture-cleanup`; it may still list the current execution worktree `.worktrees/aggressive-documentation-cleanup`.
- `test ! -e .worktrees/docs-current-architecture-cleanup` exits 0.
- Git status is clean.

- [ ] **Step 5: Commit decision**

No commit is expected for this task because it changes only local worktree metadata and ignored files. Record the local cleanup result in `debug.md` during Task 7.

---

## Task 2: Delete Low-Value Archive Files

**Files:**

- Delete: `docs/archive/progress/current-phase-1.md`
- Delete: `docs/archive/plans/enhance_plan.md`
- Delete: `docs/archive/brainstorms/phase-11-15.md`
- Delete: `docs/archive/brainstorms/phase-16-17a.md`
- Delete: `docs/archive/brainstorms/phase-17-queue-worker-runtime.md`
- Delete: `docs/archive/brainstorms/phase-8-10.md`
- Delete: `docs/archive/superpowers/plans/*.md`
- Delete: `docs/archive/superpowers/specs/*.md`
- Modify: `docs/archive/README.md`
- Modify: `docs/README.md`
- Modify: `summary.md`
- Modify: `debug.md`
- Test: documentation checks only

- [ ] **Step 1: Verify the files to delete are present**

Run:

```bash
find docs/archive -maxdepth 4 -type f | sort
```

Expected output includes:

```text
docs/archive/README.md
docs/archive/brainstorms/phase-11-15.md
docs/archive/brainstorms/phase-16-17a.md
docs/archive/brainstorms/phase-17-queue-worker-runtime.md
docs/archive/brainstorms/phase-8-10.md
docs/archive/plans/enhance_plan.md
docs/archive/progress/current-phase-1.md
docs/archive/superpowers/plans/2026-05-30-phase-1-monorepo-foundation.md
docs/archive/superpowers/specs/2026-05-30-phase-2-4-foundation-design.md
```

- [ ] **Step 2: Delete low-value archive files**

Run:

```bash
git rm docs/archive/progress/current-phase-1.md
git rm docs/archive/plans/enhance_plan.md
git rm docs/archive/brainstorms/phase-11-15.md docs/archive/brainstorms/phase-16-17a.md docs/archive/brainstorms/phase-17-queue-worker-runtime.md docs/archive/brainstorms/phase-8-10.md
git rm docs/archive/superpowers/plans/*.md
git rm docs/archive/superpowers/specs/*.md
```

Expected: every `git rm` command exits 0 and stages deletions.

- [ ] **Step 3: Rewrite `docs/archive/README.md`**

Replace the file with:

```markdown
# Documentation Archive

This directory is reserved for retained audit references that are not current implementation instructions.

The current cleanup policy is aggressive:

- Keep current fact sources in the repository root and active `docs/` files.
- Keep ADRs under `docs/adr/**`.
- Delete low-value historical plans, brainstorms, completed Superpowers artifacts, and duplicate phase notes once their useful facts are represented in current docs or ADRs.
- Add files here only when they preserve unique audit context that should not be copied into an ADR, `summary.md`, or `debug.md`.

For active architecture and operating guidance, read:

- `../../struct.md`
- `../../summary.md`
- `../../debug.md`
- `../../README.md`
- `../progress.md`
- `../api.md`
- `../safety.md`
- `../queue-runtime.md`
```

- [ ] **Step 4: Update `docs/README.md` archive sentence**

Replace:

```markdown
Historical phase plans and brainstorms live under `archive/`. Archived files are audit references, not current implementation instructions.
```

With:

```markdown
Low-value historical plans and brainstorms are removed once their useful facts are represented in current docs or ADRs. `archive/` is reserved for retained audit references only.
```

- [ ] **Step 5: Add cleanup record to `summary.md`**

Under `## Recently Resolved By Documentation Cleanup`, add this bullet if it is not already present:

```markdown
- Low-value archive files from old Superpowers plans/specs, brainstorms, archived enhancement planning, and superseded phase-current notes were removed; retained audit policy now lives in `docs/archive/README.md`.
```

- [ ] **Step 6: Add debug entry**

Append this entry to `debug.md`:

```markdown
### 2026-06-04 - Low-Value Archive Files Removed

- Context: aggressive cleanup after current architecture documentation was merged.
- Symptom: `docs/archive/` still retained completed Superpowers plans/specs, brainstorms, an archived enhancement plan, and a superseded Phase 1 current note that no longer carried unique decision value.
- Scope: `docs/archive/**`, `docs/README.md`, `summary.md`, and `debug.md`.
- Investigation: compared archive contents with current fact sources and ADR protection rules.
- Fix: removed low-value archive files and rewrote `docs/archive/README.md` as a retained-audit policy.
- Verification: run archive listing, stale-reference search, `git diff --check`, and `git status --short --branch`.
- Follow-up: none.
```

- [ ] **Step 7: Verify Task 2**

Run:

```bash
find docs/archive -maxdepth 4 -type f | sort
rg -n 'docs/archive/progress/current-phase-1.md|docs/archive/plans/enhance_plan.md|docs/archive/brainstorms|docs/archive/superpowers' docs README.md summary.md debug.md --glob '!docs/archive/**'
git diff --check
git status --short
```

Expected:

- Archive listing contains `docs/archive/README.md` and no deleted archive files.
- `rg` output has no active references to deleted archive paths except historical entries in `debug.md` or `summary.md`.
- `git diff --check` has no output.
- `git status --short` shows only expected deletes/modifications for Task 2.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add docs/archive/README.md docs/README.md summary.md debug.md
git add -u docs/archive
git commit -m "删除低价值归档文档" -m "移除旧 Superpowers 计划和规格、brainstorm、增强方案和过时阶段 current 记录，保留归档目录作为少量审计材料的策略入口。"
```

Expected: commit succeeds.

---

## Task 3: Delete Completed Previous Superpowers Cleanup Docs

**Files:**

- Delete: `docs/superpowers/plans/2026-06-03-documentation-cleanup-and-current-architecture.md`
- Delete: `docs/superpowers/specs/2026-06-03-documentation-cleanup-and-current-architecture-design.md`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/README.md`
- Modify: `summary.md`
- Modify: `debug.md`
- Test: documentation checks only

- [ ] **Step 1: Verify active Superpowers docs before deletion**

Run:

```bash
find docs/superpowers -maxdepth 3 -type f | sort
```

Expected output includes:

```text
docs/superpowers/README.md
docs/superpowers/plans/2026-06-03-documentation-cleanup-and-current-architecture.md
docs/superpowers/plans/2026-06-04-aggressive-documentation-cleanup.md
docs/superpowers/plans/README.md
docs/superpowers/specs/2026-06-03-aggressive-documentation-cleanup-design.md
docs/superpowers/specs/2026-06-03-documentation-cleanup-and-current-architecture-design.md
```

- [ ] **Step 2: Delete completed previous Superpowers docs**

Run:

```bash
git rm docs/superpowers/plans/2026-06-03-documentation-cleanup-and-current-architecture.md
git rm docs/superpowers/specs/2026-06-03-documentation-cleanup-and-current-architecture-design.md
```

Expected: both files are staged for deletion.

- [ ] **Step 3: Update `docs/superpowers/README.md`**

Replace the body with:

```markdown
# Superpowers Workflow Documents

This directory stores only active Superpowers design and planning artifacts for the current workstream.

Completed Superpowers specs and plans are deleted after their useful facts are represented in current fact sources, ADRs, or retained audit references. These files are execution aids, not runtime source code.
```

- [ ] **Step 4: Update `docs/superpowers/plans/README.md`**

Replace the body with:

```markdown
# Superpowers Implementation Plans

This directory is for active implementation plans only.

Use the newest active plan for the current task. Completed plans should be removed after their decisions and verification results are represented in `summary.md`, `debug.md`, ADRs, or other current docs.
```

- [ ] **Step 5: Update records**

In `summary.md`, under `## Recently Resolved By Documentation Cleanup`, add:

```markdown
- Completed prior Superpowers cleanup spec/plan files were removed from the active workflow directory; the current aggressive cleanup spec and plan remain active until this workstream finishes.
```

Append to `debug.md`:

```markdown
### 2026-06-04 - Completed Superpowers Cleanup Docs Removed

- Context: active Superpowers directories still contained the completed current-architecture cleanup spec and implementation plan.
- Symptom: completed workflow artifacts could be mistaken for the active workstream.
- Scope: `docs/superpowers/**`, `summary.md`, and `debug.md`.
- Investigation: listed active Superpowers files and separated the completed previous cleanup from the current aggressive cleanup spec/plan.
- Fix: deleted the completed previous cleanup spec/plan and updated Superpowers README guidance.
- Verification: run active Superpowers listing, deleted-path search, `git diff --check`, and `git status --short`.
- Follow-up: remove this aggressive cleanup plan/spec in a later cleanup after this workstream is no longer active.
```

- [ ] **Step 6: Verify Task 3**

Run:

```bash
find docs/superpowers -maxdepth 3 -type f | sort
rg -n 'documentation-cleanup-and-current-architecture' docs/superpowers README.md docs summary.md debug.md --glob '!docs/archive/**'
git diff --check
git status --short
```

Expected:

- Active Superpowers listing contains only README files, `2026-06-03-aggressive-documentation-cleanup-design.md`, and `2026-06-04-aggressive-documentation-cleanup.md`.
- `rg` output only appears in `debug.md` history if at all.
- `git diff --check` has no output.
- `git status --short` shows expected Task 3 changes.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add docs/superpowers/README.md docs/superpowers/plans/README.md summary.md debug.md
git add -u docs/superpowers
git commit -m "删除已完成工作流文档" -m "移除上一轮已完成的 Superpowers 清理 spec 和 plan，保留当前激进清理工作流文档作为唯一活跃计划来源。"
```

Expected: commit succeeds.

---

## Task 4: Delete Old Progress Rollups And Consolidate Progress Entry

**Files:**

- Delete: `docs/progress/batch-03-04-qa-and-local-codex.md`
- Delete: `docs/progress/batch-05-06-brainstorming.md`
- Delete: `docs/progress/batch-05-06-fix-regression-and-pr-gate.md`
- Delete: `docs/progress/phase-01-summary.md`
- Delete: `docs/progress/phase-18-hub-control-plane-and-generic-actions.md`
- Delete: `docs/progress/phase-real-execution-and-integrations.md`
- Modify: `docs/progress.md`
- Modify: `docs/progress/README.md`
- Modify: `summary.md`
- Modify: `debug.md`
- Test: documentation checks only

- [ ] **Step 1: Delete progress child files**

Run:

```bash
git rm docs/progress/batch-03-04-qa-and-local-codex.md
git rm docs/progress/batch-05-06-brainstorming.md
git rm docs/progress/batch-05-06-fix-regression-and-pr-gate.md
git rm docs/progress/phase-01-summary.md
git rm docs/progress/phase-18-hub-control-plane-and-generic-actions.md
git rm docs/progress/phase-real-execution-and-integrations.md
```

Expected: all six files are staged for deletion.

- [ ] **Step 2: Rewrite `docs/progress/README.md`**

Replace the body with:

```markdown
# Progress Notes

Use `../progress.md` as the active progress entrypoint.

Detailed phase and batch rollups were removed during the aggressive documentation cleanup after their current facts were consolidated into `../progress.md`, `../../summary.md`, `../../debug.md`, current operational docs, or ADRs.
```

- [ ] **Step 3: Rewrite `docs/progress.md` heading and source note**

Replace the first heading:

```markdown
# Real Execution And Integrations Phase Progress
```

With:

```markdown
# Current Progress
```

Replace:

```markdown
Older phase plans and brainstorms are historical references after the documentation cleanup and should not override current fact-source documents.
```

With:

```markdown
Detailed phase and batch rollups have been removed where they duplicated current facts. This file keeps the concise current progress summary.
```

- [ ] **Step 4: Remove detailed rollup link blocks from `docs/progress.md`**

Delete these exact blocks:

```markdown
Detailed phase rollup:

- `docs/progress/batch-05-06-brainstorming.md`
- `docs/progress/batch-05-06-fix-regression-and-pr-gate.md`
```

```markdown
Detailed phase rollups:

- `docs/progress/batch-03-04-qa-and-local-codex.md`
- `docs/progress/phase-18-hub-control-plane-and-generic-actions.md`
- `docs/progress/phase-real-execution-and-integrations.md`
```

Replace this bullet:

```markdown
- This progress file and `docs/progress/phase-real-execution-and-integrations.md` summarize changed capabilities, safety boundaries, migrations, test commands, and remaining manual actions.
```

With:

```markdown
- This progress file summarizes changed capabilities, safety boundaries, migrations, test commands, and remaining manual actions.
```

- [ ] **Step 5: Update records**

In `summary.md`, under `## Recently Resolved By Documentation Cleanup`, add:

```markdown
- Old progress child rollups were removed after the current status, verification posture, and safety boundaries were consolidated into `docs/progress.md`, `summary.md`, and `debug.md`.
```

Append to `debug.md`:

```markdown
### 2026-06-04 - Progress Rollups Consolidated

- Context: aggressive cleanup of progress files after current facts moved into root fact sources.
- Symptom: `docs/progress/` contained old phase and batch rollups that duplicated `docs/progress.md`, current docs, and debug history.
- Scope: `docs/progress/**`, `docs/progress.md`, `summary.md`, and `debug.md`.
- Investigation: searched active references to progress child files and confirmed `docs/progress.md` contains the current capability and verification summary.
- Fix: deleted progress child rollups and removed active links to them.
- Verification: run deleted-path search, stale phase search, `git diff --check`, and `git status --short`.
- Follow-up: record future current progress in `docs/progress.md` unless a new focused current note is explicitly needed.
```

- [ ] **Step 6: Verify Task 4**

Run:

```bash
find docs/progress -maxdepth 2 -type f | sort
rg -n 'docs/progress/batch-|docs/progress/phase-|phase-01-summary|phase-real-execution|phase-18-hub|batch-03-04|batch-05-06' README.md docs/progress.md docs/progress docs summary.md debug.md --glob '!docs/archive/**'
git diff --check
git status --short
```

Expected:

- `find docs/progress -maxdepth 2 -type f | sort` returns only `docs/progress/README.md`.
- `rg` output appears only in `debug.md` history or this implementation plan while it is active.
- `git diff --check` has no output.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add docs/progress.md docs/progress/README.md summary.md debug.md
git add -u docs/progress
git commit -m "合并进度记录入口" -m "删除旧阶段和批次进度子文件，将当前状态、验证边界和后续记录规则集中到 docs/progress、summary 和 debug。"
```

Expected: commit succeeds.

---

## Task 5: Delete Duplicate Phase Planning Docs And Update Active References

**Files:**

- Delete: `docs/00-system-architecture.md`
- Delete: `docs/01-execution-roadmap.md`
- Delete: `docs/02-mvp-scope.md`
- Delete: `docs/03-risk-and-assumptions.md`
- Delete: `docs/04-phase-acceptance-criteria.md`
- Delete: `docs/final-mvp-scope.md`
- Delete: `docs/temporal-langgraph-migration.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/next-steps.md`
- Modify: `summary.md`
- Modify: `debug.md`
- Test: documentation checks only

- [ ] **Step 1: Delete duplicate phase planning docs**

Run:

```bash
git rm docs/00-system-architecture.md
git rm docs/01-execution-roadmap.md
git rm docs/02-mvp-scope.md
git rm docs/03-risk-and-assumptions.md
git rm docs/04-phase-acceptance-criteria.md
git rm docs/final-mvp-scope.md
git rm docs/temporal-langgraph-migration.md
```

Expected: all seven files are staged for deletion.

- [ ] **Step 2: Update README documentation list**

In `README.md`, delete this bullet:

```markdown
- `docs/final-mvp-scope.md`: current local MVP scope and exclusions.
```

Replace:

```markdown
Follow the phase order in `docs/01-execution-roadmap.md` and acceptance gates in `docs/04-phase-acceptance-criteria.md`.
```

With:

```markdown
Use `struct.md`, `summary.md`, `debug.md`, `docs/progress.md`, and ADRs under `docs/adr/` for current implementation state and decision history.
```

- [ ] **Step 3: Update `docs/development-standards.md`**

Replace the `## Phase Discipline` section with:

```markdown
## Current Work Discipline

Personal Software Factory tracks current implementation state in root fact sources and ADRs, not in old phase plans. Each task should preserve default-safe boundaries, update the relevant current docs, and finish with focused verification.
```

Replace:

```markdown
- Phase 1 uses structure checks only.
- Later phases must add tests close to the behavior they introduce.
```

With:

```markdown
- Documentation-only changes use focused documentation checks.
- Runtime changes must add tests close to the behavior they introduce.
```

Replace:

```markdown
- Each task should update the relevant README, progress note, design doc, plan, or operating guide when behavior, structure, commands, or phase status changes.
```

With:

```markdown
- Each task should update the relevant README, `struct.md`, `summary.md`, `debug.md`, progress note, ADR, or operating guide when behavior, structure, commands, status, or safety boundaries change.
```

Replace:

```markdown
- Record phase completion notes under `docs/progress/`.
- Keep architecture decisions aligned with `docs/00-system-architecture.md`.
```

With:

```markdown
- Record current progress in `docs/progress.md`.
- Keep architecture decisions aligned with `struct.md` and ADRs under `docs/adr/`.
```

- [ ] **Step 4: Update `docs/next-steps.md`**

Replace the `## Recommended Next Batch` list with:

```markdown
## Recommended Next Batch

1. Focus the next implementation batch on deterministic QA for `ai-novelist` or carefully gated real local Codex execution.
2. Do not expand external providers next; keep GitHub, Coolify, Uptime Kuma, Plane, and other provider network calls disabled until local QA/Codex control-plane behavior is proven.
3. Exercise the Hub control plane manually from README on a clean `.env`, confirming Mission creation, resource pages, Approval decisions, and dry-run action preflight keep real-mode gates explicit and integration responses keep `realNetworkCall: false`.
4. Keep the BullMQ-backed queue runtime and explicit TypeScript Mission state machine as the baseline while collecting operational evidence.
```

Replace:

```markdown
If that evidence appears, use `docs/temporal-langgraph-migration.md` as the migration sketch: wrap current job handlers as Temporal activities or LangGraph nodes while preserving Orchestrator, WorkerRun, and MissionEvent contracts.
```

With:

```markdown
If that evidence appears, start from ADR 0005 and write a fresh migration design that preserves Orchestrator, WorkerRun, and MissionEvent contracts.
```

- [ ] **Step 5: Update `docs/README.md`**

After the current fact-source list, add:

```markdown
ADRs under `adr/` are retained decision records. Numbered phase planning documents were removed during aggressive cleanup after their current facts moved into root fact sources, current operational docs, or ADRs.
```

- [ ] **Step 6: Update records**

In `summary.md`, under `## Recently Resolved By Documentation Cleanup`, add:

```markdown
- Duplicate numbered phase planning, MVP scope, acceptance, and Temporal/LangGraph migration notes were removed; current state now relies on root fact sources, operational docs, and ADRs.
```

Append to `debug.md`:

```markdown
### 2026-06-04 - Duplicate Phase Planning Docs Removed

- Context: aggressive cleanup of old numbered phase planning documents.
- Symptom: roadmap, acceptance, MVP scope, migration sketch, and early architecture planning docs duplicated current fact sources or ADRs.
- Scope: numbered docs, README documentation links, development standards, next steps, summary, and debug records.
- Investigation: searched active references to numbered phase docs and replaced them with root fact-source and ADR guidance.
- Fix: deleted duplicate phase planning docs and updated active references.
- Verification: run deleted-path search, stale phase search, `git diff --check`, and `git status --short`.
- Follow-up: create new ADRs or designs for future architecture decisions instead of reviving numbered phase plans.
```

- [ ] **Step 7: Verify Task 5**

Run:

```bash
rg -n 'docs/00-system-architecture|docs/01-execution-roadmap|docs/02-mvp-scope|docs/03-risk-and-assumptions|docs/04-phase-acceptance-criteria|docs/final-mvp-scope|docs/temporal-langgraph-migration|01-execution-roadmap|04-phase-acceptance|final-mvp-scope|temporal-langgraph-migration' README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
git diff --check
git status --short
```

Expected:

- `rg` output appears only in `debug.md` history or this implementation plan while it is active.
- `git diff --check` has no output.
- `git status --short` shows expected Task 5 changes.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add README.md docs/README.md docs/development-standards.md docs/next-steps.md summary.md debug.md
git add -u docs
git commit -m "删除重复阶段规划文档" -m "移除旧编号阶段规划、MVP 范围、验收和迁移草案文档，将当前状态和决策历史收敛到事实源、当前操作文档和 ADR。"
```

Expected: commit succeeds.

---

## Task 6: Rewrite Retained Operational Docs To Current Wording

**Files:**

- Modify: `docs/api.md`
- Modify: `docs/artifacts.md`
- Modify: `docs/auth.md`
- Modify: `docs/integrations.md`
- Modify: `docs/local-development.md`
- Modify: `docs/queue-runtime.md`
- Modify: `docs/safety.md`
- Modify: `docs/schema.md`
- Modify: `docs/storage.md`
- Modify: `docs/worker-runtime.md`
- Modify: `summary.md`
- Modify: `debug.md`
- Test: documentation checks only

- [ ] **Step 1: Rewrite `docs/integrations.md` intro**

Replace the first paragraph after the heading with:

```markdown
Integrations default to local mock/dry-run adapters for GitHub, Coolify, Uptime Kuma, and Plane. They let the Hub and CLI show external-action previews without mutating any external service. Gated real adapter implementations exist for approved execution paths, but they only run when runtime wiring explicitly selects them and injects a controlled transport.
```

- [ ] **Step 2: Rewrite `docs/api.md` old phase sections**

Replace:

```markdown
In Phase 18, Mission action preflight no longer rejects non-demo Missions solely because the Mission ID is not `mission-0001-ai-novelist-chapter-review`.
```

With:

```markdown
Mission action preflight does not reject non-demo Missions solely because the Mission ID is not `mission-0001-ai-novelist-chapter-review`.
```

Replace:

```markdown
In Phase 18, this route records the decision only.
```

With:

```markdown
This route records the decision only.
```

Replace the section heading:

```markdown
## Phase 16A/16B/17A/18 Demo Surfaces
```

With:

```markdown
## Current Demo And Control Surfaces
```

Replace the paragraph under that heading that starts with `Phase 16A is the local ai-novelist dry-run chain.` with:

```markdown
The API surfaces are default-safe with dry-run/status routes plus gated real-mode contracts. Default responses and paths without intentionally injected runners or transports do not execute Codex, run shell commands from the Hub, push, create PRs, deploy, create provider records, or call external services, and they keep `realNetworkCall: false`; real calls or real runners are possible only after explicit gates and approvals are satisfied and the required runner or transport is intentionally wired.
```

Replace:

```markdown
## Phase 17B Queue Runtime APIs
```

With:

```markdown
## Queue Runtime APIs
```

Replace:

```markdown
Phase 17B adds optional queued execution for protected dry-run action endpoints.
```

With:

```markdown
Queued execution is optional for protected dry-run action endpoints and gated real-mode contract endpoints.
```

- [ ] **Step 3: Rewrite `docs/queue-runtime.md` intro**

Replace:

```markdown
Phase 17B adds optional queue-backed execution for safe dry-run actions. The goal is to keep the Orchestrator API responsive while longer dry-run workflows are consumed by a Worker Runner.
```

With:

```markdown
The queue runtime provides optional queue-backed execution for safe dry-run actions and gated real-mode contract jobs. The goal is to keep the Orchestrator API responsive while longer workflows are consumed by a Worker Runner without granting arbitrary execution.
```

Replace:

```markdown
Before Phase 17B, protected action routes could run the dry-run workflow inside the API process.
```

With:

```markdown
Protected action routes can run short dry-run workflows inside the API process.
```

Replace:

```markdown
Phase 17B intentionally uses a queue-level wrapper WorkerRun.
```

With:

```markdown
The current queue runtime intentionally uses a queue-level wrapper WorkerRun.
```

Replace:

```markdown
If a later phase needs stronger relationships, add `parentWorkerRunId` or `rootWorkerRunId` deliberately. Phase 17B avoids that schema migration.
```

With:

```markdown
If future work needs stronger relationships, add `parentWorkerRunId` or `rootWorkerRunId` deliberately. The current schema avoids that migration.
```

Replace:

```markdown
Phase 18 also records Mission-level audit events from Worker Runner completions.
```

With:

```markdown
Worker Runner completions also record Mission-level audit events.
```

- [ ] **Step 4: Rewrite remaining old phase phrases in retained docs**

Apply these exact replacements:

```text
docs/local-development.md:
  "Phase 17B supports a queued dry-run path. Keep inline mode for the smallest local loop:"
  -> "Queued mode supports a default-safe dry-run path. Keep inline mode for the smallest local loop:"

docs/safety.md:
  "Phase 18 Approval decisions are records only."
  -> "Approval decisions are records only."

docs/safety.md:
  "Phase 17B Worker Runner consumed only whitelisted dry-run/mock jobs. Batch 03/04 adds whitelisted gated `qa.playwright` and `codex.real` contracts, but default behavior remains manual-action or injected-runner only."
  -> "Worker Runner consumes only whitelisted dry-run/mock jobs and gated real-mode contract jobs. Default behavior remains manual-action or injected-runner only unless explicit gates, approvals, and injected runners or transports are configured."

docs/worker-runtime.md:
  "`BullMQWorkerRuntime`: optional Phase 17B adapter backed by Redis and BullMQ."
  -> "`BullMQWorkerRuntime`: optional queue adapter backed by Redis and BullMQ."

docs/auth.md:
  "## Phase 16A/16B/17A Local Demo Auth"
  -> "## Local Demo Auth"

docs/schema.md:
  "Phase 2 introduces shared runtime schemas in `packages/mission-schema` and persistence models in `packages/db`."
  -> "Shared runtime schemas live in `packages/mission-schema`, and persistence models live in `packages/db`."

docs/schema.md:
  "The Orchestrator API MVP uses the required Phase 2-4 subset."
  -> "The Orchestrator API uses the required subset implemented by current routes and workers."

docs/storage.md:
  "Phase 2-4 storage uses Prisma with local PostgreSQL."
  -> "Storage uses Prisma with local PostgreSQL."

docs/artifacts.md:
  "## Phase 8-10 QA Artifacts"
  -> "## QA Artifacts"

docs/artifacts.md:
  "## Phase 11-15 Hub And Integration Artifacts"
  -> "## Hub And Integration Artifacts"
```

- [ ] **Step 5: Update records**

In `summary.md`, under `## Recently Resolved By Documentation Cleanup`, add:

```markdown
- Retained operational docs now describe current queue, API, auth, schema, storage, artifact, safety, and integration behavior without old phase-entry wording.
```

Append to `debug.md`:

```markdown
### 2026-06-04 - Retained Operational Docs Reworded

- Context: active operational docs were preserved but still included old phase-entry wording.
- Symptom: API, queue, local development, safety, auth, schema, storage, artifacts, worker runtime, and integration docs could read as phase plans instead of current operating guidance.
- Scope: retained operational docs, `summary.md`, and `debug.md`.
- Investigation: searched active docs for old phase phrases and checked each retained file against current default-safe and gated real boundaries.
- Fix: replaced old phase-entry language with current operational wording while preserving `realNetworkCall: false` and gated runner/transport boundaries.
- Verification: run stale phase search, safety-boundary search, `git diff --check`, and `git status --short`.
- Follow-up: none.
```

- [ ] **Step 6: Verify Task 6**

Run:

```bash
rg -n 'Phase 11-15|Phase 16A|Phase 16B|Phase 17A|Phase 17B|Phase 18|After Phase|dry-run only|mock/dry-run only' docs/api.md docs/artifacts.md docs/auth.md docs/integrations.md docs/local-development.md docs/queue-runtime.md docs/safety.md docs/schema.md docs/storage.md docs/worker-runtime.md summary.md debug.md
rg -n 'realNetworkCall.*false|default-safe|gated real|injected runner|injected transport' docs/api.md docs/integrations.md docs/queue-runtime.md docs/safety.md docs/worker-runtime.md summary.md debug.md
git diff --check
git status --short
```

Expected:

- First `rg` returns no stale operational doc matches except historical entries in `debug.md`.
- Second `rg` returns active safety-boundary lines.
- `git diff --check` has no output.

- [ ] **Step 7: Commit Task 6**

Run:

```bash
git add docs/api.md docs/artifacts.md docs/auth.md docs/integrations.md docs/local-development.md docs/queue-runtime.md docs/safety.md docs/schema.md docs/storage.md docs/worker-runtime.md summary.md debug.md
git commit -m "修正保留操作文档阶段口径" -m "将保留的 API、队列、安全、集成、认证、schema、storage 和 artifact 文档从旧 phase 表述更新为当前默认安全与 gated real contract 口径。"
```

Expected: commit succeeds.

---

## Task 7: Update Governance And Fact Sources

**Files:**

- Modify: `AGENTS.md`
- Modify: `struct.md`
- Modify: `summary.md`
- Modify: `debug.md`
- Test: documentation checks only

- [ ] **Step 1: Update `AGENTS.md` documentation maintenance rules**

Under `## Documentation Maintenance Rules`, add these bullets after the existing `struct.md` / `summary.md` / `debug.md` bullets:

```markdown
- Preserve ADRs under `docs/adr/**`; do not delete them during cleanup unless the user explicitly asks and a newer ADR supersedes the decision.
- Remove completed plans, stale phase notes, and low-value historical documents once their useful facts are represented in current docs, ADRs, `summary.md`, or `debug.md`.
```

- [ ] **Step 2: Update `struct.md` source priority**

Replace:

```markdown
Historical phase plans remain useful for audit, but they are not the current architecture source.
```

With:

```markdown
ADRs remain the durable decision history. Low-value historical phase plans are removed once their useful facts are represented in current docs, ADRs, `summary.md`, or `debug.md`.
```

In the `## Current Source Priority` list, add this item after `debug.md`:

```markdown
5. `docs/adr/**` for architecture decision history
```

Renumber the following items so the provider-specific integration docs line remains last.

- [ ] **Step 3: Update `summary.md` residual risk**

Under `### Residual Risk`, replace:

```markdown
- Keep future completed phase material out of active guidance unless it is explicitly marked as current.
```

With:

```markdown
- Keep future completed phase material out of active guidance; delete low-value history after current facts are captured, and use ADRs only for durable decisions.
```

- [ ] **Step 4: Append final governance debug entry**

Append to `debug.md`:

```markdown
### 2026-06-04 - Cleanup Governance Updated

- Context: aggressive cleanup changed the documentation retention policy.
- Symptom: previous guidance allowed historical docs to remain in archive even when they no longer carried unique audit value.
- Scope: `AGENTS.md`, `struct.md`, `summary.md`, and `debug.md`.
- Investigation: compared approved cleanup boundary with current documentation maintenance rules and source priority.
- Fix: documented ADR protection and the rule to remove low-value completed plans or stale phase notes after useful facts are captured.
- Verification: run governance wording search, source-priority check, `git diff --check`, and `git status --short`.
- Follow-up: none.
```

- [ ] **Step 5: Verify Task 7**

Run:

```bash
rg -n 'Preserve ADRs|Remove completed plans|Low-value historical phase plans|architecture decision history|delete low-value history' AGENTS.md struct.md summary.md debug.md
git diff --check
git status --short
```

Expected:

- `rg` returns the new governance lines.
- `git diff --check` has no output.
- `git status --short` shows only Task 7 files.

- [ ] **Step 6: Commit Task 7**

Run:

```bash
git add AGENTS.md struct.md summary.md debug.md
git commit -m "更新文档清理治理规则" -m "记录 ADR 保护、低价值历史材料删除和当前事实源优先级规则，确保后续清理不再保留过时阶段计划作为活跃参考。"
```

Expected: commit succeeds.

---

## Task 8: Final Validation

**Files:**

- Modify: `debug.md`
- Modify: `summary.md`
- Test: documentation checks only

- [ ] **Step 1: Run structural checks**

Run:

```bash
git status --short --branch
git diff --check
git worktree list
find docs/superpowers -maxdepth 3 -type f | sort
find docs/archive -maxdepth 4 -type f | sort
find docs/progress -maxdepth 2 -type f | sort
test -d docs/adr
```

Expected:

- Working tree is clean before final validation notes, or only `summary.md` and `debug.md` are modified if notes have already been started.
- `git diff --check` has no output.
- Worktree list does not contain `.worktrees/docs-current-architecture-cleanup`.
- Active Superpowers listing contains this aggressive cleanup spec/plan plus README files.
- Archive listing contains only `docs/archive/README.md`, unless a prior task intentionally retained another audit file and documented it in `summary.md`.
- Progress directory listing contains only `docs/progress/README.md`.
- `test -d docs/adr` exits 0.

- [ ] **Step 2: Run deleted-path checks**

Run:

```bash
rg -n 'docs/00-system-architecture|docs/01-execution-roadmap|docs/02-mvp-scope|docs/03-risk-and-assumptions|docs/04-phase-acceptance-criteria|docs/final-mvp-scope|docs/temporal-langgraph-migration|docs/progress/batch-|docs/progress/phase-|docs/archive/progress/current-phase-1.md|docs/archive/plans/enhance_plan.md|docs/archive/brainstorms|docs/archive/superpowers|documentation-cleanup-and-current-architecture' README.md AGENTS.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
```

Expected:

- No matches in active operational docs.
- Matches in `debug.md`, `summary.md`, or the active aggressive cleanup spec/plan are acceptable only when they describe the cleanup history or this plan's commands.

- [ ] **Step 3: Run stale phase wording checks**

Run:

```bash
rg -n 'Phase [0-9]|After Phase|current.md|enhance_plan|scheduled to move|scheduled to be archived|dry-run only|mock/dry-run only' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
```

Expected:

- No matches in current fact sources or retained operational docs that present old phases as current instructions.
- Matches in `docs/adr/**`, `debug.md`, `summary.md`, or this active aggressive cleanup spec/plan are acceptable only when they are historical or verification records.

- [ ] **Step 4: Run safety-boundary checks**

Run:

```bash
rg -n 'realNetworkCall.*false|default-safe|gated real|injected runner|injected transport|do not execute Codex|does not call external' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
```

Expected: output shows active safety-boundary guidance in `AGENTS.md`, `struct.md`, `README.md`, `docs/api.md`, `docs/safety.md`, `docs/queue-runtime.md`, provider docs, `summary.md`, or `debug.md`.

- [ ] **Step 5: Update final validation records**

Append to `debug.md`:

```markdown
### 2026-06-04 - Aggressive Documentation Cleanup Validation

- Context: final validation after deleting low-value historical docs, duplicate phase planning files, old progress rollups, and the merged cleanup worktree.
- Symptom: repository documentation still contained stale phase artifacts and completed workflow documents after the first cleanup pass.
- Scope: active root docs, `docs/archive`, `docs/superpowers`, `docs/progress`, retained operational docs, ADRs, and local worktrees.
- Investigation: ran structural checks, deleted-path checks, stale phase wording checks, safety-boundary checks, and git status checks.
- Fix: retained current fact sources and ADRs, deleted low-value historical files, rewrote retained operational docs, and recorded the new cleanup policy.
- Verification: `git diff --check` passed with no output; `git worktree list` no longer showed `.worktrees/docs-current-architecture-cleanup`; active Superpowers contained only current aggressive cleanup artifacts and README files; archive contained only retained audit policy; progress child files were removed; deleted-path and stale phase checks only matched cleanup history in `debug.md`, `summary.md`, ADRs, or the active aggressive cleanup plan/spec; safety-boundary checks found `realNetworkCall: false`, default-safe, gated real, injected runner, and injected transport guidance.
- Follow-up: none.
```

In `summary.md`, under `## Recently Resolved By Documentation Cleanup`, add:

```markdown
- Aggressive cleanup removed low-value archive files, previous completed workflow docs, old progress rollups, duplicate phase planning docs, and the merged cleanup worktree while preserving current fact sources and ADRs.
```

If any Task 8 command produces a different result than the expected result, stop before committing and fix the active document or deletion mismatch that caused the difference.

- [ ] **Step 6: Commit final validation**

Run:

```bash
git add summary.md debug.md
git commit -m "记录激进文档清理验证" -m "记录低价值历史文档删除、活跃文档口径修正、本地 worktree 清理和最终验证结果，确认当前事实源与 ADR 保留策略生效。"
```

Expected: commit succeeds if `summary.md` or `debug.md` changed. If both files already contain the final validation notes from an earlier task, skip this commit and state that no final validation commit was needed.

- [ ] **Step 7: Final status**

Run:

```bash
git status --short --branch
git log --oneline -n 12
```

Expected:

- Working tree is clean.
- Branch is `main`.
- Latest commits are Chinese local commits for the cleanup tasks.

---

## Final Verification Summary

Required final checks:

```bash
git status --short --branch
git diff --check
git worktree list
find docs/superpowers -maxdepth 3 -type f | sort
find docs/archive -maxdepth 4 -type f | sort
find docs/progress -maxdepth 2 -type f | sort
rg -n 'docs/00-system-architecture|docs/01-execution-roadmap|docs/02-mvp-scope|docs/03-risk-and-assumptions|docs/04-phase-acceptance-criteria|docs/final-mvp-scope|docs/temporal-langgraph-migration|docs/progress/batch-|docs/progress/phase-|docs/archive/progress/current-phase-1.md|docs/archive/plans/enhance_plan.md|docs/archive/brainstorms|docs/archive/superpowers|documentation-cleanup-and-current-architecture' README.md AGENTS.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
rg -n 'Phase [0-9]|After Phase|current.md|enhance_plan|scheduled to move|scheduled to be archived|dry-run only|mock/dry-run only' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
rg -n 'realNetworkCall.*false|default-safe|gated real|injected runner|injected transport|do not execute Codex|does not call external' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'
```

Do not run package tests unless a task accidentally changes runtime code, package files, scripts, Prisma schema, or generated runtime artifacts.
