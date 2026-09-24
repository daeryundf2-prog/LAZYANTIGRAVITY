# Repository Conventions

Conventions for human contributors and AI agents working on this repository.

## Stack

- Node >=20 runtime.
- npm workspaces (root package.json) — all components live under `components/*`.
- TypeScript 6 strict mode.
- Biome 2 linting and formatting.

## Omniscient Mode & Two-Step Strike
- **Trust level: 프롬프트 계약(advisory).** The items below are behavioral guidance, not mechanically enforced rules. Implementation is `scripts/awt-guard.mjs` injecting fixed advisory phrases (`additionalContext`) plus a regex that detects meta-excuse phrases — it advises, it cannot guarantee.
- **Assume Agent Correctness**: Proceed decisively in Omniscient Mode without second-guessing routine actions.
- **Eliminate Attention Dispersion**: Avoid wandering into unrelated files out of self-doubt.
- **Two-Step Strike**: High-focus generation (Gemini 3.8 Flash) + mechanical error capture (PostToolUse hooks & Oracles).
- **AWT Trajectory Lock**: Lock to the task contract. If an action drifts by 1 degree, trim and realign immediately.
- **Anti-Metacognitive Ban**: Never emit self-excusing meta-dialogue ("흥미롭군요", "That's interesting"). Emit factual error stacks and fixes only.
- **Coverage claims require an audit receipt**: Any "전수/100% 커버리지" style audit conclusion must be backed by
  `node scripts/coverage_audit.mjs --source <원문파일> --target <산출물…> --json <receipt.json>`.
  Save the source material to a file BEFORE auditing; auditing against a self-made keyword list is a circular
  audit and is forbidden — the tool refuses to run without `--source`. The receipt keeps a per-item
  source-line → target-location mapping. (GUARD_PACK_VERSION 1.0.0, canonical: lazyforensic)

## Test Runners

Two runner conventions coexist; pick by component type:

1. **Legacy/full components (`vitest`)** — `components/comment-checker`, `components/git-bash`, `components/rules`, `components/start-work-continuation`, `components/telemetry`, `components/ultrawork`, `components/ulw-loop`.
   - `package.json` `test` script is `vitest --run`.
   - Tests are TypeScript files under `test/*.test.ts` and import from `vitest` (`describe`, `it`, `expect`, `vi`).
   - Nested `describe` names use `#given`, `#when`, `#then` form, or inline `// given`, `// when`, `// then` comments. Never use Arrange-Act-Assert comments. Keep fixtures in `test/fixtures/`.

2. **New/native components (`node:test`)** — `components/active-learning`, `components/adaptive-reasoning`, `components/ast-index`, `components/daemon-bridge`, `components/memory`, `components/quick-lane`, `components/session-tree`.
   - `package.json` `test` script is `node --test test/*.test.mjs`.
   - Tests are JavaScript ESM files under `test/*.test.mjs` importing `node:test` and `node:assert/strict`.
   - No `vitest` devDependency. Use Node's built-in runner so no third-party test framework is required.
   - Do not regress these to `vitest --run`: `node:test` files are invisible to vitest's collector and `npm test` exits 1 with "No test suite found".

3. **Hybrid (`components/lsp`)** — `package.json` `test` script is `node scripts/test.mjs`, a wrapper that runs `vitest --run` then `node --test scripts/*.test.mjs`. Keep both suites green.

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

## Subagents: `fact-mentor` Adversarial Audit Subagent (Feature 05)

- **Trust level: 프롬프트 계약(advisory).** `fact-mentor` is a role defined in skill prompts (`shared-skills/skills/review-work`, `shared-skills/skills/boost`), not a runtime subagent binary. The host agent dispatches it by prompt contract; the constraints below are advisory unless the host enforces them.
- **Identity**: `fact-mentor` (Pro-tier adversarial falsification oracle, `Model: "pro"`).
- **Sole Mandate**: Adversarial falsification of executor claims, file paths, SemVer versions, and benchmark metrics.
- **Trigger**: Dispatched automatically during `skills/review-work` (Phase 1) and `skills/boost` (Stage 4).
- **Execution Contract**: Operates with `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`. Actively runs tool calls to attempt to disprove assertions. If an unverified path or fake metric is found, issues a blocking FAIL verdict.