# Project Registry

The Project Registry is the local source of managed project metadata. It scans repository-local project entries and converts validated Project Passports into Project records that the Orchestrator API and CLI can use.

## Registry Root

Default root:

```text
projects/
```

The API can override this with `PSF_PROJECTS_ROOT`. The current implementation scans only immediate child directories of the root.

## Scan Behavior

`scanProjectRegistry(root)`:

- reads child directories under the registry root;
- looks for `project.passport.yaml` in each child directory;
- skips directories without a passport;
- parses and validates each passport through `@psf/project-passport`;
- normalizes command fields into arrays;
- maps each passport into a Project record;
- returns projects sorted by Project id;
- returns an empty list if the registry root does not exist.

Invalid passport files raise `ProjectRegistryError` with code `INVALID_PROJECT_PASSPORT`. Registry read/access failures raise `PROJECT_REGISTRY_READ_ERROR`.

## Database Sync

`POST /projects/sync` uses the registry scanner and upserts Projects into storage. The CLI command `pnpm psf projects:sync` uses the same registry package and, unless `PSF_SKIP_DB=1`, syncs the Projects into Prisma.

Synced Project fields are derived from the passport:

- `id` and `slug`: passport `id`;
- `name` and `description`: passport metadata;
- `repo_url` and `default_branch`: passport `repo`;
- `local_path`: `./workspaces/<project-id>`;
- `passport_path`: path to `project.passport.yaml`;
- `production_url` and `staging_url`: passport `urls`;
- `status`: `active`.

The registry scan does not clone repositories, call GitHub, run project commands, or touch `workspaces/`.

## ai-novelist

The first registered project is `projects/ai-novelist/project.passport.yaml` for `hxfei-git/ai-novelist`.

Current companion files:

- `projects/ai-novelist/project.passport.yaml`
- `projects/ai-novelist/AGENTS.md`
- `projects/ai-novelist/qa-charter.md`
- `projects/ai-novelist/README.md`

The `ai-novelist` passport is a metadata intake artifact. Its install, test, build, and staging commands are conservative placeholders that require human verification against a real checkout before any real worker may execute them.
