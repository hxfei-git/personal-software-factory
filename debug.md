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
- Investigation: searched docs for stale phase labels, `enhance_plan.md`, and active references to historical plans.
- Fix so far: create current fact-source docs. Pending fix: archive misleading historical files in the archive task.
- Verification: spec and plan are committed before file cleanup begins.
- Follow-up: implement the cleanup plan and re-run documentation text checks.
