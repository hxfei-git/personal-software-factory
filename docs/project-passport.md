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
- `quality_gates`: boolean release and QA gates.
- `core_flows`: non-empty list of critical user flows with `id`, `name`, and `priority`.

Command values may be a string or a list of strings. The parser normalizes required commands into arrays.

## Optional Readiness Fields

These fields are optional and must not break older passports when absent:

- `paths`: project-relative path map for expected workspace, backend, frontend, artifact, or test locations. Values are metadata only until verified against a checkout.
- `commands.dev`: local development command or command list. When present, the parser normalizes it into an array.
- `commands.e2e`: deterministic E2E command or command list. When present, the parser normalizes it into an array.
- `commands.lint`: lint/static-check command or command list. When present, the parser normalizes it into an array.
- `urls.local`: local app URL for smoke and E2E entry after the matching command is verified.
- `urls.staging`: staging URL when known. Older passports may omit it, and consumers must handle it as optional.
- `risk_rules`: free-form policy metadata for protected branches, manual approvals, forbidden actions, fallback behavior, or command verification status.

Optional commands that have not been executed locally must be marked `manual-verification-required` in YAML comments or policy metadata and repeated in project docs. A passport can describe real-loop readiness without claiming verified command behavior.

## Readiness Semantics

A passport is metadata, not permission to execute. Reading or syncing a passport must not:

- clone or update the remote repository;
- run install, dev, test, build, lint, E2E, or staging commands;
- push branches;
- deploy production;
- read or write secret values.

Real worker execution must separately satisfy branch protection, approval, workspace isolation, command verification, timeout, and secret-redaction rules. If a repository, command, URL, selector, or dependency is unavailable, workers should stop and produce a manual-action report instead of fabricating pass/fail evidence.

## ai-novelist Passport

`projects/ai-novelist/project.passport.yaml` registers the first target project, `hxfei-git/ai-novelist`.

Its current paths, commands, local/staging URLs, risk rules, and core flows are readiness metadata for a future real loop. The real `ai-novelist` repository is not checked out in this workspace, so the commands are deliberately marked `manual-verification-required` and must not be treated as verified worker commands until a human confirms them against the actual project.

The companion files define the same boundary:

- `AGENTS.md`: project-specific worker rules, real-loop safety constraints, smoke/E2E entry expectations, and manual-action fallback.
- `qa-charter.md`: critical normal and abnormal QA paths plus evidence expectations for later deterministic and exploratory QA.
- `README.md`: local metadata description for the registered project.
