# Scripts

This directory contains repository maintenance and validation scripts.

## PSF CLI

Run the local Personal Software Factory helper with:

```bash
pnpm psf projects:sync
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
pnpm psf codex:dry-run mission-0001-ai-novelist-chapter-review
```

The CLI is intentionally minimal for the current repository-foundation phase:

- `projects:sync` scans `projects/ai-novelist/project.passport.yaml`, validates it through the project registry package, and synchronizes Project records to Prisma.
- `mission:create` writes local mission metadata for the fixed ai-novelist example and tries to create a Prisma Mission with status `received`.
- `mission:plan` reads the mission metadata, Project Passport, and QA charter, then writes deterministic planner artifacts under `missions/<mission-id>/`.
- `codex:dry-run` reads the plan artifacts and project `AGENTS.md`, then writes Codex dry-run artifacts under the same mission directory.

All current commands are dry-run/mock boundaries. The CLI never calls external APIs, never pushes remotes, never modifies the real ai-novelist repository, and `codex:dry-run` never executes `codex exec`; it only writes `codex-command.sh` as an artifact for review.

By default, commands attempt Prisma synchronization. If the database is unavailable, the command exits with a clear error instead of silently succeeding. For explicit local artifact-only runs, set `PSF_SKIP_DB=1`.

Script TypeScript is covered by the root `pnpm typecheck` command through `pnpm typecheck:scripts`. Run `pnpm typecheck:scripts` for the focused script-only check.
