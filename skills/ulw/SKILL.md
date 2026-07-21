---
name: ulw
description: Use for bounded parallel execution with native Antigravity collaboration tools.
---

# ulw

Use this skill as the fresh-install shorthand for `ulw-loop`: run durable, evidence-backed execution loops with native Antigravity collaboration tools, including `invoke_subagent`, `send_message`, and `manage_subagents`.

## Fresh-install execution

If `ulw-loop` is available in the active skill list, follow that skill's workflow. If only this `ulw` skill is visible, execute the same bounded loop directly:

1. Restate the user-visible goal and keep work tied to explicit completion gates.
2. Break the task into small, verifiable steps and keep exactly one step in progress.
3. Capture evidence for each completed step before claiming progress.
4. Use native Antigravity collaboration tools for bounded delegation only when they are useful.
5. Stop only when the requested outcome is implemented, verified, and summarized with remaining limits.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.
