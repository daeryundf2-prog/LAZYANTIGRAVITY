---
name: lsp
description: Use for on-demand language-server diagnostics through the local LSP MCP server.
---

# lsp

Use this skill for language-server diagnostics. Call the local MCP server through Antigravity's tool interface with server id `lsp` and tool `diagnostics`; do not use double-underscore tool names.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.
