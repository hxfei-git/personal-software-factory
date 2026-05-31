# GitHub Integration

GitHub integration is currently a mock/dry-run adapter. It prepares reviewable payloads for later branch, PR, and Issue automation without calling GitHub.

## Commands

```bash
pnpm psf integrations:status
pnpm psf integrations:dry-run github
```

API:

```text
GET /integrations
POST /integrations/github/dry-run
```

The POST route requires `Authorization: Bearer <PSF_API_TOKEN>` when auth is enabled.

## Environment

```text
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
ENABLE_REAL_GITHUB=0
```

`ENABLE_REAL_GITHUB=1` only reports `realEnabled: true`; `realNetworkCall` remains `false`.

## Dry-Run Output

The dry-run may include:

- simulated branch name;
- Chinese commit message preview;
- PR title and body preview;
- Issue title and body preview;
- simulated PR and Issue records with example URLs.

It must not push branches, create PRs, create Issues, write comments, or expose `GITHUB_TOKEN`.
