# Plan: Insane-Search v2 — make ultra-research executable

Status: **SPEC, ready for implementation** (verify-first; measured on 2026-08-30)
Owner: implement in a real Antigravity session; commit + push per repo conventions.

## Why (verified gaps, not opinions)

`ultra-research.md` (now at `components/ultrawork/skills/ulw-plan/references/ultra-research.md`)
is methodologically sound (orthogonal 3-wave dispatch, counter-search, 2+ domain
rule, primary-source rule, Pro oracle) and its dispatch/verdict patterns are
already proven live (consensus transport + 4-persona reviews, 2026-08-29).
But three gaps keep it from actually running:

1. **The collection layer references tools that do not exist.** Phase 1 tells
   workers to use `search_web` / `read_url_content` — neither exists in this
   plugin nor in the documented Antigravity tool surface. Waves dispatch, then
   have nothing to search or read with.
2. **The "Claim Ledger Data-Flow Lock" is prose only.** It claims to be
   "self-enforcing", but `claim-ledger.md` is just a markdown table the agent
   writes; nothing mechanically checks domain independence, counter-search, or
   primary-source columns.
3. **It is disconnected from the ulw-loop evidence machinery** (ledger,
   checkpoints, consensus), so research claims never promote into the
   verified-evidence system.

Channel availability, measured from the owner's machine (2026-08-30):

| Channel | Status | Notes |
| --- | --- | --- |
| Jina Reader `https://r.jina.ai/{url}` | **works keyless** | returned clean markdown for example.com |
| Jina Search `https://s.jina.ai/{q}` | **401 without key** | needs `Authorization: Bearer` |
| GitHub REST `api.github.com` | **works keyless** | whisper.cpp → 53,298 stars |
| arXiv `export.arxiv.org/api/query` | unverified this round | re-verify during implementation |
| DuckDuckGo HTML `html.duckduckgo.com/html/?q=` | fallback, unverified | parse `<a.result__a>`; fragile — treat as last resort |

---

## Phase 1 — `research-mcp` (6th bundled MCP server)

New package `research-mcp/` mirroring `media-mcp/` exactly:
`src/cli.mjs` + `package.json` (`build: node ../scripts/build-mcp-package.mjs`).

### Gating
- Whole server: **`LAZYANTIGRAVITY_RESEARCH_NETWORK=1`** env opt-in (same
  pattern as `media_youtube`). Without it, every tool returns the honest gate
  error naming the env var and how to set it in `mcp_config.json` env.
- Startup guard: warn when cwd is inside `PLUGIN_ROOT` (copy the guard from
  media-mcp verbatim).

### Tools
1. `web_read(url, {format})`
   - Validate: https/http only; host must not be localhost/private IP
     (block `localhost`, `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`,
     `169.254/16`, `::1`; resolve DNS and re-check).
   - Try `https://r.jina.ai/{url}` first (keyless, clean markdown). If it
     fails or body looks empty, fall back to a direct fetch of the URL
     (text-ish content types only), stripping to readable text.
   - Output: `{ok, url, finalUrl, content}` with `content` truncated at
     200,000 chars. Timeout 30 s. **No file writes.**
2. `web_search(query, {maxResults})`
   - Provider chain, first configured wins:
     `LAZYANTIGRAVITY_TAVILY_KEY` → `LAZYANTIGRAVITY_BRAVE_KEY` →
     `LAZYANTIGRAVITY_JINA_KEY` → DuckDuckGo HTML scrape → honest error
     ("no search provider configured; set one of ... keys, or use web_read on
     known URLs").
   - Normalize results to `{title, url, snippet}[]`, cap 10.
   - Never fabricate results; provider errors surface verbatim.
3. `fetch_json(url)` — public developer APIs only (GitHub, npm, PyPI, arXiv,
   etc.). Same URL guards as web_read; parse JSON; cap output 200k chars;
   timeout 20 s. Optional `User-Agent: lazyantigravity-research`.

All tools: `spawn`/fetch with hard timeouts, output caps, no shell, no
filesystem writes, no secrets in logs.

### Registration checklist (this repo has FIVE places — all required)
1. `mcp_config.json` `mcpServers.research`
2. `scripts/build-bundled-mcp-runtimes.mjs` runtimes list
3. `scripts/lazyantigravity-mcp-status.mjs` `bundledRuntimeNames`
4. Server-list tests — **lists are sorted**: `["ast_grep","git_bash","lsp",
   "media","research","workspace"]` in `test/aggregate-mcp-status.test.mjs`
   and `test/mcp-research-servers.test.mjs` (the sort order bit us twice)
5. `README.md` server count (5→6) and CHANGELOG entry

### Tests (`test/research-mcp.test.mjs`, environment-aware like media's)
- tools/list = the 3 tools
- gate error without `LAZYANTIGRAVITY_RESEARCH_NETWORK=1`
- URL guard: rejects `http://localhost`, `file://`, private-IP host
- `web_search` without keys → honest provider error (no network needed)
- **Network-gated live tests**: only when
  `LAZYANTIGRAVITY_RESEARCH_NETWORK=1` AND keys/`RESEARCH_LIVE=1` are set,
  assert web_read on example.com returns non-empty content. CI runs without
  these env vars → tests skip silently. (CI must stay green keyless/offline.)

## Phase 2 — mechanical Claim Ledger gate

New subcommand under ulw-loop (component pattern: small module + thin cmd):

`lazyantigravity ulw-loop research-claims --file claim-ledger.md [--enforce]`

Parse the markdown table from the ultra-research doc's record format
(columns: Claim | Risk Level | Sources (2+ Domains) | Counter-Search Result |
Primary Source | Status). For each row verify:

- **Domain independence**: extract domains from Sources URLs, dedupe by
  registrable domain (last two labels; special-case co.uk etc. minimally or
  use a small static list), require ≥ 2 distinct.
- **Counter-search performed**: Counter-Search column non-empty and not
  literally "n/a"/"—".
- **Primary source present**: non-empty and looks like a URL or repo/issue
  reference.
- **Status vocabulary**: VERIFIED / REFUTED / UNRESOLVED only; VERIFIED rows
  must pass all three checks above.

Modes: default = report (`{rows, violations[], passCount, failCount}`);
`--enforce` = exit 1 when any VERIFIED row violates, or when the referenced
SYNTHESIS.md cites a claim id not present as VERIFIED (parse `[Claim N]`
markers; unmatched → violation "cited but not verified").

Files: `components/ulw-loop/src/research-claims.ts` (+ parser util if the
file nears the **250-LOC ceiling**, which is enforced by
`test/p0-p1-security.integration.test.mjs`), cmd in
`cli-research-claims.ts`, export via `cli-control-plane.ts`, case in
`cli-commands.ts`. Tests (vitest, in `components/ulw-loop/test/`): passing
ledger, single-domain violation, missing counter-search, unverified citation
in SYNTHESIS, REFUTED rows ignored for citations but listed.

## Phase 3 — modernize the ultra-research doc (truth-align it)

Edit `components/ultrawork/skills/ulw-plan/references/ultra-research.md`:
- Replace `search_web` / `read_url_content` with the real tools
  (`web_search`, `web_read`, `fetch_json`) and the research server's env gate.
- Replace the aspirational Jina/Reddit/arXiv bullet list with the measured
  channel table above (mark which are keyless vs keyed).
- Point the yt-dlp "Media & Subtitles" bullet at the now-real
  `media_youtube` tool (it exists since 0.7.x) instead of raw yt-dlp.
- Phase 3 section: replace "Self-Enforcing" prose with the actual command
  (`ulw-loop research-claims --file ... --enforce`) and state that SYNTHESIS
  must pass it before delivery.
- Note in Phase 5 that SYNTHESIS.md can attach to a checkpoint as
  `--quality-gate-json`-style evidence (via `evidence-draft` workflow).
- Run `npm run sync:skills` after editing (skills/ is generated — never
  hand-edit `skills/`).

## Acceptance (definition of done)

1. `npm run check` green (root suites + 15/15 components + dist sync).
2. `npm run mcp:status -- --probe` shows **6** servers, research probing
   `ok` with 3 tools — with and without the network env set.
3. Gated live smoke (manual, owner machine): with
   `LAZYANTIGRAVITY_RESEARCH_NETWORK=1`, `web_read("https://example.com")`
   returns markdown; `web_search("whisper.cpp")` works when a provider key is
   set, honest error otherwise.
4. `ulw-loop research-claims --enforce` rejects the fixture ledger with a
   single-domain violation (test proves it) and passes the clean fixture.
5. Docs updated (README 6 servers, CHANGELOG, ROADMAP row) and
   `ultra-research.md` mentions no tool that does not exist.
6. Real-session validation row added to ROADMAP's log table.

## Repo conventions the implementer must respect (hard-won)

- Committed `dist/` must match src: after touching component TS, run the
  build; `npm run verify:reproducible` is a CI gate.
- 250-LOC ceiling on `components/*/src/*.ts` (P1-3 test) — split modules.
- New MCP servers appear in 5 places (list above); server-list tests are
  **sorted**.
- Tests must pass on: node 20, node 22, **Windows (blocking CI)**, and
  machines without the optional binaries/keys — hence environment-aware
  tests (see `test/media-mcp.test.mjs`, `test/ast-grep-engine.test.mjs`).
  Windows gotchas we already fixed once: `node --test` does not glob on
  node 20 (enumerate files), `npm` is `npm.cmd` (shell-gate spawns), EOL
  differences (normalize before comparing file contents).
- Network egress is opt-in by env var, always; no keys ship in the repo.
- Skills tree is generated: edit sources, then `npm run sync:skills`.
- Commit style: Conventional Commits, one logical change per commit.


---

## Delegated implementation protocol (for the Gemini session)

You (the Antigravity agent) implement this spec in the plugin clone. Work
order and hard rules:

1. **Prepare**: `git pull` in the plugin clone; confirm
   `docs/plans/insane-search-v2.md` exists (this file). Create a scratch
   branch only if you prefer; main is acceptable (single-maintainer repo).
2. **Implement Phase 1** (research-mcp) exactly per the registration
   checklist — all FIVE registration points, or tests will fail. Build with
   `node scripts/build-bundled-mcp-runtimes.mjs` and verify with
   `npm run mcp:status -- --probe` (6 servers expected).
3. **Implement Phase 2** (research-claims gate) with vitest tests in
   `components/ulw-loop/test/`. Respect the 250-LOC ceiling — split the
   parser into its own module if needed.
4. **Implement Phase 3** (truth-align the reference doc), then
   `npm run sync:skills`.
5. **Gate before committing**: `npm run check` must exit 0 (root tests +
   15/15 component suites + hook policies + dist reproducibility). Network
   gated live tests must SKIP silently in CI (no keys set there).
6. **Commit** in Conventional Commits style, one logical change per commit:
   `feat(research): research-mcp server`, `feat(ulw-loop): mechanical claim
   ledger gate`, `docs(skills): truth-align ultra-research`. Push to main.
7. **Never**: fabricate test observations, commit keys/tokens, add network
   calls outside the opt-in gate, hand-edit `skills/` (generated) or
   `dist/`, exceed the 250-LOC ceiling.
8. **Report back**: the update-check SessionStart hook will tell you if your
   clone lags main before you start - if it does, `git pull --rebase` first.
