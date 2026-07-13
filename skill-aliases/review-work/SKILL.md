---
name: review-work
description: Use for independent post-implementation correctness, security, and QA review.
---

# review-work

Use this skill after meaningful implementation work to verify goal fit, quality, security, and hands-on behavior with Antigravity native subagents where useful.

## Background review liveness

For any review lane likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long reading, testing, or review passes. Require `BLOCKED: <reason>` only when progress stops. A timeout only means no new mailbox update arrived; treat a running child as alive. Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.
