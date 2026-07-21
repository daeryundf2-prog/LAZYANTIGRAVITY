---
name: start-work
description: Use to execute an approved repository work plan with Boulder state and evidence receipts.
---

# start-work

Use this skill to execute an approved Prometheus work plan with Boulder state, evidence receipts, and native Antigravity Stop continuation.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.

## Start-work state

Use Antigravity Stop continuation state keys prefixed exactly as `antigravity:<conversationId>`.
Continue only from the active Boulder work record for that session key, and stop when workspace, active work, or session ownership is missing or ambiguous.
