---
name: ulw-plan
description: Use for decision-complete planning before high-risk multi-module implementation.
---

# ulw-plan

Use this skill for decision-complete planning before high-risk multi-module implementation. Explore first, ask only unresolved forks, and hand off a worker-ready plan.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.
