# @psf/demo-workflow

Shared local dry-run demo workflow package for Personal Software Factory.

This package defines the fixed `ai-novelist` demo identifiers, local URLs, operation result types, and dry-run safety boundary used by the CLI, Orchestrator API, and Hub Web integration surfaces.

## Dry-run boundary

The demo workflow must stay local and non-destructive:

- `dryRun` is always `true`.
- `realCodexExecuted` is always `false`.
- `realExternalCall` is always `false`.
- `realPush` is always `false`.
- `realDeploy` is always `false`.

Future workflow implementation should preserve this boundary until a later explicitly approved task enables real network callers.
