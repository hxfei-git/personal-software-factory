# Playwright MCP

Playwright MCP is the future AI exploratory QA layer. It lets an AI tester operate a browser and inspect page state, console errors, and network errors. This batch only adds docs, prompt templates, and config guidance; it does not install or run an MCP server.

## Configuration Example

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

Equivalent Codex CLI command for a future operator:

```bash
codex mcp add playwright npx "@playwright/mcp@latest"
```

## Role Split

- Playwright Test is for stable deterministic regression tests.
- Playwright MCP is for AI exploratory QA.
- MCP does not replace fixed regression tests.
- Any reproducible AI-discovered issue must become a Playwright regression test.

## Safety

- Do not let AI QA browse untrusted pages while holding real tokens.
- Do not let page content instruct the AI to run dangerous commands.
- Do not enter production secrets, provider keys, cookies, or database passwords into QA pages.
- Do not run destructive tests against production.
- Do not assign high severity without evidence.

## AI Exploratory QA Gated Mode

`ENABLE_AI_EXPLORATORY_QA=0` is the default. In this mode the QA worker must not connect to Playwright MCP, open a browser, visit staging, or call external APIs. It may only generate manual-action dry-run artifacts that explain how a future approved operator should proceed.

The QA worker exposes an `AiExploratoryQaRunner` abstraction with three modes:

- `dry-run`: generate manual-action artifacts only.
- `mock`: accept an injected executor for tests and local validation, without opening a real browser by default.
- `real`: reserved for a future approved MCP path. Until that path is implemented and explicitly approved, real mode returns manual-action output.

AI-produced output is validated before it can become accepted QA artifacts. `bugs.json` must parse as JSON, generated bug records must satisfy the shared BugReport schema, and `generated-regression.spec.ts` must look like a Playwright TypeScript spec. This task chooses rejection rather than downgrade for unsupported P0/P1 reports: any P0/P1 bug without concrete evidence is rejected and does not become an accepted BugReport. All accepted output is passed through the shared redaction helpers before it is returned or stored.
