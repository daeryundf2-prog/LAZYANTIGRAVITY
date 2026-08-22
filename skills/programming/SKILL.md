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

1. **The type system is your proof system.** Make illegal states unrepresentable. Express bugs as compile-time type errors.
2. **Parse, don't validate.** Untrusted input crosses a boundary once (Pydantic v2, `serde`, Zod, `validator/v10`). Inside the boundary, code receives typed values.
3. **One name = one concept.** Use branded types / newtypes (`UserId = NewType(...)`, `struct UserId(u64)`, `type UserId = Brand<...>`).
4. **Exhaustive variant matching, always.** Match unions/enums exhaustively with `assert_never` / `assertNever`. Never use `if/elif` variant chains.
5. **Trust framework guarantees.** Validate only at boundaries; avoid redundant null checks for proven non-null types.
6. **Test-driven (TDD).** Red (failing test) → Green (minimal code) → Refactor (clean structure).

---

## The 250 Pure LOC Ceiling (Non-Negotiable)

**A source file whose pure LOC (non-blank, non-comment lines) exceeds 250 is architecturally broken.**
- Measure: `awk '!/^[[:space:]]*$/ && !/^[[:space:]]*(\/\/|#|--)/' <file> | wc -l`
- ≤ 200 LOC: Healthy
- 200 - 250 LOC: Warning band (propose split)
- \> 250 LOC: **DEFECT** — split by responsibility into smaller cohesive units immediately.

---

## Mandatory Post-Write Review Loop

Before declaring any coding task complete:
1. **Measure LOC**: Verify pure LOC is ≤ 250.
2. **Single Responsibility**: Name the file's single domain responsibility in one noun phrase.
3. **Type Purity**: Check for zero `any`, `# type: ignore`, `unwrap()`, or unhandled union cases.
4. **Regression Locked**: Verify tests fail if new behavior is reverted.

---

## Modern Ecosystem & Toolchain Canonical Defaults (2026)

| Language | Boundary Parse | Web / RPC | DB / ORM | Linter / Formatter | Test Runner |
|---|---|---|---|---|---|
| **Python** | Pydantic v2 | FastAPI | SQLAlchemy 2.x async | `ruff check` + `basedpyright` | `pytest` |
| **Rust** | `serde` + derive | axum | `sqlx` | `clippy -- -D warnings` | `cargo nextest` + `miri` |
| **TypeScript**| Zod v4 | Hono | Drizzle | Biome | `bun test` / `vitest` |
| **Go** | `validator/v10` | gin / connect-go | `sqlc` + `pgx/v5` | `golangci-lint v2` + `nilaway` | `go test -race` + `goleak` |

---

## Per-Language Jump Table

- **Python**: `references/python/` (`pyproject-strict.md`, `data-modeling.md`, `error-handling.md`, `fastapi-stack.md`)
- **Rust**: `references/rust/` (`zero-cost-safety.md`, `cargo-strict.md`, `axum-stack.md`, `references/rust-ub/`)
- **TypeScript**: `references/typescript/` (`tsconfig-strict.md`, `type-patterns.md`, `backend-hono.md`)
- **Go**: `references/go/` (`libraries.md`, `golangci-strict.md`, `backend-stack.md`, `sqlc-pgx.md`)
