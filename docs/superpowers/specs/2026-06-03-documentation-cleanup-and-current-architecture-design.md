# Documentation Cleanup And Current Architecture Design

## Purpose

This change will make the repository's documentation match the current implementation state after the gated real execution, Batch 03/04, and Batch 05/06 work.

The repository currently has several valid historical documents, but some files still present old phases as the current state. That creates a real risk that future agents will follow Phase 1, Phase 11-15, or Phase 16/17-only guidance instead of the current default-safe gated architecture.

The cleanup should create a small set of current fact-source documents while preserving enough historical material for audit and phase traceability.

## Scope

The implementation will use a medium cleanup strategy:

- Create `struct.md` at the repository root as the current architecture map.
- Create `summary.md` at the repository root as the current architecture issue and improvement summary.
- Create `debug.md` at the repository root as the ongoing debug and investigation log entrypoint.
- Update `AGENTS.md` so every code or file change must update the corresponding current fact-source document when relevant.
- Update documentation indexes and progress pointers so readers start from the new current documents.
- Archive or remove misleading current-state files that have been superseded by newer rollups.

This cleanup must not remove ADRs, API documentation, safety documentation, operations documentation, provider-specific integration docs, or verified progress rollups.

## Current Documentation Problems

The current documentation has these conflicts:

- `README.md` and `docs/progress.md` describe the current gated real execution and Batch 05/06 state.
- `docs/progress/current.md` still describes Phase 1 as the current phase.
- `AGENTS.md` still says Phase 11-15 is the current phase discipline.
- Some older phase documents are valuable history, but their names and locations make them look like active plans.
- `enhance_plan.md` appears to be an old enhancement plan and should not remain a root-level current planning source if it is no longer authoritative.

## New Current Fact Sources

### `struct.md`

`struct.md` will describe the current architecture as implemented:

- monorepo layout and workspace boundaries;
- Hub Web responsibilities and non-responsibilities;
- Orchestrator API routes and service/storage layering;
- Prisma data model and Mission event audit model;
- Mission state machine;
- Worker Runtime and Worker Runner flow;
- Codex, QA, auto-fix, demo workflow, artifact store, and integration package responsibilities;
- dry-run, queued, and gated real-mode data flow;
- external network, push, PR, deploy, monitor, and Plane sync boundaries;
- `ai-novelist` passport readiness caveat.

It will be concise enough to read before coding, but detailed enough to prevent architecture drift.

### `summary.md`

`summary.md` will track the current architecture's problems and improvement backlog:

- stale documentation and phase naming cleanup;
- unverified `ai-novelist` commands and selectors;
- real-mode gate complexity;
- repeated contract fields between Hub, API, worker, and integrations;
- manual-action defaults that need clearer operator flows;
- future work for verified deterministic QA, local Codex execution wiring, and provider transport gates.

It will distinguish current problems from historical phase notes.

### `debug.md`

`debug.md` will be the stable debug record entrypoint:

- known risk areas;
- focused verification commands;
- queue/API/Hub/worker/integration troubleshooting flow;
- a lightweight log format for failures, investigations, fixes, and follow-up checks;
- explicit redaction and no-secret rules for debug records.

It will not replace test output, logs, or artifacts. It will summarize what was investigated and what changed.

## Cleanup Policy

The implementation will classify documents into four groups:

1. Current fact sources: keep and update directly.
2. Current reference docs: keep in place, and update links if needed.
3. Historical/audit docs: move under `docs/archive/` when their active location is misleading.
4. Superseded duplicate docs: remove only when the content is already preserved in a newer rollup or archive.

Likely cleanup candidates include:

- `docs/progress/current.md`, because it conflicts with the current implementation state.
- `enhance_plan.md`, because a root-level old enhancement plan competes with the new current fact sources.
- older brainstorm or implementation plan files that are no longer active plans and are better treated as archive material.

The implementation should preserve git history and avoid deleting files that contain unique acceptance evidence.

## `AGENTS.md` Rule Update

`AGENTS.md` will gain a documentation maintenance rule:

- If a change modifies architecture, module boundaries, data flow, state transitions, worker contracts, integration gates, or safety boundaries, update `struct.md`.
- If a change adds, resolves, or discovers architecture problems, risks, technical debt, phase status, or improvement work, update `summary.md`.
- If a change involves debugging, failed checks, unexpected behavior, manual-action output, flaky tests, queue/runtime issues, or incident-like findings, update `debug.md`.
- If none of the three documents are affected, the final response and commit body must explicitly say why.

The rule will preserve existing constraints: no secret values in docs, local commits only, Chinese commit title and body, no direct push to `main`, and no production deploy without approval.

## Verification

This is a documentation governance change, so the smallest meaningful verification is:

```bash
git diff --check
```

If implementation moves many files or updates references broadly, run focused text checks:

```bash
rg -n "Phase 1: Monorepo Foundation|Phase 11-15 currently|Current Phase" AGENTS.md README.md docs struct.md summary.md debug.md
rg -n "realNetworkCall" AGENTS.md README.md docs struct.md summary.md debug.md
```

Broader TypeScript tests are not required for pure markdown moves unless package files or executable scripts change.

## Out Of Scope

This cleanup will not:

- change runtime code;
- change Prisma schema or migrations;
- change API behavior;
- enable real Codex execution;
- enable Playwright browser execution;
- enable GitHub, Coolify, Uptime Kuma, or Plane network calls;
- push to GitHub;
- deploy any environment.

## Success Criteria

The cleanup is successful when:

- `struct.md`, `summary.md`, and `debug.md` exist and describe the current repository state.
- `AGENTS.md` instructs future agents to maintain those documents after code or file changes.
- active documentation no longer presents Phase 1 or Phase 11-15 as the current state.
- historical phase material is either clearly archived or still clearly marked as historical.
- integration and gated real-mode docs continue to state that default external network calls remain disabled and `realNetworkCall` stays `false` unless a later approved task intentionally changes that.
- the final cleanup ends with a focused local git commit using a Chinese title and Chinese body.
