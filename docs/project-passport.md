# Project Passport

Project Passport files describe how Personal Software Factory should understand a registered project before real worker execution. Each project registry directory may contain a `project.passport.yaml` file with stable metadata and conservative execution defaults.

## Fields

- `id` and `name` identify the project in the registry and Mission records.
- `description` summarizes the project and any important execution caveats.
- `repo` records the remote URL and default branch. Registry metadata must not clone or call the remote by itself.
- `runtime` describes the expected application shape and known backend/frontend technology.
- `commands` lists install, test, build, and staging commands that workers may use after manual verification.
- `urls` stores production and staging URLs when known.
- `quality_gates` records which checks or approvals are required before release.
- `core_flows` lists critical user flows for planning and QA prioritization.

## ai-novelist

The `ai-novelist` entry is metadata only. Its commands are conservative local defaults and are marked as requiring manual verification because this repository does not contain a real clone of `https://github.com/hxfei-git/ai-novelist.git`.

Do not use the `ai-novelist` passport for real worker execution until a human verifies the install, test, build, and staging commands against an actual checkout.
