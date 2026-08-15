# Repository Conventions

Conventions for human contributors and AI agents working on this repository.

## Stack

- Node >=20 runtime.
- npm workspaces (root package.json) — all components live under `components/*`.
- TypeScript 6 strict mode.
- Biome 2 linting and formatting.

## Test Runners

Two runner conventions coexist; pick by component type:

1. **Legacy/full components (`vitest`)** — `components/rules`, `components/telemetry`, `components/lsp`, `components/git-bash`, `components/comment-checker`, `components/start-work-continuation`, `components/ultrawork`, `components/ulw-loop`.
   - `package.json` `test` script is `vitest --run`.
   - Tests are TypeScript files under `test/*.test.ts` and import from `vitest` (`describe`, `it`, `expect`, `vi`).
   - Nested `describe` names use `#given`, `#when`, `#then` form, or inline `// given`, `// when`, `// then` comments. Never use Arrange-Act-Assert comments. Keep fixtures in `test/fixtures/`.

2. **New/native components (`node:test`)** — `components/adaptive-reasoning`, `components/quick-lane`, `components/memory`.
   - `package.json` `test` script is `node --test test/*.test.mjs`.
   - Tests are JavaScript ESM files under `test/*.test.mjs` importing `node:test` and `node:assert/strict`.
   - No `vitest` devDependency. Use Node's built-in runner so no third-party test framework is required.
   - Do not regress these to `vitest --run`: `node:test` files are invisible to vitest's collector and `npm test` exits 1 with "No test suite found".

## Forbidden

- No `as any` or `as unknown`.
- No `@ts-ignore` or `@ts-expect-error`.
- No enums.
- No non-null assertions.
- No default exports. `vitest.config.ts` is exempt because the framework requires that shape.

## File Ceiling

- Keep each `src/` TypeScript file under 250 pure LOC.
- Split by responsibility before a file reaches the ceiling.

## Commit Style

- Use Conventional Commits.
- Keep commits atomic.
- Each commit's tests and build must pass on its own.

## Branding

- Repo artifacts live under `.omo/` and `.lazycodex/` paths.
- CLI commands use the `lazyantigravity ...` form. `omo ...` remains a compatibility alias.
- Environment variables use the `OMO_*` / `LAZYANTIGRAVITY_*` prefixes.

## Build and Hooks

- Component build output goes to `dist/` and is committed.
- Root `npm run build` aggregates: sync-mcp-config, sync-hook-status-messages, build-bundled-mcp-runtimes, sync-skills, sync-telemetry, build-components, materialize-shared-skills, sync-omo-mirror.
- Hooks live under `components/*/hooks/hooks.json` and are aggregated into the root `hooks.json`.
- Skills are authored in `shared-skills/skills/*/SKILL.md` and materialized into `skills/`; keep them in sync (`npm run sync:skills`).