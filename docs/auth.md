# API Authentication

The Orchestrator API uses single-user bearer token authentication for write operations.

## Rules

- `GET /health` is public and does not require a token.
- `GET` reads are currently public in this local MVP API.
- `POST`, `PUT`, `PATCH`, and `DELETE` require `Authorization: Bearer <PSF_API_TOKEN>` when auth is enabled.
- `PSF_AUTH_DISABLED=true` bypasses write auth and must be limited to local development or automated tests.
- `NODE_ENV=test` disables auth automatically for integration tests.

## Variables

- `PSF_API_TOKEN`: local API token used by the Hub, CLI, or operator scripts for protected writes.
- `PSF_AUTH_DISABLED`: explicit local/test bypass. Do not use it in shared, staging, production-like, or internet-exposed environments.

## Local Boundary

For local development, either set a throwaway local token and send the bearer header, or set `PSF_AUTH_DISABLED=true` while testing routes manually. The token in `.env.example` is a placeholder and must not be treated as a secret.

For CI and automated tests, auth may remain disabled through `NODE_ENV=test` so tests do not need secret material.

For any environment reachable by another user or machine, set `PSF_AUTH_DISABLED=false`, provide `PSF_API_TOKEN` out of band, and avoid printing the token in logs, prompts, artifacts, PR bodies, or comments.

## Example

```bash
curl http://127.0.0.1:3000/health
curl -H "Authorization: Bearer $PSF_API_TOKEN" -X POST http://127.0.0.1:3000/projects/sync
```
