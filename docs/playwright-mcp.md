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
