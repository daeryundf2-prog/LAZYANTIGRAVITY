---
name: frontend-ui-ux
description: Use for frontend, UI, UX, accessibility, and visual quality work.
---

# frontend-ui-ux

Use this skill for frontend UI, UX, accessibility, and visual quality work. Verify observable behavior with native Antigravity tools before claiming the interface is ready.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.
