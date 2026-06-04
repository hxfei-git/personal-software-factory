# B1 Documentation Drift Audit And Minimal Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the current architecture versus `docs/vision/plan.md`, update the active fact-source docs with the B-before-A route, and perform only the smallest necessary documentation cleanup.

**Architecture:** This is a documentation-control batch only. It does not change runtime code, schemas, provider adapters, worker execution, queue behavior, or real-mode gates. The current fact sources remain `summary.md`, `docs/architecture/structure.md`, `docs/status/progress.md`, `docs/status/next-steps.md`, and `docs/debug/debug.md`; `docs/vision/plan.md` stays a long-term reference.

**Tech Stack:** Markdown, Git, shell, `grep`/`find` fallback when `rg` is unavailable, `node scripts/check-phase1-structure.mjs`.

---

## Scope Boundary

Implement only Batch B1 from [docs/superpowers/specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md](../specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md).

Do not implement B2 readiness contract changes, B3 test changes, or A1 `ai-novelist` local mirror gated-runner proof in this plan. Do not enable Codex execution, Playwright browser execution, provider network calls, push, PR creation, deployment, monitor creation, or Plane sync.

Markdown deletion is not the default path. If the audit finds a Markdown file that should be deleted, stop and document the deletion candidate in `docs/debug/debug.md`; deletion can happen in this batch only if the exact file path, replacement fact source, and `summary.md` document-map update are included in the same focused commit.

## File Structure

Modify these files:

- `summary.md`: add the current architecture versus vision difference summary, and verify the Markdown document map contains this plan file.
- `docs/status/progress.md`: add the chosen B1 -> B2 -> B3 -> A1 execution route while preserving the existing Batch 03/04 and Batch 05/06 progress facts.
- `docs/status/next-steps.md`: replace the ambiguous next-step ordering with the approved B-first sequence.
- `docs/debug/debug.md`: record the B1 audit, match classification, minimal cleanup decision, verification commands, and any deletion candidates.
- `docs/superpowers/plans/2026-06-04-b1-documentation-drift-audit-and-minimal-cleanup.md`: track this implementation plan.

Read these files during execution:

- `docs/superpowers/specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md`
- `docs/vision/plan.md`
- `docs/architecture/structure.md`
- `docs/status/progress.md`
- `docs/status/next-steps.md`
- `docs/debug/debug.md`
- `README.md`
- `AGENTS.md`

## Task 1: Baseline Audit

**Files:**
- Read: `docs/superpowers/specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md`
- Read: `docs/vision/plan.md`
- Read: `summary.md`
- Read: `docs/status/progress.md`
- Read: `docs/status/next-steps.md`
- Read: `docs/debug/debug.md`

- [ ] **Step 1: Confirm the starting worktree**

Run:

```bash
git status --short --branch
```

Expected: only the active plan checkbox edits may appear if implementation has already started. If unrelated user changes appear, leave them untouched and account for them in the final response.

- [ ] **Step 2: Read the approved spec and current route docs**

Run:

```bash
sed -n '1,220p' docs/superpowers/specs/2026-06-04-control-plane-doc-drift-and-readiness-design.md
sed -n '1,120p' docs/status/progress.md
sed -n '1,160p' docs/status/next-steps.md
```

Expected: the spec says B1 is audit-first minimal cleanup, B2 defines readiness/blockers, B3 adds contract regression tests, and A1 proves the local mirror gated-runner path.

- [ ] **Step 3: Inventory Markdown files**

Run:

```bash
find . \
  -path './.git' -prune -o \
  -path './node_modules' -prune -o \
  -path './artifacts' -prune -o \
  -path './workspaces' -prune -o \
  -name '*.md' -print | sort
```

Expected: root Markdown remains limited to `./AGENTS.md`, `./README.md`, and `./summary.md`; global docs remain under topic directories; local README and Mission/project context docs remain next to their code or generated context.

- [ ] **Step 4: Run the stale path and phase scan**

Run:

```bash
if command -v rg >/dev/null 2>&1; then
  rg -n 'docs/progress/current.md|phase-XX-summary|apps/api|packages/core|packages/schemas|root `plan.md`|./plan.md' README.md AGENTS.md summary.md docs --glob '!docs/vision/plan.md'
else
  grep -RInE 'docs/progress/current\.md|phase-XX-summary|apps/api|packages/core|packages/schemas|root `plan\.md`|\./plan\.md' README.md AGENTS.md summary.md docs --exclude='plan.md'
fi
```

Expected: matches are allowed only when they are historical context, migration history, command examples, or explicit non-current wording. Any active current-fact guidance pointing to old paths or old phase progress must be edited in Task 4.

- [ ] **Step 5: Run the safety wording scan**

Run:

```bash
if command -v rg >/dev/null 2>&1; then
  rg -n 'realNetworkCall.*true|realPush.*true|realDeploy.*true|create PR|deploy production' README.md AGENTS.md summary.md docs
else
  grep -RInE 'realNetworkCall.*true|realPush.*true|realDeploy.*true|create PR|deploy production' README.md AGENTS.md summary.md docs
fi
```

Expected: matches are allowed when they are explicit prohibitions, safety boundaries, dry-run previews, or ADR/debug history. Active docs must not imply provider network calls, push, PR creation, deployment, monitor creation, or Plane sync are enabled by default.

## Task 2: Update `summary.md`

**Files:**
- Modify: `summary.md`

- [ ] **Step 1: Confirm the new section is absent before editing**

Run:

```bash
if grep -n 'docs/vision/plan.md 差异摘要' summary.md; then exit 1; else test $? -eq 1; fi
```

Expected: exit code `0`, meaning the section is not present yet.

- [ ] **Step 2: Add the vision difference summary**

Insert this section after `## 当前问题` and before `## 改进待办`:

```markdown
## docs/vision/plan.md 差异摘要

`docs/vision/plan.md` 是长期产品愿景和历史规划上下文，不是当前实现事实源。当前事实以本文、`docs/architecture/structure.md`、`docs/status/progress.md`、`docs/debug/debug.md`、`README.md`、`docs/api/orchestrator-api.md`、`docs/security/safety.md` 和 `docs/runtime/queue-runtime.md` 为准。

- 已实现或已有 proof surface：TypeScript monorepo、Fastify Orchestrator API、React/Vite Hub、Prisma storage、Mission state machine、MissionEvent auditing、optional BullMQ queue runtime、Worker Runner、Project Passport/Registry、deterministic planner、dry-run workers、deterministic QA and local Codex proof surfaces、fix/regression enforcement、GitHub PR preview artifact，以及 default-safe integration adapters。
- Contract-only 或 manual-action：`codex.real`、`qa.playwright`、`qa.ai_exploratory`、`fix.real`、`github.pr`、`deploy.coolify`、`monitor.uptime_kuma` 和 `plane.sync`。这些路径需要 gate、approval、queue/runtime wiring、injected runner 或 injected transport 才能继续推进；默认仍保持 `realNetworkCall: false`、`realExternalCall: false`、`realPush: false` 和 `realDeploy: false`。
- 未验证：`ai-novelist` 的 operator-prepared local mirror、passport commands、local URL、E2E command、deterministic selectors 和目标项目本地运行行为。Passport 中的 `manual-verification-required` 不得当作已验证事实。
- 暂缓：GitHub/Coolify/Uptime Kuma/Plane provider network calls、push、真实 PR 创建、部署、monitor 创建、Plane sync、Temporal 和 LangGraph。Temporal/LangGraph 继续遵守 ADR 0005 的证据门槛。
- 后续顺序：先执行 B1 文档差异审计与最小必要清理，再执行 B2 readiness/blocker 合同收敛，再执行 B3 合同回归测试，最后执行 A1 `ai-novelist` local mirror gated-runner proof。
```

- [ ] **Step 3: Verify the document map for this plan**

Confirm `summary.md` contains this exact line once under the `### Superpowers` plan list:

```markdown
- `docs/superpowers/plans/2026-06-04-b1-documentation-drift-audit-and-minimal-cleanup.md`: B1 文档差异审计与最小必要清理实施计划。
```

- [ ] **Step 4: Verify `summary.md` updates**

Run:

```bash
grep -n 'docs/vision/plan.md 差异摘要' summary.md
grep -n '2026-06-04-b1-documentation-drift-audit-and-minimal-cleanup.md' summary.md
```

Expected: both commands print one matching line.

- [ ] **Step 5: Commit `summary.md`**

Run:

```bash
git add summary.md
git commit -m "记录愿景差异摘要" -m "在 summary.md 增加 docs/vision/plan.md 与当前架构的差异摘要，并确认 B1 文档差异审计实施计划已登记在文档地图。" -m "本提交只更新文档事实源和文档地图，不启用真实 Codex、Playwright、provider network、push、PR、deploy、monitor 或 Plane sync。"
```

Expected: commit succeeds with a Chinese title and body.

## Task 3: Update Progress And Next Steps

**Files:**
- Modify: `docs/status/progress.md`
- Modify: `docs/status/next-steps.md`

- [ ] **Step 1: Add current route to progress**

Insert this section after `## 当前事实源` in `docs/status/progress.md`:

```markdown
## 当前执行路线

下一批工作按 B1 -> B2 -> B3 -> A1 执行。B1 先做文档差异审计与最小必要清理，避免 `docs/vision/plan.md` 的长期愿景、旧 phase、旧路径或旧进度污染当前事实源。B2 再定义 readiness/blocker 合同，避免 `safeToRun=true` 被误读成真实执行已可发生。B3 只补合同回归测试和必要的最小生产代码调整。A1 最后在 operator-prepared `ai-novelist` local mirror 上证明 gated-runner path。

GitHub、Coolify、Uptime Kuma、Plane、push、真实 PR 创建、部署、monitor 创建、Plane sync、Temporal 和 LangGraph 继续暂缓，直到本地 mirror gated-runner path 被证明且后续任务获得明确批准。
```

- [ ] **Step 2: Replace next-step recommendations**

In `docs/status/next-steps.md`, replace the `## 推荐下一批工作` numbered list with:

```markdown
## 推荐下一批工作

1. 先执行 B1：审计当前架构与 `docs/vision/plan.md` 的差异，更新当前事实源，并做最小必要文档清理。不要默认删除 Markdown；如需删除、移动、改名或新增 Markdown，必须同步 `summary.md` 文档地图。
2. 再执行 B2：定义 readiness/blocker 合同，区分 `canQueue` 与 `canExecute` 或等价结构化 `blockers[]`，避免当前 `safeToRun` 被误读成真实执行已可发生。
3. 再执行 B3：补 Mission summary readiness、approval gate、queue wrapper、GitHub PR preview、fix/regression evidence 和 secret redaction 的合同回归测试。
4. 最后执行 A1：只在 operator-prepared `ai-novelist` local mirror 上证明 gated-runner path。Passport 中 `manual-verification-required` 的 commands、local URL 和 selectors 必须先人工验证。
5. 暂不扩展外部 provider；在本地 mirror gated-runner path 被证明之前，GitHub、Coolify、Uptime Kuma、Plane 和其他 provider network calls 必须继续禁用。
```

- [ ] **Step 3: Verify route wording**

Run:

```bash
grep -n 'B1 -> B2 -> B3 -> A1' docs/status/progress.md
grep -n 'canQueue' docs/status/next-steps.md
grep -n 'manual-verification-required' docs/status/next-steps.md
```

Expected: each command prints one matching line.

- [ ] **Step 4: Commit progress and next steps**

Run:

```bash
git add docs/status/progress.md docs/status/next-steps.md
git commit -m "明确后续执行路线" -m "将后续顺序收敛为 B1 文档审计、B2 readiness blocker 合同、B3 合同回归测试、A1 ai-novelist local mirror gated-runner proof。" -m "继续保持 provider network、push、PR、deploy、monitor 和 Plane sync 禁用边界。"
```

Expected: commit succeeds with a Chinese title and body.

## Task 4: Record Audit And Minimal Cleanup Decision

**Files:**
- Modify: `docs/debug/debug.md`
- Modify only if required by Task 1 scans: the active Markdown file containing current-risk wording
- Modify only if Markdown is added, moved, renamed, or deleted: `summary.md`

- [ ] **Step 1: Classify Task 1 scan matches**

Use these categories for every match from Task 1 Step 4 and Step 5:

```text
historical context: migration history, ADR history, old prompt text, debug history, or explicitly labeled historical path
explicit prohibition or safety boundary: text saying real execution, provider network, push, PR, deploy, monitor, or Plane sync remains disabled
current risk: active guidance that points to an obsolete path, old phase progress, or enabled real execution behavior
```

Expected: each remaining match has exactly one category before editing.

- [ ] **Step 2: Apply minimal edits for current-risk matches**

For each `current risk` match, prefer rewriting the sentence in its existing file. Do not delete Markdown unless the file has no remaining audit value and the useful facts are already represented in `summary.md`, `docs/debug/debug.md`, ADRs, or current docs.

Expected: after editing, rerunning the Task 1 scans shows no active current-fact guidance pointing to obsolete paths, old phase progress, or unsafe real-execution behavior.

- [ ] **Step 3: Update `docs/debug/debug.md`**

Append this entry under `## 当前条目`, using the actual command names and result summaries from this execution:

```markdown
### 2026-06-04 - B1 文档差异审计与最小清理

- 背景: 已批准控制面文档差异收敛设计，当前批次只执行 B1 文档审计和最小必要清理。
- 现象: `docs/vision/plan.md` 仍包含长期愿景、旧 phase、旧路径和旧执行 prompt；这些内容必须继续被标记为非当前事实，避免污染当前状态。
- 范围: `summary.md`、`docs/status/progress.md`、`docs/status/next-steps.md`、`docs/debug/debug.md`、`README.md`、`AGENTS.md`、`docs/vision/plan.md` 和 retained Superpowers plan/spec records。
- 调查: 运行 Markdown inventory、stale path/phase scan 和 safety wording scan；将命中分类为 historical context、explicit prohibition or safety boundary、current risk。
- 修复: 更新当前事实源的愿景差异摘要和 B1 -> B2 -> B3 -> A1 路线；只对 current-risk wording 做最小必要清理；未默认删除 Markdown。
- 验证: 记录 `git diff --check`、`node scripts/check-phase1-structure.mjs`、stale path/phase scan、safety wording scan 的实际结果。
- 后续: B2 定义 readiness/blocker 合同，避免 `safeToRun=true` 被误读成真实执行已可发生。
```

- [ ] **Step 4: Commit audit record and minimal cleanup edits**

If Task 4 Step 2 edited current-risk files, stage those exact file paths individually before the commit. Do not use broad pathspecs such as `git add docs`. For the normal path where only the debug audit entry changed, run:

```bash
git add docs/debug/debug.md
git commit -m "记录文档差异审计" -m "记录 B1 文档差异审计、命中分类、最小必要清理结果和验证命令。" -m "本提交不启用真实执行或外部 provider 调用；如有 Markdown 增删改名移动，summary.md 文档地图已在同一提交同步。"
```

Expected: commit succeeds if files changed. If Task 1 scans produced no current-risk edits and `docs/debug/debug.md` was the only changed file, the commit still succeeds with the debug audit record.

## Task 5: Final Verification

**Files:**
- Read: all changed files

- [ ] **Step 1: Run whitespace check**

Run:

```bash
git diff --check HEAD~3..HEAD
```

Expected: no output and exit code `0`. If the implementation creates a different number of commits, run `git diff --check main...HEAD` instead.

- [ ] **Step 2: Run structure check**

Run:

```bash
node scripts/check-phase1-structure.mjs
```

Expected: `Repository structure check passed.` and the validated file/directory count.

- [ ] **Step 3: Re-run stale path and safety scans**

Run the exact commands from Task 1 Step 4 and Task 1 Step 5 again.

Expected: remaining matches are classified as historical context or explicit prohibition/safety boundary. No active current-fact guidance points to obsolete paths, old phase progress, or unsafe real-execution behavior.

- [ ] **Step 4: Confirm final worktree status**

Run:

```bash
git status --short --branch
```

Expected: clean worktree except expected branch ahead count.

- [ ] **Step 5: Report verification**

Final response must include:

```text
- Files changed.
- Commits created.
- Verification commands and results.
- Whether any Markdown was deleted, moved, renamed, or added; if yes, confirm summary.md document map was updated.
- Explicit statement that no real Codex, Playwright, provider network, push, PR, deploy, monitor, or Plane sync was enabled.
```

## Self-Review Checklist

- [ ] B1 is audit-first and minimal-cleanup only.
- [ ] B2, B3, and A1 are not implemented by this plan.
- [ ] `docs/status/progress.md` still preserves Batch 03/04 and Batch 05/06 existing progress.
- [ ] `safeToRun` is not described as proof that real execution can happen.
- [ ] `manual-verification-required` passport metadata is not treated as verified.
- [ ] `summary.md` document map is updated for this plan file and for any later Markdown add, move, rename, or delete.
