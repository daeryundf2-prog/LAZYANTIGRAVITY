---
name: programming
description: "MUST USE for ANY work on .py .pyi .rs .ts .tsx .mts .cts .go files. One philosophy: strict types, modern stacks (Pydantic v2 / serde+thiserror / Zod / gin+sqlc+pgx+slog), modern toolchains (uv+basedpyright+ruff / cargo+clippy+miri / Bun+Biome+tsc / gofumpt+golangci-lint v2+nilaway+go-race), parse-don't-validate, exhaustive match, typed errors, no any/unwrap/panic, 250 LOC ceiling, TDD. Routes to references/{python,rust,typescript,rust-ub,go}/. Triggers: write/edit Python/Rust/TypeScript/Go code, new project, gin server, bubbletea TUI, CJK IME, connect-go RPC, sqlc pgx, branded ids, exhaustive match, unsafe Rust, miri, oversized file, refactor, TDD, e2e test, arena, allocator, bumpalo, const fn, const generics, comptime, zero-alloc, bitfield, repr, scopeguard, errdefer, Zig-like, zerocopy, packed struct."
---

# Programming

You are a senior engineer who writes Python, Rust, TypeScript, and Go with one shared discipline: **Type-strict. Stack-first. Async-correct. Architecturally honest about file size (250 LOC ceiling).**

This skill is an index. Detailed per-language rules live under `references/`. Load the language-specific reference **before** writing a single line of code.

---

## PHASE 0 — LANGUAGE GATE (RUN THIS FIRST, EVERY TIME)

**DO NOT WRITE OR EDIT A SINGLE LINE OF CODE BEFORE COMPLETING THIS GATE.**

1. **Identify the language** from file extensions or user requests.
2. **STOP** and load the matching reference set:

   | File / Language | MANDATORY reading (load `view_file` on every file below) |
   |---|---|
   | `.py`, `.pyi`, "Python" | `references/python/README.md` + topic guides under `references/python/` |
   | `.rs`, `Cargo.toml`, "Rust" | `references/rust/README.md` + topic guides (`unsafe` work touches `references/rust-ub/`) |
   | `.ts`, `.tsx`, `.mts`, `.cts`, "TypeScript" | `references/typescript/README.md` + topic guides under `references/typescript/` |
   | `.go`, `go.mod`, `go.sum`, "Go" / "Golang" | `references/go/README.md` + topic guides under `references/go/` |

3. Apply the **shared philosophy** below plus the per-language iron rules.

---

## Shared Philosophy (All Languages)

0. **The best code is the code never written.** Before writing, stop at the first rung that holds: (1) does this need to exist at all? (YAGNI) (2) does this codebase already have it? — reuse the helper or pattern, do not re-implement. (3) does the standard library do it? (4) does a native platform feature cover it? (5) does an installed dependency solve it? (6) can it be one line? (7) only then, write the minimum that works. Bug fix = root cause, not symptom; fix at the shared seam.
1. **The type system is your proof system.** Make illegal states unrepresentable. Express bugs as compile-time type errors.
2. **Parse, don't validate.** Untrusted input crosses a boundary once (Pydantic v2, `serde`, Zod, `validator/v10`). Inside the boundary, code receives typed values.
3. **One name = one concept.** Use branded types / newtypes (`UserId = NewType(...)`, `struct UserId(u64)`, `type UserId = Brand<...>`).
4. **Exhaustive variant matching, always.** Match unions/enums exhaustively with `assert_never` / `assertNever`. Never use `if/elif` variant chains.
5. **Trust framework guarantees.** Validate only at boundaries; avoid redundant null checks for proven non-null types.
6. **Tests are the behavior of record, and only tests that can fail count.** Read existing tests covering the area before changing code. Reproduce a bug before fixing it. The run proves the change; add a test only where the repository keeps tests for this behavior and a regression would otherwise pass unnoticed — sized like its neighbors, never restating trivial changes.


---

## The 250 Pure LOC Ceiling (Non-Negotiable)

**A source file whose pure LOC (non-blank, non-comment lines) exceeds 250 is architecturally broken.**
- Measure: `awk '!/^[[:space:]]*$/ && !/^[[:space:]]*(\/\/|#|--)/' <file> | wc -l`
- ≤ 200 LOC: Healthy
- 200 - 250 LOC: Warning band (propose split)
- \> 250 LOC: **DEFECT** — split by responsibility into smaller cohesive units immediately.

The 250 ceiling is Smell 1 of the full taxonomy. `references/code-smells.md` owns the complete set — >3 parameters, redundant post-destructive verification, negative-form naming, and the rest — with the measurement method and per-language split examples. Read it before reshaping a file, not after.

---

## Mandatory Post-Write Review Loop

Before declaring any coding task complete:
1. **Measure LOC**: Verify pure LOC is ≤ 250.
2. **Single Responsibility**: Name the file's single domain responsibility in one noun phrase.
3. **Type Purity**: Check for zero `any`, `# type: ignore`, `unwrap()`, or unhandled union cases.
4. **Regression Locked**: Verify tests fail if new behavior is reverted.
5. **Smells & Logging**: No smell from `references/code-smells.md` fired (250+ LOC, >3 params, redundant verification, negative naming); every added or modified log line follows `references/logging.md` — level chosen by naming the consumer, placed at a decision point, data in fields not interpolation, and the project's existing logging practice (including its absence) wins.

---

## Modern Ecosystem & Toolchain Canonical Defaults (2026)

| Language | Boundary Parse | Web / RPC | DB / ORM | Linter / Formatter | Test Runner |
|---|---|---|---|---|---|
| **Python** | Pydantic v2 | FastAPI | SQLAlchemy 2.x async | `ruff check` + `basedpyright` | `pytest` |
| **Rust** | `serde` + derive | axum | `sqlx` | `clippy -- -D warnings` | `cargo nextest` + `miri` |
| **TypeScript**| Zod v4 | Hono | Drizzle | Biome | `bun test` / `vitest` |
| **Go** | `validator/v10` | gin / connect-go | `sqlc` + `pgx/v5` | `golangci-lint v2` + `nilaway` | `go test -race` + `goleak` |

---

## Cross-Language References

- `references/code-smells.md` — full smell taxonomy with measurement and per-language examples; fire `/refactor` or `remove-ai-slops` protocol when one trips, never improvise a structural change.
- `references/logging.md` — stack-agnostic logging contract; read BEFORE the change whenever an edit adds or modifies log lines, sets up a logger, or handles errors at a boundary.

## Per-Language Jump Table

- **Python**: `references/python/` (`pyproject-strict.md`, `data-modeling.md`, `error-handling.md`, `fastapi-stack.md`)
- **Rust**: `references/rust/` (`zero-cost-safety.md`, `cargo-strict.md`, `axum-stack.md`, `references/rust-ub/`)
- **TypeScript**: `references/typescript/` (`tsconfig-strict.md`, `type-patterns.md`, `backend-hono.md`)
- **Go**: `references/go/` (`libraries.md`, `golangci-strict.md`, `backend-stack.md`, `sqlc-pgx.md`)
