# LazyAntigravity Architecture & Security Model

## 1. Executive Summary
LazyAntigravity is a high-performance, enterprise-grade multi-agent orchestration layer designed for Google Antigravity and Gemini 3.7 Flash / Pro hybrid execution. This document details the architectural topology, security boundaries, isolation mechanics, and governance invariants enforced across the platform.

---

## 2. Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Antigravity IDE                   │
│   (Gemini 3.7 Flash High / Gemini 3.7 Pro Adversarial)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON-RPC / CLI / Hooks
┌──────────────────────────────▼──────────────────────────────┐
│                  LazyAntigravity Core Layer                 │
│  - Adaptive Thinking Budget & Routing (0 ~ 32k)              │
│  - ULW-Loop State Machine & 3-Gate Quality Verification     │
│  - Active Memory & Working Facts Store (Atomics.wait Lock)  │
│  - Multi-Wave Ultra-Research & Claim Ledger Lock            │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC / Sandboxed Execution
┌──────────────────────────────▼──────────────────────────────┐
│                    Bundled MCP Subsystem                    │
│  - lsp-tools-mcp: Multi-lang Compiler Diagnostics & Scope   │
│  - ast-grep-mcp: Tree-sitter Pattern Match & Safe Replace   │
│  - git-bash-mcp: Shell-Free Allowlisted Command Runner      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Security Architecture & Boundary Invariants

### 3.1. Sandboxed Command Execution (`git-bash-mcp`)
- **No-Shell Binding**: All process spawning uses `spawn(binary, args, { shell: false })` to prevent shell injection, piping, and command substitution.
- **Strict Binary Allowlist**: Only safe operational binaries (`git`, `pwd`, `ls`, `echo`) are whitelisted. General shell runtimes (`sh`, `bash`, `zsh`), interpreter execution (`node`, `python`, `npx`), and credential/file dumpers (`env`, `cat`) are permanently blocked.
- **Metacharacter Stripping**: Commands containing `;`, `&`, `|`, `$`, `>`, `<`, or newline characters are rejected before execution.

### 3.2. Subagent & Worktree Swarm Isolation
- **Ephemeral Git Worktrees**: Parallel subagents execute within isolated worktrees (`.lazyantigravity/worktrees/agent-<id>`), preventing concurrent filesystem write collisions.
- **Atomic Squash-Merge**: Upon task completion, changes are verified through 3-Gate checks and atomically squashed into the main branch; dirty or failed worktrees are pruned immediately.

### 3.3. Telemetry & Privacy Governance
- **Default-Off Opt-In**: Telemetry collection is disabled by default (`LAZYANTIGRAVITY_TELEMETRY_OPT_IN=1` required).
- **Data Scrubbing**: All logs, lineage traces, and error payloads pass through `stripSensitiveData()` to mask tokens, passwords, authorization headers, and environment secrets before storage.

---

## 4. Multi-Agent Orchestration & Quality Gates

### 4.1. 3-Gate Quality Pipeline
1. **Mechanical Gate**: Verifies automated test execution (`npm test`, `pytest`, `cargo test`, `go test`) whenever source files are modified, and checks LSP diagnostics.
2. **Semantic Gate**: Enforces non-empty goals/summaries, verifies claim-vs-file consistency, blocks unresolved stagnation, and prevents unapproved model switching.
3. **Consensus Gate**: Dispatches 3-4 orthogonal reviewer personas (`advocate`, `devils_advocate`, `regression_reviewer`, `security_state_reviewer`) on high-risk, security-sensitive, or destructive changes.

### 4.2. Strict Evidence Verification Contract
- **Anti-Hallucination Gate**: Mandates explicit classification of evidence into `verified`, `partial`, `not_checked`, or `inference`.
- **Zero-Gap Purity**: Verified evidence rejects any unread ranges, unknowns, or inferences. Partial/inference states must explicitly document gaps.
- **Active-Learning Memory Provenance**: Permanent fact storage requires verified evidence with origin traceability.

### 4.3. Fail-Open Hook Architecture
All lifecycle hooks run under `hook-runner.mjs` with `FAIL_OPEN` semantics and tight timeouts (2~10s). A hook failure or timeout logs an alert but never interrupts user workflow or locks the IDE turn.

---

## 5. Concurrency & Performance Discipline

- **Atomics.wait Sleeping Lock**: File-based synchronization uses memory-shared futex sleeping instead of CPU-pegging spinlocks.
- **WAL Transactional Event Store**: Control-plane event streams are validated with SHA-256 checksums to ensure state consistency.
- **250 LOC Ceiling**: All TypeScript source modules adhere strictly to a $<250$ LOC ceiling with Single Responsibility Principle (SRP) decomposition.
