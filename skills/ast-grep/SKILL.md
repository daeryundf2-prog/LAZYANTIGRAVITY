---
name: ast-grep
description: Use ast-grep for syntax-aware code search and deterministic rewrites with Antigravity-native tool calls.
---

# ast-grep

Use this skill for deterministic syntax-aware search and codemods. Prefer Antigravity `grep_search` for plain text and `run_command` for approved local ast-grep commands.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.
