# korean-law-mcp (bundled offline fallback)

This package is an **offline statute-grounding MCP** — a single-file server
(`src/cli.mjs` → `dist/cli.js`) with a hardcoded Korean statute subset, used as a
fail-closed anti-hallucination guard when the full API server is unavailable.

It is **not** a vendored build of
[`daeryundf2-prog/korean-law-mcp`](https://github.com/daeryundf2-prog/korean-law-mcp)
(the ~98-tool 법제처 API server, MIT). The name overlap is historical; the two
codebases share no source. The full server is consumed via lazyforensic
(`setup_korean_law.mjs` clones it into `lazyforensic/korean-law-mcp/`) or via
`lazyothers/scripts/korean_law_mcp_wrapper.mjs`, which prefers the full build
and falls back to this bundled server.

This package registers as `korean_law_offline` (lazyothers registers
`korean_law_proxy`); the bare `korean_law` name belongs to lazyforensic's
full-API server, so all three plugins can be enabled without a collision.

Maintenance rule: edit `src/cli.mjs` here directly — there is no upstream to
sync. If the hardcoded statute text is updated, verify against law.go.kr before
committing (the whole point of this server is not to fabricate statute text).
