# ⚡ LazyAntigravity Emergency Operations & Cheat Sheet

## 🚀 1. Essential Commands Quick Reference

| Action | Command | Purpose |
| :--- | :--- | :--- |
| **Full Build & Sync** | `npm run build` | Compile all 15 components, sync MCP runtimes & mirror |
| **Verify Reproducibility** | `npm run verify:reproducible` | Ensure dist artifacts match TypeScript source 100% |
| **Run Complete Test Suite**| `npm run check` | Build + hook-policy check + root tests + all 15 component suites |
| **Search Active Memory** | `node components/memory/dist/cli.js search "auth"` | Search learned gotchas & facts across sessions |
| **Run Self-Audit Confession**| `node scripts/self-audit.mjs report` | Audit trajectory ledger for drift or fabricated claims |
| **Atomic Rollback** | `node scripts/self-audit.mjs rollback` | Revert to last verified clean state |
| **Measured Benchmarks** | `npm run bench` | ast-index lookups + daemon IPC round-trip timings |

---

## 🛡️ 2. Emergency Recovery & HITL Resolution SOP

### Situation A: Rework Limit Hit (`needs_user_decision`)
```bash
# 1. Check last ledger events
omo ulw-loop ledger --last 10

# 2. Inspect conflict reason and resume with fix
omo ulw-loop resume --goal-id G001
```

### Situation B: Ground-Truth File Mismatch
```bash
# 1. Audit real file SHA-256
shasum -a 256 <file_path>

# 2. Verify evidence schema
node -e 'const { validateStrictEvidence } = require("./components/ulw-loop/dist/evidence-contract.js"); console.log(validateStrictEvidence(require("./evidence.json")));'
```

### Situation C: Daemon IPC Socket Stale Lock
```bash
# The socket/pid/token live under the workspace: .lazyantigravity/run/
# A stale socket is removed automatically on the next `daemon start`.
# `daemon stop` (or SIGTERM) removes socket and pid files cleanly.
node components/daemon-bridge/dist/cli.js daemon stop
```

---

## 🎯 3. Model Routing Matrix
- **Session UI**: Follow the user-selected session model (Gemini 3.8 Flash (High), Claude Opus 5.5, Claude Sonnet 5.5).
- **Plan, Code & Bulk Worker**: `Model: "flash"`
- **Adversarial Audit & Security Gate**: `Model: "inherit"` (when session is Claude 5.5) / `Model: "pro"` (when session is Gemini)
- **Small Lint & Format Checks**: `Model: "flash_lite"`
- **Escape Hatch**: Claude Opus 5.5 (High) via manual UI switch (only needed when the session is Gemini)
