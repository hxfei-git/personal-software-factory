# Current Architecture Summary

## Status

This file tracks current architecture problems, risks, and improvement items. It is not a historical phase log. Historical phase material was removed once represented in current docs or ADRs, and `docs/archive/` is reserved for retained audit references.

## Current Strengths

- The project has clear TypeScript monorepo boundaries.
- Orchestrator API owns state and exposes a broad local control-plane surface.
- Mission state transitions are explicit and auditable.
- Worker Runtime and Worker Runner provide a queue boundary without granting arbitrary execution.
- Hub Web reads Orchestrator data and does not directly mutate the filesystem, database, or providers.
- Integration dry-runs and real-mode readiness surfaces preserve `realNetworkCall: false` by default.
- `ai-novelist` is registered as readiness metadata without pretending unverified commands are safe.

## Current Problems

1. Residual documentation drift risk remains when new active docs reuse old phase language without linking it as history.
2. Real-mode gate complexity is high: route gates, worker gates, provider gates, approvals, injected transports, and local workspace checks are spread across several documents and code paths.
3. `ai-novelist` execution is not verified: passport commands, selectors, local URL behavior, and E2E entrypoints require manual verification in a real checkout.
4. Contract duplication exists between Hub API types, mission schemas, Orchestrator service schemas, worker job schemas, and integration types.
5. Manual-action UX is useful but not yet ergonomic: operators can see blockers, but the next concrete action is not always obvious.
6. Archive policy is now applied to completed historical phase material; residual risk is future stale documents being added outside `docs/archive/`.

## Improvement Backlog

### P0

- Keep `realNetworkCall: false` in default integration and gated real-mode responses.
- Keep token, password, API key, authorization, cookie, credential, session, JWT, and bearer values out of docs, logs, Hub UI, API responses, artifacts, PR bodies, and Issue bodies.
- Update `struct.md`, `summary.md`, and `debug.md` when code or files change their covered areas.

### P1

- Verify `ai-novelist` install, dev, build, test, lint, and E2E commands in a real checkout before enabling real worker execution.
- Build a single readiness checklist for each gated real action.
- Reduce repeated type contracts or add focused contract tests where duplication is still useful.
- Make Hub real-mode blockers point to the exact missing approval, gate, env var, local mirror, target URL, runner, or transport.

### P2

- Decide when old phase labels should be replaced with batch labels in current docs.
- Add a short architecture diagram after the current facts stabilize.
- Revisit Temporal or LangGraph only after BullMQ/state-machine orchestration shows concrete recovery or long-running workflow pain.

## Documentation Cleanup Status

## Recently Resolved By Documentation Cleanup

- Completed prior Superpowers cleanup spec/plan files were removed from the active workflow directory; the current aggressive cleanup spec and plan remain active until this workstream finishes.
- Low-value archive files from old Superpowers plans/specs, brainstorms, archived enhancement planning, and superseded phase-current notes were removed; retained audit policy now lives in `docs/archive/README.md`, and active docs no longer point to the deleted archive paths.
- Active guidance no longer treats `docs/progress/current.md`, the archived enhancement plan, old brainstorms, or old Superpowers plans/specs as current instructions.
- `docs/archive/` now retains only the archive policy README unless future unique audit references are intentionally added.
- Active runtime, operations, local-development, and safety docs now describe current default-safe plus gated real contract behavior instead of stale phase-only dry-run wording.
- API, risk, approval, README, progress, summary, and debug docs have been corrected so stale dry-run-boundary, old phase, and archived-plan wording are no longer tracked as open issues.
- Old progress child rollups were removed after the current status, verification posture, and safety boundaries were consolidated into `docs/progress.md`, `summary.md`, and `debug.md`.
- Progress README now keeps `../progress.md` as the only path reference after child rollup deletion.
- Progress child rollup deletion also updated the structure check script from old phase files to current fact sources.

### Completed So Far

- A new `struct.md` is the current architecture map.
- A new `summary.md` is the issue and improvement source.
- A new `debug.md` is the debug record source.
- Active docs and indexes have been updated toward current implementation guidance.
- Stale current-phase wording in active reference docs has been corrected while preserving historical phase meaning.
- Active runtime, local development, safety, and operations docs now use default-safe plus gated real contract wording instead of old phase-boundary wording.
- Active API, provider, Codex, queue, approval, and progress references now describe dry-run/status behavior plus gated real adapter or runner contracts, with default-disabled/default-safe execution and archived historical plan links.
- Misleading historical current-state files were removed after useful facts were represented in current docs or ADRs.

### Residual Risk

- Keep future completed phase material out of active guidance unless it is explicitly marked as current.
