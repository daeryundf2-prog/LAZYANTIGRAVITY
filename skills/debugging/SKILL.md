---
name: debugging
description: Use for evidence-led runtime debugging, reproduction, root-cause isolation, and verified fixes.
---

# debugging

Use this skill for evidence-led runtime diagnosis. Reproduce first, inspect with `view_file`, `grep_search`, and `run_command`, then verify the minimal fix.

## Verified quality-gate policy

After edits, request on-demand LSP verification with server id `lsp`, tool `diagnostics`, and exact arguments `{filePath:"<absolute changed file>",severity:"error"}`.

Use the checked fixtures as the contract source:

- `test/fixtures/lsp/clean.json` renders `LSP verification: clean (<file>)`
- `test/fixtures/lsp/diagnostics.json` renders `LSP verification: <N> error(s) (<file>)`
- `test/fixtures/lsp/unavailable.json` renders `LSP verification unavailable: <reason>`

Treat unavailable verification as unavailable, never as clean.
