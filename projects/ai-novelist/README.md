# AI 小说助手 Registry Entry

This directory is a local Project Registry entry for `ai-novelist`. It is not a clone of the real repository, and this task does not modify the upstream `ai-novelist` project.

The commands in `project.passport.yaml` are placeholders and conservative local defaults. They must be manually verified against a real checkout before any worker uses them for real execution.

Adding this entry makes no real external calls. It only adds local metadata for registry scanning, Mission planning, dry-run worker behavior, and future QA planning.

Validate this entry through the Project Registry package:

```bash
pnpm --filter @psf/project-registry test
pnpm --filter @psf/project-passport test
```

The registry scan should discover `projects/ai-novelist/project.passport.yaml` when root project scanning is enabled.
