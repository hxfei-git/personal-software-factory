# Scripts

This directory contains repository maintenance and validation scripts.

## PSF CLI

Run the local Personal Software Factory helper with:

```bash
pnpm psf projects:sync
pnpm psf mission:create ai-novelist "增加章节审稿和自动修复流程"
pnpm psf mission:plan mission-0001-ai-novelist-chapter-review
pnpm psf codex:dry-run mission-0001-ai-novelist-chapter-review
pnpm psf doctor --json
pnpm psf demo:seed --skip-db
pnpm psf demo:ai-novelist --with-sample-bug --skip-db
pnpm psf demo:report --with-sample-bug --skip-db
pnpm psf demo:reset --skip-db
DEMO_RESET_CONFIRM=1 pnpm psf demo:reset --skip-db
```

The CLI keeps the existing foundation commands and adds demo operations backed by `@psf/demo-workflow`:

- `projects:sync` scans `projects/ai-novelist/project.passport.yaml`, validates it through the project registry package, and synchronizes Project records to Prisma.
- `mission:create` writes local mission metadata for the fixed ai-novelist example and tries to create a Prisma Mission with status `received`.
- `mission:plan` reads the mission metadata, Project Passport, and QA charter, then writes deterministic planner artifacts under `missions/<mission-id>/`.
- `codex:dry-run` reads the plan artifacts and project `AGENTS.md`, then writes Codex dry-run artifacts under the same mission directory.
- `doctor` runs local readiness checks. Use `--json` for machine-readable output; formatter output redacts secret-bearing URL userinfo, tokens, passwords, and similar values.
- `demo:seed` ensures the fixed ai-novelist demo mission metadata exists locally.
- `demo:ai-novelist` runs the full planner, Codex dry-run, QA dry-run, auto-fix dry-run, and report generation path. It prints the Mission ID, API URL, Hub URL, Mission Detail URL, DB sync state, and dry-run boundary fields.
- `demo:report` regenerates the ai-novelist demo acceptance report through the same dry-run workflow.
- `demo:reset` previews scoped demo cleanup by default. It deletes only when `DEMO_RESET_CONFIRM=1` is set, and it refuses non-demo mission IDs in the workflow layer.

All current commands are dry-run/mock boundaries. The CLI never calls external provider APIs, never pushes remotes, never deploys, never modifies the real ai-novelist repository, and dry-run command artifacts never execute Codex. Codex command files are written as non-executable review artifacts; the reviewed commands are stored as comments only and running the files exits without invoking Codex.

By default, commands attempt Prisma synchronization where the underlying workflow supports it. If the database is unavailable, the command exits with a clear error instead of silently succeeding. For explicit local artifact-only runs, set `PSF_SKIP_DB=1` or pass `--skip-db` to demo commands that support it.

Script TypeScript is covered by the root `pnpm typecheck` command through `pnpm typecheck:scripts`. Script tests are covered by the root `pnpm test` command through `pnpm test:scripts`. Run `pnpm typecheck:scripts` or `pnpm test:scripts` for focused script-only checks.
