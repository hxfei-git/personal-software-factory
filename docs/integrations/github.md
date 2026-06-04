# GitHub Integration

GitHub integration keeps the existing mock/dry-run adapter and now also exposes a code-level real adapter for later orchestrator wiring. The Hub/API dry-run surface still does not call GitHub.

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

Default is disabled. When `ENABLE_REAL_GITHUB` is unset or `0`, the real adapter returns `realEnabled: false`, `realNetworkCall: false`, and manual-action guidance. Missing token/owner/repo also returns manual action instead of throwing.

## Gated Real Mode

`runGitHubReal` requires all of the following before it can call the injected transport:

- `ENABLE_REAL_GITHUB=1`;
- configured `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO`;
- an injected `IntegrationTransport` function;
- `gates.allowNetwork=true`;
- explicit operation gates such as `allowPushBranch`, `allowCreatePullRequest`, `allowUpdatePullRequestBody`, and `allowPostQaComment`.

The adapter refuses `main` and `master` as push/PR source branches before calling transport. Request summaries returned by the adapter include method and URL only; authorization headers are never returned. PR bodies, QA comments, errors, logs, and result objects are redacted before return.

## Injected Transport Testing

Tests pass fake transports that capture requests and return success, 401 auth failure, 403 permission failure, and thrown timeout/network errors. No test performs a real network call.

## Dry-Run Output

The dry-run may include:

- simulated branch name;
- Chinese commit message preview;
- PR title and body preview;
- Issue title and body preview;
- simulated PR and Issue records with example URLs.

It must not push branches, create PRs, create Issues, write comments, or expose `GITHUB_TOKEN`.
