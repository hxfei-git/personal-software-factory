# Codex Worker

The Codex Worker prepares implementation work for Codex. The current implementation is a dry-run generator only: it renders the prompt, command, development summary, WorkerRun, Artifact records, and MissionEvent records without executing Codex or touching project workspaces.

## Dry-Run Boundary

The worker does not:

- run `codex exec`;
- clone repositories;
- create worktrees or branches;
- modify `workspaces/`;
- push to remotes;
- call external services.

The generated command is saved as `codex-command.sh` artifact content only. The prompt argument is POSIX single-quote escaped so shell substitutions in Mission or AGENTS content remain literal if the artifact is inspected or run:

```bash
codex exec --sandbox workspace-write --ask-for-approval on-request '<mission prompt>'
```

## API

Import the dry-run generator from the package entrypoint:

```ts
import { createCodexDryRun, assertSafeCodexExecution } from "@psf/codex-worker";
```

Required input includes Mission and Project identifiers, branch names, the Project Passport, project `AGENTS.md`, and the Mission files: `mission.md`, `acceptance.md`, `technical-notes.md`, and `risk-notes.md`. Mode defaults to `dry-run`.

The result includes:

- `codex-prompt.md`;
- `codex-command.sh`;
- `dev-summary.md`;
- schema-compatible `WorkerRun`;
- schema-compatible `Artifact[]`;
- schema-compatible `MissionEvent[]`;
- `executed: false`.

## Safety

Real execution is not implemented here. The safety guard blocks real mode unless all of these are true:

- `ENABLE_REAL_CODEX=1` equivalent is set by the caller as `enableRealCodex: true`;
- an approved Approval record is represented by `hasApproval: true`;
- the current branch is not `main` or `master`.

Dry-run and mock modes return without real-execution checks and never call Codex.

## Checks

```bash
pnpm --filter @psf/codex-worker test
pnpm --filter @psf/codex-worker typecheck
```
