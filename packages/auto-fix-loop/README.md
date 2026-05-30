# Auto Fix Loop

`@psf/auto-fix-loop` turns QA dry-run bugs into fix Mission artifacts and reuses `@psf/codex-worker` to generate Codex dry-run prompt and command review artifacts.

It never executes Codex, never pushes remotes, and never calls external services. Max Mission and per-bug attempts are enforced before any fix prompt is produced.
