# Development Standards

## Current Work Discipline

Personal Software Factory tracks current implementation state in root fact sources and ADRs, not in old phase plans. Each task should preserve default-safe boundaries, update the relevant current docs, and finish with focused verification.

## Safety

- Workers must operate in bounded workspaces.
- Secrets must not appear in prompts, logs, artifacts, docs, PR comments, or screenshots.
- Production deployment, database migrations, destructive operations, auth changes, and secret changes require approval.

## Testing

- Documentation-only changes should run reference searches and whitespace checks for the changed surface.
- Runtime behavior changes must add tests close to the behavior they introduce.
- Prefer targeted checks that cover the changed behavior before running broad suites.
- Keep test time low by focusing on critical chains first; document any skipped long-running checks and the reason.
- Run broader checks when phase gates, shared packages, state machines, database contracts, worker behavior, or release risk require them.
- QA findings must become reproducible regression tests when practical.

## Commit And Documentation Hygiene

- Each task should end with a focused local git commit that groups related changes.
- Each commit must use a Chinese summary as the commit title and include a Chinese description in the commit body.
- Each task should update the relevant README, `struct.md`, `summary.md`, `debug.md`, progress note, ADR, or operating guide when behavior, structure, commands, safety boundaries, or current status changes.
- Do not push commits to GitHub or update protected branches without explicit user approval.

## Documentation

- Keep README files current when a directory's purpose changes.
- Record current progress in `docs/progress.md`.
- Keep architecture decisions aligned with `struct.md` and ADRs under `docs/adr/`.
