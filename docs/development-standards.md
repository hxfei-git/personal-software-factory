# Development Standards

## Phase Discipline

Personal Software Factory is built in explicit phases. Each phase must satisfy its acceptance criteria before the next phase starts, unless the user approves an exception.

## Safety

- Workers must operate in bounded workspaces.
- Secrets must not appear in prompts, logs, artifacts, docs, PR comments, or screenshots.
- Production deployment, database migrations, destructive operations, auth changes, and secret changes require approval.

## Testing

- Phase 1 uses structure checks only.
- Later phases must add tests close to the behavior they introduce.
- Prefer targeted checks that cover the changed behavior before running broad suites.
- Keep test time low by focusing on critical chains first; document any skipped long-running checks and the reason.
- Run broader checks when phase gates, shared packages, state machines, database contracts, worker behavior, or release risk require them.
- QA findings must become reproducible regression tests when practical.

## Commit And Documentation Hygiene

- Each task should end with a focused local git commit that groups related changes.
- Each task should update the relevant README, progress note, design doc, plan, or operating guide when behavior, structure, commands, or phase status changes.
- Do not push commits to GitHub or update protected branches without explicit user approval.

## Documentation

- Keep README files current when a directory's purpose changes.
- Record phase completion notes under `docs/progress/`.
- Keep architecture decisions aligned with `docs/00-system-architecture.md`.
