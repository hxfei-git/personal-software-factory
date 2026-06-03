# Debug Notes

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
- Scope: root docs, progress docs, AGENTS guidance, historical planning files.
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
- Scope: `AGENTS.md`, root docs, progress docs, Superpowers docs, runtime/safety docs, and archive paths.
- Investigation: ran whitespace, stale-phase text, safety-boundary text, and git status checks.
- Fix: active docs now point to `struct.md`, `summary.md`, and `debug.md`; historical plans are under `docs/archive/`; runtime/safety docs use default-safe plus gated real contract wording.
- Verification: `git diff --check HEAD~3..HEAD` passed with no output; `git diff --check main...HEAD` passed with no output; `rg -n 'Phase 1: Monorepo Foundation|Phase 11-15 currently|Current Phase' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'` only matched active cleanup spec/plan command examples and replacement instructions; `rg -n 'realNetworkCall.*false|realNetworkCall` stays `false|realNetworkCall` remains `false' AGENTS.md README.md docs struct.md summary.md debug.md --glob '!docs/archive/**'` found current safety-boundary wording plus cleanup plan/spec and debug history references; `git status --short --branch` showed `## docs/current-architecture-cleanup`.
- Follow-up: none.

### 2026-06-03 - Active Docs Final Safety Wording Corrected

- Context: final reviewer found remaining active docs with stale dry-run-boundary, old phase-surface, and archived-plan wording.
- Symptom: API, risk, approval, README, and progress docs could imply provider or Codex surfaces are only historical dry-runs rather than current default-safe contracts with gated real runner or adapter paths.
- Scope: `README.md`, `docs/api.md`, `docs/03-risk-and-assumptions.md`, `docs/approval-policy.md`, `docs/progress/batch-05-06-brainstorming.md`, `summary.md`, and `debug.md`.
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
