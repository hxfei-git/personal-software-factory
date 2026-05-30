# Project Passport

A Project Passport describes how Personal Software Factory should understand a managed project before worker execution. Passport files live at:

```text
projects/<project-id>/project.passport.yaml
```

The registry parses, validates, and normalizes them through `@psf/project-passport`.

## Required Fields

- `id`: stable Project id used by Missions, registry sync, and workspace paths.
- `name`: human-readable Project name.
- `description`: optional summary and caveats.
- `repo.url`: remote repository URL.
- `repo.default_branch`: default protected branch, usually `main` or `master`.
- `runtime.kind`: broad application type, currently free-form.
- `runtime.backend`: optional backend metadata.
- `runtime.frontend`: optional frontend metadata.
- `commands.install`: install/setup command or command list.
- `commands.test`: test command or command list.
- `commands.build`: build command or command list.
- `commands.run_staging`: local staging command or command list.
- `urls.production`: production URL when known, or an empty string.
- `urls.staging`: staging URL when known, or an empty string.
- `quality_gates`: boolean release and QA gates.
- `core_flows`: non-empty list of critical user flows with `id`, `name`, and `priority`.

Command values may be a string or a list of strings. The parser normalizes them into arrays.

## Boundaries

A passport is metadata, not permission to execute. Reading or syncing a passport must not:

- clone or update the remote repository;
- run install, test, build, or staging commands;
- push branches;
- deploy production;
- read or write secret values.

Real worker execution must separately satisfy branch protection, approval, workspace isolation, and command verification rules.

## ai-novelist Passport

`projects/ai-novelist/project.passport.yaml` registers the first target project, `hxfei-git/ai-novelist`.

Its current commands are placeholders for local verification:

- create and activate a Python virtual environment;
- install the Python project in editable mode;
- install frontend dependencies under `web/frontend`;
- run `pytest -q`;
- run the frontend build;
- start a local staging web process.

These commands are deliberately marked as requiring manual verification. This repository does not contain a real `ai-novelist` checkout, so the commands must not be used by a real worker until a human confirms them against the actual project.

## Companion Files

- `AGENTS.md`: project-specific worker rules, including no remote push without approval and no direct main-branch work.
- `qa-charter.md`: critical flows and QA priorities for later deterministic and exploratory QA.
- `README.md`: local metadata description for the registered project.
