# Contributing

Conventions for human contributors and AI agents working on this repository.
`AGENTS.md` covers the agent-facing workflow; this file covers the repository
rules and the verification gates a change must pass.

## Stack

- Node >= 20 (CI runs Node 20 and 22).
- npm workspaces under `components/*`; root-level bundled MCP servers in
  `ast-grep-mcp/`, `git-bash-mcp/`, `lsp-tools-mcp/`, `workspace-mcp/`.
- TypeScript per component (`tsc`), tests via `node:test` and `vitest`.

## Verification gates

A change is done when this exits 0:

```bash
npm run check
```

which runs, in order:

1. `npm run build` — 8-stage pipeline (MCP config sync, hook status messages,
   bundled MCP runtimes, skills sync, component builds, shared-skills
   materialization, omo mirror).
2. `npm run verify:hook-policies` — FAIL_OPEN hooks are restricted to
   telemetry/guard wrappers.
3. `npm test` — root test suite (`test/*.test.mjs`), the daemon-bridge suite,
   and the ulw-loop checkpoint vitest suite.
4. `npm run test:components` — every component workspace's own test suite;
   any failure fails the run.

Two additional gates run in CI and locally before a release:

- `npm run verify:reproducible` — committed `dist/` artifacts must equal a
  fresh build byte-for-byte.
- `npm run doctor -- --json` — manifest/hook/MCP/skill integrity.

## Repository rules

- **dist is committed and must stay in sync.** The bundled MCP packages ship
  a committed `src/` and rebuild via `npm run build` inside the package; never
  edit `dist/` by hand — `verify:reproducible` will reject the diff.
- **250 LOC ceiling** on `components/*/src/**/*.ts` (enforced by
  `test/p0-p1-security.integration.test.mjs`). Split files instead of growing
  them.
- **Fail-open is reserved.** Only telemetry/guard hooks may wrap themselves in
  `scripts/hook-runner.mjs` with `FAIL_OPEN`; `verify:hook-policies` enforces
  the allowlist. Everything else fails closed.
- **No new runtime network egress.** Local-only by default; remote MCP servers
  exist only as `mcp_config.remote.example.json`. Telemetry stays opt-in with
  no bundled API key.
- **Security-sensitive surfaces need regression tests.** Parser/allowlist
  changes in the bundled MCP servers must extend
  `test/mcp-security-regression.test.mjs` and/or
  `test/git-bash-fuzz.test.mjs`.
- **Claims need local evidence.** Docs may only state what a command in this
  repo can verify (`npm run doctor`, `evidence:map`, `bench`, tests). Do not
  add performance numbers without a benchmark that prints them.

## Adding things

- **Component**: create `components/<name>/` with its own `package.json`
  (`build` = tsc, `test`), add it to root `workspaces`, ship at least one test
  file — `test:components` runs it automatically.
- **Bundled MCP server**: follow `workspace-mcp/` — committed `src/*.mjs`,
  `npm run build` copying `src` to `dist` via `scripts/build-mcp-package.mjs`,
  register in `scripts/build-bundled-mcp-runtimes.mjs` and `mcp_config.json`.
- **Skill**: author under `shared-skills/skills/<name>/SKILL.md` (or a
  component's `skills/`), run `npm run sync:skills`; the aggregate `skills/`
  tree is generated and must not be hand-edited.

## Commit style

Conventional Commits (`fix:`, `feat:`, `docs:`, `chore:`, `test:`), one
logical change per commit, updated `dist/` regenerated and included whenever
sources under `components/` or the bundled MCP packages changed.
