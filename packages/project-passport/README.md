# Project Passport

Project Passport defines and validates `project.passport.yaml`, the local contract that tells Personal Software Factory how a managed project is installed, tested, built, started for staging, and quality-gated.

## Responsibilities

- Read YAML from disk.
- Validate required fields through `@psf/mission-schema`.
- Normalize command values so `install`, `test`, `build`, and `run_staging` are arrays.
- Surface validation errors for invalid passport files.

## Required Fields

- `id`
- `name`
- `repo.url`
- `repo.default_branch`
- `runtime.kind`
- `commands.install`
- `commands.test`
- `commands.build`
- `commands.run_staging`
- `urls.production`
- `urls.staging`
- `quality_gates`
- `core_flows`

## Example

See `examples/project.passport.yaml` for the ai-novelist sample.

## Commands

```bash
pnpm --filter @psf/project-passport test
pnpm --filter @psf/project-passport typecheck
```
